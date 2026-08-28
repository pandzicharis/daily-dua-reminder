/* ==========================================================================
   sync.js — zajedničko stanje čekiranog kroz uređaje

   Telefon i računar rade nad ISTIM spiskom — spiskom onog korisnika čije
   ime stoji u configu. Server (Upstash) je izvor istine, a localStorage
   ostaje keš da aplikacija radi i bez interneta.

   Ime ide u zaglavlju X-Zikr-User i uzima se iz settings.js pri SVAKOM
   zahtjevu, nikad zapamćeno u varijabli: ime se može promijeniti usred rada,
   a zahtjev u letu mora nositi ono koje vrijedi sada.

   Bez imena se ne šalje ništa i ne povlači ništa — aplikacija radi lokalno.
   Tako se prvo otvaranje (dok korisnik ne upiše ime) ne upiše u tuđi spisak.

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
  var BOOTSTRAP_KEY = "moj-zikr-bootstrapped"; /* "korisnik|dan" zadnjeg uparivanja */

  /* Postavlja ga script.js — njemu se javlja stanje koje je stiglo gore. */
  var onState = null;

  /* ------------------------------------------------------------------------
     Stanje mreže — jedini koji ga prikazuje je offline.js

     Ovdje se ne crta ništa; sync.js samo javi u kakvom je stanju razgovor sa
     serverom, a šta se od toga vidi na ekranu odlučuje offline.js. Pet
     stanja, tim redom kojim se i dešavaju:

       "salje"   — ima neposlanog i upravo se šalje
       "ok"      — sve je uredu i ništa se nije ni pokvarilo (ekran šuti)
       "ceka"    — zahtjev je prošao ali je nešto ostalo u redu (rijetko:
                   klik napravljen dok je slanje bilo u letu)
       "offline" — zahtjev je PAO: nema mreže ili servera. Ono što je
                   čekirano čeka u localStorage-u i ide gore čim veza dođe
       "vraceno" — zahtjev je PRVI PUT prošao nakon što je prije toga pao, i
                   red je ispražnjen: veza se vratila i sve je otišlo gore

     Razlika između "ok" i "vraceno" je cijeli razlog što ovaj registar
     postoji. Uspješan zahtjev je obična stvar i dešava se na svaku kvačicu —
     njega niko ne treba vidjeti. Vijest je jedino kad je nešto prije toga
     ZAISTA palo pa se popravilo, i to javlja "vraceno", tačno jednom po
     prekidu. Zato ga ne pali `navigator.onLine` (koji na localhostu i na
     wifiju bez interneta ume slagati u oba smjera) nego jedini pouzdan znak:
     zahtjev koji nije prošao.

     Uz stanje ide i BROJ: kod "offline" koliko čeka, kod "vraceno" koliko je
     upravo otišlo gore.
     ------------------------------------------------------------------------ */
  var slusaci = [];
  var zadnjeStanje = "ok";
  var zadnjiBroj = 0;
  var zadnjiDatum = null;

  /* Je li od zadnjeg uspjeha ijedan zahtjev pao. Samo ovo daje pravo na
     "vraceno" — vidi gore. */
  var palo = false;

  function javi(stanje, broj) {
    /* Isto stanje se ne ponavlja — inače bi se pri svakom kliku "offline"
       javio iznova i animacija na ekranu krenula ispočetka. */
    if (stanje === zadnjeStanje && broj === zadnjiBroj) { return; }
    zadnjeStanje = stanje;
    zadnjiBroj = broj;
    slusaci.forEach(function (fn) {
      try { fn(stanje, broj); } catch (e) {}
    });
  }

  function brojCeka(date) {
    return Object.keys(readPending(date)).length;
  }

  /* ------------------------------------------------------------------------
     Korisnik

     Čita se iz settings.js pri svakom pozivu. Ako settings.js nije učitan
     (npr. neki drugi HTML), vraća "" i sinhronizacija se tiho gasi — bolje
     nego da se piše u proizvoljan prostor.
     ------------------------------------------------------------------------ */
  function user() {
    return (window.mojZikrConfig && window.mojZikrConfig.korisnik()) || "";
  }

  function headers(extra) {
    var head = extra || {};
    head["X-Zikr-User"] = user();
    return head;
  }

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
      headers: headers({ "Content-Type": "application/json" }),
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
      headers: headers({ "Accept": "application/json" })
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
    /* Bez imena nema prostora na serveru — aplikacija ostaje na lokalnom
       spisku. Provjerava se ovdje, na jednom mjestu kroz koje prolazi svaki
       poziv, umjesto u svakoj ulaznoj funkciji posebno. */
    if (!user()) { return Promise.resolve(); }

    /* Datum se pamti da bi ponovni pokušaj ispod znao za koji dan šalje —
       red neposlanog se vodi po danu. */
    zadnjiDatum = date;

    /* "Nema mreže" se NE nagađa iz `navigator.onLine`. Ta zastavica govori
       samo je li uređaj spojen na nešto, ne i ima li iza toga servera: na
       ugašenom wifiju localhost i dalje radi, a na hotelskoj mreži bez
       interneta `onLine` je uredno `true`. Kad se po njoj javljalo, traka je
       iskakala i onda kad je svaka kvačica uredno odlazila gore.

       Jedini pouzdan znak je zahtjev koji nije prošao — njega čeka `catch`
       ispod. Do tada se javlja samo da se šalje. */
    var ceka = brojCeka(date);
    /* Dok je već palo, "šaljem" se ne javlja: znamo da veze nema, pa bi svaki
       sljedeći klik na tren zamijenio "nema mreže" vrtiljkom i traka bi
       treperila. Ostaje na "nema mreže", a broj koji čeka osvježi `catch`. */
    if (ceka && !palo) { javi("salje", ceka); }

    chain = chain.then(function () {
      /* Koliko je čekalo prije ovog pokušaja — to je broj koji ide uz
         "vraceno", jer je to ono što je upravo otišlo gore. */
      var imalo = brojCeka(date);

      return send(date)
        .then(function (items) {
          if (items) { return { items: items, bilo: true }; }
          return wantPull
            ? get(date).then(function (pulled) { return { items: pulled, bilo: true }; })
            : { items: null, bilo: false };
        })
        .then(function (odgovor) {
          if (odgovor.items && onState) { onState(date, odgovor.items); }
          /* Samo ako se mreža zaista dodirnula. Poziv koji nije imao šta ni
             poslati ni povući ne dokazuje da veza postoji, pa ne smije
             obrisati oznaku "nema mreže" sa ekrana. */
          if (!odgovor.bilo) { return; }

          var ostalo = brojCeka(date);

          /* Oporavak: prije je padalo, sada je prošlo i red je prazan. Jedini
             trenutak u kojem se korisniku išta objavljuje. */
          if (palo && !ostalo) {
            palo = false;
            javi("vraceno", imalo);
            return;
          }

          javi(ostalo ? "ceka" : "ok", ostalo);
        })
        .catch(function () {
          /* Nema mreže ili backenda (npr. otvoreno kao obični static server).
             Aplikacija i dalje radi lokalno; pokušaće se ponovo. */
          palo = true;
          javi("offline", brojCeka(date));
        });
    });
    return chain;
  }

  /* ------------------------------------------------------------------------
     Ponovni pokušaj dok nešto čeka

     Povratak u aplikaciju i događaj `online` (oboje u script.js) hvataju
     najčešće slučajeve, ali ne sve: hotelski wifi na koji je uređaj spojen a
     interneta iza njega nema, ili server koji je nakratko pao — tada `online`
     ne dolazi jer se sa stanovišta uređaja ništa nije promijenilo.

     Zato i sat. Dvadeset sekundi je dovoljno rijetko da ne troši bateriju, a
     dovoljno često da se kvačica napravljena u liftu nađe gore prije nego što
     korisnik i primijeti. Kad je red prazan, ovo ne radi ništa.
     ------------------------------------------------------------------------ */
  setInterval(function () {
    if (!zadnjiDatum) { return; }
    if (!brojCeka(zadnjiDatum)) { return; }
    sync(zadnjiDatum, false);
  }, 20 * 1000);


  /* ------------------------------------------------------------------------
     Prvo otvaranje u danu na ovom uređaju

     Ono što je već čekirano lokalno se prvo POŠALJE gore, pa tek onda
     preuzima stanje sa servera. Bez ovoga bi prvo povlačenje obrisalo
     checkmarke napravljene prije nego je dijeljenje uopšte postojalo.
     Šalju se samo čekirane stavke — ništa se ne skida, pa se ne može
     pregaziti ono što je drugi uređaj odčekirao.

     Zapis nosi I KORISNIKA, ne samo dan. Zbog toga se uparivanje ponovi kad
     se ime promijeni usred dana: ono što je čekirano prije upisa imena
     (ili pod prethodnim imenom) ode u novi spisak umjesto da ostane samo na
     ovom uređaju do sutra. Isto pokriva i prelazak sa zatečene verzije, gdje
     imena još nije bilo.
     ------------------------------------------------------------------------ */
  function bootstrap(date, localItems) {
    var mark = user() + "|" + date;
    var last = null;
    try { last = localStorage.getItem(BOOTSTRAP_KEY); } catch (e) { last = null; }
    if (last === mark) { return; }

    var map = readPending(date);
    Object.keys(localItems || {}).forEach(function (id) {
      if (localItems[id]) { map[id] = true; }
    });
    writePending(date, map);

    try { localStorage.setItem(BOOTSTRAP_KEY, mark); } catch (e) {}
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
    refresh: function (date) { return sync(date, true); },

    /* fn(stanje, broj) — "salje" | "ok" | "ceka" | "offline" | "vraceno" i
       broj uz njega. Zove ga offline.js; javi se odmah sa zatečenim stanjem,
       da traka ne mora čekati prvu promjenu da bi znala gdje smo. */
    onStatus: function (fn) {
      if (typeof fn !== "function") { return; }
      slusaci.push(fn);
      try { fn(zadnjeStanje, zadnjiBroj); } catch (e) {}
    }
  };

})();
