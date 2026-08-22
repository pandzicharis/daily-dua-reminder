# Moj Zikr — PWA + dnevni push podsjetnici

Statična aplikacija (HTML + CSS + vanilla JS) ostaje ista kakva je bila.
Dodani su samo PWA sloj i najmanji mogući backend na Vercelu koji šalje
podsjetnike dok zadatak nije završen.

```
iPhone PWA  ←→  localStorage (offline keš)
                     ↓ promjena checkboxa          ↑ povlačenje pri otvaranju
              POST /api/state  { date, items }   GET /api/state?date=
                     ↓  X-Zikr-User: haris          ↑
              Upstash Redis — spisak čekiranog PO KORISNIKU
                              (items:<ime>:<datum>)
                     ↓ svakih 15 min
              Vercel Cron → /api/cron
                     ↓ grupiše uređaje po imenu, pa za svako ime posebno:
                       njegov spisak + njegov config → šalje li se i šta
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
| `settings.js` | config korisnika (ime, transkripcija, spisak, izmjene stavki, vlastite stavke, redoslijed) + drawer u kojem se podešava |
| `sync.js` | zajedničko stanje kroz uređaje: slanje promjena, povlačenje, offline red |
| `notification-tasks.js` | **jedini** spisak podsjetnika — čita ga i browser i server |
| `badge.js` | broj na ikonici aplikacije: koliko je dova ostalo u podsjetnicima koji su nastupili |
| `icons/*.png` | 96, 192, 512, maskable 192/512, apple-touch 180, favicon 32 |
| `api/config.js` | `GET` → javni VAPID ključ |
| `api/subscribe.js` | `POST` upiši pretplatu, `DELETE` obriši |
| `api/state.js` | `GET` pročitaj / `POST` promijeni zajednički spisak čekiranog |
| `api/prefs.js` | `GET`/`POST` config korisnika (`cfg:<ime>`), dijeljen kroz njegove uređaje |
| `api/cron.js` | scheduler; jedino mjesto koje odlučuje šalje li se push |
| `api/_lib.js` | Redis, vrijeme po Sarajevu, validacija, `dueSlot()`, `taskStatus()` |
| `api/_dev-store.js` | fajl-baza za lokalni rad kad KV varijable fale (na Vercelu puca namjerno) |
| `dev-server.js` | lokalni server: statični fajlovi + `/api/*` na portu 3000 |
| `dev-panel.js` | **testni panel — samo localhost:** glumi dan i vrijeme, okida podsjetnik |
| `scripts/check-schedule.js` | cijeli dan podsjetnika na papiru + provjera pravila (`npm run raspored`) |
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
  Uz to sekcija **Petak** (`days: [5]`) i dvije čiste funkcije koje su jedini
  izvor istine o tome koje sekcije postoje kojeg dana: `weekdayFromKey()` i
  `sectionsForDate()`.

---

## 2. Kako radi PWA

`manifest.webmanifest` + apple meta oznake u `<head>` daju Safariju sve što
mu treba da "Add to Home Screen" napravi pravu aplikaciju: ime, ikonicu,
boju pozadine i `display: standalone` (bez URL trake).

Service worker se registruje pri svakom otvaranju (`notifications.js`), ne
tek kad se uključe podsjetnici — tako i offline radi. Keširanje je
**network-first**: uvijek se prvo ide na mrežu, a keš služi samo kad nema
interneta, pa se nikad ne servira zastarjeli sadržaj.

### Povlačenje prsta nadole

Browser već ima svoje osvježavanje; instalirana PWA nema ni adresnu traku ni
taj gest, pa je jedini način da se pokupi ono što je urađeno na drugom
telefonu bio izaći iz aplikacije i vratiti se. Gest se zato pravi u
`script.js`, i **samo** kad je aplikacija pokrenuta sa početnog ekrana
(`display-mode: standalone` ili `navigator.standalone`) — u browseru se ne
dira ništa, da se dva povlačenja ne otimaju o isti prst.

Ne radi ono što radi browserovo osvježavanje, i to je namjerno:

1. povuče se zajedničko stanje (`sync.js`) i config (`settings.js`), a ekran
   se sam iscrta tamo gdje se nešto stvarno promijenilo — bez bijelog
   treptaja i bez gubitka skrola;
2. usput se pita service worker ima li **nova verzija** aplikacije. Ako je
   nađe (`installing` ili `waiting`), tek tada slijedi pravo ponovno
   učitavanje. Instalirana aplikacija se u praksi nikad ne zatvara, pa bi
   inače znala danima ostati na staroj verziji.

Kad se ništa nije promijenilo, oba su prazna — pa se ovo ne može zavrtjeti u
krug ponovnih učitavanja.

---

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

## 3b. Broj na ikonici (badge)

Ikonica instalirane aplikacije nosi crveni krug sa brojem — koliko je dova
ostalo za proučiti. Cijelo pravilo je jedna rečenica:

> **broj = zbir neurađenih stavki svih podsjetnika čiji je `startTime` prošao**

Iz toga slijedi sve, bez ijednog posebnog slučaja:

| Kada | Šta stoji na ikonici |
|---|---|
| 00:00–07:59 | ništa — nijedan podsjetnik još nije nastupio, dan je čist |
| 08:00–18:59 | koliko je ostalo **dnevnih** |
| petkom od 08:00 | dnevne **+ petačke** (i petački podsjetnik je nastupio) |
| od 19:00 | dnevne **+ večernje** — dva broja se saberu |
| sve urađeno | ništa, krug nestaje |

Gleda se **samo početak** prozora, nikad kraj. Petački podsjetnik prestaje
zvoniti u 12:59, a dnevni u ponoć — ali neurađeno neurađeno ostaje: kraj
prozora gasi **obavijesti**, ne broj. Nepročitano se tako gomila do kraja
dana.

Ne gledaju se ni `requires` ni `quietFor`. Oni postoje da se dvije obavijesti
ne poklope u istoj minuti; broj je jedan jedini, pa se nema šta poklopiti.

Satnica se čita iz `notification-tasks.js`, iz **istog** spiska po kojem stižu
obavijesti — pomjeri `startTime` i broj na ikonici se pomjeri zajedno sa
podsjetnikom.

### Svaki dan je nov brojač

Ništa se ne prenosi u sutra. Ostane li večeras pet dova neurađeno, sutra se
**ne** broji 5 + današnje nego se kreće od nule.

To nije poseban korak koji nekad može izostati — broj se **uvijek** računa iz
spiska tog dana, a spisak u ponoć postaje nov i prazan. Na serveru je to
`items:<ime>:<datum>` (svaki dan svoj ključ), u aplikaciji `state` vezan za
`dateKey`. Zbrajanja kroz dane nema jer ne postoji ništa što bi se zbrajalo.

Ostaje samo pitanje **kada** ikonica to primijeti, a to zavisi od toga šta u
tom trenutku uopšte radi:

| Situacija u ponoć | Kad se krug ugasi |
|---|---|
| aplikacija otvorena (i u pozadini) | u ponoć, najkasnije 30 s poslije — `script.js` otvori nov dan satom, ne samo pri povratku |
| aplikacija otvorena, niko je ne dira | u ponoć — `badge.js` odbaci jučerašnje brojke i sam očisti krug |
| aplikacija zatvorena, pa otvorena ujutro | u trenutku otvaranja |
| aplikacija zatvorena cijelu noć | **tek prvom jutarnjom obavijesti (08:00)** |

Zadnji red je jedina rupa i **ne može se zatvoriti**: dok aplikacija ne radi,
ikonicu može dirnuti samo push, a push bez vidljive obavijesti nije dozvoljen
(`userVisibleOnly`). Budilnik u ponoć samo da se očisti brojka bio bi gori od
zastarjelog broja.

Uz broj zato ide i **dan za koji je izbrojan** (`badgeDan` u push poruci,
`osvjezi(grupe, dan)` u aplikaciji). Push ima TTL od 55 minuta i APNs ga zna
isporučiti sa zakašnjenjem — onaj poslan u 23:00 može stići u 00:20. Takva
poruka ikonicu **čisti** umjesto da na nju prenese jučerašnji broj; nula je u
tom trenutku tačan odgovor, jer novi dan počinje prazan.

### Tri mjesta, jedno pravilo

Broj mora biti tačan i kad aplikacija radi i kad je zatvorena, a to su dva
različita svijeta:

| Ko postavlja | Kada | Odakle mu broj |
|---|---|---|
| `badge.js` | dok je aplikacija otvorena | `script.js` mu javi iste grupe iz kojih se crtaju trake napretka |
| `service-worker.js` | kad stigne push | polja `badge` i `badgeDan` u push poruci |
| `api/_lib.js` (`badgeCount()`) | pri svakom ciklusu crona | spisak čekiranog TOG korisnika iz Redisa |

Zato broj na ikonici nikad ne može reći nešto drugo od onoga što na trakama
u headeru piše kao neurađeno — to nisu dva računa nego jedan.

Broj ide **uz obavijest**, a ne posebnim pushem: `userVisibleOnly` traži
vidljiv odgovor na svaki push, pa "tihi push samo da se osvježi brojka" nije
opcija. Ovako brojka stiže besplatno, uz podsjetnik koji ionako ide.

Posljedica toga je gornja tabela — dok aplikacija ne radi, sve ovisi o
sljedećem pushu. Uz to: `npm run test-push` **ne** šalje `badge`, pa proba
izgleda obavijesti ne može ostaviti izmišljen broj za sobom.

Otvorena aplikacija osvježava broj i sama od sebe, jednom u minuti i pri
svakom povratku u aplikaciju — inače u 19:00 večernje ne bi ušle u zbir dok
se nešto ne dodirne, a u ponoć krug ne bi nestao dok se nešto ne dodirne.

### Kako se provjerava

Testni panel (samo localhost) uz svaki ispis pokazuje red **ikonica**: broj
koji bi u tom odglumljenom trenutku stajao na ikonici. Isto vraća i `curl`:

```bash
curl -H "x-cron-secret: $CRON_SECRET" "localhost:3000/api/cron?dry=1&at=19:00" | jq '.users'
```

---

## 4. Kako se stanje dijeli kroz uređaje

Telefon i računar rade nad **istim** spiskom čekiranog. Server je izvor
istine, a `localStorage` (`moj-zikr-state`) ostaje offline keš — aplikacija
radi i bez interneta, samo se tada ne vidi šta je urađeno na drugom uređaju.

Prostor određuje **ime iz configa** (vidi 4b). Ključ u bazi je
`items:<ime>:<datum>`, Redis HASH oblika `itemId -> "1"`. Svi uređaji sa
istim imenom vide isti spisak; dva imena su dva odvojena spiska. Odčekirano
se **briše** iz hash-a, pa "nema polja" i "nije urađeno" znače isto. Kur'an
nije stavka liste nego zaseban boolean u aplikaciji, a gore se pamti kao
obično polje `quran`.

Ime putuje u zaglavlju `X-Zikr-User`, ne u query stringu — tako ne završi u
logovima servera. Bez imena `/api/state` vraća 400 i aplikacija ostaje na
lokalnom spisku; to je namjerno strože nego pad na neki podrazumijevani
prostor, jer bi upis u tuđi spisak zbog izostalog zaglavlja bio tiha greška.

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

## 4b. Config korisnika

Zupčanik u headeru otvara drawer sa dna (`settings.js`):

| | polje u configu | šta radi |
|---|---|---|
| **Ime** | *(samo localStorage)* | određuje čiji je spisak. Isto ime na dva uređaja = jedan spisak. |
| **Transkripcija** | `transkript` | umjesto arapskog teksta prikazuje transliteraciju iz `data.js`. Zamjena, ne dodatak — prevod ostaje ispod. |
| **Šta se prikazuje** | `skriveno` | kvačica po stavci, u akordeonu po sekciji, plus prekidač za cijelu sekciju u zaglavlju akordeona. Isključena dova nestaje i sa ekrana i iz računa podsjetnika. |
| **Uredi stavku** | `izmjene` | **svaka** stavka, i ona iz `data.js`: naslov, tekstovi, izvor, broj ponavljanja. |
| **Stranica dnevno** | `stranice` | koliko se stranica mushafa uči u jednom danu (1–20) — iza olovke na kur'anskoj stavci. |
| **Vlastite stavke** | `dodatno` | svoja dova ili svoj zikr, u bilo koju sekciju osim kur'anske, bez deploya. |
| **Redoslijed** | `redoslijed` | red se povuče i spusti gdje treba; poredak vrijedi i na ekranu, i u postavkama, i u numeraciji dova. |

Uz njih je i dugme za podsjetnike (zvono), preseljeno iz glavnog ekrana.

**Sadržaj se sam dovede pred oči.** Rasklopljena sekcija i otvorena forma se
skrolaju u vidno polje (`skrolujDo()`) — sekcija zaglavljem na vrh, forma
cijela ako stane. Bez toga se akordeon na dnu drawer-a otvori ispod ruba i
izgleda kao da se ništa nije desilo. Ne `scrollIntoView()`: ono skrola najbliži
okvir koji se skrola — a to zna biti i stranica ispod drawer-a — i pomjeri i
kad je element ionako na ekranu.

Config se čuva pod `cfg:<ime>` i dijeli kroz uređaje istog korisnika, isto
kao i čekirano.

**Čišćenje configa je u `data.js` (`cleanPrefs()`), na jednom mjestu.** Kroz
njega prolazi i ono što browser upiše u localStorage i ono što server primi u
tijelu zahtjeva — `settings.js` i `api/_lib.js` ga samo pozovu. Prije je isto
pravilo stajalo prepisano na oba mjesta; od kad config nosi i sadržaj (svoje
dove), razlika između ta dva sita ne bi bila kozmetička nego bi značila da
stavka postoji na ekranu a ne postoji u računu podsjetnika.

**Isključene stavke.** Config nosi polje `skriveno` — spisak id-eva — i vodi
se kao spisak **isključenih**, a ne prikazanih: podrazumijevano je "sve se
vidi", pa nova dova u `data.js` sama uđe u spisak i ne treba je dopisivati u
ničiji config. Filtriranje radi isti `sectionsForDate()` kroz koji prolaze i
ekran i scheduler, pa **isključena dova mijenja i slanje, ne samo ekran**: ne
ulazi u `total`, a sekcija kojoj je isključeno sve ispada cijela — njen
podsjetnik onda ima `total = 0`, status `done` i ćuti. Petkom time pada i
zaklon `quietFor`, pa dnevni kreće u 08:00 kao svaki drugi dan. Sve to bez
ijednog posebnog pravila, samo iz brojanja.

Numeraciju dova daje `itemTitles()` i ide preko **cijelog** spiska sekcije, ne
preko prikazanog — zato "DOVA #7" ostane #7 kad se neka iznad nje isključi, a
u spisku se vidi rupa. Bez toga se ista dova u postavkama i na ekranu ne bi
zvala isto. Broj je pri tom **mjesto u spisku, a ne ime dove**: povučena na
vrh, ista dova postane "DOVA #1" — i u postavkama i na ekranu, jer oboje ide
kroz isti `fullSections()`.

**Prekidač sekcije ima tri položaja** i **ne pamti ništa** — stanje uvijek
izvodi iz kvačica ispod sebe:

| kvačice | prekidač | izgled |
|---|---|---|
| sve uključene | upaljen | zeleno |
| nešto isključeno | na pola (`indeterminate`) | zlatna traka, zlatna brojka |
| sve isključene | ugašen | sivo, prigušen naslov |

Klik na nepun prekidač pali sve, klik na pun gasi sve. Zato u configu nema
polja za sekciju: jedini zapis je `skriveno`, pa se prekidač i kvačice ne mogu
razići. (Nekad je postojao pravi prekidač za sekciju — polje `optional` u
`data.js` i `petak: false` u configu. Uklonjen je jer je isto radio dvaput;
stari zapis otpada u `cleanPrefs()` kao svako nepoznato polje.)

**Normalizacija imena.** `Haris`, `haris `, `HARIS` → isti ključ `haris`.
Naša slova se svode na ASCII (`č/ć→c`, `ž→z`, `š→s`, `đ→d`), pa se spisak
nađe i kad se kuca bez kvačica; posljedica je da su `Đenan` i `Denan` isti
korisnik. Isto pravilo stoji u `settings.js` (`kljuc`) i u `api/_lib.js`
(`userKey`) — klijent normalizuje jer HTTP zaglavlje ne prima naša slova, a
server normalizuje još jednom, što nad već sređenim ključem ništa ne mijenja.

> **Ime nije lozinka.** Nema logina; ko upiše tuđe ime, vidi tuđi spisak. To
> je i smisao — drugi telefon iste osobe se prijavi istim imenom i odmah je
> uparen. Za porodičnu aplikaciju je dovoljno, ali se ne treba oslanjati na
> to da sadržaj iko ne može vidjeti.

`known` u odgovoru `/api/prefs` kaže je li ime već postojalo prije tog
poziva, pa aplikacija ispiše "novo ime — kreće čist spisak" ili "ime već
postoji — spojen si na njegov spisak". Spisak svih imena se ne vraća nikad.

`ZIKR_SPACE` više nije prostor svih uređaja nego samo **zatečeni**: pretplata
napravljena prije configa nema ime uz sebe, pa je scheduler vodi tamo dok se
aplikacija na tom uređaju ne otvori i ne javi ime (`notifications.js` to radi
sam, pri prvom otvaranju).

### Brojana stavka — brojanje se ne gubi

Zikr sa `repetitions` se ne označava jednim klikom nego se **izbroji**: svaki
klik po kartici je jedno ponavljanje, brojka i traka se pune, a kvačica padne
sama na tridesetom. Nedovršeno brojanje je lokalno (`counts` u localStorage-u)
i ne ide na server — tamo svaka vrijednost znači „urađeno", pa bi upisano `12`
na drugom telefonu izgledalo kao završen zikr.

**Odčekiravanje ne briše brojanje.** Ko je izbrojao trideset salavata pa
omaškom dodirnuo karticu, sljedećim klikom vraća kvačicu — brojka je ostala
puna (`30 / 30`, zelena pilula i bez kvačice). Isto vrijedi i kad kvačica
stigne sa drugog uređaja: `applyRemoteState()` tada postavi brojku na cilj
umjesto da je obriše.

Novo brojanje od nule traži se **držanjem prsta na brojci** (~0,5 s). Nije ni
na jednom kratkom kliku namjerno: i klik po kartici i klik po brojci već znače
„još jedno ponavljanje", pa bi se treći kratki gest na istoj kartici pogađao.

### Redovi spiska su svi isti

Nema dvije vrste reda. Stavka iz `data.js` i vlastita stavka izgledaju i rade
isto:

```
⠿  [✓]  Naslov                        30×   ✎
        detalj (prevod dove ili izvor)
```

| dio | šta je |
|---|---|
| ⠿ | znak da se red premješta — vuče se svejedno cijeli red (vidi ispod) |
| kvačica | prikaži / sakrij (`skriveno`) — jedini reverzibilni prekidač |
| detalj | dova: početak prevoda (naslov joj je samo broj); ostalo: izvor |
| oznaka | broj ponavljanja (`30×`) ili dnevna porcija (`3 stranice`) |
| ✎ | sve ostalo: izmjena i brisanje |

Oznaka je **uvijek iste boje**, i na stavci iz `data.js` i na vlastitoj: kaže
koliko, a ne odakle stavka dolazi. (Nekad je bila zlatna kad je stavka dirana,
pa je isti broj na dvije susjedne kartice značio dvije različite stvari.)

Prije je stavka iz `data.js` imala polje za broj pravo u redu, a vlastita
olovku — redovi su tako izgledali kao dvije različite stvari iako stoje jedan
do drugog, a sadržaj dove se nije mogao ni vidjeti ni popraviti.

Kur'anska sekcija je isti takav akordeon sa jednom stavkom; iza njene olovke
je broj stranica umjesto broja ponavljanja.

### Redoslijed (`redoslijed`)

`{ "dove": ["dove-fatiha", "dove-hemm-hazen", ...] }` — po sekciji, spisak
id-eva onim redom kojim ih korisnik hoće vidjeti. Kur'anske sekcije nema: ona
je jedna stavka, pa nema šta prerasporediti.

Spisak **ne mora biti potpun i ne održava se**. Sve čega u njemu nema — nova
dova u `data.js`, tek dodana vlastita stavka — ide iza onoga što jeste, u
zatečenom redoslijedu. Zato nova dova ne traži upis ni u čiji config i ne može
upasti nasumično u sredinu tuđeg poretka.

Poretak se primjenjuje na jednom mjestu, u `withConfig()` — poslije
dopisivanja vlastitih stavki i izmjena, jer i one moraju biti u spisku koji se
reda. Sve dalje ide kroz `fullSections()` odnosno `sectionsForDate()`, pa isti
poredak vrijedi za ekran, postavke, numeraciju dova i podsjetnike.

**Kako se vuče.** Cijeli red, ne samo tačke lijevo — tačke su znak, a razlika
je samo u tome koliko se čeka:

| hvatanje | kad kreće |
|---|---|
| tačke (⠿) | odmah — imaju `touch-action: none`, pa prst na njima ne skrola |
| miš po redu | čim se pređe 5px; kraći pokret je klik po kvačici |
| prst po redu | nakon 260ms držanja u mjestu; pomjeri li se prije toga, to je skrol |
| ↑ / ↓ na tačkama | jedan red gore ili dolje, bez povlačenja |

Ne `draggable="true"`: HTML5 drag&drop na dodir ne radi uopšte, a aplikacija
je prije svega telefonska. Prst i skrol se inače ne mogu razdvojiti — zato
`touch-action: none` stoji samo na tačkama, a ostatak reda skrol zaustavlja
tek kad povlačenje počne (`touchmove` sa `passive: false`, u trenutku kad prst
još stoji pa preglednik skrol nije ni započeo). Klik koji dođe poslije
prevlaka se guta, inače bi svako premještanje usput isključilo tu dovu.

Dok se vuče, redovi se **ne premještaju u DOM-u** nego samo pomjeraju
`transform`-om: mjere uzete na početku ostaju važeće do kraja, animacija ide
na GPU, a kvačice i fokus ne odlete pod rukom. Prst u rubu spiska ga skrola
sam, pa se dova iz sredine spiska od 34 reda može dovući na vrh. U DOM se
upisuje tek na kraju, ponovnim crtanjem spiska — jer se sa poretkom mijenja i
numeracija dova.

**„Vrati zadani redoslijed“** stoji u podnožju sekcije dok ima šta vratiti,
kao i „Vrati na zadano“ u formi: spisak od 34 dove se ne vraća red po red.

### Uređivanje stavke (`izmjene`)

`{ "zikr-salavat-50": { "repetitions": 100 } }` — izmjene stavki **iz
`data.js`**. Forma se otvara **popunjena pravim sadržajem** (arapski,
transkripcija, prevod, izvor, broj), pa se dova popravlja u mjestu.

Pamti se **samo ono što se razlikuje** od zatečenog. To nije štednja nego
jedini način da ispravka u `data.js` i dalje stigne do korisnika koji je toj
dovi promijenio samo broj ponavljanja — netaknuto polje nema svoj zapis, pa
uvijek dolazi iz fajla.

Prazno polje znači „obriši mi ovaj dio" (npr. izvor) i pamti se kao prazan
string. Put nazad je dugme **„Vrati na zadano"**, koje postoji samo dok ima
šta vratiti.

Brojevi se ne kucaju nego **povlače**: klizač plus kutija uz njega. Klizačem
se do tačno 33 na telefonu ne stiže iz prve, a kutija sama ne govori koliko je
to u odnosu na uobičajeno. Gornja granica klizača je 100; kutija prima i više
(do 999) i klizaču tada podigne granicu, pa se već upisana veća vrijednost ne
kljašti.

`repetitions: 1` znači „bez brojača" — jedno ponavljanje i nije brojanje.

**Brisanje** (korpa lijevo u formi, odvojena od „Odustani“ i „Sačuvaj“ da se
ne promaši). Vlastita stavka nestaje zauvijek. Stavka iz `data.js` se skida
sa spiska (`skriveno`) i gube joj se izmjene — obrisati je zauvijek nije
moguće jer nije korisnikova, pa forma to i kaže umjesto da se pravi da jeste.
Kvačica pored nje je vraća, i to zatečenu, a ne ono što je nekad promijenio
pa obrisao.

`izmjene` važi **samo** za stavke iz `data.js`. Vlastita stavka svoj sadržaj
nosi u `dodatno`, pa bi zapis na dva mjesta značio dva izvora istine za istu
karticu.

### Vlastite stavke (`dodatno`)

Spisak zapisa oblika `{ id, sekcija, type, ... }`. `id` je uvijek
`custom-` + 4–32 mala slova i cifre (`CUSTOM_ITEM_ID` u `data.js`), pa se ne
može sudariti sa id-em iz `data.js`. Tri oblika:

| tip u formi | zapis | kartica na ekranu |
|---|---|---|
| Zikr sa brojem | `type: "count"`, `repetitions: n` | naslov + brojač koji se izbroji klikovima |
| Dova | `type: "dua"`, `arabic`, `transliteration`, `translation`, `source` | kao svaka dova; numeriše se zajedno sa ostalima ("DOVA #35") |
| Stavka | `type: "count"`, bez `repetitions` | samo naslov i kvačica (kao *Higijena* petkom) |

Sve dalje **ne zna** da je stavka korisnikova: `sectionsForDate()` je vrati
kao i svaku drugu, pa ulazi u trake napretka, u završni ekran i u račun
podsjetnika. Kur'anska sekcija je jedini izuzetak — ona nema `items` (jedna je
stavka), pa se u nju ne može dopisati.

Server prima kvačicu na vlastitoj stavci tako što `validItemId()` pušta id po
**obliku**, a ne po spisku iz `data.js`. Config korisnika se pri upisu kvačice
time ne mora čitati; stavka koju je u međuvremenu obrisao svejedno otpada iz
računa, jer je nema u `sectionsForDate()`.

### Dnevna porcija mushafa (`stranice`)

`stranice: 3` znači da dan nosi tri stranice umjesto jedne: prva se računa
kao i dosad (`start + dana × stranica`), ostale su one koje slijede. Kartica
tada piše *Stranice 101–103*, a „Vidi stranice" otvara sve tri, razdvojene
oznakom stranice.

Cijela porcija je i dalje **jedna stavka sa jednom kvačicom** — polje u bazi
ostaje `quran`, pa se na serveru ne mijenja ništa.

U postavkama je kur'anska sekcija akordeon kao i svaka druga, sa jednom
stavkom u sebi; broj stranica se podešava iza njene olovke, klizačem 1–20.

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

`endTime` zaustavlja podsjetnike navečer da telefon ne zvoni usred noći.
Vrijednost `"00:00"` znači ponoć na **kraju** dana, pa je uz interval od
sat vremena zadnji podsjetnik u 23:00; poslije ponoći je novi datum i
ciklus svakako kreće od nule. Bez `endTime` default je 22:00.

Oba podsjetnika idu do ponoći (`"00:00"`). Dnevni namjerno ne staje u 21:00:
dok nije završen, večernji je zaklonjen, pa bi poslije 21:00 nastupila tišina
baš kad je najviše ostalo neurađeno.

### Petak

Petkom do podneva stiže **samo** petački podsjetnik — dnevni tog dana ćuti dok
petački traje, pa telefon nikad ne javi dvaput za isto.

**Kad se petačke stavke ne urade do podneva** (`petak` je `none` ili
`partial`):

| Vrijeme | Šta stiže |
|---|---|
| 08:00 | `petak` slot 0 — *„Petak je! Nemoj zaboraviti zikr."* |
| 09:00 – 11:00 | `petak` slot 1, 2, 3 — djelimično urađen: *„Petak je! Nastavi sa zikrom."* |
| 12:00 | `petak` slot 4 — **zadnji petački** |
| 12:01–12:59 | tišina |
| 13:00 | `dan` slot 5 — *„Vrijeme je za dnevni zikr."* |
| 14:00 … 23:00 | `dan` slot 6 … 15, pa `navecer` po starim pravilima |

**Kad se petačke stavke završe prije 12:00**, zaklon pada **odmah** i dnevni
nastavlja kao svaki drugi dan — dakle satni ritam od 08:00, pa `navecer` po
starom. Djelimično urađen petak zaklon **ne** skida.

Dva polja u konfiguraciji drže to na mjestu:

- **`petak` ima `endTime: "12:59"`, ne `"12:00"`.** Uz interval od sat vremena
  je 12:00–12:59 **jedan slot** (4), pa se može poslati samo jednom i najranije
  u 12:00 — „zadnja u 12:00" i dalje vrijedi. Da tu stoji `"12:00"`, cron koji
  se pokrene u 12:03 vidio bi `minutes > end` i zadnja petačka obavijest bi se
  **tiho izgubila** (isto pravilo po kojem podsjetnik za 07:00 stiže u 07:32
  kad cron zakasni).
- **`dan` ima `quietFor: ["petak"]`.** Ćuti dok petački ima otvoren prozor
  **i** dok nije završen. Granica nije prepisana nigdje — čita se iz
  `endTime`-a petačkog, pa „12:59" postoji na jednom mjestu.

Zato dvije obavijesti ne mogu stići jedna do druge: dnevni šalje samo kad
petački ćuti (završen je) ili kad mu je prozor prošao, a u oba slučaja
petački ne šalje ništa.

`quietFor` i `requires` su namjerno **dva** pojma:

| | Uslov | Kad pada |
|---|---|---|
| `requires` (večernji ← dnevni) | samo sadržaj | kad onaj drugi bude završen, pa makar u 23:00 |
| `quietFor` (dnevni ← petak) | sadržaj **i** sat | kad onaj drugi bude završen **ili** kad mu prozor prođe |

> Zašto dnevnom ne stoji samo `requires: ["petak"]`: `blockedBy()` nema
> vremensku komponentu, pa bi djelimično urađen petak ugasio dnevni **cijeli
> dan**.
>
> A zašto ni „petkom pomjeri `startTime` na 13:00": start se ne smije mijenjati
> unutar dana. Slot se računa od njega (`floor((sada − start) / interval)`), pa
> kad bi start zavisio od toga je li petak završen, odčekiravanje jedne stavke
> u 11:30 dalo bi manji slot od već zapisanog, `last >= slot` bi se poklopio i
> dnevni bi zanijemio **do sutra**. `quietFor` taj problem ne može imati jer
> start ostaje 08:00 cijeli dan.

## 6. Kako server zna dokle je zadatak stigao

Server sam prebroji, iz zajedničkog spiska čekiranog i iz sekcija u
`data.js` (isti fajl koji vidi i aplikacija — `taskStatus()` u `_lib.js`).
Broje se **sekcije koje tog dana postoje** (`sectionsForDate(datum)`), pa
petačke stavke ulaze u račun samo petkom. Validacija upisa je namjerno
**dan-neovisna** (`validItemId` zna sve id-eve iz `data.js`): kvačica
napravljena u petak u 23:58 a poslana u subotu u 00:03 mora proći.
Nema slanja "gotovo/nije" sa uređaja, pa ne može doći do razilaženja između
onoga što je uređaj stigao javiti i onoga što stvarno stoji u bazi.

Tri ishoda po podsjetniku:

| Koliko je čekirano | Status | Šta stiže |
|---|---|---|
| ništa | `none` | `message` — *"Vrijeme je za dnevni zikr."* |
| nešto, ali ne sve | `partial` | `messagePartial` — *"Nastavi sa zikrom."* |
| sve | `done` | ništa do sutra |

Petački podsjetnik ima ista tri ishoda:

| Koliko je od sekcije *Petak* čekirano | Šta stiže |
|---|---|
| ništa | *„Petak je! Nemoj zaboraviti zikr."* |
| nešto, ali ne sve | *„Petak je! Nastavi sa zikrom."* |
| sve | ništa do sutra |

Sekcija *Petak* **ne ulazi** u dnevni podsjetnik: `dan` ima
`exceptSections: ["navecer", "petak"]`, jer obje te sekcije imaju svoj
podsjetnik. Da se petačke stavke broje i u dnevnom, pet čekiranih petačkih
stavki i ni jedna dnevna dale bi status `partial` i tekst *„Nastavi sa
zikrom."* — a dnevni zikr tada nije ni započet. Ovako *počni/nastavi* prati
samo dnevni dio:

| Petak | Dnevni zikr | `dan` šalje |
|---|---|---|
| sve urađeno | ništa | *„Vrijeme je za dnevni zikr."* |
| sve urađeno | započet | *„Nastavi sa zikrom."* |
| ništa urađeno | sve urađeno | ćuti — i `navecer` više nije zaklonjen |

Cijena je svjesna: neurađene petačke stavke poslije 12:59 nemaju podsjetnika.
To je i bila namjera — petački podsjetnik staje u 12:00. Prsten i završni ekran
i dalje broje **sve** što je tog dana na ekranu (petkom 55 stavki), pa dan nije
100% dok i petačke stavke nisu urađene.

Dnevni i večernji se broje odvojeno, pa završen dan **ne** utišava večernji
podsjetnik. Ali prozori im se poslije 19:00 preklapaju, a **dvije obavijesti
u isto vrijeme nikad ne stižu** — zato `navecer` ima `requires: ["dan"]`:
šalje se samo kad je dnevni u cijelosti završen. Dok nije, stiže samo
dnevni, a od 19:00 sa tekstom (`messageLate`) koji pokriva oboje:

| Stanje danas | do 19:00 | od 19:00 |
|---|---|---|
| ništa čekirano | `dan` — "Vrijeme je za dnevni zikr." | `dan` — "Nemoj zaboraviti proučiti zikr." |
| jedna dova iz *Dove* | `dan` — "Nastavi sa zikrom." | `dan` — "Nastavi sa zikrom." |
| samo jedna navečer | `dan` — "Vrijeme je za dnevni zikr." | `dan` — "Nemoj zaboraviti proučiti zikr." |
| sve osim *Navečer* | — | `navecer` — "Vrijeme je za vecernji zikr." |
| sve osim *Navečer* + jedna navečer | — | `navecer` — "Nastavi sa zikrom." |
| sve | — | — |

"Nastavi" ima prednost nad `messageLate` — kad je zikr već započet, to je
korisnija napomena od "nemoj zaboraviti".

Zaklonjenom podsjetniku se slot **ne** zapisuje, pa stigne prvim ciklusom
nakon što se zaklon skine: završi dnevni u 22:30 i večernji dolazi odmah, ne
sutra. U izvještaju `/api/cron` to stoji u polju `blocked`.

Oba prozora idu do ponoći, dakle zadnja obavijest u danu je u 23:00 — bez
obzira koja od njih je na redu.

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

### Testni panel u aplikaciji (najlakši put)

```bash
npm install
npm run dev
```

Otvori `http://localhost:3000` — dolje lijevo stoji dugme **PROBA**. Panel je
jedino mjesto sa kojeg se provjerava ono što se inače ne može bez čekanja:

| Kontrola | Šta radi |
|---|---|
| **Dan** `‹ ›`, *danas*, *prvi petak* | mijenja dan koji **aplikacija prikazuje** — tako se petačka sekcija vidi bez čekanja petka |
| **Vrijeme** (08:00 … 23:00 ili ručno) | vrijeme koje se **glumi serveru** pri okidanju |
| **Interval** 60 / 1 min | 60 = kao u produkciji, 1 = svaka minuta je nov slot |
| **resetuj „poslano"** | uključeno: svaki okidač je nezavisan (pokazuje *prozor*). isključeno: pravi niz kroz dan (12:00 pošalje, 12:15 ćuti jer je slot 4 već poslan) |
| **Okini — pošalji** | zove pravi `/api/cron` — obavijest stvarno stigne |
| **samo pokaži** | isto, ali bez slanja i bez upisa (`dry=1`) |

Ispod se ispiše šta je server odlučio: koji podsjetnik, **tačan naslov i
tekst**, pa prozori i status po podsjetniku i šta je koga zaklonilo. Panel
ništa ne odlučuje sam — samo prikazuje izvještaj `/api/cron`, pa ne može
pokazati jedno a produkcija uraditi drugo.

**Recept za petak:** *prvi petak* → interval **60** → resetuj **isključi** →
okidaj redom 08:00, 09:00, 12:00, 12:15, 13:00, 14:00. Očekivano: četiri
petačke, zadnja u 12:00, tišina u 12:15, dnevni od 13:00.

Kad se gleda dan koji nije današnji, na vrhu stoji žuta traka *„proba"*:
kvačice tog dana idu u **odvojen lokalni prostor** (`moj-zikr-proba`), ne
dijele se sa serverom i ne diraju stvarni spisak.

> **Panel ne postoji nigdje osim na localhostu.** `script.js` ga učitava samo
> kad je hostname `localhost`/`127.0.0.1`, sam fajl se ne deployuje
> (`.vercelignore`), a server otvara `/api/cron` bez `CRON_SECRET`-a samo kad
> se poklope **dvije nezavisne** stvari: `REMINDER_TIME_TRAVEL=1` u okruženju
> (stavlja se isključivo u `.env.local`) **i** zahtjev sa localhosta
> (`devUnlocked()` u `api/_lib.js`). Na Vercelu ni jedno ne vrijedi.

### Cijeli dan na papiru

```bash
npm run raspored                     # petak, ništa čekirano
npm run raspored -- petak petak-dio  # jedna petačka stavka urađena
npm run raspored -- četvrtak
npm run raspored -- petak sve        # sve čekirano -> tišina
```

Ispiše svaku minutu u kojoj bi obavijest otišla i sa kojim tekstom, zovući
**isti** `dueSlot()`/`taskStatus()`/`pushPayload()` koji odlučuje u produkciji
— bez baze, bez mreže, bez pretplate. Uz to provjeri i četiri pravila kroz
7 dana × 4 obrasca crona (na pun sat, pomjeren na `:07`, svake minute, i
ispad od 3h) i vrati izlazni kod 1 ako nešto padne:

1. najviše **jedan** podsjetnik po ciklusu — nikad dva bannera jedan do drugog
2. `petak` samo petkom, najviše 5 puta, zadnji slot ne prije 12:00
3. petkom u 12:01–12:59 ne kreće **nijedan** novi podsjetnik
4. `dan` petkom 13:00–23:00, ostalim danima 08:00–23:00

Vrijedi pokrenuti prije deploya.

### Ručno, curl-om

`dev-server.js` servira i statične fajlove i
`/api/*`, a bez `KV_REST_API_*` varijabli baza pada na `.dev-store.json`
(fajl u projektu). Otvaranje `index.html` duplim klikom ili preko običnog
static servera **ne radi** — tamo `/api/` ne postoji, pa dugme javi
"Backend nije dostupan" ili "Nema veze sa serverom".

Scheduler se okida ručno:

```bash
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron
```

Uz `REMINDER_TIME_TRAVEL=1` (samo lokalno) endpoint prima i izmišljen trenutak
— isto što panel koristi:

```bash
# cijeli petak na papiru, bez slanja i bez upisa
curl "http://localhost:3000/api/cron?dry=1&date=2026-08-21&at=12:00&interval=60&reset=1"

# pravo slanje kao da je petak 12:00
curl "http://localhost:3000/api/cron?date=2026-08-21&at=12:00&interval=60&reset=1"
```

| Parametar | Šta radi |
|---|---|
| `dry=1` | ne šalji i ne upisuj, samo javi šta bi bilo (radi i u produkciji) |
| `date=`, `at=` | glumi dan i vrijeme po Sarajevu |
| `interval=` | nametni interval za taj poziv (bez njega vrijedi `REMINDER_INTERVAL_MINUTES`) |
| `reset=1` | gledaj dan kao da još ništa nije poslano |

`quiet` u izvještaju kaže koji podsjetnik trenutno ćuti zbog kojeg
(`"dan ← petak"`), a `blocked` koji čeka da drugi bude završen.

`REMINDER_START_TIME` **nije** za petačke granice: pomjera start *svim*
zadacima, pa petak i dan padnu u isti ciklus i upravo pravilo „nikad dvije
obavijesti" postane neprovjerljivo. Za granice služe panel i `npm run raspored`.

Push sa `localhost` radi u Chromeu (localhost se računa kao siguran
kontekst). Za pravi test na iPhoneu treba HTTPS, dakle deploy.

**Lokalno sa Vercel CLI-jem** (ako želiš okruženje identično produkciji):

```bash
npm install -g vercel && vercel link && vercel dev
```

Odgovor je izvještaj o tome šta se desilo:

```json
{ "date": "2026-08-17", "minutes": 754, "interval": 1,
  "devices": 1, "status": { "dan": "none", "navecer": "none" },
  "sent": [{ "device": "a1b2c3d4", "task": "dan", "slot": 12,
             "status": "none", "late": false }],
  "blocked": ["navecer ← dan"],
  "removed": [], "errors": [] }
```

Provjera redom:

1. Pozovi endpoint dvaput zaredom → drugi put je `sent` prazan (nema duplikata).
2. Sačekaj minutu i pozovi opet → stižu nove obavijesti (novi slot).
3. Čekiraj **jednu** stavku sekcije *Zikr* u aplikaciji.
4. Pozovi opet → `dan` sad dolazi sa tekstom "Nastavi sa zikrom.", a
   `navecer` je u `blocked` — obavijest je i dalje samo jedna.
5. Čekiraj **sve** iz *Kur'an*, *Zikr* i *Dove* → `dan` ćuti, `navecer`
   prestaje biti `blocked` i stiže istim pozivom.
6. Čekiraj sve iz *Navečer* → ćuti i on.
7. Dijeljenje: otvori aplikaciju u drugom browseru (ili incognito prozoru),
   čekiraj nešto tamo i vrati se u prvi — checkmark je i tu.
8. Aktivna sesija: dok radiš u prozoru aplikacije, ručno okidanje crona ne
   smije dati obavijest. Klikni na drugi program (prozor ostaje vidljiv,
   ali više nije fokusiran) pa okini opet — obavijest stiže.

9. Petak: u panelu *prvi petak*, interval 60, resetuj isključeno — pa okidaj
   08:00, 12:00, 12:15, 13:00. Treba: petačka, petačka, tišina, dnevna.
10. Ostali dani: isto za četvrtak — petačke sekcije nema, `dan` kreće u 08:00
    kao i prije.

Na kraju vrati `REMINDER_INTERVAL_MINUTES=60` i obriši `REMINDER_START_TIME`.
`REMINDER_TIME_TRAVEL=1` smije ostati u `.env.local` — na Vercel ga ne
stavljati.

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

  (To `badge` polje je slika u obavijesti i **nema veze** sa brojem na
  ikonici aplikacije iz odjeljka 3b — tamo je riječ o Badging API-ju
  `navigator.setAppBadge()`, koji je nešto sasvim drugo.)
- **Broj na ikonici** (`navigator.setAppBadge()`) na iOS-u traži dvoje: da je
  aplikacija dodana na početni ekran **i** da su obavijesti dozvoljene. Bez
  dozvole poziv tiho propada, pa ko ne želi obavijesti neće imati ni broj —
  ostatak aplikacije radi kao i prije. Firefox Badging API još nema.
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

Umjesto `sections` može stajati `exceptSections: ["navecer", "petak"]` — tada
podsjetnik pokriva **sve** sekcije osim navedenih, pa nova sekcija u
`data.js` sama ulazi u njega i ne može se zaboraviti dopisati. Tako je
napisan dnevni podsjetnik; izuzete su mu upravo one dvije sekcije koje imaju
svoj podsjetnik.

Podsjetnik ćuti tek kad je **sve** iz njegovih sekcija čekirano; dok je
započet, mijenja mu se samo tekst (`messagePartial`). `messagePartial` je
opciono — bez njega se i u tom slučaju šalje `message`. Ništa drugo se ne
dira — ni API, ni scheduler, ni frontend.

Za podsjetnik koji vrijedi samo nekim danima:

```js
days: [5]        // 0 = nedjelja … 5 = petak; ostalim danima ćuti
```

A da jedan podsjetnik utiša drugog **dok traje**:

```js
quietFor: ["petak"]   // ćuti dok petački ima prozor i nije završen
```

Zaklon pada sam — kad se onaj drugi završi ili kad mu prozor (`endTime`) prođe.
Nijedno vrijeme se ne prepisuje. Za zaklon **bez roka** (čekaj da onaj drugi
bude završen, pa makar do ponoći) služi `requires`.

Dva upozorenja:

- **`exceptSections` automatski uvlači svaku novu sekciju u `dan`.** Dvije
  posljedice:
  1. Sekcija koja ima **svoj** podsjetnik mora biti u `exceptSections` (tako su
     tamo i `navecer` i `petak`), inače se ista stavka broji u dva računa i
     tekst *počni/nastavi* laže — dnevni bi rekao „Nastavi" zbog tuđih kvačica.
  2. Za sekciju vezanu za dan sedmice je i filtriranje po danu obavezno — zato
     `sectionsFor()` gleda `sectionsForDate(datum)`. Bez toga `dan` nikad ne bi
     bio „done", zvonio bi do 23:00 svaki dan, a `navecer` (`requires:
     ["dan"]`) ne bi stigao nikad.
- **Podsjetnik sa prozorom prije 13:00 petkom** mora dobiti `days` ili
  `quietFor: ["petak"]`, inače se petkom poklopi sa petačkim.

Ako se prozor novog podsjetnika preklapa sa nekim postojećim, dodaj mu
`requires: ["id-tog-drugog"]` — tada ćuti dok onaj drugi nije završen, pa
telefon ne zvoni dvaput za isto. A onom drugom, koji ga zaklanja, možeš dati
`messageLate` i `titleLate` — tekst koji od `startTime`-a zaklonjenog pokriva
oboje, kao što `dan` od 19:00 nosi "Nemoj zaboraviti proučiti zikr.".

`/api/state` prihvata **samo** id-eve stavki koje postoje u `data.js`; sve
ostalo vraća u polju `ignored`.

---

## Dodavanje sekcije koja postoji samo nekim danima

U `data.js` dopiši niz stavki i sekciju sa poljem `days`:

```js
const petak = [
  { id: "petak-salavati-30", title: "Salavati", type: "count", repetitions: 30 },
  …
];

const sections = [
  { id: "petak", title: "Petak", icon: "mosque", kind: "list", items: petak, days: [5] },
  …
];
```

I to je sve. `sectionsForDate()` je jedini selektor „koje sekcije postoje tog
dana" i kroz njega ide **i** aplikacija (`renderSections`, `allItems`,
`updateProgress` — dakle i prsten i završni ekran) **i** server
(`sectionsFor` → `taskStatus`). Ništa drugo se ne dira: ni API, ni scheduler,
ni `style.css`.

Dvije stvari na koje treba pripaziti:

- `icon` mora postojati u registru `ICONS` u `script.js`; ako ne postoji,
  `makeIcon()` vrati `null` i naslov ostane bez ikonice — **tiho**, bez greške.
- Dan sedmice se svugdje izvodi iz **datum-stringa** preko `weekdayFromKey()`
  (`Date.UTC(...).getUTCDay()`), nikad iz `new Date().getDay()` ni
  `new Date("2026-08-21").getDay()` — drugi oblik se parsira kao UTC ponoć pa
  prevede u lokalnu zonu i zapadno od Londona vrati dan ranije.
