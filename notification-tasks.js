/* ==========================================================================
   notification-tasks.js — JEDINI spisak podsjetnika.

   Namjerno je pisan tako da radi i u browseru (<script src=...>) i u
   Vercel serverless funkciji (require), da konfiguracija ne postoji na
   dva mjesta koja se mogu razići.

   Tri podsjetnika, ni jedan više:

     petak    — sekcija "Petak", SAMO petkom, prozor 08:00–12:59
     dan      — Kur'an, Zikr i Dove (sve osim Navečer i Petak — te dvije
                sekcije imaju svoj podsjetnik, pa se ne broje ovdje)
     navecer  — sve što je u sekciji "Navečer"

   Razdvojeni su baš zato da dnevni dio može biti završen a navečer još ne —
   i da podsjetnik za navečer u tom slučaju svejedno stigne.

   PETAK. Petkom do podneva stiže SAMO petački podsjetnik: 08, 09, 10, 11 i
   zadnji u 12:00. Dnevni tog dana ćuti dok petački traje (`quietFor`), pa se
   dvije obavijesti ne mogu poklopiti; prva dnevna je u 13:00.

   Ali zaklon pada u trenutku kad se petačke stavke ZAVRŠE: tada petački
   podsjetnik nema šta više da javi, pa dnevni odmah nastavlja po uobičajenim
   pravilima (prozor mu je i petkom 08:00–00:00, satni ritam kao svaki dan).
   Dok je petak samo djelimično urađen, zaklon stoji i stiže "Petak je!
   Nastavi sa zikrom." — dnevni i dalje čeka.

   Večernji se ne dira; njegov prozor svakako počinje u 19:00.

   NIKAD dvije obavijesti u isto vrijeme. Poslije 19:00 se prozori dnevnog i
   večernjeg preklapaju, pa `navecer` ima `requires: ["dan"]` — večernji
   stiže samo kad je dnevni u cijelosti završen. Dok nije, stiže samo
   dnevni, a od 19:00 sa `messageLate` tekstom koji pokriva oboje.

   Svaki se ponavlja svakih REMINDER_INTERVAL_MINUTES (60 u produkciji =
   jedan na sat, 1 lokalno za testiranje) od startTime do endTime, a tekst
   zavisi od toga koliko je urađeno:

     ništa čekirano   -> `message`         (podsjeti da se počne)
     nešto čekirano   -> `messagePartial`  (podsjeti da se nastavi)
     sve čekirano     -> ne šalje se ništa do sutra

   POLJA:
     id              stabilan ključ; ide u API i u bazu. Server prihvata
                     SAMO id-eve sa ovog spiska — ništa drugo.
     sections        id-evi sekcija iz data.js koje podsjetnik pokriva.
     exceptSections  umjesto `sections`: pokriva SVE sekcije osim navedenih.
                     Tako nova sekcija u data.js sama ulazi u dnevni
                     podsjetnik i ne može se zaboraviti dopisati. Izuzimaju se
                     samo sekcije koje imaju SVOJ podsjetnik — inače bi ista
                     stavka ulazila u dva računa i tekst bi lagao.
     title           naslov notifikacije
     message         tekst kad danas NIJE čekirano ništa iz njegovih sekcija
     messagePartial  tekst kad je nešto čekirano ali nije sve. Opciono; bez
                     njega se i u tom slučaju šalje `message`.
     messageLate     tekst od trenutka kad se otvori prozor podsjetnika koji
                     ovaj zaklanja (onog sa `requires: [ovaj id]`), a ovdje
                     još ništa nije čekirano. Tada je to jedina obavijest,
                     pa tekst pokriva i jedno i drugo. Opciono.
     titleLate       naslov za taj slučaj. Opciono; bez njega ostaje `title`.
     requires        id-evi podsjetnika koji moraju biti "done" da bi se ovaj
                     uopšte poslao. Tako se dva prozora koja se preklapaju
                     nikad ne pretvore u dvije obavijesti. Opciono.
     days            opciono; dani sedmice u kojima podsjetnik postoji
                     (0 = nedjelja … 5 = petak). Ostalim danima ćuti. Isti
                     broj stoji i na sekciji u data.js — tamo gasi prikaz na
                     ekranu, ovdje slanje.
     quietFor        id-evi podsjetnika zbog kojih ovaj ĆUTI dok njihov prozor
                     traje i dok nisu završeni. Za razliku od `requires`, ovo
                     je vremenski ograničeno: kad im prozor prođe (endTime)
                     ILI kad se završe, zaklon pada i ovaj nastavlja normalno.
                     Nijedno vrijeme se ne ponavlja — granica se čita iz
                     endTime-a tog drugog podsjetnika. Opciono.
     startTime       "HH:MM" po Europe/Sarajevo — prije toga se ne šalje
     endTime         "HH:MM" — poslije toga se šuti. "00:00" znači ponoć na
                     KRAJU dana, dakle zadnji podsjetnik je u 23:00.
                     Opciono; ako se izostavi, default je 22:00.
     enabled         opciono; false privremeno gasi taj podsjetnik

   Koliko je urađeno računa server (`taskStatus()` u api/_lib.js), iz istog
   spiska sekcija iz data.js koji vidi i aplikacija. Tako je odluka o slanju
   na jednom mjestu i ne zavisi od toga šta je koji uređaj stigao javiti.
   ========================================================================== */

var NOTIFICATION_TASKS = [
  {
    id: "dan",
    /* Navečer i Petak imaju svoj podsjetnik, pa se ovdje NE broje. Da se
       petačke stavke broje ovdje, pet čekiranih petačkih stavki i ni jedna
       dnevna dalo bi status "partial" i tekst "Nastavi sa zikrom." — a dnevni
       zikr tada nije ni započet. Ovako "počni/nastavi" prati samo dnevni dio.

       Cijena je svjesna: petačke stavke poslije 12:59 nemaju podsjetnika. To
       je i bila namjera — petački podsjetnik staje u 12:00. */
    exceptSections: ["navecer", "petak"],
    title: "Dnevni zikr ☀️",
    message: "Vrijeme je za dnevni zikr.",
    messagePartial: "Nastavi sa zikrom.",
    /* Od 19:00 (kad bi krenuo i večernji) ovo je jedina obavijest, pa
       naslov više nije "dnevni" i tekst ne veže ni za jedno doba dana. */
    titleLate: "Zikr 🤲",
    messageLate: "Nemoj zaboraviti proučiti zikr.",
    /* Petkom dnevni ćuti dok petački podsjetnik traje, pa telefon ne javi
       dvaput za isto. Granica nije prepisana ovdje — čita se iz endTime-a
       petačkog (12:59), pa prva dnevna obavijest padne u 13:00.

       Zaklon pada i ranije, čim su petačke stavke završene: tada petački
       ćuti, pa nema koga zaklanjati i dnevni nastavlja kao svaki drugi dan.
       Djelimično urađen petak zaklon NE skida. */
    quietFor: ["petak"],
    startTime: "08:00",
    /* Do ponoći, a ne do 21:00: dok dnevni nije završen, večernji je
       zaklonjen — da poslije 21:00 ne nastupi tišina baš kad je najviše
       ostalo neurađeno. Zadnji podsjetnik je u 23:00. */
    endTime: "00:00"
  },
  {
    id: "navecer",
    sections: ["navecer"],
    title: "Vecernji Zikr 🌙",
    message: "Vrijeme je za vecernji zikr.",
    messagePartial: "Nastavi sa zikrom.",
    /* Dok dnevni nije završen, večernji ćuti — inače bi poslije 19:00 stigle
       dvije obavijesti jedna do druge. */
    requires: ["dan"],
    startTime: "19:00",
    endTime: "00:00"
  },
  /* Na KRAJ niza namjerno: `npm run test-push` bez argumenta gađa prvi
     zadatak sa spiska, pa podrazumijevani testni push ostaje dnevni. */
  {
    id: "petak",
    sections: ["petak"],
    /* Samo petkom. Prvi sloj zaštite; drugi je taskStatus() — ostalim danima
       sekcije "petak" nema, pa je total 0, status "done" i podsjetnik ćuti i
       bez ovog polja. */
    days: [5],
    title: "Petak 🕌",
    message: "Petak je! Nemoj zaboraviti zikr.",
    messagePartial: "Petak je! Nastavi sa zikrom.",
    /* Bez messageLate/titleLate — ovaj podsjetnik nikog ne zaklanja. */
    startTime: "08:00",
    /* Zadnji petački podsjetnik je onaj od 12:00 i tako i ostaje: 12:00–12:59
       je JEDAN slot, pa se može poslati samo jednom i najranije u 12:00.
       Kraj je 12:59 a NE 12:00 zato što se cron ne pokreće u sekundu u
       sekundu: sa "12:00" bi ciklus u 12:03 vidio `minutes > end` i zadnja
       petačka obavijest bi se tiho izgubila. */
    endTime: "12:59"
  }
];

/* Node (Vercel funkcije) — u browseru `module` ne postoji, pa se preskače. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = NOTIFICATION_TASKS;
}
