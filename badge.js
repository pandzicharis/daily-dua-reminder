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
   će biti"). Kraj prozora gasi OBAVIJESTI, ne broj. A poslije ponoći je
   ionako nov dan i čist spisak, pa se broj sam vrati na nulu.

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

  /* Zadnje što je script.js javio i zadnje što je stvarno postavljeno.
     `prikazano` postoji da se ista brojka ne postavlja svake minute — poziv
     je jeftin, ali na iOS-u ume da zatreperi ikonica. */
  var zadnje = [];
  var prikazano = null;

  function primijeni() {
    if (!supported) { return; }

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
       tačno one iz kojih se crtaju trake u headeru. */
    osvjezi: function (grupe) {
      zadnje = grupe || [];
      primijeni();
    }
  };

  if (!supported) { return; }

  /* Sat ide i dok niko ništa ne dira: u 19:00 se večernji pridruži zbiru, a
     poslije ponoći sve otpadne, pa se broj mora osvježiti i bez ijednog
     klika. Jednom u minuti je dovoljno gusto (satnica je u punim satima), a
     dovoljno rijetko da se ne osjeti. */
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
