# Moj Zikr — PWA + dnevni push podsjetnici

Statična aplikacija (HTML + CSS + vanilla JS) ostaje ista kakva je bila.
Dodani su samo PWA sloj i najmanji mogući backend na Vercelu koji šalje
podsjetnike dok zadatak nije završen.

```
iPhone PWA  ←→  localStorage (offline keš)
                     ↓ promjena checkboxa          ↑ povlačenje pri otvaranju
              POST /api/state  { date, items }   GET /api/state?date=
                     ↓                             ↑
              Upstash Redis — ZAJEDNIČKI spisak čekiranog za sve uređaje
                     ↓ svakih 15 min
              Vercel Cron → /api/cron
                     ↓ ako sekcija nije cijela gotova i sljedeći sat je stigao
              Web Push (VAPID) → service worker → obavijest na iPhoneu
                                       ↓
                          (osim ako je sesija u toku:
                           prozor vidljiv I fokusiran)
```

---

## 1. Šta je dodano, a šta promijenjeno

**Novi fajlovi**

| Fajl | Uloga |
|---|---|
| `manifest.webmanifest` | ime, boje, ikonice, `display: standalone` |
| `service-worker.js` | prima push, prikazuje obavijest, obrađuje klik, offline keš |
| `notifications.js` | dozvola, pretplata, uključi/isključi |
| `sync.js` | zajedničko stanje kroz uređaje: slanje promjena, povlačenje, offline red |
| `notification-tasks.js` | **jedini** spisak podsjetnika — čita ga i browser i server |
| `icons/*.png` | 96, 192, 512, maskable 192/512, apple-touch 180, favicon 32 |
| `api/config.js` | `GET` → javni VAPID ključ |
| `api/subscribe.js` | `POST` upiši pretplatu, `DELETE` obriši |
| `api/state.js` | `GET` pročitaj / `POST` promijeni zajednički spisak čekiranog |
| `api/cron.js` | scheduler; jedino mjesto koje odlučuje šalje li se push |
| `api/_lib.js` | Redis, vrijeme po Sarajevu, validacija, `dueSlot()`, `taskStatus()` |
| `api/_dev-store.js` | fajl-baza za lokalni rad kad KV varijable fale (na Vercelu puca namjerno) |
| `dev-server.js` | lokalni server: statični fajlovi + `/api/*` na portu 3000 |
| `vercel.json` | cron svakih 15 min + headeri |
| `package.json` | `web-push`, `@upstash/redis` |
| `.env.example` | spisak varijabli |

**Izmijenjeni fajlovi**

- `index.html` — manifest, apple meta oznake, ikonice, dugme za podsjetnike,
  tri nova `<script>` taga (`sync.js` **prije** `script.js`). Postojeći
  raspored nije diran.
- `script.js` — slanje promjene checkboxa (`pushChange`), primanje stanja
  sa servera (`applyRemoteState`) i prikaz `item.source` u ćošku headera.
- `style.css` — `.item-source` i `.notify*` stilovi.
- `data.js` — `source` polja (izvor dove/sure) i `module.exports` na kraju,
  da server može računati koliko je od sekcije urađeno iz istog spiska.

---

## 2. Kako radi PWA

`manifest.webmanifest` + apple meta oznake u `<head>` daju Safariju sve što
mu treba da "Add to Home Screen" napravi pravu aplikaciju: ime, ikonicu,
boju pozadine i `display: standalone` (bez URL trake).

Service worker se registruje pri svakom otvaranju (`notifications.js`), ne
tek kad se uključe podsjetnici — tako i offline radi. Keširanje je
**network-first**: uvijek se prvo ide na mrežu, a keš služi samo kad nema
interneta, pa se nikad ne servira zastarjeli sadržaj.

## 3. Kako rade push obavijesti

1. Korisnik pritisne **Uključi podsjetnike** → `Notification.requestPermission()`.
2. Registruje se service worker, `pushManager.subscribe()` sa javnim VAPID ključem.
3. Pretplata (endpoint + dva ključa) ide na `POST /api/subscribe`.
4. Server je upiše u Redis i vrati `id` (sha256 endpointa, 32 hex znaka).
   Taj `id` je jedini identitet uređaja — **nema logina, naloga ni lozinki**.
5. `api/cron.js` šalje push kroz `web-push` potpisan privatnim VAPID ključem.
6. Service worker uhvati `push` event i prikaže obavijest — **osim ako je
   sesija u tom trenutku u toku**. Tada spisak već stoji pred korisnikom,
   pa je obavijest samo smetnja.

   "Sesija u toku" traži oba uslova zajedno:

   | Uslov | Znači |
   |---|---|
   | `visibilityState === "visible"` | nije minimizirano, nije druga kartica, nije pozadina telefona |
   | `focused === true` | to je prozor u kojem korisnik trenutno radi |

   Samo `visible` nije dovoljno: na laptopu prozor iza drugog programa i
   dalje prijavljuje `visible`, a to nije aktivna sesija. **Sve što nije
   aktivna sesija računa se kao zatvoreno** i obavijest stiže normalno.

   Ovo ne krši `userVisibleOnly`: pravilo traži vidljiv odgovor na push, a
   aktivna aplikacija to jeste, pa browser ne prikazuje svoju zamjensku
   obavijest ("site updated in background").

Privatni ključ postoji samo kao env varijabla na serveru i ne pojavljuje se
ni u jednom fajlu koji ide u browser.

## 4. Kako se stanje dijeli kroz uređaje

Telefon i računar rade nad **istim** spiskom čekiranog. Server je izvor
istine, a `localStorage` (`moj-zikr-state`) ostaje offline keš — aplikacija
radi i bez interneta, samo se tada ne vidi šta je urađeno na drugom uređaju.

Nema logina. Svi uređaji dijele jedan prostor, `ZIKR_SPACE` (default
`zajedno`). Ključ u bazi je `items:<prostor>:<datum>`, Redis HASH oblika
`itemId -> "1"`. Odčekirano se **briše** iz hash-a, pa "nema polja" i "nije
urađeno" znače isto. Kur'an nije stavka liste nego zaseban boolean u
aplikaciji, a gore se pamti kao obično polje `quran`.

**Šalju se samo promjene, nikad cijelo stanje:**

```json
POST /api/state
{ "date": "2026-08-18", "items": { "zikr-salavat-50": true } }
```

To je ono što čuva dva uređaja od međusobnog gaženja. Da se šalje cijelo
stanje, uređaj koji je bio offline vratio bi nazad sve što je drugi u
međuvremenu odčekirao. Ovako pošalje samo ono što je on sam dirnuo.
Odgovor je stanje **poslije** upisa, pa uređaj odmah pokupi i tuđe promjene.

Povlačenje ide na svako otvaranje aplikacije i svaki povratak u nju
(`visibilitychange`), te kad se mreža vrati (`online`).

**Kad nema mreže** promjena ide u red u `localStorage`
(`moj-zikr-pending`) i šalje se pri prvom sljedećem otvaranju ili povratku
mreže. Iz reda se skida samo ono što je zaista poslano i što se u
međuvremenu nije opet promijenilo, pa klik tokom slanja ne može ispasti.

**Prvo otvaranje u danu** na nekom uređaju prvo *pošalje* ono što je već
čekirano lokalno, pa tek onda povuče stanje. Bez toga bi prvo povlačenje
obrisalo checkmarke napravljene prije nego je dijeljenje uopšte postojalo.
Šalju se samo čekirane stavke — ništa se ne skida, pa se ne može pregaziti
ono što je drugi uređaj odčekirao.

> Prostor je zajednički za sve koji otvore aplikaciju — to je namjerno, jer
> je aplikacija lična i tako telefon i računar odmah vide isto stanje, bez
> uparivanja. Ako ikad zatreba odvojiti dvije osobe, svakoj treba svoj
> `ZIKR_SPACE` (i svoj deploy).

## 5. Kako radi satna logika

Sve je u čistoj funkciji `dueSlot()` (`api/_lib.js`):

```
slot = floor((sada − startTime) / REMINDER_INTERVAL_MINUTES)
```

Šalje se samo ako je `slot` veći od zadnjeg zapisanog slota za taj dan.

| Cron | Slot | Ishod |
|---|---|---|
| 07:00 | 0 | šalje |
| 07:15 | 0 | šuti (slot 0 već poslan) |
| 07:30 | 0 | šuti |
| 07:45 | 0 | šuti |
| 08:00 | 1 | šalje |
| 09:32 | — | korisnik završio → `done` → **ništa više danas** |
| sutra 07:00 | 0 | novi dan, nov ključ u bazi → šalje |

Zapis o poslanom slotu se upisuje **prije** slanja: ako se cron nekim čudom
pokrene dvaput u istoj minuti, druga instanca vidi zauzet slot i šuti. Bolje
propustiti jedan podsjetnik nego poslati duplikat.

Ključevi u bazi nose datum po Sarajevu (`sent:<id>:<task>:<datum>`), pa se
ciklus resetuje sam od sebe u ponoć. Sve ističe nakon 3 dana (TTL).

`endTime` (default 22:00) zaustavlja podsjetnike navečer da telefon ne
zvoni usred noći.

## 6. Kako server zna dokle je zadatak stigao

Server sam prebroji, iz zajedničkog spiska čekiranog i iz sekcija u
`data.js` (isti fajl koji vidi i aplikacija — `taskStatus()` u `_lib.js`).
Nema slanja "gotovo/nije" sa uređaja, pa ne može doći do razilaženja između
onoga što je uređaj stigao javiti i onoga što stvarno stoji u bazi.

Tri ishoda po podsjetniku:

| Koliko je čekirano | Status | Šta stiže |
|---|---|---|
| ništa | `none` | `message` — *"Vrijeme je za dnevni zikr."* |
| nešto, ali ne sve | `partial` | `messagePartial` — *"Nastavi sa zikrom."* |
| sve | `done` | ništa do sutra |

Dnevni i večernji se broje odvojeno, pa završen dan **ne** utišava večernji
podsjetnik:

| Stanje danas | Dnevni `dan` (08–21) | Večernji `navecer` (19–23) |
|---|---|---|
| ništa čekirano | "Vrijeme je za dnevni zikr." | "Vrijeme je za vecernji zikr." |
| jedna dova iz *Dove* | "Nastavi sa zikrom." | "Vrijeme je za vecernji zikr." |
| sve osim *Navečer* | — | "Vrijeme je za vecernji zikr." |
| sve osim *Navečer* + jedna navečer | — | "Nastavi sa zikrom." |
| sve | — | — |

Ako je stavka odčekirana, podsjetnici se nastavljaju — `hdel` je vrati u
"nije urađeno".

## 7. Kako Vercel Cron pokreće scheduler

`vercel.json`:

```json
{ "crons": [{ "path": "/api/cron", "schedule": "*/15 * * * *" }] }
```

Vercel uz cron zahtjev šalje `Authorization: Bearer $CRON_SECRET`.
Bez ispravnog secreta `/api/cron` vraća 401.

> **Ograničenja Vercel Crona — pročitaj ovo**
>
> - **Hobby plan dozvoljava cron samo jednom dnevno.** Sa `*/15 * * * *`
>   deploy će biti odbijen. Rješenja:
>   1. Pro plan (`*/15` radi bez problema), ili
>   2. izbaci `crons` iz `vercel.json` i koristi vanjski servis
>      (npr. cron-job.org) koji svakih 15 minuta gađa
>      `https://tvoj-app.vercel.app/api/cron` sa headerom
>      `x-cron-secret: <CRON_SECRET>`.
> - Cron se ne pokreće u sekundu u sekundu — Vercel garantuje samo da će se
>   pokrenuti unutar predviđenog prozora. Zato scheduler **nikad ne pita
>   "je li sad tačno 8"**, nego računa slot. Ako cron zakasni do 07:32,
>   podsjetnik za 07:00 stiže u 07:32, a sljedeći tek u 08:00+.

## 8. Kako generisati VAPID ključeve

```bash
npx web-push generate-vapid-keys
```

Ispisuje javni i privatni ključ. Generišu se **jednom** — ako ih promijeniš,
sve postojeće pretplate prestaju raditi i korisnici moraju ponovo uključiti
podsjetnike.

## 9. Env varijable na Vercelu

| Varijabla | Obavezna | Opis |
|---|---|---|
| `VAPID_PUBLIC_KEY` | da | javni ključ (ide u browser preko `/api/config`) |
| `VAPID_PRIVATE_KEY` | da | privatni ključ — **nikad u frontend** |
| `VAPID_SUBJECT` | da | `mailto:tvoj@email.com` ili https URL |
| `KV_REST_API_URL` | da | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | da | Upstash Redis REST token |
| `CRON_SECRET` | da | `openssl rand -hex 32`; bez njega cron vraća 401 |
| `REMINDER_INTERVAL_MINUTES` | ne | **60** u produkciji, `1` za testiranje |
| `REMINDER_START_TIME` | ne | samo za test: pomjera startTime svih zadataka |
| `ZIKR_SPACE` | ne | ime zajedničkog prostora u bazi (default `zajedno`) |

Prihvataju se i `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.

## 10. Deploy na Vercel

```bash
npm install -g vercel
vercel link
```

1. **Baza:** Vercel Dashboard → Storage → Upstash Redis → Connect Project.
   `KV_REST_API_URL` i `KV_REST_API_TOKEN` se dodaju same.
2. **Ključevi:** `npx web-push generate-vapid-keys`, pa Settings →
   Environment Variables (Production + Preview).
3. **Deploy:**

```bash
vercel --prod
```

Frontend ostaje statičan (root folder), `api/*.js` postaju serverless
funkcije. Nema build koraka i nema servera koji stalno radi.

## 11. Instalacija na iPhone

1. Otvori `https://tvoj-app.vercel.app` u **Safariju** (ne Chrome).
2. Podijeli (kvadratić sa strelicom) → **Add to Home Screen**.
3. Pokreni aplikaciju **sa početnog ekrana** — ikonica je rub el-hizb.

## 12. Uključivanje obavijesti na iPhoneu

U aplikaciji pokrenutoj sa početnog ekrana pritisni **Uključi podsjetnike**
i dozvoli obavijesti. Dugme mijenja tekst u "Isključi podsjetnike".

Ako se aplikacija otvori u Safari tabu (ne sa Home Screena), dugme javlja da
prvo treba dodati aplikaciju na početni ekran — iOS push pretplatu izdaje
samo instaliranoj PWA.

## 13. Testiranje cijelog toka

**Lokalno, bez ijednog naloga (najbrži put):**

```bash
npm install
npm run dev
```

Otvori `http://localhost:3000`. `dev-server.js` servira i statične fajlove i
`/api/*`, a bez `KV_REST_API_*` varijabli baza pada na `.dev-store.json`
(fajl u projektu). Otvaranje `index.html` duplim klikom ili preko običnog
static servera **ne radi** — tamo `/api/` ne postoji, pa dugme javi
"Backend nije dostupan" ili "Nema veze sa serverom".

U `.env.local` već stoji `REMINDER_INTERVAL_MINUTES=1` i
`REMINDER_START_TIME=00:00`, pa ručno okidaj scheduler:

```bash
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron
```

Push sa `localhost` radi u Chromeu (localhost se računa kao siguran
kontekst). Za pravi test na iPhoneu treba HTTPS, dakle deploy.

**Lokalno sa Vercel CLI-jem** (ako želiš okruženje identično produkciji):

```bash
npm install -g vercel && vercel link && vercel dev
```

Odgovor je izvještaj o tome šta se desilo:

```json
{ "date": "2026-08-17", "minutes": 754, "interval": 1,
  "devices": 1, "sent": [{ "device": "a1b2c3d4", "task": "dan", "slot": 12 },
                         { "device": "a1b2c3d4", "task": "navecer", "slot": 12 }],
  "removed": [], "errors": [] }
```

Provjera redom:

1. Pozovi endpoint dvaput zaredom → drugi put je `sent` prazan (nema duplikata).
2. Sačekaj minutu i pozovi opet → stižu nove obavijesti (novi slot).
3. Čekiraj **jednu** stavku sekcije *Zikr* u aplikaciji.
4. Pozovi opet → `dan` sad dolazi sa tekstom "Nastavi sa zikrom.".
5. Čekiraj **sve** iz *Kur'an*, *Zikr* i *Dove* → `dan` ćuti, `navecer` stiže.
6. Čekiraj sve iz *Navečer* → ćuti i on.
7. Dijeljenje: otvori aplikaciju u drugom browseru (ili incognito prozoru),
   čekiraj nešto tamo i vrati se u prvi — checkmark je i tu.
8. Aktivna sesija: dok radiš u prozoru aplikacije, ručno okidanje crona ne
   smije dati obavijest. Klikni na drugi program (prozor ostaje vidljiv,
   ali više nije fokusiran) pa okini opet — obavijest stiže.

Na kraju vrati `REMINDER_INTERVAL_MINUTES=60` i obriši `REMINDER_START_TIME`.

**U produkciji:**

```bash
curl -H "x-cron-secret: TVOJ_SECRET" https://tvoj-app.vercel.app/api/cron
```

Privremeno postavi `REMINDER_INTERVAL_MINUTES=1`, provjeri da obavijesti
stižu na telefon, pa vrati na `60`.

**Suhi testovi logike** (bez baze i mreže) su u `dueSlot()` — funkcija je
namjerno čista da se može testirati bez ijednog vanjskog poziva.

## 14. Ograničenja iOS-a i Safarija

- **iOS 16.4+** je minimum za Web Push.
- Push radi **samo** iz PWA dodane na početni ekran. U Safari tabu ne radi.
- Dozvola se mora tražiti iz korisničkog klika — zato je vezana za dugme.
- iOS ignoriše `icon` i `badge` iz obavijesti i uvijek prikazuje ikonicu
  aplikacije — onu iz `manifest.webmanifest`. Chrome koristi `icon` koji
  postavlja `service-worker.js`; oba puta je to `/icons/icon-192.png`, i
  keširana je već pri instalaciji service workera da radi i offline.
- **Zvuk** pušta sam OS, svojim podrazumijevanim tonom za obavijesti — web
  push ne može birati ton ni priložiti audio fajl. Odavde se može samo
  osigurati da obavijest nije nijema (`silent: false`) i da zamjena po
  istom tagu ponovo zvoni (`renotify: true`); oboje je postavljeno. Ako se
  ne čuje: iOS → *Settings → Notifications → Moj Zikr → Sounds*, macOS →
  *System Settings → Notifications → Safari*, i provjeri Fokus.
- Ako korisnik obriše aplikaciju sa početnog ekrana, pretplata umire. Push
  servis vrati 410 i `api/cron.js` je sam obriše iz baze.
- Vrijeme dostave nije garantovano u sekundu — APNs može isporučiti
  obavijest sa malim zakašnjenjem, pogotovo u Low Power modu.
- Ako korisnik duže vrijeme ignoriše obavijesti, iOS ih može prigušiti.
- **Fokus / Ne uznemiravaj** može sakriti obavijest dok režim traje.
- iOS nema `periodicSync` ni pozadinske poslove — zato scheduler mora biti
  na serveru, a ne na telefonu.
- localStorage u PWA na iOS-u može biti obrisan nakon dužeg nekorištenja —
  zato je pravo stanje na serveru, pa se pri sljedećem otvaranju samo vrati
  nazad i podsjetnici rade ispravno i tada.

---

## Dodavanje novog podsjetnika

U `notification-tasks.js` dodaj objekat:

```js
{
  id: "sabah-namaz",         // stabilan; ne mijenjaj naknadno
  sections: ["zikr"],        // id-evi sekcija iz data.js koje pokriva
  title: "Sabah 🌅",
  message: "Vrijeme je za sabah.",          // kad nije ništa čekirano
  messagePartial: "Nastavi sa zikrom.",     // kad je nešto, ali ne sve
  startTime: "05:00",
  endTime: "07:00"
}
```

Umjesto `sections` može stajati `exceptSections: ["navecer"]` — tada
podsjetnik pokriva **sve** sekcije osim navedenih, pa nova sekcija u
`data.js` sama ulazi u njega i ne može se zaboraviti dopisati. Tako je
napisan jutarnji podsjetnik.

Podsjetnik ćuti tek kad je **sve** iz njegovih sekcija čekirano; dok je
započet, mijenja mu se samo tekst (`messagePartial`). `messagePartial` je
opciono — bez njega se i u tom slučaju šalje `message`. Ništa drugo se ne
dira — ni API, ni scheduler, ni frontend.

`/api/state` prihvata **samo** id-eve stavki koje postoje u `data.js`; sve
ostalo vraća u polju `ignored`.
