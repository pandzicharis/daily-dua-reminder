/* ==========================================================================
   api/_lib.js — zajedničko za sve tri funkcije.
   Fajl počinje sa "_" pa ga Vercel NE objavljuje kao endpoint.
   ========================================================================== */

const crypto = require("crypto");
const { Redis } = require("@upstash/redis");
const TASKS = require("../notification-tasks.js");

const TZ = "Europe/Sarajevo";

/* Koliko dana čuvamo dnevne zapise. Treba nam samo današnji, ali par dana
   viška pokriva prelazak ponoći i zone. Sve ističe samo od sebe. */
const DAY_TTL = 60 * 60 * 24 * 3;

/* ------------------------------------------------------------------------
   Redis (Upstash preko REST-a — jedini oblik koji radi u serverless-u bez
   držanja otvorene konekcije). Prihvata oba imena varijabli: ona koja
   dodaje Vercel KV integracija i ona koja daje Upstash direktno.
   ------------------------------------------------------------------------ */
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

/* Bez KV varijabli (lokalni rad) pada na fajl-store iz _dev-store.js, da se
   sve može isprobati bez pravljenja naloga. Na Vercelu taj store namjerno
   puca — tamo baza mora biti prava. */
const redis = (KV_URL && KV_TOKEN)
  ? new Redis({ url: KV_URL, token: KV_TOKEN })
  : new (require("./_dev-store.js").DevStore)();

/* ------------------------------------------------------------------------
   Zadaci
   ------------------------------------------------------------------------ */

/* Server nikad ne vjeruje id-u iz zahtjeva — mora biti sa spiska. */
function findTask(id) {
  return TASKS.find(function (t) { return t.id === id; }) || null;
}

/* ------------------------------------------------------------------------
   Vrijeme — sve po Europe/Sarajevo, nikad po UTC satu.
   Intl sam vodi računa o ljetnom/zimskom vremenu.
   ------------------------------------------------------------------------ */
function sarajevoNow(now) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
  const p = {};
  fmt.formatToParts(now || new Date()).forEach(function (x) { p[x.type] = x.value; });

  return {
    date: p.year + "-" + p.month + "-" + p.day,
    /* neki engini za ponoć vrate "24" — otuda % 24 */
    minutes: (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10)
  };
}

/* "07:00" -> 420. Vraća null ako je format neispravan. */
function parseTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  if (!m) { return null; }
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) { return null; }
  return h * 60 + min;
}

/* ------------------------------------------------------------------------
   Ključevi
   ------------------------------------------------------------------------ */
const KEYS = {
  all: "subs",                                        /* SET svih id-eva */
  sub: function (id) { return "sub:" + id; },         /* pretplata (JSON) */
  done: function (id, date) {                         /* HASH taskId -> 1 */
    return "done:" + id + ":" + date;
  },
  sent: function (id, taskId, date) {                 /* zadnji poslani slot */
    return "sent:" + id + ":" + taskId + ":" + date;
  }
};

/* Identitet uređaja = sam endpoint pretplate. Nema logina ni korisnika. */
function subId(endpoint) {
  return crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
}

/* ------------------------------------------------------------------------
   Ulaz
   ------------------------------------------------------------------------ */
function readJson(req) {
  /* Vercel obično već parsira JSON body; ovo pokriva i kad nije. */
  if (req.body && typeof req.body === "object") { return req.body; }
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  return null;
}

/* Pretplata mora imati endpoint i oba ključa, inače je push beskoristan. */
function validSubscription(sub) {
  return !!(sub &&
    typeof sub.endpoint === "string" &&
    /^https:\/\//.test(sub.endpoint) &&
    sub.endpoint.length < 1000 &&
    sub.keys &&
    typeof sub.keys.p256dh === "string" &&
    typeof sub.keys.auth === "string");
}

/* "2026-08-17" */
function validDate(d) {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

/* ------------------------------------------------------------------------
   Brisanje mrtve pretplate (push vrati 404/410 kad je uređaj odjavljen)
   ------------------------------------------------------------------------ */
async function removeSubscription(id) {
  await Promise.all([
    redis.srem(KEYS.all, id),
    redis.del(KEYS.sub(id))
  ]);
}

/* ------------------------------------------------------------------------
   Razmak između dva podsjetnika istog zadatka.

   Produkcija: 60 (jedan podsjetnik na sat).
   Razvoj:     REMINDER_INTERVAL_MINUTES=1 pa se cijeli ciklus testira
               za par minuta umjesto da se čeka sat.
   ------------------------------------------------------------------------ */
function intervalMinutes() {
  const raw = parseInt(process.env.REMINDER_INTERVAL_MINUTES || "60", 10);
  if (!isFinite(raw) || raw < 1) { return 60; }
  return Math.min(raw, 1440);
}

/* Ako zadatak nema svoj endTime, poslije ovog vremena se šuti. */
const DEFAULT_END_TIME = "22:00";

/* Sadržaj obavijesti — na jednom mjestu, da testna i prava izgledaju isto.
   `url` je ono što service worker otvori na klik: podsjetnik koji pokriva
   jednu sekciju vodi pravo na nju, a dnevni pokriva više njih pa vodi na
   vrh aplikacije. */
function pushPayload(task) {
  const one = (task.sections && task.sections.length === 1)
    ? task.sections[0]
    : null;

  return JSON.stringify({
    title: task.title,
    body: task.message,
    tag: task.id,
    taskId: task.id,
    url: one ? "/#sec-" + one : "/"
  });
}

/* ------------------------------------------------------------------------
   Srce schedulera — čista funkcija, bez baze i bez mreže.

   Vraća broj "slota" koji sada treba poslati, ili null ako se šuti.
   Slot je redni broj podsjetnika u danu, računat od startTime:

     slot = floor((sada - startTime) / interval)

   Cron se može pokrenuti kad hoće (07:00, 07:15, 07:30…) — svi ti pozivi
   padaju u isti slot, a slot se šalje samo jednom. Odatle idempotentnost:
   ni deset pokretanja u istom satu ne mogu dati dvije obavijesti.

   opts = { minutes, startTime, endTime, interval, lastSlot, done }
   ------------------------------------------------------------------------ */
function dueSlot(opts) {
  /* Zadatak je danas završen — do sutra ništa. */
  if (opts.done) { return null; }

  const start = parseTime(opts.startTime);
  if (start === null) { return null; }

  const end = parseTime(opts.endTime || DEFAULT_END_TIME);

  /* Prije jutarnjeg vremena i poslije večernjeg — ništa. */
  if (opts.minutes < start) { return null; }
  if (end !== null && opts.minutes > end) { return null; }

  const interval = opts.interval > 0 ? opts.interval : 60;
  const slot = Math.floor((opts.minutes - start) / interval);

  /* Ovaj slot je već poslan (ili je zapis noviji) — šuti. */
  const raw = opts.lastSlot;
  const last = (raw === null || raw === undefined || raw === "") ? -1 : Number(raw);
  if (isFinite(last) && last >= slot) { return null; }

  return slot;
}

/* ------------------------------------------------------------------------
   Zaštita cron endpointa.

   Vercel Cron šalje "Authorization: Bearer $CRON_SECRET" kad je varijabla
   postavljena. Vanjski cron servis (za Hobby plan) može poslati isti
   secret kroz "x-cron-secret". Bez postavljenog secreta endpoint je
   zatvoren — da ga bilo ko sa interneta ne može okidati.
   ------------------------------------------------------------------------ */
function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) { return false; }

  const header = String(req.headers.authorization || "");
  const given = header.replace(/^Bearer\s+/i, "") ||
                String(req.headers["x-cron-secret"] || "");

  /* Poređenje preko hash-a: uvijek ista dužina, bez curenja informacije
     kroz vrijeme izvršavanja. */
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  TZ, DAY_TTL, TASKS, DEFAULT_END_TIME,
  redis, KEYS,
  findTask, sarajevoNow, parseTime, subId, dueSlot, pushPayload,
  readJson, validSubscription, validDate,
  removeSubscription, intervalMinutes, cronAuthorized
};
