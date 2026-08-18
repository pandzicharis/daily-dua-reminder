/* ==========================================================================
   /api/state — zajednički spisak čekiranog, isti za sve uređaje.

     GET  /api/state?date=2026-08-18
          -> { date, items: { "zikr-salavat-50": true, "quran": true } }

     POST /api/state
          { date, items: { "zikr-salavat-50": true, "quran": false } }
          -> { date, items: <cijelo stanje poslije upisa>, ignored: [] }

   POST prima SAMO promjene ("delta"), nikad cijelo stanje. To je namjerno:
   ako telefon nešto odčekira dok je računar offline, računar poslije pošalje
   samo ono što je on promijenio i ne vraća nazad tuđe odčekirano. Zato se
   dva uređaja ne gaze međusobno iako nema ni logina ni verzija.

   Odčekirano se BRIŠE iz hash-a (HDEL) — "nema polja" i "nije urađeno"
   znače isto, pa ne treba čuvati nule.

   Server i dalje ne zna nijednu dovu napamet: prihvata samo id-eve koji
   postoje u data.js, i to za današnji datum (± jedan dan zbog ponoći).
   ========================================================================== */

const url = require("url");
const {
  redis, KEYS, DAY_TTL,
  validItemId, readJson, validDate, sarajevoNow
} = require("./_lib.js");

/* Prihvata se samo današnji datum po Sarajevu, plus dan lijevo-desno zbog
   ponoći i telefona sa pomjerenim satom. Historija se ne prepisuje. */
function dateAllowed(date) {
  const today = sarajevoNow().date;
  const day = 86400000;
  const t = Date.parse(today + "T00:00:00Z");
  const d = Date.parse(date + "T00:00:00Z");
  return Math.abs(d - t) <= day;
}

/* HGETALL vrati { id: "1" } ili null -> { id: true }, oblik koji očekuje
   aplikacija. */
async function readItems(date) {
  const raw = (await redis.hgetall(KEYS.items(date))) || {};
  const out = {};
  Object.keys(raw).forEach(function (id) {
    if (raw[id]) { out[id] = true; }
  });
  return out;
}

module.exports = async function handler(req, res) {
  try {
    const isGet = req.method === "GET";
    const isPost = req.method === "POST";

    if (!isGet && !isPost) {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "metoda nije dozvoljena" });
    }

    const body = isPost ? (readJson(req) || {}) : {};
    /* GET nosi datum u query stringu, POST u body-ju. */
    /* Vercel popuni req.query sam; lokalni dev-server ne, pa se URL parsira. */
    const date = isGet
      ? String((req.query && req.query.date) ||
               (url.parse(req.url, true).query || {}).date || "")
      : body.date;

    if (!validDate(date) || !dateAllowed(date)) {
      return res.status(400).json({ error: "neispravan datum" });
    }

    /* Odgovor se nikad ne kešira — dvije sekunde stare liste su gore nego
       nikakve, jer bi vratile checkmarke koje je drugi uređaj upravo skinuo. */
    res.setHeader("Cache-Control", "no-store");

    if (isGet) {
      return res.status(200).json({ date: date, items: await readItems(date) });
    }

    const items = body.items;
    if (!items || typeof items !== "object" || Array.isArray(items)) {
      return res.status(400).json({ error: "nedostaje items" });
    }

    const set = {};
    const clear = [];
    const ignored = [];

    /* Gornja granica je iznad ukupnog broja stavki u data.js — dovoljno da
       prođe i "čekiraj sve odjednom", a da zahtjev ne može biti proizvoljno
       velik. */
    Object.keys(items).slice(0, 200).forEach(function (id) {
      /* Nepoznat id se tiho preskače — data.js je jedini izvor. */
      if (!validItemId(id)) { ignored.push(id); return; }
      if (items[id] === true) { set[id] = "1"; } else { clear.push(id); }
    });

    const key = KEYS.items(date);
    if (Object.keys(set).length) { await redis.hset(key, set); }
    if (clear.length) { await redis.hdel(key, ...clear); }
    /* Zapis živi par dana i sam ističe — novi dan kreće čist. */
    await redis.expire(key, DAY_TTL);

    /* Vraća se stanje POSLIJE upisa, da uređaj odmah pokupi i ono što je
       drugi uređaj u međuvremenu promijenio. */
    return res.status(200).json({
      date: date,
      items: await readItems(date),
      ignored: ignored
    });

  } catch (e) {
    return res.status(500).json({ error: "greška servera" });
  }
};
