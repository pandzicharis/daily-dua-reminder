/* ==========================================================================
   theme.js — dnevna i noćna tema

   Jedan atribut na <html>:

     data-theme="dan"   svijetla, kremasta — kakva je aplikacija i bila
     data-theme="noc"   tamna

   Sve boje su varijable u style.css (:root i :root[data-theme="noc"]), pa
   ovaj fajl ne zna ni za jednu boju osim one koju traži browser za svoju
   traku (`<meta name="theme-color">`). Nova kartica ili dugme dobiju noć bez
   ijedne linije ovdje.

   TRI REŽIMA, biraju se U POSTAVKAMA (settings.js, red „Tema“):

     auto   prati zikr — danju svijetla, uveče tamna
     dan    uvijek svijetla
     noc    uvijek tamna

   Na traci sa selamom stoji samo OZNAKA: sunce ili mlađak, po tome koja tema
   TRENUTNO stoji. Ne mijenja se na dodir. Prije je tu bilo dugme koje vrti
   tri režima, ali ono je krilo šta radi — mlađak znači „sada je noćna“, a
   čitao se kao „pritisni za noćnu“ — i nije se moglo ni vidjeti ni izabrati
   dok korisnik ne upiše ime, jer bez imena trake sa selamom nema. U
   postavkama tri režima stoje ispisana riječima i uvijek su na istom mjestu.

   Režim se pamti OVDJE, u svom ključu u localStorage, i ne ide na server uz
   ostali config: tema je stvar ekrana koji se drži u ruci. Isto ime na
   telefonu i na računaru vidi isti zikr, ali svaki uređaj svoju temu.

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

  var REZIMI = ["auto", "dan", "noc"];

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

  /* Ko se javlja kad se tema ili režim promijene: postavke (da red „Tema“
     nikad ne pokazuje staro stanje, ni kad se promijeni mimo njih) i testni
     panel. Nema poziva pri prijavi — kao i `naPromjenu` u settings.js. */
  var slusaoci = [];

  function javi(tema) {
    slusaoci.forEach(function (fn) {
      try { fn(tema, rezim); } catch (e) {}
    });
  }

  var el = null;

  function opis(tema) {
    var kakva = tema === "noc" ? "Noćna tema" : "Dnevna tema";
    return rezim === "auto"
      ? kakva + " — automatski, prati zikr."
      : kakva + ".";
  }

  /* Skrivanje ide preko ATRIBUTA, ne preko `.hidden`: `hidden` je svojstvo
     HTMLElement-a, a ovo su SVG elementi. `svg.hidden = false` bi napravio
     obično polje na objektu, atribut bi ostao i ikonica bi ostala skrivena —
     oznaka bi ostala prazna, bez sunca i mlađaka. */
  function pokazi(svg, vidljiv) {
    if (vidljiv) { svg.removeAttribute("hidden"); }
    else { svg.setAttribute("hidden", ""); }
  }

  function osvjeziOznaku(tema) {
    if (!el) { return; }
    pokazi(el.sun, tema === "dan");
    pokazi(el.moon, tema === "noc");
    el.mark.setAttribute("aria-label", opis(tema));
    el.mark.setAttribute("title", opis(tema));
  }

  var zadnja = null;
  var zadnjiRezim = null;

  function primijeni() {
    var tema = aktivna();
    var promjena = tema !== zadnja || rezim !== zadnjiRezim;

    if (tema !== zadnja) {
      document.documentElement.setAttribute("data-theme", tema);
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) { meta.setAttribute("content", BOJA[tema]); }
    }

    zadnja = tema;
    zadnjiRezim = rezim;

    osvjeziOznaku(tema);
    if (promjena) { javi(tema); }
  }

  /* Odmah, dok je <body> još neiscrtan — zbog ovoga fajl i stoji u <head>. */
  primijeni();

  /* Novi režim iz postavki. Nepoznata vrijednost se odbija umjesto da obori
     temu — vraća se režim koji je ostao, da pozivalac ne mora pogađati. */
  function postavi(noviRezim) {
    if (REZIMI.indexOf(noviRezim) === -1 || noviRezim === rezim) { return rezim; }
    rezim = noviRezim;
    zapamti();
    primijeni();
    return rezim;
  }

  /* ------------------------------------------------------------------------
     Oznaka na traci

     Obje ikonice stoje u index.html, ovdje se samo skriva jedna. Element je
     `<span role="img">`, ne dugme — ništa se na njemu ne pritiska.
     ------------------------------------------------------------------------ */

  function povezi() {
    var mark = document.getElementById("themeMark");
    var sun = document.getElementById("themeSun");
    var moon = document.getElementById("themeMoon");

    if (!mark || !sun || !moon) { return; }

    el = { mark: mark, sun: sun, moon: moon };
    osvjeziOznaku(aktivna());
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

  /* Za ostale fajlove: koja tema stoji, po čemu, biranje režima (postavke) i
     glumljenje sata da se noćna tema vidi bez čekanja večeri (testni panel). */
  window.mojZikrTema = {
    aktivna: aktivna,
    rezim: function () { return rezim; },
    postavi: postavi,

    /* fn(tema, rezim) pri svakoj promjeni teme ili režima */
    naPromjenu: function (fn) { slusaoci.push(fn); },

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
