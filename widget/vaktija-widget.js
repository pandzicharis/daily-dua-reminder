/* ==========================================================================
   widget/vaktija-widget.js — widget za iPhone (Scriptable)

   Šta stoji na njemu:

     naredni vakat   ime, vrijeme i koliko ga još ima
     linija dana     svih šest vremena na PRAVIM razmacima — jutro je gusto,
                     popodne rijetko, tačno kako dan i teče — sa oznakom
                     dokle se stiglo
     prsten zikra    koliki je dio današnjeg zikra urađen, u postotku

   NIJEDNO PRAVILO NIJE OVDJE. Koji je vakat na redu, koji se zikr trenutno
   uči (dnevni danju, večernji uveče, petkom prijepodne petački), koliko ga je
   urađeno i koliki je dio tekućeg vakta istekao — sve dolazi gotovo sa
   `/api/widget`, iz istog `data.js` i `notification-tasks.js` po kojima radi
   i aplikacija. Widget samo crta.

   ZAŠTO SE LINIJA DANA I PRSTEN CRTAJU KAO SLIKA. Scriptable slaže sadržaj u
   redove i stupce, a razmak između njih se rasteže — brojevi ispod tačaka bi
   se pri tome razišli sa tačkama, i to različito na svakom telefonu. U slici
   se koordinate računaju same, pa tačka i broj ispod nje stoje na istom
   pikselu na svakom ekranu.

   POSTAVLJANJE

     1. App Store -> Scriptable (besplatno, autor Simon B. Støvring)
     2. Scriptable -> "+" -> nalijepi ovaj fajl -> ključ gore lijevo ->
        Name: "Vaktija" -> Done
     3. Pritisni "play" jednom, da se vidi kako izgleda
     4. Početni ekran -> drži prst dok ikonice ne zaigraju -> "+" gore lijevo
        -> Scriptable -> izaberi SREDNJI widget -> Add Widget
     5. Drži prst na novom widgetu -> Edit Widget -> Script: Vaktija,
        When Interacting: Run Script

   DODIR OTVARA APLIKACIJU, NE SAFARI. Vidi `OTVORI` ispod.
   ========================================================================== */

/* ---------------------------- POSTAVKE ---------------------------------- */

const APP = "https://daily-dua-reminder.vercel.app";
const IME = "Haris";

/* Šta se otvara na dodir.

   Obična https adresa bi otvorila Safari, a ne aplikaciju sa početnog
   ekrana: iOS nema način da se web aplikacija pozove adresom. Zaobilazi se
   prečicom — Shortcuts ume otvoriti instaliranu PWA kao svaku drugu
   aplikaciju:

     Shortcuts -> "+" -> Add Action -> "Open App" -> izaberi "Zikr"
     (aplikacija sa početnog ekrana) -> nazovi prečicu "Zikr" -> Done

   Ime prečice mora biti isto kao ovdje. Na dodir kratko bljesne Shortcuts pa
   se otvori aplikacija.

   Ostavi li se prazno (""), dodir otvara APP u Safariju. */
const OTVORI = "shortcuts://run-shortcut?name=Zikr";

/* ------------------------------------------------------------------------ */

/* Boje su iste one iz style.css — dvije palete, jedna za dan, jedna za noć.
   Prepisane su jer widget ne može čitati CSS aplikacije; kad se paleta tamo
   promijeni, ovdje se prepiše. */
const PALETA = {
  dan: {
    pozadina: "#faf7f0",
    ploca: "#fffdf8",
    tekst: "#1c1c19",
    glavna: "#1e4438",
    zlatna: "#b8925a",
    tiha: "#7a746a",
    gotovo: "#2f7a55",
    linija: "#e7e0d2"
  },
  noc: {
    pozadina: "#0f1512",
    ploca: "#16201c",
    tekst: "#e9e5db",
    glavna: "#cfe3d6",
    zlatna: "#d8b27c",
    tiha: "#989286",
    gotovo: "#4fb883",
    linija: "#26302b"
  }
};

/* Tema prati POSTAVKU TELEFONA, ne sat.

   Prije je boju birao server, po dobu dana (07:00–19:00). To znači da je
   widget ostajao svijetao i kad je cijeli telefon prešao u tamni režim, i
   obrnuto — a upravo se to mijenja rukom i očekuje da se odmah vidi. iOS
   widget ponovo iscrta čim se režim promijeni, pa je ovo i jedino što se
   primijeni odmah.

   `doba` sa servera ostaje kao rezerva za okruženje koje ne zna reći koji je
   režim. */
function paleta(data) {
  try {
    return Device.isUsingDarkAppearance() ? PALETA.noc : PALETA.dan;
  } catch (e) {
    return PALETA[(data && data.doba) === "noc" ? "noc" : "dan"];
  }
}

/* Koliko je widget širok. Scriptable to ne može pitati, a slike moraju dobiti
   tačnu širinu u pikselima — pa se čita iz širine ekrana. Brojevi su
   Appleove mjere widgeta po veličini ekrana; nepoznat ekran dobija najuži
   raspored, koji stane svugdje. */
const RUB = 14;

function sirinaWidgeta(mali) {
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

function uMinute(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
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

function boja(hex) { return new Color(hex); }

function red(stack, tekst, hex, velicina, tezina) {
  const t = stack.addText(tekst);
  t.textColor = boja(hex);
  t.font = tezina === "bold"
    ? Font.semiboldSystemFont(velicina)
    : Font.systemFont(velicina);
  t.lineLimit = 1;
  return t;
}

/* --- linija dana ---------------------------------------------------------
   Šest tačaka na PRAVIM razmacima između zore i jacije: jutro je gusto,
   popodne rijetko, i dan se vidi onakav kakav jeste. Ispod svake tačke stoji
   njeno vrijeme, u istoj slici — pa se broj i tačka ne mogu razići.

   Prošli dio linije je pun, ostatak prazan, a na mjestu "sada" stoji prsten:
   to je isti podatak koji na kartici u aplikaciji nosi traka isteka, samo
   ovdje razvučen preko cijelog dana.
   ------------------------------------------------------------------------- */

function nacrtajDan(sirina, data, boje) {
  const VISINA = 34;
  const LINIJA_Y = 8;
  /* Krajnje oznake ("4:19", "21:04") moraju stati cijele, pa linija ne ide
     do samog ruba slike. Razmak prati veličinu slova ispod tačaka. */
  const RUB_X = 19;

  const ctx = new DrawContext();
  ctx.size = new Size(sirina, VISINA);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const tacke = (data.vakti || []).map(function (v) {
    return { v: v, m: uMinute(v.vrijeme) };
  }).filter(function (t) { return t.m !== null; });

  if (tacke.length < 2) { return ctx.getImage(); }

  const prvi = tacke[0].m;
  const zadnji = tacke[tacke.length - 1].m;
  const raspon = Math.max(1, zadnji - prvi);
  const sirinaLinije = sirina - 2 * RUB_X;

  function x(minuta) {
    const k = Math.max(0, Math.min(1, (minuta - prvi) / raspon));
    return RUB_X + k * sirinaLinije;
  }

  /* Gdje je "sada": iz narednog vakta i koliko ga je ostalo. Poslije jacije
     je naredni sutrašnja zora, pa se marker drži na kraju linije. */
  let sada = null;
  if (data.vakat) {
    const cilj = uMinute(data.vakat.vrijeme);
    if (cilj !== null) {
      sada = data.vakat.sutra
        ? zadnji
        : cilj - Math.round(data.vakat.preostalo / 60);
    }
  }

  /* prazna linija */
  ctx.setFillColor(boja(boje.linija));
  ctx.fillRect(new Rect(RUB_X, LINIJA_Y - 1, sirinaLinije, 2));

  /* prošli dio */
  if (sada !== null) {
    const do_ = x(sada);
    ctx.setFillColor(boja(boje.zlatna));
    ctx.fillRect(new Rect(RUB_X, LINIJA_Y - 1, Math.max(0, do_ - RUB_X), 2));
  }

  tacke.forEach(function (t) {
    const tx = x(t.m);
    const naredni = data.vakat && !data.vakat.sutra && t.v.id === data.vakat.id;
    const r = naredni ? 4.5 : 3;

    /* Naredni vakat je pun zlatni krug sa svijetlim okvirom, prošlo je
       prigušeno, a ono što tek dolazi je obična tačka. */
    ctx.setFillColor(boja(naredni ? boje.zlatna : (t.v.proslo ? boje.tiha : boje.linija)));
    ctx.fillEllipse(new Rect(tx - r, LINIJA_Y - r, 2 * r, 2 * r));

    if (naredni) {
      ctx.setStrokeColor(boja(boje.pozadina));
      ctx.setLineWidth(1.5);
      ctx.strokeEllipse(new Rect(tx - r - 1, LINIJA_Y - r - 1, 2 * r + 2, 2 * r + 2));
    }

    /* Vrijeme ispod tačke: dovoljno krupno da se pročita u prolazu, i
       polumasno — na tankom pismu se sitne cifre stapaju sa podlogom. */
    ctx.setFont(naredni ? Font.boldSystemFont(11) : Font.mediumSystemFont(11));
    ctx.setTextColor(boja(naredni ? boje.zlatna : (t.v.proslo ? boje.tiha : boje.tekst)));
    ctx.setTextAlignedCenter();
    ctx.drawTextInRect(t.v.vrijeme, new Rect(tx - 21, LINIJA_Y + 8, 42, 15));
  });

  return ctx.getImage();
}

/* --- prsten zikra --------------------------------------------------------
   Krug umjesto trake: traka bi u desnom stupcu bila uska i kratka, a krug
   nosi isti podatak i popuni prostor koji bi inače ostao prazan. Postotak
   stoji u sredini, pa se čita bez traženja.

   Scriptable nema luk, pa se crta kao niz kratkih linija po kružnici —
   dovoljno gusto da se na 54 piksela ne vidi da nije luk.
   ------------------------------------------------------------------------- */

function nacrtajPrsten(velicina, dio, boje) {
  const DEBLJINA = 5;

  const ctx = new DrawContext();
  ctx.size = new Size(velicina, velicina);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const sredina = velicina / 2;
  const r = sredina - DEBLJINA / 2 - 1;

  ctx.setLineWidth(DEBLJINA);
  ctx.setStrokeColor(boja(boje.linija));
  ctx.strokeEllipse(new Rect(sredina - r, sredina - r, 2 * r, 2 * r));

  const koliko = Math.max(0, Math.min(1, dio));
  if (koliko > 0) {
    const put = new Path();
    const koraka = Math.max(2, Math.round(koliko * 60));

    for (let i = 0; i <= koraka; i += 1) {
      /* Kreće od vrha (-90°) i ide u smjeru kazaljke. */
      const ugao = -Math.PI / 2 + (i / koraka) * koliko * 2 * Math.PI;
      const tacka = new Point(sredina + r * Math.cos(ugao), sredina + r * Math.sin(ugao));
      if (i === 0) { put.move(tacka); } else { put.addLine(tacka); }
    }

    ctx.setStrokeColor(boja(koliko >= 1 ? boje.gotovo : boje.zlatna));
    ctx.addPath(put);
    ctx.strokePath();
  }

  ctx.setFont(Font.boldSystemFont(velicina > 50 ? 17 : 15));
  ctx.setTextColor(boja(koliko >= 1 ? boje.gotovo : boje.tekst));
  ctx.setTextAlignedCenter();
  ctx.drawTextInRect(Math.round(koliko * 100) + "%",
    new Rect(0, sredina - 11, velicina, 22));

  return ctx.getImage();
}

function dodajSliku(stack, slika, sirina, visina) {
  const img = stack.addImage(slika);
  img.imageSize = new Size(sirina, visina);
  return img;
}

/* --- rasporedi ----------------------------------------------------------- */

function nacrtajSiri(w, data, boje) {
  const SIRINA = sirinaWidgeta(false);
  const PRSTEN = 62;

  const gore = w.addStack();
  gore.layoutHorizontally();
  gore.centerAlignContent();

  /* lijevo: vakat */
  const lijevo = gore.addStack();
  lijevo.layoutVertically();

  red(lijevo, data.putovanje ? "NA PUTU" : "NAREDNI VAKAT", boje.tiha, 10, "bold");
  lijevo.addSpacer(4);

  if (data.putovanje) {
    red(lijevo, "Vaktija isključena", boje.tekst, 17, "bold");
  } else if (data.vakat) {
    const ime = lijevo.addStack();
    ime.layoutHorizontally();
    ime.bottomAlignContent();
    red(ime, data.vakat.naziv, boje.glavna, 20, "bold");
    ime.addSpacer(8);
    red(ime, data.vakat.vrijeme, boje.tekst, 22, "bold");

    lijevo.addSpacer(2);
    red(lijevo, "za " + preostalo(data.vakat.preostalo), boje.zlatna, 12, "bold");
  } else {
    red(lijevo, "Vaktija nije preuzeta", boje.tiha, 14);
  }

  gore.addSpacer();

  /* desno: prsten zikra */
  if (data.zikr) {
    const desno = gore.addStack();
    desno.layoutVertically();
    desno.centerAlignContent();

    dodajSliku(desno, nacrtajPrsten(PRSTEN, postotak(data.zikr) / 100, boje),
      PRSTEN, PRSTEN);
    desno.addSpacer(3);

    const ispod = desno.addStack();
    ispod.layoutHorizontally();
    ispod.addSpacer();
    red(ispod, imeZikra(data.zikr), boje.tiha, 9, "bold");
    ispod.addSpacer();
  }

  if (!data.putovanje && (data.vakti || []).length) {
    w.addSpacer();
    dodajSliku(w, nacrtajDan(SIRINA, data, boje), SIRINA, 34);
  } else {
    w.addSpacer();
  }
}

/* Mali widget: linija dana sa šest brojeva na 128 piksela se ne može
   pročitati, pa nosi vakat, odbrojavanje i prsten — ono što se i traži
   pogledom u prolazu. */
function nacrtajMali(w, data, boje) {
  const PRSTEN = 50;

  red(w, data.putovanje ? "NA PUTU" : "NAREDNI VAKAT", boje.tiha, 10, "bold");
  w.addSpacer(4);

  if (data.putovanje) {
    red(w, "Vaktija", boje.tekst, 15, "bold");
    red(w, "isključena", boje.tekst, 15, "bold");
  } else if (data.vakat) {
    red(w, data.vakat.naziv, boje.glavna, 17, "bold");
    red(w, data.vakat.vrijeme, boje.tekst, 26, "bold");
    w.addSpacer(2);
    red(w, "za " + preostalo(data.vakat.preostalo), boje.zlatna, 11, "bold");
  } else {
    red(w, "Vaktija nije", boje.tiha, 13);
    red(w, "preuzeta", boje.tiha, 13);
  }

  w.addSpacer();

  if (data.zikr) {
    const dno = w.addStack();
    dno.layoutHorizontally();
    dno.centerAlignContent();

    const tekst = dno.addStack();
    tekst.layoutVertically();
    red(tekst, imeZikra(data.zikr), boje.tiha, 9, "bold");

    dno.addSpacer();
    dodajSliku(dno, nacrtajPrsten(PRSTEN, postotak(data.zikr) / 100, boje),
      PRSTEN, PRSTEN);
  }
}

function nacrtaj(data) {
  const boje = paleta(data);
  const mali = config.widgetFamily === "small";

  const w = new ListWidget();
  w.backgroundColor = boja(boje.pozadina);
  w.setPadding(13, RUB, 13, RUB);
  /* Dodir otvara aplikaciju sa početnog ekrana, ne Safari — vidi `OTVORI`. */
  w.url = OTVORI || APP;

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
