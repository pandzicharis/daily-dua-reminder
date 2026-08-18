/* ==========================================================================
   sync.js — zajedničko stanje čekiranog kroz uređaje

   Telefon i računar rade nad ISTIM spiskom. Server (Upstash) je izvor
   istine, a localStorage ostaje keš da aplikacija radi i bez interneta.

   Šalju se SAMO PROMJENE, nikad cijelo stanje. Zato uređaj koji je bio
   offline ne vraća nazad ono što je drugi u međuvremenu odčekirao — pošalje
   samo ono što je on sam dirnuo.

   Neposlane promjene čekaju u localStorage-u (`moj-zikr-pending`) i idu
   gore pri prvom sljedećem otvaranju, povratku u aplikaciju ili kad se
   mreža vrati. Ništa se ne gubi ako je telefon bio u avionskom režimu.

   Ovdje NEMA nikakvog mjerenja vremena ni odlučivanja o notifikacijama —
   to je i dalje isključivo na serveru (api/cron.js).
   ========================================================================== */

(function () {
  "use strict";

  var PENDING_KEY = "moj-zikr-pending";        /* { datum: { itemId: bool } } */
  var BOOTSTRAP_KEY = "moj-zikr-bootstrapped"; /* zadnji dan uparen sa serverom */

  /* Postavlja ga script.js — njemu se javlja stanje koje je stiglo gore. */
  var onState = null;

  /* ------------------------------------------------------------------------
     Red neposlanih promjena
     ------------------------------------------------------------------------ */

  function readPending(date) {
    try {
      var all = JSON.parse(localStorage.getItem(PENDING_KEY)) || {};
      var map = all[date];
      return (map && typeof map === "object") ? map : {};
    } catch (e) {
      return {};
    }
  }

  function writePending(date, map) {
    try {
      /* Čuva se samo tekući dan — stariji datum server ionako ne prima,
         pa bi zauvijek visio u redu i ponavljao isti neuspjeli zahtjev. */
      var all = {};
      if (Object.keys(map).length) { all[date] = map; }
      localStorage.setItem(PENDING_KEY, JSON.stringify(all));
    } catch (e) {
      /* privatni mod ili pun storage — sinhronizacija radi samo u sesiji */
    }
  }

  /* ------------------------------------------------------------------------
     Razgovor sa serverom

     Sve ide kroz jedan lanac (`chain`) pa dva zahtjeva ne mogu biti u letu
     istovremeno — inače bi brzo klikanje moglo dati odgovore van reda i
     nakratko vratiti stari checkmark.
     ------------------------------------------------------------------------ */

  var chain = Promise.resolve();

  function send(date) {
    var queued = readPending(date);
    var ids = Object.keys(queued);
    if (!ids.length) { return Promise.resolve(null); }

    return fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: date, items: queued })
    }).then(function (res) {
      if (!res.ok) { throw new Error("state " + res.status); }
      return res.json();
    }).then(function (data) {
      /* Iz reda se skida samo ono što je zaista poslano i u međuvremenu se
         nije promijenilo — klik tokom slanja ne smije biti izgubljen. */
      var still = readPending(date);
      ids.forEach(function (id) {
        if (still[id] === queued[id]) { delete still[id]; }
      });
      writePending(date, still);
      return (data && data.items) || {};
    });
  }

  function get(date) {
    return fetch("/api/state?date=" + encodeURIComponent(date), {
      headers: { "Accept": "application/json" }
    }).then(function (res) {
      if (!res.ok) { throw new Error("state " + res.status); }
      return res.json();
    }).then(function (data) {
      return (data && data.items) || {};
    });
  }

  /* wantPull = i povuci stanje ako nema šta da se šalje. Poslije slanja se
     ne povlači posebno: POST već vrati stanje nakon upisa. */
  function sync(date, wantPull) {
    chain = chain.then(function () {
      return send(date)
        .then(function (items) {
          if (items) { return items; }
          return wantPull ? get(date) : null;
        })
        .then(function (items) {
          if (items && onState) { onState(date, items); }
        })
        .catch(function () {
          /* Nema mreže ili backenda (npr. otvoreno kao obični static server).
             Aplikacija i dalje radi lokalno; pokušaće se ponovo. */
        });
    });
    return chain;
  }

  /* ------------------------------------------------------------------------
     Prvo otvaranje u danu na ovom uređaju

     Ono što je već čekirano lokalno se prvo POŠALJE gore, pa tek onda
     preuzima stanje sa servera. Bez ovoga bi prvo povlačenje obrisalo
     checkmarke napravljene prije nego je dijeljenje uopšte postojalo.
     Šalju se samo čekirane stavke — ništa se ne skida, pa se ne može
     pregaziti ono što je drugi uređaj odčekirao.
     ------------------------------------------------------------------------ */
  function bootstrap(date, localItems) {
    var last = null;
    try { last = localStorage.getItem(BOOTSTRAP_KEY); } catch (e) { last = null; }
    if (last === date) { return; }

    var map = readPending(date);
    Object.keys(localItems || {}).forEach(function (id) {
      if (localItems[id]) { map[id] = true; }
    });
    writePending(date, map);

    try { localStorage.setItem(BOOTSTRAP_KEY, date); } catch (e) {}
  }

  /* ------------------------------------------------------------------------
     Šta script.js koristi
     ------------------------------------------------------------------------ */
  window.mojZikrSync = {
    /* fn(date, items) — stanje sa servera, { itemId: true, quran: true } */
    onState: function (fn) { onState = fn; },

    /* Pri pokretanju: uparivanje pa povlačenje. */
    start: function (date, localItems) {
      bootstrap(date, localItems);
      return sync(date, true);
    },

    /* Jedan checkbox: { "zikr-salavat-50": true } */
    change: function (date, changes) {
      var map = readPending(date);
      Object.keys(changes).forEach(function (id) { map[id] = changes[id] === true; });
      writePending(date, map);
      return sync(date, false);
    },

    /* Povratak u aplikaciju / vraćena mreža. */
    refresh: function (date) { return sync(date, true); }
  };

})();
