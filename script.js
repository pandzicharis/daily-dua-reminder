/* ==========================================================================
   Moj Zikr — script.js
   Vanilla JavaScript. Bez frameworka, bez backenda.
   Aplikacija uvijek prikazuje SAMO današnji dan; sutra kreće čist spisak.
   ========================================================================== */

(function () {
  "use strict";

  var STORAGE_KEY = "moj-zikr-state";

  var DAY_NAMES = [
    "Nedjelja", "Ponedjeljak", "Utorak", "Srijeda",
    "Četvrtak", "Petak", "Subota"
  ];

  var MONTH_NAMES = [
    "januar", "februar", "mart", "april", "maj", "juni",
    "juli", "august", "septembar", "oktobar", "novembar", "decembar"
  ];

  var HIJRI_MONTHS = [
    "muharrem", "safer", "rebiu-l-evvel", "rebiu-l-ahir",
    "džumade-l-ula", "džumade-l-uhra", "redžeb", "ša'ban",
    "ramazan", "ševval", "zu-l-ka'de", "zu-l-hidždže"
  ];

  /* Ikonice sekcija — inline SVG, bez ijedne vanjske zavisnosti.
     Ključ je `icon` iz data.js, a boju nasljeđuju od naslova sekcije. */
  var ICONS = {
    /* otvorena knjiga */
    book: "M12 7c-1.6-1.3-3.7-2-6-2H3v13h3c2.3 0 4.4.7 6 2m0-13c1.6-1.3 3.7-2 6-2h3v13h-3c-2.3 0-4.4.7-6 2m0-13v13",
    /* petlja ponavljanja — brojani zikr */
    loop: "M17 3l3 3-3 3M20 6H9a4 4 0 0 0 0 8M7 21l-3-3 3-3M4 18h11a4 4 0 0 0 0-8",
    /* sklopljene ruke sa svjetlom iznad */
    hands: "M4 13a8 8 0 0 0 16 0zM12 3v3.5M7.5 5l1.4 2.2M16.5 5l-1.4 2.2",
    /* mlađak */
    moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z",
    /* list papira — dugme "Vidi stranicu" */
    pages: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6"
  };

  /* ------------------------------------------------------------------------
     1. Datum — uvijek lokalno vrijeme, nikad UTC
     ------------------------------------------------------------------------ */

  /* Vraća "YYYY-MM-DD" za lokalni datum. */
  function getLocalDateKey(date) {
    var d = date || new Date();
    return d.getFullYear() + "-" +
           String(d.getMonth() + 1).padStart(2, "0") + "-" +
           String(d.getDate()).padStart(2, "0");
  }

  /* Gregorijanski -> hidžretski datum.

     Prvo se pokuša ugrađenim Intl kalendarom "islamic-umalqura" (Umm al-Qura),
     koji svi današnji browseri imaju i koji daje isti datum kao zvanični
     kalendari. Ako ga okruženje nema, pada na tabelarni "Kuwaiti" algoritam
     ispod — on zna odstupati dan-dva, ali je bolje nego ništa.

     Datum se šalje kao UTC ponoć da vremenska zona ne pomjeri dan. */
  function gregorianToHijri(date) {
    var d = date.getDate();
    var m = date.getMonth() + 1;
    var y = date.getFullYear();

    try {
      var fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
        day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC"
      });
      var parts = {};
      fmt.formatToParts(new Date(Date.UTC(y, m - 1, d))).forEach(function (p) {
        parts[p.type] = p.value;
      });
      if (parts.day && parts.month && parts.year) {
        return {
          day: parseInt(parts.day, 10),
          month: parseInt(parts.month, 10),
          year: parseInt(parts.year, 10)
        };
      }
    } catch (e) {
      /* nema Intl islamskog kalendara — nastavi na tabelarni izračun */
    }

    /* gregorijanski datum -> julijanski dan */
    var a = Math.floor((m - 14) / 12);
    var jd = Math.floor((1461 * (y + 4800 + a)) / 4) +
             Math.floor((367 * (m - 2 - 12 * a)) / 12) -
             Math.floor((3 * Math.floor((y + 4900 + a) / 100)) / 4) +
             d - 32075;

    var l = jd - 1948440 + 10632;
    var n = Math.floor((l - 1) / 10631);
    l = l - 10631 * n + 354;
    var j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
            Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
    l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
        Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;

    var hm = Math.floor((24 * l) / 709);
    var hd = l - Math.floor((709 * hm) / 24);
    var hy = 30 * n + j - 30;

    return { day: hd, month: hm, year: hy };
  }

  /* "Ponedjeljak, 17. august 2026." */
  function formatGregorian(date) {
    return DAY_NAMES[date.getDay()] + ", " +
           date.getDate() + ". " + MONTH_NAMES[date.getMonth()] + " " +
           date.getFullYear() + ".";
  }

  /* "4. rebiu-l-evvel" — hidžretska godina se namjerno ne ispisuje. */
  function formatHijri(date) {
    var h = gregorianToHijri(date);
    return h.day + ". " + HIJRI_MONTHS[h.month - 1];
  }

  /* Broj punih dana između dva "YYYY-MM-DD" ključa.
     Računa se preko UTC ponoći da ljetno/zimsko vrijeme ne pomjeri rezultat. */
  function daysBetween(fromKey, toKey) {
    var a = fromKey.split("-").map(Number);
    var b = toKey.split("-").map(Number);
    return Math.round(
      (Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000
    );
  }

  /* ------------------------------------------------------------------------
     2. Kur'an — automatsko računanje stranice
     ------------------------------------------------------------------------ */

  /* Stranica za dati datum: start stranica + broj dana od start datuma.
     Nakon 604. stranice kreće ispočetka. */
  function getQuranPage(dateKey) {
    var page = QURAN_START_PAGE + daysBetween(QURAN_START_DATE, dateKey);
    var total = QURAN_TOTAL_PAGES;
    /* modulo koji radi i za datume prije početnog */
    return ((((page - 1) % total) + total) % total) + 1;
  }

  /* ------------------------------------------------------------------------
     3. localStorage — state je vezan za konkretan datum
     ------------------------------------------------------------------------ */

  function readStore() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      /* privatni mod ili pun storage — aplikacija i dalje radi u sesiji */
    }
  }

  /* State za jedan dan. Stari dani ostaju sačuvani u storage-u, ali se
     nigdje ne prikazuju — sutra se otvara potpuno čist spisak. */
  function getDayState(key) {
    var day = readStore()[key];
    if (!day || typeof day !== "object") { day = {}; }
    if (!day.items || typeof day.items !== "object") { day.items = {}; }
    if (typeof day.quran !== "boolean") { day.quran = false; }
    return day;
  }

  /* Samo localStorage. Server se ne dira — za to postoji `pushChange()`,
     jer se stanje sa servera upisuje ovom istom funkcijom i ne smije se
     odmah vraćati nazad gore. */
  function saveDayState() {
    var store = readStore();
    store[dateKey] = state;
    writeStore(store);
  }

  /* ------------------------------------------------------------------------
     Dijeljenje kroz uređaje (sync.js)

     Server je izvor istine, localStorage je keš. Gore se šalje samo ono što
     je korisnik upravo dirnuo, a dolje se prima cijelo stanje.
     Ako sync.js nije učitan, aplikacija radi kao i prije — samo lokalno.
     ------------------------------------------------------------------------ */

  /* Sve što je danas čekirano, u obliku u kojem to server pamti. Kur'an
     nije stavka liste nego zaseban boolean, pa se dopisuje kao polje
     "quran" — bez ovoga bi se pri prvom uparivanju izgubio. */
  function checkedMap() {
    var map = {};
    Object.keys(state.items).forEach(function (id) {
      if (state.items[id]) { map[id] = true; }
    });
    if (state.quran) { map.quran = true; }
    return map;
  }

  function pushChange(itemId, checked) {
    if (!window.mojZikrSync) { return; }
    var changes = {};
    changes[itemId] = checked;
    window.mojZikrSync.change(dateKey, changes);
  }

  function sameChecked(a, b) {
    var ka = Object.keys(a).filter(function (k) { return a[k]; });
    var kb = Object.keys(b).filter(function (k) { return b[k]; });
    if (ka.length !== kb.length) { return false; }
    return ka.every(function (k) { return b[k] === true; });
  }

  /* Stanje sa servera. Kur'an dolazi kao obično polje "quran", pa se vadi
     posebno — u aplikaciji nije stavka liste. */
  function applyRemoteState(remoteDate, items) {
    /* Ponoć je prešla dok je zahtjev bio u letu — odgovor je za jučer. */
    if (remoteDate !== dateKey) { return; }

    var next = {};
    Object.keys(items || {}).forEach(function (id) {
      if (id !== "quran" && items[id]) { next[id] = true; }
    });
    var quran = !!(items && items.quran);

    /* Bez promjene se ništa ne iscrtava — povlačenje se dešava pri svakom
       povratku u aplikaciju, a ponovno crtanje bi resetovalo skrol. */
    if (quran === state.quran && sameChecked(state.items, next)) { return; }

    state.items = next;
    state.quran = quran;
    saveDayState();
    renderSections();
    updateProgress();
  }

  /* ------------------------------------------------------------------------
     4. Trenutno stanje ekrana
     ------------------------------------------------------------------------ */

  var dateKey = getLocalDateKey();
  var state = getDayState(dateKey);

  var el = {
    date: document.getElementById("todayDate"),
    hijri: document.getElementById("todayHijri"),
    progress: document.getElementById("progress"),
    ringFill: document.getElementById("ringFill"),
    ringLabel: document.getElementById("ringLabel"),
    root: document.getElementById("sectionsRoot")
  };

  /* Obim prstena: r = 18 u viewBox-u 44x44 -> 2 * PI * 18 */
  var RING_LENGTH = 2 * Math.PI * 18;
  el.ringFill.style.strokeDasharray = RING_LENGTH;
  el.ringFill.style.strokeDashoffset = RING_LENGTH;

  function allItems() {
    return sections.reduce(function (acc, section) {
      return acc.concat(section.items || []);
    }, []);
  }

  /* ------------------------------------------------------------------------
     5. Sitni graditelji
     ------------------------------------------------------------------------ */

  function makeParagraph(className, text) {
    var p = document.createElement("p");
    p.className = className;
    p.textContent = text;
    return p;
  }

  function makeArabic(text, className) {
    var p = document.createElement("p");
    p.className = className || "arabic";
    p.setAttribute("dir", "rtl");
    p.setAttribute("lang", "ar");
    p.textContent = text;
    return p;
  }

  function makeCheckbox(label, checked, extraClass) {
    var input = document.createElement("input");
    input.type = "checkbox";
    input.className = "check" + (extraClass ? " " + extraClass : "");
    input.checked = !!checked;
    input.setAttribute("aria-label", label);
    return input;
  }

  function makeIcon(name, className) {
    var d = ICONS[name];
    if (!d) { return null; }
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", className || "section-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }

  /* Dova se prikazuje kao jedan neprekidan tok teksta — prelomi redova iz
     podataka i odvojeni pasusi se spajaju u jednu "rečenicu" radi centriranja. */
  function arabicAsOneFlow(arabic) {
    return (Array.isArray(arabic) ? arabic : [arabic])
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* ------------------------------------------------------------------------
     6. Stavka liste
     ------------------------------------------------------------------------ */

  /* displayTitle dolazi izvana jer se dove numerišu automatski ("DOVA #3"). */
  function renderItem(item, displayTitle) {
    var checked = !!state.items[item.id];

    var article = document.createElement("article");
    article.className = "item" + (checked ? " is-done" : "");

    /* Namjerno <div>, ne <label>: cijela kartica ima svoj click handler,
       pa bi label toggle-ao dodatno i poništio ga. */
    var head = document.createElement("div");
    head.className = "item-head";

    var input = makeCheckbox(displayTitle, checked);

    var title = document.createElement("span");
    title.className = "item-title";
    title.textContent = displayTitle;

    head.appendChild(input);
    head.appendChild(title);

    if (item.repetitions && item.repetitions > 1) {
      var reps = document.createElement("span");
      reps.className = "reps";
      reps.textContent = item.repetitions + "x";
      head.appendChild(reps);
    }

    /* Izvor (Kur'an / hadis) — sitna oznaka u desnom ćošku headera,
       u istom redu sa brojem dove. */
    if (item.source) {
      var source = document.createElement("span");
      source.className = "item-source";
      source.textContent = item.source;
      head.appendChild(source);
    }

    article.appendChild(head);

    /* "surah" i "count" -> samo checkbox + naslov, bez teksta.
       "dua" -> arapski u jednom toku, pa prevod ispod. */
    if (item.type === "dua") {
      var body = document.createElement("div");
      body.className = "item-body";

      var flow = arabicAsOneFlow(item.arabic);
      if (flow) {
        body.appendChild(makeArabic(flow));
      }
      if (item.translation) {
        body.appendChild(makeParagraph("translation", item.translation));
      }

      if (body.childNodes.length) { article.appendChild(body); }
    }

    /* Klik bilo gdje po kartici prebacuje checkbox — i za čekiranje i za
       odčekiranje. Klik na sam checkbox preskačemo jer ga browser već
       prebaci, pa bismo ga ovdje vratili nazad. */
    article.addEventListener("click", function (e) {
      if (e.target === input) { return; }
      input.checked = !input.checked;
      input.dispatchEvent(new Event("change"));
    });

    input.addEventListener("change", function () {
      state.items[item.id] = input.checked;
      saveDayState();
      pushChange(item.id, input.checked);
      article.classList.toggle("is-done", input.checked);
      updateProgress();
      if (input.checked) { focusNext(article); }
    });

    return article;
  }

  /* ------------------------------------------------------------------------
     7. Auto-skrol na sljedeću nezavršenu stavku
     ------------------------------------------------------------------------ */

  /* Vlastita animacija umjesto scrollIntoView({behavior:"smooth"}).
     Nativni smooth scroll neki browseri i webview-ovi tiho ignorišu, pa bi
     auto-skrol znao potpuno izostati. Ovako se ponaša svugdje isto. */
  var scrollAnim = null;

  function smoothScrollTo(targetY, duration) {
    var maxY = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    var endY = Math.max(0, Math.min(targetY, maxY));
    var startY = window.pageYOffset;
    var delta = endY - startY;

    if (scrollAnim) { cancelAnimationFrame(scrollAnim); scrollAnim = null; }
    if (Math.abs(delta) < 2) { return; }

    /* Ako korisnik traži manje animacija — skoči odmah. */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, endY);
      return;
    }

    var startTime = null;
    var animated = false;

    function step(now) {
      animated = true;
      if (startTime === null) { startTime = now; }
      var p = Math.min(1, (now - startTime) / duration);
      /* easeInOutQuad */
      var eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      window.scrollTo(0, startY + delta * eased);
      if (p < 1) {
        scrollAnim = requestAnimationFrame(step);
      } else {
        scrollAnim = null;
      }
    }
    scrollAnim = requestAnimationFrame(step);

    /* Sigurnosna mreža: u nekim okruženjima (ugrađeni webview, tab koji se
       ne iscrtava) requestAnimationFrame nikad ne opali i skrol bi izostao.
       Ako prvi frejm ne stigne, skoči odmah — bolje bez animacije nego
       da korisnik ostane na staroj stavci. */
    setTimeout(function () {
      if (!animated && scrollAnim !== null) {
        cancelAnimationFrame(scrollAnim);
        scrollAnim = null;
        window.scrollTo(0, endY);
      }
    }, 120);
  }

  function scrollCardIntoView(card) {
    var rect = card.getBoundingClientRect();
    /* Kartica viša od ekrana se ne može centrirati — poravnaj joj vrh. */
    var offset = rect.height >= window.innerHeight - 40
      ? 16
      : (window.innerHeight - rect.height) / 2;
    smoothScrollTo(window.pageYOffset + rect.top - offset, 420);
  }

  function focusNext(currentCard) {
    var cards = Array.prototype.slice.call(
      el.root.querySelectorAll(".item, .quran-card")
    );
    var start = cards.indexOf(currentCard);
    for (var i = start + 1; i < cards.length; i++) {
      if (!cards[i].classList.contains("is-done")) {
        scrollCardIntoView(cards[i]);
        return;
      }
    }
    /* Nema više nezavršenih ispod — ostani gdje jesi. */
  }

  /* ------------------------------------------------------------------------
     8. Kur'an kartica
     ------------------------------------------------------------------------ */

  function renderQuranCard() {
    var page = getQuranPage(dateKey);
    var info = quranPages[page];

    var card = document.createElement("article");
    card.className = "quran-card" + (state.quran ? " is-done" : "");

    var input = makeCheckbox("Današnja stranica proučena", state.quran, "quran-check");

    /* Header: checkbox + stranica, pa džuz · sura · dokle si u mushafu. */
    /* U headeru ostaje samo broj stranice uz checkbox. */
    var headText = document.createElement("div");
    headText.className = "quran-head-text";
    headText.appendChild(makeParagraph("quran-page", "Stranica " + page));

    var head = document.createElement("div");
    head.className = "quran-head";
    head.appendChild(input);
    head.appendChild(headText);

    /* Dugme za otvaranje cijele stranice — desni ugao headera. */
    if (info) {
      var viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "view-page-btn";
      viewBtn.appendChild(makeIcon("pages", "btn-icon"));
      viewBtn.appendChild(document.createTextNode("Vidi stranicu"));
      viewBtn.addEventListener("click", function (e) {
        /* da klik ne prebaci checkbox kartice */
        e.stopPropagation();
        openPageView(page, info);
      });
      head.appendChild(viewBtn);
    }

    card.appendChild(head);

    /* Sadržaj ispod headera je centriran. */
    var top = document.createElement("div");
    top.className = "quran-top";

    /* Džuz, sure i dokle si u mushafu — iznad arapskog teksta, ne u headeru. */
    var meta = document.createElement("p");
    meta.className = "quran-meta";

    if (info) {
      meta.appendChild(document.createTextNode("Džuz " + info.juz + " · "));
      /* Imena sura su arapska, doslovno iz quran_by_pages.json. */
      info.suras.forEach(function (sura, i) {
        if (i) { meta.appendChild(document.createTextNode(" · ")); }
        var span = document.createElement("span");
        span.className = "sura-name";
        span.setAttribute("dir", "rtl");
        span.setAttribute("lang", "ar");
        span.textContent = sura.name;
        meta.appendChild(span);
      });
      /* Koliko si prešao od cijelog mushafa — stranica u odnosu na 604. */
      meta.appendChild(document.createTextNode(
        " · " + Math.round((page / QURAN_TOTAL_PAGES) * 100) + "% mushafa"
      ));
    } else {
      meta.textContent = "Podaci za ovu stranicu još nisu dodani.";
    }

    top.appendChild(meta);

    /* Samo prvi ajet te stranice. */
    if (info && info.text) {
      top.appendChild(makeArabic(info.text, "quran-arabic"));
      /* ayah = 0 je bismilla kojom sura počinje, nije numerisan ajet */
      if (info.ayah) {
        top.appendChild(makeParagraph("quran-ayah", "Ajet " + info.ayah));
      }
    }

    card.appendChild(top);

    card.addEventListener("click", function (e) {
      if (e.target === input) { return; }
      input.checked = !input.checked;
      input.dispatchEvent(new Event("change"));
    });

    input.addEventListener("change", function () {
      state.quran = input.checked;
      pushChange("quran", input.checked);
      saveDayState();
      card.classList.toggle("is-done", input.checked);
      updateProgress();
      if (input.checked) { focusNext(card); }
    });

    return card;
  }

  /* ------------------------------------------------------------------------
     9. "Vidi stranicu" — drawer sa cijelom stranicom mushafa
     ------------------------------------------------------------------------ */

  var drawer = null;

  function buildDrawer() {
    drawer = document.createElement("div");
    drawer.className = "drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.hidden = true;

    var sheet = document.createElement("div");
    sheet.className = "drawer-sheet";

    var head = document.createElement("div");
    head.className = "drawer-head";

    var titles = document.createElement("div");
    titles.appendChild(makeParagraph("drawer-title", ""));
    titles.appendChild(makeParagraph("drawer-sub", ""));

    var close = document.createElement("button");
    close.type = "button";
    close.className = "drawer-close";
    close.setAttribute("aria-label", "Zatvori");
    close.textContent = "✕";
    close.addEventListener("click", closePageView);

    head.appendChild(titles);
    head.appendChild(close);

    var body = document.createElement("div");
    body.className = "drawer-body";

    sheet.appendChild(head);
    sheet.appendChild(body);
    drawer.appendChild(sheet);

    /* klik po zatamnjenoj pozadini zatvara */
    drawer.addEventListener("click", function (e) {
      if (e.target === drawer) { closePageView(); }
    });

    document.body.appendChild(drawer);
  }

  function openPageView(page, info) {
    if (!drawer) { buildDrawer(); }

    drawer.querySelector(".drawer-title").textContent = "Stranica " + page;
    drawer.querySelector(".drawer-sub").textContent =
      "Džuz " + info.juz + " · " +
      Math.round((page / QURAN_TOTAL_PAGES) * 100) + "% mushafa";

    var body = drawer.querySelector(".drawer-body");
    body.textContent = "";

    info.suras.forEach(function (sura) {
      body.appendChild(makeArabic(sura.name, "drawer-sura"));

      /* Ajeti teku jedan za drugim u jednom obostrano poravnatom bloku —
         kao na pravoj stranici mushafa, a ne kao spisak redova.
         Iza svakog ajeta ide njegov broj u krugu. */
      var block = document.createElement("p");
      block.className = "drawer-text";
      block.setAttribute("dir", "rtl");
      block.setAttribute("lang", "ar");

      sura.verses.forEach(function (v) {
        block.appendChild(document.createTextNode(v.t + " "));
        /* n = 0 je bismilla kojom sura počinje — nema svoj broj */
        if (v.n) {
          var mark = document.createElement("span");
          mark.className = "ayah-mark";
          mark.textContent = v.n;
          block.appendChild(mark);
          block.appendChild(document.createTextNode(" "));
        }
      });

      body.appendChild(block);
    });

    drawer.hidden = false;
    document.body.classList.add("no-scroll");
    body.scrollTop = 0;
    drawer.querySelector(".drawer-close").focus();
  }

  function closePageView() {
    if (!drawer) { return; }
    drawer.hidden = true;
    document.body.classList.remove("no-scroll");
  }

  /* Escape zatvara ono što je gore: prvo završni ekran, pa drawer. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") { return; }
    if (celebration && !celebration.hidden) { closeCelebration(); return; }
    if (drawer && !drawer.hidden) { closePageView(); }
  });

  /* ------------------------------------------------------------------------
     10. Sekcije
     ------------------------------------------------------------------------ */

  function renderSections() {
    el.root.textContent = "";

    sections.forEach(function (section) {
      var wrapper = document.createElement("section");
      wrapper.className = "section";
      wrapper.id = "sec-" + section.id;

      var head = document.createElement("div");
      head.className = "section-head";

      var heading = document.createElement("h2");
      heading.className = "section-title";

      var icon = makeIcon(section.icon);
      if (icon) { heading.appendChild(icon); }
      heading.appendChild(document.createTextNode(section.title));
      head.appendChild(heading);

      if (section.items) {
        var count = document.createElement("span");
        count.className = "section-count";
        count.dataset.section = section.id;
        head.appendChild(count);
      }

      wrapper.appendChild(head);

      var list = document.createElement("div");
      list.className = "list";

      if (section.kind === "quran") {
        list.appendChild(renderQuranCard());
      } else {
        /* Dove se numerišu automatski po sekciji: DOVA #1, #2, ...
           Sure i brojani zikr zadržavaju svoje ime. */
        var duaNo = 0;
        section.items.forEach(function (item) {
          var title = item.title;
          if (item.type === "dua") {
            duaNo += 1;
            title = "DOVA #" + duaNo;
          }
          list.appendChild(renderItem(item, title));
        });
      }

      wrapper.appendChild(list);
      el.root.appendChild(wrapper);
    });
  }

  /* ------------------------------------------------------------------------
     11. Progress
     ------------------------------------------------------------------------ */

  function updateProgress() {
    var items = allItems();
    var done = items.reduce(function (sum, item) {
      return sum + (state.items[item.id] ? 1 : 0);
    }, 0) + (state.quran ? 1 : 0);

    var total = items.length + 1;
    var percent = total > 0 ? Math.round((done / total) * 100) : 0;

    sections.forEach(function (section) {
      var node = el.root.querySelector('[data-section="' + section.id + '"]');
      if (!node) { return; }
      var list = section.items || [];
      var secDone = list.reduce(function (sum, item) {
        return sum + (state.items[item.id] ? 1 : 0);
      }, 0);
      node.textContent = secDone + " / " + list.length;
    });

    /* Brojke i završen dan pokazuje prsten — nema posebnog teksta ispod. */
    el.progress.classList.toggle("is-complete", done === total);
    el.progress.setAttribute(
      "aria-label", "Dnevni napredak: " + done + " od " + total
    );

    /* Prsten se puni skraćivanjem crtice — 0% je pun offset, 100% je nula. */
    el.ringFill.style.strokeDashoffset = RING_LENGTH * (1 - percent / 100);
    el.ringLabel.textContent = percent + "%";
    el.progress.setAttribute("aria-valuenow", String(percent));

    /* Dan je završen — "Elhamdulillah" preko cijelog ekrana. Ako dan više
       nije završen (odčekirano, ili je prešla ponoć), ekran se sam skloni. */
    var complete = done === total;
    if (complete && !wasComplete) {
      openCelebration();
    } else if (!complete) {
      closeCelebration();
    }
    /* Dugme za povratak na završni ekran stoji dok je dan završen. */
    showFab(complete);
    wasComplete = complete;
  }

  /* ------------------------------------------------------------------------
     12. "Elhamdulillah" — završni ekran

     Pali se kad dan postane završen: i u trenutku kad zadnja stavka bude
     označena, i pri otvaranju aplikacije na već završen dan (refresh).
     `wasComplete` pamti prethodno stanje da se ekran ne bi vraćao sam
     nakon što ga korisnik zatvori — dok je dan završen, na listi ostaje
     dugme kojim se vraća namjerno.
     ------------------------------------------------------------------------ */

  var celebration = null;
  var wasComplete = false;

  /* Znak rub el-hizb — isti kao u headeru, samo veći. */
  function makeMark(className) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.4");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    /* dva ukrštena kvadrata: drugi je prvi zarotiran za 45° */
    ["", "rotate(45 24 24)"].forEach(function (transform) {
      var rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", "11");
      rect.setAttribute("y", "11");
      rect.setAttribute("width", "26");
      rect.setAttribute("height", "26");
      rect.setAttribute("rx", "1.5");
      if (transform) { rect.setAttribute("transform", transform); }
      svg.appendChild(rect);
    });

    var circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", "24");
    circle.setAttribute("cy", "24");
    circle.setAttribute("r", "4.6");
    svg.appendChild(circle);

    return svg;
  }

  /* Tačkasti prsten oko znaka — vrti se u suprotnom smjeru od njega. */
  function makeHaloRing() {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "halo-ring");
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");

    var circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", "24");
    circle.setAttribute("cy", "24");
    circle.setAttribute("r", "22.5");
    circle.setAttribute("stroke", "currentColor");
    circle.setAttribute("stroke-width", "1");
    circle.setAttribute("stroke-linecap", "round");
    circle.setAttribute("stroke-dasharray", "0.6 4");
    svg.appendChild(circle);

    return svg;
  }

  function buildCelebration() {
    celebration = document.createElement("div");
    celebration.className = "celebrate";
    celebration.setAttribute("role", "dialog");
    celebration.setAttribute("aria-modal", "true");
    celebration.setAttribute("aria-label", "Dnevni zikr je završen");
    celebration.hidden = true;

    /* Pozadina: zlatni sjaj koji diše i tri talasa koji se šire bez kraja. */
    var glow = document.createElement("div");
    glow.className = "celebrate-glow";
    celebration.appendChild(glow);

    var rings = document.createElement("div");
    rings.className = "celebrate-rings";
    rings.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 3; i++) {
      var ripple = document.createElement("span");
      ripple.className = "ripple";
      rings.appendChild(ripple);
    }
    celebration.appendChild(rings);

    var inner = document.createElement("div");
    inner.className = "celebrate-inner";

    var halo = document.createElement("div");
    halo.className = "celebrate-halo";
    halo.appendChild(makeHaloRing());
    halo.appendChild(makeMark("celebrate-mark"));
    inner.appendChild(halo);

    inner.appendChild(makeArabic("الْحَمْدُ لِلَّهِ", "celebrate-arabic"));
    inner.appendChild(makeParagraph("celebrate-word", "Elhamdulillah"));
    inner.appendChild(makeParagraph(
      "celebrate-note", "Cijeli dnevni zikr je završen."
    ));

    var back = document.createElement("button");
    back.type = "button";
    back.className = "celebrate-btn";
    back.textContent = "Nazad na dove";
    back.addEventListener("click", closeCelebration);
    inner.appendChild(back);

    celebration.appendChild(inner);
    document.body.appendChild(celebration);
  }

  function openCelebration() {
    if (!celebration) { buildCelebration(); }
    /* display:none prekida CSS animacije, pa se vraćanjem na ekran svaka
       sama pokrene ispočetka — i drugi put istog dana. */
    celebration.hidden = false;
    document.body.classList.add("no-scroll");
    celebration.querySelector(".celebrate-btn").focus();
  }

  function closeCelebration() {
    if (!celebration || celebration.hidden) { return; }
    celebration.hidden = true;
    document.body.classList.remove("no-scroll");
    /* Vrati se na početak stranice — korisnik vidi popis ispočetka. */
    window.scrollTo(0, 0);
    /* Fokus se vraća na dugme kojim se ekran ponovo otvara — tastatura ne
       ostaje "nigdje" nakon zatvaranja. */
    if (fab && !fab.hidden) { fab.focus(); }
  }

  /* Dugme na dnu liste kojim se vraća na završni ekran. Postoji samo dok je
     dan završen — prije toga se nema gdje vratiti. */
  var fab = null;

  function buildFab() {
    fab = document.createElement("button");
    fab.type = "button";
    fab.className = "celebrate-fab";
    fab.appendChild(makeMark("fab-mark"));
    fab.appendChild(document.createTextNode("Elhamdulillah"));
    fab.addEventListener("click", function () { openCelebration(); });
    document.body.appendChild(fab);
  }

  function showFab(on) {
    if (on && !fab) { buildFab(); }
    if (!fab) { return; }
    fab.hidden = !on;
    /* Dodatni prostor na dnu strane da dugme ne stoji preko zadnje kartice
       ni preko dugmeta za podsjetnike. */
    document.body.classList.toggle("has-fab", on);
  }

  /* ------------------------------------------------------------------------
     13. Start
     ------------------------------------------------------------------------ */

  function render() {
    dateKey = getLocalDateKey();
    state = getDayState(dateKey);
    var now = new Date();
    el.date.textContent = formatGregorian(now);
    el.hijri.textContent = formatHijri(now);
    renderSections();
    updateProgress();
  }

  render();

  /* Uparivanje sa zajedničkim stanjem: ono što je čekirano na drugom
     uređaju stiže ovamo, a ono što je ovdje čekirano ide gore. */
  if (window.mojZikrSync) {
    window.mojZikrSync.onState(applyRemoteState);
    window.mojZikrSync.start(dateKey, checkedMap());
  }

  function refreshShared() {
    if (window.mojZikrSync) { window.mojZikrSync.start(dateKey, checkedMap()); }
  }

  /* Ako je kartica ostala otvorena preko ponoći, na povratku se sam
     otvara novi dan sa čistim spiskom. */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { return; }

    if (getLocalDateKey() !== dateKey) {
      render();
      window.scrollTo(0, 0);
    }

    /* Povratak u aplikaciju je jedini trenutak kad se stanje sa drugog
       uređaja može vidjeti — tu se povlači. Ako je nešto ostalo neposlano
       (bio offline), prvo ode gore. */
    refreshShared();
  });

  /* Mreža se vratila — pošalji što je čekalo i pokupi tuđe promjene. */
  window.addEventListener("online", refreshShared);

})();
