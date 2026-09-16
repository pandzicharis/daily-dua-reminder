/* ==========================================================================
   POST /api/test-nocni — pošalji vibro-alarm noćnog zikra ODMAH, samo
   korisniku "test".

   ZAŠTO OVO POSTOJI. Testni panel (dev-panel.js) radi samo na localhostu, a
   `REMINDER_TIME_TRAVEL` se namjerno NIKAD ne postavlja na Vercelu (vidi
   api/cron.js — "Na Vercelu ni jedno ne vrijedi") jer bi otvorio glumljenje
   datuma i vremena za CIJELI ciklus, svim korisnicima odjednom. Ko treba
   provjeriti kako alarm izgleda i vibrira na PRAVOM telefonu, na deploy
   verziji, ne smije proći kroz taj put.

   Zato je ovo poseban, uzak prolaz — ne glumi ništa i ne dira raspored:
     - šalje SAMO korisniku "test" (ime iz X-Zikr-User, isto zaglavlje koje
       već nosi svaki poziv na /api/state i /api/prefs — vidi userFrom());
       svako drugo ime dobija 403 prije nego se ijedan red pročita.
     - šalje SAMO na uređaje koji su se prijavili pod tim imenom (polje
       `user` u zapisu pretplate, upisano u api/subscribe.js).
     - ne provjerava zoru, ne provjerava `nocniAlarm` u configu, ne piše
       dedup ključ — dugme koje ga zove je i samo zaključano iza istog imena
       (settings.js), a repetitivan klik ovdje ne kvari ništa u pravom
       rasporedu jer ovaj put uopšte ne prolazi kroz njega.

   Zaštita je isto ime koje već čuva svaki drugi endpoint u aplikaciji: ime
   nije lozinka nigdje ovdje (vidi README, 4b), pa ni ovaj poziv nije ništa
   slabiji od postojećih. Razlika prema CRON_SECRET putu je namjerna — ovo
   mora raditi sa telefona, iz prave instalacije, bez pristupa serveru.
   ========================================================================== */

const webpush = require("web-push");
const { redis, KEYS, userFrom } = require("./_lib.js");

const TEST_USER = "test";

function setupVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) { return false; }
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

/* Isti oblik obavijesti kao `nocniAlarmPayload()` u _lib.js (naslov, tag,
   vibracija), ali sopstveni tekst — "Zora za N minuta" bi ovdje lagalo, jer
   nema prave zore u igri, samo probu izgleda i vibracije. */
function testPayload() {
  return JSON.stringify({
    title: "Noćni zikr 🌙",
    body: "Test — ovako izgleda i vibrira alarm prije zore.",
    tag: "nocni-alarm",
    url: "/",
    vibrate: [60, 80, 60, 80, 120]
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "metoda nije dozvoljena" });
    }

    if (!setupVapid()) {
      return res.status(500).json({ error: "VAPID varijable nisu postavljene" });
    }

    const user = userFrom(req, {}, {});
    if (user !== TEST_USER) {
      return res.status(403).json({ error: "samo za korisnika \"test\"" });
    }

    const ids = await redis.smembers(KEYS.all);
    const payload = testPayload();
    const sent = [];
    const errors = [];

    for (const id of ids) {
      const sub = await redis.get(KEYS.sub(id));
      if (!sub || !sub.endpoint || sub.user !== TEST_USER) { continue; }

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
          { TTL: 60, urgency: "high" }
        );
        sent.push(id.slice(0, 8));
      } catch (err) {
        const code = err && err.statusCode;
        errors.push({ device: id.slice(0, 8), code: code || "greška" });
      }
    }

    return res.status(200).json({ sent: sent, errors: errors });

  } catch (e) {
    return res.status(500).json({ error: "greška servera" });
  }
};
