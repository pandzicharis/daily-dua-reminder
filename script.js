/* ==========================================================================
   Moj Zikr — script.js
   Vanilla JavaScript. Bez frameworka, bez backenda.
   Aplikacija uvijek prikazuje SAMO današnji dan; sutra kreće čist spisak.
   ========================================================================== */

(function () {
  "use strict";

  var STORAGE_KEY = "moj-zikr-state";

  /* Proba drugog dana pamti se ODVOJENO od pravog spiska. Dan se mijenja
     samo iz testnog panela (dev-panel.js, samo localhost), a kvačica
     napravljena u probi ne smije ni ući u pravi dan ni otići na server —
     inače bi proba petka pokvarila stvarni spisak i podsjetnike. */
  var PREVIEW_KEY = "moj-zikr-proba";

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

  /* Ikonice su u data.js (`SECTION_ICONS`, `makeSectionIcon`) — isti znak nosi
     i naslov sekcije ovdje i zaglavlje akordeona u postavkama. */

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

  /* Ključ "YYYY-MM-DD" pomjeren za `delta` dana. Računa se preko UTC ponoći
     da prelazak na ljetno/zimsko vrijeme ne preskoči ni jedan dan. */
  function shiftKey(key, delta) {
    var p = key.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() + delta);
    return d.getUTCFullYear() + "-" +
           String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
           String(d.getUTCDate()).padStart(2, "0");
  }

  /* Ključ -> lokalni Date, zakačen za podne: tako ni pomjeranje sata ni
     zona ne mogu ispisati dan ranije ili kasnije. */
  function dateFromKey(key) {
    var p = key.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
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

  /* Pravi dan ide u svoj prostor, proba u svoj. */
  function storeKey() {
    return isPreview() ? PREVIEW_KEY : STORAGE_KEY;
  }

  function readStore() {
    try {
      var parsed = JSON.parse(localStorage.getItem(storeKey()));
      return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      localStorage.setItem(storeKey(), JSON.stringify(store));
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
    /* Proba drugog dana ostaje na ovom uređaju. */
    if (isPreview()) { return; }
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

    /* Ovo je prvo uparivanje nakon otvaranja: localStorage je bio zastario
       (čekirano je na drugom uređaju), pa je i skok pri otvaranju pao na
       pogrešno mjesto. Ponovi ga sa stanjem koje je sada tačno. */
    openAtFirstUnfinished();
  }

  /* ------------------------------------------------------------------------
     4. Trenutno stanje ekrana
     ------------------------------------------------------------------------ */

  /* Stvarni današnji dan i dan koji je na ekranu. Razlikuju se samo kad se
     strelicama gleda drugi dan (proba). */
  var todayKey = getLocalDateKey();
  var dateKey = todayKey;

  /* Gleda li se dan koji nije današnji. Sve što pamti stanje pita OVO, jer
     proba ima svoj prostor i ne ide na server. */
  function isPreview() {
    return dateKey !== todayKey;
  }

  var state = getDayState(dateKey);

  /* ------------------------------------------------------------------------
     Config korisnika (settings.js)

     Dvije stvari iz configa dodiruju ovaj fajl: `transkript` mijenja šta se
     ispisuje ispod naslova dove, a `skriveno` mijenja šta uopšte postoji.
     Oba se čitaju pri svakom crtanju, ne pamte se u varijabli — drawer ih
     mijenja usred rada.

     Ako settings.js nije učitan, vrijedi prazan config: sve postoji,
     transkripcija je ugašena. Aplikacija tada radi kao prije njega.
     ------------------------------------------------------------------------ */
  function prefs() {
    return (window.mojZikrConfig && window.mojZikrConfig.prefs()) || {};
  }

  /* Sekcije koje TOG dana postoje (data.js), bez stavki koje je korisnik
     isključio. SVE što crta i računa ide kroz ovo, nikad kroz globalni
     `sections` — inače petačka sekcija ostane na ekranu i u subotu, a ostalim
     danima naraste `total` pa se dan nikad ne završi i "Elhamdulillah" se ne
     otvori. Isto vrijedi i za isključenu stavku: da ostane u računu, dan se
     ne bi mogao završiti. */
  var visible = sectionsForDate(dateKey, prefs());

  var el = {
    date: document.getElementById("todayDate"),
    hijri: document.getElementById("todayHijri"),
    groups: document.getElementById("progressGroups"),
    root: document.getElementById("sectionsRoot")
  };

  function allItems() {
    return visible.reduce(function (acc, section) {
      return acc.concat(section.items || []);
    }, []);
  }

  /* Kur'anska stranica se ne broji kroz `allItems()` — nije stavka liste nego
     jedno polje (`state.quran`) — pa svaki zbir dodaje njenu jedinicu ručno.
     Od kad se i ona smije isključiti, ta jedinica NIJE stalna: bez ovoga bi
     `total` ostao veći od stvarnog i dan se nikad ne bi mogao završiti. */
  function quranVisible() {
    return visible.some(function (section) { return section.kind === "quran"; });
  }

  /* Sekcije koje se stvarno crtaju. Ona kojoj su SVE stavke isključene se
     preskače cijela — naslov nad prazninom ne govori ništa, a uključuju se
     tamo gdje su i isključene (postavke). `sectionsForDate()` je svejedno
     vraća, jer postavkama treba cijeli spisak. */
  function drawableSections() {
    return visible.filter(function (section) {
      return section.kind === "quran" || (section.items || []).length > 0;
    });
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
       "dua" -> arapski u jednom toku, pa prevod ispod.

       Uz upaljenu transkripciju arapski se ZAMJENJUJE transliteracijom, ne
       dopunjava: dvoje istog teksta jedno ispod drugog samo produži karticu
       a ništa ne doda. Prevod ostaje u oba slučaja.

       Dova bez `transliteration` bi u tom režimu ostala bez ijednog teksta,
       pa se za nju vraća arapski. Trenutno je imaju sve, ali nova dova se
       može dodati bez nje i ne smije ispasti prazna. */
    if (item.type === "dua") {
      var body = document.createElement("div");
      var transcript = prefs().transkript === true && !!item.transliteration;
      body.className = "item-body";

      if (transcript) {
        body.appendChild(makeParagraph("transliteration", item.transliteration));
      } else {
        var flow = arabicAsOneFlow(item.arabic);
        if (flow) { body.appendChild(makeArabic(flow)); }
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
      openScrollPending = false;
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

  /* Skok "gdje si stao" vrijedi SAMO pri otvaranju. Prva kvačica znači da
     dalje skrol vodi čovjek (focusNext), pa mu se strana više ne premješta
     sama — ni kad stanje stigne sa drugog uređaja. */
  var openScrollPending = true;

  /* Trajanje animacije po udaljenosti: pomjeraj za pola ekrana mora biti
     brz, a desetak ekrana (otvaranje na "Navečer") ne smije proći kao mrlja.
     Gornja granica je da se ni najduži pomjeraj ne čeka. */
  function scrollDuration(distance) {
    return Math.min(900, Math.max(420, Math.round(distance / 8)));
  }

  /* Čovjek je uzeo skrol u svoje ruke: animacija u toku odustaje (dvije ruke
     na istom skrolu se otimaju i strana poskakuje), a skok pri otvaranju se
     otkazuje — ako je krenuo sam, ne premještaj ga.

     Sluša se `wheel`/`touchstart`, a NE `scroll`: `scroll` opali i na naš
     vlastiti skrol, pa bi animacija otkazala samu sebe u prvom frejmu. */
  ["wheel", "touchstart", "keydown"].forEach(function (name) {
    window.addEventListener(name, function () {
      openScrollPending = false;
      if (scrollAnim) { cancelAnimationFrame(scrollAnim); scrollAnim = null; }
    }, { passive: true });
  });

  /* `duration` je opciono: bez njega se računa iz udaljenosti. */
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

    if (duration === undefined) { duration = scrollDuration(Math.abs(delta)); }
    /* Trajanje 0 znači bez animacije — skoči odmah. */
    if (!duration) { window.scrollTo(0, endY); return; }

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

  function scrollCardIntoView(card, duration) {
    var rect = card.getBoundingClientRect();
    /* Kartica viša od ekrana se ne može centrirati — poravnaj joj vrh. */
    var offset = rect.height >= window.innerHeight - 40
      ? 16
      : (window.innerHeight - rect.height) / 2;
    smoothScrollTo(window.pageYOffset + rect.top - offset, duration);
  }

  /* Sekcija se podiže tako da joj naslov stane ISPOD sticky headera — bez
     ovoga header prekrije baš onaj naslov zbog kojeg se skrolalo. Granica se
     mjeri, ne prepisuje: header je viši na širem ekranu, a testna traka ga
     dodatno spusti. */
  function sectionById(id) {
    for (var i = 0; i < visible.length; i++) {
      if (visible[i].id === id) { return visible[i]; }
    }
    return null;
  }

  function scrollSectionIntoView(section, duration) {
    var header = document.querySelector(".app-header");
    var edge = header ? header.getBoundingClientRect().bottom : 0;
    var top = section.getBoundingClientRect().top + window.pageYOffset;
    smoothScrollTo(top - edge - 12, duration);
  }

  /* Kartice u redoslijedu u kojem stoje na ekranu. Sa spiskom id-eva sekcija
     samo iz njih — redoslijed prati `visible` (ekran), a ne spisak. */
  function cardsIn(sectionIds) {
    var roots = [];

    if (sectionIds) {
      visible.forEach(function (section) {
        if (sectionIds.indexOf(section.id) === -1) { return; }
        var node = document.getElementById("sec-" + section.id);
        if (node) { roots.push(node); }
      });
    } else {
      roots.push(el.root);
    }

    return roots.reduce(function (acc, root) {
      return acc.concat(Array.prototype.slice.call(
        root.querySelectorAll(".item, .quran-card")
      ));
    }, []);
  }

  function firstUnfinished(cards) {
    for (var i = 0; i < cards.length; i++) {
      if (!cards[i].classList.contains("is-done")) { return cards[i]; }
    }
    return null;
  }

  /* Prva kartica svoje sekcije se ne centrira nego se podigne cijela sekcija:
     tako se vidi i naslov iznad, pa je jasno gdje si. Sama kartica na vrhu
     ekrana izgleda kao da je spisak počeo od sredine. */
  function scrollToCard(card, duration) {
    var section = card.closest ? card.closest(".section") : null;
    if (section && section.querySelector(".item, .quran-card") === card) {
      scrollSectionIntoView(section, duration);
      return;
    }
    scrollCardIntoView(card, duration);
  }

  function focusNext(currentCard) {
    var cards = cardsIn(null);
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
      viewBtn.appendChild(makeSectionIcon("pages", "btn-icon"));
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
      openScrollPending = false;
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

  /* Prazan spisak — korisnik je u postavkama isključio sve. Nije greška
     niti završen dan, samo nema šta pokazati; dugme vodi nazad u postavke. */
  function renderEmpty() {
    var empty = document.createElement("div");
    empty.className = "empty-state";

    var msg = document.createElement("p");
    msg.className = "empty-msg";
    msg.textContent = "Nema dova";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "empty-btn";
    btn.textContent = "Odaberi dove";
    btn.addEventListener("click", function () {
      if (window.mojZikrConfig && window.mojZikrConfig.otvori) {
        window.mojZikrConfig.otvori();
      }
    });

    empty.appendChild(msg);
    empty.appendChild(btn);
    el.root.appendChild(empty);
  }

  function renderSections() {
    el.root.textContent = "";

    var draw = drawableSections();
    if (!draw.length) {
      renderEmpty();
      return;
    }

    draw.forEach(function (section) {
      var wrapper = document.createElement("section");
      wrapper.className = "section";
      wrapper.id = "sec-" + section.id;

      var head = document.createElement("div");
      head.className = "section-head";

      var heading = document.createElement("h2");
      heading.className = "section-title";

      var icon = makeSectionIcon(section.icon);
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
        /* Dove se numerišu automatski po sekciji (DOVA #1, #2, ...), a sure i
           brojani zikr zadržavaju svoje ime. Numeraciju daje `itemTitles()` iz
           data.js, ne brojač ovdje: ona ide preko CIJELOG spiska sekcije, pa
           dova sakrivena u postavkama ne prenumeriše one ispod sebe i u
           postavkama i na ekranu piše isti broj. */
        var titles = itemTitles(section.id);
        section.items.forEach(function (item) {
          list.appendChild(renderItem(item, titles[item.id] || item.title));
        });
      }

      wrapper.appendChild(list);
      el.root.appendChild(wrapper);
    });
  }

  /* ------------------------------------------------------------------------
     11. Progress — trake po dobu dana

     Jedini prikaz napretka. Prije njih je u headeru stajao prsten sa jednim
     postotkom, ali na 60% nije govorio je li dnevni zikr gotov ili je stao
     na pola — a to je jedino što treba znati. Trake to kažu, pa je prsten
     uklonjen i na njegovo mjesto je došlo dugme za postavke.

     Podjela se NE piše ovdje — čita se iz notification-tasks.js, iz istog
     spiska po kojem stižu obavijesti. Tako "Dan" na ekranu pokriva tačno
     ono što pokriva i dnevni podsjetnik, i nova sekcija u data.js sama
     upadne u pravu traku umjesto da se podjela vodi na dva mjesta.
     ------------------------------------------------------------------------ */

  /* Naslovi iz notification-tasks.js nose emoji i riječ "zikr" ("Dnevni
     zikr ☀️") — u traci širine jednog stupca treba samo doba dana. */
  var GROUP_LABELS = {
    dan: "Dan",
    navecer: "Navečer",
    petak: "Petak"
  };

  /* Trake za dan koji je na ekranu. Podsjetnik bez svog dana (petak subotom)
     otpada, isto kao i sekcija na koju se odnosi. */
  function progressGroups() {
    if (typeof NOTIFICATION_TASKS === "undefined") { return []; }

    var wd = weekdayFromKey(dateKey);

    var groups = NOTIFICATION_TASKS.filter(function (task) {
      if (task.enabled === false) { return false; }
      return !task.days || task.days.indexOf(wd) !== -1;
    }).map(function (task) {
      /* `sections` je izričit spisak; `exceptSections` znači "sve ostalo",
         pa se rješava iz sekcija koje TOG dana postoje. */
      var ids = task.sections || visible.filter(function (section) {
        return (task.exceptSections || []).indexOf(section.id) === -1;
      }).map(function (section) { return section.id; });

      return {
        id: task.id,
        label: GROUP_LABELS[task.id] || task.title,
        sections: ids
      };
    });

    /* Redoslijed traka prati redoslijed sekcija na ekranu, a ne redoslijed
       u notification-tasks.js — petačka sekcija je gore, pa je i traka prva.
       Grupa bez ijedne vidljive sekcije ide na kraj i ionako otpada ispod. */
    function firstSectionIndex(group) {
      var best = visible.length;
      visible.forEach(function (section, index) {
        if (group.sections.indexOf(section.id) !== -1 && index < best) {
          best = index;
        }
      });
      return best;
    }

    return groups.sort(function (a, b) {
      return firstSectionIndex(a) - firstSectionIndex(b);
    });
  }

  /* Urađeno/ukupno za date sekcije. Kur'anska sekcija nema `items` — ona je
     jedna stavka i pamti se u `state.quran`, isto kao u ukupnom računu. */
  function countGroup(sectionIds) {
    var done = 0;
    var total = 0;

    visible.forEach(function (section) {
      if (sectionIds.indexOf(section.id) === -1) { return; }

      if (section.kind === "quran") {
        total += 1;
        if (state.quran) { done += 1; }
        return;
      }

      (section.items || []).forEach(function (item) {
        total += 1;
        if (state.items[item.id]) { done += 1; }
      });
    });

    return { done: done, total: total };
  }

  /* Iscrtane trake i potpis sastava po kojem su iscrtane — dok se sastav ne
     promijeni (drugi dan, druge sekcije), mijenja se samo ispuna. */
  var groupNodes = [];
  var groupSignature = null;

  /* Klik na traku vodi na prvu neobavljenu stavku TE grupe — isto pravilo po
     kojem se aplikacija i otvara. Kad je grupa završena, vodi na njen početak:
     traka i tada nekud vodi, a ne "nikud". */
  function goToGroup(group) {
    var cards = cardsIn(group.sections);
    var target = firstUnfinished(cards) || cards[0];
    if (target) { scrollToCard(target); }
  }

  function buildGroupBars(groups) {
    el.groups.textContent = "";

    groupNodes = groups.map(function (group) {
      /* Dugme, ne <div>: traka je kontrola (vodi na svoj dio spiska), pa mora
         doći na tastaturu i pod čitač ekrana kao kontrola. Mjerač napretka
         (role="progressbar") seli na samu traku ispod naslova — dugme kojem
         se prepiše ta rola prestane biti dugme za čitača ekrana. */
      var wrapper = document.createElement("button");
      wrapper.type = "button";
      wrapper.className = "pgroup";
      wrapper.addEventListener("click", function () { goToGroup(group); });

      var head = document.createElement("div");
      head.className = "pgroup-head";

      var label = document.createElement("span");
      label.className = "pgroup-label";
      label.textContent = group.label;

      var count = document.createElement("span");
      count.className = "pgroup-count";

      head.appendChild(label);
      head.appendChild(count);

      var track = document.createElement("div");
      track.className = "pgroup-track";
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");

      var fill = document.createElement("div");
      fill.className = "pgroup-fill";
      track.appendChild(fill);

      wrapper.appendChild(head);
      wrapper.appendChild(track);
      el.groups.appendChild(wrapper);

      return {
        group: group,
        node: wrapper,
        track: track,
        count: count,
        fill: fill
      };
    });
  }

  function updateGroupBars() {
    /* Grupa bez ijedne stavke se ne crta — prazna traka ne govori ništa. */
    var groups = progressGroups().filter(function (group) {
      return countGroup(group.sections).total > 0;
    });

    var signature = groups.map(function (group) {
      return group.id + ":" + group.sections.join(",");
    }).join("|");

    if (signature !== groupSignature) {
      buildGroupBars(groups);
      groupSignature = signature;
    }

    groupNodes.forEach(function (entry) {
      var tally = countGroup(entry.group.sections);
      var percent = Math.round((tally.done / tally.total) * 100);
      var complete = tally.done === tally.total;

      entry.node.classList.toggle("is-done", complete);
      entry.fill.style.transform = "scaleX(" + (percent / 100) + ")";
      /* Brojka stoji uvijek, i kad je gotovo — završeno se vidi po boji
         (zlatna traka i brojka), ne po tome što je brojka nestala. */
      entry.count.textContent = tally.done + "/" + tally.total;

      entry.track.setAttribute("aria-valuenow", String(percent));
      entry.track.setAttribute(
        "aria-label",
        entry.group.label + ": " + tally.done + " od " + tally.total
      );
      /* Naziv dugmeta kaže i stanje i šta se klikom dobije. */
      entry.node.setAttribute(
        "aria-label",
        entry.group.label + ": " + tally.done + " od " + tally.total + " — " +
        (complete ? "idi na početak" : "idi na prvu neobavljenu stavku")
      );
    });
  }

  /* ------------------------------------------------------------------------
     11b. Progress — ukupno (brojke po sekcijama i završen dan)
     ------------------------------------------------------------------------ */

  function updateProgress() {
    var items = allItems();
    var quran = quranVisible();

    var done = items.reduce(function (sum, item) {
      return sum + (state.items[item.id] ? 1 : 0);
    }, 0) + ((quran && state.quran) ? 1 : 0);

    var total = items.length + (quran ? 1 : 0);

    visible.forEach(function (section) {
      var node = el.root.querySelector('[data-section="' + section.id + '"]');
      if (!node) { return; }
      var list = section.items || [];
      var secDone = list.reduce(function (sum, item) {
        return sum + (state.items[item.id] ? 1 : 0);
      }, 0);
      node.textContent = secDone + " / " + list.length;
    });

    /* Ukupan napredak se vidi iz traka po dobu dana — prstena u headeru
       nema. Traka je i preciznija: kaže i KOJI dio dana nedostaje, što je
       jedan postotak nikad nije govorio. Zbir se i dalje računa jer o njemu
       zavisi završni ekran. */
    updateGroupBars();

    /* Dan je završen — "Elhamdulillah" preko cijelog ekrana. Ako dan više
       nije završen (odčekirano, ili je prešla ponoć), ekran se sam skloni.

       `total > 0` je za slučaj da je korisnik u postavkama isključio SVE:
       prazan spisak nije završen dan nego prazan spisak, i čestitka za nula
       urađenih stvari bi bila podsmijeh. */
    var complete = total > 0 && done === total;
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

  /* Kad se gleda dan koji nije današnji, `body` nosi klasu po kojoj se
     iscrtava vidljiva oznaka (traka na vrhu, prigušene trake napretka).
     Panel se javi kroz `naPromjenu` da osvježi svoj ispis. */
  var onDayChange = null;

  function markPreview() {
    document.body.classList.toggle("is-preview", isPreview());
    if (onDayChange) { onDayChange(dateKey, todayKey); }
  }

  /* Crta dan koji je u `dateKey` — današnji ili onaj izabran strelicama.
     Stanje i spisak sekcija se uvijek čitaju iznova, pa je dovoljno
     promijeniti `dateKey` i pozvati ovo. */
  function render() {
    todayKey = getLocalDateKey();
    state = getDayState(dateKey);
    visible = sectionsForDate(dateKey, prefs());
    var shown = dateFromKey(dateKey);
    el.date.textContent = formatGregorian(shown);
    el.hijri.textContent = formatHijri(shown);
    markPreview();
    renderSections();
    updateProgress();
  }

  /* Prebacivanje na drugi dan. Završni ekran se pri prebacivanju NE otvara
     sam (`wasComplete = true`) — čovjek je tražio spisak, ne čestitku; ako
     je taj dan završen, ostaje dugme kojim se ekran otvori namjerno. */
  function showDay(key) {
    if (key === dateKey) { return; }
    dateKey = key;
    closeCelebration();
    wasComplete = true;
    render();
    window.scrollTo(0, 0);
    /* Natrag na današnji dan — povuci zajedničko stanje, jer se u
       međuvremenu moglo promijeniti na drugom uređaju. */
    refreshShared();
  }

  /* Otvaranje na mjestu gdje se stalo. Ako je dio dana već obavljen, spisak
     se otvara na prvoj NEOBAVLJENOJ stavci — bez ovoga se, kad je dnevni zikr
     gotov, do "Navečer" mora skrolati kroz cijeli spisak. Ako danas nije
     čekirano ništa, ostaje se na vrhu: nema se šta preskočiti. */
  function anyChecked() {
    if (quranVisible() && state.quran) { return true; }
    return allItems().some(function (item) { return !!state.items[item.id]; });
  }

  function openAtFirstUnfinished() {
    if (!openScrollPending || !anyChecked()) { return; }

    /* Sve je završeno — gore je "Elhamdulillah", nema se gdje ići. */
    var target = firstUnfinished(cardsIn(null));
    if (!target) { return; }

    /* Animirano, a ne skokom: vidi se da je strana otišla nadole do prve
       neobavljene stavke, pa je jasno šta se dogodilo i šta je iznad.
       Trajanje se računa iz udaljenosti (vidi `scrollDuration`). */
    scrollToCard(target);
  }

  render();

  /* Skok se mjeri kad su fontovi tu: arapski Hafs je krupan, pa dok se ne
     učita, kartice imaju druge visine i skok padne na pogrešno mjesto.

     Uz to i vremenska granica — ako `document.fonts.ready` ne stigne (stariji
     webview, kartica koja se ne iscrtava), bolje skočiti na neizmjerenom
     rasporedu nego ne skočiti nikako. Šta prvo stigne, to vrijedi. */
  var opened = false;

  function openOnce() {
    if (opened) { return; }
    opened = true;
    openAtFirstUnfinished();
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      requestAnimationFrame(openOnce);
    });
    setTimeout(openOnce, 500);
  } else {
    requestAnimationFrame(openOnce);
  }

  /* ------------------------------------------------------------------------
     Ono što testni panel (dev-panel.js) smije dirati.

     Namjerno malo i namjerno bez ijedne reference na panel u ostatku koda:
     kad panela nema (produkcija), ovdje se ništa ne mijenja i aplikacija ne
     zna da je ikad postojao.
     ------------------------------------------------------------------------ */
  window.mojZikr = {
    /* dan koji je na ekranu, "YYYY-MM-DD" */
    dan: function () { return dateKey; },
    /* stvarni današnji dan */
    danas: function () { return getLocalDateKey(); },
    proba: function () { return isPreview(); },
    /* prikaži dati dan (kvačice tog dana su lokalne, vidi isPreview) */
    prikazi: function (key) { showDay(key); },
    /* pomjeri prikazani dan za ±n dana */
    pomjeri: function (delta) { showDay(shiftKey(dateKey, delta)); },
    /* šta je na ekranu čekirano, u obliku u kojem to server pamti — panel
       ovo pošalje pri okidanju, da obavijest odgovara onome što se vidi.
       Bez toga bi proba drugog dana uvijek izgledala kao "ništa čekirano",
       jer se kvačice tog dana čuvaju lokalno i ne idu na server. */
    cekirano: function () { return checkedMap(); },
    /* panel se ovim prijavi da ga zovemo kad se dan promijeni */
    naPromjenu: function (fn) {
      onDayChange = fn;
      fn(dateKey, todayKey);
    }
  };

  /* Uparivanje sa zajedničkim stanjem: ono što je čekirano na drugom
     uređaju stiže ovamo, a ono što je ovdje čekirano ide gore. */
  if (window.mojZikrSync) {
    window.mojZikrSync.onState(applyRemoteState);
    window.mojZikrSync.start(dateKey, checkedMap());
  }

  /* ------------------------------------------------------------------------
     Promjena u postavkama

     Tri stvari mogu doći odavde: druga transkripcija, isključena/uključena
     stavka, i drugo ime. Sve tri traže isto — ponovo iscrtati dan.

     Kod imena ide i ponovno uparivanje: novi korisnik ima svoj spisak, pa
     ono što se vidi na ekranu više ne mora biti njegovo. `start()` prvo
     pošalje ono što je ovdje čekirano a nije stiglo gore, pa povuče stanje
     tog korisnika.

     Završni ekran se pri ovome NE otvara sam. Isključivanjem zadnjih
     neobavljenih stavki dan zna postati završen, a puni ekran "Elhamdulillah"
     preko otvorenih postavki bi bio iznenađenje umjesto čestitke. Dugme za
     njega svejedno ostaje.
     ------------------------------------------------------------------------ */
  if (window.mojZikrConfig) {
    var lastUser = window.mojZikrConfig.korisnik();

    window.mojZikrConfig.naPromjenu(function (config, user) {
      wasComplete = true;
      render();

      if (user !== lastUser) {
        lastUser = user;
        /* Spisak prethodnog korisnika se ne prenosi novom: ono što je u
           redu za slanje pripada danu, a ne imenu, pa `start()` to pošalje
           pod novim imenom i odmah povuče njegovo stanje. */
        refreshShared();
      }
    });
  }

  function refreshShared() {
    if (!window.mojZikrSync) { return; }
    /* Proba drugog dana se ne dijeli — ni gore ni dolje. Bez ovoga bi
       `start()` poslao probne kvačice na server pod tim datumom. */
    if (isPreview()) { return; }
    window.mojZikrSync.start(todayKey, checkedMap());
  }

  /* Ako je kartica ostala otvorena preko ponoći, na povratku se sam
     otvara novi dan sa čistim spiskom. */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { return; }

    /* Ponoć je prešla dok je kartica bila otvorena. Ako se gledao današnji
       dan, otvara se novi; u probi se ostaje na izabranom danu, samo se
       "natrag na danas" pomjerio. */
    if (getLocalDateKey() !== todayKey) {
      todayKey = getLocalDateKey();
      if (!isPreview()) { dateKey = todayKey; }
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

  /* ------------------------------------------------------------------------
     Testni panel (dev-panel.js) — SAMO localhost.

     Učitava se ovdje, a ne kroz <script> u index.html, da u produkciji ne
     postoji ni jedan zahtjev za njim: fajl se i ne deployuje (.vercelignore),
     pa bi statični tag tamo davao 404 u konzoli.
     ------------------------------------------------------------------------ */
  if (location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      location.hostname === "[::1]") {
    var devPanel = document.createElement("script");
    devPanel.src = "dev-panel.js";
    document.body.appendChild(devPanel);
  }

})();
