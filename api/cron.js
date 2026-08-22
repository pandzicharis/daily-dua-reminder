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

   KORISNICI. Svaka pretplata nosi ime iz configa, pa ciklus prvo grupiše
   uređaje po korisniku, a onda za svakog posebno čita njegov spisak
   čekiranog i njegov config. Harisova obavijest zavisi samo od Harisovog
   spiska; Leilin telefon je za nju nevidljiv. Uređaji iste osobe i dalje
   dijele stanje — dijeli se po imenu, a ne po uređaju.

   Config utiče i na slanje, ne samo na ekran: ugašena sekcija (petak) ne
   ulazi u račun, pa njen podsjetnik ima total 0, status "done" i ćuti. Uz
   to pada i zaklon `quietFor`, pa dnevni petkom kreće u 08:00 kao svaki
   drugi dan — sve to bez ijednog posebnog pravila, samo iz brojanja.

   Šalje li se uopšte i sa kojim tekstom, zavisi od toga koliko je danas
   čekirano (zajedničko za sve uređaje TOG korisnika, iz /api/state):

     ništa    -> "Vrijeme je za ..."   (task.message)
     nešto    -> "Nastavi sa zikrom."  (task.messagePartial)
     sve      -> ne šalje se ništa do sutra

   Uz to: NIKAD dvije obavijesti u istom ciklusu. Podsjetnik sa `requires`
   (večernji) ćuti dok podsjetnik koji ga zaklanja (dnevni) nije "done" —
   inače bi se poslije 19:00, kad se prozori preklapaju, telefon dvaput
   javio za isto. Dok zaklanja, dnevni od 19:00 nosi `messageLate` tekst
   koji pokriva oboje.

   PETAK. Petkom do podneva stiže samo petački podsjetnik (08, 09, 10, 11 i
   zadnji u 12:00). Dnevni tog dana ima `quietFor: ["petak"]` — ćuti dok
   petački ima otvoren prozor i dok nije završen, pa je prva dnevna obavijest
   u 13:00. Čim se petačke stavke završe, zaklon pada i dnevni nastavlja po
   uobičajenim pravilima, kao svaki drugi dan.

   PROBA. Tri parametra, svi zaštićeni istim CRON_SECRET-om:

     dry=1              vrati izvještaj, ali ne pošalji ni jedan push i ne
                        upiši ni jedan slot. Radi uvijek, i u produkciji.
     date=2026-08-21    glumi datum (dan sedmice!)  — vidi ispod
     at=12:00           glumi vrijeme po Sarajevu   — vidi ispod
     interval=60        nametni interval za taj poziv (bez ovoga vrijedi
                        REMINDER_INTERVAL_MINUTES iz okruženja)
     reset=1            obriši zapise "zadnji poslani slot" za taj datum,
                        da se isti dan može odglumiti više puta
     checked=id1,id2    odluči po OVOM spisku čekiranog umjesto po bazi (panel
                        šalje ono što je na ekranu). Ne upisuje ništa.
     user=haris         gledaj SAMO uređaje tog korisnika. Ide uz `checked`:
                        stanje sa ekrana je stanje jednog korisnika, pa bez
                        ovoga proba tvrdi nešto i o tuđim spiskovima.

   `date`, `at` i `reset` uz `dry=1` rade svugdje (ništa ne mijenjaju). Za
   PRAVO slanje sa izmišljenim vremenom mora stajati REMINDER_TIME_TRAVEL=1
   u okruženju — to se stavlja SAMO lokalno, u .env.local. Bez te varijable
   pravo slanje uvijek ide po stvarnom vremenu, pa se produkcija ne može
   navesti da pošalje obavijest za pogrešan trenutak.

     # cijeli petak na papiru, bez slanja
     curl -H "x-cron-secret: $CRON_SECRET" \
       "localhost:3000/api/cron?dry=1&date=2026-08-21&at=10:00"

     # pravo slanje kao da je petak 12:00 (samo lokalno)
     curl -H "x-cron-secret: $CRON_SECRET" \
       "localhost:3000/api/cron?date=2026-08-21&at=12:00&reset=1"
   ========================================================================== */

const url = require("url");
const webpush = require("web-push");
const {
  redis, KEYS, TASKS, DAY_TTL,
  sarajevoNow, dueSlot, pushPayload, removeSubscription,
  intervalMinutes, cronAuthorized, taskStatus, badgeCount, blockedBy, lateFrom,
  quietFor, weekdayFromKey, parseTime, DEFAULT_END_TIME, validDate, validItemId,
  SPACE, userKey, readPrefs, sectionsFor
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

  const q = (req.query && Object.keys(req.query).length)
    ? req.query
    : (url.parse(req.url, true).query || {});

  const dry = q.dry === "1" || q.dry === "true";

  /* Izmišljeno vrijeme smije uticati na PRAVO slanje samo kad okruženje to
     izričito dozvoli (lokalni .env.local). U probi (`dry`) je bezopasno pa
     radi uvijek. */
  const mayTimeTravel = dry || process.env.REMINDER_TIME_TRAVEL === "1";

  const real = sarajevoNow();
  const atMinutes = mayTimeTravel ? parseTime(q.at) : null;
  const now = {
    date: (mayTimeTravel && validDate(q.date)) ? String(q.date) : real.date,
    minutes: (atMinutes === null || atMinutes === undefined)
      ? real.minutes
      : atMinutes
  };

  /* Interval je inače iz okruženja (60 u produkciji). Panel ga smije
     nametnuti po pozivu, da se produkcijski satni ritam može provjeriti i kad
     u .env.local stoji REMINDER_INTERVAL_MINUTES=1 — inače bi "12:15" izgledao
     kao da šalje, a u produkciji tu vlada tišina. */
  const resetSent = mayTimeTravel && (q.reset === "1" || q.reset === "true");

  /* Stanje sa ekrana (`checked=id1,id2`) — testni panel ga šalje da odluka
     odgovara onome što korisnik vidi. Vrijedi SAMO za taj poziv: baza se ne
     dira ni u jednom smjeru. Prazan string znači "ništa nije čekirano" i to
     nije isto kao da parametra nema (tada se čita baza). */
  const screenChecked = (mayTimeTravel && typeof q.checked === "string")
    ? String(q.checked).split(",").reduce(function (map, id) {
        const clean = id.trim();
        if (clean && validItemId(clean)) { map[clean] = "1"; }
        return map;
      }, {})
    : null;

  /* Testni panel gleda JEDAN spisak — svoj. Bez ovoga bi `checked` sa ekrana
     bio nametnut svim korisnicima odjednom, pa bi proba lagala o tuđem
     stanju. Kao i sve ostalo iz panela, radi samo uz `mayTimeTravel`. */
  const onlyUser = mayTimeTravel ? userKey(q.user) : "";

  const askedInterval = mayTimeTravel ? parseInt(q.interval, 10) : NaN;
  const interval = (isFinite(askedInterval) && askedInterval >= 1)
    ? Math.min(askedInterval, 1440)
    : intervalMinutes();

  /* Dan sedmice se izvodi iz sarajevskog DATUMA, a ne iz new Date().getDay():
     proces na Vercelu radi u UTC-u, pa bi između 00:00 i 02:00 vratio
     jučerašnji dan. */
  const weekday = weekdayFromKey(now.date);

  /* Samo za lokalno testiranje: pomjeri sve zadatke da počnu odmah. */
  const startOverride = process.env.REMINDER_START_TIME || null;

  /* `users` je izvještaj PO KORISNIKU — prozori, status i zaklon zavise od
     njegovog spiska i njegovog configa, pa jedan zajednički skup brojki više
     ne bi značio ništa. Slanja i greške ostaju u jednom nizu, ali svaki
     zapis nosi `user`, da se i ravnim čitanjem vidi čije je. */
  const report = {
    date: now.date,
    minutes: now.minutes,
    weekday: weekday,
    dry: dry || undefined,
    interval: interval,
    devices: 0,
    users: {},
    sent: [],
    removed: [],
    errors: []
  };

  try {
    /* --------------------------------------------------------------------
       Uređaji, grupisani po korisniku.

       Do sada je postojao jedan spisak čekiranog za sve uređaje; sada svaki
       korisnik ima svoj, pa se sve što zavisi od stanja — status, zaklon,
       tekst — računa PO KORISNIKU, jednom za sve njegove uređaje. Grupisanje
       postoji baš zbog toga: bez njega bi se isti upit u bazu ponovio za
       svaki telefon iste osobe.

       Pretplata bez `user` je zatečena, napravljena prije nego je config
       postojao. Vodi se u starom prostoru (ZIKR_SPACE) dok se aplikacija na
       tom uređaju ne otvori i ne javi ime — tada je /api/subscribe prepiše.
       -------------------------------------------------------------------- */
    const ids = await redis.smembers(KEYS.all);
    const byUser = new Map();

    for (const id of ids) {
      const sub = await redis.get(KEYS.sub(id));

      /* Id u setu bez zapisa = ostatak — očisti i idi dalje. */
      if (!sub || !sub.endpoint) {
        await removeSubscription(id);
        report.removed.push(id.slice(0, 8));
        continue;
      }

      const user = userKey(sub.user) || SPACE;
      /* Testni panel gleda samo svoj spisak — ostali korisnici se u tom
         pozivu i ne dodiruju. */
      if (onlyUser && user !== onlyUser) { continue; }

      if (!byUser.has(user)) { byUser.set(user, []); }
      byUser.get(user).push({ id: id, sub: sub });
      report.devices += 1;
    }

    if (screenChecked) { report.checkedFrom = "ekran"; }

    for (const [user, devices] of byUser) {
      /* Config vlasnika spiska. Sekcija koju je ugasio ne ulazi u račun, pa
         njen podsjetnik ima total 0, status "done" i sam ućuti — bez ijednog
         posebnog pravila u notification-tasks.js. */
      const prefs = await readPrefs(user);

      /* Čekirano je zajedničko za sve uređaje TOG korisnika, pa se čita
         jednom i jednom se izračuna dokle je koji podsjetnik došao. */
      const checked = screenChecked ||
        (await redis.hgetall(KEYS.items(user, now.date))) || {};

      const status = {};
      TASKS.forEach(function (task) {
        status[task.id] = taskStatus(task, checked, now.date, prefs);
      });

      /* Broj za ikonicu aplikacije: koliko je ostalo u svim podsjetnicima
         čiji je prozor već počeo. Ne zavisi od uređaja (spisak je
         zajednički), pa se računa jednom po korisniku i ide uz SVAKI push
         tog ciklusa — koja god obavijest stigne, nosi tačan broj. */
      const badge = badgeCount(
        checked, now.date, prefs, now.minutes, weekday, startOverride
      );

      /* Koji podsjetnici ćute jer ih drugi zaklanja, i koji su "late" —
         prozor zaklonjenog je otvoren, pa dnevni nosi tekst za oboje. Ne
         zavisi od uređaja, pa se računa jednom po korisniku. */
      const blocked = {};
      const late = {};
      const windows = {};
      const quiet = {};

      TASKS.forEach(function (task) {
        blocked[task.id] = blockedBy(task, status);
        const from = lateFrom(task, weekday);
        late[task.id] = from !== null && now.minutes >= from;

        /* Efektivni prozor za TAJ dan i TOG korisnika — jedini način da se
           jednim curl-om vidi zašto je ciklus nešto poslao ili preskočio.
           "—" znači "za njega ga danas nema": ili je ugašen u kodu, ili ga
           tog dana sedmice nema, ili je korisnik ugasio sve sekcije koje
           pokriva. */
        const off = task.enabled === false ||
          (task.days && task.days.indexOf(weekday) === -1) ||
          sectionsFor(task, now.date, prefs).length === 0;
        windows[task.id] = off
          ? "—"
          : (startOverride || task.startTime) + "–" +
            (task.endTime || DEFAULT_END_TIME);

        /* Vremenski zaklon (petkom: dnevni dok petački traje). Ovisi i o
           satu, pa se računa za trenutak ovog ciklusa. */
        quiet[task.id] = quietFor(task, weekday, now.minutes, status);
      });

      report.users[user] = {
        devices: devices.length,
        prefs: prefs,
        status: status,
        badge: badge,
        windows: windows,
        quiet: TASKS
          .filter(function (task) { return quiet[task.id]; })
          .map(function (task) { return task.id + " ← " + quiet[task.id]; }),
        blocked: TASKS
          .filter(function (task) { return blocked[task.id]; })
          .map(function (task) { return task.id + " ← " + blocked[task.id]; })
      };

      /* `reset=1` znači "gledaj ovaj dan kao da još ništa nije poslano", pa
         se isti trenutak može odglumiti više puta. Bez toga druga proba ćuti
         — tačno onako kako i treba u produkciji.

         U pravom slanju se zapisi brišu. U probi (`dry`) se NE dira baza,
         nego se zapis samo ignoriše pri čitanju (vidi `last` niže) — inače
         bi proba pokazivala tišinu samo zato što je prethodno pravo slanje
         ostavilo zapis, i to još i za drugi interval, gdje slotovi nisu ni
         uporedivi. */
      if (resetSent && !dry) {
        for (const device of devices) {
          for (const task of TASKS) {
            await redis.del(KEYS.sent(device.id, task.id, now.date));
          }
        }
        report.reset = now.date;
      }

      for (const device of devices) {
        const id = device.id;
        const sub = device.sub;

        for (const task of TASKS) {
          if (task.enabled === false) { continue; }

          /* Zaklonjen drugim podsjetnikom — ćuti, i slot se NE zapisuje, pa
             stigne prvim ciklusom nakon što se zaklon skine. Isto vrijedi i
             za vremenski zaklon (`quietFor`): petkom dnevni ćuti dok petački
             traje, a čim petački završi ili mu prozor prođe, dnevni stiže
             prvim sljedećim ciklusom. */
          if (blocked[task.id]) { continue; }
          if (quiet[task.id]) { continue; }

          const sentKey = KEYS.sent(id, task.id, now.date);
          /* U probi sa `reset=1` se zapis ignoriše, a baza se ne dira. */
          const last = (resetSent && dry) ? null : await redis.get(sentKey);

          /* Sva pravila su u dueSlot() — ovdje ostaje samo baza i slanje. */
          const slot = dueSlot({
            minutes: now.minutes,
            weekday: weekday,
            days: task.days,
            startTime: startOverride || task.startTime,
            endTime: task.endTime,
            interval: interval,
            lastSlot: last,
            /* "none" | "partial" | "done" — iz spiska OVOG korisnika */
            status: status[task.id]
          });

          if (slot === null) { continue; }

          /* Zapis IDE PRIJE slanja. Ako se cron slučajno pokrene dvaput u
             istoj minuti, druga instanca vidi zauzet slot i šuti — bolje
             propustiti jedan podsjetnik nego poslati duplikat. */
          /* Tekst se pravi ovdje, jednom, pa ide i u izvještaj — tako se u
             izvještaju vidi TAČNO ono što je uređaj dobio, bez ponavljanja
             pravila o tekstu na drugom mjestu. */
          const payload = pushPayload(task, status[task.id], late[task.id], badge);
          const shown = JSON.parse(payload);

          /* Proba samo javlja šta BI otišlo — ni jedan upis, ni jedan push. */
          if (dry) {
            report.sent.push({
              user: user, device: id.slice(0, 8), task: task.id, slot: slot,
              status: status[task.id], late: !!late[task.id],
              title: shown.title, body: shown.body, badge: badge, dry: true
            });
            continue;
          }

          await redis.set(sentKey, slot, { ex: DAY_TTL });

          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: sub.keys },
              payload,
              { TTL: 60 * 55, urgency: "normal" }
            );
            report.sent.push({
              user: user, device: id.slice(0, 8), task: task.id, slot: slot,
              status: status[task.id], late: !!late[task.id],
              title: shown.title, body: shown.body, badge: badge
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
            report.errors.push({
              user: user, device: id.slice(0, 8), task: task.id,
              code: code || "greška"
            });
          }
        }
      }
    }

    return res.status(200).json(report);

  } catch (e) {
    report.errors.push({ fatal: String(e && e.message || e) });
    return res.status(500).json(report);
  }
};
