/* ==========================================================================
   pregled.js — pregled prošlog dana

   NEMA STALNU IKONICU. Traka (`.pregled-banner`) se sama pojavi na glavnom
   ekranu, PRIJE #sectionsRoot (isti obrazac kao vaktija kartica), i to SAMO
   kad juče nije sve završeno — dnevni spisak (Kur'an, Zikr, Dove, Navečer,
   Petak ako je juče bio petak). Noćni zikr (00:00–07:00) NE ulazi: vidi
   `sekcijeZaPregled()`. Kad je juče sve urađeno, ničega nema: ni trake, ni
   dugmeta, ni ostatka.

   PRAVE KVAČICE, NE SAMO ČITANJE. Klik na traku otvara stranu sa CIJELIM
   jučerašnjim spiskom — urađeno i neurađeno, jasno razdvojeno — i svaka
   kartica se stvarno može čekirati. `/api/state` prima datum ± jedan dan od
   sarajevskog danas (api/state.js, `dateAllowed()`), pa POST za juče prolazi
   isto kao i za danas; ovaj fajl ga samo zove sa jučerašnjim datumom umjesto
   sa `dateKey` koji koristi script.js.

   ODAKLE DATUM. `juceKey()` je JEDINI datum ove strane — juče po satu
   uređaja, isto kao "danas" u script.js. Dalje unazad server odbija
   (`dateAllowed()`), pa ova strana namjerno ne nudi ni "prekjuče".

   ODAKLE SADRŽAJ. Samo `sectionsForDate(juce, prefs)` — isti poziv kao u
   script.js, pa petak ulazi samo kad je juče stvarno bio petak, a noćni zikr
   ne ulazi nikad (ta funkcija ga već izbacuje). Isti izvor kroz koji ide i
   glavni ekran i postavke, pa ovaj fajl ne nabraja nijednu sekciju i nijednu
   dovu sam.

   KARTICE SU `.item`, ISTA KLASA KAO NA DNEVNOM SPISKU — ne svoja, posebna
   vrsta: ovo se stvarno čekira i stvarno pamti, za razliku od `.dua` u
   situacije.js (koja se ne pamti nigdje). Isti izgled, isto ponašanje. */

(function () {
  "use strict";

  var banner = null;
  var bannerWrap = null;
  var bannerTitle = null;
  var bannerNote = null;

  var drawer = null;
  var body = null;

  var otvoren = false;
  var ucitavanje = false;

  /* Jučerašnje stanje kako ga vidi ova strana: `{ itemId: true }`, uvijek
     puno (nedostaje = nije urađeno). Živi ovdje, ne u localStorage — juče
     se ne kešira preko sesija, povlači se iznova pri svakom provjeri. */
  var jucerItems = null;
  var jucerDate = null;

  /* Grupe iscrtanog spiska — po jedna po sekciji — da se poslije klika po
     kartici osvježi samo brojka te sekcije i traka, bez ponovnog crtanja
     cijele strane (isto obrazloženje kao `updateProgress()` u script.js). */
  var grupe = [];

  function prefs() {
    return (window.mojZikrConfig && window.mojZikrConfig.prefs()) || {};
  }

  function korisnik() {
    return (window.mojZikrConfig && window.mojZikrConfig.korisnik)
      ? window.mojZikrConfig.korisnik() : "";
  }

  /* ------------------------------------------------------------------------
     Datum
     ------------------------------------------------------------------------ */
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function juceKey() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  var DAY_NAMES = [
    "nedjelju", "ponedjeljak", "utorak", "srijedu",
    "četvrtak", "petak", "subotu"
  ];
  var MONTH_NAMES = [
    "januar", "februar", "mart", "april", "maj", "juni",
    "juli", "august", "septembar", "oktobar", "novembar", "decembar"
  ];

  /* "U petak, 16. septembar." — preko Date.UTC, kao svugdje u aplikaciji, da
     zapadno od Londona ne ispadne dan ranije. */
  function opisiDan(key) {
    var parts = key.split("-").map(function (x) { return parseInt(x, 10); });
    var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (isNaN(d.getTime())) { return ""; }
    return "U " + DAY_NAMES[d.getUTCDay()] + ", " + d.getUTCDate() + ". " +
      MONTH_NAMES[d.getUTCMonth()] + ".";
  }

  function daysBetween(fromKey, toKey) {
    var a = fromKey.split("-").map(function (x) { return parseInt(x, 10); });
    var b = toKey.split("-").map(function (x) { return parseInt(x, 10); });
    var od = Date.UTC(a[0], a[1] - 1, a[2]);
    var do_ = Date.UTC(b[0], b[1] - 1, b[2]);
    return Math.round((do_ - od) / 86400000);
  }

  /* Ista računica kao `getQuranPages()` u script.js (2. Kur'an), samo za
     proizvoljan dan umjesto za `dateKey`: start stranica + dana od starta,
     `perDay` stranica po danu, modulo `QURAN_TOTAL_PAGES` da poslije 604.
     krene ispočetka. */
  function stranicaZa(dateKey, p) {
    var perDay = (typeof p.stranice === "number" && p.stranice >= 1)
      ? Math.floor(p.stranice) : 1;
    var total = QURAN_TOTAL_PAGES;
    var first = QURAN_START_PAGE + daysBetween(QURAN_START_DATE, dateKey) * perDay;
    var out = [];
    for (var i = 0; i < perDay; i++) {
      out.push(((((first + i - 1) % total) + total) % total) + 1);
    }
    return out;
  }

  function naslovStranice(dateKey, p) {
    var stranice = stranicaZa(dateKey, p);
    return stranice.length > 1
      ? "Stranice " + stranice[0] + "–" + stranice[stranice.length - 1]
      : "Stranica " + stranice[0];
  }

  /* ------------------------------------------------------------------------
     Server — /api/state, isti endpoint kao script.js/sync.js, samo sa
     jučerašnjim datumom umjesto sa `dateKey`.
     ------------------------------------------------------------------------ */
  function zaglavlja(extra) {
    var head = extra || {};
    var user = korisnik();
    if (user) { head["X-Zikr-User"] = user; }
    return head;
  }

  function povuci(date) {
    var user = korisnik();
    if (!user) { return Promise.resolve({ error: "ime" }); }

    return fetch("/api/state?date=" + encodeURIComponent(date), {
      headers: zaglavlja({ "Accept": "application/json" })
    }).then(function (res) {
      if (!res.ok) { throw new Error("state " + res.status); }
      return res.json();
    }).then(function (data) {
      return { items: (data && data.items) || {} };
    }).catch(function () {
      return { error: "mreza" };
    });
  }

  /* Šalje SAMO promjenu jedne stavke — isti oblik zahtjeva kao `pushChange()`
     u script.js. Ne stoji u redu čekanja kao kvačice na glavnom spisku
     (`sync.js`): ova strana se otvara rijetko i namjerno, pa gubitak jednog
     kruga bez mreže nije isti rizik kao na dnevnom spisku koji se dira po
     cijeli dan. */
  function posaljiIzmjenu(date, id, checked) {
    var items = {};
    items[id] = checked;

    return fetch("/api/state", {
      method: "POST",
      headers: zaglavlja({ "Content-Type": "application/json" }),
      body: JSON.stringify({ date: date, items: items })
    }).then(function (res) {
      if (!res.ok) { throw new Error("state " + res.status); }
      return res.json();
    });
  }

  /* ------------------------------------------------------------------------
     Sekcije za taj dan — SAMO dnevne.

     Noćni zikr (`kind: "nocni"`) namjerno NE ulazi ovdje. Njegov prozor je
     00:00–07:00 i on pripada noći koja tek dolazi, a ne danu koji je prošao:
     "juče nije sve završeno" u 10:00 ne smije prozvati nešto što se i inače
     radi usred noći. Isti razlog zbog kojeg ta sekcija nema podsjetnik, ne
     ulazi u trake napretka ni u broj na ikonici (vidi `kind: "nocni"` u
     data.js) — `sectionsForDate()` je već izbacuje, pa je dovoljno da je
     ovdje ne dodajemo nazad.

     Kvačice noćnog zikra se time ne gube: one i dalje idu u isti spisak
     čekiranog i dijele se kroz uređaje, samo ih ovaj pregled ne broji i ne
     crta.
     ------------------------------------------------------------------------ */
  function sekcijeZaPregled(date, p) {
    return (typeof sectionsForDate === "function") ? sectionsForDate(date, p) : [];
  }

  /* Ukupno/urađeno za jučerašnji dnevni spisak, iz `items` mape —
     koristi ga i traka (odlučuje da li da se uopšte pojavi) i drawer
     (naslov iznad spiska). Kur'an ulazi kao jedna stavka, kao i na dnevnom
     spisku (`quranVisible()`/`state.quran` u script.js). */
  function ukupno(date, p, items) {
    var done = 0, total = 0;
    sekcijeZaPregled(date, p).forEach(function (section) {
      if (section.kind === "quran") {
        total += 1;
        if (items.quran) { done += 1; }
        return;
      }
      (section.items || []).forEach(function (item) {
        total += 1;
        if (items[item.id]) { done += 1; }
      });
    });
    return { done: done, total: total };
  }

  /* ------------------------------------------------------------------------
     Traka "jučer nije sve završeno"
     ------------------------------------------------------------------------ */
  function buildBanner() {
    banner = document.createElement("button");
    banner.type = "button";
    banner.className = "pregled-banner";
    banner.hidden = true;

    var NS = "http://www.w3.org/2000/svg";
    var icon = document.createElementNS(NS, "svg");
    icon.setAttribute("class", "pregled-banner-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.6");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.setAttribute("aria-hidden", "true");
    [
      "M1 4v6h6",
      "M3.51 15a9 9 0 1 0 2.13-9.36L1 10"
    ].forEach(function (d) {
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      icon.appendChild(path);
    });
    banner.appendChild(icon);

    var text = document.createElement("span");
    text.className = "pregled-banner-text";
    bannerTitle = document.createElement("span");
    bannerTitle.className = "pregled-banner-title";
    bannerNote = document.createElement("span");
    bannerNote.className = "pregled-banner-note";
    text.appendChild(bannerTitle);
    text.appendChild(document.createElement("br"));
    text.appendChild(bannerNote);
    banner.appendChild(text);

    var arrow = document.createElementNS(NS, "svg");
    arrow.setAttribute("class", "pregled-banner-arrow");
    arrow.setAttribute("viewBox", "0 0 24 24");
    arrow.setAttribute("width", "18");
    arrow.setAttribute("height", "18");
    arrow.setAttribute("fill", "none");
    arrow.setAttribute("stroke", "currentColor");
    arrow.setAttribute("stroke-width", "1.8");
    arrow.setAttribute("stroke-linecap", "round");
    arrow.setAttribute("stroke-linejoin", "round");
    arrow.setAttribute("aria-hidden", "true");
    var arrowPath = document.createElementNS(NS, "path");
    arrowPath.setAttribute("d", "M9 6l6 6-6 6");
    arrow.appendChild(arrowPath);
    banner.appendChild(arrow);

    banner.addEventListener("click", otvori);

    var main = document.getElementById("sectionsRoot");
    if (!main || !main.parentNode) { return; }

    bannerWrap = document.createElement("div");
    bannerWrap.className = "wrap pregled-wrap";
    bannerWrap.hidden = true;
    bannerWrap.appendChild(banner);
    main.parentNode.insertBefore(bannerWrap, main);
  }

  function prikaziBanner(done, total) {
    if (!banner) { return; }
    var ostalo = total - done;
    bannerTitle.textContent = "Jučer nije sve završeno";
    bannerNote.textContent = ostalo + " od " + total +
      (ostalo === 1 ? " nije urađeno." : " nije urađeno.");
    banner.hidden = false;
    /* Omotač nosi svoj razmak (padding, ne margin — vidi style.css); bez
       ovoga bi taj razmak ostao na ekranu i kad je traka sakrivena, kao
       prazna rupa između vaktija kartice i Kur'ana. */
    bannerWrap.hidden = false;
  }

  function sakrijBanner() {
    if (banner) { banner.hidden = true; }
    if (bannerWrap) { bannerWrap.hidden = true; }
  }

  /* Provjeri juče, bez otvaranja strane — zove se pri učitavanju i pri
     svakoj promjeni imena/configa. Ne dira drawer; samo traka. */
  /* Raste sa svakim pozivom — settings.js zna zvati `naPromjenu` dvaput brzo
     uzastopno (config sa servera stigne dok se lokalni tek primjenio), pa dva
     preklopljena poziva mogu stići nazad obrnutim redom. Odgovor koji nije
     od POSLJEDNJEG poziva se odbacuje, da traka nikad ne ostane na starijem,
     stigla-kasnije rezultatu. */
  var provjeraId = 0;

  function provjeriJuce() {
    if (!banner) { return; }

    provjeraId += 1;
    var mojId = provjeraId;

    if (!korisnik()) { sakrijBanner(); return; }

    var date = juceKey();
    povuci(date).then(function (res) {
      if (mojId !== provjeraId) { return; }
      if (res.error) { sakrijBanner(); return; }
      var t = ukupno(date, prefs(), res.items);
      if (t.total > 0 && t.done < t.total) { prikaziBanner(t.done, t.total); }
      else { sakrijBanner(); }
    });
  }

  /* ------------------------------------------------------------------------
     Skrol do sljedeće kartice — isti obrazac kao `naSljedecu()` u
     situacije.js (vlastita animacija, ne `scrollIntoView({smooth})`, jer ga
     neki webview-i tiho ignorišu), samo nad `body` ovog drawera. Ovdje se
     "sljedeća" ne traži preskakanjem `.is-done` susjeda — gotova kartica se
     UKLANJA (`ukloniKarticu()`), pa je sljedeća uvijek prvi preostali
     susjed, ili prva kartica sljedeće grupe kad ova ostane prazna.
     ------------------------------------------------------------------------ */
  var SKROL_MS = 380;
  var SKROL_RUB = 12;
  var skrolAnim = null;

  function mirnijeAnimacije() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function skrolujNa(y) {
    var granica = Math.max(0, body.scrollHeight - body.clientHeight);
    var cilj = Math.max(0, Math.min(y, granica));
    var od = body.scrollTop;
    var raz = cilj - od;

    if (skrolAnim) { cancelAnimationFrame(skrolAnim); skrolAnim = null; }
    if (!raz) { return; }

    if (mirnijeAnimacije() || typeof window.requestAnimationFrame !== "function") {
      body.scrollTop = cilj;
      return;
    }

    var pocetak = null;
    function korak(t) {
      if (pocetak === null) { pocetak = t; }
      var k = Math.min(1, (t - pocetak) / SKROL_MS);
      body.scrollTop = od + raz * (1 - Math.pow(1 - k, 3));
      if (k < 1) { skrolAnim = window.requestAnimationFrame(korak); }
      else { skrolAnim = null; }
    }
    skrolAnim = window.requestAnimationFrame(korak);
  }

  /* Sljedeća kartica, traži se PRIJE brisanja trenutne — poslije brisanja
     `nextElementSibling` više ne bi imao od čega krenuti. Ide u susjednu
     grupu kad ova nema više ništa poslije trenutne. */
  function sljedecaKartica(article) {
    var next = article.nextElementSibling;
    if (next) { return next; }

    var group = article.closest(".pregled-group");
    var nextGroup = group ? group.nextElementSibling : null;
    while (nextGroup) {
      var prva = nextGroup.querySelector(".item");
      if (prva) { return prva; }
      nextGroup = nextGroup.nextElementSibling;
    }
    return null;
  }

  function skrolujDoSljedece(kartica) {
    if (!kartica) { return; }
    var okvir = body.getBoundingClientRect();
    var meta = kartica.getBoundingClientRect();
    skrolujNa(body.scrollTop + (meta.top - okvir.top) - SKROL_RUB);
  }

  /* ------------------------------------------------------------------------
     Brojani zikr — isti mehanizam kao script.js (5b/6): tap po kartici je
     jedno ponavljanje, kvačica direktno završava bez obzira dokle je
     izbrojano, dugo držanje na brojci vraća na nulu. Nedovršeno brojanje
     (`jucerCounts`) je namjerno SAMO u memoriji i SAMO dok je strana
     otvorena — resetuje se u `ucitaj()`, isto obrazloženje kao `counts` u
     script.js: to je "dokle si stigao", ne "jesi li završio", pa ne ide na
     server i ne treba mu preživjeti zatvaranje.
     ------------------------------------------------------------------------ */
  var jucerCounts = {};

  function tapTarget(item) {
    var n = item && item.repetitions;
    return (typeof n === "number" && n > 1) ? n : 0;
  }

  function tapCount(id, target) {
    var n = jucerCounts[id];
    if (typeof n !== "number" || !(n > 0)) { return 0; }
    return Math.min(Math.floor(n), target);
  }

  function setTapCount(id, n) {
    if (n > 0) { jucerCounts[id] = n; } else { delete jucerCounts[id]; }
  }

  function buzz(pattern) {
    try {
      if (navigator.vibrate) { navigator.vibrate(pattern); }
    } catch (e) {
      /* uređaj ne dozvoljava vibraciju — brojanje radi i bez nje */
    }
  }

  function makeCounter(title, target) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "reps count-chip";

    var track = document.createElement("div");
    track.className = "count-track";
    var fill = document.createElement("span");
    fill.className = "count-fill";
    track.appendChild(fill);

    function paint(count, done) {
      var shown = done ? target : count;
      var full = done || shown >= target;

      chip.textContent = shown + " / " + target;
      chip.setAttribute("aria-label", title + ": " + shown + " od " + target +
        (full
          ? " — izbrojano; drži pritisnuto za novo brojanje"
          : " — dodaj jedan"));
      chip.title = full ? "Drži pritisnuto za novo brojanje" : "";
      chip.classList.toggle("is-full", full);

      fill.style.transform = "scaleX(" + (shown / target) + ")";
      fill.classList.toggle("is-full", full);
    }

    function pulse() {
      chip.classList.remove("is-bump");
      void chip.offsetWidth;
      chip.classList.add("is-bump");
    }

    return { chip: chip, track: track, paint: paint, pulse: pulse };
  }

  /* ------------------------------------------------------------------------
     Kartica — ISTA klasa (`.item`) i isto ponašanje kao na dnevnom spisku
     (checkbox, brojani zikr sa tapom i dugim držanjem, arapski/transkripcija,
     izvor), samo protiv jučerašnjeg datuma umjesto protiv `dateKey`-a.

     Uvijek počinje NEOZNAČENA: ova strana prikazuje samo ono što nije
     urađeno (vidi `nacrtajGrupu()`), pa čim kartica završi, nestaje —
     `zavrsi()` je briše i skrola na sljedeću, umjesto da ostane kao dimljena
     "urađeno" kartica kao na glavnom spisku.
     ------------------------------------------------------------------------ */
  function p(className, text) {
    var node = document.createElement("p");
    node.className = className;
    node.textContent = text;
    return node;
  }

  function arapskiTok(text) {
    var flow = (Array.isArray(text) ? text : [text])
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (!flow) { return null; }
    var node = p("arabic", flow);
    node.setAttribute("dir", "rtl");
    node.setAttribute("lang", "ar");
    return node;
  }

  function kartica(item, naslov) {
    var target = tapTarget(item);

    var article = document.createElement("article");
    article.className = "item" + (target ? " is-counted" : "");
    article.dataset.id = item.id;

    var head = document.createElement("div");
    head.className = "item-head";

    var input = document.createElement("input");
    input.type = "checkbox";
    input.className = "check";
    input.setAttribute("aria-label", target ? naslov + " — označi kao završeno" : naslov);

    var title = document.createElement("span");
    title.className = "item-title";
    title.textContent = naslov;

    head.appendChild(input);
    head.appendChild(title);

    var counter = target ? makeCounter(naslov, target) : null;
    if (counter) { head.appendChild(counter.chip); }

    if (item.source && !Array.isArray(item.pages)) {
      var znak = document.createElement("span");
      znak.className = "item-source";
      znak.textContent = item.source;
      head.appendChild(znak);
    }

    article.appendChild(head);

    if (counter) {
      article.appendChild(counter.track);
      counter.paint(tapCount(item.id, target), false);
    }

    var transkript = prefs().transkript === true;
    if (item.type === "dua") {
      var tijelo = document.createElement("div");
      tijelo.className = "item-body";
      if (transkript && item.transliteration) {
        tijelo.appendChild(p("transliteration", item.transliteration));
      } else {
        var ar = arapskiTok(item.arabic);
        if (ar) { tijelo.appendChild(ar); }
      }
      if (item.translation) { tijelo.appendChild(p("translation", item.translation)); }
      if (tijelo.childNodes.length) { article.appendChild(tijelo); }
    }

    /* Jedini put kojim kartica završava — čekiranjem direktno ili
       dobrojavanjem do cilja. Šalje se odmah, ali kartica se uklanja tek
       nakon kratke pauze (`is-done` treptaj), isto kao na glavnom spisku
       (`.item.is-done` prelaz u style.css). */
    function zavrsi() {
      jucerItems[item.id] = true;
      setTapCount(item.id, 0);

      posaljiIzmjenu(jucerDate, item.id, true).catch(function () {
        /* Nema veze — kartica je već uklonjena; sljedeće otvaranje strane
           povlači stvarno stanje sa servera i vraća je ako upis nije prošao. */
      });

      var sljedeca = sljedecaKartica(article);
      article.classList.add("is-done");
      input.checked = true;
      if (counter) { counter.paint(target, true); }

      setTimeout(function () {
        ukloniKarticu(article);
        skrolujDoSljedece(sljedeca);
      }, 200);
    }

    function tap() {
      var izbrojano = tapCount(item.id, target);
      var next = izbrojano + 1;

      if (next >= target) { zavrsi(); buzz([14, 40, 22]); return; }

      setTapCount(item.id, next);
      counter.paint(next, false);
      counter.pulse();
      buzz(8);
    }

    function resetTap() {
      if (!tapCount(item.id, target)) { return; }
      setTapCount(item.id, 0);
      counter.paint(0, false);
      buzz([30, 40, 30]);
    }

    article.addEventListener("click", function (e) {
      if (e.target === input) { return; }
      if (target) { tap(); return; }
      zavrsi();
    });

    /* Zaštita od dvostrukog diranja u pauzi prije brisanja (~200ms): čim je
       jednom čekirano, sljedeći klik na sam checkbox ga samo vrati na
       checked — kartica je već na putu da nestane, "odčekiravanje" ovdje
       nema šta da znači (vidi zaglavlje funkcije). */
    input.addEventListener("change", function () {
      if (!input.checked) { input.checked = true; return; }
      zavrsi();
    });

    if (counter) {
      var drzanje = null;
      var drzano = false;

      function pocniDrzanje() {
        prekiniDrzanje();
        drzano = false;
        drzanje = setTimeout(function () {
          drzanje = null;
          drzano = true;
          resetTap();
        }, 550);
      }

      function prekiniDrzanje() {
        if (drzanje) { clearTimeout(drzanje); drzanje = null; }
      }

      counter.chip.addEventListener("pointerdown", pocniDrzanje);
      ["pointerup", "pointerleave", "pointercancel"].forEach(function (name) {
        counter.chip.addEventListener(name, prekiniDrzanje);
      });
      counter.chip.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      counter.chip.addEventListener("click", function (e) {
        e.stopPropagation();
        prekiniDrzanje();
        if (drzano) { drzano = false; return; }
        tap();
      });
    }

    return article;
  }

  function kuranStavka(date, p_) {
    var naslov = naslovStranice(date, p_);
    return kartica({ id: "quran", type: "surah" }, naslov);
  }

  /* ------------------------------------------------------------------------
     Crtanje spiska — SAMO ono što nije urađeno (vidi zaglavlje fajla).
     Brojka u zaglavlju grupe i dalje broji nad SVIM stavkama sekcije
     (`ids`), da "3 / 34" i dalje znači isto što i svugdje — samo se od te
     34 ovdje crtaju one 31 koje nedostaju.
     ------------------------------------------------------------------------ */
  function nacrtajGrupu(section, date, p_) {
    var ids = (section.kind === "quran") ? ["quran"] :
      (section.items || []).map(function (item) { return item.id; });
    if (!ids.length) { return null; }

    var preostale = (section.kind === "quran")
      ? (jucerItems.quran ? [] : [{ id: "quran", type: "surah" }])
      : (section.items || []).filter(function (item) { return !jucerItems[item.id]; });
    if (!preostale.length) { return null; }

    var group = document.createElement("div");
    group.className = "pregled-group";

    var head = document.createElement("div");
    head.className = "pregled-group-head";

    var titleEl = document.createElement("span");
    titleEl.className = "pregled-group-title";
    var icon = (typeof makeSectionIcon === "function")
      ? makeSectionIcon(section.icon, "section-icon") : null;
    if (icon) { titleEl.appendChild(icon); }
    titleEl.appendChild(document.createTextNode(section.title));
    head.appendChild(titleEl);

    var countEl = document.createElement("span");
    countEl.className = "pregled-group-count";
    head.appendChild(countEl);

    group.appendChild(head);

    var list = document.createElement("div");
    list.className = "list";

    if (section.kind === "quran") {
      list.appendChild(kuranStavka(date, p_));
    } else {
      var titles = itemTitles(section.id, p_);
      preostale.forEach(function (item) {
        list.appendChild(kartica(item, titles[item.id] || item.title));
      });
    }

    group.appendChild(list);

    grupe.push({ ids: ids, countEl: countEl, node: group });
    return group;
  }

  function nacrtajSpisak() {
    body.textContent = "";
    grupe = [];
    jucerCounts = {};

    var sekcije = sekcijeZaPregled(jucerDate, prefs());
    sekcije.forEach(function (section) {
      var group = nacrtajGrupu(section, jucerDate, prefs());
      if (group) { body.appendChild(group); }
    });

    osvjeziBrojke();

    if (!grupe.length) {
      body.appendChild(prazno("Sve je urađeno. Ništa nije ostalo neurađeno.", null, null));
    }
  }

  /* Poslije brisanja kartice: makni je, pa cijelu grupu ako je ostala
     prazna (naslov nad ničim ne govori ništa), pa osvježi brojke i traku.
     Kad ništa više ne ostane, poruka "sve gotovo" zauzima prazan drawer. */
  function ukloniKarticu(article) {
    var group = article.closest(".pregled-group");
    article.remove();

    if (group) {
      var list = group.querySelector(".list");
      if (!list || !list.children.length) {
        grupe = grupe.filter(function (g) { return g.node !== group; });
        group.remove();
      }
    }

    osvjeziNakonIzmjene();

    if (!grupe.length && otvoren) {
      body.appendChild(prazno("Sve je urađeno. Ništa nije ostalo neurađeno.", null, null));
    }
  }

  /* Brojka po grupi i traka — bez ponovnog crtanja kartica, isti razlog kao
     `updateProgress()` u script.js: crtanje iznova bi izgubilo fokus i skrol
     usred čekiranja. */
  function osvjeziBrojke() {
    grupe.forEach(function (g) {
      var done = g.ids.reduce(function (sum, id) {
        return sum + (jucerItems[id] ? 1 : 0);
      }, 0);
      g.countEl.textContent = done + " / " + g.ids.length;
    });
  }

  function osvjeziNakonIzmjene() {
    osvjeziBrojke();

    var t = ukupno(jucerDate, prefs(), jucerItems);
    if (t.total > 0 && t.done < t.total) { prikaziBanner(t.done, t.total); }
    else { sakrijBanner(); }
  }

  /* ------------------------------------------------------------------------
     Prazno/greška u drawer-u (ime nedostaje, nema mreže)
     ------------------------------------------------------------------------ */
  function prazno(poruka, dugme, klik) {
    var box = document.createElement("div");
    box.className = "empty-state";
    box.appendChild(p("empty-msg", poruka));
    if (dugme) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "empty-btn";
      btn.textContent = dugme;
      btn.addEventListener("click", klik);
      box.appendChild(btn);
    }
    return box;
  }

  function ucitaj() {
    if (!drawer || ucitavanje) { return; }
    ucitavanje = true;

    var date = juceKey();
    body.textContent = "";
    body.appendChild(p("pregled-date", opisiDan(date)));
    body.appendChild(prazno("Učitavam…", null, null));

    povuci(date).then(function (res) {
      ucitavanje = false;
      if (!otvoren) { return; }

      body.textContent = "";
      body.appendChild(p("pregled-date", opisiDan(date)));

      if (res.error === "ime") {
        body.appendChild(prazno(
          "Upiši ime u postavkama da bi se pregled mogao učitati — spisak je vezan za ime, kao i sve ostalo.",
          "Otvori postavke",
          function () {
            zatvori();
            if (window.mojZikrConfig && window.mojZikrConfig.otvori) {
              window.mojZikrConfig.otvori();
            }
          }
        ));
        return;
      }

      if (res.error) {
        body.appendChild(prazno(
          "Nije uspjelo povlačenje jučerašnjeg stanja. Provjeri vezu i pokušaj ponovo.",
          "Pokušaj ponovo",
          function () { ucitaj(); }
        ));
        return;
      }

      jucerDate = date;
      jucerItems = res.items;
      nacrtajSpisak();
    });
  }

  /* ------------------------------------------------------------------------
     Drawer
     ------------------------------------------------------------------------ */
  function build() {
    drawer = document.createElement("div");
    drawer.className = "drawer drawer-pregled";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Pregled prošlog dana");
    drawer.hidden = true;

    var sheet = document.createElement("div");
    sheet.className = "drawer-sheet";

    var head = document.createElement("div");
    head.className = "drawer-head";

    var titles = document.createElement("div");
    titles.appendChild(p("drawer-title", "Pregled prošlog dana"));
    titles.appendChild(p("drawer-sub", "Čekiraj šta je od juče ostalo — mijenja pravi spisak tog dana."));

    var close = document.createElement("button");
    close.type = "button";
    close.className = "drawer-close";
    close.setAttribute("aria-label", "Zatvori");
    close.textContent = "✕";
    close.addEventListener("click", zatvori);

    head.appendChild(titles);
    head.appendChild(close);

    body = document.createElement("div");
    body.className = "drawer-body";

    sheet.appendChild(head);
    sheet.appendChild(body);
    drawer.appendChild(sheet);

    drawer.addEventListener("click", function (e) {
      if (e.target === drawer) { zatvori(); }
    });

    document.body.appendChild(drawer);
  }

  function otvori() {
    if (!drawer) { build(); }

    drawer.hidden = false;
    otvoren = true;
    document.body.classList.add("no-scroll");
    body.scrollTop = 0;
    drawer.querySelector(".drawer-close").focus();

    ucitaj();
  }

  function zatvori() {
    if (!drawer || drawer.hidden) { return; }
    drawer.hidden = true;
    otvoren = false;

    document.body.classList.remove("no-scroll");
    if (banner && !banner.hidden) { banner.focus(); }
  }

  /* ------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------ */
  if (typeof sectionsForDate === "function") {
    buildBanner();
    provjeriJuce();
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && otvoren) { zatvori(); }
  });

  /* Promjena imena mijenja čije se "juče" gleda; promjena prikaza
     (skriveno, transkripcija) mijenja koliko toga uopšte postoji za taj
     dan. Oboje traži novu provjeru trake, a drawer (ako je otvoren) novo
     crtanje. */
  if (window.mojZikrConfig && window.mojZikrConfig.naPromjenu) {
    window.mojZikrConfig.naPromjenu(function () {
      provjeriJuce();
      if (otvoren) { ucitaj(); }
    });
  }

})();
