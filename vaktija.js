/* ==========================================================================
   vaktija.js — vaktija za Sarajevo (api.vaktija.ba)

   Tri stvari na ekranu:

     kartica iznad spiska   naredni vakat, odbrojavanje, traka isteka i luk
                            dana sa svih šest vremena
     oznaka u traci selama  isti vakat i isto odbrojavanje, stisnuto u
                            nekoliko znakova; klik skrola nazad na karticu
     strana (drawer)        isti dan raspisan, red po red

   ZAŠTO IZNAD SPISKA, A NE U ZAGLAVLJU. Zaglavlje je sticky i stoji preko
   cijelog dana rada — svaki red u njemu se plaća visinom koja nikad ne
   ode sa ekrana. Vaktija se gleda pri otvaranju, kao i datum, pa joj je
   mjesto tu: prvo što se vidi, a skrola se zajedno sa spiskom i sklanja kad
   se krene raditi.

   ŠTA SE ANIMIRA. Ništa ukrasno — sve pokazuje istek:

     traka       puni se od prethodnog vakta do narednog, glatko, u realnom
                 vremenu (jedan otkucaj u sekundi)
     odbrojav.   sati i minute dok je daleko, minute i sekunde u zadnjem
                 satu — broj koji se miče kaže da je vrijeme živo
     zadnjih 15  kartica pređe u zlatno i odbrojavanje diše (`is-soon`)
     nastupanje  prva tri minuta poslije vakta kartica to i kaže
                 (`is-nastupio`), pa se vrati na uobičajeno

   Ko traži manje animacija (`prefers-reduced-motion`) dobija iste podatke
   bez disanja i bez klizanja trake — vidi style.css.

   Obavijest o nastupanju vakta NE ide odavde. Kad je aplikacija zatvorena,
   ovaj fajl ne radi, a upravo tada obavijest i treba — zato je zakazivanje
   na serveru, u istom ciklusu koji šalje i podsjetnike za zikr (api/cron.js,
   uz `vaktijaObavijest` u configu). Ovdje je samo prikaz.

   MJESEC ODJEDNOM, NE DAN, I UNAPRIJED. api.vaktija.ba daje i cijeli mjesec
   jednim pozivom, pa se skida mjesec i drži u localStorage; pri prvom
   otvaranju u danu se u pozadini dopuni i sljedeći mjesec (`zagrij()`), da
   se klik na vaktiju nikad ne čeka. Tri koristi:

     1. radi bez interneta — vaktija je već tu, do kraja mjeseca
     2. jedan poziv mjesečno umjesto jednog dnevno (API ima ograničenje
        broja zahtjeva)
     3. jučerašnja jacija i sutrašnja zora se znaju, pa i prva i zadnja traka
        u danu imaju od čega mjeriti istek

   SAT JE SARAJEVSKI, ne uređajev. Vaktija su vremena po Sarajevu; telefon
   koji je u drugoj zoni bi po svom satu odbrojavao pogrešno. Zato se "sada"
   uvijek čita kroz `Europe/Sarajevo` — isto pravilo po kojem i server
   odlučuje o obavijestima (`sarajevoNow()` u api/_lib.js).

   Imena vakata i njihov redoslijed su u vakti.js — istom spisku iz kojeg
   server uzima tekst obavijesti. Ikonice su ovdje: server ih ne treba.
   ========================================================================== */

(function () {
  "use strict";

  /* Bez spiska vakata nema šta ni crtati (vakti.js nije učitan). */
  if (typeof VAKTI === "undefined") { return; }

  var STORE_KEY = "moj-zikr-vaktija";
  var TZ = "Europe/Sarajevo";

  /* Koliko se čeka na odgovor vaktije prije nego se odustane. Aplikacija bez
     vaktije radi normalno, pa nema razloga da iko čeka duže. */
  var CEKANJE_MS = 8000;

  /* Zadnjih toliko minuta prije vakta kartica pređe u "uskoro". */
  var USKORO_MIN = 15;
  /* Toliko dugo poslije vakta kartica javlja da je nastupio. */
  var NASTUPIO_SEK = 3 * 60;
  /* Kad se ne zna prethodni vakat (nema jučerašnjeg dana u kešu), traka
     mjeri od ovoliko sati unazad — da ne ostane prazna. */
  var RASPON_REZERVA = 6 * 60;

  var okvir = null;   /* .vaktija-wrap — skriva se kad vaktije nema */
  var card = null;
  var polja = null;   /* čvorovi u kartici koje dira otkucaj */
  var tacke = [];     /* šest tačaka luka dana */
  var chip = null;    /* oznaka u traci sa selamom */
  var chipPolja = null;

  var drawer = null;
  var drawerBody = null;
  var otvoren = false;

  var sat = null;         /* interval koji kuca sekunde */
  var crtaniDan = "";     /* dan za koji su kartica i spisak nacrtani */
  var zadnjiIndex = -1;   /* naredni vakat pri prošlom otkucaju */
  var zadnjiPostotak = -1;
  var skidam = {};        /* mjeseci koji su trenutno na putu, da se ne traže dvaput */

  function prefs() {
    return (window.mojZikrConfig && window.mojZikrConfig.prefs()) || {};
  }

  /* PUTOVANJE GASI VAKTIJU. Vaktija je vezana za JEDAN grad (Sarajevo), a
     putovanje znači da se taj grad ne gleda kroz prozor — vremena bi bila
     tuđa, a tuđa vaktija je gore od nikakve.

     Gasi se svugdje istovremeno i po istom polju configa: kartica ovdje,
     obavijest na serveru (api/cron.js), widget u svom odgovoru
     (api/widget.js). Jedan prekidač, tri mjesta koja ga poštuju.

     Prikaz se uz to gasi i sam za sebe, prekidačem "Vaktija" u postavkama.
     Podrazumijevano je uključen (data.js, `defaultPrefs()`). */
  function naPutuSad() {
    var p = prefs();
    return (typeof naPutu === "function") ? naPutu(p) : p.putovanje === true;
  }

  function ukljucena() {
    return prefs().vaktija !== false && !naPutuSad();
  }

  /* ------------------------------------------------------------------------
     Vrijeme po Sarajevu
     ------------------------------------------------------------------------ */

  function sarajevo(kad) {
    var d = kad || new Date();

    try {
      var fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
      });
      var p = {};
      fmt.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });

      return {
        godina: parseInt(p.year, 10),
        mjesec: parseInt(p.month, 10),
        dan: parseInt(p.day, 10),
        /* neki engini za ponoć vrate "24" — otuda % 24 */
        minute: (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10),
        sekunde: parseInt(p.second, 10)
      };
    } catch (e) {
      /* Okruženje bez zona — bolje uređajev sat nego ništa. */
      return {
        godina: d.getFullYear(),
        mjesec: d.getMonth() + 1,
        dan: d.getDate(),
        minute: d.getHours() * 60 + d.getMinutes(),
        sekunde: d.getSeconds()
      };
    }
  }

  /* Dan ± n, kroz UTC — ne kroz lokalni sat, da prelaz na ljetno računanje
     vremena ne pojede ni jedan dan. */
  function pomjeri(t, delta) {
    var d = new Date(Date.UTC(t.godina, t.mjesec - 1, t.dan + delta));
    return {
      godina: d.getUTCFullYear(),
      mjesec: d.getUTCMonth() + 1,
      dan: d.getUTCDate()
    };
  }

  function danKljuc(t) {
    return t.godina + "-" + t.mjesec + "-" + t.dan;
  }

  /* ------------------------------------------------------------------------
     Skinuta vaktija — localStorage, mjesec po mjesec

     Oblik: { "2026-8": { grad: "Sarajevo", dani: [["4:19", …], …] } }
     Ključ je godina i mjesec BEZ vodeće nule; mjesec u API-ju ide 1–12.
     ------------------------------------------------------------------------ */

  function mjesecKljuc(godina, mjesec) {
    return godina + "-" + mjesec;
  }

  function store() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY));
      return (raw && typeof raw === "object") ? raw : {};
    } catch (e) {
      return {};
    }
  }

  /* Mjeseci koji se drže: prošli, tekući i sljedeći. Prošli je tu zbog prve
     trake u danu (mjeri se od jučerašnje jacije), sljedeći zbog zadnjeg dana
     u mjesecu i zbog toga da se prelaz u novi mjesec ne čeka.

     Spisak je JEDAN i računa se uvijek iz današnjeg dana — i kad se sprema, i
     kad se čisti. Da svaka funkcija nosila svoj, prvo sljedeće spremanje bi
     izbrisalo ono što je druga upravo skinula. */
  function drzaniMjeseci() {
    var sad = sarajevo();
    var prosli = (sad.mjesec === 1)
      ? { godina: sad.godina - 1, mjesec: 12 }
      : { godina: sad.godina, mjesec: sad.mjesec - 1 };
    var sljedeci = (sad.mjesec === 12)
      ? { godina: sad.godina + 1, mjesec: 1 }
      : { godina: sad.godina, mjesec: sad.mjesec + 1 };

    return [
      mjesecKljuc(prosli.godina, prosli.mjesec),
      mjesecKljuc(sad.godina, sad.mjesec),
      mjesecKljuc(sljedeci.godina, sljedeci.mjesec)
    ];
  }

  /* Spisak koji raste bez kraja bio bi za koju godinu jedini razlog zbog
     kojeg localStorage pukne — zato se pri svakom upisu izbaci sve što nije
     na spisku iznad. */
  function spremi(kljuc, podaci) {
    var s = store();
    s[kljuc] = podaci;

    var drzi = drzaniMjeseci();
    Object.keys(s).forEach(function (k) {
      if (k !== kljuc && drzi.indexOf(k) === -1) { delete s[k]; }
    });

    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function vaktiZa(t) {
    var m = store()[mjesecKljuc(t.godina, t.mjesec)];
    var dani = m && m.dani;
    if (!Array.isArray(dani)) { return null; }
    var d = dani[t.dan - 1];
    return (Array.isArray(d) && d.length >= VAKTI.length) ? d : null;
  }

  function grad() {
    var sad = sarajevo();
    var m = store()[mjesecKljuc(sad.godina, sad.mjesec)];
    return (m && m.grad) || VAKTIJA_GRAD;
  }

  /* ------------------------------------------------------------------------
     Skidanje

     Jedan poziv po mjesecu. Odgovor je `{ dan: [ { vakat: [...] }, … ] }` —
     ovdje ostaju samo vremena, po danu, jer se ništa drugo ne prikazuje.
     ------------------------------------------------------------------------ */

  function skini(godina, mjesec) {
    var kljuc = mjesecKljuc(godina, mjesec);
    if (skidam[kljuc]) { return skidam[kljuc]; }

    var adresa = VAKTIJA_API + "/" + VAKTIJA_LOKACIJA + "/" + godina + "/" + mjesec;

    /* AbortController nema svako staro okruženje; bez njega se samo ne
       prekida ranije. */
    var stop = null;
    var opcije = {};
    try {
      stop = new AbortController();
      opcije.signal = stop.signal;
      setTimeout(function () { stop.abort(); }, CEKANJE_MS);
    } catch (e) { stop = null; }

    skidam[kljuc] = fetch(adresa, opcije)
      .then(function (res) {
        if (!res.ok) { throw new Error("vaktija " + res.status); }
        return res.json();
      })
      .then(function (data) {
        var dani = (data && Array.isArray(data.dan))
          ? data.dan.map(function (d) {
              return (d && Array.isArray(d.vakat)) ? d.vakat.slice(0, VAKTI.length) : null;
            })
          : null;

        if (!dani || !dani.length) { throw new Error("vaktija: prazan mjesec"); }

        spremi(kljuc, { grad: data.lokacija || VAKTIJA_GRAD, dani: dani });
        delete skidam[kljuc];
        return true;
      })
      .catch(function () {
        delete skidam[kljuc];
        return false;
      });

    return skidam[kljuc];
  }

  /* Ono što treba da bi kartica i strana imali šta pokazati: današnji dan, uz
     jučerašnji (prva traka u danu mjeri od jučerašnje jacije) i sutrašnji
     (poslije jacije se odbrojava do sutrašnje zore). U istom mjesecu je to
     jedan poziv; oko prvog i zadnjeg u mjesecu dva.

     Vraća `true` ako se nešto skinulo, da pozivalac zna da treba ponovo
     iscrtati. */
  function skiniMjesece(kljucevi) {
    if (!kljucevi.length) { return Promise.resolve(false); }

    return Promise.all(kljucevi.map(function (k) {
      var par = k.split("-");
      return skini(parseInt(par[0], 10), parseInt(par[1], 10));
    })).then(function (ishodi) {
      return ishodi.some(Boolean);
    });
  }

  function osiguraj() {
    var sad = sarajevo();
    var dani = [pomjeri(sad, -1), sad, pomjeri(sad, 1)];

    var trazeni = [];
    dani.forEach(function (t) {
      if (vaktiZa(t)) { return; }
      var k = mjesecKljuc(t.godina, t.mjesec);
      if (trazeni.indexOf(k) === -1) { trazeni.push(k); }
    });

    return skiniMjesece(trazeni);
  }

  /* ------------------------------------------------------------------------
     Zagrijavanje keša — jednom na dan

     `osiguraj()` skida samo ono što treba SADA. To je dovoljno da kartica
     radi, ali prvog dana u novom mjesecu (ili poslije brisanja podataka) prvi
     klik na vaktiju čeka mrežu — a klik na vaktiju treba biti trenutan, kao
     otvaranje bilo koje druge strane u aplikaciji.

     Zato se pri PRVOM otvaranju u danu, u pozadini i bez žurbe, dopuni i
     tekući i SLJEDEĆI mjesec. Tada se čeka onaj ko ništa ne gleda; poslije se
     ne čeka nikad.

     Radi se najviše jednom dnevno: vaktija za dati mjesec se ne mijenja, pa
     nema šta osvježavati — oznaka dana u localStorage je jedini uslov. Piše
     se tek kad sve prođe, da neuspio pokušaj (nema mreže) ne otkaže i
     sutrašnji.
     ------------------------------------------------------------------------ */

  var ZAGRIJAN_KEY = "moj-zikr-vaktija-dan";

  function zagrij() {
    var danas = danKljuc(sarajevo());

    var zadnji = null;
    try { zadnji = localStorage.getItem(ZAGRIJAN_KEY); } catch (e) {}
    if (zadnji === danas) { return Promise.resolve(false); }

    /* Prošli mjesec se ne skida — treba samo zbog jučerašnje jacije, a to
       `osiguraj()` već pokrije kad zatreba. */
    var trebaju = drzaniMjeseci().slice(1).filter(function (k) {
      return !store()[k];
    });

    return skiniMjesece(trebaju).then(function (novo) {
      var sve = drzaniMjeseci().slice(1).every(function (k) {
        return !!store()[k];
      });
      if (sve) {
        try { localStorage.setItem(ZAGRIJAN_KEY, danas); } catch (e) {}
      }
      return novo;
    });
  }

  /* ------------------------------------------------------------------------
     Gdje smo u danu

     Jedan račun za sve što kartica pokazuje: koji vakat slijedi, koji je
     zadnji prošao, i koliko je od njega do narednog proteklo.

     Vraća null samo kad vaktije nema — tada se kartica ne prikazuje.
     ------------------------------------------------------------------------ */

  function stanje() {
    var sad = sarajevo();
    var danas = vaktiZa(sad);
    if (!danas) { return null; }

    var proteklo = sad.minute * 60 + sad.sekunde;

    var sljedeci = null;
    var prosli = null;
    var i, minuta;

    for (i = 0; i < VAKTI.length; i += 1) {
      minuta = vakatMinute(danas[i]);
      if (minuta === null) { continue; }

      if (minuta * 60 > proteklo) {
        sljedeci = { index: i, vrijeme: danas[i], sekundi: minuta * 60 };
        break;
      }
      prosli = { index: i, vrijeme: danas[i], sekundi: minuta * 60 };
    }

    /* Poslije jacije — naredna je sutrašnja zora. */
    var sutra = pomjeri(sad, 1);
    if (!sljedeci) {
      var listaSutra = vaktiZa(sutra);
      minuta = listaSutra ? vakatMinute(listaSutra[0]) : null;
      if (minuta === null) { return null; }
      sljedeci = {
        index: 0,
        vrijeme: listaSutra[0],
        sekundi: (minuta + 24 * 60) * 60,
        sutra: true
      };
    }

    /* Prije zore — prethodni je jučerašnja jacija, pa traka i prvog jutra
       ima od čega mjeriti. Bez jučerašnjeg dana ostaje rezervni raspon. */
    if (!prosli) {
      var jucer = vaktiZa(pomjeri(sad, -1));
      minuta = jucer ? vakatMinute(jucer[VAKTI.length - 1]) : null;
      prosli = (minuta === null)
        ? { index: -1, vrijeme: null, sekundi: sljedeci.sekundi - RASPON_REZERVA * 60 }
        : { index: VAKTI.length - 1, vrijeme: jucer[VAKTI.length - 1],
            sekundi: (minuta - 24 * 60) * 60, jucer: true };
    }

    var raspon = Math.max(60, sljedeci.sekundi - prosli.sekundi);
    var preostalo = Math.max(0, sljedeci.sekundi - proteklo);
    var od = Math.max(0, proteklo - prosli.sekundi);

    return {
      danas: danas,
      dan: danKljuc(sad),
      sljedeci: sljedeci,
      prosli: prosli,
      preostalo: preostalo,
      /* koliko je vakta isteklo, 0–1 */
      istek: Math.max(0, Math.min(1, od / raspon)),
      /* koliko je prošlo od zadnjeg vakta — po tome kartica javi nastupanje */
      od: od,
      uskoro: preostalo <= USKORO_MIN * 60,
      nastupio: (!prosli.jucer && prosli.index >= 0 && od <= NASTUPIO_SEK)
        ? prosli
        : null
    };
  }

  /* Odbrojavanje: dok je daleko — sati i minute, u zadnjem satu — minute i
     sekunde. Broj koji se miče svake sekunde tek pred vakat kaže da se
     vrijeme troši; osam sati ranije bi bio samo nemir. */
  function odbrojavanje(sekundi) {
    var ukupno = Math.max(0, sekundi);
    var h = Math.floor(ukupno / 3600);
    var m = Math.floor((ukupno % 3600) / 60);
    var s = ukupno % 60;

    if (h > 0) { return h + " h " + m + " min"; }
    return m + ":" + String(s).padStart(2, "0");
  }

  /* Isto odbrojavanje, ali stisnuto — za oznaku u traci sa selamom, gdje je
     mjesta za nekoliko znakova. "2 h 13 min" tamo ne stane pored imena i
     vremena, a "2h 13m" stane i čita se isto. */
  function odbrojavanjeKratko(sekundi) {
    var ukupno = Math.max(0, sekundi);
    var h = Math.floor(ukupno / 3600);
    var m = Math.floor((ukupno % 3600) / 60);
    var sek = ukupno % 60;

    if (h > 0) { return h + "h " + m + "m"; }
    return m + ":" + String(sek).padStart(2, "0");
  }

  /* ------------------------------------------------------------------------
     Ikonice vakata

     Sunce koje izlazi, stoji, pada i zalazi, pa mlađak — put dana u pet
     znakova. Stoje ovdje, a ne u vakti.js: server iz tog spiska uzima imena
     i tekstove, a crteži bi mu samo stajali u bundle-u.
     ------------------------------------------------------------------------ */

  var CRTEZI = {
    /* zora — sunce još ispod ruba, prve zrake */
    zora: "M3.5 18.5h17M7 18.5a5 5 0 0 1 10 0M12 5.4V3.2M5.6 8.1 4.4 6.9M18.4 8.1l1.2-1.2",
    /* izlazak — isto sunce, ali se diže: strelica nagore */
    izlazak: "M3.5 18.5h17M7.5 18.5a4.5 4.5 0 0 1 9 0M12 3v5M9.8 5.2 12 3l2.2 2.2",
    /* podne — puno sunce, zrake na sve strane */
    podne: "M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8M12 2.6v2.2M12 19.2v2.2M4.4 12H2.2M21.8 12h-2.2M6.3 6.3 4.8 4.8M19.2 19.2l-1.5-1.5M17.7 6.3l1.5-1.5M4.8 19.2l1.5-1.5",
    /* ikindija — sunce se spustilo nad rub, zrake samo odozgo */
    ikindija: "M3.5 20h17M12 9.2a4.2 4.2 0 0 1 4.2 4.2M7.8 13.4A4.2 4.2 0 0 1 12 9.2M12 4.6v2M6.2 7.2 7.6 8.6M17.8 7.2l-1.4 1.4M3.9 13.4h2M18.1 13.4h2",
    /* akšam — sunce zalazi ispod ruba: strelica nadole */
    aksam: "M3.5 18.5h17M7.5 18.5a4.5 4.5 0 0 1 9 0M12 8V3M9.8 5.8 12 8l2.2-2.2",
    /* jacija — mlađak i zvijezda */
    jacija: "M20 14.4A8.2 8.2 0 0 1 9.6 4a7.6 7.6 0 1 0 10.4 10.4ZM17.4 3.4l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7Z"
  };

  function ikonaVakta(id, klasa) {
    var NS = "http://www.w3.org/2000/svg";

    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", klasa);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", CRTEZI[id] || CRTEZI.podne);
    svg.appendChild(path);

    return svg;
  }

  function span(klasa, tekst) {
    var node = document.createElement("span");
    node.className = klasa;
    if (tekst !== undefined) { node.textContent = tekst; }
    return node;
  }

  function p(klasa, tekst) {
    var node = document.createElement("p");
    node.className = klasa;
    if (tekst !== undefined) { node.textContent = tekst; }
    return node;
  }

  /* ------------------------------------------------------------------------
     Kartica

     Stoji između zaglavlja i spiska, kao vlastiti element — ne unutar
     `#sectionsRoot`, koji script.js pri svakom crtanju prazni. Tako se dva
     fajla ne otimaju o isti čvor.

     Cijela kartica je dugme: otvara stranu sa svim vremenima. Sadržaj su
     zato `<span>`-ovi, ne `<div>`-ovi — dugme prima samo tekstualni sadržaj.
     ------------------------------------------------------------------------ */

  function napraviKarticu() {
    var main = document.getElementById("sectionsRoot");
    if (!main || !main.parentNode) { return false; }

    okvir = document.createElement("div");
    okvir.className = "wrap vaktija-wrap";
    okvir.hidden = true;

    card = document.createElement("button");
    card.type = "button";
    card.className = "vcard";

    /* --- gornji red: šta je ovo, i koliko ga ima --- */
    var head = span("vcard-head");
    var label = span("vcard-label", "Naredni vakat");
    var left = span("vcard-left", "");
    head.appendChild(label);
    head.appendChild(left);
    card.appendChild(head);

    /* --- glavni red: znak, ime, vrijeme --- */
    var main2 = span("vcard-main");
    var ikonaBox = span("vcard-icon");
    var ime = span("vcard-name", "");
    var kad = span("vcard-time", "");
    main2.appendChild(ikonaBox);
    main2.appendChild(ime);
    main2.appendChild(kad);
    card.appendChild(main2);

    /* --- traka isteka --- */
    var track = span("vcard-track");
    var fill = span("vcard-fill");
    track.appendChild(fill);
    card.appendChild(track);

    /* --- luk dana: šest tačaka --- */
    var day = span("vcard-day");
    tacke = VAKTI.map(function (vakat) {
      var dot = span("vdot");
      dot.appendChild(ikonaVakta(vakat.id, "vdot-icon"));
      var vrijeme = span("vdot-time", "—");
      dot.appendChild(vrijeme);
      dot.vrijeme = vrijeme;
      day.appendChild(dot);
      return dot;
    });
    card.appendChild(day);

    card.addEventListener("click", function () {
      if (otvoren) { zatvori(); } else { otvori(); }
    });

    polja = {
      label: label,
      left: left,
      ikona: ikonaBox,
      ime: ime,
      kad: kad,
      fill: fill
    };

    okvir.appendChild(card);
    main.parentNode.insertBefore(okvir, main);
    return true;
  }

  /* Traka se puni glatko, ali kad vakat nastupi mora skočiti na nulu — bez
     ovoga bi klizila unazad preko cijelog ekrana. */
  function postaviTraku(postotak) {
    if (!polja) { return; }
    var novi = Math.round(postotak * 1000) / 10;
    if (novi === zadnjiPostotak) { return; }

    if (novi < zadnjiPostotak) {
      polja.fill.classList.add("is-skok");
      polja.fill.style.width = novi + "%";
      /* Sljedeći kadar vraća klizanje — dotad je skok već obavljen. */
      window.requestAnimationFrame(function () {
        polja.fill.classList.remove("is-skok");
      });
    } else {
      polja.fill.style.width = novi + "%";
    }

    zadnjiPostotak = novi;
  }

  /* ------------------------------------------------------------------------
     Oznaka u traci sa selamom

     Kartica je prvo što se vidi pri otvaranju, ali kad se skrola do sredine
     spiska ode sa ekrana — a zaglavlje ostaje. Zato ista stvar, u dvije
     riječi, stoji i gore: ime vakta i vrijeme, uz avion i temu.

     Ovo JESTE dugme, za razliku od te dvije oznake pored (vidi komentar uz
     `.salaam-theme` u style.css): one ne rade ništa na dodir pa i ne smiju
     izgledati kao dugme, a ova vodi na karticu — pa ima pilulu, i pritisak
     koji obeća i ispuni.

     Trake sa selamom nema dok ime nije upisano; tada nema ni ove oznake.
     Kartica ispod zaglavlja svejedno stoji.
     ------------------------------------------------------------------------ */

  function napraviChip() {
    var marks = document.querySelector(".salaam-marks");
    if (!marks) { return false; }

    chip = document.createElement("button");
    chip.type = "button";
    chip.className = "salaam-vakat";
    chip.hidden = true;

    var ikonaBox = span("salaam-vakat-icon");
    var ime = span("salaam-vakat-name", "");
    var kad = span("salaam-vakat-time", "");
    /* Odbrojavanje i ovdje, ne samo na kartici: kad se kartica otkotrlja sa
       ekrana, ovo je jedino mjesto na kojem se vidi koliko je ostalo. */
    var ostalo = span("salaam-vakat-left", "");

    chip.appendChild(ikonaBox);
    chip.appendChild(ime);
    chip.appendChild(kad);
    chip.appendChild(ostalo);

    chip.addEventListener("click", naKarticu);

    /* Prvi u grupi — avion i tema ostaju uz sam rub ekrana, gdje su i bili. */
    marks.insertBefore(chip, marks.firstChild);

    chipPolja = { ikona: ikonaBox, ime: ime, kad: kad, ostalo: ostalo };
    return true;
  }

  /* --- skrol do kartice ----------------------------------------------------
     Vlastita animacija umjesto `scrollTo({behavior:"smooth"})`, iz istog
     razloga kao na spisku i na strani sa dovama: nativni glatki skrol neki
     webview-i tiho ignorišu, pa bi pomjeranje znalo potpuno izostati.

     Cilj je vrh kartice, umanjen za visinu zaglavlja — ono je sticky, pa bi
     bez toga kartica završila ispod njega. -------------------------------- */

  var SKROL_MS = 420;
  var skrolAnim = null;

  function mirnijeAnimacije() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function skrolujNa(cilj) {
    var od = window.pageYOffset;
    var raz = cilj - od;

    if (skrolAnim) { cancelAnimationFrame(skrolAnim); skrolAnim = null; }
    if (Math.abs(raz) < 2) { return; }

    if (mirnijeAnimacije() || typeof window.requestAnimationFrame !== "function") {
      window.scrollTo(0, cilj);
      return;
    }

    var pocetak = null;

    function korak(t) {
      if (pocetak === null) { pocetak = t; }
      var k = Math.min(1, (t - pocetak) / SKROL_MS);
      /* easeOutCubic — kreće brzo, staje mekano */
      window.scrollTo(0, od + raz * (1 - Math.pow(1 - k, 3)));
      if (k < 1) { skrolAnim = window.requestAnimationFrame(korak); }
      else { skrolAnim = null; }
    }

    skrolAnim = window.requestAnimationFrame(korak);
  }

  /* Kartica je odmah pod zaglavljem, pa je pola puta strana već na njoj —
     zato uz skrol ide i kratak bljesak: bez njega klik iz zaglavlja izgleda
     kao da se ništa nije desilo. */
  function blicni() {
    if (!card) { return; }
    card.classList.remove("is-blic");
    /* Ponovno pokretanje animacije traži jedan kadar bez klase. */
    window.requestAnimationFrame(function () {
      card.classList.add("is-blic");
      setTimeout(function () { card.classList.remove("is-blic"); }, 1400);
    });
  }

  function naKarticu() {
    if (!okvir || okvir.hidden) { return; }

    var header = document.querySelector(".app-header");
    var visina = header ? header.offsetHeight : 0;
    var y = window.pageYOffset + okvir.getBoundingClientRect().top - visina - 10;

    skrolujNa(Math.max(0, y));
    blicni();
  }

  /* ------------------------------------------------------------------------
     Strana sa svim vremenima
     ------------------------------------------------------------------------ */

  function napraviDrawer() {
    drawer = document.createElement("div");
    drawer.className = "drawer drawer-vaktija";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Vaktija");
    drawer.hidden = true;

    var sheet = document.createElement("div");
    sheet.className = "drawer-sheet";

    var head = document.createElement("div");
    head.className = "drawer-head";

    var titles = document.createElement("div");
    titles.appendChild(p("drawer-title", "Vaktija"));
    titles.appendChild(p("drawer-sub", grad() + " · vaktija.ba"));

    var close = document.createElement("button");
    close.type = "button";
    close.className = "drawer-close";
    close.setAttribute("aria-label", "Zatvori");
    close.textContent = "✕";
    close.addEventListener("click", zatvori);

    head.appendChild(titles);
    head.appendChild(close);

    drawerBody = document.createElement("div");
    drawerBody.className = "drawer-body";

    sheet.appendChild(head);
    sheet.appendChild(drawerBody);
    drawer.appendChild(sheet);

    drawer.addEventListener("click", function (e) {
      if (e.target === drawer) { zatvori(); }
    });

    document.body.appendChild(drawer);
  }

  /* Spisak se crta jednom po danu; odbrojavanje i oznake se ispisuju svake
     sekunde (vidi `kucni()`). Prekrajanje šest redova svake sekunde bi bilo
     trošenje ni zbog čega. */
  function nacrtajSpisak() {
    if (!drawerBody) { return; }

    var s = stanje();

    drawerBody.textContent = "";
    drawerBody.redovi = null;
    drawerBody.vakatNow = null;

    if (!s) {
      drawerBody.appendChild(p("vakat-prazno",
        "Vaktija nije preuzeta. Provjeri vezu pa pokušaj ponovo."));
      return;
    }

    var sazetak = document.createElement("div");
    sazetak.className = "vakat-now";
    var label = p("vakat-now-label", "Naredni vakat");
    sazetak.appendChild(label);

    var red = document.createElement("p");
    red.className = "vakat-now-head";
    var ime = span("vakat-now-name");
    var kad = span("vakat-now-time");
    red.appendChild(ime);
    red.appendChild(kad);
    sazetak.appendChild(red);

    var ostalo = p("vakat-now-left", "");
    sazetak.appendChild(ostalo);
    drawerBody.appendChild(sazetak);

    var lista = document.createElement("div");
    lista.className = "vakat-list";

    var redovi = VAKTI.map(function (vakat, i) {
      var row = document.createElement("div");
      row.className = "vakat-row";

      var znak = ikonaVakta(vakat.id, "vakat-icon");
      var naziv = span("vakat-naziv", vakat.naziv);
      var vrijeme = span("vakat-vrijeme", s.danas[i] || "—");

      row.appendChild(znak);
      row.appendChild(naziv);
      row.appendChild(vrijeme);
      lista.appendChild(row);
      return row;
    });

    drawerBody.appendChild(lista);
    drawerBody.redovi = redovi;
    drawerBody.vakatNow = { label: label, ime: ime, kad: kad, ostalo: ostalo };
  }

  function otvori() {
    if (!drawer) { napraviDrawer(); }
    nacrtajSpisak();
    kucni();

    drawer.hidden = false;
    otvoren = true;
    document.body.classList.add("no-scroll");
    if (card) { card.classList.add("is-on"); }
    drawer.querySelector(".drawer-close").focus();

    /* Vaktija je mogla ostati od prošlog mjeseca — pokušaj dopuniti, pa ako
       nešto stigne, iscrtaj ponovo. */
    osiguraj().then(function (novo) {
      if (novo && otvoren) { nacrtajSpisak(); kucni(); }
    });
  }

  function zatvori() {
    if (!drawer || drawer.hidden) { return; }
    drawer.hidden = true;
    otvoren = false;
    document.body.classList.remove("no-scroll");
    if (card) {
      card.classList.remove("is-on");
      card.focus();
    }
  }

  /* ------------------------------------------------------------------------
     Otkucaj — jednom u sekundi
     ------------------------------------------------------------------------ */

  function kucni() {
    var s = stanje();
    var imaSta = !!s && ukljucena();

    if (okvir) { okvir.hidden = !imaSta; }
    if (chip) { chip.hidden = !imaSta; }

    /* Ponoć je prošla dok je aplikacija stajala otvorena — spisak i luk dana
       su od jučer. */
    if (s && crtaniDan && crtaniDan !== s.dan) {
      crtaniDan = s.dan;
      nacrtajLuk(s);
      if (otvoren) { nacrtajSpisak(); }
    }

    if (!imaSta) { return; }
    if (!crtaniDan) { crtaniDan = s.dan; nacrtajLuk(s); }

    var vakat = VAKTI[s.sljedeci.index];

    /* Ime i znak se mijenjaju samo kad se vakat promijeni — u međuvremenu se
       dira isključivo tekst koji se stvarno miče. */
    if (s.sljedeci.index !== zadnjiIndex) {
      zadnjiIndex = s.sljedeci.index;
      polja.ime.textContent = vakat.naziv;
      polja.kad.textContent = s.sljedeci.vrijeme;
      polja.ikona.textContent = "";
      polja.ikona.appendChild(ikonaVakta(vakat.id, "vcard-icon-svg"));
      oznaciLuk(s);

      if (chipPolja) {
        chipPolja.ime.textContent = vakat.naziv;
        chipPolja.kad.textContent = s.sljedeci.vrijeme;
        chipPolja.ikona.textContent = "";
        chipPolja.ikona.appendChild(ikonaVakta(vakat.id, "salaam-vakat-svg"));
        chip.setAttribute("aria-label",
          "Naredni vakat " + vakat.naziv + " u " + s.sljedeci.vrijeme +
          " — pokaži vaktiju");
        chip.title = "Pokaži vaktiju";
      }
    }

    polja.left.textContent = "za " + odbrojavanje(s.preostalo);
    if (chipPolja) {
      chipPolja.ostalo.textContent = odbrojavanjeKratko(s.preostalo);
    }
    polja.label.textContent = s.nastupio
      ? "Nastupio vakat: " + VAKTI[s.nastupio.index].naziv
      : "Naredni vakat";

    card.classList.toggle("is-soon", s.uskoro);
    card.classList.toggle("is-nastupio", !!s.nastupio);
    card.setAttribute("aria-label",
      "Vaktija — naredni vakat " + vakat.naziv + " u " + s.sljedeci.vrijeme +
      ", za " + odbrojavanje(s.preostalo));

    postaviTraku(s.istek);

    if (otvoren && drawerBody && drawerBody.vakatNow) {
      var n = drawerBody.vakatNow;
      n.label.textContent = polja.label.textContent;
      n.ime.textContent = vakat.naziv + (s.sljedeci.sutra ? " (sutra)" : "");
      n.kad.textContent = s.sljedeci.vrijeme;
      n.ostalo.textContent = "za " + odbrojavanje(s.preostalo);
      oznaciRedove(s);
    }
  }

  /* Vremena u luku dana — mijenjaju se jednom dnevno. */
  function nacrtajLuk(s) {
    tacke.forEach(function (dot, i) {
      dot.vrijeme.textContent = s.danas[i] || "—";
    });
    oznaciLuk(s);
  }

  function oznaciLuk(s) {
    tacke.forEach(function (dot, i) {
      var jeSljedeci = !s.sljedeci.sutra && s.sljedeci.index === i;
      var proslo = s.sljedeci.sutra || i < s.sljedeci.index;
      dot.classList.toggle("is-next", jeSljedeci);
      dot.classList.toggle("is-past", proslo);
    });
  }

  function oznaciRedove(s) {
    var redovi = (drawerBody && drawerBody.redovi) || [];
    redovi.forEach(function (row, i) {
      var jeSljedeci = !s.sljedeci.sutra && s.sljedeci.index === i;
      var proslo = s.sljedeci.sutra || i < s.sljedeci.index;
      row.classList.toggle("is-next", jeSljedeci);
      row.classList.toggle("is-past", proslo);
    });
  }

  /* Sat kuca samo dok se aplikacija gleda: u pozadini bi trošio bateriju, a
     odbrojavanje koje niko ne vidi ne treba nikom. Pri povratku se odmah
     ispiše novo stanje, pa se ne vidi zastarjeli broj ni jednu sekundu. */
  function pokreni() {
    if (sat) { return; }
    kucni();
    sat = setInterval(kucni, 1000);
  }

  function stani() {
    if (!sat) { return; }
    clearInterval(sat);
    sat = null;
  }

  /* ------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------ */

  if (!napraviKarticu()) { return; }
  napraviChip();

  /* Ono što je skinuto ranije se vidi ODMAH, bez čekanja na mrežu — zato se
     prvo crta iz localStorage, pa se tek onda dopunjava. */
  pokreni();

  function dopuni() {
    return osiguraj().then(function (novo) {
      if (!novo) { return; }
      /* Nov mjesec u kešu može promijeniti i luk dana i spisak. */
      crtaniDan = "";
      zadnjiIndex = -1;
      if (otvoren) { nacrtajSpisak(); }
      kucni();
    });
  }

  /* Ono što treba odmah — pa tek onda, u pozadini, ostatak.

     Zagrijavanje kasni namjerno: prvih par sekundi po otvaranju idu na
     iscrtavanje spiska i na `/api/state`, a mjesec vaktije nikom ne treba u
     toj sekundi. */
  function osvjezi() {
    return dopuni().then(function () {
      setTimeout(function () { zagrij().then(function (novo) {
        if (novo) { kucni(); }
      }); }, 2500);
    });
  }

  osvjezi();

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      pokreni();
      /* Aplikacija je mogla stajati u pozadini preko ponoći ili preko kraja
         mjeseca — dopuni šta fali, pa (ako je nov dan) zagrij keš. */
      osvjezi();
    } else {
      stani();
    }
  });

  window.addEventListener("online", dopuni);

  /* Prikaz se gasi i pali u postavkama; gašenje zatvara i otvorenu stranu,
     da ne ostane na ekranu ono što je upravo isključeno. */
  if (window.mojZikrConfig && window.mojZikrConfig.naPromjenu) {
    window.mojZikrConfig.naPromjenu(function () {
      if (!ukljucena() && otvoren) { zatvori(); }
      kucni();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && otvoren) { zatvori(); }
  });

})();
