# Vaktija preko Shortcutsa (bez ijedne dodatne aplikacije)

Shortcuts je već na telefonu i ništa se ne plaća. Ima jedno ograničenje koje
treba znati **prije** nego se krene:

> **Shortcuts ne može nacrtati widget sa podacima.** Njegov widget na
> početnom ekranu pokazuje samo *ime i ikonicu prečice* — ne i tekst koji ona
> vrati. Prečica se izvrši tek kad se pritisne.

Zato ovdje stoje dva recepta koja rade unutar tog ograničenja, i oba daju
ono zbog čega se widget i htio:

| | |
|---|---|
| **1. Vaktija na dodir** | ikonica na početnom ekranu; pritisak pokaže naredni vakat i stanje zikra |
| **2. Podsjetnik u minut** | jednom dnevno napravi podsjetnike za svih pet namaza tog dana — obavijest stiže **tačno** u vakat, sa samog telefona |

Ako ipak hoćeš pravi widget sa tekstom, treba aplikacija koja ga smije
crtati — **Scriptable** je besplatan (`apps.apple.com/app/id1405459188`,
autor Simon B. Støvring; ima plaćenih klonova sličnog imena, pazi na autora)
i za njega je skripta već napisana: `widget/vaktija-widget.js`.

U oba recepta zamijeni `tvoj-app.vercel.app` svojom adresom, a `haris` imenom
iz postavki aplikacije.

---

## 1. Vaktija na dodir

Dvije radnje. Server već sklopi tekst (`?format=text`), pa se u prečici ne
kopa po JSON-u.

1. **Shortcuts** → `+` → *Add Action*
2. **Get Contents of URL**
   - URL: `https://tvoj-app.vercel.app/api/widget?format=text`
   - *Show More* → **Headers** → `+` → ključ `X-Zikr-User`, vrijednost `haris`
3. **Show Notification** (ili *Show Result* ako hoćeš na ekran)
   - Body: `Contents of URL` (varijabla iz koraka 2)
4. Gore desno → ime prečice: **Vaktija**, izaberi ikonicu i boju
5. Meni prečice → **Add to Home Screen**

Sad je na početnom ekranu ikonica koja na dodir javi:

```
Ikindija 16:34 · za 2 h 13 min
Dnevni zikr ☀️: 7 / 12
```

Ista prečica radi i preko Sirija („Hej Siri, Vaktija"), i preko **Back Tap**
(*Settings → Accessibility → Touch → Back Tap*) — dupli udarac po poleđini
telefona i vaktija je tu.

---

## 2. Podsjetnik u minut

Push iz aplikacije je **najava**: stiže petnaest minuta prije namaza, a u sam
vakat namjerno ćuti. Ako hoćeš i javljanje **u sam vakat**, ovaj recept ga
dodaje mimo servera: telefon sam sebi napravi podsjetnike za taj dan, pa
obavijest pada u sekundu, i radi bez interneta u tom trenutku.

**Prečica „Vakti danas":**

1. **Get Contents of URL**
   - URL: `https://tvoj-app.vercel.app/api/widget`
   - Header `X-Zikr-User`: `haris`
2. **Get Dictionary Value** → Get `Value` for `vakti` in `Contents of URL`
3. **Repeat with Each** (item = jedan vakat)

   Unutar petlje:

   4. **Get Dictionary Value** → `namaz` in `Repeat Item`
   5. **If** `Dictionary Value` **is** `1`  ← izlazak sunca ovim ispada
      6. **Get Dictionary Value** → `kada` in `Repeat Item`
         (vrati npr. `2026-08-27 16:34`)
      7. **Date** → *Date* : `Dictionary Value` iz koraka 6
      8. **Get Dictionary Value** → `naziv` in `Repeat Item`
      9. **Add New Reminder**
         - Title: `Dictionary Value` (naziv) — npr. „Ikindija"
         - *Show More* → **Alert**: `At time` → `Date` iz koraka 7
         - List: napravi listu **Vaktija**, da ne ide među ostale obaveze
   10. **End If**
11. **End Repeat**

**Automatizacija koja to pokreće svaki dan:**

*Shortcuts → Automation → `+` → Time of Day* → **03:30**, *Daily* →
**Run Immediately** i isključi *Notify When Run* → radnja: **Run Shortcut →
Vakti danas**.

Od tada telefon svake noći povuče vremena za taj dan i sam sebi postavi pet
podsjetnika.

> **Očisti jučerašnje.** Na početak prečice dodaj **Find Reminders** (List is
> *Vaktija*, *Is Completed* → svejedno) → **Remove Reminders** — inače se
> lista puni svaki dan. Isto vrijedi ako prečicu pokreneš dvaput u istom
> danu.

> **Na putu** server vrati `putovanje: true` i **prazan** spisak vremena, pa
> petlja ne napravi nijedan podsjetnik — vaktija je sarajevska i namjerno
> ćuti dok je putovanje uključeno.

---

## Šta odakle dolazi

Obje prečice zovu isti `GET /api/widget` koji hrani i Scriptable widget.
Nijedno pravilo nije u prečici: koji je vakat na redu, koji zikr se trenutno
uči i je li putovanje uključeno — sve odlučuje server, iz istog `data.js` i
`notification-tasks.js` po kojima radi i aplikacija.

- `?format=text` → dvije linije običnog teksta (recept 1)
- bez parametra → JSON; svaki vakat nosi `naziv`, `vrijeme`, `namaz` i `kada`
  (datum i vrijeme u jednom komadu, spremno za *Date* radnju iz recepta 2)

Endpoint samo **čita** — nijedna prečica ne može pomjeriti spisak ni
označiti dovu.
