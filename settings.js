/* ==========================================================================
   settings.js — config korisnika i drawer u kojem se podešava.

   Tri stvari, ni jedna više:

     ime           određuje ČIJI je spisak. Svi uređaji sa istim imenom vide
                   isto čekirano; dva imena su dva odvojena spiska. Ime nije
                   lozinka i ovdje se ne pravi utisak da jeste — ko upiše
                   tuđe ime, vidi tuđi spisak. Za porodičnu aplikaciju je to
                   dovoljno i namjerno tako: drugi telefon iste osobe se
                   prijavi istim imenom i odmah je uparen.

     transkripcija umjesto arapskog teksta prikazuje transliteraciju iz
                   data.js. ZAMJENA, ne dodatak — ispod je i dalje prevod.

     petak         (i svaka druga sekcija sa `optional: true`) postoji ili ne
                   postoji. Ugašena nestaje i sa ekrana i iz računa
                   podsjetnika, jer server gleda isti taj config.

   Prekidači se NE nabrajaju ovdje. Poseban je samo `transkript`; sve ostalo
   je spisak `optionalSections()` iz data.js, pa nova takva sekcija sama
   dobije svoj red u drawer-u.

   Podsjetnici (zvono) su premješteni u ovaj drawer, ali ih i dalje vodi
   notifications.js — ovdje se samo pravi red u koji on ubaci svoje dugme.
   Zato drawer nastaje ODMAH pri učitavanju, a ne pri prvom otvaranju: kad
   notifications.js krene, njegov `notifyBtn` mora već postojati.

   Šta ide gore na server, a šta ostaje ovdje:

     server (cfg:<ime>)   oba prekidača — da drugi uređaj istog korisnika
                          zatekne isto stanje, i da scheduler zna za petak
     localStorage         ime i kopija prekidača, da aplikacija zna šta da
                          nacrta prije nego odgovor sa servera stigne, i da
                          radi bez mreže
   ========================================================================== */

(function () {
  "use strict";

  var NAME_KEY = "moj-zikr-ime";
  var PREFS_KEY = "moj-zikr-config";

  /* Ime -> ključ prostora. Isto pravilo kao `userKey()` u api/_lib.js, i to
     mora ostati tako: ovo je ono što ide u zaglavlje zahtjeva.

     Dva razloga zašto se normalizuje već ovdje, a ne tek na serveru:
       1. zaglavlje HTTP zahtjeva ne smije nositi naša slova — fetch pukne na
          svemu van ISO-8859-1, pa bi "Šejla" srušila svaki poziv;
       2. isti ključ mora izaći i sa telefona i sa računara, inače bi "Haris"
          i "haris " bila dva odvojena spiska.

     Server svejedno normalizuje još jednom. To nije duplo posao nego
     zaštita: nad već sređenim ključem njegova funkcija ništa ne mijenja, pa
     sitna razlika u ova dva pravila ne može razdvojiti uređaje. */
  function kljuc(raw) {
    var map = { "č": "c", "ć": "c", "ž": "z", "š": "s", "đ": "d" };
    return String(raw || "")
      .toLowerCase()
      .replace(/[čćžšđ]/g, function (ch) { return map[ch]; })
      .replace(/[\s._]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32);
  }

  /* ------------------------------------------------------------------------
     Stanje
     ------------------------------------------------------------------------ */

  /* Spisak sekcija koje se smiju ugasiti — iz data.js, ne prepisan ovdje. */
  function optionalne() {
    return (typeof optionalSections === "function") ? optionalSections() : [];
  }

  function podrazumijevano() {
    var out = { transkript: false };
    optionalne().forEach(function (section) { out[section.id] = true; });
    return out;
  }

  /* Prihvata samo poznata polja i samo boolean — isto kao `cleanPrefs()` na
     serveru. Sve ostalo pada na podrazumijevano, pa pokvaren ili zastario
     zapis u localStorage-u ne može ostaviti aplikaciju u čudnom stanju. */
  function ocisti(raw) {
    var out = podrazumijevano();
    if (!raw || typeof raw !== "object") { return out; }
    Object.keys(out).forEach(function (id) {
      if (typeof raw[id] === "boolean") { out[id] = raw[id]; }
    });
    return out;
  }

  var ime = "";
  try { ime = localStorage.getItem(NAME_KEY) || ""; } catch (e) { ime = ""; }

  var config = (function () {
    try { return ocisti(JSON.parse(localStorage.getItem(PREFS_KEY))); }
    catch (e) { return podrazumijevano(); }
  })();

  function zapamtiIme() {
    try { localStorage.setItem(NAME_KEY, ime); } catch (e) {}
  }

  function zapamtiConfig() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(config)); } catch (e) {}
  }

  /* Svi koje zanima promjena: script.js (ponovo crta), sync.js (ponovo se
     upari) i notifications.js (prepiše ime uz pretplatu). */
  var slusaoci = [];

  function javi() {
    slusaoci.forEach(function (fn) {
      try { fn(config, kljuc(ime)); } catch (e) {}
    });
  }

  /* ------------------------------------------------------------------------
     Server

     Config putuje CIJEL, za razliku od kvačica koje idu kao promjene:
     mijenja se rijetko i sa jednog uređaja, pa nema šta da se gazi.
     ------------------------------------------------------------------------ */

  function zaglavlja(extra) {
    var head = extra || {};
    var user = kljuc(ime);
    if (user) { head["X-Zikr-User"] = user; }
    return head;
  }

  /* Vraća `known` sa servera: je li ime već postojalo prije ovog poziva.
     Null znači "nije se moglo saznati" (nema mreže ili backenda). */
  function povuci() {
    if (!kljuc(ime)) { return Promise.resolve(null); }

    return fetch("/api/prefs", { headers: zaglavlja({ "Accept": "application/json" }) })
      .then(function (res) {
        if (!res.ok) { throw new Error("prefs " + res.status); }
        return res.json();
      })
      .then(function (data) {
        var stiglo = ocisti(data && data.prefs);
        /* Bez promjene se ne javlja nikom — inače bi svako otvaranje
           aplikacije ponovo iscrtalo cijeli spisak i pokvarilo skrol. */
        if (JSON.stringify(stiglo) !== JSON.stringify(config)) {
          config = stiglo;
          zapamtiConfig();
          javi();
        }
        return !!(data && data.known);
      })
      .catch(function () { return null; });
  }

  function posalji() {
    if (!kljuc(ime)) { return Promise.resolve(); }

    return fetch("/api/prefs", {
      method: "POST",
      headers: zaglavlja({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefs: config })
    }).catch(function () {
      /* Nema mreže — ostaje lokalno i otići će pri sljedećoj promjeni.
         Config se ne stavlja u red čekanja kao kvačice: zadnja postavka
         pobjeđuje, pa nema šta da se izgubi osim jednog kruga. */
    });
  }

  /* ------------------------------------------------------------------------
     Drawer

     Isti oblik i ista klasa (`drawer`) kao "Vidi stranicu" — jedan izgled
     ploče na dnu ekrana, a ne dva koja se raziđu.
     ------------------------------------------------------------------------ */

  var el = {};
  var otvoren = false;

  function p(className, text) {
    var node = document.createElement("p");
    node.className = className;
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  /* Red sa prekidačem. `onChange` dobija novo stanje. */
  function redPrekidac(id, naslov, opis) {
    var row = document.createElement("div");
    row.className = "set-row";

    var text = document.createElement("div");
    text.className = "set-text";
    var label = document.createElement("label");
    label.className = "set-label";
    label.setAttribute("for", "set-" + id);
    label.textContent = naslov;
    text.appendChild(label);
    text.appendChild(p("set-note", opis));

    var wrap = document.createElement("span");
    wrap.className = "switch";

    var input = document.createElement("input");
    input.type = "checkbox";
    input.className = "switch-input";
    input.id = "set-" + id;
    input.checked = config[id] === true;

    var knob = document.createElement("span");
    knob.className = "switch-knob";

    var track = document.createElement("span");
    track.className = "switch-track";
    track.setAttribute("aria-hidden", "true");
    track.appendChild(knob);

    /* Input je pravi checkbox razvučen preko cijelog prekidača i providan —
       tako klik, fokus i čitač ekrana rade sami od sebe, bez ijedne linije
       koja bi glumila kontrolu. Traka ispod je samo slika stanja. */
    wrap.appendChild(input);
    wrap.appendChild(track);

    input.addEventListener("change", function () {
      config[id] = input.checked;
      zapamtiConfig();
      javi();
      posalji();
    });

    row.appendChild(text);
    row.appendChild(wrap);
    return { row: row, input: input };
  }

  function build() {
    el.drawer = document.createElement("div");
    el.drawer.className = "drawer drawer-settings";
    el.drawer.setAttribute("role", "dialog");
    el.drawer.setAttribute("aria-modal", "true");
    el.drawer.setAttribute("aria-label", "Postavke");
    el.drawer.hidden = true;

    var sheet = document.createElement("div");
    sheet.className = "drawer-sheet";

    /* --- zaglavlje --- */
    var head = document.createElement("div");
    head.className = "drawer-head";

    var titles = document.createElement("div");
    titles.appendChild(p("drawer-title", "Postavke"));

    var close = document.createElement("button");
    close.type = "button";
    close.className = "drawer-close";
    close.setAttribute("aria-label", "Zatvori");
    close.textContent = "✕";
    close.addEventListener("click", zatvori);

    head.appendChild(titles);
    head.appendChild(close);

    /* --- tijelo --- */
    var body = document.createElement("div");
    body.className = "drawer-body set-body";

    /* Ime */
    var field = document.createElement("div");
    field.className = "set-field";

    var nameLabel = document.createElement("label");
    nameLabel.className = "set-label";
    nameLabel.setAttribute("for", "setName");
    nameLabel.textContent = "Ime";
    field.appendChild(nameLabel);

    el.name = document.createElement("input");
    el.name.type = "text";
    el.name.id = "setName";
    el.name.className = "set-input";
    el.name.value = ime;
    el.name.placeholder = "npr. Haris";
    el.name.setAttribute("autocomplete", "off");
    el.name.setAttribute("autocapitalize", "words");
    el.name.setAttribute("spellcheck", "false");
    el.name.setAttribute("maxlength", "32");
    field.appendChild(el.name);

    el.hint = p("set-hint", "");
    field.appendChild(el.hint);
    body.appendChild(field);

    /* Ime se ne prihvata na svaki pritisak tipke — na Enter i na izlazak iz
       polja. Inače bi se prostor mijenjao usred kucanja: "H", "Ha", "Har"
       bi svaki bio svoj spisak i svaki bi otišao u bazu. */
    el.name.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); el.name.blur(); }
    });
    el.name.addEventListener("blur", function () { primiIme(el.name.value); });

    /* Prekidači */
    el.switches = {};

    var t = redPrekidac("transkript", "Transkripcija",
      "Umjesto arapskog teksta prikaži transkripciju. Prevod ostaje ispod.");
    el.switches.transkript = t.input;
    body.appendChild(t.row);

    optionalne().forEach(function (section) {
      var s = redPrekidac(section.id, section.title,
        "Prikaži sekciju „" + section.title + "“ i njen podsjetnik.");
      el.switches[section.id] = s.input;
      body.appendChild(s.row);
    });

    /* Podsjetnici — red pravi ovaj fajl, dugme u njega stavlja
       notifications.js (traži ga po id-u `notifyBtn`). */
    var notifyRow = document.createElement("div");
    notifyRow.className = "set-row";

    var notifyText = document.createElement("div");
    notifyText.className = "set-text";
    notifyText.appendChild(p("set-label", "Podsjetnici"));
    notifyText.appendChild(p("set-note",
      "Obavijest na telefon dok dnevni zikr nije završen."));

    notifyRow.appendChild(notifyText);
    notifyRow.appendChild(notifyMjesto());
    body.appendChild(notifyRow);

    /* Status podsjetnika (greška, uputa za iOS) ide ispod cijelog reda —
       zna biti dug, pa ne stane pored dugmeta. */
    var status = p("notify-status", "");
    status.id = "notifyStatus";
    body.appendChild(status);

    /* Izlaz na dnu, pored ✕ u zaglavlju. Palac na telefonu je dolje, a spisak
       postavki je duži od ekrana — dok se doskrola do kraja, ✕ je već otišao
       gore. Isti tekst i isti oblik kao dugme na završnom ekranu, da "nazad
       na spisak" svugdje izgleda jednako. */
    var back = document.createElement("button");
    back.type = "button";
    back.className = "set-back";
    back.textContent = "Nazad na dove";
    back.addEventListener("click", zatvori);
    body.appendChild(back);

    sheet.appendChild(head);
    sheet.appendChild(body);
    el.drawer.appendChild(sheet);

    el.drawer.addEventListener("click", function (e) {
      if (e.target === el.drawer) { zatvori(); }
    });

    document.body.appendChild(el.drawer);
  }

  /* Dugme za podsjetnike — isti SVG i isti id koji notifications.js očekuje.
     Stoji ovdje jer ga je drawer i dogradio; notifications.js mu samo mijenja
     stanje i naziv. */
  function notifyMjesto() {
    var NS = "http://www.w3.org/2000/svg";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "notify-btn";
    btn.id = "notifyBtn";
    btn.setAttribute("aria-label", "Uključi podsjetnike");
    btn.title = "Uključi podsjetnike";

    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "notify-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    [
      ["M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9", ""],
      ["M13.73 21a2 2 0 0 1-3.46 0", ""],
      /* crta se samo dok su podsjetnici isključeni (CSS) */
      ["M4 4l16 16", "bell-slash"]
    ].forEach(function (pair) {
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", pair[0]);
      if (pair[1]) { path.setAttribute("class", pair[1]); }
      svg.appendChild(path);
    });

    btn.appendChild(svg);
    return btn;
  }

  /* ------------------------------------------------------------------------
     Ime — prihvatanje i posljedice
     ------------------------------------------------------------------------ */

  function pisiHint(text, tone) {
    if (!el.hint) { return; }
    el.hint.textContent = text || "";
    el.hint.className = "set-hint" + (tone ? " is-" + tone : "");
  }

  function primiIme(raw) {
    var novo = String(raw || "").trim().slice(0, 32);
    var noviKljuc = kljuc(novo);

    /* Upisano je nešto od čega ne ostane ni jedno slovo (npr. samo znakovi
       interpunkcije) — to nije ime i ne pravi prostor. */
    if (novo && !noviKljuc) {
      pisiHint("Ime mora imati bar jedno slovo ili broj.", "warn");
      return;
    }

    if (noviKljuc === kljuc(ime)) {
      /* Isti prostor, možda drugačije napisano ("haris" -> "Haris").
         Zapamti kako je otkucano, ali ne diraj ništa drugo. */
      if (novo !== ime) { ime = novo; zapamtiIme(); }
      return;
    }

    ime = novo;
    zapamtiIme();

    if (!noviKljuc) {
      pisiHint("Bez imena spisak ostaje samo na ovom uređaju.", "warn");
      javi();
      return;
    }

    /* Novi korisnik — njegov config sa servera zamjenjuje zatečeni. Dok
       odgovor ne stigne, na ekranu stoji config prethodnog korisnika; to je
       vidljivo najviše koliko traje jedan zahtjev, a bez mreže ostaje dok se
       veza ne vrati. Zamjena praznim configom bila bi gora: spisak bi
       zatreptao na podrazumijevano pa nazad. */
    pisiHint("Uparujem…", null);
    javi();

    povuci().then(function (known) {
      osvjeziPrekidace();
      if (known === null) {
        pisiHint("Nema veze sa serverom — spisak je za sada samo ovdje.", "warn");
        return;
      }
      pisiHint(known
        ? "Ime već postoji — spojen si na njegov spisak."
        : "Novo ime — kreće čist spisak.", known ? "ok" : null);
    });
  }

  function osvjeziPrekidace() {
    Object.keys(el.switches || {}).forEach(function (id) {
      el.switches[id].checked = config[id] === true;
    });
  }

  /* ------------------------------------------------------------------------
     Otvaranje i zatvaranje
     ------------------------------------------------------------------------ */

  function otvori() {
    if (!el.drawer) { return; }
    osvjeziPrekidace();
    el.drawer.hidden = false;
    otvoren = true;
    document.body.classList.add("no-scroll");
    /* Bez imena je ime i jedino što treba uraditi — kursor ide tamo. */
    if (!kljuc(ime)) { el.name.focus(); }
    else { el.drawer.querySelector(".drawer-close").focus(); }
  }

  function zatvori() {
    if (!el.drawer || el.drawer.hidden) { return; }
    /* Ime otkucano pa zatvoreno bez izlaska iz polja — svejedno se prima. */
    if (document.activeElement === el.name) { primiIme(el.name.value); }
    el.drawer.hidden = true;
    otvoren = false;
    document.body.classList.remove("no-scroll");
    if (el.open) { el.open.focus(); }
  }

  /* ------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------ */

  build();

  el.open = document.getElementById("settingsBtn");
  if (el.open) {
    el.open.addEventListener("click", function () {
      if (otvoren) { zatvori(); } else { otvori(); }
    });
  }

  /* Escape zatvara — isto kao kod "Vidi stranicu". Taj drawer ima svoj
     osluškivač u script.js; ovaj ovdje gleda samo sebe, pa se ne miješaju. */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && otvoren) { zatvori(); }
  });

  window.mojZikrConfig = {
    /* ime kako je otkucano — za prikaz */
    ime: function () { return ime; },
    /* ključ prostora — ovo ide u zaglavlje zahtjeva, "" ako imena nema */
    korisnik: function () { return kljuc(ime); },
    /* { transkript, petak, ... } — uvijek cijel, nikad null */
    prefs: function () {
      var copy = {};
      Object.keys(config).forEach(function (k) { copy[k] = config[k]; });
      return copy;
    },
    /* fn(prefs, korisnik) pri svakoj promjeni imena ili prekidača */
    naPromjenu: function (fn) { slusaoci.push(fn); },
    otvori: otvori,
    zatvori: zatvori
  };

  /* Povlačenje sa servera tek nakon što se ostali fajlovi učitaju i prijave
     na `naPromjenu` — inače bi brz odgovor stigao prije nego iko sluša, pa
     bi se promjena tiho izgubila. */
  setTimeout(function () {
    if (kljuc(ime)) {
      povuci().then(osvjeziPrekidace);
    } else {
      /* Prvo pokretanje: bez imena se ništa ne dijeli, a to se ne vidi
         nigdje na ekranu — zato se postavke otvore same, jednom. */
      otvori();
      pisiHint("Upiši ime da bi se spisak dijelio između tvojih uređaja.", null);
    }
  }, 0);

})();
