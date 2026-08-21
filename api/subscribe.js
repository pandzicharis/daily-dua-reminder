/* ==========================================================================
   POST   /api/subscribe   { subscription }   -> upiši pretplatu
   DELETE /api/subscribe   { endpoint }       -> obriši pretplatu

   Uređaj se identifikuje isključivo svojom push pretplatom. Nema naloga ni
   lozinki — samo endpoint koji je izdao browser i ime iz configa.

   Ime (zaglavlje X-Zikr-User) se pamti UZ pretplatu jer scheduler mora
   znati čiji spisak da gleda kad odlučuje šalje li obavijest tom uređaju.
   Isti telefon smije promijeniti ime bez pravljenja nove pretplate:
   aplikacija tada ponovo pošalje POST sa istom pretplatom, a ovdje se samo
   prepiše `user`.

   Pretplata BEZ imena je zatečena — napravljena prije nego je config
   postojao. Ne odbija se; scheduler je vodi u starom prostoru (ZIKR_SPACE)
   dok se aplikacija na tom uređaju ne otvori i ne javi ime.
   ========================================================================== */

const {
  redis, KEYS, subId, readJson, validSubscription, removeSubscription, userFrom
} = require("./_lib.js");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const body = readJson(req);
      const sub = body && body.subscription;

      if (!validSubscription(sub)) {
        return res.status(400).json({ error: "neispravna pretplata" });
      }

      const id = subId(sub.endpoint);
      /* Prazno ime nije greška — vidi zaglavlje. Zapis tada nema `user`, pa
         ga scheduler vodi u zatečenom prostoru. */
      const user = userFrom(req, body);

      await Promise.all([
        redis.set(KEYS.sub(id), {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          user: user || undefined
        }),
        redis.sadd(KEYS.all, id),
        /* Uređaj koji se pretplati je i potvrda da ime postoji — bez ovoga
           bi korisnik koji nikad ne otvori config ostao van spiska imena. */
        user ? redis.sadd(KEYS.users, user) : Promise.resolve()
      ]);

      /* Browser je zamijenio pretplatu (pushsubscriptionchange) — stara
         više ne postoji, pa je odmah čistimo da scheduler ne gađa u prazno. */
      if (typeof body.oldEndpoint === "string" &&
          /^https:\/\//.test(body.oldEndpoint) &&
          body.oldEndpoint !== sub.endpoint) {
        await removeSubscription(subId(body.oldEndpoint));
      }

      /* Vrati id da ga frontend zapamti — njime šalje stanje zadataka. */
      return res.status(200).json({ ok: true, id: id });
    }

    if (req.method === "DELETE") {
      const body = readJson(req);
      const endpoint = body && body.endpoint;

      if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint)) {
        return res.status(400).json({ error: "neispravan endpoint" });
      }

      await removeSubscription(subId(endpoint));
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "metoda nije dozvoljena" });

  } catch (e) {
    return res.status(500).json({ error: "greška servera" });
  }
};
