/* ==========================================================================
   scripts/send-test-push.js — pošalji obavijest ODMAH, za probu izgleda.

     npm run test-push            -> prvi zadatak sa spiska
     npm run test-push zikr       -> baš taj zadatak
     npm run test-push sve        -> sve zadatke redom

   Zaobilazi raspored (slot, startTime, "gotovo je") jer služi samo da se
   vidi kako obavijest izgleda na uređaju. Prava pravila su u api/cron.js
   i ovdje se namjerno ne diraju — sadržaj obavijesti je isti, dolazi iz
   pushPayload() u api/_lib.js.

   Ovo je lokalna skripta, ne endpoint — ne deployuje se i ne može je niko
   pozvati sa interneta.
   ========================================================================== */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/* .env.local, bez dodatnih zavisnosti */
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
  /* nema ga — vrijedi ono što je već u okruženju */
}

const webpush = require("web-push");
const {
  redis, KEYS, TASKS, pushPayload, removeSubscription
} = require(path.join(ROOT, "api", "_lib.js"));

const arg = (process.argv[2] || "").toLowerCase();

function pickTasks() {
  if (!arg) { return [TASKS[0]]; }
  if (arg === "sve" || arg === "all") { return TASKS; }
  const found = TASKS.filter(function (t) { return t.id === arg; });
  if (!found.length) {
    console.error("\nNema zadatka \"" + arg + "\". Postoje: " +
      TASKS.map(function (t) { return t.id; }).join(", ") + "\n");
    process.exit(1);
  }
  return found;
}

(async function () {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!pub || !priv || !subject) {
    console.error("\nFale VAPID varijable. Pogledaj .env.local\n");
    process.exit(1);
  }
  webpush.setVapidDetails(subject, pub, priv);

  const ids = await redis.smembers(KEYS.all);

  if (!ids.length) {
    console.log("\n  Nijedan uređaj nije pretplaćen.");
    console.log("  Otvori http://localhost:3000, pritisni \"Uključi podsjetnike\"");
    console.log("  i dozvoli obavijesti, pa pokreni ovo ponovo.\n");
    process.exit(0);
  }

  const tasks = pickTasks();
  console.log("\n  Uređaja: " + ids.length + "   |   zadataka: " +
    tasks.map(function (t) { return t.id; }).join(", ") + "\n");

  for (const id of ids) {
    const sub = await redis.get(KEYS.sub(id));
    if (!sub || !sub.endpoint) { continue; }

    for (const task of tasks) {
      try {
        /* TTL 1h: ako browser/PWA trenutno ne radi, push servis čuva
           poruku i isporuči je čim se aplikacija vrati. Sa kratkim TTL-om
           bi tiho nestala i izgledalo bi kao da ništa nije poslano. */
        const out = await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          pushPayload(task),
          { TTL: 3600, urgency: "high" }
        );
        console.log("  poslano → " + id.slice(0, 8) + "   HTTP " +
          (out && out.statusCode) + "   " + task.title + " — " + task.message);
      } catch (err) {
        const code = err && err.statusCode;
        if (code === 404 || code === 410) {
          await removeSubscription(id);
          console.log("  mrtva pretplata " + id.slice(0, 8) + " — obrisana");
        } else {
          console.log("  GREŠKA → " + id.slice(0, 8) + "   " +
            (code || "") + " " + ((err && err.message) || ""));
        }
      }
    }
  }

  console.log("");
})();
