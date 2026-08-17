/* ==========================================================================
   POST   /api/subscribe   { subscription }   -> upiši pretplatu
   DELETE /api/subscribe   { endpoint }       -> obriši pretplatu

   Uređaj se identifikuje isključivo svojom push pretplatom. Nema naloga,
   lozinki ni ličnih podataka — samo endpoint koji je izdao browser.
   ========================================================================== */

const {
  redis, KEYS, subId, readJson, validSubscription, removeSubscription
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

      await Promise.all([
        redis.set(KEYS.sub(id), {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
        }),
        redis.sadd(KEYS.all, id)
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
