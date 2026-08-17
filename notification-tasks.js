/* ==========================================================================
   notification-tasks.js — JEDINI spisak podsjetnika.

   Namjerno je pisan tako da radi i u browseru (<script src=...>) i u
   Vercel serverless funkciji (require), da konfiguracija ne postoji na
   dva mjesta koja se mogu razići.

   Dva podsjetnika, ni jedan više:

     dan      — sve sekcije OSIM navečer (Kur'an, zikr, dove). Stiže dok
                danas nije čekirano ništa odatle; čim je jedna stavka
                čekirana, šuti do sutra.
     navecer  — samo sekcija "Navečer", po istom pravilu.

   Razdvojeni su baš zato da dnevni dio može biti završen a navečer još ne —
   i da podsjetnik za navečer u tom slučaju svejedno stigne.

   Svaki se ponavlja svakih REMINDER_INTERVAL_MINUTES (60 u produkciji =
   jedan na sat, 1 lokalno za testiranje) od startTime do endTime, sve dok
   se ne čekira nešto iz njegovih sekcija.

   POLJA:
     id              stabilan ključ; ide u API i u bazu. Server prihvata
                     SAMO id-eve sa ovog spiska — ništa drugo.
     sections        id-evi sekcija iz data.js koje podsjetnik pokriva.
     exceptSections  umjesto `sections`: pokriva SVE sekcije osim navedenih.
                     Tako nova sekcija u data.js sama ulazi u dnevni
                     podsjetnik i ne može se zaboraviti dopisati.
     title           naslov notifikacije
     message         tekst notifikacije
     startTime       "HH:MM" po Europe/Sarajevo — prije toga se ne šalje
     endTime         "HH:MM" — poslije toga se šuti, da telefon ne zvoni
                     usred noći. Opciono; ako se izostavi, default je 22:00.
     enabled         opciono; false privremeno gasi taj podsjetnik

   Pravilo "gotovo je" računa `computeTasks()` u notifications.js. Server ne
   zna ni jednu dovu — pamti samo boolean po podsjetniku, onaj koji dobije
   na /api/state.
   ========================================================================== */

var NOTIFICATION_TASKS = [
  {
    id: "dan",
    exceptSections: ["navecer"],
    title: "Dnevni zikr ☀️",
    message: "Vrijeme je za dnevni zikr.",
    startTime: "07:00",
    endTime: "21:00"
  },
  {
    id: "navecer",
    sections: ["navecer"],
    title: "Vecernji Zikr 🌙",
    message: "Vrijeme je za vecernji zikr.",
    startTime: "19:00",
    endTime: "23:00"
  }
];

/* Node (Vercel funkcije) — u browseru `module` ne postoji, pa se preskače. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = NOTIFICATION_TASKS;
}
