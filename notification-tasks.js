/* ==========================================================================
   notification-tasks.js — JEDINI spisak podsjetnika.

   Namjerno je pisan tako da radi i u browseru (<script src=...>) i u
   Vercel serverless funkciji (require), da konfiguracija ne postoji na
   dva mjesta koja se mogu razići.

   Dva podsjetnika, ni jedan više:

     dan      — sve sekcije OSIM Navečer, dakle Kur'an, Zikr i Dove
     navecer  — sve što je u sekciji "Navečer"

   Razdvojeni su baš zato da dnevni dio može biti završen a navečer još ne —
   i da podsjetnik za navečer u tom slučaju svejedno stigne.

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
                     podsjetnik i ne može se zaboraviti dopisati.
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
    exceptSections: ["navecer"],
    title: "Dnevni zikr ☀️",
    message: "Vrijeme je za dnevni zikr.",
    messagePartial: "Nastavi sa zikrom.",
    /* Od 19:00 (kad bi krenuo i večernji) ovo je jedina obavijest, pa
       naslov više nije "dnevni" i tekst ne veže ni za jedno doba dana. */
    titleLate: "Zikr 🤲",
    messageLate: "Nemoj zaboraviti proučiti zikr.",
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
  }
];

/* Node (Vercel funkcije) — u browseru `module` ne postoji, pa se preskače. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = NOTIFICATION_TASKS;
}
