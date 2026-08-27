/* ==========================================================================
   settings.js — config korisnika i drawer u kojem se podešava.

   Osam stvari:

     ime           određuje ČIJI je spisak. Svi uređaji sa istim imenom vide
                   isto čekirano; dva imena su dva odvojena spiska. Ime nije
                   lozinka i ovdje se ne pravi utisak da jeste — ko upiše
                   tuđe ime, vidi tuđi spisak. Za porodičnu aplikaciju je to
                   dovoljno i namjerno tako: drugi telefon iste osobe se
                   prijavi istim imenom i odmah je uparen.

     tema          automatski (svijetla danju, tamna uveče) ili ručno
                   izabrana dnevna/noćna. Jedina postavka koja NE ide na
                   server — vidi ispod. Sam prelaz radi theme.js.

     transkripcija umjesto arapskog teksta prikazuje transliteraciju iz
                   data.js. ZAMJENA, ne dodatak — ispod je i dalje prevod.

     putovanje     kraći dnevni spisak za put. Prekidač NE nosi spisak — on
                   stoji u `PUTNI_SCOPE` u data.js i fiksan je, pa se dok je
                   uključen spisak ispod samo čita: kvačice, prekidači
                   sekcija, olovke, povlačenje i „Dodaj“ su ugašeni (vidi
                   `zakljucano()`). Zaključane su i skupine dova za stanja,
                   iako njihov sadržaj putovanje ne mijenja. Kvačice tada
                   pokazuju putni spisak, a ne `skriveno` — inače bi u
                   postavkama stajao jedan spisak a na ekranu drugi.

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
                   sa samo naslovom i kvačicom. U skupinama dova za stanja je
                   oblik samo jedan — dova sa naslovom — pa se tip tamo ni ne
                   bira (vidi `tipoviZa()`).

     redoslijed    red se povuče i spusti gdje treba. Poredak vrijedi svugdje
                   — na ekranu, u postavkama i u numeraciji dova — jer se
                   primjenjuje u data.js, kroz koji sve to prolazi.

   Redovi spiska su svi isti — vidi „Spisak stavki“ ispod.

   Prekidača za cijelu sekciju nema. Postojao je (petak), ali kvačice rade
   isto i na jednom mjestu: isključi svih pet petačkih stavki i sekcije nema,
   kao ni njenog podsjetnika. Zbog toga su `transkript` i `putovanje` jedina
   dva prekidača u configu — tema ima svoj, ali njeno stanje pamti theme.js.

   Spisak sekcija se NE nabraja ovdje — akordeoni se prave iz
   `pickableSections()` u data.js, pa nova sekcija sa spiskom sama dobije svoj.

   Spisak je razdvojen na dva dijela: dnevne sekcije i skupine dova za stanja
   (`kind: "stanje"` u data.js — one sa svoje strane, koju pravi situacije.js).
   Razdvojene su samo zaglavljem, jer se različito koriste; sve ostalo im je
   isto — ista kvačica, ista forma, isto brisanje, isto dodavanje svoje dove.

   Brisanje: vlastita stavka nestaje zauvijek, a stavka iz data.js se skida
   sa spiska (isto što radi i kvačica pored nje). Obrisati je zauvijek nije
   moguće — ona nije korisnikova, dolazi iz aplikacije — pa forma to i kaže
   umjesto da se pravi da jeste.

   Podsjetnici (zvono) su premješteni u ovaj drawer, ali ih i dalje vodi
   notifications.js — ovdje se samo pravi red u koji on ubaci svoje dugme.
   Zato drawer nastaje ODMAH pri učitavanju, a ne pri prvom otvaranju: kad
   notifications.js krene, njegov `notifyBtn` mora već postojati.

   Šta ide gore na server, a šta ostaje ovdje:

     server (cfg:<ime>)   sve osim teme — da drugi uređaj istog korisnika
                          zatekne isto stanje, i da scheduler zna šta se
                          uopšte broji (vlastita stavka ulazi u račun
                          podsjetnika kao i svaka druga)
     localStorage         ime i kopija svega toga, da aplikacija zna šta da
                          nacrta prije nego odgovor sa servera stigne, i da
                          radi bez mreže
     samo localStorage    tema, i to u ključu koji drži theme.js: ona je
                          stvar ekrana koji se drži u ruci, a ne spiska koji
                          se dijeli. Telefon u mraku i računar na poslu smiju
                          biti različiti.
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

  /* ------------------------------------------------------------------------
     Putovanje — zaključan spisak

     Dok je „Putovanje“ uključeno, dnevni spisak je fiksan i stoji u data.js
     (`PUTNI_SCOPE`), pa se u postavkama NE mijenja: kvačica, prekidač
     sekcije, olovka, povlačenje reda i „Dodaj svoju stavku“ su ugašeni. Sve
     to i dalje STOJI na ekranu, samo prigušeno — spisak se mora moći
     pročitati i sa puta, a ugašena kontrola kaže zašto se ne dira.

     Zaključane su i skupine dova za stanja, iako putovanje njihov sadržaj ne
     mijenja: dok je scope fiksan, ništa se ne prekraja.

     Kvačice tada NE pokazuju `skriveno` nego putni spisak — to je ono što se
     tih dana stvarno prikazuje. Da pokazuju `skriveno`, u postavkama bi
     stajao jedan spisak a na ekranu drugi.
     ------------------------------------------------------------------------ */
  function naPutuSad() {
    return (typeof naPutu === "function") ? naPutu(config) : config.putovanje === true;
  }

  /* Isto što i `naPutuSad()`. Stoji pod svojim imenom jer se čita na mjestima
     gdje pitanje nije „je li čovjek na putu“ nego „smije li se ovo dirati“. */
  function zakljucano() {
    return naPutuSad();
  }

  /* Putni spisak sekcije, ili null ako se ona na putu ne krati (Petak, skupine
     dova za stanja) — tada kvačice i dalje pokazuju `skriveno`. */
  function putniZa(sectionId) {
    if (!naPutuSad() || typeof putniScope !== "function") { return null; }
    return putniScope(sectionId);
  }

  /* Je li stavka na spisku koji se TOG dana prikazuje. Jedino mjesto koje zna
     da postoje dva izvora te odluke — putni spisak i `skriveno`. */
  function ukljucena(sectionId, itemId) {
    var putni = putniZa(sectionId);
    if (putni) { return putni.indexOf(itemId) !== -1; }
    return !jeSkriveno(itemId);
  }

  /* Znak putovanja na <html>, po kojem CSS oboji traku sa selamom i pokaže
     avion u zaglavlju (style.css, `[data-putovanje]`). Atribut, a ne klasa na
     <body>: tema stoji na istom elementu (`data-theme`), pa su dva stanja koja
     boje cijelu aplikaciju na jednom mjestu.

     Piše se OVDJE jer je putovanje polje configa, a config živi u ovom fajlu.
     Ne treba mu ni jedan slušalac: svaka promjena prolazi kroz `primijeniPut()`. */
  function primijeniPut() {
    var html = document.documentElement;
    if (!html) { return; }
    if (config.putovanje === true) { html.setAttribute("data-putovanje", "1"); }
    else { html.removeAttribute("data-putovanje"); }
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

  /* Koliko se ostavi iznad onoga do čega se skrola — taman da se vidi kako
     iznad ima još, a ne da element stoji zalijepljen za rub. */
  var SKROL_RUB = 10;

  function mirnijeAnimacije() {
    return !!(window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* Skrola tijelo drawer-a taman toliko da se `node` vidi CIJEL.

     Ne `scrollIntoView()`: ono skrola najbliži okvir koji se skrola — a to
     zna biti i stranica ispod drawer-a — i pomjeri i kad je element ionako
     na ekranu. Ovdje se pomak računa nad tijelom drawer-a, pa ako pomaka
     nema, ništa se ne dešava.

     Element viši od ekrana (rasklopljena sekcija od 34 reda) se poravna
     vrhom; dalje se ionako skrola rukom. */
  function skrolujDo(node) {
    if (!el.body || !node) { return; }

    /* Sadržaj se upravo promijenio — rasklopljen akordeon, umetnuta forma —
       pa se mjeri tek kad ga preglednik složi. */
    requestAnimationFrame(function () {
      var okvir = el.body.getBoundingClientRect();
      var meta = node.getBoundingClientRect();
      var vrh = meta.top - okvir.top;
      var dno = meta.bottom - okvir.top;
      var pomak = 0;

      if (dno > okvir.height - SKROL_RUB) {
        pomak = Math.min(dno - okvir.height + SKROL_RUB, vrh - SKROL_RUB);
      }
      /* Iznad ruba je uvijek jače od svega: element se prvo mora vidjeti od
         svog vrha, pa tek onda koliko ga stane. */
      if (vrh < SKROL_RUB) { pomak = vrh - SKROL_RUB; }
      if (Math.abs(pomak) < 2) { return; }

      var cilj = el.body.scrollTop + pomak;
      if (el.body.scrollTo) {
        el.body.scrollTo({
          top: cilj,
          behavior: mirnijeAnimacije() ? "auto" : "smooth"
        });
      } else {
        el.body.scrollTop = cilj;
      }
    });
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

  /* Red sa prekidačem. `ukljucen` je stanje u kojem red nastaje, `onChange`
     dobija novo. Šta se sa tim stanjem radi ne zna ovaj red: transkripcija
     ide u config i na server, tema u localStorage (theme.js). */
  function redPrekidac(id, naslov, opis, ukljucen, onChange) {
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
    sw.input.checked = ukljucen === true;

    sw.input.addEventListener("change", function () {
      onChange(sw.input.checked);
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
    /* Na putu je spisak fiksan. Kvačice su ugašene, pa se ovdje u praksi ne
       dolazi — ali zapis se ne dira ni preko tastature ni iz koda, jer bi se
       inače `skriveno` tiho mijenjalo pod zaključanim spiskom. */
    if (zakljucano()) { return false; }

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

    /* Dova za stanje ("ajet") ide istim putem kao "dua": naslov joj je
       kratak ("Ta-Ha, 25–26"), a izvor bi ispod njega samo ponovio to isto —
       početak prevoda kaže koja je dova. */
    if (item.type !== "dua" && item.type !== "ajet") {
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
    /* Na putu se stavka ne mijenja — dugme ostaje na svom mjestu, ugašeno, da
       se red ne prekraja svaki put kad se prekidač upali. */
    btn.disabled = zakljucano();
    return btn;
  }

  /* --- redoslijed: povlačenje reda ----------------------------------------- */
  /* Spisak sekcije nije više onaj iz data.js nego korisnikov: red se uhvati i
     spusti gdje treba. Zapis je `redoslijed` u configu (vidi
     `cleanRedoslijed()` u data.js), pa novi poredak vrijedi i na drugom
     uređaju, i na ekranu i u podsjetniku.

     Zašto svoje povlačenje, a ne `draggable="true"`: HTML5 drag&drop na dodir
     ne radi uopšte, a aplikacija je prije svega telefonska. Pointer događaji
     rade i mišem i prstom, kroz isti kod.

     Vuče se CIJELI red, ne samo hvatište. Tačke lijevo su tu da se vidi da se
     red može premjestiti; hvatanje za njih kreće odmah, a hvatanje bilo gdje
     drugdje po redu mora prvo pokazati namjeru — inače bi svaki dodir po
     spisku bio početak premještanja:

       hvatište     odmah, bez čekanja
       miš          čim se pređe 5px — kraći pokret je klik po kvačici
       prst         nakon 260ms držanja u mjestu; pomjeri li se prije toga,
                    to je skrol spiska i povlačenja nema

     Prst i skrol se inače ne mogu razdvojiti: `touch-action: none` po cijelom
     redu bi ubio skrolanje spiska od 34 reda, pa stoji samo na hvatištu.
     Ostatak reda skrol zaustavlja tek kad povlačenje počne, i to
     zaustavljanjem `touchmove`-a — u tom trenutku prst još stoji, pa
     preglednik skrol nije ni započeo.

     Redovi se dok traje povlačenje NE premještaju u DOM-u nego samo pomjeraju
     `transform`-om: mjerenja tada ostaju važeća od početka do kraja, animacija
     ide na GPU, a otvorena kvačica ili fokus ne odlete pod rukom. U DOM se
     upisuje tek na kraju, i to ponovnim crtanjem spiska — jer promjena
     redoslijeda mijenja i numeraciju dova („DOVA #7“ postane „DOVA #1“). */

  /* Aktivno povlačenje, jedno u cijeloj aplikaciji. */
  var vuca = null;

  /* Dodir ili pritisak koji JOŠ nije povlačenje — čeka se držanje ili pokret.
     Vidi tabelu gore. */
  var priprema = null;

  var DRZANJE = 260;      /* ms držanja prstom prije nego red krene */
  var PRAG_MIS = 5;       /* px pokreta mišem koji znače „ovo nije klik“ */
  var PRAG_DODIR = 8;     /* px pokreta prstom koji znače „ovo je skrol“ */

  /* Rub tijela drawer-a u kojem povlačenje samo skrola, i korak po kadru.
     Bez toga se dova iz sredine spiska od 34 reda ne bi mogla dovući na vrh:
     prst dođe do ivice ekrana i tu stane. */
  var RUB_SKROLA = 64;
  var KORAK_SKROLA = 14;

  /* Šest tačaka — znak koji se na spiskovima čita kao „ovo se povlači“.
     Krugovi, a ne potezi: tačka nacrtana potezom zavisi od `stroke-linecap`
     i zna ispasti kao crtica. */
  function ikonaHvat() {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "set-grip-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");

    [[9, 6], [15, 6], [9, 12], [15, 12], [9, 18], [15, 18]].forEach(function (t) {
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", String(t[0]));
      c.setAttribute("cy", String(t[1]));
      c.setAttribute("r", "1.6");
      svg.appendChild(c);
    });

    return svg;
  }

  /* Hvatište je pravo dugme, ne samo ikona: tako ga dohvati i tastatura
     (strelice gore/dolje pomjeraju red) i čitač ekrana dobije ime. Miš i prst
     idu kroz `pointerdown` na cijelom redu, pa `click` na njemu ne znači
     ništa. */
  function dugmeHvat(naslov) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "set-grip";
    btn.title = "Povuci za promjenu redoslijeda";
    btn.setAttribute("aria-label", "Premjesti „" + naslov + "“");
    btn.appendChild(ikonaHvat());

    btn.addEventListener("click", function (e) { e.preventDefault(); });

    btn.addEventListener("keydown", function (e) {
      var smjer = e.key === "ArrowUp" ? -1 : (e.key === "ArrowDown" ? 1 : 0);
      if (!smjer) { return; }
      e.preventDefault();
      pomjeriTipkom(btn, smjer);
    });

    return btn;
  }

  /* Spisak id-eva onako kako redovi stoje, pa zamjena dva mjesta. Kratko i
     bez povlačenja — isto što uradi i prevlak, samo na strelicu. */
  function pomjeriTipkom(btn, smjer) {
    /* Otvorena forma stoji NA MJESTU jednog reda — tog reda tada nema u
       spisku, pa bi novi poredak ispao bez njega. Isto pravilo kao u
       `dodirRed()`. */
    if (forma) { return; }
    if (zakljucano()) { return; }

    var red = btn.closest(".set-pick");
    var body = red && red.parentNode;
    if (!red || !body) { return; }

    var redovi = redoviU(body);
    var od = redovi.indexOf(red);
    var na = od + smjer;
    if (od === -1 || na < 0 || na >= redovi.length) { return; }

    var ids = redovi.map(function (r) { return r.dataset.id; });
    ids.splice(na, 0, ids.splice(od, 1)[0]);
    primiRedoslijed(body.dataset.sekcija, ids, red.dataset.id);
  }

  function redoviU(body) {
    return Array.prototype.slice.call(body.querySelectorAll(".set-pick"));
  }

  /* Novi redoslijed sekcije: zapamti, iscrtaj spisak iznova (zbog numeracije
     dova), javi ekranu i pošalji odmah — kao i svaka druga izmjena stavke. */
  function primiRedoslijed(sekcija, ids, fokus) {
    if (!sekcija) { return; }
    /* Zaključan spisak se ne preraspoređuje — vidi `zakljucano()`. */
    if (zakljucano()) { return; }
    if (!config.redoslijed) { config.redoslijed = {}; }
    config.redoslijed[sekcija] = ids;
    spremiPromjenu(fokus);
  }

  /* --- od dodira do povlačenja --------------------------------------------- */

  /* Dodir po redu. Odavde se ide ili u povlačenje ili u ništa — kvačicu i
     olovku pušta da rade same. */
  function dodirRed(e, red) {
    /* Samo lijevi taster / prvi prst. */
    if (e.button !== undefined && e.button > 0) { return; }
    if (vuca || priprema) { return; }
    /* Zaključan spisak: hvatišta u redovima ionako nema, ali povlačenje kreće
       i sa bilo kojeg drugog mjesta u redu, pa se zaustavlja ovdje. */
    if (zakljucano()) { return; }

    /* Olovka je radnja za sebe: povlačenje sa nje bi značilo da se forma
       otvori na kraju svakog promašenog prevlaka. */
    if (e.target.closest && e.target.closest(".set-edit")) { return; }

    /* Otvorena forma stoji NA MJESTU jednog reda, pa spisak tada nije spisak
       redova i mjere ne bi valjale. */
    if (forma) { return; }

    var body = red.parentNode;
    if (!body || redoviU(body).length < 2) { return; }

    var hvatiste = !!(e.target.closest && e.target.closest(".set-grip"));

    priprema = {
      red: red,
      pokazivac: e.pointerId,
      dodir: e.pointerType !== "mouse",
      x: e.clientX,
      y: e.clientY,
      tajmer: 0
    };

    if (hvatiste) {
      /* Hvatište ima `touch-action: none`, pa prst na njemu ne skrola i nema
         se šta čekati. */
      e.preventDefault();
      pocniVucu();
      return;
    }

    if (priprema.dodir) {
      priprema.tajmer = setTimeout(function () {
        if (priprema) { pocniVucu(); }
      }, DRZANJE);
    }
  }

  function otkaziPripremu() {
    if (!priprema) { return; }
    if (priprema.tajmer) { clearTimeout(priprema.tajmer); }
    priprema = null;
  }

  /* Skrol se zaustavlja tek dok povlačenje traje, i to ovdje: `touchmove` sa
     `passive: false` je jedino što na telefonu zaustavi spisak pod prstom kad
     `touch-action` nije none (a ne smije biti — vidi komentar na vrhu). */
  function stopDodir(e) {
    if (vuca) { e.preventDefault(); }
  }

  /* Klik koji dolazi poslije povlačenja se guta: bez toga bi svako
     premještanje reda usput isključilo tu dovu, jer je red labela svoje
     kvačice. */
  function stopKlik(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function pocniVucu() {
    var pr = priprema;
    if (!pr || vuca) { return; }
    if (pr.tajmer) { clearTimeout(pr.tajmer); }
    priprema = null;

    var red = pr.red;
    var body = red.parentNode;
    var redovi = redoviU(body);
    var od = redovi.indexOf(red);
    if (od === -1) { return; }

    vuca = {
      sekcija: body.dataset.sekcija,
      redovi: redovi,
      /* Zatečena mjesta i visine, izmjerena jednom. Redovi se dok traje
         povlačenje samo pomjeraju `transform`-om, pa ostaju važeća. */
      mjere: redovi.map(function (r) {
        return { node: r, vrh: r.offsetTop, visina: r.offsetHeight };
      }),
      red: red, od: od, na: od,
      pokazivac: pr.pokazivac,
      pocetakY: pr.y,
      pocetakSkrol: el.body ? el.body.scrollTop : 0,
      zadnjiY: pr.y,
      kadar: 0
    };

    /* Bez hvatanja pokazivača povlačenje stane čim prst izađe iz reda. */
    try { red.setPointerCapture(pr.pokazivac); } catch (err) {}

    document.addEventListener("touchmove", stopDodir, { passive: false });
    document.addEventListener("click", stopKlik, true);

    document.body.classList.add("is-vuce");
    red.classList.add("is-dragging");
    redovi.forEach(function (r) {
      if (r !== red) { r.classList.add("is-glide"); }
    });

    pomjeriVucu();
    vuca.kadar = requestAnimationFrame(skrolajRub);
  }

  /* Pomak se računa i iz prsta i iz skrola: kad spisak sam otklizi pod
     prstom, red mora ostati tamo gdje ga prst drži. */
  function pomjeriVucu() {
    if (!vuca) { return; }

    var skrol = el.body ? el.body.scrollTop : 0;
    var pomak = (vuca.zadnjiY - vuca.pocetakY) + (skrol - vuca.pocetakSkrol);
    var moja = vuca.mjere[vuca.od];

    vuca.red.style.transform = "translateY(" + pomak + "px) scale(1.02)";

    /* Novo mjesto = koliko OSTALIH redova ima svoju sredinu iznad sredine
       povučenog. Preko sredina, a ne preko ivica, jer redovi nisu iste
       visine — dova sa prevodom ispod naslova je viša od zikra. */
    var sredina = moja.vrh + moja.visina / 2 + pomak;
    var na = 0;

    vuca.mjere.forEach(function (o, i) {
      if (i === vuca.od) { return; }
      if (o.vrh + o.visina / 2 < sredina) { na += 1; }
    });

    if (na !== vuca.na) { vuca.na = na; rasporediRedove(); }
  }

  /* Redovi između starog i novog mjesta se sklone za tačno jednu visinu
     povučenog reda — otud i utisak da se rupa pomjera s njim. */
  function rasporediRedove() {
    var h = vuca.mjere[vuca.od].visina;

    vuca.mjere.forEach(function (o, i) {
      if (i === vuca.od) { return; }
      var d = 0;
      if (vuca.na > vuca.od && i > vuca.od && i <= vuca.na) { d = -h; }
      else if (vuca.na < vuca.od && i >= vuca.na && i < vuca.od) { d = h; }
      o.node.style.transform = d ? "translateY(" + d + "px)" : "";
    });
  }

  /* Prst u rubu tijela drawer-a skrola spisak, brže što je bliže ivici. */
  function skrolajRub() {
    if (!vuca) { return; }

    if (el.body) {
      var okvir = el.body.getBoundingClientRect();
      var korak = 0;

      if (vuca.zadnjiY < okvir.top + RUB_SKROLA) {
        korak = -KORAK_SKROLA *
          Math.min(1, (okvir.top + RUB_SKROLA - vuca.zadnjiY) / RUB_SKROLA);
      } else if (vuca.zadnjiY > okvir.bottom - RUB_SKROLA) {
        korak = KORAK_SKROLA *
          Math.min(1, (vuca.zadnjiY - (okvir.bottom - RUB_SKROLA)) / RUB_SKROLA);
      }

      if (korak) {
        var prije = el.body.scrollTop;
        el.body.scrollTop = prije + korak;
        /* Na kraju spiska skrol više ne ide — tada se ništa i ne mijenja. */
        if (el.body.scrollTop !== prije) { pomjeriVucu(); }
      }
    }

    vuca.kadar = requestAnimationFrame(skrolajRub);
  }

  /* Spuštanje: red otklizi u svoju rupu, pa se tek onda spisak crta iznova.
     Obrnutim redom bi se novi poredak pojavio prije nego se stari dovrši, i
     red bi vidno preskočio. */
  function zavrsiVucu(e) {
    if (e && e.pointerId !== undefined && priprema &&
        e.pointerId === priprema.pokazivac) {
      otkaziPripremu();
    }

    if (!vuca) { return; }
    if (e && e.pointerId !== undefined && e.pointerId !== vuca.pokazivac) { return; }

    var v = vuca;
    vuca = null;

    if (v.kadar) { cancelAnimationFrame(v.kadar); }
    try { v.red.releasePointerCapture(v.pokazivac); } catch (err) {}
    document.removeEventListener("touchmove", stopDodir, { passive: false });
    document.body.classList.remove("is-vuce");

    /* Klik poslije prevlaka stiže tek na sljedeći krug petlje — osluškivač se
       skida iza njega, ne odmah. */
    setTimeout(function () {
      document.removeEventListener("click", stopKlik, true);
    }, 0);

    /* Gdje je rupa: kad se red spušta, mjesto ispod njega se popelo za
       njegovu visinu; kad se penje, mjesto je taman gdje je bio red na koji
       je došao. */
    var moja = v.mjere[v.od];
    var cilj = v.mjere[v.na];
    var kraj = (v.na > v.od)
      ? cilj.vrh + cilj.visina - moja.visina
      : cilj.vrh;
    var pomak = kraj - moja.vrh;

    v.red.classList.remove("is-dragging");
    v.red.classList.add("is-glide");
    v.red.style.transform = pomak ? "translateY(" + pomak + "px)" : "";

    var pomjeren = v.na !== v.od;
    var ids = v.redovi.map(function (r) { return r.dataset.id; });
    if (pomjeren) { ids.splice(v.na, 0, ids.splice(v.od, 1)[0]); }

    /* Trag se briše u svakom slučaju — i kad se red vratio odakle je krenuo,
       jer i tada nosi `transform` i klase od povlačenja. */
    setTimeout(function () {
      v.redovi.forEach(function (r) {
        r.classList.remove("is-glide");
        r.style.transform = "";
      });
      if (pomjeren) { primiRedoslijed(v.sekcija, ids); }
    }, mirnijeAnimacije() ? 0 : 200);
  }

  /* Pokazivač je uhvaćen na redu, ali događaji svejedno stižu dovde — jedan
     par osluškivača za sva povlačenja, umjesto po jedan na svakom redu koji
     se pri svakom crtanju spiska pravi iznova. */
  document.addEventListener("pointermove", function (e) {
    if (priprema && e.pointerId === priprema.pokazivac) {
      var d = Math.abs(e.clientY - priprema.y) + Math.abs(e.clientX - priprema.x);
      if (priprema.dodir) {
        /* Prst se pomjerio prije nego je držanje isteklo — to je skrol. */
        if (d > PRAG_DODIR) { otkaziPripremu(); }
      } else if (d > PRAG_MIS) {
        pocniVucu();
      }
    }

    if (!vuca || e.pointerId !== vuca.pokazivac) { return; }
    e.preventDefault();
    vuca.zadnjiY = e.clientY;
    pomjeriVucu();
  }, { passive: false });

  document.addEventListener("pointerup", zavrsiVucu);
  document.addEventListener("pointercancel", zavrsiVucu);

  /* Spisak se skrolao pod pripremljenim prstom (npr. inercijom) — namjera
     više nije premještanje. */
  document.addEventListener("scroll", function () {
    if (priprema && priprema.dodir) { otkaziPripremu(); }
  }, true);

  function redStavke(section, item, naslov, redanje) {
    var row = document.createElement("div");
    row.className = "set-pick";
    row.dataset.id = item.id;

    /* Tačke skroz lijevo: prvo što se u redu vidi je da se red može
       premjestiti. Povlači se svejedno cijeli red (vidi `dodirRed()`) — ovo
       je znak, ne jedino mjesto za koje se smije uhvatiti.

       Sekcija sa jednom stavkom ga nema: tu nema šta prerasporediti, a znak
       koji ništa ne obećava je gori od njegovog nedostatka. */
    if (redanje) {
      row.appendChild(dugmeHvat(naslov));
      row.addEventListener("pointerdown", function (e) { dodirRed(e, row); });
    }

    /* <label>, ne <div> sa handlerom: klik po kvačici i tekstu prebacuje
       kvačicu sam od sebe, i taj dio reda dolazi pod čitač ekrana kao jedna
       kontrola sa svojim imenom. Olovka ostaje IZVAN labele — klik po njoj ne
       smije značiti "sakrij ovu dovu". */
    var main = document.createElement("label");
    main.className = "set-pick-main";

    var input = document.createElement("input");
    input.type = "checkbox";
    input.className = "check";
    /* Ne `!jeSkriveno()` nego `ukljucena()`: na putu spisak nije korisnikov
       nego fiksan, pa kvačica mora pokazati ono što se stvarno prikazuje. */
    input.checked = ukljucena(section.id, item.id);
    input.disabled = zakljucano();

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

    /* Oznaka je uvijek iste boje, i na stavci iz data.js i na vlastitoj:
       ona kaže KOLIKO, a ne odakle stavka dolazi. Zlatna je nekad značila
       „dirano“, ali je u spisku ispadalo da isti broj na dvije susjedne
       kartice znači dvije različite stvari. */
    var oznaka = oznakaStavke(item);
    if (oznaka) {
      var chip = document.createElement("span");
      chip.className = "set-pick-meta";
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

    var lock = zakljucano();

    var box = document.createElement("div");
    box.className = "set-acc" + (lock ? " is-locked" : "");

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
    /* Povlačenje reda odavde čita kojoj sekciji novi poredak pripada. */
    body.dataset.sekcija = section.id;

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
      /* Rasklopljena sekcija je duža od ekrana, a zaglavlje po kojem se
         kliknulo zna biti pri dnu — bez ovoga se spisak otvori ISPOD ruba i
         izgleda kao da se ništa nije desilo. Skrola se cijeli akordeon, pa mu
         zaglavlje ostane na vrhu a stavke ispod njega. */
      if (otvori) { skrolujDo(box); }
    });

    head.appendChild(toggle);
    head.appendChild(sw.wrap);

    var inputs = {};

    /* Zaključan spisak se ne povlači, pa ni tačke lijevo ne stoje: znak koji
       ništa ne obećava je gori od njegovog nedostatka (isto pravilo kao za
       sekciju sa jednom stavkom). */
    var redanje = items.length > 1 && !lock;

    items.forEach(function (item) {
      var red = redStavke(section, item, titles[item.id] || item.title, redanje);
      inputs[item.id] = red.input;
      body.appendChild(red.node);
    });

    /* Podnožje spiska: dugme „Dodaj svoju stavku“, a kad se ono pritisne —
       forma na njegovom mjestu.

       Kur'anska sekcija ga nema: ona nije lista nego jedna stavka (nema
       `items`, vidi `sectionItems()` u data.js), pa se u nju nema gdje
       dopisati. Sve ostalo na njoj je isto — akordeon, red, olovka.

       Nema ga ni zaključan spisak: na putu ni „Dodaj svoju stavku“ ni „Vrati
       zadani redoslijed“ nemaju šta raditi, pa se ne prazni red za dugme koje
       se ne može pritisnuti. */
    var foot = null;
    if (section.kind !== "quran" && !lock) {
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
    btn.appendChild(document.createTextNode(
      acc.section.kind === "stanje" ? "Dodaj svoju dovu" : "Dodaj svoju stavku"
    ));
    btn.addEventListener("click", function () { otvoriFormu(acc.section, null); });

    acc.foot.appendChild(btn);

    /* Put nazad na poredak iz data.js. Stoji samo dok ima šta vratiti — isto
       pravilo kao „Vrati na zadano“ u formi. Bez njega bi se spisak od 34
       dove morao vraćati red po red. */
    if (config.redoslijed && config.redoslijed[acc.id]) {
      var vrati = document.createElement("button");
      vrati.type = "button";
      vrati.className = "set-reset";
      vrati.textContent = "Vrati zadani redoslijed";
      vrati.addEventListener("click", function () {
        delete config.redoslijed[acc.id];
        spremiPromjenu();
      });
      acc.foot.appendChild(vrati);
    }
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
    /* Zaključan spisak: olovka i „Dodaj“ su ugašeni, pa se dovde ne dolazi
       klikom — ali forma je jedini put do izmjene i brisanja, pa stoji i
       zabrana. */
    if (zakljucano()) { return; }

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
      skrolujDo(acc.foot.querySelector(".set-new"));
      return;
    }

    var item = stavkaPoId(section, id);
    var red = acc.inputs[id] ? acc.inputs[id].closest(".set-pick") : null;
    if (!item || !red) { return; }

    forma = { sekcija: section.id, id: id, mjesto: "red" };
    var box = formaStavke(section, item);
    red.parentNode.replaceChild(box, red);
    /* Olovka se pritisne bilo gdje u spisku — forma se otvara na mjestu tog
       reda, pa mora doći pred oči cijela, a ne tek zavirivati odozdo. */
    skrolujDo(box);
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

  /* U skupinama dova za stanja (`kind: "stanje"`) postoji samo jedan oblik:
     dova sa naslovom. Brojani zikr i gola stavka tamo nemaju smisla — ta
     strana ništa ne broji i ništa ne čekira, pa bi kartica sa brojem
     obećavala tespih kojeg nema.

     Jedan tip znači i da se tip ne bira: forma tada ne crta traku sa
     tabovima (vidi `formaStavke()`). */
  var TIPOVI_STANJE = [
    { id: "ajet", label: "Dova" }
  ];

  function tipoviZa(section) {
    return (section && section.kind === "stanje") ? TIPOVI_STANJE : TIPOVI;
  }

  /* Polja NOVE stavke, po izabranom tipu. Tip je ovdje ono što stoji na
     dugmetu ("broj", "dova", "prosto", "ajet"), a `poljaZaTip()` ispod prima
     tip STAVKE iz data.js ("count", "dua", "ajet", …) — dvije stvari, pa i
     dvije funkcije. */
  function poljaZaNovi(tip) {
    if (tip === "ajet") { return poljaZaTip("ajet"); }
    if (tip === "dova") { return poljaZaTip("dua"); }
    if (tip === "broj") { return ["title", "repetitions"]; }
    return ["title"];
  }

  /* Polja koja forma pokazuje, po tipu stavke. `kljuc` je ime polja u
     `data.js` odnosno u configu — po njemu se i puni i sprema, pa se spisak
     polja vodi na jednom mjestu. */
  function poljaZaTip(type) {
    if (type === "quran") { return ["stranice"]; }
    if (type === "dua") { return ["arabic", "transliteration", "translation", "source"]; }
    /* Dova za stanje ima i naslov, za razliku od "dua": ona se ne numeriše
       sama nego se na svojoj strani bira po imenu. */
    if (type === "ajet") {
      return ["title", "arabic", "transliteration", "translation", "source"];
    }
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
      ? (section.kind === "stanje" ? "Nova dova — " : "Nova stavka — ") + section.title
      : "Uredi";
    box.appendChild(p("set-new-head", naslovForme));

    /* --- tip (samo za novu stavku) --- */
    /* Koji su oblici uopšte mogući zavisi od sekcije: u skupinama dova za
       stanja postoji samo jedan (vidi `tipoviZa()`), pa se traka sa tabovima
       ne crta — jedno dugme koje se ne može ni odabrati ni odbiti nije
       izbor. */
    var tipovi = tipoviZa(section);
    var tip = tipovi[0].id;
    var dugmad = {};

    if (novo && tipovi.length > 1) {
      var tabs = document.createElement("div");
      tabs.className = "set-new-tabs";
      tabs.setAttribute("role", "group");
      tabs.setAttribute("aria-label", "Tip stavke");

      tipovi.forEach(function (t) {
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
      /* Korpa umjesto riječi: brisanje je jedina radnja u formi koja se ne
         vraća, pa se ne treba čitati nego prepoznati — i ne stoji u istom
         redu riječi sa „Odustani“ i „Sačuvaj“, gdje se lako promaši. Ime za
         čitač ekrana i dalje kaže šta radi. */
      var obrisi = document.createElement("button");
      obrisi.type = "button";
      obrisi.className = "set-new-btn is-danger is-icon";
      obrisi.title = "Obriši";
      obrisi.setAttribute("aria-label", "Obriši");
      obrisi.appendChild(svgPutanje("set-new-btn-icon", [
        "M4 7h16",
        "M9.5 7V4.6h5V7",
        "M6.4 7l.8 12.1a1.6 1.6 0 0 0 1.6 1.5h6.4a1.6 1.6 0 0 0 1.6-1.5L17.6 7",
        "M10 11v6",
        "M14 11v6"
      ]));
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
      tipovi.forEach(function (t) {
        /* Bez trake sa tabovima nema ni dugmadi — jedan tip se ne bira. */
        if (!dugmad[t.id]) { return; }
        dugmad[t.id].classList.toggle("is-on", t.id === tip);
        dugmad[t.id].setAttribute("aria-pressed", t.id === tip ? "true" : "false");
      });
      nacrtajPolja(poljaZaNovi(tip));
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

    /* Arapski / transkripcija / prevod / izvor — isti posao za "dova" i za
       "ajet", pa stoji na jednom mjestu. Vraća false i piše grešku kad nema
       ni jednog teksta: prazna kartica se ne bi znala ni prepoznati ni
       obrisati. */
    function upisiTekstove(entry) {
      entry.arabic = tekst("arabic");
      entry.transliteration = tekst("transliteration");
      entry.translation = tekst("translation");
      entry.source = tekst("source");
      if (!entry.arabic && !entry.transliteration && !entry.translation) {
        pisiGresku("Upiši bar arapski tekst, transkripciju ili prevod.");
        return false;
      }
      return true;
    }

    function spremiNovu() {
      var entry = { id: novaId(), sekcija: section.id };

      if (tip === "ajet") {
        entry.type = "ajet";
        entry.title = tekst("title");
        /* Naslov je ovdje obavezan, za razliku od "dova": na strani sa dovama
           za stanja se dova bira po imenu (vidi `cleanCustom()` u data.js). */
        if (!entry.title) { pisiGresku("Upiši naslov."); return false; }
        if (!upisiTekstove(entry)) { return false; }
      } else if (tip === "dova") {
        entry.type = "dua";
        if (!upisiTekstove(entry)) { return false; }
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

      if (entry.type === "ajet") {
        entry.title = tekst("title");
        if (!entry.title) { pisiGresku("Upiši naslov."); return false; }
        if (!upisiTekstove(entry)) { return false; }
      } else if (entry.type === "dua") {
        if (!upisiTekstove(entry)) { return false; }
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
  function spremiPromjenu(fokus) {
    config = ocisti(config);
    zapamtiConfig();
    forma = null;
    trebaCrtanje = false;
    nacrtajAkordeone();
    /* Spisak je iscrtan iznova, pa je nestao i element na kojem je bio fokus.
       Kad se red pomjerio tastaturom, hvatište se mora vratiti pod prst —
       inače bi svaka strelica bacila fokus na početak drawer-a i drugi korak
       ne bi bio moguć. */
    if (fokus) { vratiFokus(fokus); }
    javi();
    posalji(true);
  }

  function vratiFokus(id) {
    if (!el.picks) { return; }
    var hvat = el.picks.querySelector('.set-pick[data-id="' + id + '"] .set-grip');
    if (!hvat) { return; }
    try { hvat.focus({ preventScroll: true }); } catch (e) { hvat.focus(); }
  }

  /* --- crtanje i osvježavanje spiska --------------------------------------- */

  /* Potpis onoga što je UPISANO u redove spiska: vlastite stavke (kojih ima
     i koje su), izmjene (naslov i detalj u redu), broj stranica (oznaka u
     kur'anskom redu) i redoslijed (kojim redom stoje, a od njega zavisi i
     numeracija dova). Kvačice nisu tu — njih `primijeniStanje()` mijenja u
     zatečenim čvorovima, bez ponovnog crtanja.

     Bez `izmjene` i `stranice` bi promjena sa drugog uređaja stigla na ekran
     ali ne i u postavke: red bi i dalje pisao stari naslov i stari broj. */
  function strukturaSada() {
    return JSON.stringify([
      config.dodatno || [], config.izmjene || {}, config.stranice || 1,
      config.redoslijed || {},
      /* Putovanje mijenja i šta u redovima PIŠE (kvačice idu po putnom
         spisku) i šta se u njima može dirati, pa prekidač upaljen na drugom
         uređaju mora prekrojiti spisak, ne samo osvježiti kvačice. */
      config.putovanje === true
    ]);
  }

  /* Napomena pod zaglavljem „Dnevni spisak“. Na putu kaže zašto se ne dira:
     red ugašenih kvačica bez ijedne rečenice izgleda kao greška. */
  function notaDnevnog() {
    return zakljucano()
      ? "Putovanje je uključeno, pa je spisak fiksan — ovdje se samo čita. " +
        "Isključi „Putovanje“ da bi ga mijenjao."
      : "Odaberi šta se prikazuje, promijeni broj ponavljanja ili dodaj svoje.";
  }

  /* Zaglavlje nad skupinama dova za stanja. Nastaje ovdje a ne u `build()`
     jer stoji UNUTAR spiska koji se pri svakoj izmjeni crta iznova. */
  function glavaStanja() {
    var box = document.createElement("div");
    box.className = "set-group-head";
    box.appendChild(p("set-label", "Dove za stanja"));

    /* Putovanje ne mijenja SADRŽAJ ovih skupina — strana sa dovama radi kao i
       svaki drugi dan — ali dok je scope fiksan, ništa se ne prekraja. */
    box.appendChild(p("set-note",
      "Skupine sa strane koju otvara ikonica sa rukama u zaglavlju. " +
      "Ništa se ne čekira — samo se prouči." +
      (zakljucano() ? " Zaključano dok je putovanje uključeno." : "")));
    return box;
  }

  function nacrtajAkordeone() {
    if (!el.picks) { return; }

    /* Spisak se prazni pa puni iznova, a između toga mu visina padne na nulu
       i drawer bi skočio na svoj vrh. Sadržaj je poslije crtanja iste visine,
       pa se skrol jednostavno vrati tamo gdje je bio — bez ovoga bi svaka
       izmjena stavke i svako povlačenje reda odvelo na početak postavki. */
    var skrol = el.body ? el.body.scrollTop : 0;

    strukturaPotpis = strukturaSada();
    el.picks.textContent = "";

    /* Zaglavlje „Dnevni spisak“ nastaje u `build()` i ne crta se iznova, pa
       mu se napomena mijenja odavde — inače bi na putu pisalo „dodaj svoje“
       nad spiskom u kojem se ništa ne dodaje. */
    if (el.pickNote) { el.pickNote.textContent = notaDnevnog(); }

    /* Dva spiska, jedan ispod drugog: dnevne sekcije pa skupine dova za
       stanja. Razdvojene su zato što se različito i koriste — dnevne se
       odrađuju, ove se traže kad zatreba — pa bi "Strah i nemir" između
       "Dove" i "Navečer" izgledao kao još jedan dio dnevnog zikra.

       Sve ostalo im je isto: isti akordeon, isti red, ista kvačica, ista
       olovka, isto dugme za dodavanje. Zato ovdje stoji samo zaglavlje
       između, a ne drugi spisak sa svojim pravilima.

       Dijeli se po `kind`, a ne po mjestu u nizu `sections`: redoslijed u
       data.js je slobodan i skupine ne moraju stajati na kraju. */
    var dnevne = [];
    var stanja = [];

    birljive().forEach(function (section) {
      if (section.kind === "stanje") { stanja.push(section); }
      else { dnevne.push(section); }
    });

    akordeoni = [];

    function dopisi(section) {
      var acc = akordeon(section);
      el.picks.appendChild(acc.node);
      akordeoni.push(acc);
    }

    dnevne.forEach(dopisi);

    if (stanja.length) {
      el.picks.appendChild(glavaStanja());
      stanja.forEach(dopisi);
    }

    primijeniStanje();

    if (el.body) { el.body.scrollTop = skrol; }
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
    var lock = zakljucano();

    akordeoni.forEach(function (acc) {
      var gore = 0;

      acc.items.forEach(function (item) {
        var on = ukljucena(acc.id, item.id);
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
      acc.sw.disabled = sve === 0 || lock;

      /* Stanja i za oko: puna sekcija je obična, djelimična nosi zlatnu
         brojku, a prazna je cijela prigušena — ta se uopšte ne pojavljuje na
         spisku, pa se to mora vidjeti i odavde. */
      acc.node.classList.toggle("is-full", sve > 0 && gore === sve);
      acc.node.classList.toggle("is-partial", gore > 0 && gore < sve);
      acc.node.classList.toggle("is-empty", gore === 0);
    });
  }

  /* ------------------------------------------------------------------------
     Tema

     Prekidač je „Automatski“, a ne „Noćna tema“: automatika je ono što
     aplikacija radi sama od sebe (svijetla danju, tamna od večernjeg
     podsjetnika), pa je to jedno stanje prekidača, a ne treća stavka u
     spisku. Kad se ugasi, ispod se otvori izbor dnevne i noćne.

     Gašenje automatike NE mijenja ekran: ostaje tema koja je u tom trenutku
     stajala, samo prestaje da se mijenja sama. Bez toga bi prekidač usred
     noći bacio korisnika u svijetlu temu, a on ga je dirao da bi izabrao.

     Režim pamti theme.js, u svom ključu u localStorage, i ne ide na server uz
     ostali config: tema je stvar ekrana koji se drži u ruci, a ne spiska koji
     se dijeli. Isto ime na telefonu i na računaru vidi isti zikr, ali svaki
     uređaj svoju temu.

     Ako theme.js nije učitan, reda nema — nego da stoji prekidač koji ništa
     ne mijenja.
     ------------------------------------------------------------------------ */

  /* Dva dugmeta izbora: id režima, natpis i potezi ikonice pored njega. Isto
     sunce i isti mlađak kao oznaka na traci sa selamom, samo se ovdje crtaju
     iz JavaScripta jer red teme cijel nastaje ovdje. */
  var IZBOR_TEME = [
    {
      id: "dan",
      label: "Dnevna",
      crtez: [
        ["circle", { cx: "12", cy: "12", r: "4.2" }],
        ["path", { d: "M12 2.4v2.2M12 19.4v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.4 12h2.2M19.4 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" }]
      ]
    },
    {
      id: "noc",
      label: "Noćna",
      crtez: [
        ["path", { d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" }]
      ]
    }
  ];

  function ikonaTeme(crtez) {
    var NS = "http://www.w3.org/2000/svg";

    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "set-choice-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");

    crtez.forEach(function (par) {
      var node = document.createElementNS(NS, par[0]);
      Object.keys(par[1]).forEach(function (kljuc) {
        node.setAttribute(kljuc, par[1][kljuc]);
      });
      svg.appendChild(node);
    });

    return svg;
  }

  function dodajTemu(body) {
    var tema = window.mojZikrTema;
    if (!tema) { return; }

    var red = redPrekidac("tema-auto", "Tema",
      "Automatski — svijetla danju, tamna uveče.",
      tema.rezim() === "auto",
      function (on) {
        tema.postavi(on ? "auto" : tema.aktivna());
        /* Stanje se ne pretpostavlja iz klika nego se ponovo PROČITA iz
           theme.js — ono je jedini izvor. Prekidač tako ne može ostati u
           položaju koji theme.js nije prihvatio. */
        osvjeziTemu();
      });

    var izbor = document.createElement("div");
    izbor.className = "set-choice";
    izbor.setAttribute("role", "group");
    izbor.setAttribute("aria-label", "Tema");

    var dugmad = {};

    IZBOR_TEME.forEach(function (opcija) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "set-choice-btn";
      /* Ikonica i natpis: ikonica se nađe pogledom, natpis kaže tačno šta
         je. Ime ne ide u `aria-label` — piše na dugmetu, pa je čitač ekrana
         ionako pročita. */
      b.appendChild(ikonaTeme(opcija.crtez));
      var natpis = document.createElement("span");
      natpis.textContent = opcija.label;
      b.appendChild(natpis);
      b.addEventListener("click", function () {
        tema.postavi(opcija.id);
        osvjeziTemu();
      });
      dugmad[opcija.id] = b;
      izbor.appendChild(b);
    });

    el.tema = { auto: red.input, izbor: izbor, dugmad: dugmad };

    body.appendChild(red.row);
    body.appendChild(izbor);

    /* I na promjenu koja dođe MIMO postavki: sam prelaz u 19:00 dok su
       postavke otvorene, ili glumljeni sat iz testnog panela. */
    tema.naPromjenu(osvjeziTemu);
    osvjeziTemu();
  }

  function osvjeziTemu() {
    if (!el.tema) { return; }

    var rezim = window.mojZikrTema.rezim();
    var auto = rezim === "auto";

    el.tema.auto.checked = auto;
    el.tema.izbor.hidden = auto;

    IZBOR_TEME.forEach(function (opcija) {
      var b = el.tema.dugmad[opcija.id];
      var on = !auto && rezim === opcija.id;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
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
    /* Jedini okvir koji se u postavkama skrola — `skrolujDo()` i povlačenje
       reda računaju pomak nad njim. */
    el.body = body;

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

    /* Tema — prekidač automatike, a pod njim izbor dnevne i noćne kad je
       automatika ugašena. Vidi `redTeme()`. */
    dodajTemu(body);

    /* Prekidači configa — samo jedan. Sekcije se ne gase prekidačem nego
       kvačicama u spisku ispod (vidi komentar na vrhu fajla).

       `el.switches` je samo za ono što stoji u configu: `osvjeziPrekidace()`
       ga prepisuje iz configa poslije odgovora sa servera. Tema tu NE smije
       stajati — nije u configu, pa bi je prvo osvježavanje ugasilo. */
    el.switches = {};

    var t = redPrekidac("transkript", "Transkripcija",
      "Umjesto arapskog teksta prikaži transkripciju. Prevod ostaje ispod.",
      config.transkript === true,
      function (on) {
        config.transkript = on;
        zapamtiConfig();
        javi();
        posalji();
      });
    el.switches.transkript = t.input;
    body.appendChild(t.row);

    /* Putovanje — jedini prekidač koji mijenja SPISAK, a ne prikaz. Zato je
       ovdje, uz transkripciju (oba su polja configa i oba idu na server), a ne
       u spisku ispod: spisak je ono na što djeluje, pa ne može sadržavati
       svoju vlastitu sklopku.

       Šta se sve mijenja kad se upali:
         data.js        dnevni spisak se svede na `PUTNI_SCOPE` — i na ekranu,
                        i u trakama napretka, i u broju na ikonici, i u računu
                        podsjetnika na serveru (sve to ide kroz
                        `sectionsForDate()`)
         ovaj drawer    spisak ispod se zaključa i kvačice pređu na putni
                        spisak (`nacrtajAkordeone()`)
         style.css      traka sa selamom se oboji i pored teme stane avion
                        (`primijeniPut()` piše `data-putovanje` na <html>) */
    var pt = redPrekidac("putovanje", "Putovanje",
      "Kraći dnevni spisak za put: stranica, tri zikra, devet dova i " +
      "večernji. Dok je uključeno, spisak se ne mijenja.",
      config.putovanje === true,
      function (on) {
        config.putovanje = on;
        zapamtiConfig();
        primijeniPut();
        /* Ne `osvjeziStavke()`: mijenja se i sastav redova i to šta se u njima
           smije dirati, pa se spisak crta iznova. */
        nacrtajAkordeone();
        /* Vaktija se na putu zaključava — vidi `osvjeziVaktiju()`. */
        osvjeziVaktiju();
        javi();
        posalji();
      });
    el.switches.putovanje = pt.input;
    body.appendChild(pt.row);

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

    /* Vaktija — prikaz. Kartica iznad spiska sa narednim vaktom; klik po njoj
       otvara stranu sa svih šest vremena (vaktija.js). Vremena dolaze sa
       api.vaktija.ba, za Sarajevo. */
    var vk = redPrekidac("vaktija", "Vaktija",
      NOTA_VAKTIJA,
      config.vaktija !== false,
      function (on) {
        config.vaktija = on;
        zapamtiConfig();
        javi();
        posalji();
      });
    el.switches.vaktija = vk.input;
    body.appendChild(vk.row);

    /* Vaktija — obavijest. Ide odmah ispod prikaza jer je ista stvar, samo
       kad aplikacija nije otvorena.

       Šalje je server, u istom ciklusu koji šalje i podsjetnike za zikr
       (api/cron.js), pa vrijedi i kad je aplikacija zatvorena — ali samo ako
       su podsjetnici uključeni (red iznad): bez pretplate nema gdje stići. */
    var vo = redPrekidac("vaktijaObavijest", "Obavijest o vaktu",
      NOTA_VAKAT,
      config.vaktijaObavijest === true,
      function (on) {
        config.vaktijaObavijest = on;
        zapamtiConfig();
        javi();
        posalji();
      });
    el.switches.vaktijaObavijest = vo.input;
    body.appendChild(vo.row);

    /* Oba reda se zaključavaju na putu — vidi `osvjeziVaktiju()`. */
    el.vaktija = [
      { red: vk, nota: NOTA_VAKTIJA },
      { red: vo, nota: NOTA_VAKAT }
    ];
    osvjeziVaktiju();

    /* Spisak stavki — na dnu jer je najduži dio postavki. Ime, prekidači i
       podsjetnici ostaju odmah pod rukom; spiskovi su ionako sklopljeni.

       Akordeoni idu u svoj kontejner, a ne pravo u tijelo drawer-a: spisak se
       crta iznova kad se vlastita stavka doda ili obriše, pa mora postojati
       mjesto koje se smije isprazniti bez diranja ostatka postavki. */
    /* "Dnevni spisak", a ne samo "Prikaz": ispod njega stoji još jedno
       zaglavlje ("Dove za stanja", vidi `glavaStanja()`), pa se iz naslova
       mora vidjeti na šta se koji spisak odnosi. */
    var pickHead = document.createElement("div");
    pickHead.className = "set-group-head";
    pickHead.appendChild(p("set-label", "Dnevni spisak"));
    el.pickNote = p("set-note", notaDnevnog());
    pickHead.appendChild(el.pickNote);
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

  /* --- vaktija ------------------------------------------------------------
     Vaktija je vezana za JEDAN grad (Sarajevo). Na putu bi pokazivala tuđa
     vremena, a tuđa vaktija je gore od nikakve — zato putovanje gasi i
     karticu, i obavijest, i widget (api/cron.js, api/widget.js).

     Redovi se pri tome ne skrivaju nego ZAKLJUČAVAJU, isto kao spisak dova:
     prekidač koji nestane ostavlja čovjeka da traži gdje je otišao, a
     ugašen prekidač uz napomenu kaže zašto se ne dira. -------------------- */

  var NOTA_VAKTIJA = "Naredni vakat iznad spiska, a klikom sva vremena za Sarajevo.";
  var NOTA_VAKAT = "Kad nastupi namaz, stigne obavijest. Traži uključene podsjetnike.";
  var NOTA_PUT = " Isključeno dok je putovanje uključeno — vaktija je sarajevska.";

  function osvjeziVaktiju() {
    if (!el.vaktija) { return; }
    var lock = zakljucano();

    el.vaktija.forEach(function (stavka) {
      stavka.red.input.disabled = lock;
      var nota = stavka.red.row.querySelector(".set-note");
      if (nota) { nota.textContent = stavka.nota + (lock ? NOTA_PUT : ""); }
    });
  }

  function osvjeziPrekidace() {
    Object.keys(el.switches || {}).forEach(function (id) {
      el.switches[id].checked = config[id] === true;
    });
    /* Config sa drugog uređaja može donijeti i upaljeno putovanje. */
    osvjeziVaktiju();
    /* Putovanje uključeno na drugom uređaju mora obojiti i ovaj ekran, ne samo
       prebaciti prekidač. */
    primijeniPut();
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

  /* Znak putovanja ide na <html> prije prvog crtanja spiska, iz configa koji
     je već pročitan iz localStorage-a: kad bi se čekao odgovor sa servera,
     traka sa selamom bi na putu prvo bljesnula u svojoj boji. */
  primijeniPut();

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
    /* Usred povlačenja se ne zatvara ništa — red je u zraku, a zatvoren
       drawer bi ga ostavio da se spusti u spisak kojeg više nema. */
    if (vuca) { return; }
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
