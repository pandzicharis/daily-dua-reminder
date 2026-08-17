/* ==========================================================================
   dev-server.js — SAMO za lokalno testiranje.  Pokretanje:  npm run dev

   Servira statične fajlove i /api/* funkcije na http://localhost:3000, da
   se cijeli tok (dozvola → pretplata → stanje → cron → push) može proći na
   računaru, bez Vercela i bez baze.

   Na Vercel se ne deployuje niti se tamo koristi — tamo statične fajlove
   servira Vercel, a svaki fajl iz api/ postaje zasebna serverless funkcija.
   ========================================================================== */

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

/* --- .env.local se učita ručno, bez ijedne dodatne zavisnosti ----------- */
(function loadEnv() {
  try {
    fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
      .split("\n")
      .forEach(function (line) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) { return; }
        const value = m[2].replace(/^["']|["']$/g, "");
        if (value && !process.env[m[1]]) { process.env[m[1]] = value; }
      });
  } catch (e) {
    console.log("(nema .env.local — VAPID ključevi neće raditi)");
  }
})();

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2"
};

/* --- Vercel-oliki res.status().json() ---------------------------------- */
function decorate(res) {
  res.status = function (code) { res.statusCode = code; return res; };
  res.json = function (body) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

function readBody(req) {
  return new Promise(function (resolve) {
    let raw = "";
    req.on("data", function (c) { raw += c; });
    req.on("end", function () {
      if (!raw) { return resolve(undefined); }
      try { resolve(JSON.parse(raw)); } catch (e) { resolve(raw); }
    });
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const file = path.join(ROOT, path.normalize(rel));

  /* nikad izvan foldera projekta */
  if (file.indexOf(ROOT) !== 0) {
    res.statusCode = 403;
    return res.end("403");
  }

  fs.readFile(file, function (err, data) {
    if (err) {
      res.statusCode = 404;
      return res.end("404 — " + rel);
    }
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    /* bez keša, da se izmjene odmah vide */
    res.setHeader("Cache-Control", "no-store");
    res.end(data);
  });
}

const server = http.createServer(async function (req, res) {
  const parsed = url.parse(req.url);
  const pathname = decodeURIComponent(parsed.pathname);

  if (pathname.indexOf("/api/") !== 0) {
    return serveStatic(req, res, pathname);
  }

  const name = pathname.slice(5).replace(/[^a-z0-9-]/gi, "");
  const handlerPath = path.join(ROOT, "api", name + ".js");

  if (!name || name[0] === "_" || !fs.existsSync(handlerPath)) {
    return decorate(res).status(404).json({ error: "nema takvog endpointa" });
  }

  try {
    req.body = await readBody(req);

    /* Svaki put svjež modul, da se izmjene u api/ vide bez restarta.
       Briše se i sve što handler zahtijeva (_lib.js, notification-tasks.js),
       jer brisanje samo handlera ne pomaže: Node njegove zavisnosti drži u
       kešu i dalje vraća staru kopiju, pa izmjena spiska podsjetnika izgleda
       kao da nije ni napravljena. node_modules se ne dira — tamo se ništa ne
       mijenja, a ponovno učitavanje bi bilo skupo. */
    const NODE_MODULES = path.join(ROOT, "node_modules");
    Object.keys(require.cache).forEach(function (key) {
      if (key.indexOf(ROOT) === 0 && key.indexOf(NODE_MODULES) !== 0) {
        delete require.cache[key];
      }
    });

    const handler = require(handlerPath);
    await handler(req, decorate(res));
  } catch (e) {
    console.error("GREŠKA u /api/" + name + ":", e);
    if (!res.headersSent) { decorate(res).status(500).json({ error: String(e && e.message || e) }); }
  }
});

server.listen(PORT, function () {
  const kv = process.env.KV_REST_API_URL ? "Upstash" : "lokalni fajl (.dev-store.json)";
  console.log("");
  console.log("  Moj Zikr — lokalni razvoj");
  console.log("  http://localhost:" + PORT);
  console.log("");
  console.log("  baza:      " + kv);
  console.log("  interval:  " + (process.env.REMINDER_INTERVAL_MINUTES || 60) + " min");
  console.log("  VAPID:     " + (process.env.VAPID_PUBLIC_KEY ? "postavljen" : "NEDOSTAJE — pogledaj .env.local"));
  console.log("");
  console.log("  Ručno okidanje schedulera:");
  console.log("    curl -H \"x-cron-secret: $CRON_SECRET\" http://localhost:" + PORT + "/api/cron");
  console.log("");
});
