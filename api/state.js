/* ==========================================================================
   POST /api/state
   { id, date, completed: { "zikr": true, "kuran": false } }
   ili kraći oblik za jedan zadatak:
   { id, date, taskId: "zikr", completed: true }

   Server ne čuva aplikaciju — čuva SAMO odgovor na pitanje "je li ovaj
   zadatak danas gotov". To je sve što scheduleru treba da zna treba li
   slati podsjetnik. Cijeli ostatak stanja ostaje u localStorage.
   ========================================================================== */

const {
  redis, KEYS, DAY_TTL,
  findTask, readJson, validDate, sarajevoNow
} = require("./_lib.js");

/* subId() vraća 32 hex znaka — sve drugo je smeće i ne dira bazu. */
const ID_RE = /^[a-f0-9]{32}$/;

/* Prihvata se samo današnji datum po Sarajevu, plus dan lijevo-desno zbog
   ponoći i telefona sa pomjerenim satom. Historija se ne prepisuje. */
function dateAllowed(date) {
  const today = sarajevoNow().date;
  const day = 86400000;
  const t = Date.parse(today + "T00:00:00Z");
  const d = Date.parse(date + "T00:00:00Z");
  return Math.abs(d - t) <= day;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "metoda nije dozvoljena" });
    }

    const body = readJson(req) || {};
    const id = body.id;
    const date = body.date;

    if (typeof id !== "string" || !ID_RE.test(id)) {
      return res.status(400).json({ error: "neispravan id" });
    }
    if (!validDate(date) || !dateAllowed(date)) {
      return res.status(400).json({ error: "neispravan datum" });
    }

    /* Uređaj mora biti pretplaćen — inače se stanje ne prima. */
    const known = await redis.exists(KEYS.sub(id));
    if (!known) {
      return res.status(404).json({ error: "pretplata ne postoji" });
    }

    /* Svi oblici zahtjeva se svedu na isti objekat { taskId: bool }:
       frontend šalje "tasks", a prihvata se i "completed" te kraći oblik
       za jedan zadatak { taskId, completed }. */
    let completed = body.tasks || body.completed;
    if (typeof body.taskId === "string") {
      completed = {};
      completed[body.taskId] = body.completed === true;
    }
    if (!completed || typeof completed !== "object" || Array.isArray(completed)) {
      return res.status(400).json({ error: "nedostaje completed" });
    }

    const key = KEYS.done(id, date);
    const doneNow = {};
    const clear = [];
    const ignored = [];

    Object.keys(completed).slice(0, 50).forEach(function (taskId) {
      /* Nepoznat id se tiho preskače — spisak zadataka je jedini izvor. */
      if (!findTask(taskId)) { ignored.push(taskId); return; }
      if (completed[taskId] === true) {
        doneNow[taskId] = 1;
      } else {
        /* Odčekirano = ponovo nezavršeno, podsjetnici se nastavljaju. */
        clear.push(taskId);
      }
    });

    if (Object.keys(doneNow).length) {
      await redis.hset(key, doneNow);
    }
    if (clear.length) {
      await redis.hdel(key, ...clear);
    }
    /* Zapis živi samo par dana i sam ističe — novi dan kreće čist. */
    await redis.expire(key, DAY_TTL);

    return res.status(200).json({ ok: true, ignored: ignored });

  } catch (e) {
    return res.status(500).json({ error: "greška servera" });
  }
};
