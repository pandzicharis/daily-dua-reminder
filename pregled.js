/* ==========================================================================
   pregled.js — pregled prošlog dana

   NEMA STALNU IKONICU. Traka (`.pregled-banner`) se sama pojavi na glavnom
   ekranu, PRIJE #sectionsRoot (isti obrazac kao vaktija kartica), i to SAMO
   kad juče nije sve završeno — dnevni spisak (Kur'an, Zikr, Dove, Navečer,
   Petak ako je juče bio petak) i noćni zikr zajedno. Kad je juče sve
   urađeno, ničega nema: ni trake, ni dugmeta, ni ostatka.

   PRAVE KVAČICE, NE SAMO ČITANJE. Klik na traku otvara stranu sa CIJELIM
   jučerašnjim spiskom — urađeno i neurađeno, jasno razdvojeno — i svaka
   kartica se stvarno može čekirati. `/api/state` prima datum ± jedan dan od
   sarajevskog danas (api/state.js, `dateAllowed()`), pa POST za juče prolazi
   isto kao i za danas; ovaj fajl ga samo zove sa jučerašnjim datumom umjesto
   sa `dateKey` koji koristi script.js.

   ODAKLE DATUM. `juceKey()` je JEDINI datum ove strane — juče po satu
   uređaja, isto kao "danas" u script.js. Dalje unazad server odbija
   (`dateAllowed()`), pa ova strana namjerno ne nudi ni "prekjuče".

   ODAKLE SADRŽAJ. `sectionsForDate(juce, prefs)` za dnevni dio (isti poziv
   kao script.js, pa petak ulazi samo kad je juče stvarno bio petak) i
   `nocniSections(prefs)` za noćni zikr — ista dva izvora kroz koje ide i
   glavni ekran i postavke, pa ovaj fajl ne nabraja nijednu sekciju i nijednu
   dovu sam.

   KARTICE SU `.item`, ISTA KLASA KAO NA DNEVNOM SPISKU — ne svoja, posebna
   vrsta: ovo se stvarno čekira i stvarno pamti, za razliku od `.dua` u
   situacije.js (koja se ne pamti nigdje). Isti izgled, isto ponašanje. */

(function () {
  "use strict";

  var banner = null;
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
     Sekcije za taj dan — dnevne + noćni zikr, isti izvori kao svugdje.
     ------------------------------------------------------------------------ */
  function sekcijeZaPregled(date, p) {
    var dnevne = (typeof sectionsForDate === "function") ? sectionsForDate(date, p) : [];
    var nocne = (typeof nocniSections === "function") ? nocniSections(p) : [];
    return dnevne.concat(nocne);
  }

  /* Ukupno/urađeno za CIJEL dan (obje vrste sekcija), iz `items` mape —
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

    var wrap = document.createElement("div");
    wrap.className = "wrap pregled-wrap";
    wrap.appendChild(banner);
    main.parentNode.insertBefore(wrap, main);
  }

  function prikaziBanner(done, total) {
    if (!banner) { return; }
    var ostalo = total - done;
    bannerTitle.textContent = "Jučer nije sve završeno";
    bannerNote.textContent = ostalo + " od " + total +
      (ostalo === 1 ? " nije urađeno." : " nije urađeno.");
    banner.hidden = false;
  }

  function sakrijBanner() {
    if (banner) { banner.hidden = true; }
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
     Kartica — ISTA klasa (`.item`) i isto ponašanje kao na dnevnom spisku,
     samo protiv jučerašnjeg datuma umjesto protiv `dateKey`-a.
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

  function kartica(item, naslov, oznaka, checked) {
    var article = document.createElement("article");
    article.className = "item" + (checked ? " is-done" : "");
    article.dataset.id = item.id;

    var head = document.createElement("div");
    head.className = "item-head";

    var input = document.createElement("input");
    input.type = "checkbox";
    input.className = "check";
    input.checked = checked;
    input.setAttribute("aria-label", naslov);

    var title = document.createElement("span");
    title.className = "item-title";
    title.textContent = naslov;

    head.appendChild(input);
    head.appendChild(title);

    if (oznaka) {
      var znak = document.createElement("span");
      znak.className = "item-source";
      znak.textContent = oznaka;
      head.appendChild(znak);
    }

    article.appendChild(head);

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

    function commit(done) {
      input.checked = done;
      article.classList.toggle("is-done", done);
      jucerItems[item.id] = done;
      osvjeziNakonIzmjene(item.id);

      posaljiIzmjenu(jucerDate, item.id, done).catch(function () {
        /* Nema veze — kartica ostaje kako je dodirnuta; sljedeće otvaranje
           strane povlači stvarno stanje sa servera i ispravlja je ako upis
           nije prošao. */
      });
    }

    article.addEventListener("click", function (e) {
      if (e.target === input) { return; }
      commit(!input.checked);
    });
    input.addEventListener("change", function () { commit(input.checked); });

    return article;
  }

  function kuranStavka(date, p_) {
    var naslov = naslovStranice(date, p_);
    return kartica({ id: "quran", type: "surah" }, naslov, null, !!jucerItems.quran);
  }

  /* ------------------------------------------------------------------------
     Crtanje spiska
     ------------------------------------------------------------------------ */
  function nacrtajGrupu(section, date, p_) {
    var ids = (section.kind === "quran") ? ["quran"] :
      (section.items || []).map(function (item) { return item.id; });
    if (!ids.length) { return null; }

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
      section.items.forEach(function (item) {
        list.appendChild(kartica(item, titles[item.id] || item.title, null,
          !!jucerItems[item.id]));
      });
    }

    group.appendChild(list);

    grupe.push({ ids: ids, countEl: countEl, node: group });
    return group;
  }

  function nacrtajSpisak() {
    body.textContent = "";
    grupe = [];

    var sekcije = sekcijeZaPregled(jucerDate, prefs());
    sekcije.forEach(function (section) {
      var group = nacrtajGrupu(section, jucerDate, prefs());
      if (group) { body.appendChild(group); }
    });

    osvjeziBrojke();

    if (!grupe.length) {
      body.appendChild(p("empty-msg", "Nema šta da se pregleda za taj dan."));
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
      g.node.classList.toggle("is-full", done === g.ids.length);
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
