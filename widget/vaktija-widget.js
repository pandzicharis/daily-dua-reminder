/* ==========================================================================
   widget/vaktija-widget.js — widget za iPhone (Scriptable)

   Šta stoji na njemu:

     naredni vakat   ime, vrijeme i koliko ga još ima
     traka isteka    koliki je dio tekućeg vakta prošao — ista ona koja stoji
                     i na kartici u aplikaciji
     dan             svih šest vremena; prošla su prigušena, naredno zlatno
                     (samo srednji i veliki widget — na mali ne stane šest
                     stubaca a da se išta pročita)
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
     2. Scriptable -> "+" -> nalijepi ovaj fajl -> ključ gore lijevo ->
        Name: "Vaktija" -> Done
     3. Pritisni "play" jednom, da se vidi kako izgleda
     4. Početni ekran -> drži prst dok ikonice ne zaigraju -> "+" gore lijevo
        -> Scriptable -> izaberi SREDNJI widget -> Add Widget
     5. Drži prst na novom widgetu -> Edit Widget -> Script: Vaktija,
        When Interacting: Run Script

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

/* Koliko je traka široka. Widget nema način da pita "koliko me ima", a
   slika mora dobiti tačnu širinu u pikselima — pa se računa iz širine
   ekrana, koja je jedino što se zna. Odnosi su takvi da traka stane i na
   najužem (SE) i na najširem (Pro Max) telefonu, sa istim malim razmakom
   do desnog ruba. */
function sirinaTrake(mali) {
  var ekran = 393;
  try { ekran = Device.screenSize().width; } catch (e) { ekran = 393; }
  return Math.round(ekran * (mali ? 0.29 : 0.74));
}

/* Traka u widget. `imageSize` mora biti postavljen, inače Scriptable sliku
   razvuče preko cijelog reda i debljina se izgubi. */
function dodajTraku(stack, sirina, visina, dio, puna, prazna) {
  const img = stack.addImage(traka(sirina, visina, dio, puna, prazna));
  img.imageSize = new Size(sirina, visina);
  img.cornerRadius = visina / 2;
  return img;
}

/* Ime u stupcu dana. "Izlazak sunca" u šest stubaca ne stane ni na srednjem
   widgetu, a skraćeno se i dalje zna šta je. */
function kratko(naziv) {
  return naziv === "Izlazak sunca" ? "Izlazak" : naziv;
}

/* Svih šest vremena u jednom redu — isti luk dana kao na kartici u
   aplikaciji. Prošlo je prigušeno, naredno zlatno, ostalo obično. */
function dodajDan(w, data, boje) {
  const dan = w.addStack();
  dan.layoutHorizontally();

  data.vakti.forEach(function (v, i) {
    if (i) { dan.addSpacer(); }

    const kol = dan.addStack();
    kol.layoutVertically();
    kol.centerAlignContent();

    const naredni = data.vakat && !data.vakat.sutra && v.id === data.vakat.id;
    const bojaImena = naredni ? boje.zlatna : boje.tiha;
    const bojaVremena = naredni
      ? boje.zlatna
      : (v.proslo ? boje.tiha : boje.tekst);

    const ime = red(kol, kratko(v.naziv), bojaImena, 8, naredni ? "bold" : null);
    ime.centerAlignText();

    const kad = red(kol, v.vrijeme, bojaVremena, 11, "bold");
    kad.centerAlignText();

    /* Prošlo se ne briše nego prigušuje — dan se čita cijel, a ne samo ono
       što je ostalo. */
    if (v.proslo && !naredni) {
      ime.textOpacity = 0.55;
      kad.textOpacity = 0.55;
    }
  });
}

function dodajZikr(w, zikr, boje, sirina) {
  const dio = postotak(zikr);

  const linija = w.addStack();
  linija.layoutHorizontally();
  red(linija, imeZikra(zikr), boje.tiha, 9, "bold");
  linija.addSpacer();
  red(linija, dio + " %", dio >= 100 ? boje.gotovo : boje.tekst, 10, "bold");

  w.addSpacer(5);
  dodajTraku(w, sirina, 6, dio / 100, boje.gotovo, boje.linija);
}

/* Mali widget: šest stubaca na 130 piksela nema gdje stati, pa se dan
   izostavlja, a ono što ostaje se razvuče preko cijele visine — vakat u tri
   reda (ime, vrijeme, odbrojavanje) umjesto u jednom. */
function nacrtajMali(w, data, boje) {
  const SIRINA = sirinaTrake(true);

  red(w, data.putovanje ? "NA PUTU" : "NAREDNI VAKAT", boje.tiha, 9, "bold");
  w.addSpacer(5);

  if (data.putovanje) {
    red(w, "Vaktija", boje.tekst, 15, "bold");
    red(w, "isključena", boje.tekst, 15, "bold");
  } else if (data.vakat) {
    red(w, data.vakat.naziv, boje.glavna, 16, "bold");
    red(w, data.vakat.vrijeme, boje.tekst, 22, "bold");
    w.addSpacer(3);
    red(w, "za " + preostalo(data.vakat.preostalo), boje.zlatna, 10, "bold");
    w.addSpacer(7);
    dodajTraku(w, SIRINA, 4, data.vakat.istek || 0, boje.zlatna, boje.linija);
  } else {
    red(w, "Vaktija nije", boje.tiha, 13);
    red(w, "preuzeta", boje.tiha, 13);
  }

  w.addSpacer();

  if (data.zikr) { dodajZikr(w, data.zikr, boje, SIRINA); }
}

/* Srednji i veliki: sve staje, pa stoji i cijeli dan. Razmaci koji se
   rastežu su namjerno DVA — jedan iznad dana, jedan iznad zikra — pa se
   prazan prostor podijeli na dva mjesta umjesto da se sav skupi na dnu. */
function nacrtajSiri(w, data, boje) {
  const SIRINA = sirinaTrake(false);

  const glava = w.addStack();
  glava.layoutHorizontally();
  red(glava, data.putovanje ? "NA PUTU" : "NAREDNI VAKAT", boje.tiha, 9, "bold");
  glava.addSpacer();
  if (data.vakat && !data.putovanje) {
    red(glava, "za " + preostalo(data.vakat.preostalo), boje.zlatna, 10, "bold");
  }

  w.addSpacer(5);

  const vakatRed = w.addStack();
  vakatRed.layoutHorizontally();
  vakatRed.centerAlignContent();

  if (data.putovanje) {
    red(vakatRed, "Vaktija isključena", boje.tekst, 17, "bold");
  } else if (data.vakat) {
    red(vakatRed, data.vakat.naziv, boje.glavna, 19, "bold");
    vakatRed.addSpacer();
    red(vakatRed, data.vakat.vrijeme, boje.tekst, 19, "bold");
  } else {
    red(vakatRed, "Vaktija nije preuzeta", boje.tiha, 14);
  }

  if (data.vakat && !data.putovanje) {
    w.addSpacer(8);
    dodajTraku(w, SIRINA, 4, data.vakat.istek || 0, boje.zlatna, boje.linija);
  }

  if (!data.putovanje && Array.isArray(data.vakti) && data.vakti.length) {
    w.addSpacer();
    dodajDan(w, data, boje);
  }

  if (data.zikr) {
    w.addSpacer();
    dodajZikr(w, data.zikr, boje, SIRINA);
  }
}

function nacrtaj(data) {
  const boje = PALETA[(data && data.doba) === "noc" ? "noc" : "dan"];
  const mali = config.widgetFamily === "small";

  const w = new ListWidget();
  w.backgroundColor = new Color(boje.pozadina);
  w.setPadding(13, 15, 13, 15);
  /* Klik po widgetu otvara aplikaciju. */
  w.url = APP;

  if (!data) {
    red(w, "NEMA VEZE", boje.tiha, 9, "bold");
    w.addSpacer(4);
    red(w, "Vaktija nije", boje.tekst, mali ? 14 : 16, "bold");
    red(w, "dostupna", boje.tekst, mali ? 14 : 16, "bold");
    w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
    return w;
  }

  if (mali) { nacrtajMali(w, data, boje); } else { nacrtajSiri(w, data, boje); }

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
