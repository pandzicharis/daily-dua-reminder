/* ==========================================================================
   theme.js — dnevna i noćna tema

   Jedan atribut na <html>:

     data-theme="dan"   svijetla, kremasta — kakva je aplikacija i bila
     data-theme="noc"   tamna

   Sve boje su varijable u style.css (:root i :root[data-theme="noc"]), pa
   ovaj fajl ne zna ni za jednu boju osim one koju traži browser za svoju
   traku (`<meta name="theme-color">`). Nova kartica ili dugme dobiju noć bez
   ijedne linije ovdje.

   TRI REŽIMA, dugme na traci sa selamom ih vrti u krug:

     auto   prati zikr — danju svijetla, uveče tamna
     dan    uvijek svijetla
     noc    uvijek tamna

   Ikonica na dugmetu pokazuje temu koja TRENUTNO stoji (sunce ili mlađak), a
   natpis pored nje po čemu je izabrana ("auto", "dan", "noć"). Zato u režimu
   "auto" ikonica sama pređe u mlađak kad padne veče.

   KAD JE VEČE ne piše ovdje nego u notification-tasks.js: veče počinje kad i
   večernji podsjetnik (19:00), a dan kad i dnevni (08:00). Isti spisak po
   kojem telefon zvoni određuje i boju ekrana — satnica postoji na jednom
   mjestu i ne može se razići.

   Vrijeme je UREĐAJEVO, ne sarajevsko. Podsjetnici se šalju po Europe/Sarajevo
   jer ih šalje server za sve, ali temu gleda čovjek koji drži telefon: kome je
   ponoć, tome je noćna tema, bez obzira gdje je.

   ZAŠTO JE OVAJ FAJL U <head>, a ne dolje sa ostalima: tema mora biti
   izabrana PRIJE prvog crtanja. Da se čeka dno strane, noću bi svijetla tema
   bljesnula pa se prebacila u tamnu.
   ========================================================================== */

(function () {
  "use strict";

  var KEY = "moj-zikr-tema";

  /* Redoslijed kojim klik vrti režime. */
  var REZIMI = ["auto", "dan", "noc"];

  var NATPIS = { auto: "auto", dan: "dan", noc: "noć" };

  /* Boja trake browsera / statusne linije. Jedino mjesto u JavaScriptu gdje
     boja uopšte piše — mora pratiti `--background` iz style.css. */
  var BOJA = { dan: "#faf7f0", noc: "#0f1512" };

  function procitaj() {
    var spremljeno = "";
    try { spremljeno = localStorage.getItem(KEY) || ""; } catch (e) { spremljeno = ""; }
    return REZIMI.indexOf(spremljeno) === -1 ? "auto" : spremljeno;
  }

  function zapamti() {
    try { localStorage.setItem(KEY, rezim); } catch (e) {}
  }

  var rezim = procitaj();

  /* ------------------------------------------------------------------------
     Kad je noć

     Granice se čitaju iz spiska podsjetnika. Rezervni brojevi stoje samo za
     slučaj da spisak nije učitan (npr. neko otvori index.html bez tog fajla)
     — tada tema i dalje radi, po istim vremenima kakva su danas na spisku.
     ------------------------------------------------------------------------ */

  function uMinute(hhmm) {
    var dio = String(hhmm || "").split(":");
    var h = parseInt(dio[0], 10);
    var m = parseInt(dio[1], 10);
    if (isNaN(h) || isNaN(m)) { return NaN; }
    return h * 60 + m;
  }

  function pocetak(id, rezerva) {
    var spisak = (typeof NOTIFICATION_TASKS !== "undefined") ? NOTIFICATION_TASKS : [];
    for (var i = 0; i < spisak.length; i++) {
      if (spisak[i] && spisak[i].id === id) {
        var m = uMinute(spisak[i].startTime);
        if (!isNaN(m)) { return m; }
      }
    }
    return rezerva;
  }

  /* Probni sat iz testnog panela (dev-panel.js), u minutama od ponoći, ili
     null za pravo vrijeme. Stoji u memoriji, NE u localStorage: osvježenje
     strane vraća pravi sat, pa proba ne može ostati zaboravljena na uređaju. */
  var probniSat = null;

  function minutaSad() {
    if (probniSat !== null) { return probniSat; }
    var sad = new Date();
    return sad.getHours() * 60 + sad.getMinutes();
  }

  function nocSad() {
    var minuta = minutaSad();
    var dan = pocetak("dan", 8 * 60);
    var noc = pocetak("navecer", 19 * 60);
    /* Dan je [08:00, 19:00). Sve ostalo je noć — i rano jutro i veče. */
    return !(minuta >= dan && minuta < noc);
  }

  function aktivna() {
    if (rezim === "dan" || rezim === "noc") { return rezim; }
    return nocSad() ? "noc" : "dan";
  }

  /* ------------------------------------------------------------------------
     Primjena
     ------------------------------------------------------------------------ */

  var el = null;

  function opis(tema) {
    var sljedeci = REZIMI[(REZIMI.indexOf(rezim) + 1) % REZIMI.length];
    var kakva = tema === "noc" ? "tamna" : "svijetla";
    var sada = rezim === "auto"
      ? "Tema: automatski, prati zikr — sada " + kakva + "."
      : "Tema: " + kakva + ".";
    return sada + " Klik: " + NATPIS[sljedeci] + ".";
  }

  /* Skrivanje ide preko ATRIBUTA, ne preko `.hidden`: `hidden` je svojstvo
     HTMLElement-a, a ovo su SVG elementi. `svg.hidden = false` bi napravio
     obično polje na objektu, atribut bi ostao i ikonica bi ostala skrivena —
     dugme bi imalo samo natpis, bez sunca i mlađaka. */
  function pokazi(svg, vidljiv) {
    if (vidljiv) { svg.removeAttribute("hidden"); }
    else { svg.setAttribute("hidden", ""); }
  }

  function osvjeziDugme(tema) {
    if (!el || !el.btn) { return; }
    pokazi(el.sun, tema === "dan");
    pokazi(el.moon, tema === "noc");
    el.label.textContent = NATPIS[rezim];
    el.btn.setAttribute("aria-label", opis(tema));
    el.btn.setAttribute("title", opis(tema));
  }

  var zadnja = null;

  function primijeni() {
    var tema = aktivna();

    if (tema !== zadnja) {
      zadnja = tema;
      document.documentElement.setAttribute("data-theme", tema);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) { meta.setAttribute("content", BOJA[tema]); }
    }

    osvjeziDugme(tema);
  }

  /* Odmah, dok je <body> još neiscrtan — zbog ovoga fajl i stoji u <head>. */
  primijeni();

  /* ------------------------------------------------------------------------
     Dugme
     ------------------------------------------------------------------------ */

  function povezi() {
    el = {
      btn: document.getElementById("themeBtn"),
      sun: document.getElementById("themeSun"),
      moon: document.getElementById("themeMoon"),
      label: document.getElementById("themeLabel")
    };

    if (!el.btn || !el.sun || !el.moon || !el.label) { el = null; return; }

    el.btn.addEventListener("click", function () {
      rezim = REZIMI[(REZIMI.indexOf(rezim) + 1) % REZIMI.length];
      zapamti();
      primijeni();
    });

    primijeni();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", povezi);
  } else {
    povezi();
  }

  /* ------------------------------------------------------------------------
     Prelaz sam od sebe

     U 19:00 pada noć i dok aplikacija stoji otvorena na stolu, bez dodira.
     Provjera je jednom u minuti — to je jedno poređenje brojeva, a atribut se
     dira samo kad se tema stvarno promijenila (`zadnja`).

     Uz to i pri povratku na aplikaciju: telefon uspava tajmere dok je ekran
     ugašen, pa bi bez ovoga aplikacija otvorena u 18:00 i pogledana u 21:00
     još uvijek bila svijetla.
     ------------------------------------------------------------------------ */
  setInterval(function () {
    if (rezim === "auto") { primijeni(); }
  }, 60000);

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && rezim === "auto") { primijeni(); }
  });

  /* Za ostale fajlove (testni panel): koja tema stoji, po čemu, i glumljenje
     sata da se noćna tema vidi bez čekanja večeri. */
  window.mojZikrTema = {
    aktivna: aktivna,
    rezim: function () { return rezim; },

    /* "19:00", broj minuta, ili null za pravo vrijeme. Vraća šta je ostalo
       postavljeno, da panel ne mora pogađati je li vrijednost primljena. */
    glumiSat: function (kada) {
      if (kada === null || kada === undefined || kada === "") {
        probniSat = null;
      } else {
        var m = (typeof kada === "number") ? kada : uMinute(kada);
        probniSat = isNaN(m) ? null : m;
      }
      primijeni();
      return probniSat;
    },

    /* Minuta koju tema trenutno gleda i je li glumljena. */
    sat: function () {
      return { minuta: minutaSad(), glumljen: probniSat !== null };
    }
  };

})();
