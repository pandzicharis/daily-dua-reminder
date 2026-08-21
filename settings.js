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

     spisak stavki kvačica po dovi, u akordeonu po sekciji. Ko ne radi dio
                   dnevnog ili večernjeg zikra ne mora ga ni gledati.
                   Isključena stavka nestaje i sa ekrana i iz računa
                   podsjetnika, a sekcija kojoj je isključeno sve nestaje
                   cijela.

   Prekidača za cijelu sekciju nema. Postojao je (petak), ali kvačice rade
   isto i na jednom mjestu: isključi svih pet petačkih stavki i sekcije nema,
   kao ni njenog podsjetnika. Zbog toga je `transkript` jedini prekidač.

   Spisak sekcija se NE nabraja ovdje — akordeoni se prave iz
   `pickableSections()` u data.js, pa nova sekcija sa spiskom sama dobije svoj.

   Podsjetnici (zvono) su premješteni u ovaj drawer, ali ih i dalje vodi
   notifications.js — ovdje se samo pravi red u koji on ubaci svoje dugme.
   Zato drawer nastaje ODMAH pri učitavanju, a ne pri prvom otvaranju: kad
   notifications.js krene, njegov `notifyBtn` mora već postojati.

   Šta ide gore na server, a šta ostaje ovdje:

     server (cfg:<ime>)   transkripcija i spisak isključenih stavki — da
                          drugi uređaj istog korisnika zatekne isto stanje, i
                          da scheduler zna šta se uopšte broji
     localStorage         ime i kopija svega toga, da aplikacija zna šta da
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

  /* Sekcije čije se pojedinačne stavke smiju isključiti — iz data.js, ne
     prepisane ovdje. Spisak stavki se nikad ne piše u ovom fajlu; nova dova u
     data.js sama dobije svoju kvačicu. */
  function birljive() {
    return (typeof pickableSections === "function") ? pickableSections() : [];
  }

  /* Stavke jedne sekcije — takođe iz data.js, jer Kur'an svoju jedinu stavku
     nema u `items` (vidi `sectionItems()` tamo). */
  function stavke(section) {
    return (typeof sectionItems === "function")
      ? sectionItems(section)
      : (section.items || []);
  }

  /* Svi id-evi koje `skriveno` smije nositi — po njima se odbacuje zastario
     zapis (dova obrisana iz data.js). */
  function poznateStavke() {
    var out = {};
    birljive().forEach(function (section) {
      stavke(section).forEach(function (item) { out[item.id] = true; });
    });
    return out;
  }

  /* `skriveno` je spisak SAKRIVENIH, ne prikazanih: podrazumijevano je "sve
     se vidi", pa nova dova ne mora ni u čijem configu biti dopisana. */
  function podrazumijevano() {
    return { transkript: false, skriveno: [] };
  }

  /* Prihvata samo poznata polja i samo boolean (uz `skriveno`, koje je spisak
     id-eva) — isto kao `cleanPrefs()` na serveru. Sve ostalo pada na
     podrazumijevano, pa pokvaren ili zastario zapis u localStorage-u ne može
     ostaviti aplikaciju u čudnom stanju. */
  function ocisti(raw) {
    var out = podrazumijevano();
    if (!raw || typeof raw !== "object") { return out; }

    Object.keys(out).forEach(function (id) {
      if (id === "skriveno") { return; }
      if (typeof raw[id] === "boolean") { out[id] = raw[id]; }
    });

    /* Bez duplikata i uvijek sortirano. Sortiranje nije kozmetika: `povuci()`
       poredi config sa servera sa ovim preko JSON.stringify, pa bi isti spisak
       u drugom redoslijedu prošao kao promjena i ponovo iscrtao cijeli ekran. */
    if (Array.isArray(raw.skriveno)) {
      var poznato = poznateStavke();
      var vidjeno = {};
      out.skriveno = raw.skriveno.filter(function (id) {
        if (typeof id !== "string" || !poznato[id] || vidjeno[id]) { return false; }
        vidjeno[id] = true;
        return true;
      }).sort();
    }

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

  function posaljiSad() {
    if (!kljuc(ime)) { return; }

    fetch("/api/prefs", {
      method: "POST",
      headers: zaglavlja({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefs: config })
    }).catch(function () {
      /* Nema mreže — ostaje lokalno i otići će pri sljedećoj promjeni.
         Config se ne stavlja u red čekanja kao kvačice: zadnja postavka
         pobjeđuje, pa nema šta da se izgubi osim jednog kruga. */
    });
  }

  /* Slanje se sabija u jedan zahtjev. Prekidača je par i tu je svejedno, ali
     prolaz kroz spisak dova je desetak kvačica u nekoliko sekundi — a config
     ide CIJEL i zadnji pobjeđuje, pa deset zahtjeva nose istu informaciju kao
     jedan zadnji.

     `posalji(true)` šalje bez čekanja. Zatvaranje drawer-a to koristi, da se
     zadnja kvačica ne rastane od zatvorene aplikacije. */
  var cekaSlanje = null;

  function posalji(odmah) {
    if (cekaSlanje) { clearTimeout(cekaSlanje); cekaSlanje = null; }
    if (!kljuc(ime)) { return; }
    if (odmah) { posaljiSad(); return; }
    cekaSlanje = setTimeout(function () {
      cekaSlanje = null;
      posaljiSad();
    }, 500);
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
  /* Sam prekidač, bez reda oko sebe — koriste ga i red u postavkama i
     zaglavlje akordeona.

     Input je pravi checkbox razvučen preko cijelog prekidača i providan: tako
     klik, fokus i čitač ekrana rade sami od sebe, bez ijedne linije koja bi
     glumila kontrolu. Traka ispod je samo slika stanja. */
  function prekidac(id) {
    var wrap = document.createElement("span");
    wrap.className = "switch";

    var input = document.createElement("input");
    input.type = "checkbox";
    input.className = "switch-input";
    if (id) { input.id = "set-" + id; }

    var knob = document.createElement("span");
    knob.className = "switch-knob";

    var track = document.createElement("span");
    track.className = "switch-track";
    track.setAttribute("aria-hidden", "true");
    track.appendChild(knob);

    wrap.appendChild(input);
    wrap.appendChild(track);

    return { wrap: wrap, input: input };
  }

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

    var sw = prekidac(id);
    sw.input.checked = config[id] === true;

    sw.input.addEventListener("change", function () {
      config[id] = sw.input.checked;
      zapamtiConfig();
      javi();
      posalji();
    });

    row.appendChild(text);
    row.appendChild(sw.wrap);
    return { row: row, input: sw.input };
  }

  /* ------------------------------------------------------------------------
     Spisak stavki — akordeon po sekciji

     Svaki akordeon ima dvije kontrole u zaglavlju: naslov (otvara i zatvara
     spisak) i prekidač — je li sekcija uopšte na spisku. Prekidač NE pamti
     svoje stanje nego ga čita iz kvačica, i ima samo dva položaja:

       upaljen   prikazuje se bar jedna stavka
       ugašen    ni jedna, pa sekcije nema ni na ekranu ni u podsjetniku

     Zato prekidača za sekciju nema u configu: jedini zapis je `skriveno`, pa
     se ne mogu razići. Gašenje isključi sve, paljenje uključi sve.

     Fina podjela je unutra: kvačica po stavci i „Označi sve / Odznači sve“ na
     vrhu spiska, jer se 34 kvačice ne prolaze jedna po jedna. Da je sekcija
     djelimična vidi se po brojci (4 / 6, zlatna) — prekidač o tome ne govori.

     Sekcija sa samo jednom stavkom (Kur'an) nema šta da rasklopi: dobija
     obični red sa prekidačem, bez šiljka i bez spiska koji bi ponovio isto.

     Ostalo stoji sklopljeno jer je predugo da bi stajalo otvoreno: sama
     sekcija „Dove“ ima 34 reda, a u postavke se najčešće ulazi zbog imena i
     podsjetnika.
     ------------------------------------------------------------------------ */

  /* Iscrtani akordeoni — po njima `osvjeziStavke()` vraća kvačice u stanje
     koje je stiglo sa servera. */
  var akordeoni = [];

  function jeSkriveno(id) {
    return config.skriveno.indexOf(id) !== -1;
  }

  /* Vraća true samo ako se stanje stvarno promijenilo — pozivalac po tome zna
     treba li iscrtavati i slati. */
  function postaviPrikaz(id, prikazi) {
    var i = config.skriveno.indexOf(id);
    if (prikazi && i !== -1) { config.skriveno.splice(i, 1); return true; }
    if (!prikazi && i === -1) { config.skriveno.push(id); config.skriveno.sort(); return true; }
    return false;
  }

  /* Jedna promjena spiska: zapamti, osvježi kvačice, javi ekranu, pošalji. */
  function primiPrikaz() {
    zapamtiConfig();
    osvjeziStavke();
    javi();
    posalji();
  }

  /* Naslov dove je samo broj ("DOVA #7"), pa se po njemu ne zna koja je —
     ispod ide početak prevoda. Prevod, a ne arapski: po njemu se i bira. */
  function opisStavke(item) {
    if (item.type !== "dua") { return ""; }
    var text = String(item.translation || item.transliteration || "").trim();
    if (!text) { return ""; }
    if (text.length <= 78) { return text; }
    /* Rez na zadnjoj cijeloj riječi — presječena riječ izgleda kao greška. */
    return text.slice(0, 78).replace(/[\s.,;:!?]+\S*$/, "") + "…";
  }

  /* Pali ili gasi sve stavke sekcije odjednom. */
  function postaviSve(items, prikazi) {
    var promjena = false;
    items.forEach(function (item) {
      if (postaviPrikaz(item.id, prikazi)) { promjena = true; }
    });
    if (promjena) { primiPrikaz(); } else { osvjeziStavke(); }
  }

  /* Isti znak koji sekcija nosi na listi (data.js). Ovdje je da se red u
     postavkama i naslov na ekranu prepoznaju kao ista stvar. */
  function ikona(section) {
    return (typeof makeSectionIcon === "function")
      ? makeSectionIcon(section.icon, "set-acc-icon")
      : null;
  }

  function akordeon(section) {
    var titles = (typeof itemTitles === "function") ? itemTitles(section.id) : {};
    var items = stavke(section);
    var solo = items.length < 2;

    var box = document.createElement("div");
    box.className = "set-acc" + (solo ? " is-solo" : "");

    var head = document.createElement("div");
    head.className = "set-acc-head";

    /* Prekidač sekcije. Stanje mu daje `osvjeziStavke()`, ne ovaj klik —
       ugašen znači "ni jedna stavka", pa paljenje vraća sve. */
    var sw = prekidac("sek-" + section.id);
    sw.input.setAttribute("aria-label", "Prikaži „" + section.title + "“");
    sw.input.addEventListener("change", function () {
      postaviSve(items, sw.input.checked);
    });

    /* --- sekcija sa jednom stavkom: obični red, bez rasklapanja --- */
    if (solo) {
      var soloTitle = document.createElement("span");
      soloTitle.className = "set-acc-title";
      soloTitle.textContent = section.title;

      /* Kur'an je jedna stavka — umjesto "0 / 1" piše se "1 stranica",
         istim fontom kojim ostale sekcije pišu svoju brojku, na istoj liniji. */
      var soloCount = document.createElement("span");
      soloCount.className = "set-acc-count";
      soloCount.textContent = "1 stranica";

      var soloIcon = ikona(section);
      if (soloIcon) { head.appendChild(soloIcon); }
      head.appendChild(soloTitle);
      head.appendChild(soloCount);
      head.appendChild(sw.wrap);
      box.appendChild(head);

      return {
        node: box, items: items, inputs: {}, count: null, section: sw.input
      };
    }

    var body = document.createElement("div");
    body.className = "set-acc-body";
    body.id = "acc-" + section.id;
    body.hidden = true;

    /* Naslov je dugme, prekidač je checkbox — dvije kontrole, pa ne mogu biti
       jedan element. Checkbox u <button> nije dopušten, a klik po traci koji
       bi i otvarao spisak bio bi dvije radnje na jedan dodir. */
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "set-acc-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", body.id);

    var title = document.createElement("span");
    title.className = "set-acc-title";
    title.textContent = section.title;

    var count = document.createElement("span");
    count.className = "set-acc-count";

    var chevron = document.createElement("span");
    chevron.className = "set-acc-chevron";
    chevron.setAttribute("aria-hidden", "true");

    var icon = ikona(section);
    if (icon) { toggle.appendChild(icon); }
    toggle.appendChild(title);
    toggle.appendChild(count);
    toggle.appendChild(chevron);

    toggle.addEventListener("click", function () {
      var otvori = body.hidden;
      body.hidden = !otvori;
      toggle.setAttribute("aria-expanded", otvori ? "true" : "false");
      box.classList.toggle("is-open", otvori);
    });

    head.appendChild(toggle);
    head.appendChild(sw.wrap);

    /* „Označi sve / Odznači sve“ na vrhu spiska. Tekst prati stanje, pa dugme
       uvijek nudi ono što još nije učinjeno (piše ga `osvjeziStavke()`). */

    var inputs = {};

    items.forEach(function (item) {
      /* <label>, ne <div> sa handlerom: klik po cijelom redu prebacuje
         kvačicu sam od sebe, i red dolazi pod čitač ekrana kao jedna
         kontrola sa svojim imenom. */
      var row = document.createElement("label");
      row.className = "set-pick";

      var input = document.createElement("input");
      input.type = "checkbox";
      input.className = "check";
      input.checked = !jeSkriveno(item.id);

      var text = document.createElement("span");
      text.className = "set-pick-text";

      var label = document.createElement("span");
      label.className = "set-pick-title";
      label.textContent = titles[item.id] || item.title;
      text.appendChild(label);

      var opis = opisStavke(item);
      if (opis) {
        var note = document.createElement("span");
        note.className = "set-pick-note";
        note.textContent = opis;
        text.appendChild(note);
      }

      row.appendChild(input);
      row.appendChild(text);

      input.addEventListener("change", function () {
        if (postaviPrikaz(item.id, input.checked)) { primiPrikaz(); }
      });

      inputs[item.id] = input;
      body.appendChild(row);
    });

    box.appendChild(head);
    box.appendChild(body);

    return {
      node: box, items: items, inputs: inputs, count: count,
      section: sw.input
    };
  }

  /* Kvačice, brojka i prekidač sekcije u stanje iz `config`. Zove se i poslije
     odgovora sa servera, jer config može doći sa drugog uređaja.

     Ovdje je jedino mjesto gdje se piše stanje prekidača sekcije — on ga ne
     pamti nego ga uvijek dobije iz kvačica. */
  function osvjeziStavke() {
    akordeoni.forEach(function (acc) {
      var gore = 0;

      acc.items.forEach(function (item) {
        var on = !jeSkriveno(item.id);
        if (on) { gore += 1; }
        /* Sekcija sa jednom stavkom nema svoje kvačice — nju vodi prekidač. */
        var input = acc.inputs[item.id];
        if (input && input.checked !== on) { input.checked = on; }
      });

      var sve = acc.items.length;
      if (acc.count) { acc.count.textContent = gore + " / " + sve; }

      /* Prekidač ima samo dva položaja: ugašen znači "ni jedna stavka". Kad je
         djelimično, ostaje upaljen — da je nešto isključeno kaže brojka, a ne
         prekidač. */
      acc.section.checked = gore > 0;

      if (acc.all) {
        acc.all.textContent = (gore === sve) ? "Odznači sve" : "Označi sve";
      }

      /* Stanja i za oko: puna sekcija je obična, djelimična nosi zlatnu
         brojku, a prazna je cijela prigušena — ta se uopšte ne pojavljuje na
         spisku, pa se to mora vidjeti i odavde. */
      acc.node.classList.toggle("is-full", gore === sve);
      acc.node.classList.toggle("is-partial", gore > 0 && gore < sve);
      acc.node.classList.toggle("is-empty", gore === 0);
    });
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

    /* Polje i oznaka stanja dijele isti okvir, pa kvačica sjedi UNUTAR
       inputa — na desnom rubu, gdje je i pogled kad se ime otkuca. */
    var nameWrap = document.createElement("div");
    nameWrap.className = "set-input-wrap";

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
    nameWrap.appendChild(el.name);

    el.mark = oznakaStanja();
    nameWrap.appendChild(el.mark);
    field.appendChild(nameWrap);

    el.hint = p("set-hint", "");
    el.hint.hidden = true;
    field.appendChild(el.hint);
    body.appendChild(field);

    /* Ime se ne prihvata na svaki pritisak tipke — na Enter i na izlazak iz
       polja. Inače bi se prostor mijenjao usred kucanja: "H", "Ha", "Har"
       bi svaki bio svoj spisak i svaki bi otišao u bazu. */
    el.name.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); el.name.blur(); }
    });
    el.name.addEventListener("blur", function () { primiIme(el.name.value); });

    /* Prekidač — samo jedan. Sekcije se ne gase prekidačem nego kvačicama
       u spisku ispod (vidi komentar na vrhu fajla). */
    el.switches = {};

    var t = redPrekidac("transkript", "Transkripcija",
      "Umjesto arapskog teksta prikaži transkripciju. Prevod ostaje ispod.");
    el.switches.transkript = t.input;
    body.appendChild(t.row);

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

    /* Spisak stavki — na dnu jer je najduži dio postavki. Ime, prekidači i
       podsjetnici ostaju odmah pod rukom; spiskovi su ionako sklopljeni. */
    var birane = birljive();
    if (birane.length) {
      var pickHead = document.createElement("div");
      pickHead.className = "set-group-head";
      pickHead.appendChild(p("set-label", "Prikaz"));
      pickHead.appendChild(p("set-note",
        "Odaberi dove koje će se prikazati"));
      body.appendChild(pickHead);

      akordeoni = birane.map(function (section) {
        var acc = akordeon(section);
        body.appendChild(acc.node);
        return acc;
      });
      osvjeziStavke();
    }

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

  /* Napomena pod poljem se SKRIVA kad je prazna. Prije je stalno držala jedan
     prazan red (`min-height`) da se spisak ne pomjeri kad se tekst pojavi, ali
     taj red je bio prazan skoro uvijek — pa je ispod imena stajala rupa. */
  function pisiHint(text, tone) {
    if (!el.hint) { return; }
    el.hint.textContent = text || "";
    el.hint.className = "set-hint" + (tone ? " is-" + tone : "");
    el.hint.hidden = !text;
  }

  /* Oznaka u desnom rubu polja za ime. Tri stanja:

       ""          ništa se ne dešava — oznake nema
       "cuva"      zahtjev je u zraku (vrti se prsten)
       "spaseno"   zapamćeno (kvačica, sama izblijedi)

     Zašto uopšte: ime se ne prima na svaki pritisak tipke nego na Enter i na
     izlazak iz polja, pa se bez ikakvog znaka ne vidi je li primljeno. Tekst
     ispod polja to kaže samo kad se PROSTOR promijeni; kad se ispravi samo
     način pisanja ("haris" -> "Haris"), nema šta da se ispiše a jeste
     zapamćeno. */
  function oznakaStanja() {
    var NS = "http://www.w3.org/2000/svg";

    var wrap = document.createElement("span");
    wrap.className = "set-mark";
    wrap.setAttribute("aria-hidden", "true");

    var spin = document.createElement("span");
    spin.className = "set-mark-spin";
    wrap.appendChild(spin);

    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "set-mark-check");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.4");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", "M4 12.5l5 5L20 6.5");
    svg.appendChild(path);
    wrap.appendChild(svg);

    return wrap;
  }

  /* Kvačica sama sklizne za par sekundi — inače bi stajala do sljedeće
     promjene i izgledala kao trajno stanje polja, a ne kao odgovor na radnju. */
  var markTimer = null;

  function pisiOznaku(stanje) {
    if (!el.mark) { return; }
    if (markTimer) { clearTimeout(markTimer); markTimer = null; }
    el.mark.className = "set-mark" + (stanje ? " is-" + stanje : "");
    if (stanje === "spaseno") {
      markTimer = setTimeout(function () {
        markTimer = null;
        el.mark.className = "set-mark";
      }, 2200);
    }
  }

  function primiIme(raw) {
    var novo = String(raw || "").trim().slice(0, 32);
    var noviKljuc = kljuc(novo);

    /* Upisano je nešto od čega ne ostane ni jedno slovo (npr. samo znakovi
       interpunkcije) — to nije ime i ne pravi prostor. */
    if (novo && !noviKljuc) {
      pisiOznaku("");
      pisiHint("Ime mora imati bar jedno slovo ili broj.", "warn");
      return;
    }

    if (noviKljuc === kljuc(ime)) {
      /* Isti prostor, možda drugačije napisano ("haris" -> "Haris").
         Zapamti kako je otkucano, ali ne diraj ništa drugo. */
      if (novo !== ime) { ime = novo; zapamtiIme(); pisiOznaku("spaseno"); }
      return;
    }

    ime = novo;
    zapamtiIme();

    if (!noviKljuc) {
      pisiOznaku("");
      pisiHint("Bez imena spisak ostaje samo na ovom uređaju.", "warn");
      javi();
      return;
    }

    /* Novi korisnik — njegov config sa servera zamjenjuje zatečeni. Dok
       odgovor ne stigne, na ekranu stoji config prethodnog korisnika; to je
       vidljivo najviše koliko traje jedan zahtjev, a bez mreže ostaje dok se
       veza ne vrati. Zamjena praznim configom bila bi gora: spisak bi
       zatreptao na podrazumijevano pa nazad. */
    pisiOznaku("cuva");
    pisiHint("Uparujem…", null);
    javi();

    povuci().then(function (known) {
      osvjeziPrekidace();
      if (known === null) {
        /* Ime je zapamćeno lokalno, ali nije stiglo gore — kvačica bi tu bila
           laž, pa je nema. Poruka ispod polja to kaže riječima. */
        pisiOznaku("");
        pisiHint("Nema veze sa serverom — spisak je za sada samo ovdje.", "warn");
        return;
      }
      pisiOznaku("spaseno");
      pisiHint(known
        ? "Ime već postoji — spojen si na njegov spisak."
        : "Novo ime — kreće čist spisak.", known ? "ok" : null);
    });
  }

  function osvjeziPrekidace() {
    Object.keys(el.switches || {}).forEach(function (id) {
      el.switches[id].checked = config[id] === true;
    });
    osvjeziStavke();
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
    /* Zadnja kvačica u spisku možda još čeka svoj krug — ne čeka se dalje. */
    if (cekaSlanje) { posalji(true); }
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
    /* { transkript, skriveno: [...] } — uvijek cijel, nikad null.
       Spisak se kopira, ne dijeli: pozivalac ga ne smije mijenjati pod nama. */
    prefs: function () {
      var copy = {};
      Object.keys(config).forEach(function (k) {
        copy[k] = Array.isArray(config[k]) ? config[k].slice() : config[k];
      });
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
