/* ==========================================================================
   widget/vaktija-widget.js — widget za iPhone (Scriptable)

   Dvije stvari, i ništa više:

     naredni vakat   ime, vrijeme i koliko ga još ima
     zikr            koliki je dio današnjeg zikra urađen, u postotku

   PWA ne može dati widget: iOS ga izdaje samo native aplikaciji preko
   WidgetKit-a. Scriptable je zaobilaznica koja radi bez Xcode-a i bez Apple
   Developer naloga — besplatna aplikacija (autor Simon B. Støvring) koja
   izvršava JavaScript i smije crtati widget na početnom ekranu.

   NIJEDNO PRAVILO NIJE OVDJE. Koji je vakat na redu, koji se zikr trenutno
   uči (dnevni danju, večernji uveče, petkom prijepodne petački), koliko ga je
   urađeno i je li dan ili noć — sve dolazi gotovo sa `/api/widget`, iz istog
   `data.js` i `notification-tasks.js` po kojima radi i aplikacija. Widget
   samo crta. Zato se, kad se u aplikaciji nešto promijeni, ovaj fajl ne dira.

   POSTAVLJANJE

     1. App Store -> Scriptable (besplatno)
     2. Scriptable -> "+" -> nalijepi ovaj fajl -> nazovi ga "Vaktija"
     3. Početni ekran -> drži prst -> "+" -> Scriptable -> mali ili srednji
        widget -> Edit Widget -> Script: Vaktija

   OSVJEŽAVANJE. iOS sam odlučuje kada će widget osvježiti; ovdje se samo
   traži (`refreshAfterDate`). Pred vakat se traži češće, ali odbrojavanje
   svejedno ide u minutama — sekunde bi stajale i lagale.
   ========================================================================== */

const APP = "https://daily-dua-reminder.vercel.app";
const IME = "Haris";

/* Boje su iste one iz style.css — dvije palete, jedna za dan, jedna za noć.
   Prepisane su jer widget ne može čitati CSS aplikacije; kad se paleta tamo
   promijeni, ovdje se prepiše. */
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

/* "2 h 13 min" daleko, "12 min" blizu — isto pravilo kao u aplikaciji, samo
   bez sekundi: widget se ne osvježava svake sekunde, pa bi broj koji stoji
   lagao. */
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

/* ---------------------------- crtanje ----------------------------------- */

/* Traka napretka. Scriptable nema element trake, pa se crta u sliku —
   podloga, pa preko nje popunjeni dio. Zaobljenje daje `cornerRadius` na
   slici. */
function traka(sirina, visina, dio, puna, prazna) {
  const ctx = new DrawContext();
  ctx.size = new Size(sirina, visina);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  ctx.setFillColor(new Color(prazna));
  ctx.fillRect(new Rect(0, 0, sirina, visina));

  const koliko = Math.max(0, Math.min(1, dio)) * sirina;
  if (koliko > 0) {
    ctx.setFillColor(new Color(puna));
    ctx.fillRect(new Rect(0, 0, Math.max(visina, koliko), visina));
  }

  return ctx.getImage();
}

function red(stack, tekst, boja, velicina, tezina) {
  const t = stack.addText(tekst);
  t.textColor = new Color(boja);
  t.font = tezina === "bold"
    ? Font.semiboldSystemFont(velicina)
    : Font.systemFont(velicina);
  t.lineLimit = 1;
  return t;
}

function nacrtaj(data) {
  const boje = PALETA[(data && data.doba) === "noc" ? "noc" : "dan"];
  const mali = config.widgetFamily === "small";
  const sirina = mali ? 130 : 290;

  const w = new ListWidget();
  w.backgroundColor = new Color(boje.pozadina);
  w.setPadding(14, 15, 14, 15);
  /* Klik po widgetu otvara aplikaciju. */
  w.url = APP;

  if (!data) {
    red(w, "NEMA VEZE", boje.tiha, 9, "bold");
    w.addSpacer(4);
    red(w, "Vaktija nije dostupna", boje.tekst, mali ? 14 : 16, "bold");
    w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
    return w;
  }

  /* --- naredni vakat --- */
  const glava = w.addStack();
  glava.layoutHorizontally();
  red(glava, data.putovanje ? "NA PUTU" : "NAREDNI VAKAT", boje.tiha, 9, "bold");
  glava.addSpacer();
  if (data.vakat && !data.putovanje) {
    red(glava, preostalo(data.vakat.preostalo), boje.zlatna, 10, "bold");
  }

  w.addSpacer(5);

  const vakatRed = w.addStack();
  vakatRed.layoutHorizontally();
  vakatRed.centerAlignContent();

  if (data.putovanje) {
    red(vakatRed, "Vaktija isključena", boje.tekst, mali ? 15 : 17, "bold");
  } else if (data.vakat) {
    red(vakatRed, data.vakat.naziv, boje.glavna, mali ? 17 : 20, "bold");
    vakatRed.addSpacer();
    red(vakatRed, data.vakat.vrijeme, boje.tekst, mali ? 17 : 20, "bold");
  } else {
    red(vakatRed, "Vaktija nije preuzeta", boje.tiha, 13);
  }

  /* Razmak koji se rasteže — zikr time uvijek sjedi na dnu widgeta, ma koje
     veličine bio. */
  w.addSpacer();

  /* --- zikr, u postotku --- */
  if (data.zikr) {
    const dio = postotak(data.zikr);

    const linija = w.addStack();
    linija.layoutHorizontally();
    red(linija, imeZikra(data.zikr), boje.tiha, 9, "bold");
    linija.addSpacer();
    red(linija, dio + " %", dio >= 100 ? boje.gotovo : boje.tekst, 10, "bold");

    w.addSpacer(5);

    const img = w.addImage(traka(sirina, 6, dio / 100, boje.gotovo, boje.linija));
    img.cornerRadius = 3;
    img.imageSize = new Size(sirina, 6);
  }

  /* Pred vakat se traži češće osvježavanje. iOS ovo uzima kao molbu, ne kao
     naredbu. */
  const blizu = data.vakat && !data.putovanje && data.vakat.preostalo < 30 * 60;
  w.refreshAfterDate = new Date(Date.now() + (blizu ? 2 : 10) * 60 * 1000);

  return w;
}

/* ----------------------------- start ------------------------------------ */

const widget = nacrtaj(await ucitaj());

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  /* Pokretanje iz same aplikacije Scriptable — da se vidi kako izgleda. */
  await widget.presentMedium();
}

Script.complete();
