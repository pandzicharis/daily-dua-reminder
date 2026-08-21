/* ==========================================================================
   /api/prefs — config jednog korisnika, dijeljen kroz njegove uređaje.

     GET  /api/prefs        (uz zaglavlje X-Zikr-User)
          -> { user, prefs, known }

     POST /api/prefs        (uz zaglavlje X-Zikr-User)
          { prefs: { transkript: true, petak: false } }
          -> { user, prefs, known }

   Config je namjerno malen i uvijek se šalje CIJEL, za razliku od /api/state
   koji prima samo promjene. Razlog je što se kvačice mijenjaju stalno i sa
   dva uređaja istovremeno, a config rijetko i sa jednog — pa nema šta da se
   gazi, a cijeli zapis je jednostavniji i ne može ostati u pola.

   `known` govori da li je ime VEĆ postojalo prije ovog poziva:

     false   nov spisak — ovo je prvi uređaj sa tim imenom
     true    ime postoji — uređaj se spaja na zatečeni spisak

   Iz toga aplikacija ispiše šta se dogodilo kad se ime upiše. Sam SPISAK
   imena se ne vraća nikad i ne postoji endpoint koji ga daje — odgovara se
   samo na pitanje o imenu koje je pozivalac već znao.

   Prekidači se ne nabrajaju ovdje: `transkript` je jedini poseban, a sve
   ostalo su sekcije sa `optional: true` iz data.js (vidi cleanPrefs u
   _lib.js). Nova takva sekcija sama dobije svoje polje u configu.
   ========================================================================== */

const url = require("url");
const {
  redis, KEYS,
  readJson, userFrom, readPrefs, cleanPrefs
} = require("./_lib.js");

module.exports = async function handler(req, res) {
  try {
    const isGet = req.method === "GET";
    const isPost = req.method === "POST";

    if (!isGet && !isPost) {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "metoda nije dozvoljena" });
    }

    const body = isPost ? (readJson(req) || {}) : {};
    const query = (req.query && Object.keys(req.query).length)
      ? req.query
      : (url.parse(req.url, true).query || {});

    const user = userFrom(req, body, query);
    if (!user) {
      return res.status(400).json({ error: "nedostaje korisnik" });
    }

    /* Config se ne kešira — drugi uređaj ga je mogao upravo promijeniti. */
    res.setHeader("Cache-Control", "no-store");

    /* SADD vrati 1 kad je član nov, 0 kad je već bio — odatle `known`, bez
       posebnog SISMEMBER poziva. Ime se upisuje i pri čitanju: uređaj koji
       je otvorio aplikaciju pod tim imenom ga stvarno koristi. */
    const added = await redis.sadd(KEYS.users, user);
    const known = Number(added) === 0;

    if (isGet) {
      return res.status(200).json({
        user: user,
        prefs: await readPrefs(user),
        known: known
      });
    }

    /* Nepoznata polja i sve što nije boolean otpada — server ne pamti
       config koji ne razumije. */
    const prefs = cleanPrefs(body.prefs);
    await redis.set(KEYS.cfg(user), prefs);

    return res.status(200).json({ user: user, prefs: prefs, known: known });

  } catch (e) {
    return res.status(500).json({ error: "greška servera" });
  }
};
