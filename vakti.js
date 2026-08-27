/* ==========================================================================
   vakti.js — JEDINI spisak vakata.

   Kao i notification-tasks.js, pisan je tako da radi i u browseru
   (<script src=...>) i u Vercel funkciji (require): imena vakata i tekstovi
   obavijesti postoje na jednom mjestu, pa ekran i obavijest ne mogu reći
   dvije stvari.

   REDOSLIJED JE ONAJ IZ API-JA. api.vaktija.ba vraća `vakat` kao niz od šest
   vremena, uvijek istim redom — zora, izlazak sunca, podne, ikindija, akšam,
   jacija. Spisak ispod je taj isti niz, samo sa imenima, pa se vrijeme i ime
   spajaju po indeksu i nigdje se ne prepisuju.

   `namaz: false` je izlazak sunca: stoji na spisku jer ga vaktija ima i jer
   se po njemu zna kad zora ističe, ali za njega ne ide obavijest — nije
   namaz.

   LOKACIJA je Sarajevo (id 77 na api.vaktija.ba). Vaktija se ne računa
   ovdje niti se pomjera po zonama: server vaktije već vraća vremena po
   Sarajevu, a i obavijesti i sat u aplikaciji idu po Europe/Sarajevo.
   ========================================================================== */

var VAKTIJA_LOKACIJA = 77;
var VAKTIJA_API = "https://api.vaktija.ba/vaktija/v1";
var VAKTIJA_GRAD = "Sarajevo";

var VAKTI = [
  {
    id: "zora",
    naziv: "Zora",
    namaz: true,
    poruka: "Nastupilo je vrijeme sabah-namaza."
  },
  {
    id: "izlazak",
    naziv: "Izlazak sunca",
    /* Nije namaz — obavijest ne ide, ali vrijeme stoji na spisku. */
    namaz: false
  },
  {
    id: "podne",
    naziv: "Podne",
    namaz: true,
    poruka: "Nastupilo je vrijeme podne-namaza."
  },
  {
    id: "ikindija",
    naziv: "Ikindija",
    namaz: true,
    poruka: "Nastupilo je vrijeme ikindija-namaza."
  },
  {
    id: "aksam",
    naziv: "Akšam",
    namaz: true,
    poruka: "Nastupilo je vrijeme akšam-namaza."
  },
  {
    id: "jacija",
    naziv: "Jacija",
    namaz: true,
    poruka: "Nastupilo je vrijeme jacija-namaza."
  }
];

/* "4:19" -> 259. Vaktija vremena piše bez vodeće nule, otud `\d{1,2}`.
   Null znači "nije vrijeme" — takav se vakat preskače umjesto da se pretvori
   u ponoć i pokvari račun narednog. */
function vakatMinute(hhmm) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) { return null; }
  var h = parseInt(m[1], 10);
  var min = parseInt(m[2], 10);
  if (h > 23 || min > 59) { return null; }
  return h * 60 + min;
}

/* Node (Vercel funkcije) — u browseru `module` ne postoji, pa se preskače. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    VAKTI: VAKTI,
    VAKTIJA_LOKACIJA: VAKTIJA_LOKACIJA,
    VAKTIJA_API: VAKTIJA_API,
    VAKTIJA_GRAD: VAKTIJA_GRAD,
    vakatMinute: vakatMinute
  };
}
