/* ==========================================================================
   settings.js — config korisnika i drawer u kojem se podešava.

   Pet stvari:

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

     izmjene       SVAKA stavka se može urediti — i ona iz data.js. Pamti se
                   samo ono što je stvarno promijenjeno, pa ispravka u
                   data.js i dalje dođe do korisnika koji je toj dovi
                   promijenio samo broj ponavljanja. Kur'anska stavka na tom
                   istom mjestu ima broj stranica dnevno.

     vlastite      svoja dova ili svoj zikr, u bilo koju sekciju osim
     stavke        kur'anske, bez deploya. Tri oblika: zikr sa brojem, dova
                   (arapski, transkripcija, prevod, izvor) i obična stavka
                   sa samo naslovom i kvačicom.

   Redovi spiska su svi isti — vidi „Spisak stavki“ ispod.

   Prekidača za cijelu sekciju nema. Postojao je (petak), ali kvačice rade
   isto i na jednom mjestu: isključi svih pet petačkih stavki i sekcije nema,
   kao ni njenog podsjetnika. Zbog toga je `transkript` jedini prekidač.

   Spisak sekcija se NE nabraja ovdje — akordeoni se prave iz
   `pickableSections()` u data.js, pa nova sekcija sa spiskom sama dobije svoj.

   Brisanje: vlastita stavka nestaje zauvijek, a stavka iz data.js se skida
   sa spiska (isto što radi i kvačica pored nje). Obrisati je zauvijek nije
   moguće — ona nije korisnikova, dolazi iz aplikacije — pa forma to i kaže
   umjesto da se pravi da jeste.

   Podsjetnici (zvono) su premješteni u ovaj drawer, ali ih i dalje vodi
   notifications.js — ovdje se samo pravi red u koji on ubaci svoje dugme.
   Zato drawer nastaje ODMAH pri učitavanju, a ne pri prvom otvaranju: kad
   notifications.js krene, njegov `notifyBtn` mora već postojati.

   Šta ide gore na server, a šta ostaje ovdje:

     server (cfg:<ime>)   sve četiri postavke — da drugi uređaj istog
                          korisnika zatekne isto stanje, i da scheduler zna
                          šta se uopšte broji (vlastita stavka ulazi u račun
                          podsjetnika kao i svaka druga)
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
     data.js sama dobije svoju kvačicu.

     Config ide unutra jer u spisku moraju stajati i korisnikove VLASTITE
     stavke: one se u ovom drawer-u i prave, i sakrivaju, i brišu. */
  function birljive() {
    return (typeof pickableSections === "function") ? pickableSections(config) : [];
  }

  /* Stavke jedne sekcije — takođe iz data.js, jer Kur'an svoju jedinu stavku
     nema u `items` (vidi `sectionItems()` tamo). */
  function stavke(section) {
    return (typeof sectionItems === "function")
      ? sectionItems(section)
      : (section.items || []);
  }

  /* Podrazumijevani config i njegovo čišćenje su u data.js, ne ovdje.

     Kroz ista pravila mora proći i ono što se ovdje upiše u localStorage i
     ono što server primi u tijelu zahtjeva — inače bi vlastita stavka mogla
     proći na jednom mjestu a otpasti na drugom. Prije je bilo prepisano na
     oba mjesta i pravilo se održavalo dvaput.

     Ako data.js nekim čudom nije učitan, ostaje prazan config: sve se vidi,
     ništa nije promijenjeno. */
  function podrazumijevano() {
    return (typeof defaultPrefs === "function")
      ? defaultPrefs()
      : { transkript: false, skriveno: [], izmjene: {}, stranice: 1, dodatno: [] };
  }

  function ocisti(raw) {
    return (typeof cleanPrefs === "function")
      ? cleanPrefs(raw)
      : podrazumijevano();
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

     Fina podjela je unutra: kvačica po stavci. Da je sekcija djelimična vidi
     se po brojci (4 / 6, zlatna) — prekidač o tome ne govori.

     U redu stavke stoje i dvije alatke, DESNO od labele a ne u njoj: polje za
     broj ponavljanja (stavka iz data.js) i olovka (vlastita stavka). Labela
     je samo oko kvačice i teksta — da klik po polju za broj ne znači
     „sakrij ovu dovu“.

     Na dnu svakog spiska je „Dodaj svoju stavku“. Forma se otvara TU, unutar
     akordeona, a ne kao novi drawer: drawer preko drawera na telefonu nema
     gdje stati, a ovako se odmah vidi u koju sekciju stavka ide.

     Kur'anska sekcija nema šta da rasklopi: ona je jedna stavka, pa dobija
     obični red sa prekidačem. Vlastita stavka u nju ne može (nema `items`),
     pa nema ni „Dodaj“.

     Ostalo stoji sklopljeno jer je predugo da bi stajalo otvoreno: sama
     sekcija „Dove“ ima 34 reda, a u postavke se najčešće ulazi zbog imena i
     podsjetnika.
     ------------------------------------------------------------------------ */

  /* Iscrtani akordeoni — po njima `osvjeziStavke()` vraća kvačice u stanje
     koje je stiglo sa servera. */
  var akordeoni = [];

  /* Koja je sekcija rasklopljena. Pamti se izvan DOM-a jer se spisak ponovo
     crta kad se vlastita stavka doda ili obriše — bez ovoga bi se akordeon
     zatvorio pod prstom, tačno u trenutku kad se u njemu radi. */
  var otvorene = {};

  /* Potpis sadržaja iscrtanog spiska (vidi `strukturaSada()`). Kvačice se
     osvježe u zatečenim čvorovima, ali izmijenjen naslov ili dodana stavka
     mijenjaju ono što u redu PIŠE — tada se spisak crta iznova. */
  var strukturaPotpis = null;

  /* Otvorena forma (`{ sekcija, id }`) i zastavica da se struktura u
     međuvremenu promijenila. Config sa servera može stići dok se forma
     popunjava; crtati ispod ruke bi obrisalo napola upisanu dovu, pa se
     čeka da se forma zatvori. */
  var forma = null;
  var trebaCrtanje = false;

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

  /* --- red stavke: isti za SVAKU stavku ------------------------------------ */
  /* Nema više dvije vrste reda. Stavka iz data.js i vlastita stavka izgledaju
     i rade isto: kvačica, naslov, detalj, oznaka (broj ponavljanja ili broj
     stranica) i olovka. Sve što se na stavci može promijeniti — uključujući
     brisanje — je iza te olovke, pa se ne mora pamtiti šta gdje stoji.

     Prije je stavka iz data.js imala polje za broj pravo u redu, a vlastita
     olovku. Redovi su tako izgledali kao dvije različite stvari iako su na
     ekranu jedna do druge, a broj se ni na jednoj dovi nije mogao ni vidjeti
     ni promijeniti. */

  /* Detalj ispod naslova — po njemu se stavka prepoznaje.

     Dova: početak prevoda, jer joj je naslov samo broj ("DOVA #7") pa se po
     njemu ne zna koja je. Sve ostalo: izvor, ako ga ima. */
  function opisStavke(item) {
    /* Kur'anska stavka nema detalj: sve što se o njoj ima reći stoji u
       oznaci desno ("4 stranice"), a rečenica ispod naslova bi bila prazan
       opis onoga što naslov već kaže. */
    if (item.type === "quran") { return ""; }

    if (item.type !== "dua") {
      return item.source ? String(item.source) : "";
    }

    var text = String(item.translation || item.transliteration || "").trim();
    if (!text) { return ""; }
    if (text.length <= 78) { return text; }
    /* Rez na zadnjoj cijeloj riječi — presječena riječ izgleda kao greška. */
    return text.slice(0, 78).replace(/[\s.,;:!?]+\S*$/, "") + "…";
  }

  /* Oznaka u desnom rubu reda: ono što je na stavci brojivo. Prazna za dovu
     i suru — tamo nema šta brojati, pa se ne izmišlja oznaka da bi svi redovi
     imali po jednu. */
  function oznakaStavke(item) {
    if (item.type === "quran") { return stranicaRijec(config.stranice || 1); }
    if (item.type === "count" && item.repetitions > 1) {
      return item.repetitions + "×";
    }
    return "";
  }

  /* "1 stranica", "3 stranice", "7 stranica" — bosanska množina. Sitnica, ali
     oznaka stoji u redu koji se gleda svaki put. */
  function stranicaRijec(n) {
    var zadnja = n % 10;
    var dvije = n % 100;
    if (zadnja === 1 && dvije !== 11) { return n + " stranica"; }
    if (zadnja >= 2 && zadnja <= 4 && (dvije < 12 || dvije > 14)) {
      return n + " stranice";
    }
    return n + " stranica";
  }

  /* Je li korisnik ovu stavku dirao — vlastita je, ili ima izmjene. Po tome
     oznaka dobija zlatnu, isto kao djelimična sekcija: iz spiska od 34 reda
     se odmah vidi šta je promijenjeno. */
  function dirnuta(item) {
    if (item.custom) { return true; }
    if (item.type === "quran") { return (config.stranice || 1) !== 1; }
    return !!config.izmjene[item.id];
  }

  function svgPutanje(className, putanje, sirina) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", sirina || "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    putanje.forEach(function (d) {
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  function dugmeIzmjena(section, item, naslov) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "set-edit";
    btn.title = "Uredi";
    btn.setAttribute("aria-label", "Uredi „" + naslov + "“");
    btn.appendChild(svgPutanje("set-edit-icon", [
      "M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z",
      "M13.5 6.5l4 4"
    ]));
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      otvoriFormu(section, item.id);
    });
    return btn;
  }

  function redStavke(section, item, naslov) {
    var row = document.createElement("div");
    row.className = "set-pick";

    /* <label>, ne <div> sa handlerom: klik po kvačici i tekstu prebacuje
       kvačicu sam od sebe, i taj dio reda dolazi pod čitač ekrana kao jedna
       kontrola sa svojim imenom. Olovka ostaje IZVAN labele — klik po njoj ne
       smije značiti "sakrij ovu dovu". */
    var main = document.createElement("label");
    main.className = "set-pick-main";

    var input = document.createElement("input");
    input.type = "checkbox";
    input.className = "check";
    input.checked = !jeSkriveno(item.id);

    var text = document.createElement("span");
    text.className = "set-pick-text";

    var label = document.createElement("span");
    label.className = "set-pick-title";
    label.textContent = naslov;
    text.appendChild(label);

    var opis = opisStavke(item);
    if (opis) {
      var note = document.createElement("span");
      note.className = "set-pick-note";
      note.textContent = opis;
      text.appendChild(note);
    }

    main.appendChild(input);
    main.appendChild(text);
    row.appendChild(main);

    input.addEventListener("change", function () {
      if (postaviPrikaz(item.id, input.checked)) { primiPrikaz(); }
    });

    var tools = document.createElement("span");
    tools.className = "set-pick-tools";

    var oznaka = oznakaStavke(item);
    if (oznaka) {
      var chip = document.createElement("span");
      chip.className = "set-pick-meta" + (dirnuta(item) ? " is-custom" : "");
      chip.textContent = oznaka;
      tools.appendChild(chip);
    } else if (dirnuta(item)) {
      /* Izmijenjena dova nema šta brojati, pa umjesto oznake dobija tačku —
         inače se iz spiska ne bi vidjelo da je dirana. */
      var dot = document.createElement("span");
      dot.className = "set-pick-dot";
      dot.title = "Izmijenjeno";
      dot.setAttribute("aria-label", "Izmijenjeno");
      tools.appendChild(dot);
    }

    tools.appendChild(dugmeIzmjena(section, item, naslov));
    row.appendChild(tools);

    return { node: row, input: input };
  }

  /* --- akordeon jedne sekcije ---------------------------------------------- */

  function akordeon(section) {
    var titles = (typeof itemTitles === "function")
      ? itemTitles(section.id, config) : {};
    var items = stavke(section);

    var box = document.createElement("div");
    box.className = "set-acc";

    var head = document.createElement("div");
    head.className = "set-acc-head";

    /* Prekidač sekcije. Stanje mu daje `osvjeziStavke()`, ne ovaj klik —
       ugašen znači "ni jedna stavka", pa paljenje vraća sve. */
    var sw = prekidac("sek-" + section.id);
    sw.input.setAttribute("aria-label", "Prikaži „" + section.title + "“");
    sw.input.addEventListener("change", function () {
      postaviSve(items, sw.input.checked);
    });

    var body = document.createElement("div");
    body.className = "set-acc-body";
    body.id = "acc-" + section.id;

    var open = otvorene[section.id] === true;
    body.hidden = !open;

    /* Naslov je dugme, prekidač je checkbox — dvije kontrole, pa ne mogu biti
       jedan element. Checkbox u <button> nije dopušten, a klik po traci koji
       bi i otvarao spisak bio bi dvije radnje na jedan dodir. */
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "set-acc-toggle";
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
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

    box.classList.toggle("is-open", open);

    toggle.addEventListener("click", function () {
      var otvori = body.hidden;
      otvorene[section.id] = otvori;
      body.hidden = !otvori;
      toggle.setAttribute("aria-expanded", otvori ? "true" : "false");
      box.classList.toggle("is-open", otvori);
    });

    head.appendChild(toggle);
    head.appendChild(sw.wrap);

    var inputs = {};

    items.forEach(function (item) {
      var red = redStavke(section, item, titles[item.id] || item.title);
      inputs[item.id] = red.input;
      body.appendChild(red.node);
    });

    /* Podnožje spiska: dugme „Dodaj svoju stavku“, a kad se ono pritisne —
       forma na njegovom mjestu.

       Kur'anska sekcija ga nema: ona nije lista nego jedna stavka (nema
       `items`, vidi `sectionItems()` u data.js), pa se u nju nema gdje
       dopisati. Sve ostalo na njoj je isto — akordeon, red, olovka. */
    var foot = null;
    if (section.kind !== "quran") {
      foot = document.createElement("div");
      foot.className = "set-acc-foot";
      body.appendChild(foot);
    }

    box.appendChild(head);
    box.appendChild(body);

    var acc = {
      id: section.id, node: box, items: items, inputs: inputs,
      count: count, sw: sw.input, foot: foot, section: section
    };

    nacrtajPodnozje(acc);
    return acc;
  }

  /* --- vlastite stavke ----------------------------------------------------- */

  /* Zapis vlastite stavke iz configa (ono što se pamti), za razliku od
     stavke koju vrati data.js (ono što se crta). */
  function dodatnaPoId(id) {
    var found = null;
    (config.dodatno || []).forEach(function (c) { if (c.id === id) { found = c; } });
    return found;
  }

  /* Id se pravi ovdje jer se stavka ovdje i pravi. Oblik mora proći
     `CUSTOM_ITEM_ID` iz data.js (`custom-` + 4–32 malih slova i cifara) —
     server po tom obliku pušta kvačicu na vlastitoj stavci u bazu. */
  function novaId() {
    var r = "";
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        var buf = new Uint32Array(2);
        window.crypto.getRandomValues(buf);
        r = buf[0].toString(36) + buf[1].toString(36);
      }
    } catch (e) { r = ""; }
    if (!r) { r = Date.now().toString(36) + Math.random().toString(36).slice(2); }
    return "custom-" + r.replace(/[^a-z0-9]/g, "").slice(0, 24);
  }

  function nacrtajPodnozje(acc) {
    if (!acc.foot) { return; }
    acc.foot.textContent = "";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "set-add";
    btn.appendChild(svgPutanje("set-add-icon", ["M12 5v14", "M5 12h14"], "1.8"));
    btn.appendChild(document.createTextNode("Dodaj svoju stavku"));
    btn.addEventListener("click", function () { otvoriFormu(acc.section, null); });

    acc.foot.appendChild(btn);
  }

  function akordeonPoId(id) {
    var found = null;
    akordeoni.forEach(function (acc) { if (acc.id === id) { found = acc; } });
    return found;
  }

  function stavkaPoId(section, id) {
    var found = null;
    stavke(section).forEach(function (item) { if (item.id === id) { found = item; } });
    return found;
  }

  /* Zatvaranje vraća podnožje na dugme. Ako je struktura u međuvremenu
     stigla sa servera, tek sada se spisak crta iznova — vidi `forma`. */
  function zatvoriFormu() {
    if (!forma) { return; }
    var acc = akordeonPoId(forma.sekcija);
    var mjesto = forma.mjesto;
    forma = null;

    if (mjesto === "red" && acc) {
      /* Forma je bila umjesto reda — spisak se mora vratiti u red. */
      nacrtajAkordeone();
      return;
    }
    if (acc) { nacrtajPodnozje(acc); }
    if (trebaCrtanje) { trebaCrtanje = false; nacrtajAkordeone(); }
  }

  /* `id` null = nova stavka (forma ide u podnožje), inače izmjena postojeće
     (forma ide na mjesto tog reda, da se vidi šta se mijenja). */
  function otvoriFormu(section, id) {
    zatvoriFormu();

    var acc = akordeonPoId(section.id);
    if (!acc) { return; }

    /* Sekcija mora biti rasklopljena da bi se forma vidjela. Olovka se može
       pritisnuti samo u otvorenom spisku, ali „Dodaj“ ne mora. */
    otvorene[section.id] = true;
    var body = acc.node.querySelector(".set-acc-body");
    if (body && body.hidden) {
      body.hidden = false;
      acc.node.classList.add("is-open");
      var t = acc.node.querySelector(".set-acc-toggle");
      if (t) { t.setAttribute("aria-expanded", "true"); }
    }

    if (!id) {
      if (!acc.foot) { return; }
      forma = { sekcija: section.id, id: null, mjesto: "podnozje" };
      acc.foot.textContent = "";
      acc.foot.appendChild(formaStavke(section, null));
      acc.foot.querySelector(".set-new").scrollIntoView({ block: "nearest" });
      return;
    }

    var item = stavkaPoId(section, id);
    var red = acc.inputs[id] ? acc.inputs[id].closest(".set-pick") : null;
    if (!item || !red) { return; }

    forma = { sekcija: section.id, id: id, mjesto: "red" };
    var box = formaStavke(section, item);
    red.parentNode.replaceChild(box, red);
    box.scrollIntoView({ block: "nearest" });
  }

  /* --- forma ---------------------------------------------------------------- */

  /* Tri oblika VLASTITE stavke. Bira se samo pri pravljenju: tip je svojstvo
     stavke, a ne postavka — mijenjanje tipa postojeće stavke bi od Fatihe
     napravilo brojani zikr, a od izbrojanog salavata dovu bez teksta. Ko se
     predomisli, obriše je i napravi ponovo. */
  var TIPOVI = [
    { id: "broj",   label: "Zikr sa brojem" },
    { id: "dova",   label: "Dova" },
    { id: "prosto", label: "Stavka" }
  ];

  /* Polja koja forma pokazuje, po tipu stavke. `kljuc` je ime polja u
     `data.js` odnosno u configu — po njemu se i puni i sprema, pa se spisak
     polja vodi na jednom mjestu. */
  function poljaZaTip(type) {
    if (type === "quran") { return ["stranice"]; }
    if (type === "dua") { return ["arabic", "transliteration", "translation", "source"]; }
    if (type === "surah") { return ["title", "source"]; }
    return ["title", "repetitions"];
  }

  var NASLOVI_POLJA = {
    title: "Naslov",
    repetitions: "Broj ponavljanja",
    arabic: "Arapski",
    transliteration: "Transkripcija",
    translation: "Prevod",
    source: "Izvor",
    stranice: "Stranica dnevno"
  };

  /* Vrijednost polja u data.js, bez ijedne korisnikove izmjene. Iz nje se
     puni placeholder i s njom se poredi ono što je upisano — pamti se samo
     ono što se stvarno razlikuje.

     Arapski zna biti niz pasusa; u polju je jedan tekst, pa se spaja praznim
     redom i tako se i poredi. */
  function osnovnaVrijednost(id, kljuc) {
    var osnovna = (typeof baseItem === "function") ? baseItem(id) : null;
    var v = osnovna ? osnovna[kljuc] : "";
    if (Array.isArray(v)) { return v.join("\n\n"); }
    if (typeof v === "number") { return String(v); }
    return typeof v === "string" ? v : "";
  }

  function poljeForme(kljuc, kontrola) {
    var wrap = document.createElement("label");
    wrap.className = "set-new-field";
    wrap.dataset.kljuc = kljuc;

    var lab = document.createElement("span");
    lab.className = "set-new-label";
    lab.textContent = NASLOVI_POLJA[kljuc] || kljuc;

    wrap.appendChild(lab);
    wrap.appendChild(kontrola);
    return wrap;
  }

  function unos(kljuc) {
    var input = document.createElement("input");
    input.type = "text";
    input.className = "set-input";
    input.setAttribute("maxlength", kljuc === "source" ? "120" : "80");
    return input;
  }

  function tekstualno(kljuc) {
    var ta = document.createElement("textarea");
    var ar = kljuc === "arabic";
    ta.className = "set-input set-area" + (ar ? " set-area-ar" : "");
    ta.rows = ar ? 3 : 2;
    ta.setAttribute("maxlength", "2000");
    if (ar) {
      ta.setAttribute("dir", "rtl");
      ta.setAttribute("lang", "ar");
    }
    return ta;
  }

  /* Broj se ne kuca nego povlači: klizač plus kutija sa brojem uz njega.

     Oboje, a ne samo klizač: klizačem se do tačno 33 na telefonu ne stiže iz
     prve, a kutija sama nije govorila koliko je to u odnosu na uobičajeno.
     Ovako se gruba vrijednost povuče, a tačna dokuca.

     Gornja granica klizača je 100 — iznad toga zikr prestaje biti dnevni, a
     duži klizač bi svaki korak učinio nepogodnim. Kutija svejedno prima i
     više (do 999), pa se već upisana veća vrijednost ne kljaštri: klizaču se
     tada granica podigne na nju. */
  function brojKlizac(min, max, vrijednost) {
    var wrap = document.createElement("div");
    wrap.className = "set-slide";

    var gornja = Math.max(max, vrijednost || 0);

    var range = document.createElement("input");
    range.type = "range";
    range.className = "set-slide-range";
    range.min = String(min);
    range.max = String(gornja);
    range.step = "1";
    range.value = String(vrijednost || min);
    range.setAttribute("aria-hidden", "true");
    /* Klizač je slika i prečica; ime i fokus nosi kutija pored njega, da
       čitač ekrana ne pročita istu vrijednost dvaput. */
    range.tabIndex = -1;

    var num = document.createElement("input");
    num.type = "number";
    num.className = "set-input set-slide-num";
    num.min = String(min);
    num.max = "999";
    num.step = "1";
    num.inputMode = "numeric";
    num.value = String(vrijednost || min);

    /* Oba pišu jedno drugom. `input`, ne `change`: brojka mora pratiti prst
       dok se klizač vuče, inače se ne zna gdje si stao. */
    range.addEventListener("input", function () {
      num.value = range.value;
    });

    num.addEventListener("input", function () {
      var n = parseInt(num.value, 10);
      if (!isFinite(n)) { return; }
      if (n > Number(range.max)) { range.max = String(n); }
      range.value = String(n);
    });

    wrap.appendChild(range);
    wrap.appendChild(num);

    return { node: wrap, input: num };
  }

  /* Vraća `{ node, input }`: `node` ide u formu, a `input` je ono čiju
     vrijednost forma čita. Kod klizača to nije isti element. */
  function kontrolaZa(kljuc, vrijednost) {
    if (kljuc === "repetitions") { return brojKlizac(1, 100, vrijednost); }
    if (kljuc === "stranice") { return brojKlizac(1, 20, vrijednost); }
    var input = (kljuc === "title" || kljuc === "source")
      ? unos(kljuc)
      : tekstualno(kljuc);
    return { node: input, input: input };
  }

  /* JEDNA forma za sve: novu stavku, vlastitu stavku i stavku iz data.js.
     Razlike su tri i sve su male — tipovi se biraju samo pri pravljenju,
     placeholder pokazuje zatečenu vrijednost samo kod stavke iz data.js, i
     dugme „Vrati na zadano“ postoji samo dok ima šta vratiti. */
  function formaStavke(section, item) {
    var novo = !item;
    var custom = !!(item && item.custom);
    var zapis = custom ? dodatnaPoId(item.id) : null;
    var id = item ? item.id : null;
    var type = item ? item.type : "count";

    var box = document.createElement("div");
    box.className = "set-new";

    var naslovForme = novo
      ? "Nova stavka — " + section.title
      : "Uredi";
    box.appendChild(p("set-new-head", naslovForme));

    /* --- tip (samo za novu stavku) --- */
    var tip = "broj";
    var dugmad = {};

    if (novo) {
      var tabs = document.createElement("div");
      tabs.className = "set-new-tabs";
      tabs.setAttribute("role", "group");
      tabs.setAttribute("aria-label", "Tip stavke");

      TIPOVI.forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "set-new-tab";
        b.textContent = t.label;
        b.addEventListener("click", function () { tip = t.id; primijeniTip(); });
        dugmad[t.id] = b;
        tabs.appendChild(b);
      });
      box.appendChild(tabs);
    }

    /* --- polja --- */
    var polja = {};
    var okvir = document.createElement("div");
    okvir.className = "set-new-fields";
    box.appendChild(okvir);

    /* Šta stoji u polju kad se forma otvori.

       Stavka koja već postoji dolazi POPUNJENA svojim pravim sadržajem — i
       ona iz data.js. Prije je zatečena vrijednost bila samo placeholder, pa
       se dova nije mogla popraviti nego samo prepisati iz početka; sad se
       otvori ono što stvarno piše na kartici i mijenja se u mjestu.

       Za stavku iz data.js to znači "izmjena ako je ima, inače zatečeno" —
       a `spremiOsnovnu()` poslije poredi sa zatečenim i pamti samo razliku,
       pa netaknuto polje i dalje prati data.js. */
    function pocetnaVrijednost(kljuc) {
      if (kljuc === "stranice") { return String(config.stranice || 1); }
      if (novo) { return kljuc === "repetitions" ? "33" : ""; }

      if (custom) {
        var v = zapis ? zapis[kljuc] : "";
        if (kljuc === "repetitions") { return v ? String(v) : "1"; }
        return v || "";
      }

      var izmjena = config.izmjene[id] || {};
      if (Object.prototype.hasOwnProperty.call(izmjena, kljuc)) {
        return String(izmjena[kljuc]);
      }
      return osnovnaVrijednost(id, kljuc) || (kljuc === "repetitions" ? "1" : "");
    }

    function nacrtajPolja(kljucevi) {
      okvir.textContent = "";
      polja = {};
      kljucevi.forEach(function (kljuc) {
        var pocetna = pocetnaVrijednost(kljuc);
        var kontrola = kontrolaZa(
          kljuc,
          (kljuc === "repetitions" || kljuc === "stranice")
            ? (parseInt(pocetna, 10) || 1)
            : 0
        );

        polja[kljuc] = kontrola.input;
        if (kljuc !== "repetitions" && kljuc !== "stranice") {
          kontrola.input.value = pocetna;
        }

        okvir.appendChild(poljeForme(kljuc, kontrola.node));
      });
    }

    var greska = p("set-new-error", "");
    greska.hidden = true;
    box.appendChild(greska);

    /* Napomena zašto stavka iz data.js nema pravo brisanje. */
    var napomena = p("set-new-note", "");
    napomena.hidden = true;
    box.appendChild(napomena);

    /* --- dugmad --- */
    /* Dvije grupe, a ne jedan red: lijevo ono što stavku vraća ili briše,
       desno odustajanje i spremanje. Kad ih na uskom ekranu ima četiri, desna
       grupa se prelomi ispod cijela — bez toga se „Vrati na zadano“ lomi na
       dva reda i red dugmadi se raspadne. */
    var akcije = document.createElement("div");
    akcije.className = "set-new-actions";

    var lijevo = document.createElement("div");
    lijevo.className = "set-new-group";

    var desno = document.createElement("div");
    desno.className = "set-new-group";

    if (!novo) {
      var obrisi = document.createElement("button");
      obrisi.type = "button";
      obrisi.className = "set-new-btn is-danger";
      obrisi.textContent = "Obriši";
      obrisi.addEventListener("click", obrisiStavku);
      lijevo.appendChild(obrisi);

      if (!custom && config.izmjene[id]) {
        var vrati = document.createElement("button");
        vrati.type = "button";
        vrati.className = "set-new-btn is-quiet";
        vrati.textContent = "Vrati na zadano";
        vrati.addEventListener("click", function () {
          delete config.izmjene[id];
          spremiPromjenu();
        });
        lijevo.appendChild(vrati);
      }

      if (!custom) {
        napomena.textContent = "Stavka iz aplikacije se briše sa tvog spiska — " +
          "kvačica pored nje je vraća.";
        napomena.hidden = false;
      }
    }

    var odustani = document.createElement("button");
    odustani.type = "button";
    odustani.className = "set-new-btn";
    odustani.textContent = "Odustani";
    odustani.addEventListener("click", zatvoriFormu);
    desno.appendChild(odustani);

    var sacuvaj = document.createElement("button");
    sacuvaj.type = "button";
    sacuvaj.className = "set-new-btn is-primary";
    sacuvaj.textContent = "Sačuvaj";
    sacuvaj.addEventListener("click", spremi);
    desno.appendChild(sacuvaj);

    akcije.appendChild(lijevo);
    akcije.appendChild(desno);
    box.appendChild(akcije);

    function primijeniTip() {
      TIPOVI.forEach(function (t) {
        dugmad[t.id].classList.toggle("is-on", t.id === tip);
        dugmad[t.id].setAttribute("aria-pressed", t.id === tip ? "true" : "false");
      });
      nacrtajPolja(
        tip === "dova" ? poljaZaTip("dua")
          : tip === "broj" ? ["title", "repetitions"]
            : ["title"]
      );
      greska.hidden = true;
    }

    function pisiGresku(text) {
      greska.textContent = text;
      greska.hidden = false;
    }

    /* Broj iz polja: 0 znači "prazno". */
    function broj(kljuc) {
      var raw = polja[kljuc] ? polja[kljuc].value : "";
      var n = parseInt(raw, 10);
      return (isFinite(n) && n > 0) ? n : 0;
    }

    function tekst(kljuc) {
      return polja[kljuc] ? polja[kljuc].value.trim() : "";
    }

    /* --- spremanje --- */

    function spremiNovu() {
      var entry = { id: novaId(), sekcija: section.id };

      if (tip === "dova") {
        entry.type = "dua";
        entry.arabic = tekst("arabic");
        entry.transliteration = tekst("transliteration");
        entry.translation = tekst("translation");
        entry.source = tekst("source");
        if (!entry.arabic && !entry.transliteration && !entry.translation) {
          pisiGresku("Upiši bar arapski tekst, transkripciju ili prevod.");
          return false;
        }
      } else {
        entry.type = "count";
        entry.title = tekst("title");
        if (!entry.title) { pisiGresku("Upiši naslov."); return false; }
        if (tip === "broj") {
          var n = broj("repetitions");
          if (n < 2) { pisiGresku("Broj ponavljanja mora biti bar 2."); return false; }
          entry.repetitions = Math.min(n, 999);
        }
      }

      config.dodatno.push(entry);
      return true;
    }

    function spremiVlastitu() {
      var entry = { id: id, sekcija: section.id, type: zapis ? zapis.type : "count" };

      if (entry.type === "dua") {
        entry.arabic = tekst("arabic");
        entry.transliteration = tekst("transliteration");
        entry.translation = tekst("translation");
        entry.source = tekst("source");
        if (!entry.arabic && !entry.transliteration && !entry.translation) {
          pisiGresku("Upiši bar arapski tekst, transkripciju ili prevod.");
          return false;
        }
      } else {
        entry.title = tekst("title");
        if (!entry.title) { pisiGresku("Upiši naslov."); return false; }
        var n = broj("repetitions");
        if (n > 1) { entry.repetitions = Math.min(n, 999); }
      }

      config.dodatno = config.dodatno.map(function (c) {
        return c.id === id ? entry : c;
      });
      return true;
    }

    /* Stavka iz data.js: pamti se SAMO ono što se razlikuje od zatečenog.
       Bez toga bi ispravka prevoda u data.js zauvijek ostala nevidljiva
       svakome ko je toj dovi jednom promijenio makar broj ponavljanja.

       Polje se otvara popunjeno, pa isprazniti ga znači "obriši mi ovaj dio"
       (npr. izvor) i to se pamti kao prazan string. Put nazad na zatečeno je
       dugme „Vrati na zadano“, a ne prazno polje. */
    function spremiOsnovnu() {
      var izmjena = {};

      if (polja.title && !tekst("title")) {
        pisiGresku("Naslov ne može biti prazan.");
        return false;
      }

      Object.keys(polja).forEach(function (kljuc) {
        if (kljuc === "repetitions" || kljuc === "stranice") { return; }
        var v = tekst(kljuc);
        if (v !== osnovnaVrijednost(id, kljuc)) { izmjena[kljuc] = v; }
      });

      if (polja.repetitions) {
        /* Klizač je uvijek na nekom broju; 1 znači "bez brojača". Zatečena
           stavka bez `repetitions` je isto to, pa se porede kao jednaki. */
        var n = broj("repetitions") || 1;
        var osnovni = parseInt(osnovnaVrijednost(id, "repetitions"), 10) || 1;
        if (n !== osnovni) { izmjena.repetitions = Math.min(n, 999); }
      }

      if (Object.keys(izmjena).length) { config.izmjene[id] = izmjena; }
      else { delete config.izmjene[id]; }

      return true;
    }

    function spremiQuran() {
      var n = broj("stranice");
      if (!n) { n = 1; }
      config.stranice = Math.min(n, 20);
      return true;
    }

    function spremi() {
      var ok;
      if (novo) { ok = spremiNovu(); }
      else if (type === "quran") { ok = spremiQuran(); }
      else if (custom) { ok = spremiVlastitu(); }
      else { ok = spremiOsnovnu(); }

      if (ok) { spremiPromjenu(); }
    }

    function obrisiStavku() {
      if (custom) {
        config.dodatno = config.dodatno.filter(function (c) { return c.id !== id; });
      } else {
        /* Stavka iz data.js se ne može obrisati zauvijek — skida se sa
           spiska, isto što radi i kvačica pored nje. Izmjene odlaze s njom:
           kad je korisnik jednom vrati, vraća se zatečena, a ne ono što je
           nekad promijenio pa obrisao. */
        delete config.izmjene[id];
        postaviPrikaz(id, false);
      }
      spremiPromjenu();
    }

    if (novo) { primijeniTip(); }
    else { nacrtajPolja(poljaZaTip(type)); }

    /* Kursor u prvo polje za TEKST. Kutija uz klizač se namjerno preskače:
       na telefonu bi otvorila brojčanu tastaturu preko pola forme, a broj se
       ionako najčešće povuče klizačem. */
    setTimeout(function () {
      var prvo = box.querySelector('input[type="text"].set-input, textarea.set-input');
      if (prvo) { prvo.focus(); }
    }, 0);

    return box;
  }

  /* Zajednički kraj za spremanje i brisanje: očisti (isto sito kroz koje
     prolazi i server), zapamti, zatvori formu, iscrtaj spisak, javi ekranu i
     pošalji ODMAH — izmjena stavke nije kvačica koja može čekati svoj krug. */
  function spremiPromjenu() {
    config = ocisti(config);
    zapamtiConfig();
    forma = null;
    trebaCrtanje = false;
    nacrtajAkordeone();
    javi();
    posalji(true);
  }

  /* --- crtanje i osvježavanje spiska --------------------------------------- */

  /* Potpis onoga što je UPISANO u redove spiska: vlastite stavke (kojih ima
     i koje su), izmjene (naslov i detalj u redu) i broj stranica (oznaka u
     kur'anskom redu). Kvačice nisu tu — njih `primijeniStanje()` mijenja u
     zatečenim čvorovima, bez ponovnog crtanja.

     Bez `izmjene` i `stranice` bi promjena sa drugog uređaja stigla na ekran
     ali ne i u postavke: red bi i dalje pisao stari naslov i stari broj. */
  function strukturaSada() {
    return JSON.stringify([
      config.dodatno || [], config.izmjene || {}, config.stranice || 1
    ]);
  }

  function nacrtajAkordeone() {
    if (!el.picks) { return; }
    strukturaPotpis = strukturaSada();
    el.picks.textContent = "";
    akordeoni = birljive().map(function (section) {
      var acc = akordeon(section);
      el.picks.appendChild(acc.node);
      return acc;
    });
    primijeniStanje();
  }

  /* Kvačice, brojka i prekidač sekcije u stanje iz `config`. Zove se i poslije
     odgovora sa servera, jer config može doći sa drugog uređaja.

     Dodana ili obrisana vlastita stavka mijenja SASTAV spiska, pa se tada
     crta iznova. Osim dok je forma otvorena — tada bi crtanje obrisalo
     napola upisanu dovu, pa se čeka da se forma zatvori. */
  function osvjeziStavke() {
    if (!el.picks) { return; }

    if (strukturaSada() !== strukturaPotpis) {
      if (forma) { trebaCrtanje = true; }
      else { nacrtajAkordeone(); return; }
    }

    primijeniStanje();
  }

  /* Ovdje je jedino mjesto gdje se piše stanje prekidača sekcije — on ga ne
     pamti nego ga uvijek dobije iz kvačica. */
  function primijeniStanje() {
    akordeoni.forEach(function (acc) {
      var gore = 0;

      acc.items.forEach(function (item) {
        var on = !jeSkriveno(item.id);
        if (on) { gore += 1; }
        /* Red kojeg je zamijenila otvorena forma nema svoju kvačicu. */
        var input = acc.inputs[item.id];
        if (input && input.checked !== on) { input.checked = on; }
      });

      var sve = acc.items.length;
      if (acc.count) { acc.count.textContent = gore + " / " + sve; }

      /* Prekidač ima samo dva položaja: ugašen znači "ni jedna stavka". Kad je
         djelimično, ostaje upaljen — da je nešto isključeno kaže brojka, a ne
         prekidač. Prazna sekcija (nema nijedne stavke) ga nema čime upaliti. */
      acc.sw.checked = gore > 0;
      acc.sw.disabled = sve === 0;

      /* Stanja i za oko: puna sekcija je obična, djelimična nosi zlatnu
         brojku, a prazna je cijela prigušena — ta se uopšte ne pojavljuje na
         spisku, pa se to mora vidjeti i odavde. */
      acc.node.classList.toggle("is-full", sve > 0 && gore === sve);
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
       podsjetnici ostaju odmah pod rukom; spiskovi su ionako sklopljeni.

       Akordeoni idu u svoj kontejner, a ne pravo u tijelo drawer-a: spisak se
       crta iznova kad se vlastita stavka doda ili obriše, pa mora postojati
       mjesto koje se smije isprazniti bez diranja ostatka postavki. */
    var pickHead = document.createElement("div");
    pickHead.className = "set-group-head";
    pickHead.appendChild(p("set-label", "Prikaz"));
    pickHead.appendChild(p("set-note",
      "Odaberi šta se prikazuje, promijeni broj ponavljanja ili dodaj svoje."));
    body.appendChild(pickHead);

    el.picks = document.createElement("div");
    el.picks.className = "set-picks";
    body.appendChild(el.picks);

    sheet.appendChild(head);
    sheet.appendChild(body);
    el.drawer.appendChild(sheet);

    el.drawer.addEventListener("click", function (e) {
      if (e.target === el.drawer) { zatvori(); }
    });

    document.body.appendChild(el.drawer);

    nacrtajAkordeone();
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
    /* Napola popunjena forma se ne pamti — zatvaranje je odustajanje. Bez
       ovoga bi ostala otvorena do sljedećeg otvaranja postavki i blokirala
       ponovno crtanje spiska (vidi `trebaCrtanje`). */
    zatvoriFormu();
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
    if (e.key !== "Escape" || !otvoren) { return; }
    /* Escape zatvara ono što je najuže: prvo formu, tek onda cijeli drawer. */
    if (forma) { zatvoriFormu(); return; }
    zatvori();
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
    /* Povuci config sa servera. Zove ga povlačenje prsta nadole (script.js):
       drugi uređaj je mogao dodati dovu ili promijeniti broj, a to se inače
       vidi tek pri sljedećem otvaranju aplikacije. */
    osvjezi: function () {
      return povuci().then(function (known) {
        osvjeziPrekidace();
        return known;
      });
    },
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
