/* ==========================================================================
   offline.js — traka "nema mreže" i sinhronizacija kad se mreža vrati

   Ovdje se NIŠTA ne pamti i ništa ne šalje. Pamćenje bez mreže je i do sada
   radilo — sve je u localStorage-u, a neposlane kvačice čekaju u redu koji
   vodi sync.js i idu gore čim veza dođe. Nedostajalo je jedino ono što
   korisnik vidi: dok mu je telefon bez signala, aplikacija je izgledala kao
   da je sve u redu, a kad bi se sinhronizovala, to se nigdje nije primijetilo.

   Zato ovaj fajl radi samo jednu stvar: sluša stanje koje javlja sync.js
   (`onStatus`) i crta trakicu na dnu ekrana.

     nema mreže   -> prekriženi oblak koji diše, i koliko kvačica čeka
     šalje se     -> krug koji se vrti, "Sinhronizujem…"
     gotovo       -> zelena kvačica, "Sinhronizovano", pa nestane sama

   Traka se pali SAMO kad zahtjev zaista padne, nikad po `navigator.onLine`:
   ta zastavica ume reći da mreže nema i onda kad sve uredno prolazi. Dok je
   sve normalno, trake u DOM-u nema i ekran o sinhronizaciji ne govori ništa —
   ona je svakodnevna stvar, a vijest je jedino prekid i ono što ga zatvori.
   ========================================================================== */

(function () {
  "use strict";

  /* Koliko "Sinhronizovano" stoji prije nego se traka povuče. Dovoljno da se
     pročita, prekratko da smeta. */
  var GOTOVO_MS = 2400;

  var traka = null;
  var sakrivanje = null;

  /* Znak koji stoji lijevo u traci. Tri crteža, po jedan za svako stanje. */
  var ZNAKOVI = {
    /* prekriženi oblak */
    offline: "M6.3 17h9.4a3.6 3.6 0 0 0 .5-7.1 5.5 5.5 0 0 0-8.2-3M4.6 9.4A3.6 3.6 0 0 0 5.6 17M3 3l18 18",
    /* krug sa strelicom — vrti se dok traje slanje */
    sync: "M20 12a8 8 0 1 1-2.6-5.9M20 3.5V9h-5.5",
    /* kvačica */
    ok: "M4.5 12.5l5 5 10-11"
  };

  function napraviZnak(vrsta) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "mreza-znak");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", ZNAKOVI[vrsta] || ZNAKOVI.offline);
    svg.appendChild(path);
    return svg;
  }

  /* Bosanska množina ima tri oblika: 1 kvačica, 2–4 kvačice, 5+ kvačica.
     Brojevi 11–14 idu uz treći iako se završavaju na 1–4 — zato i ostatak
     dijeljenja sa 100, ne samo sa 10. Vraća redni broj oblika (0, 1, 2). */
  function oblik(n) {
    var d = n % 10;
    var s = n % 100;
    if (d === 1 && s !== 11) { return 0; }
    if (d >= 2 && d <= 4 && (s < 12 || s > 14)) { return 1; }
    return 2;
  }

  function kvacice(n) {
    return n + " " + ["kvačica čeka", "kvačice čekaju", "kvačica čeka"][oblik(n)];
  }

  function poslane(n) {
    return n + " " + ["kvačica poslana", "kvačice poslane", "kvačica poslano"][oblik(n)];
  }

  /* ------------------------------------------------------------------------
     Traka
     ------------------------------------------------------------------------ */

  function napravi() {
    var box = document.createElement("div");
    box.className = "mreza";
    /* `polite`, ne `alert`: ovo ne prekida ono što korisnik radi. */
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");

    var znak = document.createElement("span");
    znak.className = "mreza-ikona";

    var tekst = document.createElement("div");
    tekst.className = "mreza-tekst";

    var naslov = document.createElement("p");
    naslov.className = "mreza-naslov";

    var nota = document.createElement("p");
    nota.className = "mreza-nota";

    tekst.appendChild(naslov);
    tekst.appendChild(nota);
    box.appendChild(znak);
    box.appendChild(tekst);

    document.body.appendChild(box);
    document.body.classList.add("has-mreza");
    return box;
  }

  function sakrij() {
    if (sakrivanje) { clearTimeout(sakrivanje); sakrivanje = null; }
    if (!traka) { return; }
    var stara = traka;
    traka = null;
    /* Izlazak se ne siječe — traka prvo isklizne pa se tek onda izbaci. */
    stara.classList.add("is-out");
    document.body.classList.remove("has-mreza");
    setTimeout(function () { stara.remove(); }, 260);
  }

  /* Jedini put kojim traka mijenja izgled.

     Znak se ponovo crta SAMO kad se stanje promijeni. Dok je traka na
     "nema mreže", svaka nova kvačica mijenja samo brojku ispod — a da se
     tada crtao novi <svg>, animacija disanja bi krenula ispočetka i traka bi
     na svaki klik bljesnula, kao da se iznova pojavila. */
  function pokazi(vrsta, naslov, nota) {
    if (sakrivanje) { clearTimeout(sakrivanje); sakrivanje = null; }
    if (!traka) { traka = napravi(); }

    var klasa = "mreza is-" + vrsta;
    if (traka.className !== klasa) {
      traka.className = klasa;
      var ikona = traka.querySelector(".mreza-ikona");
      ikona.textContent = "";
      ikona.appendChild(napraviZnak(vrsta));
    }

    traka.querySelector(".mreza-naslov").textContent = naslov;
    traka.querySelector(".mreza-nota").textContent = nota;

    if (vrsta === "ok") {
      sakrivanje = setTimeout(sakrij, GOTOVO_MS);
    }
  }

  /* ------------------------------------------------------------------------
     Stanje -> traka

     Traka se javlja SAMO oko prekida veze. Dok je sve normalno, ekran šuti —
     svaka kvačica ionako ode na server u tom trenutku, pa bi "šaljem" i
     "sinhronizovano" iskakali na svaki klik i govorili ono što se
     podrazumijeva.

     Zeleno "Sinhronizovano" ima tačno jedan povod: sync.js javi "vraceno" —
     zahtjev koji je prije padao je prošao i red je ispražnjen. To se po
     jednom prekidu desi jednom. Sve ostalo (obični uspjesi) dolazi kao "ok" i
     samo tiho sklanja traku, bez ijedne riječi.
     ------------------------------------------------------------------------ */
  function prikazi(stanje, broj) {
    if (stanje === "offline") {
      pokazi(
        "offline",
        "Nema mreže",
        broj ? kvacice(broj) + " — ide na server čim se veza vrati"
             : "Sve se pamti na uređaju"
      );
      return;
    }

    /* Veza se vratila i sve što je čekalo je otišlo gore — jedina objava.
       Ako ništa nije ni čekalo (pao je bio obični upit stanja, ne slanje),
       nema se šta objaviti: traka se samo skloni. */
    if (stanje === "vraceno") {
      if (!broj) { sakrij(); return; }
      pokazi("ok", "Sinhronizovano", poslane(broj) + " na server");
      return;
    }

    /* Sve ispod se tiče samo trake koja već stoji na ekranu. Ako je nema,
       nema ni šta reći — obično slanje se ne najavljuje. */
    if (!traka) { return; }

    if (stanje === "salje" || stanje === "ceka") {
      /* Zeleno "Sinhronizovano" još stoji — pusti ga da odstoji svoje umjesto
         da ga presiječe vrtiljak zbog kvačice kliknute odmah iza. */
      if (traka.classList.contains("is-ok")) { return; }
      pokazi("sync", "Sinhronizujem…", broj ? kvacice(broj) : "Provjeravam spisak");
      return;
    }

    /* stanje === "ok" — zahtjev je prošao, a ništa nije ni padalo (npr.
       mreža je bila ugašena ali je server na istom uređaju). Traka se skloni
       bez objave: nije se imalo šta ni popraviti. */
    sakrij();
  }

  /* ------------------------------------------------------------------------
     Prijava
     ------------------------------------------------------------------------ */

  if (window.mojZikrSync && window.mojZikrSync.onStatus) {
    window.mojZikrSync.onStatus(prikazi);
  }

  /* `navigator.onLine` i događaj `offline` se NAMJERNO ne slušaju: oni znaju
     reći da mreže nema i onda kad sve uredno prolazi (server na istom
     uređaju, lokalna mreža), pa bi traka iskakala bez razloga. Traku pali
     samo zahtjev koji je pao — to javlja sync.js.

     Povratak veze se sluša, ali samo da traka koja VEĆ stoji pređe u
     "sinhronizujem" umjesto da čeka prvi odgovor. Ovdje se ne šalje ništa —
     to na istom događaju radi script.js. */
  window.addEventListener("online", function () {
    if (!traka) { return; }
    pokazi("sync", "Mreža je tu", "Sinhronizujem…");
    /* Ako sync.js ne javi ništa — a neće ako ime nije upisano, pa se ništa i
       ne sinhronizuje — traka se ne smije zaglaviti na "sinhronizujem".
       Prva sljedeća poruka ovaj sat poništi (vidi `pokazi`). */
    sakrivanje = setTimeout(sakrij, 6000);
  });

})();
