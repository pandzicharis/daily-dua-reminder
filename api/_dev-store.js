/* ==========================================================================
   api/_dev-store.js — zamjena za Upstash Redis, SAMO za lokalni rad.

   Aktivira se jedino kad KV_REST_API_* varijable nisu postavljene, da se
   cijeli tok može testirati bez pravljenja naloga. Podaci idu u
   .dev-store.json (u .gitignore).

   Na Vercelu se NIKAD ne koristi: tamo je fajl sistem privremen, pa bi
   ovakav store tiho gubio pretplate. Ako varijable fale u produkciji,
   bolje je da pukne glasno nego da podsjetnici tiho ne rade.

   Implementira samo komande koje kod stvarno koristi.
   ========================================================================== */

const fs = require("fs");
const path = require("path");

const FILE = path.join(process.cwd(), ".dev-store.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (e) {
    return {};
  }
}

function save(db) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    /* nema prava pisanja — ostaje samo u ovom pozivu */
  }
}

class DevStore {
  constructor() {
    if (process.env.VERCEL) {
      throw new Error(
        "KV_REST_API_URL i KV_REST_API_TOKEN nisu postavljeni. " +
        "Lokalni store se na Vercelu ne smije koristiti."
      );
    }
  }

  /* --- stringovi (TTL se lokalno ignoriše, podaci su ionako privremeni) --- */
  async set(k, v) { const db = load(); db[k] = v; save(db); return "OK"; }
  async get(k) { const db = load(); return (k in db) ? db[k] : null; }
  async del(k) { const db = load(); const had = k in db; delete db[k]; save(db); return had ? 1 : 0; }
  async exists(k) { return (k in load()) ? 1 : 0; }
  async expire() { return 1; }

  /* --- setovi --- */
  async sadd(k, m) {
    const db = load();
    const list = (db[k] && db[k].__set) || [];
    if (list.indexOf(m) === -1) { list.push(m); }
    db[k] = { __set: list };
    save(db);
    return 1;
  }
  async srem(k, m) {
    const db = load();
    const list = (db[k] && db[k].__set) || [];
    db[k] = { __set: list.filter(function (x) { return x !== m; }) };
    save(db);
    return 1;
  }
  async smembers(k) {
    const db = load();
    return (db[k] && db[k].__set) || [];
  }

  /* --- hash --- */
  async hset(k, obj) {
    const db = load();
    db[k] = Object.assign({}, db[k] || {}, obj);
    save(db);
    return 1;
  }
  async hgetall(k) {
    const db = load();
    return db[k] || null;
  }
  async hdel(k, ...fields) {
    const db = load();
    const h = db[k] || {};
    fields.forEach(function (f) { delete h[f]; });
    db[k] = h;
    save(db);
    return 1;
  }
}

module.exports = { DevStore: DevStore, FILE: FILE };
