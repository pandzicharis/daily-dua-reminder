/* ==========================================================================
   badge.js — broj na ikonici aplikacije

   Na početnom ekranu (iOS) i u docku/taskbaru (macOS, Windows) ikonica
   instalirane PWA može nositi crveni krug sa brojem. Ovdje je taj broj:

     KOLIKO JE DOVA OSTALO ZA PROUČITI U PODSJETNICIMA KOJI SU VEĆ NASTUPILI

   Pravilo je jedna rečenica i namjerno ne postoji nigdje drugo:

     broj = zbir neurađenih stavki svih podsjetnika čiji je `startTime`
            prošao

   Odatle slijedi sve što je traženo, bez ijednog posebnog slučaja:

     08:00–18:59   nastupio je samo dnevni      -> broj = neurađeno dnevno
     od 19:00      nastupio je i večernji       -> broj = dnevno + večernje
     petkom 08:00  nastupio je i petački        -> i on ulazi u zbir
     sve urađeno   nema šta ostati              -> nema kruga na ikonici
     00:00–07:59   ništa još nije nastupilo     -> nema kruga na ikonici

   Zadnji red je razlog zašto se gleda SAMO početak prozora, a ne i kraj:
   dnevni prozor ide do ponoći, pa neurađeno dnevno u 21:00 i dalje stoji na
   ikonici — kako je i traženo ("ako do 7 ne pročitam sve, broj nepročitanih
   će biti"). Kraj prozora gasi OBAVIJESTI, ne broj.

   SVAKI DAN JE NOV BROJAČ. Ništa se ne prenosi u sutra: ostane li večeras
   pet dova neurađeno, sutra se ne broji 5 + današnje nego se kreće od nule.
   Broj se ne "nuluje" nekim posebnim korakom — on se uvijek računa iz spiska
   TOG dana, a spisak u ponoć postaje nov i prazan.

   Zato uz brojke stoji i DAN za koji su izbrojane. Bez toga bi sat ispod
   nastavio primjenjivati jučerašnje brojke na današnji dan sve dok se
   aplikacija ne osvježi — a to je tačno ono što "novi brojač svaki dan" ne
   smije biti. Kad se dan promijeni, brojke se odbacuju i krug nestaje; nove
   stižu prvim iscrtavanjem.

   ŠTA SE BROJI. Ovaj fajl ne zna ni za jednu sekciju ni stavku — script.js
   mu javi već izbrojane grupe (`{ id, done, total }`), iste one iz kojih se
   crtaju trake napretka u headeru. Zato broj na ikonici uvijek odgovara
   zbiru onoga što na trakama piše kao neurađeno; ne mogu se raziće jer nisu
   dva računa nego jedan.

   ODAKLE VRIJEME. Satnica se čita iz `notification-tasks.js` — iz istog
   spiska po kojem stižu obavijesti. "Dnevne i noćne su kad je i vrijeme za
   te notifikacije" je tako doslovno tačno: promijeni se `startTime` i broj
   na ikonici se pomjeri zajedno sa obavijesti.

   KAD JE APLIKACIJA ZATVORENA ovaj fajl ne radi (ništa u browseru ne radi).
   Tada broj postavlja `service-worker.js` iz push poruke — server uz svaki
   podsjetnik pošalje i koliko je ostalo (`badgeCount()` u `api/_lib.js`), po
   istom pravilu kao ovdje. Dva mjesta postoje jer su dva svijeta, ali je
   pravilo jedno i zapisano je na oba mjesta istim riječima.
   ========================================================================== */

(function () {
  "use strict";

  /* Badging API. Nemaju ga svi (Firefox, stariji Safari) — tamo se ovaj
     fajl svede na tri prazne funkcije i aplikacija radi kao i prije.

     Na iOS-u broj traži DVIJE stvari: da je aplikacija dodana na početni
     ekran i da su obavijesti dozvoljene. Kad nisu, poziv odbije obećanje —
     hvata se i ćuti, jer korisnik koji nije htio obavijesti nije tražio ni
     ispriku zbog njih. */
  var supported = typeof navigator !== "undefined" &&
                  typeof navigator.setAppBadge === "function";

  /* "19:00" -> 1140.

     Vlastiti parser, a ne pozajmljen: sami SATI stoje na jednom mjestu
     (notification-tasks.js) i odatle se čitaju, a ovo je samo pretvaranje
     zapisa u minute. Server ima svoj isti takav (`parseTime` u
     api/_lib.js) jer se Node i browser ne mogu dijeliti bez bundlera, a
     bundlera u ovom projektu nema — i neka ga i ne bude zbog pet linija. */
  function minutesOf(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
    if (!m) { return null; }
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    if (h > 23 || min > 59) { return null; }
    return h * 60 + min;
  }

  function nowMinutes() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  /* "YYYY-MM-DD" po lokalnom vremenu — isto pravilo kao `getLocalDateKey()`
     u script.js, jer se sa njegovim danom i poredi. Nikad UTC: u 01:00 po
     Sarajevu UTC je još jučer, pa bi se dan mijenjao u pogrešnom trenutku. */
  function danasKey() {
    var d = new Date();
    return d.getFullYear() + "-" +
           String(d.getMonth() + 1).padStart(2, "0") + "-" +
           String(d.getDate()).padStart(2, "0");
  }

  /* Je li prozor tog podsjetnika danas već počeo. Dan sedmice se ovdje NE
     provjerava (`days`) — grupu koja tog dana ne postoji script.js ionako ne
     pošalje, jer je ni na ekranu nema. */
  function zapoceo(id, minutes) {
    if (typeof NOTIFICATION_TASKS === "undefined") { return false; }

    for (var i = 0; i < NOTIFICATION_TASKS.length; i++) {
      var task = NOTIFICATION_TASKS[i];
      if (task.id !== id) { continue; }
      if (task.enabled === false) { return false; }
      var start = minutesOf(task.startTime);
      return start !== null && minutes >= start;
    }

    /* Grupa bez podsjetnika (ako se ikad pojavi) nema svoje vrijeme, pa
       nema ni trenutka od kojeg bi počela da se broji. */
    return false;
  }

  function racun(grupe, minutes) {
    return (grupe || []).reduce(function (zbir, grupa) {
      if (!zapoceo(grupa.id, minutes)) { return zbir; }
      var ostalo = grupa.total - grupa.done;
      return zbir + (ostalo > 0 ? ostalo : 0);
    }, 0);
  }

  /* Zadnje što je script.js javio, DAN za koji to vrijedi, i zadnje što je
     stvarno postavljeno. `prikazano` postoji da se ista brojka ne postavlja
     svake minute — poziv je jeftin, ali na iOS-u ume da zatreperi ikonica. */
  var zadnje = [];
  var zadnjiDan = null;
  var prikazano = null;

  function primijeni() {
    if (!supported) { return; }

    /* Prešla je ponoć otkako su brojke izbrojane — one više ne govore o
       današnjem danu, pa se odbacuju. Nula je ovdje TAČAN odgovor, a ne
       zamjena za nepoznato: novi dan počinje prazan i prvi podsjetnik mu je
       tek u 08:00. Prave brojke stižu prvim iscrtavanjem. */
    if (zadnjiDan !== null && zadnjiDan !== danasKey()) {
      zadnje = [];
      zadnjiDan = null;
    }

    var broj = racun(zadnje, nowMinutes());
    if (broj === prikazano) { return; }
    prikazano = broj;

    var p = broj > 0 ? navigator.setAppBadge(broj) : navigator.clearAppBadge();
    /* Nije prošlo (nema dozvole, nije instalirano) — zaboravi da je ikad
       postavljeno, da se sljedeći put pokuša ponovo umjesto da se preskoči
       jer "ista je brojka". */
    if (p && p.catch) { p.catch(function () { prikazano = null; }); }
  }

  window.mojZikrBadge = {
    /* script.js: `grupe` je [{ id, done, total }] — po jedna po podsjetniku,
       tačno one iz kojih se crtaju trake u headeru. `dan` je "YYYY-MM-DD" za
       koji su izbrojane; po njemu se poznaje da su prestarjele. */
    osvjezi: function (grupe, dan) {
      zadnje = grupe || [];
      zadnjiDan = dan || danasKey();
      primijeni();
    }
  };

  if (!supported) { return; }

  /* Sat ide i dok niko ništa ne dira: u 19:00 se večernji pridruži zbiru, a
     u ponoć sve otpadne, pa se broj mora osvježiti i bez ijednog klika.
     Jednom u minuti je dovoljno gusto (satnica je u punim satima), a dovoljno
     rijetko da se ne osjeti.

     Ovo je i jedino što ikonicu očisti u ponoć kad aplikacija stoji otvorena
     ali je niko ne dira. script.js istim satom otvara i nov dan na ekranu, pa
     brojke stignu odmah za njim — ali ikonica ne ovisi o tome. */
  setInterval(primijeni, 60 * 1000);

  /* Povratak u aplikaciju. Dvije stvari su se u međuvremenu mogle desiti:
     interval je bio prigušen dok je aplikacija bila u pozadini, i push je
     mogao postaviti svoju brojku kroz service worker. Zato se `prikazano`
     briše — dok je aplikacija otvorena, njena brojka je mjerodavna. */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { return; }
    prikazano = null;
    primijeni();
  });

})();
