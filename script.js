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

  /* Koliko se stranica uči u jednom danu — iz configa korisnika. Zatečeno je
     jedna, kao i prije nego je ta postavka postojala. */
  function quranPerDay() {
    var n = prefs().stranice;
    return (typeof n === "number" && n >= 1) ? Math.floor(n) : 1;
  }

  /* Stranice za dati datum: start stranica + broj dana od start datuma, s tim
     da svaki dan nosi `perDay` stranica umjesto jedne. Nakon 604. kreće
     ispočetka.

     Cijela dnevna porcija je JEDNA stavka sa jednom kvačicom — isto kao i
     dosad, samo što je porcija sada može biti duža od jedne stranice. Zato se
     na serveru ništa ne mijenja: polje je i dalje "quran". */
  function getQuranPages(dateKey) {
    var perDay = quranPerDay();
    var total = QURAN_TOTAL_PAGES;
    var first = QURAN_START_PAGE + daysBetween(QURAN_START_DATE, dateKey) * perDay;
    var out = [];

    for (var i = 0; i < perDay; i++) {
      /* modulo koji radi i za datume prije početnog */
      out.push(((((first + i - 1) % total) + total) % total) + 1);
    }

    return out;
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
     nigdje ne prikazuju — sutra se otvara potpuno čist spisak.

     `counts` je nedovršeno brojanje klikova (vidi 5b) i stoji ODVOJENO od
     `items`: `items` je urađeno/nije i to je ono što ide na server, a
     `counts` je "dokle si stigao" i ostaje na ovom uređaju. */
  function getDayState(key) {
    var day = readStore()[key];
    if (!day || typeof day !== "object") { day = {}; }
    if (!day.items || typeof day.items !== "object") { day.items = {}; }
    if (typeof day.quran !== "boolean") { day.quran = false; }
    if (!day.counts || typeof day.counts !== "object") { day.counts = {}; }
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

    /* Stavka koja je gore dobila kvačicu je izbrojana do kraja — brojka ide
       na njen cilj. Isto pravilo vrijedi i za klik ovdje: kvačica i puna
       brojka su jedno stanje, pa se odčekiravanjem brojanje ne gubi ni kad
       je kvačica došla sa drugog uređaja. */
    Object.keys(next).forEach(function (id) { markCounted(id); });

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
    header: document.querySelector(".app-header"),
    glass: document.querySelector(".app-glass"),
    greeting: document.getElementById("greeting"),
    greetingName: document.getElementById("greetingName"),
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
     5b. Brojanje klikom — stavka sa `repetitions`

     Zikr koji se ponavlja (30 salavata) ne dobija kvačicu na prvi klik nego
     na trideseti: svaki klik po kartici je jedno ponavljanje, kartica nosi
     brojku "12 / 30" i traku koja se puni, a kvačica padne sama kad brojka
     dođe do cilja. Aplikacija tako radi kao tespih i ne treba pamtiti dokle
     si stigao.

     Ko je izbrojao na tespihu ne mora klikati trideset puta: klik na SAM
     checkbox označi stavku odmah, kao i svaku drugu. Zbog toga za ovo nema
     prekidača u postavkama — obje navike prolaze kroz istu karticu.

     Brojanje se NE GUBI odčekiravanjem. Ko je jednom izbrojao trideset
     salavata pa slučajno (ili namjerno) skinuo kvačicu, sljedećim klikom je
     vraća — brojka je ostala puna i ne kreće se ispočetka. Zato `counts`
     pamti i dovršeno brojanje, a ne samo ono u toku.

     Novo brojanje se traži izričito: DRŽANJEM prsta na brojci. Kratak klik
     to ne može biti — on je već zauzet za "jedno ponavljanje više", a taj se
     u ovoj kartici pritisne trideset puta zaredom.

     Nedovršeno brojanje je LOKALNO (`counts` u localStorage-u) i NE ide na
     server. Server pamti samo urađeno/nije, u hash-u `items:<ime>:<datum>`
     gdje SVAKA vrijednost znači "urađeno" (vidi api/state.js) — upisano "12"
     bi na drugom telefonu izgledalo kao završen zikr, a ne kao pola posla.
     Zato brojanje ostaje na uređaju na kojem je počelo; kad dođe do kraja,
     gore ide obična kvačica i sve dalje (podsjetnici, trake napretka) je ne
     razlikuje od ostalih stavki.
     ------------------------------------------------------------------------ */

  /* Koliko klikova traži stavka; 0 = obična kvačica, na jedan klik.
     `repetitions: 1` nije brojač — jedno ponavljanje je i tako jedan klik. */
  function tapTarget(item) {
    var n = item && item.repetitions;
    return (typeof n === "number" && n > 1) ? n : 0;
  }

  /* Dokle je stavka izbrojana. Označena vraća cijeli cilj (30 / 30) bez
     obzira na zapis: urađeno je zapisano kvačicom u `items` i to je jače od
     brojke. Rezultat je uvijek unutar [0, cilj], pa pokvaren ili zastario
     zapis ne može prikazati "31 / 30".

     Gornja granica je CILJ, a ne cilj minus jedan: izbrojana a odčekirana
     stavka postoji i mora se moći prikazati kao puna. */
  function tapCount(id, target) {
    if (state.items[id]) { return target; }
    var n = state.counts[id];
    if (typeof n !== "number" || !(n > 0)) { return 0; }
    return Math.min(Math.floor(n), target);
  }

  function setTapCount(id, n) {
    if (n > 0) { state.counts[id] = n; } else { delete state.counts[id]; }
  }

  /* Stavka po id-u, iz onoga što se danas prikazuje. Treba samo za brojku:
     kad kvačica stigne sa drugog uređaja, ovdje se mora znati koliki joj je
     cilj da brojka sjedne na njega. */
  function itemById(id) {
    var found = null;
    visible.forEach(function (section) {
      (section.items || []).forEach(function (item) {
        if (item.id === id) { found = item; }
      });
    });
    return found;
  }

  /* Stavka je označena — brojka ide na cilj. Obična (nebrojana) nema šta
     pamtiti, pa joj se zapis briše. */
  function markCounted(id) {
    var target = tapTarget(itemById(id));
    if (target) { state.counts[id] = target; } else { delete state.counts[id]; }
  }

  /* Sitan drhtaj na klik — tespih u ruci. Android ga ima, iOS ne podržava
     `vibrate` pa tamo prosto nema ničega; oba slučaja su u redu. */
  function buzz(pattern) {
    try {
      if (navigator.vibrate) { navigator.vibrate(pattern); }
    } catch (e) {
      /* uređaj ne dozvoljava vibraciju — brojanje radi i bez nje */
    }
  }

  /* Brojač jedne stavke: brojka i traka ispod headera. `paint()` je JEDINO
     mjesto koje ih crta — brojka i traka se ne smiju razići.

     Dugmeta za vraćanje jednog pogrešnog klika nema namjerno: klik viška se
     ne mjeri. Novo brojanje od nule traži se DRŽANJEM prsta na brojci —
     izričito, jer kratki klik ovdje znači "još jedno ponavljanje". */
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
      /* Traka nije potomak brojke, pa boju "gotovo" ne može naslijediti
         selektorom — dobija svoju klasu. */
      fill.classList.toggle("is-full", full);
    }

    /* Kratak skok brojke na svaki klik. Klasa se prvo skida i tjera se
       proračun rasporeda — bez toga browser ne vidi promjenu, pa se pri
       brzom klikanju animacija ne pokrene drugi put. */
    function pulse() {
      chip.classList.remove("is-bump");
      void chip.offsetWidth;
      chip.classList.add("is-bump");
    }

    return { chip: chip, track: track, paint: paint, pulse: pulse };
  }

  /* ------------------------------------------------------------------------
     6. Stavka liste
     ------------------------------------------------------------------------ */

  /* displayTitle dolazi izvana jer se dove numerišu automatski ("DOVA #3"). */
  function renderItem(item, displayTitle) {
    var checked = !!state.items[item.id];
    var target = tapTarget(item);

    var article = document.createElement("article");
    article.className = "item" + (checked ? " is-done" : "") +
                        (target ? " is-counted" : "");

    /* Namjerno <div>, ne <label>: cijela kartica ima svoj click handler,
       pa bi label toggle-ao dodatno i poništio ga. */
    var head = document.createElement("div");
    head.className = "item-head";

    var input = makeCheckbox(
      target ? displayTitle + " — označi kao završeno" : displayTitle,
      checked
    );

    var title = document.createElement("span");
    title.className = "item-title";
    title.textContent = displayTitle;

    head.appendChild(input);
    head.appendChild(title);

    /* Stavka koja nosi `pages` (za sada samo sura El-Mulk) dobije dugme koje
       otvara te stranice mushafa — listanje stranicu po stranicu, kao knjigu.
       Stoji ODMAH uz ime sure, da se vidi da se ono može otvoriti; naslov
       zato prestaje da se rasteže, pa dugme ostane priljubljeno uz njega
       umjesto da odluta na desnu ivicu (vidi `.item.has-open` u style.css). */
    if (Array.isArray(item.pages) && item.pages.length) {
      var stranice = item.pages.slice();
      /* Slike se skidaju odmah, dok korisnik čita spisak — kad pritisne
         dugme, sura je već tu. Isti prefetch koji koristi i dnevna stranica. */
      prefetchPages(stranice);

      article.classList.add("has-open");

      var openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "view-page-btn";
      openBtn.appendChild(makeSectionIcon("book", "btn-icon"));
      openBtn.appendChild(document.createTextNode("Vidi suru"));
      openBtn.setAttribute("aria-label", displayTitle + " — otvori u mushafu");
      openBtn.addEventListener("click", function (e) {
        /* da klik ne prebaci kvačicu kartice */
        e.stopPropagation();
        openBookView(stranice, displayTitle);
      });

      head.appendChild(openBtn);
    }

    /* Brojana stavka nosi brojku umjesto nepromjenjive oznake "30x": broj
       ponavljanja se sada vidi iz same brojke ("0 / 30"). */
    var counter = target ? makeCounter(displayTitle, target) : null;
    if (counter) { head.appendChild(counter.chip); }

    /* Izvor (Kur'an / hadis) — sitna oznaka u desnom ćošku headera,
       u istom redu sa brojem dove. */
    if (item.source) {
      var source = document.createElement("span");
      source.className = "item-source";
      source.textContent = item.source;
      head.appendChild(source);
    }

    article.appendChild(head);

    if (counter) {
      article.appendChild(counter.track);
      counter.paint(tapCount(item.id, target), checked);
    }

    /* "surah" i "count" -> samo checkbox + naslov, bez teksta.
       "dua" -> arapski u jednom toku, pa prevod ispod.

       Uz upaljenu transkripciju arapski se ZAMJENJUJE transliteracijom, ne
       dopunjava: dvoje istog teksta jedno ispod drugog samo produži karticu
       a ništa ne doda. Prevod ostaje u oba slučaja.

       Dova bez `transliteration` bi u tom režimu ostala bez ijednog teksta,
       pa se za nju vraća arapski. Trenutno je imaju sve, ali nova dova se
       može dodati bez nje i ne smije ispasti prazna. */
    /* "ajet" (dova za stanje) ima isto tijelo kao "dua" — arapski ili
       transkripcija, pa prevod. Na dnevnom spisku ga po pravilu nema (te
       sekcije `sectionsForDate()` ne pušta), ali stavka se u postavkama može
       premjestiti gdje god, pa ne smije ispasti prazna kartica. */
    if (item.type === "dua" || item.type === "ajet") {
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

    /* Jedini put kojim se ova kartica mijenja — i klik po njoj, i "−", i
       checkbox. `count` se gleda samo kod brojane stavke.

       Server i napredak se dodiruju SAMO kad se promijenilo urađeno/nije:
       brojanje je lokalno, pa dvadeset devet klikova ne pravi ni jedan
       zahtjev ni jedno ponovno računanje traka. */
    function commit(done, count) {
      var was = !!state.items[item.id];

      state.items[item.id] = done;
      /* Brojka se pamti i kad je stavka označena (tada je puna) — vidi 5b.
         Prije se pri označavanju brisala, pa je odčekiravanje značilo novo
         brojanje od nule. */
      if (target) { setTapCount(item.id, count); }
      saveDayState();

      /* Prvi klik znači da dalje skrol vodi čovjek (vidi openScrollPending). */
      openScrollPending = false;

      input.checked = done;
      article.classList.toggle("is-done", done);
      if (counter) { counter.paint(count, done); }

      if (done === was) { return; }
      pushChange(item.id, done);
      updateProgress();
      if (done) { focusNext(article); }
    }

    /* Klik po brojanoj kartici: jedno ponavljanje više.

       Označena se istim klikom odčekira — kao i svaka druga kartica — ali
       brojka OSTAJE puna, pa je sljedeći klik vrati odmah. Ko je danas već
       izbrojao trideset salavata ne mora ih brojati drugi put zato što je
       omaškom dodirnuo karticu. Novo brojanje se traži držanjem prsta na
       brojci (`resetTap`). */
    function tap() {
      if (state.items[item.id]) { commit(false, target); return; }

      var izbrojano = tapCount(item.id, target);

      /* Izbrojano do kraja, a bez kvačice — jedan klik je vraća. */
      if (izbrojano >= target) {
        commit(true, target);
        buzz([14, 40, 22]);
        return;
      }

      var next = izbrojano + 1;
      if (next >= target) {
        commit(true, target);
        buzz([14, 40, 22]);
        return;
      }

      commit(false, next);
      counter.pulse();
      buzz(8);
    }

    /* Brojanje ispočetka. Namjerno nije ni na jednom kratkom kliku: klik po
       kartici i klik po brojci već znače "još jedno ponavljanje", a treći
       kratki gest na istoj kartici bi se pogađao. Dug drhtaj kaže da je
       primljeno, jer se na ekranu vrati nula. */
    function resetTap() {
      if (!tapCount(item.id, target)) { return; }
      commit(false, 0);
      buzz([30, 40, 30]);
    }

    /* Klik bilo gdje po kartici. Klik na sam checkbox preskačemo jer ga
       browser već prebaci, pa bi ga `commit` iz njegovog `change` i ovaj
       poziv odradili dvaput. */
    article.addEventListener("click", function (e) {
      if (e.target === input) { return; }
      if (target) { tap(); return; }
      commit(!input.checked, 0);
    });

    /* Checkbox ostaje "urađeno / nije urađeno" i na brojanoj stavci: njime
       se označava zikr izbrojan na tespihu, pa brojka odmah ide na cilj.
       Odčekiravanjem ostaje gdje jeste — isto pravilo kao za klik po
       kartici. Prima i klik i tastaturu, pa ide preko `change`, ne `click`. */
    input.addEventListener("change", function () {
      commit(input.checked, input.checked ? target : tapCount(item.id, target));
    });

    /* Brojka je dugme (da se do brojanja može i tastaturom), pa njen klik
       ne smije ići dalje: kartica bi ga uhvatila drugi put i dodala dva
       ponavljanja na jedan klik.

       Dugo držanje po njoj vraća brojanje na nulu. Nakon njega dolazi i
       običan `click` (prst se digao) — zato `drzano`, inače bi reset odmah
       bio poništen jednim ponavljanjem. */
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

      /* Dugo držanje na telefonu inače otvori sistemski meni ("kopiraj"),
         pa gest ne bi ni došao do nas. */
      counter.chip.addEventListener("contextmenu", function (e) {
        e.preventDefault();
      });

      counter.chip.addEventListener("click", function (e) {
        e.stopPropagation();
        prekiniDrzanje();
        if (drzano) { drzano = false; return; }
        tap();
      });
    }

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

  /* Naslov porcije: "Stranica 86" ili "Stranice 86–88". Kod prelaska preko
     604. porcija se prelama (603, 604, 1) — tada se stranice nabroje, jer
     "603–1" ne bi značilo ništa. */
  function quranNaslov(pages) {
    if (pages.length === 1) { return "Stranica " + pages[0]; }
    var prelom = pages[pages.length - 1] < pages[0];
    return "Stranice " + (prelom ? pages.join(", ") : pages[0] + "–" + pages[pages.length - 1]);
  }

  /* Sure kroz cijelu porciju, bez ponavljanja: duga sura se prostire preko
     više stranica, pa bi se inače njeno ime ispisalo pet puta. */
  function quranSure(pages) {
    var vidjeno = {};
    var out = [];
    pages.forEach(function (page) {
      var info = quranPages[page];
      if (!info) { return; }
      info.suras.forEach(function (sura) {
        if (vidjeno[sura.name]) { return; }
        vidjeno[sura.name] = true;
        out.push(sura.name);
      });
    });
    return out;
  }

  function renderQuranCard() {
    var pages = getQuranPages(dateKey);
    var first = pages[0];
    var last = pages[pages.length - 1];

    /* Slike stranica se počinju skidati odmah, u pozadini — kad korisnik
       stigne do "Vidi stranicu", one su već tu. Vidi `prefetchPages`. */
    prefetchPages(pages);
    /* Ono što se ispisuje na kartici dolazi sa PRVE stranice porcije: džuz,
       prvi ajet. Postotak mushafa ide po zadnjoj — to je dokle si stigao. */
    var info = quranPages[first];

    var card = document.createElement("article");
    card.className = "quran-card" + (state.quran ? " is-done" : "");

    var input = makeCheckbox(
      pages.length > 1 ? "Današnje stranice proučene" : "Današnja stranica proučena",
      state.quran,
      "quran-check"
    );

    /* U headeru ostaje samo broj stranice (ili raspon) uz checkbox. */
    var headText = document.createElement("div");
    headText.className = "quran-head-text";
    headText.appendChild(makeParagraph("quran-page", quranNaslov(pages)));

    var head = document.createElement("div");
    head.className = "quran-head";
    head.appendChild(input);
    head.appendChild(headText);

    /* Dugme za otvaranje cijele porcije — desni ugao headera. */
    if (info) {
      var viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "view-page-btn";
      viewBtn.appendChild(makeSectionIcon("pages", "btn-icon"));
      viewBtn.appendChild(document.createTextNode(
        pages.length > 1 ? "Vidi stranice" : "Vidi stranicu"
      ));
      viewBtn.addEventListener("click", function (e) {
        /* da klik ne prebaci checkbox kartice */
        e.stopPropagation();
        openPageView(pages);
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
      quranSure(pages).forEach(function (name, i) {
        if (i) { meta.appendChild(document.createTextNode(" · ")); }
        var span = document.createElement("span");
        span.className = "sura-name";
        span.setAttribute("dir", "rtl");
        span.setAttribute("lang", "ar");
        span.textContent = name;
        meta.appendChild(span);
      });
      /* Koliko si prešao od cijelog mushafa — zadnja stranica porcije u
         odnosu na 604. */
      meta.appendChild(document.createTextNode(
        " · " + Math.round((last / QURAN_TOTAL_PAGES) * 100) + "% mushafa"
      ));
    } else {
      meta.textContent = "Podaci za ovu stranicu još nisu dodani.";
    }

    top.appendChild(meta);

    /* Samo prvi ajet prve stranice — kartica je najava porcije, ne porcija. */
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

     Pokazuje se STVARNA stranica mushafa, slika iz PAGES/. Prije je ovdje
     stajao tekst složen iz quran_by_pages.json — slova ista, ali raspored
     tuđi: nije se poklapalo sa onim što korisnik gleda u svom mushafu, pa
     "vidi stranicu" nije pokazivalo stranicu nego prijepis.

     Tekst iz quran_by_pages.json time nije postao nepotreban — kartica i
     dalje iz njega uzima džuz, imena sura i prvi ajet.
     ------------------------------------------------------------------------ */

  /* PAGES/001.png … PAGES/604.png — broj je uvijek na tri mjesta, jer se
     fajlovi tako zovu. Stranica mushafa i broj u imenu fajla su isti broj
     (001.png je Fatiha), pa nema preračunavanja. */
  function pageImageUrl(page) {
    return "/PAGES/" + String(page).padStart(3, "0") + ".png";
  }

  /* Stranica kao slika, sa svoja tri stanja: dok se skida, kad se pokaže,
     i kad je nema. Bez međustanja bi drawer bio prazan bijeli pravougaonik
     dok slika ne stigne — a stigne li ikad, ne bi se znalo. */
  function pageFigure(page) {
    var figure = document.createElement("figure");
    figure.className = "page-figure is-loading";

    var img = document.createElement("img");
    img.className = "page-img";
    img.alt = "Stranica " + page + " mushafa";
    /* Dekodiranje van glavne niti — slika je 2600px široka, sinhrono
       dekodiranje bi zamrznulo otvaranje drawera. */
    img.decoding = "async";

    img.addEventListener("load", function () {
      figure.classList.remove("is-loading");
    });
    img.addEventListener("error", function () {
      figure.classList.remove("is-loading");
      figure.classList.add("is-error");
    });

    img.src = pageImageUrl(page);
    /* Već u kešu i dekodirana — `load` se tada više neće javiti. */
    if (img.complete && img.naturalWidth) { figure.classList.remove("is-loading"); }

    var caption = document.createElement("figcaption");
    caption.className = "page-caption";
    caption.textContent = "Stranica " + page;

    var fallback = document.createElement("p");
    fallback.className = "page-error";
    fallback.textContent = "Stranica " + page + " se nije učitala.";

    figure.appendChild(img);
    figure.appendChild(fallback);
    figure.appendChild(caption);

    return figure;
  }

  /* Keširanje: stranica se skida ČIM se kartica iscrta, ne tek na klik.

     Tri sloja rade zajedno i svaki hvata drugi trenutak:
       1. ovaj prefetch — dok korisnik čita ajet na kartici, slika se već
          skida, pa "Vidi stranicu" otvara gotovu sliku
       2. service worker (`moj-zikr-pages`) — drži je trajno, cache-first,
          pa je sljedeći put nema ni na mreži da se traži; radi i offline
       3. `immutable` zaglavlje (vercel.json, dev-server.js) — browser je ne
          provjerava ni uslovnim zahtjevom

     `fetch` a ne `new Image()`: cilj je napuniti keš, ne prikazati sliku.
     Slika od 2600×4206 bi se pri `new Image()` mogla i dekodirati, a to je
     40-ak MB memorije po stranici ni za šta.

     Šuti kad padne — prefetch koji ne uspije nije greška, klik će sliku
     svejedno potražiti. */
  var prefetched = {};

  function prefetchPages(pages) {
    var todo = pages.filter(function (page) { return !prefetched[page]; });
    if (!todo.length) { return; }

    function skini() {
      todo.forEach(function (page) {
        prefetched[page] = true;
        fetch(pageImageUrl(page)).catch(function () { prefetched[page] = false; });
      });
    }

    /* Tek kad se spisak iscrta — slika ne smije usporiti prvo pojavljivanje
       ekrana. Safari nema requestIdleCallback, tamo je dovoljan mali odmak. */
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(skini, { timeout: 3000 });
    } else {
      setTimeout(skini, 800);
    }
  }

  var drawer = null;

  function buildDrawer() {
    drawer = document.createElement("div");
    /* `drawer-page-view` je tu da CSS razlikuje ovaj drawer od postavki:
       stranica ide preko cijelog ekrana, postavke ostaju list sa dna. */
    drawer.className = "drawer drawer-page-view";
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
    body.className = "drawer-body drawer-pages";

    sheet.appendChild(head);
    sheet.appendChild(body);
    drawer.appendChild(sheet);

    /* klik po zatamnjenoj pozadini zatvara */
    drawer.addEventListener("click", function (e) {
      if (e.target === drawer) { closePageView(); }
    });

    document.body.appendChild(drawer);
  }

  /* Prima CIJELU dnevnu porciju, ne jednu stranicu: od kad se u postavkama
     smije tražiti više stranica dnevno, "vidi stranicu" mora pokazati sve
     što je za taj dan, a ne samo prvu. */
  function openPageView(pages) {
    if (!drawer) { buildDrawer(); }

    var prva = quranPages[pages[0]];
    var zadnja = pages[pages.length - 1];

    drawer.querySelector(".drawer-title").textContent = quranNaslov(pages);
    drawer.querySelector(".drawer-sub").textContent =
      "Džuz " + (prva ? prva.juz : "?") + " · " +
      Math.round((zadnja / QURAN_TOTAL_PAGES) * 100) + "% mushafa";

    var body = drawer.querySelector(".drawer-body");
    body.textContent = "";
    /* Jedna stranica ne treba potpis "Stranica 92" — to već piše u naslovu
       iznad. Kod porcije od više stranica treba, da se zna koja je koja. */
    body.classList.toggle("is-single", pages.length === 1);

    pages.forEach(function (page) {
      body.appendChild(pageFigure(page));
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

  /* ------------------------------------------------------------------------
     9b. Sura kao knjiga — listanje stranicu po stranicu

     Dnevna porcija Kur'ana se skrola nadole, jer je to jedan niz stranica
     kroz koji se prolazi. Sura je nešto drugo: ona ima svoj početak i kraj i
     čita se kao mali kitab — jedna stranica pred očima, pa se okrene.

     Zato ovaj drawer lista VODORAVNO: jedna stranica ispuni ekran, prst je
     povuče u stranu, a `scroll-snap` je uvijek zaustavi tačno na listu — nema
     stajanja na pola jedne i pola druge. Ko ne lista prstom, ima strelice i
     tastaturu; ispod stoje tačkice, da se vidi koliko je sure ostalo.

     Slika stranice je ista ona iz PAGES/ koju crta `pageFigure` — jedan način
     prikaza stranice mushafa u cijeloj aplikaciji, ne dva.
     ------------------------------------------------------------------------ */

  var book = null;
  var bookPages = [];

  function buildBook() {
    book = document.createElement("div");
    /* Nosi I `drawer-page-view`: sve što tamo piše (puni ekran na telefonu,
       stisnuto zaglavlje, podloga bez zamućenja) vrijedi i ovdje — to je ista
       stranica mushafa. `drawer-book-view` dodaje samo listanje u stranu. */
    book.className = "drawer drawer-page-view drawer-book-view";
    book.setAttribute("role", "dialog");
    book.setAttribute("aria-modal", "true");
    book.hidden = true;

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
    close.addEventListener("click", closeBookView);

    head.appendChild(titles);
    head.appendChild(close);

    var body = document.createElement("div");
    body.className = "drawer-body drawer-pages drawer-book";

    /* Koja je stranica u ruci — čita se iz skrola, jer se lista i prstom, a
       ne samo strelicama. `passive` da skrol ostane gladak. */
    body.addEventListener("scroll", function () {
      paintBookNav();
    }, { passive: true });

    var nav = document.createElement("div");
    nav.className = "book-nav";

    var prev = makeBookArrow("prev", "Prethodna stranica", "M15 5l-7 7 7 7");
    var dots = document.createElement("div");
    dots.className = "book-dots";
    var next = makeBookArrow("next", "Sljedeća stranica", "M9 5l7 7-7 7");

    nav.appendChild(prev);
    nav.appendChild(dots);
    nav.appendChild(next);

    sheet.appendChild(head);
    sheet.appendChild(body);
    sheet.appendChild(nav);
    book.appendChild(sheet);

    book.addEventListener("click", function (e) {
      if (e.target === book) { closeBookView(); }
    });

    document.body.appendChild(book);
  }

  function makeBookArrow(smjer, label, d) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "book-arrow book-" + smjer;
    btn.setAttribute("aria-label", label);
    btn.title = label;

    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    btn.appendChild(svg);

    btn.addEventListener("click", function () {
      okreni(smjer === "next" ? 1 : -1);
    });
    return btn;
  }

  /* Koja je stranica trenutno na ekranu. Računa se iz skrola, a ne pamti u
     varijabli: prst može stati gdje hoće, i jedini koji uvijek zna gdje smo
     je sam skrol. */
  function bookIndex() {
    var body = book.querySelector(".drawer-body");
    var sirina = body.clientWidth || 1;
    return Math.max(0, Math.min(bookPages.length - 1,
      Math.round(body.scrollLeft / sirina)));
  }

  function okreni(korak) {
    var body = book.querySelector(".drawer-body");
    var cilj = Math.max(0, Math.min(bookPages.length - 1, bookIndex() + korak));
    body.scrollTo({ left: cilj * body.clientWidth, behavior: "smooth" });
    /* Bez ovoga bi se tačkice i strelice osvježile tek kad skrol stigne;
       `scroll` će ih usput ionako ponovo prebojati. */
    paintBookNav(cilj);
  }

  /* Tačkice, strelice i podnaslov — sve što kaže gdje smo u suri. */
  function paintBookNav(forsirano) {
    if (!book) { return; }
    var i = (typeof forsirano === "number") ? forsirano : bookIndex();

    var dots = book.querySelectorAll(".book-dot");
    for (var k = 0; k < dots.length; k++) {
      dots[k].classList.toggle("is-now", k === i);
    }

    book.querySelector(".book-prev").disabled = (i <= 0);
    book.querySelector(".book-next").disabled = (i >= bookPages.length - 1);

    book.querySelector(".drawer-sub").textContent =
      "Stranica " + bookPages[i] + " · " + (i + 1) + " od " + bookPages.length;
  }

  /* `naslov` je naslov stavke sa spiska ("Sura El-Mulk") — drawer nosi isto
     ime pod kojim je korisnik i pritisnuo dugme. */
  function openBookView(pages, naslov) {
    if (!pages || !pages.length) { return; }
    if (!book) { buildBook(); }

    bookPages = pages.slice();
    book.querySelector(".drawer-title").textContent = naslov || quranNaslov(bookPages);

    var body = book.querySelector(".drawer-body");
    body.textContent = "";
    bookPages.forEach(function (page) {
      body.appendChild(pageFigure(page));
    });

    var dots = book.querySelector(".book-dots");
    dots.textContent = "";
    bookPages.forEach(function (page, i) {
      var dot = document.createElement("span");
      dot.className = "book-dot" + (i === 0 ? " is-now" : "");
      dot.setAttribute("aria-hidden", "true");
      dot.title = "Stranica " + page;
      dots.appendChild(dot);
    });

    book.hidden = false;
    document.body.classList.add("no-scroll");
    /* Uvijek se otvara na prvoj stranici sure. `scrollLeft` bez animacije —
       drawer se tek pojavio, nema šta da se "klizne". */
    body.scrollLeft = 0;
    paintBookNav(0);
    book.querySelector(".drawer-close").focus();
  }

  function closeBookView() {
    if (!book) { return; }
    book.hidden = true;
    document.body.classList.remove("no-scroll");
  }

  /* Escape zatvara ono što je gore: prvo završni ekran, pa drawer.
     Strelice lijevo/desno okreću list dok je sura otvorena. */
  document.addEventListener("keydown", function (e) {
    if (book && !book.hidden) {
      if (e.key === "Escape") { closeBookView(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); okreni(1); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); okreni(-1); return; }
      return;
    }
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

      /* Brojka sekcije, i zelena kvačica uz nju kad je sekcija gotova.
         Kvačica postoji uvijek, a CSS je pokazuje tek uz `is-done` — tako
         `updateProgress()` mijenja samo jednu klasu i jedan tekst, bez
         pravljenja i brisanja čvorova pri svakoj kvačici.

         Kur'anska sekcija ide istim putem iako nema `items`: njena brojka
         ostaje prazna (jedna je stavka, "1 / 1" ne govori ništa), pa se od
         cijelog reda vidi samo kvačica kad je stranica proučena. */
      var count = document.createElement("span");
      count.className = "section-count";
      count.dataset.section = section.id;

      var tick = makeSectionIcon("check", "done-icon");
      if (tick) { count.appendChild(tick); }

      var countNum = document.createElement("span");
      countNum.className = "section-count-num";
      count.appendChild(countNum);

      head.appendChild(count);

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
        var titles = itemTitles(section.id, prefs());
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

      /* Ista zelena kvačica kao uz završenu sekciju — završeno izgleda isto
         gdje god stoji. CSS je pokazuje tek uz `is-done` na traci. */
      var count = document.createElement("span");
      count.className = "pgroup-count";

      var tick = makeSectionIcon("check", "done-icon");
      if (tick) { count.appendChild(tick); }

      var countNum = document.createElement("span");
      countNum.className = "pgroup-count-num";
      count.appendChild(countNum);

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
        count: countNum,
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

  /* Broj na ikonici aplikacije (badge.js).

     Računa se iz ISTIH grupa iz kojih se crtaju trake, pa broj na ikonici ne
     može reći nešto drugo od onoga što na trakama piše kao neurađeno — nisu
     dva računa nego jedan. Koje grupe se u tom trenutku broje odlučuje
     badge.js, iz `startTime`-a u notification-tasks.js.

     Grupa sa `total: 0` se ovdje NE odbacuje (za razliku od traka, gdje se
     prazna traka ne crta): u zbir ionako donosi nulu, a badge.js tako vidi
     cijeli dan onakav kakav jeste.

     Proba drugog dana ne dira ikonicu. Ona pripada današnjem danu, a proba
     je alat sa localhosta — bez ovoga bi "pogledaj petak" ostavilo petački
     broj na ikonici do sljedećeg osvježavanja. */
  function updateBadge() {
    if (!window.mojZikrBadge || isPreview()) { return; }

    /* Uz brojke ide i DAN za koji vrijede. Bez toga bi badge.js nastavio
       primjenjivati jučerašnje brojke sve dok se ekran ponovo ne iscrta, a
       brojač mora biti nov svaki dan. */
    window.mojZikrBadge.osvjezi(progressGroups().map(function (group) {
      var tally = countGroup(group.sections);
      return { id: group.id, done: tally.done, total: tally.total };
    }), dateKey);
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

      var num = node.querySelector(".section-count-num");

      /* Kur'an je jedna stavka i nema `items` — brojka mu ostaje prazna, a
         gotov je onda kad je stranica proučena. */
      if (section.kind === "quran") {
        if (num) { num.textContent = ""; }
        node.classList.toggle("is-done", state.quran);
        return;
      }

      var list = section.items || [];
      var secDone = list.reduce(function (sum, item) {
        return sum + (state.items[item.id] ? 1 : 0);
      }, 0);

      if (num) { num.textContent = secDone + " / " + list.length; }
      node.classList.toggle("is-done", list.length > 0 && secDone === list.length);
    });

    /* Ukupan napredak se vidi iz traka po dobu dana — prstena u headeru
       nema. Traka je i preciznija: kaže i KOJI dio dana nedostaje, što je
       jedan postotak nikad nije govorio. Zbir se i dalje računa jer o njemu
       zavisi završni ekran. */
    updateGroupBars();
    updateBadge();

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
     12b. "Na vrh" — povratak na početak spiska

     Spisak je dug: Kur'an, zikr, dove, pa Navečer. Ko ga prođe do kraja
     nema kako natrag osim da skrola cijeli put nazad. Zato se na DNU pojavi
     malo okruglo dugme koje vrati na početak.

     Samo na dnu, ne cijelo vrijeme. Dugme koje lebdi od prve minute stoji
     preko sadržaja i onda kad nikome ne treba — na vrhu spiska "vrati me na
     vrh" ne znači ništa.

     Ide DESNO, a ne u sredinu, jer je sredina zauzeta: tamo na završen dan
     stoji "Elhamdulillah" (`celebrate-fab`). Ovako mogu stajati oba, i
     nijedno ne mora znati za drugo.
     ------------------------------------------------------------------------ */

  /* Koliko strana mora biti duža od ekrana da dugme uopšte ima smisla.
     Spisak od jednog ekrana i pol se vidi skoro cijeli, pa se sa njegovog
     dna nema odakle vraćati. */
  var TOP_MIN_SCROLL = 240;

  /* Koliko blizu dna se računa "došlo se do dna". Nekoliko piksela jer
     zbir `pageYOffset + innerHeight` na nekim uređajima (zumirana strana,
     traka browsera koja se skriva) nikad ne pogodi `scrollHeight` tačno. */
  var TOP_EDGE = 24;

  var topBtn = null;
  var topShown = false;

  /* Strelica nagore — jedini sadržaj dugmeta, pa nema teksta koji bi se
     morao prevoditi ni skraćivati na uskom ekranu. Naziv za čitače ekrana
     stoji na samom dugmetu (`aria-label`). */
  function makeArrowUp(className) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", "M12 19V6M6 12l6-6 6 6");
    svg.appendChild(path);

    return svg;
  }

  function buildTopBtn() {
    topBtn = document.createElement("button");
    topBtn.type = "button";
    topBtn.className = "top-fab";
    topBtn.hidden = true;
    topBtn.setAttribute("aria-label", "Na vrh spiska");
    topBtn.setAttribute("title", "Na vrh spiska");
    topBtn.appendChild(makeArrowUp("top-fab-icon"));

    topBtn.addEventListener("click", function () {
      /* Ista animacija kao auto-skrol, pa se vidi kuda je strana otišla.
         `smoothScrollTo` sam skoči kad korisnik traži manje animacija. */
      smoothScrollTo(0);
      /* Skloni se odmah, ne tek kad prvi `scroll` stigne: dugme koje ostane
         pod prstom dok strana klizi izgleda kao da klik nije primljen. */
      showTopBtn(false);
    });

    document.body.appendChild(topBtn);
  }

  /* Je li se došlo do dna spiska. `false` i dok je preko ekrana drawer ili
     završni ekran (`no-scroll`) — tada se ispod ništa i ne skrola, pa dugme
     nema šta vratiti. */
  function atBottom() {
    if (document.body.classList.contains("no-scroll")) { return false; }

    var doc = document.documentElement;
    var ukupno = Math.max(doc.scrollHeight, document.body.scrollHeight);
    var ekran = window.innerHeight;

    if (ukupno - ekran < TOP_MIN_SCROLL) { return false; }
    return window.pageYOffset + ekran >= ukupno - TOP_EDGE;
  }

  function showTopBtn(on) {
    if (on && !topBtn) { buildTopBtn(); }
    if (!topBtn || on === topShown) { return; }
    topShown = on;
    topBtn.hidden = !on;
  }

  function refreshTopBtn() {
    showTopBtn(atBottom());
  }

  /* Račun ide ODMAH iz slušaoca, bez requestAnimationFrame.

     Prvo je bio kroz rAF, da se `scrollHeight` ne čita češće nego jednom po
     frejmu. Ali `scroll` browseri ionako sažimaju na jedan po frejmu, pa se
     nije dobilo ništa — a izgubilo se to što rAF NE opali dok je strana
     skrivena (druga kartica, ugašen ekran). Skrol koji se u tom trenutku
     desi ostao bi neobrađen, i dugme bi kasnilo za stanjem.

     Sam račun je dva čitanja koja se pri skrolanju ionako mjere, a u DOM se
     ne piše ništa dok se stanje stvarno ne promijeni (`topShown`). */
  window.addEventListener("scroll", refreshTopBtn, { passive: true });
  /* Nova visina ekrana (rotacija, traka browsera) mijenja i gdje je dno. */
  window.addEventListener("resize", refreshTopBtn, { passive: true });

  /* ------------------------------------------------------------------------
     12b. Visina headera -> staklena ploča

     Podlogu i blur headera nosi odvojen `fixed` element (`.app-glass` u
     index.html), a ne sam header — vidi komentar tamo i u style.css zašto.
     Cijena tog razdvajanja je jedna jedina: ploča ne zna koliko je header
     visok, pa joj se visina mjeri odavde i upisuje u `--header-h`.

     Header nije uvijek iste visine: traka sa selamom se pojavi kad se upiše
     ime, trake napretka kad se iscrta dan, a petkom ih je tri umjesto dvije.
     Zato ResizeObserver, a ne jedno mjerenje pri startu.

     Mjeri se `offsetHeight`, ne `getBoundingClientRect()`: cijela ploča je
     pun broj piksela, pa se polovina piksela na razlomljenim visinama ne
     pojavljuje kao svijetla linija ispod ruba headera.
     ------------------------------------------------------------------------ */

  var glassH = -1;

  function measureHeader() {
    if (!el.header) { return; }
    var h = el.header.offsetHeight;
    if (!h || h === glassH) { return; }
    glassH = h;
    document.documentElement.style.setProperty("--header-h", h + "px");
  }

  if (el.header && el.glass && typeof window.ResizeObserver === "function") {
    new window.ResizeObserver(measureHeader).observe(el.header);
  } else {
    /* Staro okruženje bez ResizeObserver-a: mjeri se na promjenu ekrana i
       poslije svakog crtanja (vidi poziv u `render()`). */
    window.addEventListener("resize", measureHeader, { passive: true });
  }

  /* Fontovi dolaze poslije prvog crtanja i pomjere visinu reda sa datumom.
     ResizeObserver bi to uhvatio sam, ali ovdje je i za onaj drugi put. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(measureHeader).catch(function () {});
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

  /* Selam s imenom — jedino mjesto gdje aplikacija oslovi čovjeka. Ime je
     ono iz postavki, isto koje spaja uređaje, pa se red pojavi tek kad ga
     ima: bez imena nema ni pola selama ni prazne rupe u headeru.

     Zove se iz `render()`, a ne iz vlastitog slušaoca: promjena imena kroz
     `naPromjenu` ionako ponovo crta dan, pa novi selam stoji na ekranu u
     istom trenutku kad i spisak novog korisnika. */
  function writeGreeting() {
    if (!el.greeting || !el.greetingName) { return; }

    var name = (window.mojZikrConfig && window.mojZikrConfig.ime)
      ? String(window.mojZikrConfig.ime()).trim()
      : "";

    /* Samo ime: "Es-selamu alejkum," stoji u HTML-u jer se nikad ne mijenja. */
    el.greetingName.textContent = name;
    el.greeting.hidden = !name;
  }

  /* Crta dan koji je u `dateKey` — današnji ili onaj izabran strelicama.
     Stanje i spisak sekcija se uvijek čitaju iznova, pa je dovoljno
     promijeniti `dateKey` i pozvati ovo. */
  function render() {
    todayKey = getLocalDateKey();
    state = getDayState(dateKey);
    visible = sectionsForDate(dateKey, prefs());
    var shown = dateFromKey(dateKey);
    writeGreeting();
    el.date.textContent = formatGregorian(shown);
    el.hijri.textContent = formatHijri(shown);
    markPreview();
    renderSections();
    updateProgress();
    /* Nov spisak je druge visine, pa je i dno na drugom mjestu — bez ovoga
       bi "Na vrh" ostalo na ekranu i poslije prebacivanja na kraći dan. */
    refreshTopBtn();
    /* Selam i trake napretka mijenjaju visinu headera — staklena ploča ispod
       njega je odvojen element, pa mora znati novu visinu (vidi 12b).
       ResizeObserver bi to uhvatio i sam; ovo je za okruženja bez njega. */
    measureHeader();
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

  /* ------------------------------------------------------------------------
     Ponoć — nov dan, čist spisak

     Aplikacija uvijek prikazuje SAMO današnji dan, pa u ponoć mora sama
     preći na novi: prazan spisak, prazne trake, prazna ikonica. Ništa se ne
     prenosi u sutra — ostane li večeras pet dova neurađeno, sutra se kreće
     od nule, jer se sve računa iz spiska TOG dana.

     U probi se ostaje na izabranom danu, samo se "natrag na danas" pomjerio.

     Vraća `true` kad je dan zaista promijenjen, da pozivalac zna treba li i
     povući zajedničko stanje za taj novi dan. */
  function rolloverIfNewDay() {
    if (getLocalDateKey() === todayKey) { return false; }

    todayKey = getLocalDateKey();
    if (!isPreview()) { dateKey = todayKey; }
    render();
    window.scrollTo(0, 0);
    return true;
  }

  /* Povratak u aplikaciju. Na telefonu je ovo skoro uvijek trenutak u kojem
     se ponoć i primijeti — PWA u pozadini je skrivena, pa se povratak desi. */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { return; }

    rolloverIfNewDay();

    /* Povratak u aplikaciju je jedini trenutak kad se stanje sa drugog
       uređaja može vidjeti — tu se povlači. Ako je nešto ostalo neposlano
       (bio offline), prvo ode gore. */
    refreshShared();
  });

  /* Ali prozor koji cijelu noć stoji otvoren i na ekranu nikad ne prijavi
     povratak, pa bi do jutra pokazivao jučerašnji spisak sa jučerašnjim
     kvačicama — i brojem na ikonici uz njega. Zato i sat, ne samo povratak.

     Pola minute je dovoljno blizu ponoći da se ne primijeti, a provjera je
     samo poređenje dva stringa. Ne računa se koliko ima do ponoći nekim
     jednokratnim `setTimeout`-om: uspavan laptop, promjena zone i ljetno
     vrijeme sve to pomjere, a poređenje dana ne mogu pokvariti. */
  setInterval(function () {
    if (rolloverIfNewDay()) { refreshShared(); }
  }, 30 * 1000);

  /* Mreža se vratila — pošalji što je čekalo i pokupi tuđe promjene. */
  window.addEventListener("online", refreshShared);

  /* ------------------------------------------------------------------------
     Povlačenje prsta nadole — osvježavanje u instaliranoj aplikaciji

     U browseru ovo već postoji: povuci stranu nadole i ona se ponovo učita.
     Instalirana PWA nema ni adresnu traku ni to povlačenje, pa je jedini
     način da se pokupi ono što je urađeno na drugom telefonu bio izaći iz
     aplikacije i vratiti se u nju. Zato se gest pravi ovdje, i SAMO tamo
     gdje ga nema — u browseru se ne dira ništa, da se dva povlačenja ne
     otimaju o isti prst.

     Ne radi ono što radi browserovo osvježavanje, i to je namjerno. Ponovno
     učitavanje bi zbog par redova sa servera bacilo i skrol i sve što je u
     memoriji, uz bijeli treptaj. Umjesto toga se povuče stanje (sync.js) i
     config (settings.js), a ekran se sam iscrta tamo gdje se nešto stvarno
     promijenilo.

     Jedini razlog za pravo ponovno učitavanje je NOVA VERZIJA aplikacije.
     Nju traži service worker (`novaVerzija()`): instalirana aplikacija se u
     praksi nikad ne zatvara, pa bi inače znala danima ostati na staroj.
     ------------------------------------------------------------------------ */

  /* Aplikacija pokrenuta sa početnog ekrana, bez browserovog okvira.
     `navigator.standalone` je iOS-ova vlastita oznaka — Safari nema
     `display-mode: standalone` u svim verzijama. */
  function isStandalone() {
    try {
      if (window.matchMedia("(display-mode: standalone)").matches) { return true; }
      if (window.matchMedia("(display-mode: fullscreen)").matches) { return true; }
      if (window.matchMedia("(display-mode: minimal-ui)").matches) { return true; }
    } catch (e) {
      /* staro okruženje bez matchMedia — ostaje iOS-ova oznaka ispod */
    }
    return navigator.standalone === true;
  }

  /* Koliko treba povući da se osvježavanje pusti, i dokle prst uopšte može
     odvući oznaku. Ispod granice se oznaka vrati i ništa se ne desi. */
  var PULL_TRIGGER = 66;
  var PULL_MAX = 92;

  var pullNode = null;
  var pullStart = null;   /* y na kojem je prst spušten; null = ne povlači se */
  var pullY = 0;
  var pullBusy = false;

  function buildPull() {
    pullNode = document.createElement("div");
    pullNode.className = "pull";
    pullNode.setAttribute("aria-hidden", "true");

    var ring = document.createElement("span");
    ring.className = "pull-ring";
    pullNode.appendChild(ring);

    var tick = makeSectionIcon("check", "pull-check");
    if (tick) { pullNode.appendChild(tick); }

    document.body.appendChild(pullNode);
  }

  function pullSet(y) {
    pullY = y;
    pullNode.style.transform = "translate3d(-50%, " + y + "px, 0)";
    pullNode.style.opacity = String(Math.min(1, y / 34));
    pullNode.classList.toggle("is-ready", y >= PULL_TRIGGER);
  }

  /* Gest se ne prima dok je preko ekrana drawer ili završni ekran (`no-scroll`)
     i dok prethodno osvježavanje traje. */
  function pullBlocked() {
    return pullBusy || document.body.classList.contains("no-scroll");
  }

  /* Ima li nova verzija aplikacije. Pita se update.js — on drži registraciju
     service workera i on je jedini koji zna kako se nova verzija preuzima
     (obična `location.reload()` je više ne aktivira, jer service worker
     čeka; vidi zaglavlje service-worker.js).

     Kad se ništa nije promijenilo, vraća `false` — pa se ovo ne može
     zavrtjeti u krug ponovnih učitavanja. */
  function novaVerzija() {
    if (!window.mojZikrUpdate || !window.mojZikrUpdate.provjeri) {
      return Promise.resolve(false);
    }
    return window.mojZikrUpdate.provjeri();
  }

  function endPull() {
    pullNode.classList.remove("is-busy");
    pullNode.classList.add("is-ok");
    setTimeout(function () {
      pullSet(0);
      pullNode.classList.remove("is-ok");
      pullNode.classList.remove("is-ready");
      pullBusy = false;
    }, 480);
  }

  function runPull() {
    pullBusy = true;
    pullNode.classList.add("is-busy");
    pullSet(PULL_TRIGGER);

    var svjeza = novaVerzija();

    var poslovi = [
      window.mojZikrSync && !isPreview()
        ? window.mojZikrSync.refresh(todayKey)
        : null,
      window.mojZikrConfig && window.mojZikrConfig.osvjezi
        ? window.mojZikrConfig.osvjezi()
        : null,
      svjeza,
      /* Najmanje pola sekunde: gest koji se završi prije nego se oko snađe
         izgleda kao da nije ni primljen, pa i kad je sve prošlo. */
      new Promise(function (r) { setTimeout(r, 520); })
    ];

    Promise.all(poslovi.map(function (p) {
      return Promise.resolve(p).catch(function () { return null; });
    })).then(function () {
      return svjeza;
    }).then(function (ima) {
      /* Nova verzija je stigla dolje — od ovog trenutka ponovno učitavanje
         nije gubitak nego jedini način da se vidi. Povlačenje je izričit
         zahtjev da se osvježi, pa se ovdje ne čeka traka sa dugmetom
         "Instaliraj" (update.js) nego se preuzima odmah. */
      if (ima) { window.mojZikrUpdate.preuzmi(); return; }
      endPull();
    }).catch(endPull);
  }

  if (isStandalone()) {
    /* Klasa gasi rubber-band odskok strane, da povlačenje bude naše a ne
       sistemsko. Stoji na <html>, jer `overscroll-behavior` sa <body> ne
       dopire do viewporta u svim browserima. */
    document.documentElement.classList.add("is-standalone");
    buildPull();

    document.addEventListener("touchstart", function (e) {
      /* Gest kreće samo sa VRHA strane i samo jednim prstom — dva prsta su
         zumiranje, a sredina strane je običan skrol. */
      if (pullBlocked() || e.touches.length !== 1 || window.pageYOffset > 0) {
        pullStart = null;
        return;
      }
      pullStart = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener("touchmove", function (e) {
      if (pullStart === null) { return; }

      var dy = e.touches[0].clientY - pullStart;

      /* Prst je krenuo nagore, ili je strana u međuvremenu otišla nadole —
         ovo je običan skrol i povlačenje se otkazuje. */
      if (dy <= 0 || window.pageYOffset > 0) {
        pullStart = null;
        if (pullY) { pullSet(0); }
        return;
      }

      /* Otpor: oznaka ide sporije od prsta, pa se povlačenje "osjeti" i ne
         okine slučajno pri običnom skrolanju nagore. */
      var y = Math.min(PULL_MAX, dy * 0.45);

      /* Tek kad je jasno da se povlači — inače bi prvi piksel skrola
         nagore ostao zarobljen. `cancelable` je false kad je browser već
         odlučio da je gest njegov. */
      if (y > 2 && e.cancelable) { e.preventDefault(); }
      pullSet(y);
    }, { passive: false });

    ["touchend", "touchcancel"].forEach(function (name) {
      document.addEventListener(name, function () {
        if (pullStart === null) { return; }
        pullStart = null;
        if (pullY >= PULL_TRIGGER) { runPull(); } else { pullSet(0); }
      }, { passive: true });
    });
  }

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
