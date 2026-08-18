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
     startTime       "HH:MM" po Europe/Sarajevo — prije toga se ne šalje
     endTime         "HH:MM" — poslije toga se šuti, da telefon ne zvoni
                     usred noći. Opciono; ako se izostavi, default je 22:00.
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
    startTime: "08:00",
    endTime: "21:00"
  },
  {
    id: "navecer",
    sections: ["navecer"],
    title: "Vecernji Zikr 🌙",
    message: "Vrijeme je za vecernji zikr.",
    messagePartial: "Nastavi sa zikrom.",
    startTime: "19:00",
    endTime: "23:00"
  }
];

/* Node (Vercel funkcije) — u browseru `module` ne postoji, pa se preskače. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = NOTIFICATION_TASKS;
}
