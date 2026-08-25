/* ==========================================================================
   situacije.js — dove za stanja

   Svoja strana, ne dio dnevnog spiska. Otvara je ikonica sa sklopljenim
   rukama u headeru (`#duasBtn` u index.html), a unutra je po jedan tab za
   svaku skupinu iz data.js ("Strah i nemir", "Tuga", "Zahvalnost", "Zaštita",
   "Oslonac").

   ZAŠTO ODVOJENO OD SPISKA. Dnevni spisak je posao koji se odradi: sve se
   broji, ulazi u trake napretka i podsjetnik čeka da se završi. Ove dove se
   ne odrađuju nego se TRAŽE, i to onda kad zatreba.

   KVAČICA POSTOJI, ALI SE NE PAMTI. Kroz skupinu se ide dova po dova, pa
   treba znati dokle se stiglo — otud kvačica i skok na sljedeću neproučenu,
   isto kao na spisku. Ali to stanje živi SAMO u memoriji (`ucene` ispod) i
   SAMO dok je strana otvorena: zatvaranje ga briše (`zatvori()`). Ne ide ni u
   localStorage ni na server, ne ulazi u trake napretka, ne ulazi u račun
   podsjetnika i ne otvara završni ekran.

   Tako je namjerno: ovo je oznaka u toku jednog učenja, a ne obaveza koja se
   vodi. Kad se strana zatvori, to učenje je završeno — ko je opet otvori,
   počinje ispočetka, a ne pred pola skupine koja je već prekrižena i ne zna
   se odakle.

   ODAKLE SADRŽAJ. Iz data.js, iz sekcija sa `kind: "stanje"` — kroz
   `stanjeSections(prefs)`, koji radi isti posao koji `sectionsForDate()`
   radi za dnevni spisak: vlastite stavke i izmjene korisnika su unutra,
   isključene stavke van. Zato se sve što postavke znaju raditi sa dovom
   (sakrij, uredi, obriši, dopiši svoju, prerasporedi) radi i sa ovima, i to
   u istom drawer-u i kroz istu formu — bez ijednog posebnog pravila ovdje.

   Ovaj fajl zato ne zna ništa o sadržaju: ne nabraja skupine, ne nabraja
   dove i ne pamti ni jedno njihovo polje. Nova skupina u data.js sama dobije
   svoj tab, nova dova svoju karticu.

   TRANSKRIPCIJA. Isto pravilo kao na spisku (`renderItem()` u script.js):
   kad je u postavkama upaljena, transkripcija ZAMJENJUJE arapski, a prevod
   ostaje ispod. Jedno pravilo za istu dovu na obje strane.
   ========================================================================== */

(function () {
  "use strict";

  /* Zadnje otvoreni tab. Pamti se jer se strana otvara u stanju u kojem
     čovjek jeste, a to se ne mijenja svaki dan: ko je otvara zbog nemira,
     otvara je zbog nemira i sutra. Bez ovoga bi svaki put počinjala od prve
     skupine i tražilo bi se ponovo.

     Samo lokalno, kao i tema: ne ide na server jer nije spisak koji se
     dijeli, nego mjesto na kojem je ostao OVAJ ekran. */
  var TAB_KEY = "moj-zikr-stanje";

  var drawer = null;
  var tabsBox = null;
  var body = null;
  var btn = null;
  var topBtn = null;

  /* Proučene dove: `{ idStavke: true }`. SAMO u memoriji, i samo dok je strana
     otvorena — `zatvori()` je prazni. Vidi zaglavlje fajla. */
  var ucene = Object.create(null);

  var otvoren = false;
  var aktivna = "";
  /* Config se promijenio dok je strana bila zatvorena — crtanje čeka
     otvaranje, da se ne crta ekran koji nitko ne gleda. */
  var trebaCrtanje = true;

  try { aktivna = localStorage.getItem(TAB_KEY) || ""; } catch (e) { aktivna = ""; }

  function prefs() {
    return (window.mojZikrConfig && window.mojZikrConfig.prefs()) || {};
  }

  /* Skupine onako kako ih taj korisnik ima. Prazan niz ako data.js nije
     učitan — tada se strana ni ne otvara (vidi dno fajla). */
  function skupine() {
    return (typeof stanjeSections === "function") ? stanjeSections(prefs()) : [];
  }

  /* Skupina koja se prikazuje. Zapamćena ako još postoji, inače prva —
     skupina obrisana iz data.js ne smije ostaviti praznu stranu. */
  function tekuca(lista) {
    var i;
    for (i = 0; i < lista.length; i += 1) {
      if (lista[i].id === aktivna) { return lista[i]; }
    }
    return lista[0] || null;
  }

  function zapamtiTab(id) {
    aktivna = id;
    try { localStorage.setItem(TAB_KEY, id); } catch (e) { /* private mode */ }
  }

  /* ------------------------------------------------------------------------
     Kartica

     Klasa je `.dua`, a ne `.item`: izgleda i radi isto (kvačica, klik po
     cijeloj kartici, prigušena kad je proučena), ali `.item` ulazi u trake
     napretka, u podsjetnike i u završni ekran — a ova ne ulazi ni u jedno od
     toga. Ista klasa bi to prije ili poslije pomiješala.
     ------------------------------------------------------------------------ */

  function p(className, text) {
    var node = document.createElement("p");
    node.className = className;
    node.textContent = text;
    return node;
  }

  /* Arapski se prikazuje kao jedan neprekidan tok — isto kao na spisku, pa
     se ista dova ne lomi na dva mjesta različito. */
  function arapski(text) {
    var flow = (Array.isArray(text) ? text : [text])
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!flow) { return null; }

    var node = p("arabic", flow);
    node.setAttribute("dir", "rtl");
    node.setAttribute("lang", "ar");
    return node;
  }

  function kartica(item, naslov, transkript) {
    var procitana = ucene[item.id] === true;

    var art = document.createElement("article");
    art.className = "dua" + (procitana ? " is-done" : "");
    art.dataset.id = item.id;

    var head = document.createElement("div");
    head.className = "dua-head";

    var check = document.createElement("input");
    check.type = "checkbox";
    check.className = "check";
    check.checked = procitana;
    check.setAttribute("aria-label", naslov);

    head.appendChild(check);
    head.appendChild(p("dua-title", naslov));

    if (item.source) {
      head.appendChild(p("dua-source", item.source));
    }

    art.appendChild(head);

    /* Jedini put kojim se kartica mijenja — i klik po njoj, i sam checkbox.
       Nema `saveDayState()`, nema `pushChange()`, nema traka napretka: oznaka
       ne ide dalje od ovog ekrana (vidi zaglavlje fajla). */
    function oznaci(done) {
      if (done) { ucene[item.id] = true; } else { delete ucene[item.id]; }
      check.checked = done;
      art.classList.toggle("is-done", done);
      if (done) { naSljedecu(art); }
    }

    art.addEventListener("click", function (e) {
      /* Klik po samom checkboxu browser već prebaci, pa bi ga i njegov
         `change` i ovaj poziv odradili dvaput. */
      if (e.target === check) { return; }
      oznaci(!check.checked);
    });

    /* Prima i klik i tastaturu, pa ide preko `change`, ne `click`. */
    check.addEventListener("change", function () { oznaci(check.checked); });

    var tijelo = document.createElement("div");
    tijelo.className = "dua-body";

    /* Transkripcija umjesto arapskog, ne uz njega. Dova bez transkripcije
       svejedno dobija arapski — inače bi u tom režimu ostala prazna. */
    if (transkript && item.transliteration) {
      tijelo.appendChild(p("transliteration", item.transliteration));
    } else {
      var ar = arapski(item.arabic);
      if (ar) { tijelo.appendChild(ar); }
    }

    if (item.translation) {
      tijelo.appendChild(p("translation", item.translation));
    }

    if (tijelo.childNodes.length) { art.appendChild(tijelo); }
    return art;
  }

  /* Skupina kojoj je sve isključeno u postavkama. Nije greška — dugme vodi
     tamo gdje se vraća. Strana se pri tome zatvara: postavke i ova strana su
     dva drawer-a na istoj visini, pa bi otvorene jedna preko druge stajale
     naopako. */
  function praznaSkupina() {
    var box = document.createElement("div");
    box.className = "duas-empty";
    box.appendChild(p("duas-empty-msg", "U ovoj skupini nije uključena ni jedna dova."));

    var open = document.createElement("button");
    open.type = "button";
    open.className = "empty-btn";
    open.textContent = "Odaberi dove";
    open.addEventListener("click", function () {
      zatvori();
      if (window.mojZikrConfig && window.mojZikrConfig.otvori) {
        window.mojZikrConfig.otvori();
      }
    });

    box.appendChild(open);
    return box;
  }

  /* ------------------------------------------------------------------------
     Skrol kroz skupinu

     Dva pomagača, oba nad TIJELOM DRAWER-a a ne nad stranom: ovdje se skrola
     okvir, pa `window.scrollTo` i `pageYOffset` ovdje ne znače ništa. Zato se
     ne može pozvati ni `smoothScrollTo()` iz script.js — on radi nad stranom.

       naSljedecu()  kad se dova označi, sljedeća NEPROUČENA dođe pred oči
       „Na vrh“      kad se dođe do dna, dugme vrati na prvu

     Vlastita animacija umjesto `scrollTo({behavior:"smooth"})`, iz istog
     razloga kao na spisku: nativni glatki skrol neki webview-i tiho ignorišu,
     pa bi pomjeranje znalo potpuno izostati.
     ------------------------------------------------------------------------ */

  var SKROL_MS = 380;
  /* Koliko praznine ostaje nad karticom kad se dovede pred oči. */
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

    /* Ko traži manje animacija dobija skok — isto pravilo kao svugdje. */
    if (mirnijeAnimacije() || typeof window.requestAnimationFrame !== "function") {
      body.scrollTop = cilj;
      osvjeziTop();
      return;
    }

    var pocetak = null;

    function korak(t) {
      if (pocetak === null) { pocetak = t; }
      var k = Math.min(1, (t - pocetak) / SKROL_MS);
      /* easeOutCubic — kreće brzo, staje mekano */
      body.scrollTop = od + raz * (1 - Math.pow(1 - k, 3));
      if (k < 1) { skrolAnim = window.requestAnimationFrame(korak); }
      else { skrolAnim = null; osvjeziTop(); }
    }

    skrolAnim = window.requestAnimationFrame(korak);
  }

  /* Sljedeća neproučena kartica pred oči. Ako ispod nema nijedne, strana se ne
     pomjera — kraj skupine se vidi po tome što se ništa ne miče, a dugme „Na
     vrh“ se ionako pojavi kad se dođe do dna.

     Mjeri se preko `getBoundingClientRect()`, ne `offsetTop`: ploča drawer-a
     je `position: relative` (zbog tog istog dugmeta), pa bi `offsetTop`
     mjerio od nje a ne od okvira koji se skrola. */
  function naSljedecu(kartica) {
    var next = kartica.nextElementSibling;
    while (next && next.classList.contains("is-done")) {
      next = next.nextElementSibling;
    }
    if (!next) { return; }

    var okvir = body.getBoundingClientRect();
    var meta = next.getBoundingClientRect();
    skrolujNa(body.scrollTop + (meta.top - okvir.top) - SKROL_RUB);
  }

  /* Ispod ovoliko skrola nema šta vraćati — cijela skupina je na jednom
     ekranu, pa bi dugme bilo ukras. */
  var TOP_MIN_SKROL = 200;
  var TOP_RUB = 24;

  var topShown = false;

  function naDnu() {
    if (!body || !otvoren) { return false; }
    var ukupno = body.scrollHeight;
    var ekran = body.clientHeight;
    if (ukupno - ekran < TOP_MIN_SKROL) { return false; }
    return body.scrollTop + ekran >= ukupno - TOP_RUB;
  }

  function pokaziTop(on) {
    if (!topBtn || on === topShown) { return; }
    topShown = on;
    topBtn.hidden = !on;
  }

  function osvjeziTop() {
    pokaziTop(naDnu());
  }

  function dugmeNaVrh() {
    var NS = "http://www.w3.org/2000/svg";

    var b = document.createElement("button");
    b.type = "button";
    b.className = "duas-top";
    b.hidden = true;
    b.setAttribute("aria-label", "Na vrh skupine");
    b.title = "Na vrh skupine";

    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "top-fab-icon");
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
    b.appendChild(svg);

    b.addEventListener("click", function () {
      skrolujNa(0);
      /* Skloni se odmah, ne tek kad prvi `scroll` stigne: dugme koje ostane
         pod prstom dok ploča klizi izgleda kao da klik nije primljen. */
      pokaziTop(false);
    });

    return b;
  }

  /* ------------------------------------------------------------------------
     Crtanje
     ------------------------------------------------------------------------ */

  function nacrtajTabove(lista, izabrana) {
    tabsBox.textContent = "";

    lista.forEach(function (section) {
      var tab = document.createElement("button");
      tab.type = "button";
      tab.className = "duas-tab";
      tab.id = "duas-tab-" + section.id;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "duasPanel");
      tab.setAttribute("aria-selected", section === izabrana ? "true" : "false");
      /* Čitač ekrana kroz tablistu ide strelicama, a ne tabulatorom — pa
         tabulator preskače neizabrane i vodi pravo u sadržaj. */
      tab.tabIndex = (section === izabrana) ? 0 : -1;

      /* Prazna skupina ostaje na traci, samo prigušena: da se tabovi ne
         premještaju svaki put kad se nešto isključi u postavkama. */
      if (!(section.items || []).length) { tab.classList.add("is-empty"); }

      var icon = (typeof makeSectionIcon === "function")
        ? makeSectionIcon(section.icon, "duas-tab-icon")
        : null;
      if (icon) { tab.appendChild(icon); }

      tab.appendChild(document.createTextNode(section.title));

      tab.addEventListener("click", function () { izaberi(section.id); });

      /* Lijevo/desno po traci — tako se tablista i očekuje da radi. Fokus ide
         na novi tab jer se ona iscrtava iznova, pa stari čvor nestane. */
      tab.addEventListener("keydown", function (e) {
        var smjer = (e.key === "ArrowRight") ? 1 : (e.key === "ArrowLeft") ? -1 : 0;
        if (!smjer) { return; }
        e.preventDefault();
        var i = lista.indexOf(section) + smjer;
        if (i < 0) { i = lista.length - 1; }
        if (i >= lista.length) { i = 0; }
        izaberi(lista[i].id, true);
      });

      tabsBox.appendChild(tab);
    });
  }

  function izaberi(id, fokus) {
    if (id !== aktivna) {
      zapamtiTab(id);
      nacrtaj();
      /* Nova skupina počinje od svoje prve dove, a ne od mjesta na kojem je
         stao skrol u prethodnoj. */
      body.scrollTop = 0;
      osvjeziTop();
    }
    if (!fokus) { return; }
    var tab = tabsBox.querySelector("#duas-tab-" + id);
    if (tab) { tab.focus(); }
  }

  function nacrtaj() {
    if (!drawer) { return; }

    var lista = skupine();
    var izabrana = tekuca(lista);

    nacrtajTabove(lista, izabrana);

    body.textContent = "";
    trebaCrtanje = false;
    /* Nov sadržaj je druge visine, pa je i dno na drugom mjestu. Ide na kraju
       svake putanje kroz ovu funkciju — i kad se ne nacrta ništa. */
    pokaziTop(false);

    if (!izabrana) { return; }
    body.setAttribute("aria-labelledby", "duas-tab-" + izabrana.id);
    /* Zapamćeni tab je mogao ispasti iz data.js — tada `tekuca()` vrati prvu,
       pa se pamti ona, da se pri sljedećem otvaranju ne traži ponovo. */
    if (izabrana.id !== aktivna) { zapamtiTab(izabrana.id); }

    var items = izabrana.items || [];
    if (!items.length) {
      body.appendChild(praznaSkupina());
      return;
    }

    /* Naslovi idu kroz `itemTitles()` iz data.js, kao i na spisku: tako
       vlastita dova i preimenovana dova stoje pod istim imenom svugdje. */
    var titles = (typeof itemTitles === "function")
      ? itemTitles(izabrana.id, prefs()) : {};
    var transkript = prefs().transkript === true;

    var lst = document.createElement("div");
    lst.className = "duas-list";

    items.forEach(function (item) {
      lst.appendChild(kartica(item, titles[item.id] || item.title || "", transkript));
    });

    body.appendChild(lst);
    osvjeziTop();
  }

  /* ------------------------------------------------------------------------
     Drawer

     Nastaje pri PRVOM otvaranju, a ne pri učitavanju: strana se otvori kad
     zatreba, a do tada nema razloga da postoji u DOM-u. Postavke su
     drugačije — one nastaju odmah jer notifications.js u njih ubaci svoje
     dugme (vidi settings.js).
     ------------------------------------------------------------------------ */

  function build() {
    drawer = document.createElement("div");
    /* `drawer-duas` je tu da CSS razlikuje ovaj drawer od postavki i od
       stranice mushafa. */
    drawer.className = "drawer drawer-duas";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Dove za stanja");
    drawer.hidden = true;

    var sheet = document.createElement("div");
    sheet.className = "drawer-sheet";

    var head = document.createElement("div");
    head.className = "drawer-head";

    var titles = document.createElement("div");
    titles.appendChild(p("drawer-title", "Dove za stanja"));
    titles.appendChild(p("drawer-sub", "Odaberi stanje i prouči."));

    var close = document.createElement("button");
    close.type = "button";
    close.className = "drawer-close";
    close.setAttribute("aria-label", "Zatvori");
    close.textContent = "✕";
    close.addEventListener("click", zatvori);

    head.appendChild(titles);
    head.appendChild(close);

    tabsBox = document.createElement("div");
    tabsBox.className = "duas-tabs";
    tabsBox.setAttribute("role", "tablist");
    tabsBox.setAttribute("aria-label", "Stanja");

    body = document.createElement("div");
    body.className = "drawer-body";
    body.id = "duasPanel";
    body.setAttribute("role", "tabpanel");

    topBtn = dugmeNaVrh();

    sheet.appendChild(head);
    sheet.appendChild(tabsBox);
    sheet.appendChild(body);
    /* Dugme ide u PLOČU, ne u tijelo: u tijelu bi se skrolalo zajedno sa
       karticama, a ovako lebdi nad njima kao i sva ostala ovakva dugmad. */
    sheet.appendChild(topBtn);
    drawer.appendChild(sheet);

    /* Račun ide odmah iz slušaoca, bez requestAnimationFrame — isto kao za
       dugme na listi (script.js, 11c): rAF ne opali dok je strana skrivena, pa
       bi dugme kasnilo za stanjem. U DOM se ne piše ništa dok se stanje
       stvarno ne promijeni (`topShown`). */
    body.addEventListener("scroll", osvjeziTop, { passive: true });
    /* Nova visina ekrana (rotacija) mijenja i gdje je dno. */
    window.addEventListener("resize", osvjeziTop, { passive: true });

    /* klik po zatamnjenoj pozadini zatvara — isto kao u ostalim drawer-ima */
    drawer.addEventListener("click", function (e) {
      if (e.target === drawer) { zatvori(); }
    });

    document.body.appendChild(drawer);
  }

  function otvori() {
    if (!drawer) { build(); }
    if (trebaCrtanje) { nacrtaj(); }

    drawer.hidden = false;
    otvoren = true;
    document.body.classList.add("no-scroll");
    if (btn) { btn.classList.add("is-on"); }
    body.scrollTop = 0;
    /* Dok je ploča bila skrivena, `clientHeight` joj je bio 0 — dno se zna
       tek sada. */
    osvjeziTop();
    drawer.querySelector(".drawer-close").focus();
  }

  function zatvori() {
    if (!drawer || drawer.hidden) { return; }
    drawer.hidden = true;
    otvoren = false;
    pokaziTop(false);

    /* Kvačice se brišu sa zatvaranjem: one su oznaka dokle se stiglo u JEDNOM
       učenju, a zatvorena strana znači da je to učenje završeno. Ko je opet
       otvori, počinje ispočetka — inače bi se sljedeći put zatekao pola
       skupine već "proučene" i ne bi znao odakle je to.

       `trebaCrtanje` je uz to obavezno: čvorovi kartica ostaju u DOM-u sa
       klasom `is-done`, pa bi bez ponovnog crtanja pri sljedećem otvaranju
       stajale prekrižene iako u `ucene` više nema ničega. */
    ucene = Object.create(null);
    trebaCrtanje = true;

    document.body.classList.remove("no-scroll");
    if (btn) {
      btn.classList.remove("is-on");
      btn.focus();
    }
  }

  /* ------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------ */

  btn = document.getElementById("duasBtn");

  /* Bez data.js ove strane nema šta pokazati, pa se ni dugme ne nudi: dugme
     koje otvori praznu ploču je gore od dugmeta kojeg nema. */
  if (btn && typeof stanjeSections === "function") {
    btn.addEventListener("click", function () {
      if (otvoren) { zatvori(); } else { otvori(); }
    });
  } else if (btn) {
    btn.hidden = true;
  }

  /* Promjena u postavkama (sakrivena dova, nova vlastita, transkripcija,
     drugi redoslijed) mijenja i ovu stranu. Dok je zatvorena se ne crta —
     samo se zapamti da treba, pa se iscrta pri otvaranju. */
  if (window.mojZikrConfig && window.mojZikrConfig.naPromjenu) {
    window.mojZikrConfig.naPromjenu(function () {
      if (otvoren) { nacrtaj(); } else { trebaCrtanje = true; }
    });
  }

  /* Escape zatvara. Ostali drawer-i imaju svoj osluškivač i gledaju samo
     sebe, pa se ne miješaju. */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && otvoren) { zatvori(); }
  });

})();
