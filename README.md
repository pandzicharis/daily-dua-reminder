# Moj Zikr — PWA + dnevni push podsjetnici

Statična aplikacija (HTML + CSS + vanilla JS) ostaje ista kakva je bila.
Dodani su samo PWA sloj i najmanji mogući backend na Vercelu koji šalje
podsjetnike dok zadatak nije završen.

```
iPhone PWA  →  localStorage (postojeće stanje)
                     ↓ promjena checkboxa
              POST /api/state   { id, date, tasks }
                     ↓
              Upstash Redis (samo "gotovo/nije" + zadnji poslani slot)
                     ↓ svakih 15 min
              Vercel Cron → /api/cron
                     ↓ ako nije gotovo i sljedeći sat je stigao
              Web Push (VAPID) → service worker → obavijest na iPhoneu
```

---

## 1. Šta je dodano, a šta promijenjeno

**Novi fajlovi**

| Fajl | Uloga |
|---|---|
| `manifest.webmanifest` | ime, boje, ikonice, `display: standalone` |
| `service-worker.js` | prima push, prikazuje obavijest, obrađuje klik, offline keš |
| `notifications.js` | dozvola, pretplata, uključi/isključi, slanje stanja serveru |
| `notification-tasks.js` | **jedini** spisak podsjetnika — čita ga i browser i server |
| `icons/*.png` | 96, 192, 512, maskable 192/512, apple-touch 180, favicon 32 |
| `api/config.js` | `GET` → javni VAPID ključ |
| `api/subscribe.js` | `POST` upiši pretplatu, `DELETE` obriši |
| `api/state.js` | `POST` — koji su zadaci danas gotovi |
| `api/cron.js` | scheduler; jedino mjesto koje odlučuje šalje li se push |
| `api/_lib.js` | Redis, vrijeme po Sarajevu, validacija, `dueSlot()` |
| `api/_dev-store.js` | fajl-baza za lokalni rad kad KV varijable fale (na Vercelu puca namjerno) |
| `dev-server.js` | lokalni server: statični fajlovi + `/api/*` na portu 3000 |
| `vercel.json` | cron svakih 15 min + headeri |
| `package.json` | `web-push`, `@upstash/redis` |
| `.env.example` | spisak varijabli |

**Izmijenjeni fajlovi**

- `index.html` — manifest, apple meta oznake, ikonice, dugme za podsjetnike,
  dva nova `<script>` taga. Postojeći raspored nije diran.
- `script.js` — dvije male dopune: poziv `mojZikrSyncNotifications()` u
  `saveDayState()` i prikaz `item.source` u desnom ćošku headera.
- `style.css` — `.item-source` i `.notify*` stilovi.
- `data.js` — `source` polja (izvor dove/sure).

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
6. Service worker uhvati `push` event i prikaže obavijest.

Privatni ključ postoji samo kao env varijabla na serveru i ne pojavljuje se
ni u jednom fajlu koji ide u browser.

## 4. Kako se sinhronizuje postojeće stanje

Aplikacija i dalje koristi svoj `localStorage` ključ `moj-zikr-state`
(`{ "2026-08-17": { items: {...}, quran: true } }`). Ništa nije premješteno
na server.

`saveDayState()` nakon upisa pozove `window.mojZikrSyncNotifications()`.
Ta funkcija iz **postojećeg** stanja izračuna samo jedno po podsjetniku —
je li gotov — i pošalje:

```json
POST /api/state
{ "id": "a1b2…", "date": "2026-08-17",
  "tasks": { "dan": true, "navecer": false } }
```

Podsjetnika su dva i gotov je čim je u **bilo kojoj** njegovoj sekciji
čekirana **bilo koja** stavka (za Kur'an: kad je stranica proučena):

| Stanje danas | Jutarnji `dan` (07–21) | Večernji `navecer` (19–23) |
|---|---|---|
| ništa čekirano | stiže | stiže |
| jedna dova ili Kur'an | — | stiže |
| sve osim *Navečer* | — | stiže |
| samo *Navečer* | stiže | — |
| sve | — | — |

Razdvojeni su baš zato da završen dan **ne** utiša večernji podsjetnik.
Server ne zna ni jednu dovu ni jedan ajet — samo dva boolean-a po danu.

Sinhronizacija ide i pri svakom otvaranju aplikacije, da server stigne
saznati za promjene napravljene offline.

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

## 6. Kako server zna da je zadatak završen

Isključivo iz `POST /api/state`. Server ne može čitati localStorage dok je
PWA zatvorena, zato frontend javlja promjenu čim se checkbox pomjeri.
Ako je telefon bio offline, stanje se pošalje pri sljedećem otvaranju.
Ako je zadatak odčekiran, `hdel` ga vraća u "nije gotovo" i podsjetnici se
nastavljaju.

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
4. Pozovi opet → `dan` više ne dolazi, `navecer` i dalje stiže.
5. Čekiraj jednu stavku sekcije *Navečer* → sad ćuti i on.

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
  zato je "gotovo/nije" i na serveru, pa podsjetnici rade i tada.

---

## Dodavanje novog podsjetnika

U `notification-tasks.js` dodaj objekat:

```js
{
  id: "sabah-namaz",         // stabilan; ne mijenjaj naknadno
  sections: ["zikr"],        // id-evi sekcija iz data.js koje pokriva
  title: "Sabah 🌅",
  message: "Vrijeme je za sabah.",
  startTime: "05:00",
  endTime: "07:00"
}
```

Umjesto `sections` može stajati `exceptSections: ["navecer"]` — tada
podsjetnik pokriva **sve** sekcije osim navedenih, pa nova sekcija u
`data.js` sama ulazi u njega i ne može se zaboraviti dopisati. Tako je
napisan jutarnji podsjetnik.

Podsjetnik ćuti čim je u bilo kojoj svojoj sekciji čekirana bilo koja
stavka. Ništa drugo se ne dira — ni API, ni scheduler, ni frontend.
Server prihvata **samo** id-eve sa ovog spiska; sve ostalo vraća u polju
`ignored` odgovora `/api/state`.
