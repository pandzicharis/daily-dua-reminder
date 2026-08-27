/* ==========================================================================
   widget/vaktija-widget.js — widget za iPhone (Scriptable)

   Tri bloka, jedan ispod drugog, i ništa više:

     1. koji namaz nastupa i za koliko
     2. sva vremena dana, svako sa svojom ikonicom
     3. postotak zikra, sa trakom

   MINIMALIZAM JE OVDJE PRAVILO, NE UKUS. Widget se gleda u prolazu, sekundu
   ili dvije: sve što nije jedno od to troje samo oduzima mjesto onome što
   jeste.

   ZAŠTO NEMA CRTANJA U SLIKU. Prethodna verzija je dan crtala kao sliku, da
   bi brojevi sjeli tačno ispod tačaka. Cijena je bila to što slika mora
   dobiti širinu u pikselima, a widget svoju širinu ne zna — pa je sve
   ostalo poravnato prema pogođenoj mjeri, a ne prema samom widgetu.

   Sada se sve slaže Scriptable-ovim redovima i stupcima, koji se sami
   razvuku koliko widget ima. Stupci su jednaki jer im je sadržaj jednak:
   ikonica i vrijeme, bez imena — imena su različite dužine, pa su upravo ona
   razvlačila stupce i činila da red izgleda razbacano.

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

/* Boje su iste one iz style.css. Prepisane su jer widget ne može čitati CSS
   aplikacije; kad se paleta tamo promijeni, ovdje se prepiše. */
const PALETA = {
  dan: {
    pozadina: "#faf7f0",
    tekst: "#1c1c19",
    glavna: "#1e4438",
    zlatna: "#b8925a",
    tiha: "#7a746a",
    gotovo: "#2f7a55",
    linija: "#e7e0d2"
  },
  noc: {
    pozadina: "#0f1512",
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

/* Tema prati REŽIM TELEFONA, ne sat: to se mijenja rukom i očekuje da se
   vidi odmah, a iOS widget ponovo iscrta čim se režim promijeni. `doba` sa
   servera ostaje kao rezerva. */
function paleta(data) {
  try {
    return Device.isUsingDarkAppearance() ? PALETA.noc : PALETA.dan;
  } catch (e) {
    return PALETA[(data && data.doba) === "noc" ? "noc" : "dan"];
  }
}

/* Jedina mjera koja se pogađa: koliko je widget širok iznutra. Treba samo
   popunjenom dijelu trake — njeni rubovi su rubovi widgeta, pa se greška ne
   vidi kao neporavnatost. */
const RUB = 14;

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

/* Jedan stubac dana: ikonica pa vrijeme. Bez imena vakta — imena su različite
   dužine i upravo su ona razvlačila stupce, pa je red izgledao razbacano.
   Ikonica kaže isto, a svaka je iste širine. */
function stubac(red, v, naredni, boje) {
  const kol = red.addStack();
  kol.layoutVertically();
  kol.centerAlignContent();

  const bojaZnaka = naredni
    ? boje.zlatna
    : (v.proslo ? boje.tiha : boje.glavna);

  try {
    const znak = SFSymbol.named(ZNAKOVI[v.id] || "circle.fill");
    znak.applyFont(Font.systemFont(13));
    const img = kol.addImage(znak.image);
    img.imageSize = new Size(14, 14);
    img.tintColor = boja(bojaZnaka);
    img.resizable = true;
  } catch (e) {
    /* Starije okruženje bez tog znaka — stubac ostaje bez ikonice, vrijeme
       je i dalje tu. */
  }

  kol.addSpacer(3);

  const t = tekst(kol, v.vrijeme,
    naredni ? boje.zlatna : (v.proslo ? boje.tiha : boje.tekst),
    11, true);
  t.centerAlignText();

  if (v.proslo && !naredni) { t.textOpacity = 0.6; }
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

  tekst(red, data.vakat.naziv, boje.glavna, veliko ? 20 : 17, true);
  red.addSpacer();
  tekst(red, data.vakat.vrijeme, boje.tekst, veliko ? 20 : 17, true);

  w.addSpacer(2);
  tekst(w, "za " + preostalo(data.vakat.preostalo), boje.zlatna, veliko ? 12 : 11, true);
}

/* 2. Sva vremena dana, svako sa svojom ikonicom. */
function blokDan(w, data, boje) {
  const red = w.addStack();
  red.layoutHorizontally();

  (data.vakti || []).forEach(function (v, i) {
    if (i) { red.addSpacer(); }
    const naredni = data.vakat && !data.vakat.sutra && v.id === data.vakat.id;
    stubac(red, v, naredni, boje);
  });
}

/* 3. Postotak zikra. */
function blokZikr(w, data, boje, sirina) {
  const dio = postotak(data.zikr);

  const red = w.addStack();
  red.layoutHorizontally();
  tekst(red, imeZikra(data.zikr), boje.tiha, 9, true);
  red.addSpacer();
  tekst(red, dio + " %", dio >= 100 ? boje.gotovo : boje.tekst, 11, true);

  w.addSpacer(4);
  traka(w, dio / 100, sirina, 5,
    dio >= 100 ? boje.gotovo : boje.zlatna, boje.linija);
}

/* ----------------------------- raspored --------------------------------- */

function nacrtaj(data) {
  const boje = paleta(data);
  const mali = config.widgetFamily === "small";
  const sirina = unutrasnjaSirina(mali);

  const w = new ListWidget();
  w.backgroundColor = boja(boje.pozadina);
  w.setPadding(13, RUB, 13, RUB);
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
    blokDan(w, data, boje);
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
