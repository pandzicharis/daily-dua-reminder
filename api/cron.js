/* ==========================================================================
   GET /api/cron — scheduler. JEDINO mjesto koje odlučuje šalje li se push.

   Pokreće ga Vercel Cron (vercel.json) svakih 15 minuta. Ne pretpostavlja
   se da će se pokrenuti tačno u pun sat — zato odluka NIJE "sad je 8, šalji",
   nego "u koji slot ovog dana spada trenutno vrijeme i je li taj slot već
   poslan". Slot se računa od startTime zadatka:

     slot = floor((sada - startTime) / REMINDER_INTERVAL_MINUTES)

   07:00 -> slot 0   07:15 -> slot 0 (već poslan, šuti)
   07:30 -> slot 0   08:00 -> slot 1 (šalje)

   Zato je svejedno koliko puta se cron pokrene između dva sata — korisnik
   dobije tačno jednu obavijest po slotu. Zapis "zadnji poslani slot" veže
   se za dan po Sarajevu, pa novi dan sam kreće od nule.

   Šalje li se uopšte i sa kojim tekstom, zavisi od toga koliko je danas
   čekirano (zajedničko za sve uređaje, iz /api/state):

     ništa    -> "Vrijeme je za ..."   (task.message)
     nešto    -> "Nastavi sa zikrom."  (task.messagePartial)
     sve      -> ne šalje se ništa do sutra

   Uz to: NIKAD dvije obavijesti u istom ciklusu. Podsjetnik sa `requires`
   (večernji) ćuti dok podsjetnik koji ga zaklanja (dnevni) nije "done" —
   inače bi se poslije 19:00, kad se prozori preklapaju, telefon dvaput
   javio za isto. Dok zaklanja, dnevni od 19:00 nosi `messageLate` tekst
   koji pokriva oboje.
   ========================================================================== */

const webpush = require("web-push");
const {
  redis, KEYS, TASKS, DAY_TTL,
  sarajevoNow, dueSlot, pushPayload, removeSubscription,
  intervalMinutes, cronAuthorized, taskStatus, blockedBy, lateFrom
} = require("./_lib.js");

function setupVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) { return false; }
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

module.exports = async function handler(req, res) {
  if (!cronAuthorized(req)) {
    return res.status(401).json({ error: "nije dozvoljeno" });
  }
  if (!setupVapid()) {
    return res.status(500).json({ error: "VAPID varijable nisu postavljene" });
  }

  const now = sarajevoNow();
  const interval = intervalMinutes();

  /* Samo za lokalno testiranje: pomjeri sve zadatke da počnu odmah. */
  const startOverride = process.env.REMINDER_START_TIME || null;

  const report = {
    date: now.date,
    minutes: now.minutes,
    interval: interval,
    devices: 0,
    status: {},
    sent: [],
    blocked: [],
    removed: [],
    errors: []
  };

  try {
    /* Čekirano je zajedničko za sve uređaje, pa se čita JEDNOM po ciklusu i
       jednom se izračuna dokle je koji podsjetnik došao. */
    const checked = (await redis.hgetall(KEYS.items(now.date))) || {};
    const status = {};
    TASKS.forEach(function (task) {
      status[task.id] = taskStatus(task, checked);
    });
    report.status = status;

    /* Koji podsjetnici danas ćute jer ih drugi zaklanja, i koji su "late" —
       prozor zaklonjenog je otvoren, pa dnevni nosi tekst za oboje. Ne
       zavisi od uređaja, pa se računa jednom po ciklusu. */
    const blocked = {};
    const late = {};
    TASKS.forEach(function (task) {
      blocked[task.id] = blockedBy(task, status);
      const from = lateFrom(task);
      late[task.id] = from !== null && now.minutes >= from;
    });
    report.blocked = TASKS
      .filter(function (task) { return blocked[task.id]; })
      .map(function (task) { return task.id + " ← " + blocked[task.id]; });

    const ids = await redis.smembers(KEYS.all);
    report.devices = ids.length;

    for (const id of ids) {
      const sub = await redis.get(KEYS.sub(id));

      /* Id u setu bez zapisa = ostatak — očisti i idi dalje. */
      if (!sub || !sub.endpoint) {
        await removeSubscription(id);
        report.removed.push(id.slice(0, 8));
        continue;
      }

      for (const task of TASKS) {
        if (task.enabled === false) { continue; }

        /* Zaklonjen drugim podsjetnikom — ćuti, i slot se NE zapisuje, pa
           stigne prvim ciklusom nakon što se zaklon skine. */
        if (blocked[task.id]) { continue; }

        const sentKey = KEYS.sent(id, task.id, now.date);
        const last = await redis.get(sentKey);

        /* Sva pravila su u dueSlot() — ovdje ostaje samo baza i slanje. */
        const slot = dueSlot({
          minutes: now.minutes,
          startTime: startOverride || task.startTime,
          endTime: task.endTime,
          interval: interval,
          lastSlot: last,
          /* "none" | "partial" | "done" — iz dijeljenog stanja */
          status: status[task.id]
        });

        if (slot === null) { continue; }

        /* Zapis IDE PRIJE slanja. Ako se cron slučajno pokrene dvaput u
           istoj minuti, druga instanca vidi zauzet slot i šuti — bolje
           propustiti jedan podsjetnik nego poslati duplikat. */
        await redis.set(sentKey, slot, { ex: DAY_TTL });

        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            pushPayload(task, status[task.id], late[task.id]),
            { TTL: 60 * 55, urgency: "normal" }
          );
          report.sent.push({
            device: id.slice(0, 8), task: task.id, slot: slot,
            status: status[task.id], late: !!late[task.id]
          });
        } catch (err) {
          const code = err && err.statusCode;
          /* 404/410 = pretplata više ne postoji (obrisana aplikacija,
             resetovan telefon). Briše se da se ne gađa u prazno. */
          if (code === 404 || code === 410) {
            await removeSubscription(id);
            report.removed.push(id.slice(0, 8));
            break;
          }
          report.errors.push({ device: id.slice(0, 8), task: task.id, code: code || "greška" });
        }
      }
    }

    return res.status(200).json(report);

  } catch (e) {
    report.errors.push({ fatal: String(e && e.message || e) });
    return res.status(500).json(report);
  }
};
