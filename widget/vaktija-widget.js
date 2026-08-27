/* ==========================================================================
   widget/vaktija-widget.js — widget za iPhone (Scriptable)

   Tri bloka, jedan ispod drugog, i ništa više:

     1. koji namaz nastupa i za koliko
     2. sva vremena dana — ikonica, ime vakta i vrijeme
     3. postotak zikra, sa trakom

   MINIMALIZAM JE OVDJE PRAVILO, NE UKUS. Widget se gleda u prolazu, sekundu
   ili dvije: sve što nije jedno od to troje samo oduzima mjesto onome što
   jeste.

   ZAŠTO NEMA CRTANJA U SLIKU. Prethodna verzija je dan crtala kao sliku, da
   bi brojevi sjeli tačno ispod tačaka. Cijena je bila to što slika mora
   dobiti širinu u pikselima, a widget svoju širinu ne zna — pa je sve
   ostalo poravnato prema pogođenoj mjeri, a ne prema samom widgetu.

   Sada se sve slaže Scriptable-ovim redovima i stupcima, koji se sami
   razvuku koliko widget ima. Stupci dana imaju ZAKLJUČANU širinu (`kol.size`)
   i sadržaj centriran u njoj — bez toga bi ih imena vakata, koja su različite
   dužine, razvukla svako na svoju mjeru i red bi izgledao razbacano.

   Jedina mjera koja se i dalje pogađa je dužina POPUNJENOG dijela trake;
   njeni rubovi su rubovi widgeta, pa se greška ne vidi kao neporavnatost.

   NIJEDNO PRAVILO NIJE OVDJE. Koji je vakat na redu, koji se zikr trenutno
   uči i koliko ga je urađeno — sve dolazi gotovo sa `/api/widget`, iz istog
   `data.js` i `notification-tasks.js` po kojima radi i aplikacija.

   POSTAVLJANJE

     1. App Store -> Scriptable (besplatno, autor Simon B. Støvring)
     2. Scriptable -> "+" -> nalijepi ovaj fajl -> ključ gore lijevo ->
        Name: "Vaktija" -> Done
     3. Pritisni "play" jednom, da se vidi kako izgleda
     4. Početni ekran -> drži prst dok ikonice ne zaigraju -> "+" gore lijevo
        -> Scriptable -> izaberi SREDNJI widget -> Add Widget
     5. Drži prst na novom widgetu -> Edit Widget -> Script: Vaktija,
        When Interacting: Run Script
   ========================================================================== */

/* ---------------------------- POSTAVKE ---------------------------------- */

const APP = "https://daily-dua-reminder.vercel.app";
const IME = "Haris";

/* Šta se otvara na dodir.

   Obična https adresa otvara Safari, a ne aplikaciju sa početnog ekrana:
   iOS nema način da se web aplikacija pozove adresom. Zaobilazi se
   prečicom — Shortcuts umije otvoriti instaliranu PWA kao svaku drugu
   aplikaciju:

     Shortcuts -> "+" -> Add Action -> "Open App" -> izaberi "Zikr"
     (aplikacija sa početnog ekrana) -> nazovi prečicu "Zikr" -> Done

   Ime prečice mora biti isto kao ovdje. Prazno ("") vraća otvaranje u
   Safariju. */
const OTVORI = "shortcuts://run-shortcut?name=Zikr";

/* ------------------------------------------------------------------------ */

/* Boje su iste one iz style.css, i u istim ulogama: podloga je boja strane,
   naslov je --primary, odbrojavanje --accent, traka zikra ista kao trake
   napretka u zaglavlju aplikacije (--primary dok traje, --done kad je
   gotovo). Prepisane su jer widget ne može čitati CSS aplikacije; kad se
   paleta tamo promijeni, ovdje se prepiše. */
const PALETA = {
  dan: {
    pozadina: "#faf7f0",     /* --background */
    podloga: "#f3efe4",      /* --background-alt: prazan dio trake */
    tekst: "#1c1c19",        /* --text */
    glavna: "#1e4438",       /* --primary: naslovi i popunjena traka */
    zlatna: "#b8925a",       /* --accent: odbrojavanje, naredni vakat */
    tiha: "#7a746a",         /* --muted */
    gotovo: "#2f7a55",       /* --done: završeno */
    linija: "#e7e0d2"        /* --line */
  },
  noc: {
    pozadina: "#0f1512",
    podloga: "#182220",
    tekst: "#e9e5db",
    glavna: "#cfe3d6",
    zlatna: "#d8b27c",
    tiha: "#989286",
    gotovo: "#4fb883",
    linija: "#26302b"
  }
};

/* Ikonice vakata — SF Symbols, isti skup koji koristi i sam iOS, pa izgledaju
   kao da su odavde. Put dana u šest znakova: noć, izlazak, puno sunce, sunce
   na zalasku, zalazak, noć. */
const ZNAKOVI = {
  zora: "moon.stars.fill",
  izlazak: "sunrise.fill",
  podne: "sun.max.fill",
  ikindija: "sun.min.fill",
  aksam: "sunset.fill",
  jacija: "moon.fill"
};

/* Tema prati APLIKACIJU, ne telefon.

   Režim izabran u postavkama ("auto", "dan", "noc") putuje kroz config na
   server, pa ga widget dobija uz sve ostalo. Kad je "auto", boju bira doba
   dana — isti sat po kojem se i aplikacija prelama (dan od 07:00, noć od
   19:00), a taj račun je već napravljen na serveru (`doba`).

   Tako widget i aplikacija nikad ne stoje u dvije boje. Promjena u
   postavkama stigne do widgeta pri prvom sljedećem osvježavanju — minutu do
   tri (vidi `refreshAfterDate`). */
function paleta(data) {
  const rezim = (data && data.tema) || "auto";
  if (rezim === "dan" || rezim === "noc") { return PALETA[rezim]; }
  return PALETA[(data && data.doba) === "noc" ? "noc" : "dan"];
}

/* Jedina mjera koja se pogađa: koliko je widget širok iznutra. Treba samo
   popunjenom dijelu trake — njeni rubovi su rubovi widgeta, pa se greška ne
   vidi kao neporavnatost. */
const RUB = 18;

function unutrasnjaSirina(mali) {
  const tabela = {
    440: { mali: 170, srednji: 364 },
    430: { mali: 170, srednji: 364 },
    428: { mali: 170, srednji: 364 },
    414: { mali: 169, srednji: 360 },
    402: { mali: 162, srednji: 344 },
    393: { mali: 158, srednji: 338 },
    390: { mali: 158, srednji: 338 },
    375: { mali: 155, srednji: 329 }
  };

  let ekran = 390;
  try { ekran = Math.round(Device.screenSize().width); } catch (e) { ekran = 390; }

  const mjere = tabela[ekran] || { mali: 155, srednji: 329 };
  return (mali ? mjere.mali : mjere.srednji) - 2 * RUB;
}

/* --------------------------- podaci ------------------------------------- */

async function ucitaj() {
  try {
    const req = new Request(APP + "/api/widget");
    req.timeoutInterval = 10;
    req.headers = { "X-Zikr-User": IME };

    const data = await req.loadJSON();
    /* `datum` ima samo pravi odgovor iz aplikacije — i onaj u kojem vaktije
       nema jer je putovanje uključeno. */
    return (data && data.datum) ? data : null;
  } catch (e) {
    return null;
  }
}

/* "2 h 13 min" daleko, "12 min" blizu. Bez sekundi: widget se ne osvježava
   svake sekunde, pa bi broj koji stoji lagao. */
function preostalo(sekundi) {
  const ukupno = Math.max(0, sekundi || 0);
  const h = Math.floor(ukupno / 3600);
  const m = Math.round((ukupno % 3600) / 60);
  if (h > 0) { return h + " h " + m + " min"; }
  return Math.max(1, m) + " min";
}

function postotak(zikr) {
  if (!zikr || !zikr.total) { return 0; }
  if (zikr.gotovo) { return 100; }
  return Math.round((zikr.done / zikr.total) * 100);
}

/* Naslov podsjetnika nosi emoji ("Dnevni zikr ☀️"); u widgetu stoji sitnim
   verzalom, gdje emoji samo pravi rupu u redu. */
function imeZikra(zikr) {
  return String((zikr && zikr.naslov) || "Zikr")
    .replace(/[^\p{L}\p{N}\s.-]/gu, "")
    .trim()
    .toUpperCase();
}

/* ---------------------------- graditelji -------------------------------- */

function boja(hex) { return new Color(hex); }

function tekst(stack, sadrzaj, hex, velicina, masno) {
  const t = stack.addText(sadrzaj);
  t.textColor = boja(hex);
  t.font = masno
    ? Font.semiboldSystemFont(velicina)
    : Font.systemFont(velicina);
  t.lineLimit = 1;
  return t;
}

/* Traka: okvir se rasteže koliko widget ima (`Size(0, h)` znači "uzmi svu
   širinu"), a unutra stoji popunjeni dio. Zato su joj rubovi uvijek tačno
   rubovi widgeta, ma koliko telefon bio širok. */
function traka(w, dio, sirina, visina, punaBoja, praznaBoja) {
  const okvir = w.addStack();
  okvir.size = new Size(0, visina);
  okvir.backgroundColor = boja(praznaBoja);
  okvir.cornerRadius = visina / 2;
  okvir.setPadding(0, 0, 0, 0);

  const koliko = Math.max(0, Math.min(1, dio));
  if (koliko > 0) {
    const puna = okvir.addStack();
    puna.size = new Size(Math.max(visina, Math.round(koliko * sirina)), visina);
    puna.backgroundColor = boja(punaBoja);
    puna.cornerRadius = visina / 2;
  }

  okvir.addSpacer();
  return okvir;
}

/* "Izlazak sunca" u stupac ne stane, a skraćeno se i dalje zna šta je. */
function kratkoIme(naziv) {
  return naziv === "Izlazak sunca" ? "Izlazak" : naziv;
}

/* Jedan stubac dana: ikonica, ime vakta, vrijeme.

   ŠIRINA STUPCA JE ZAKLJUČANA (`kol.size`). To je jedini način da imena
   ostanu unutra a red ne izgleda razbacano: imena su različite dužine, pa bi
   inače svaki stubac bio svoje širine i razmaci bi ispali nejednaki. Sadržaj
   se u zaključanoj kutiji centrira, pa se ikonica, ime i vrijeme poravnaju
   sami — i međusobno, i sa susjednim stupcem.

   `minimumScaleFactor` je zaštita za najduže ime na najužem telefonu: prije
   nego što bi ispalo iz stupca, slovo se malo smanji. */
function stubac(red, v, naredni, boje, sirinaStupca) {
  const kol = red.addStack();
  kol.layoutVertically();
  kol.centerAlignContent();
  kol.size = new Size(sirinaStupca, 0);

  const jaka = naredni ? boje.zlatna : (v.proslo ? boje.tiha : boje.glavna);
  const obicna = naredni ? boje.zlatna : (v.proslo ? boje.tiha : boje.tekst);

  try {
    const znak = SFSymbol.named(ZNAKOVI[v.id] || "circle.fill");
    znak.applyFont(Font.systemFont(15));
    const img = kol.addImage(znak.image);
    img.imageSize = new Size(15, 15);
    img.tintColor = boja(jaka);
    img.resizable = true;
  } catch (e) {
    /* Starije okruženje bez tog znaka — stubac ostaje bez ikonice, ime i
       vrijeme su i dalje tu. */
  }

  kol.addSpacer(3);

  const ime = tekst(kol, kratkoIme(v.naziv), naredni ? boje.zlatna : boje.tiha,
    9.5, naredni);
  ime.centerAlignText();
  ime.minimumScaleFactor = 0.7;

  const kad = tekst(kol, v.vrijeme, obicna, 12.5, true);
  kad.centerAlignText();
  kad.minimumScaleFactor = 0.8;

  if (v.proslo && !naredni) {
    ime.textOpacity = 0.6;
    kad.textOpacity = 0.6;
  }

  return kol;
}

/* ----------------------------- blokovi ---------------------------------- */

/* 1. Koji namaz nastupa i za koliko. */
function blokVakat(w, data, boje, veliko) {
  if (data.putovanje) {
    tekst(w, "NA PUTU", boje.tiha, 10, true);
    w.addSpacer(3);
    tekst(w, "Vaktija isključena", boje.tekst, veliko ? 17 : 15, true);
    return;
  }

  if (!data.vakat) {
    tekst(w, "VAKTIJA", boje.tiha, 10, true);
    w.addSpacer(3);
    tekst(w, "nije preuzeta", boje.tiha, veliko ? 15 : 13, true);
    return;
  }

  const red = w.addStack();
  red.layoutHorizontally();
  red.bottomAlignContent();

  tekst(red, data.vakat.naziv, boje.glavna, veliko ? 22 : 18, true);
  red.addSpacer();
  tekst(red, data.vakat.vrijeme, boje.tekst, veliko ? 22 : 18, true);

  w.addSpacer(2);
  tekst(w, "za " + preostalo(data.vakat.preostalo), boje.zlatna, veliko ? 13 : 12, true);
}

/* 2. Sva vremena dana, svako sa svojom ikonicom. */
function blokDan(w, data, boje, sirina) {
  const vakti = data.vakti || [];
  if (!vakti.length) { return; }

  /* Zaključana širina stupca, uz malo zraka koju pokupe rastegljivi razmaci
     između njih. Tako se sitna greška u procjeni širine widgeta pojavi kao
     razmak koji se malo skupi, a nikad kao odsječen stubac. */
  const sirinaStupca = Math.max(34, Math.floor(sirina / vakti.length) - 4);

  const red = w.addStack();
  red.layoutHorizontally();

  vakti.forEach(function (v, i) {
    if (i) { red.addSpacer(); }
    const naredni = data.vakat && !data.vakat.sutra && v.id === data.vakat.id;
    stubac(red, v, naredni, boje, sirinaStupca);
  });
}

/* 3. Postotak zikra.

   Boje su iste kao na trakama napretka u aplikaciji (`.pgroup` u style.css),
   da widget i zaglavlje ne govore u dvije boje o istoj stvari:

     prazan dio    --background-alt
     popunjen dio  --primary dok traje, --done kad je gotovo
     natpis        --muted dok traje, --done kad je gotovo
*/
function blokZikr(w, data, boje, sirina) {
  const dio = postotak(data.zikr);
  const zavrseno = dio >= 100;

  const red = w.addStack();
  red.layoutHorizontally();
  tekst(red, imeZikra(data.zikr), zavrseno ? boje.gotovo : boje.tiha, 10, true);
  red.addSpacer();
  tekst(red, dio + " %", zavrseno ? boje.gotovo : boje.tekst, 13, true);

  w.addSpacer(4);
  traka(w, dio / 100, sirina, 5,
    zavrseno ? boje.gotovo : boje.glavna, boje.podloga);
}

/* ----------------------------- raspored --------------------------------- */

function nacrtaj(data) {
  const boje = paleta(data);
  const mali = config.widgetFamily === "small";
  const sirina = unutrasnjaSirina(mali);

  const w = new ListWidget();
  w.backgroundColor = boja(boje.pozadina);
  w.setPadding(15, RUB, 15, RUB);
  w.url = OTVORI || APP;

  if (!data) {
    tekst(w, "NEMA VEZE", boje.tiha, 10, true);
    w.addSpacer(4);
    tekst(w, "Vaktija nije dostupna", boje.tekst, mali ? 13 : 15, true);
    w.refreshAfterDate = new Date(Date.now() + 3 * 60 * 1000);
    return w;
  }

  blokVakat(w, data, boje, !mali);

  /* Dan stane samo na širi widget: šest stubaca na 130 piksela se ne može
     pročitati. */
  if (!mali && !data.putovanje && (data.vakti || []).length) {
    w.addSpacer();
    blokDan(w, data, boje, sirina);
  }

  if (data.zikr) {
    w.addSpacer();
    blokZikr(w, data, boje, sirina);
  } else {
    w.addSpacer();
  }

  /* Osvježavanje se TRAŽI često — iOS to uzima kao molbu i sam odlučuje.
     Pred vakat svake minute, inače svake tri. */
  const blizu = data.vakat && !data.putovanje && data.vakat.preostalo < 30 * 60;
  w.refreshAfterDate = new Date(Date.now() + (blizu ? 60 : 180) * 1000);

  return w;
}

/* ----------------------------- start ------------------------------------ */

const widget = nacrtaj(await ucitaj());

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}

Script.complete();
