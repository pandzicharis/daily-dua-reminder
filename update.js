/* ==========================================================================
   update.js — "Nova verzija · Instaliraj"

   Aplikacija je instalirana na početnom ekranu i ne zatvara se: PWA se
   ostavi u pozadini i tako stoji sedmicama. Zato nova verzija do sada nije
   ni stizala — service worker koji čeka preuzima tek kad se ZATVORE svi
   prozori, a njih niko ne zatvara.

   Sada nova verzija javi sama sebe: traka na dnu ekrana sa dugmetom
   "Instaliraj". Dok se ne pritisne, radi stara verzija — nijedan fajl se ne
   mijenja pod prstima usred učenja.

   KAKO IDE
     1. `register()` ispod pri svakom otvaranju pita server ima li novi
        service-worker.js (isti poziv radi i notifications.js; ponovna
        registracija istog fajla ne pravi drugu registraciju nego samo
        provjeru).
     2. Ima li ga, browser ga skine i INSTALIRA, pa ga ostavi u `waiting`.
        Tada se pojavi traka.
     3. Klik na "Instaliraj" pošalje service workeru poruku `preuzmi`, on
        pozove `skipWaiting()`, browser javi `controllerchange` — i strana se
        učita ponovo, sada iz nove verzije.

   ZAŠTO SE ČEKA `controller`. Pri PRVOM otvaranju (aplikacija još nema svog
   service workera) instalacija je normalan dio starta, a ne "nova verzija" —
   `navigator.serviceWorker.controller` je tada prazan i traka se ne
   pokazuje. Bez te provjere bi svaki novi uređaj odmah dobio ponudu da
   instalira ono što upravo instalira.

   Traka se NE pamti: zatvaranje je skloni do sljedećeg otvaranja aplikacije,
   a nova verzija i dalje čeka. Ko je jednom sklonio, dobiće je opet — ali
   ne odmah, i ne dok gleda spisak.
   ========================================================================== */

(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) { return; }

  /* Koliko se čeka na `controllerchange` prije nego se strana svejedno
     učita. Poruka je mogla ne stići (worker uspavan, poruka izgubljena), a
     dugme koje ostane "Instaliram…" izgleda kao da se aplikacija zaglavila.
     Ponovno učitavanje je bezopasno i kad nova verzija nije preuzela — tada
     se samo ponovo otvori ista. */
  var CEKANJE_MS = 4000;

  /* Ritam provjere dok je aplikacija otvorena. PWA ostaje u pozadini danima,
     pa provjera samo pri startu ne bi bila dovoljna. */
  var PROVJERA_MS = 30 * 60 * 1000;
  /* Povratak u aplikaciju (iz pozadine, sa druge kartice) je najbolji
     trenutak za provjeru, ali ne češće od ovoga — inače bi svako prebacivanje
     tamo-amo gađalo server. */
  var NAJKRACE_MS = 5 * 60 * 1000;

  var traka = null;
  var dugme = null;
  var registracija = null;
  var zadnjaProvjera = 0;
  var preuzimam = false;

  /* ------------------------------------------------------------------------
     Traka

     Nastaje tek kad ima šta javiti — do tada je u DOM-u nema. Izgled je isti
     kao kod ostalih lebdećih kontrola (staklo, zlatni rub, sjena kartice),
     samo šira, jer nosi tekst i dva dugmeta.
     ------------------------------------------------------------------------ */

  function napravi(naInstaliraj) {
    var box = document.createElement("div");
    box.className = "update";
    /* Ne `alert`: ovo ne prekida ono što korisnik radi. `polite` sačeka da
       čitač ekrana završi rečenicu u kojoj jeste. */
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");

    var text = document.createElement("div");
    text.className = "update-text";

    var title = document.createElement("p");
    title.className = "update-title";
    title.textContent = "Nova verzija";
    text.appendChild(title);

    var note = document.createElement("p");
    note.className = "update-note";
    note.textContent = "Spremna je i čeka. Aplikacija se ponovo učita.";
    text.appendChild(note);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "update-btn";
    btn.textContent = "Instaliraj";
    btn.addEventListener("click", naInstaliraj);

    var close = document.createElement("button");
    close.type = "button";
    close.className = "update-close";
    close.setAttribute("aria-label", "Kasnije");
    close.title = "Kasnije";
    close.textContent = "✕";
    close.addEventListener("click", sakrij);

    box.appendChild(text);
    box.appendChild(btn);
    box.appendChild(close);

    document.body.appendChild(box);
    /* Lebdeća dugmad (na vrh, završni ekran) stoje na istom mjestu, pa se za
       visinu trake podignu — vidi `body.has-update` u style.css. */
    document.body.classList.add("has-update");

    dugme = btn;
    return box;
  }

  function sakrij() {
    if (!traka) { return; }
    traka.remove();
    traka = null;
    dugme = null;
    document.body.classList.remove("has-update");
  }

  function pokazi(reg) {
    if (traka || preuzimam) { return; }
    traka = napravi(function () { instaliraj(reg); });
  }

  /* ------------------------------------------------------------------------
     Preuzimanje
     ------------------------------------------------------------------------ */

  var ucitavam = false;

  function ucitajPonovo() {
    /* `controllerchange` zna doći više puta; strana se učitava jednom. */
    if (ucitavam) { return; }
    ucitavam = true;
    window.location.reload();
  }

  function instaliraj(reg) {
    var novi = reg.waiting;
    if (!novi) {
      /* Nestao je dok je traka stajala (drugi prozor ga je već preuzeo).
         Ponovno učitavanje je tada ionako ono što treba. */
      ucitajPonovo();
      return;
    }

    preuzimam = true;
    if (dugme) {
      dugme.disabled = true;
      dugme.textContent = "Instaliram…";
    }

    novi.postMessage({ type: "preuzmi" });
    setTimeout(ucitajPonovo, CEKANJE_MS);
  }

  navigator.serviceWorker.addEventListener("controllerchange", function () {
    /* Samo kad smo mi tražili. Prva instalacija (`clients.claim()` u service
       workeru) takođe javi ovaj događaj, a tada se strana ne smije učitavati
       ponovo — vrtjela bi se u krug. */
    if (preuzimam) { ucitajPonovo(); }
  });

  /* ------------------------------------------------------------------------
     Provjera
     ------------------------------------------------------------------------ */

  function pripremi(reg) {
    registracija = reg;

    /* Već je čekala od prošlog puta (traka zatvorena, aplikacija ugašena). */
    if (reg.waiting && navigator.serviceWorker.controller) { pokazi(reg); }

    reg.addEventListener("updatefound", function () {
      var novi = reg.installing;
      if (!novi) { return; }

      novi.addEventListener("statechange", function () {
        /* "installed" uz postojećeg kontrolora znači tačno jedno: skinuta je
           NOVA verzija i čeka. Bez kontrolora je to prva instalacija. */
        if (novi.state === "installed" && navigator.serviceWorker.controller) {
          pokazi(reg);
        }
      });
    });

    function provjeri() {
      var sad = Date.now();
      if (sad - zadnjaProvjera < NAJKRACE_MS) { return; }
      zadnjaProvjera = sad;
      reg.update().catch(function () { /* nema mreže — sljedeći put */ });
    }

    setInterval(provjeri, PROVJERA_MS);

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") { provjeri(); }
    });
  }

  /* ------------------------------------------------------------------------
     Za povlačenje prsta nadole (script.js)

     Taj gest je izričit zahtjev da se sve osvježi, pa nova verzija tada ne
     čeka traku i dugme: pita se ima li je i preuzima se odmah.

     Prije je script.js na tom mjestu samo pozivao `location.reload()`. Sada
     to više ne bi ništa promijenilo — service worker koji čeka ne preuzima
     ponovnim učitavanjem strane (vidi zaglavlje service-worker.js), pa bi se
     svako povlačenje završavalo istom starom verzijom.
     ------------------------------------------------------------------------ */
  window.mojZikrUpdate = {
    /* Promise<boolean> — pitaj server i reci ima li nove verzije. */
    provjeri: function () {
      if (!registracija) { return Promise.resolve(false); }
      zadnjaProvjera = Date.now();
      return Promise.resolve(registracija.update())
        .then(function () {
          return !!(registracija.installing || registracija.waiting);
        })
        .catch(function () { return false; });
    },

    /* Preuzmi ono što je nađeno i ponovo učitaj stranu. Verzija koja se još
       skida se sačeka — do "installed" je ionako par trenutaka. */
    preuzmi: function () {
      if (!registracija) { ucitajPonovo(); return; }
      if (registracija.waiting) { instaliraj(registracija); return; }

      var novi = registracija.installing;
      if (!novi) { ucitajPonovo(); return; }

      preuzimam = true;
      if (dugme) {
        dugme.disabled = true;
        dugme.textContent = "Instaliram…";
      }

      novi.addEventListener("statechange", function () {
        if (novi.state === "installed") {
          preuzimam = false;
          instaliraj(registracija);
        }
      });
      /* Ako se instalacija zaglavi, strana se svejedno učita — bolje nego
         da povlačenje ostane bez ijednog ishoda. */
      setTimeout(ucitajPonovo, CEKANJE_MS);
    }
  };

  /* Registracija je ista ona koju traži i notifications.js — dva poziva sa
     istim fajlom i istim scope-om daju istu registraciju, a usput je i
     provjera ima li nove verzije. Zato se ovdje ne čeka `ready`: on bi se
     odužio dok se prva instalacija ne završi. */
  navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
    .then(function (reg) {
      zadnjaProvjera = Date.now();
      pripremi(reg);
    })
    .catch(function () { /* bez service workera nema ni nove verzije */ });

})();
