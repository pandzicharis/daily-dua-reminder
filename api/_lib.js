/* ==========================================================================
   api/_lib.js — zajedničko za sve tri funkcije.
   Fajl počinje sa "_" pa ga Vercel NE objavljuje kao endpoint.
   ========================================================================== */

const crypto = require("crypto");
const { Redis } = require("@upstash/redis");
const TASKS = require("../notification-tasks.js");
const DATA = require("../data.js");
/* SVE sekcije (dan-neovisno) — iz ovoga se gradi spisak ispravnih id-eva. */
const SECTIONS = DATA.sections;
/* Sekcije koje postoje na dati datum — jedini izvor istine za "šta se danas
   broji", isti koji vidi i aplikacija. */
const sectionsForDate = DATA.sectionsForDate;
const weekdayFromKey = DATA.weekdayFromKey;
/* Config se čisti u data.js, ne ovdje — kroz ista pravila prolazi i ono što
   browser upiše u localStorage i ono što stigne u tijelu zahtjeva. Prije je
   bilo prepisano na oba mjesta i moglo se raziće. */
const defaultPrefs = DATA.defaultPrefs;
const cleanPrefs = DATA.cleanPrefs;
/* Vlastita stavka korisnika nema svoj id u data.js — prepoznaje se po
   obliku. Vidi `validItemId()` ispod. */
const CUSTOM_ITEM_ID = DATA.CUSTOM_ITEM_ID;

const TZ = "Europe/Sarajevo";

/* ------------------------------------------------------------------------
   Prostor = jedan zajednički spisak čekiranog, ali sada PO KORISNIKU.

   Do sada je postojao jedan jedini prostor (ZIKR_SPACE) i svi uređaji su
   dijelili isti spisak — jer je korisnik bio jedan. Sada ime iz configa
   određuje prostor: Haris i Leila imaju svaki svoj spisak, a svi Harisovi
   uređaji i dalje vide isti. Dijeljenje kroz uređaje ostaje netaknuto,
   samo mu je ključ ime umjesto konstante.

   Ime NIJE lozinka. Nema logina, pa ko upiše "haris" vidi Harisov spisak —
   to je i smisao: drugi uređaj iste osobe se prijavi istim imenom i odmah
   je uparen. Zaštita od tuđeg pogleda nije dio ovoga i ne treba se
   pretpostavljati.

   ZIKR_SPACE ostaje SAMO kao zatečeni prostor: uređaj pretplaćen prije nego
   je config postojao nema ime uz pretplatu, pa ga scheduler i dalje vodi
   ovdje dok se aplikacija na njemu ne otvori i ne javi ime.
   ------------------------------------------------------------------------ */
const SPACE = (process.env.ZIKR_SPACE || "zajedno").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "zajedno";

/* Ime -> ključ prostora. Mora biti isto pravilo na svim uređajima, inače bi
   "Haris" sa telefona i "haris " sa računara bila dva odvojena spiska.

   Naša slova se svode na ASCII (č/ć→c, ž→z, š→s, đ→d) da ključ ostane
   siguran za Redis i URL. Posljedica je namjerna: "Đenan" i "Denan" su isti
   korisnik, pa se spisak nađe i kad se kuca bez kvačica.

   Vraća "" za sve što nije upotrebljivo — pozivalac to tretira kao "nema
   korisnika" i ne dira bazu. */
function userKey(raw) {
  const map = { "č": "c", "ć": "c", "ž": "z", "š": "s", "đ": "d" };
  return String(raw || "")
    .toLowerCase()
    .replace(/[čćžšđ]/g, function (ch) { return map[ch]; })
    /* razmak i tačka u imenu ("ummu abdullah") postaju crtica, ostalo pada */
    .replace(/[\s._]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

/* Ime dolazi u zaglavlju, a NE u query stringu: tako ne završi u logovima
   servera ni u historiji zahtjeva. Body je rezerva za POST, query samo za
   lokalni testni panel. Vraća "" kad imena nema — i to je ispravno stanje
   (aplikacija bez imena radi lokalno i ne dira bazu). */
function userFrom(req, body, query) {
  const head = (req && req.headers && req.headers["x-zikr-user"]) || "";
  return userKey(head || (body && body.user) || (query && query.user) || "");
}

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

/* Sekcije koje podsjetnik pokriva: ili one nabrojane u `sections`, ili sve
   osim onih u `exceptSections`. Drugi oblik postoji da nova sekcija u
   data.js sama uđe u dnevni podsjetnik i ne može se zaboraviti dopisati.

   Broji se samo ono što TOG dana postoji (sekcija sa `days` u data.js). Bez
   filtriranja po danu bi `exceptSections` uvukao petačku sekciju i u utorak:
   `dan` nikad ne bi bio "done", pa bi zvonio do 23:00 svaki dan, a `navecer`
   (requires: ["dan"]) ne bi stigao nikad. */
function sectionsFor(task, dateKey, prefs) {
  const pool = sectionsForDate(dateKey || sarajevoNow().date, prefs);
  if (task.sections) {
    return pool.filter(function (section) {
      return task.sections.indexOf(section.id) !== -1;
    });
  }
  const except = task.exceptSections || [];
  return pool.filter(function (section) {
    return except.indexOf(section.id) === -1;
  });
}

/* Sve što se može čekirati. Kur'an nije stavka liste — pamti se kao jedno
   polje "quran" — pa ulazi u spisak ručno. Sve van ovog skupa je smeće i
   ne ulazi u bazu.

   NAMJERNO nad SVIM sekcijama, ne nad današnjim: ovo je validacija upisa
   ("je li id poznat"), a ne odluka o slanju. Filtriranje po danu bi odbilo
   kvačicu napravljenu u petak u 23:58 a poslanu u subotu u 00:03 (state.js
   svjesno dopušta ±1 dan), i zavisilo bi od dana u kojem se topla serverless
   instanca startovala. */
const ITEM_IDS = (function () {
  const set = new Set();
  SECTIONS.forEach(function (section) {
    if (section.kind === "quran") { set.add("quran"); return; }
    (section.items || []).forEach(function (item) { set.add(item.id); });
  });
  return set;
})();

/* Vlastita stavka (config, polje `dodatno`) nema svoj id u data.js, pa se
   pušta po OBLIKU, ne po spisku. Tako se ovdje ne mora čitati config
   korisnika pri svakom upisu kvačice — a šteta ne postoji: id je vezan za
   njegov vlastiti hash, broj polja u jednom zahtjevu je ograničen, a zapis
   ionako ističe za par dana. Stavka koju je u međuvremenu obrisao otpada iz
   računa jer je nema u `sectionsForDate()`. */
function validItemId(id) {
  if (typeof id !== "string") { return false; }
  return ITEM_IDS.has(id) || CUSTOM_ITEM_ID.test(id);
}

/* Koliko je od jednog podsjetnika urađeno — jedina osnova za odluku o
   slanju i o tekstu obavijesti.

     "none"     ništa čekirano   -> podsjeti da se počne
     "partial"  nešto čekirano   -> podsjeti da se nastavi
     "done"     sve čekirano     -> do sutra ništa

   `checked` je ono što vrati HGETALL nad KEYS.items(user, date), a `dateKey`
   je datum tog istog zapisa — iz njega se zna koje sekcije tog dana postoje.

   `prefs` je config TOG korisnika. Sekcija koju je ugasio ne ulazi u račun,
   pa njen podsjetnik ima total 0 i vraća "done" — odatle tišina, bez ijednog
   posebnog pravila u notification-tasks.js. */
function taskTally(task, checked, dateKey, prefs) {
  const map = checked || {};
  let total = 0;
  let done = 0;

  sectionsFor(task, dateKey, prefs).forEach(function (section) {
    const ids = (section.kind === "quran")
      ? ["quran"]
      : (section.items || []).map(function (item) { return item.id; });

    ids.forEach(function (id) {
      total += 1;
      if (map[id]) { done += 1; }
    });
  });

  return { done: done, total: total };
}

function taskStatus(task, checked, dateKey, prefs) {
  const tally = taskTally(task, checked, dateKey, prefs);

  /* Prazan podsjetnik nema šta da podsjeti — tretira se kao gotov. Ovo je
     ujedno drugi sloj tišine za podsjetnik vezan za dan sedmice: kad njegove
     sekcije tog dana nema, total je 0 pa ćuti i bez `days`. */
  if (tally.total === 0) { return "done"; }
  if (tally.done === 0) { return "none"; }
  return tally.done >= tally.total ? "done" : "partial";
}

/* Broj koji stoji na ikonici aplikacije — koliko je dova ostalo za proučiti
   u podsjetnicima koji su VEĆ NASTUPILI:

     broj = zbir neurađenih stavki svih podsjetnika čiji je `startTime` prošao

   Pravilo je isto ono koje aplikacija primjenjuje na ekranu (badge.js); ovdje
   postoji zato što aplikacija ne radi kad je zatvorena, a broj tada mora ipak
   nekako doći do ikonice. Dolazi uz push (`pushPayload`), a postavlja ga
   service worker. Puna priča o pravilu je u zaglavlju badge.js.

   Gleda se SAMO početak prozora, nikad kraj: dnevni završava u ponoć, ali i
   petački (do 12:59) ostaje u zbiru do kraja dana — kraj prozora gasi
   OBAVIJESTI, ne broj. Neurađeno neurađeno ostaje dok se ne uradi ili dok ne
   dođe novi dan.

   Ne gleda se ni `requires` ni `quietFor`: oni postoje da se dvije obavijesti
   ne poklope u istoj minuti, a broj je jedan jedini — nema se šta poklopiti.

   `minutes` i `weekday` dolaze izvana (iz istog trenutka po Sarajevu iz kojeg
   se donosi i odluka o slanju), da proba sa izmišljenim vremenom pokazuje
   broj koji bi tada stvarno otišao. `startOverride` je isti onaj
   REMINDER_START_TIME kojim lokalno testiranje pomjera sve zadatke da počnu
   odmah — bez njega bi broj i tada čekao 07:00, pa bi proba lagala. */
function badgeCount(checked, dateKey, prefs, minutes, weekday, startOverride) {
  let ostalo = 0;

  TASKS.forEach(function (task) {
    if (task.enabled === false) { return; }
    if (task.days && task.days.indexOf(weekday) === -1) { return; }

    const start = parseTime(startOverride || task.startTime);
    if (start === null || minutes < start) { return; }

    const tally = taskTally(task, checked, dateKey, prefs);
    ostalo += tally.total - tally.done;
  });

  return ostalo;
}

/* `requires` NIKAD ne smije pokazivati na podsjetnik ograničen `days`-om:
   ovdje se gleda samo status, ne prozor i ne dan sedmice.

   Podsjetnik koji ovaj zaklanja: dok svi id-evi iz `requires` nisu "done",
   ovaj se NE šalje. Postoji zato što se prozori dnevnog (08–21) i večernjeg
   (19–23) preklapaju — bez ovoga bi poslije 19:00 stizale dvije obavijesti
   jedna do druge. Vraća id-a koji zaklanja, ili null ako je put slobodan. */
function blockedBy(task, status) {
  const need = task.requires || [];
  for (const id of need) {
    if ((status || {})[id] !== "done") { return id; }
  }
  return null;
}

/* Vremenski ograničen zaklon (`quietFor`): podsjetnik ćuti dok DRUGI
   podsjetnik ima otvoren prozor i dok nije završen. Tako petkom do 12:59
   stiže samo petačka obavijest, a dnevni ne javlja isto po drugi put.

   Razlika od `blockedBy`/`requires`, i razlog zašto su to dva pojma:

     requires   — uslov po SADRŽAJU, bez roka. Večernji čeka da dnevni bude
                  završen, pa makar to bilo u 23:00.
     quietFor   — uslov po SADRŽAJU **i** po SATU. Pada na dva načina: kad
                  onaj drugi završi (nema šta više da javi) ili kad mu prozor
                  prođe. Zato dnevni petkom kreće u 13:00 kad se ništa ne
                  uradi, a odmah kad se petačke stavke završe.

   Granica se NE upisuje ovdje nego se čita iz `endTime`-a tog drugog
   podsjetnika, pa "12:59" postoji na jednom mjestu.

   Namjerno se NE koristi pomjeranje startTime-a po danu: start mora biti
   isti cijeli dan da slot ostane monoton. Kad bi se mijenjao zavisno od
   toga je li petak završen, odčekiravanje stavke bi vratilo start na kasnije
   vrijeme, novi slot bi bio manji od zapisanog i `last >= slot` bi utišao
   dnevni do kraja dana.

   Vraća id onoga koji zaklanja, ili null ako je put slobodan. */
function quietFor(task, weekday, minutes, status) {
  const ids = task.quietFor || [];

  for (const id of ids) {
    const other = findTask(id);
    if (!other || other.enabled === false) { continue; }

    /* Podsjetnik koji tog dana ne postoji nikoga ne utišava. */
    if (other.days && other.days.indexOf(weekday) === -1) { continue; }

    /* Završen je — nema šta da javi, pa nema ni koga zaklanjati. */
    if ((status || {})[id] === "done") { continue; }

    /* "00:00" znači ponoć na kraju dana — isto kao u dueSlot(). */
    let end = parseTime(other.endTime || DEFAULT_END_TIME);
    if (end === 0) { end = 24 * 60; }
    if (end === null) { continue; }

    if (minutes <= end) { return id; }
  }

  return null;
}

/* Od kada tekst `messageLate` zamjenjuje uobičajeni: od trenutka kad se
   otvori prozor prvog podsjetnika koji ovaj zaklanja. Vrijeme se izvodi iz
   njegovog `startTime`, pa ne postoji na dva mjesta koja se mogu raziće.
   Vraća minute od ponoći, ili null ako ovaj podsjetnik nikog ne zaklanja. */
function lateFrom(task, weekday) {
  let earliest = null;
  TASKS.forEach(function (other) {
    if (other.enabled === false) { return; }
    /* Podsjetnik koji tog dana ne postoji nikoga ne zaklanja, pa ne može ni
       pomjeriti tekst na `messageLate`. */
    if (other.days && other.days.indexOf(weekday) === -1) { return; }
    if (!other.requires || other.requires.indexOf(task.id) === -1) { return; }
    const start = parseTime(other.startTime);
    if (start === null) { return; }
    if (earliest === null || start < earliest) { earliest = start; }
  });
  return earliest;
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

  /* Svi poznati korisnici — SET ključeva imena. Ne služi odluci o slanju
     nego samo tome da aplikacija može reći "ovo ime već postoji, spojićeš
     se na njegov spisak". Spisak imena se NIKAD ne vraća van. */
  users: "users",

  /* Config jednog korisnika (JSON) — dijeli se kroz njegove uređaje, isto
     kao i čekirano. Scheduler ga čita jer "petak ugašen" mijenja i odluku
     o podsjetniku, ne samo ekran. */
  cfg: function (user) { return "cfg:" + user; },

  /* Čekirano za jedan dan — HASH itemId -> "1", zajednički za SVE uređaje
     jednog korisnika. Kur'an je isti takav zapis, pod poljem "quran".
     Odčekirano se BRIŠE iz hash-a (HDEL), pa "nema polja" i "nije urađeno"
     znače isto. */
  items: function (user, date) { return "items:" + user + ":" + date; },

  /* Zadnji poslani slot ostaje PO UREĐAJU — stanje se dijeli, ali svaki
     uređaj svoju obavijest dobija sam za sebe. */
  sent: function (id, taskId, date) {
    return "sent:" + id + ":" + taskId + ":" + date;
  }
};

/* Identitet uređaja = sam endpoint pretplate. Ime korisnika stoji UZ
   pretplatu (polje `user`), ne u ovom id-u: isti telefon smije promijeniti
   ime bez pravljenja nove pretplate. */
function subId(endpoint) {
  return crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
}

/* ------------------------------------------------------------------------
   Config korisnika

   Polja:

     transkript   ekran pokazuje transliteraciju umjesto arapskog
     putovanje    kraći dnevni spisak za put. Za scheduler nije poseban
                  slučaj: `sectionsForDate()` mu vrati već svedene sekcije, pa
                  se sam račun (`taskTally()`) ne mijenja ni jednom linijom —
                  totali su manji, a podsjetnik ućuti kad se to malo završi.
     skriveno     spisak id-eva stavki koje korisnik ne želi vidjeti
     izmjene      korisnikove izmjene stavki iz data.js (naslov, tekstovi,
                  broj ponavljanja) — pamti se samo ono što se razlikuje
     stranice     dnevna porcija mushafa
     dodatno      vlastite stavke korisnika, po sekciji

   `skriveno` se vodi kao spisak ISKLJUČENIH, a ne prikazanih, jer je
   podrazumijevano "sve se prikazuje": nova dova u data.js tako sama uđe u
   spisak i ne treba dopisivati config svakom korisniku.

   Prekidača za cijelu sekciju nema. Postojao je (`petak`), ali kvačice rade
   isto: isključi svih pet petačkih stavki i sekcija ispadne iz
   `sectionsForDate()`, njen podsjetnik dobije total 0 i ućuti. Zapis iz tog
   vremena (`petak: false`) prolazi kroz `cleanPrefs()` i otpada kao svako
   drugo nepoznato polje.

   Sam `cleanPrefs()` je u data.js — i vlastite stavke i izmjene mijenjaju
   ono što se broji, pa server i aplikacija moraju sijati kroz isto sito.
   Odatle i ovo: podsjetnik računa i korisnikove vlastite stavke, jer
   `sectionsForDate()` ih vrati kao i sve ostale.
   ------------------------------------------------------------------------ */

/* Config iz baze. Korisnik bez zapisa dobija podrazumijevani — nikad null,
   da pozivalac ne mora svaki put provjeravati. */
async function readPrefs(user) {
  if (!user) { return defaultPrefs(); }
  return cleanPrefs(await redis.get(KEYS.cfg(user)));
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
function pushPayload(task, status, late, ikonica) {
  const one = (task.sections && task.sections.length === 1)
    ? task.sections[0]
    : null;

  /* Započeto pa stalo -> "nastavi", inače uobičajena napomena. Kad je sve
     gotovo, ovamo se uopšte ne dolazi — dueSlot() prije toga vrati null.

     `late` znači da je nastupilo vrijeme podsjetnika koji ovaj zaklanja
     (večernji), a ovdje još ništa nije čekirano. Tada je ovo jedina
     obavijest, pa i naslov i tekst pokrivaju oboje. "Nastavi" ima
     prednost — ako je nešto već započeto, to je korisnija napomena. */
  let title = task.title;
  let body = task.message;

  if (status === "partial" && task.messagePartial) {
    body = task.messagePartial;
  } else if (late && task.messageLate) {
    title = task.titleLate || title;
    body = task.messageLate;
  }

  const payload = {
    title: title,
    body: body,
    tag: task.id,
    taskId: task.id,
    url: one ? "/#sec-" + one : "/"
  };

  /* Broj za ikonicu ide uz obavijest, a ne posebnim pushem: `userVisibleOnly`
     traži vidljiv odgovor na svaki push, pa "tihi push samo da se osvježi
     brojka" nije opcija. Ovako brojka stiže besplatno, uz podsjetnik koji
     ionako ide.

     Uz broj ide i DAN za koji je izbrojan. Push ima TTL od 55 minuta, pa onaj
     poslan u 23:00 zna biti isporučen poslije ponoći — a tada jučerašnji broj
     nije "malo star" nego pogrešan, jer novi dan počinje prazan. Service
     worker po tom danu prepozna zakašnjelu poruku i ikonicu očisti umjesto da
     je naslika.

     Izostavlja se kad ga pozivalac ne pošalje (proba izgleda obavijesti,
     `npm run test-push`) — tada service worker ikonicu uopšte ne dira. */
  if (ikonica && typeof ikonica.broj === "number" && isFinite(ikonica.broj)) {
    payload.badge = Math.max(0, Math.round(ikonica.broj));
    payload.badgeDan = ikonica.dan;
  }

  return JSON.stringify(payload);
}

/* ------------------------------------------------------------------------
   Srce schedulera — čista funkcija, bez baze i bez mreže.

   Vraća broj "slota" koji sada treba poslati, ili null ako se šuti.
   Slot je redni broj podsjetnika u danu, računat od startTime:

     slot = floor((sada - startTime) / interval)

   Cron se može pokrenuti kad hoće (07:00, 07:15, 07:30…) — svi ti pozivi
   padaju u isti slot, a slot se šalje samo jednom. Odatle idempotentnost:
   ni deset pokretanja u istom satu ne mogu dati dvije obavijesti.

   opts = { minutes, weekday, days, startTime, endTime, interval, lastSlot,
            status }
   ------------------------------------------------------------------------ */
function dueSlot(opts) {
  /* Podsjetnik koji važi samo nekim danima (petak) — ostalim danima ga nema.
     [5].indexOf(undefined) === -1, dakle ako `weekday` ne dođe, zadatak
     ĆUTI; tiši smjer je ispravniji, a zato izvještaj /api/cron nosi
     `weekday` i `windows` da se to vidi. */
  if (opts.days && opts.days.indexOf(opts.weekday) === -1) { return null; }

  /* Zadatak je danas u cijelosti završen — do sutra ništa. Djelimično
     urađen NE utišava podsjetnik; mijenja mu samo tekst (pushPayload). */
  if (opts.status === "done") { return null; }

  const start = parseTime(opts.startTime);
  if (start === null) { return null; }

  /* "00:00" znači ponoć na KRAJU dana, ne na početku — inače bi zadatak
     ćutao cijeli dan. Dalje se ne ide: u ponoć je novi datum, nov ključ u
     bazi i ciklus svakako kreće od nule. */
  let end = parseTime(opts.endTime || DEFAULT_END_TIME);
  if (end === 0) { end = 24 * 60; }

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
/* Testni panel u aplikaciji (dev-panel.js) zove /api/cron iz browsera, gdje
   secret ne smije stajati. Zato se endpoint otvara bez njega SAMO kad se
   poklope dvije nezavisne stvari:

     1. REMINDER_TIME_TRAVEL=1 u okruženju — postavlja se isključivo u
        .env.local, nikad na Vercelu;
     2. zahtjev dolazi sa localhosta.

   Na Vercelu ni jedno ne vrijedi (varijable nema, a Host je pravi domen), pa
   endpoint tamo ostaje zatvoren kao i do sada. */
function devUnlocked(req) {
  if (process.env.REMINDER_TIME_TRAVEL !== "1") { return false; }
  const host = String((req.headers && req.headers.host) || "").toLowerCase();
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return name === "localhost" || name === "127.0.0.1" || name === "::1";
}

function cronAuthorized(req) {
  if (devUnlocked(req)) { return true; }

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
  TZ, DAY_TTL, TASKS, SECTIONS, SPACE, DEFAULT_END_TIME,
  redis, KEYS,
  findTask, sectionsFor, taskTally, taskStatus, badgeCount,
  blockedBy, lateFrom, validItemId,
  quietFor, sectionsForDate, weekdayFromKey,
  sarajevoNow, parseTime, subId, dueSlot, pushPayload,
  readJson, validSubscription, validDate,
  removeSubscription, intervalMinutes, cronAuthorized, devUnlocked,
  /* korisnik i njegov config */
  userKey, userFrom, defaultPrefs, cleanPrefs, readPrefs
};
