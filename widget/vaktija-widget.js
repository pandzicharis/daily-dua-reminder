/* ==========================================================================
   widget/vaktija-widget.js — widget za iPhone (Scriptable)

   PWA ne može dati widget: iOS ga izdaje samo native aplikaciji preko
   WidgetKit-a, a Safari toj kutiji nema pristup. Scriptable je zaobilaznica
   koja radi bez Xcode-a i bez Apple Developer naloga: besplatna aplikacija
   koja izvršava JavaScript i smije crtati widget na početnom ekranu.

   ŠTA POKAZUJE

     naredni vakat   ime, vrijeme i koliko ga još ima (na putu ga nema —
                     vaktija je sarajevska, pa tada stoji "Na putu")
     zikr            ono što je SADA na redu — dnevni danju, večernji uveče,
                     petkom prijepodne petački — i koliko je od njega ostalo
     dan/noć         boje prate isto pravilo po kojem se boji i aplikacija
                     (dan od 07:00, noć od 19:00)

   Nijedno od tih pravila nije ovdje: sve dolazi gotovo sa `/api/widget`, iz
   istog `data.js` i `notification-tasks.js` po kojima radi i aplikacija.
   Widget samo crta. Zato se, kad se u aplikaciji nešto promijeni, ovaj fajl
   ne dira.

   POSTAVLJANJE

     1. App Store -> Scriptable (besplatno)
     2. Scriptable -> "+" -> nalijepi ovaj fajl -> nazovi ga "Vaktija"
     3. Dolje ispod: upiši svoj APP i IME
     4. Početni ekran -> drži prst -> "+" -> Scriptable -> mali ili srednji
        widget -> Edit Widget -> Script: Vaktija

   Bez imena widget i dalje radi — pokaže samo vaktiju, bez zikra.

   OSVJEŽAVANJE. iOS sam odlučuje kada će widget osvježiti; ovdje se samo
   traži (`refreshAfterDate`). Pred vakat se traži češće, jer tada
   odbrojavanje i znači nešto.
   ========================================================================== */

/* ---------------------------- POSTAVKE ---------------------------------- */

/* Adresa objavljene aplikacije, bez kose crte na kraju. */
const APP = "https://moj-zikr.vercel.app";

/* Ime iz postavki aplikacije — po njemu se zna čiji je spisak. Prazno = samo
   vaktija, bez zikra. */
const IME = "";

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

/* Vaktija direktno sa izvora — rezerva za slučaj da aplikacija ne odgovori
   (deploy u toku, nema mreže do Vercela). Tada widget pokaže bar vakat. */
const VAKTIJA_URL = "https://api.vaktija.ba/vaktija/v1/77";
const IMENA = ["Zora", "Izlazak sunca", "Podne", "Ikindija", "Akšam", "Jacija"];

/* --------------------------- podaci ------------------------------------- */

async function ucitaj() {
  try {
    const req = new Request(APP + "/api/widget");
    req.timeoutInterval = 10;
    if (IME) { req.headers = { "X-Zikr-User": IME }; }

    const data = await req.loadJSON();
    /* `datum` ima samo odgovor iz aplikacije. Po njemu se zna da je stigao
       PRAVI odgovor — pa i onaj u kojem vaktije nema jer je putovanje
       uključeno. Bez te provjere bi widget u tom slučaju pao na rezervu i
       pokazao sarajevska vremena čovjeku koji nije u Sarajevu. */
    if (data && data.datum) { return data; }
    throw new Error("prazan odgovor");
  } catch (e) {
    return await rezerva();
  }
}

/* Isti oblik odgovora kao `/api/widget`, samo bez zikra — da crtanje ispod
   ne mora znati odakle su podaci došli. */
async function rezerva() {
  try {
    const req = new Request(VAKTIJA_URL);
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    const vremena = (data && data.vakat) || [];

    const sada = new Date();
    const minute = sada.getHours() * 60 + sada.getMinutes();

    const vakti = vremena.map(function (v, i) {
      return { naziv: IMENA[i], vrijeme: v, proslo: uMinute(v) <= minute };
    });

    const naredni = vakti.find(function (v) { return !v.proslo; });

    return {
      grad: (data && data.lokacija) || "Sarajevo",
      doba: (minute >= 7 * 60 && minute < 19 * 60) ? "dan" : "noc",
      vakat: naredni
        ? {
            naziv: naredni.naziv,
            vrijeme: naredni.vrijeme,
            preostalo: (uMinute(naredni.vrijeme) - minute) * 60,
            sutra: false
          }
        : null,
      vakti: vakti,
      zikr: null,
      offline: true
    };
  } catch (e) {
    return null;
  }
}

function uMinute(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
}

/* "2 h 13 min" daleko, "12 min" blizu — isto pravilo kao u aplikaciji.
   Sekunde se ne pokazuju: widget se ne osvježava svake sekunde, pa bi broj
   koji stoji lagao. */
function preostalo(sekundi) {
  const ukupno = Math.max(0, sekundi || 0);
  const h = Math.floor(ukupno / 3600);
  const m = Math.round((ukupno % 3600) / 60);
  if (h > 0) { return h + " h " + m + " min"; }
  return Math.max(1, m) + " min";
}

/* ---------------------------- crtanje ----------------------------------- */

/* Traka napretka. Scriptable nema element trake, pa se crta u sliku —
   zaobljena podloga i preko nje popunjeni dio. */
function traka(sirina, visina, dio, bojaPuna, bojaPrazna) {
  const ctx = new DrawContext();
  ctx.size = new Size(sirina, visina);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const r = visina / 2;

  ctx.setFillColor(new Color(bojaPrazna));
  ctx.fillRect(new Rect(0, 0, sirina, visina));

  const puna = Math.max(visina, Math.min(sirina, sirina * dio));
  ctx.setFillColor(new Color(bojaPuna));
  ctx.fillRect(new Rect(0, 0, puna, visina));

  /* Zaobljenje ne crta ovaj kontekst nego `cornerRadius` na slici — na 6
     piksela visine ispadne isto, a put sa lukovima nije potreban. */
  return { image: ctx.getImage(), radius: r };
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

  const w = new ListWidget();
  w.backgroundColor = new Color(boje.pozadina);
  w.setPadding(14, 14, 14, 14);
  /* Klik po widgetu otvara aplikaciju. */
  w.url = APP;

  if (!data) {
    red(w, "Nema veze", boje.tiha, 13);
    red(w, "Vaktija nije dostupna.", boje.tekst, 15, "bold");
    return w;
  }

  /* --- naredni vakat ---
     Na putu vaktije nema: ona je sarajevska, a tuđa vremena na widgetu bi
     izgledala kao tačna. Umjesto njih stoji jedna rečenica, a zikr ostaje —
     njega putovanje samo skrati. */
  const glava = w.addStack();
  glava.layoutHorizontally();
  red(glava, data.putovanje ? "NA PUTU" : "NAREDNI VAKAT", boje.tiha, 9, "bold");
  glava.addSpacer();
  if (data.vakat && !data.putovanje) {
    red(glava, preostalo(data.vakat.preostalo), boje.zlatna, 10, "bold");
  }

  w.addSpacer(6);

  const vakatRed = w.addStack();
  vakatRed.layoutHorizontally();
  vakatRed.centerAlignContent();

  if (data.putovanje) {
    red(vakatRed, "Vaktija je isključena", boje.tekst, mali ? 14 : 16, "bold");
  } else if (data.vakat) {
    red(vakatRed, data.vakat.naziv, boje.glavna, mali ? 17 : 20, "bold");
    vakatRed.addSpacer();
    red(vakatRed, data.vakat.vrijeme, boje.tekst, mali ? 17 : 20, "bold");
  } else {
    red(vakatRed, "Vaktija nije preuzeta", boje.tiha, 13);
  }

  /* --- svih šest vremena (samo srednji i veliki) --- */
  if (!mali && !data.putovanje && Array.isArray(data.vakti) && data.vakti.length) {
    w.addSpacer(10);

    const luk = w.addStack();
    luk.layoutHorizontally();

    data.vakti.forEach(function (v, i) {
      if (i) { luk.addSpacer(); }
      const kol = luk.addStack();
      kol.layoutVertically();
      kol.centerAlignContent();

      const ime = red(kol, v.naziv === "Izlazak sunca" ? "Izlazak" : v.naziv,
        v.proslo ? boje.tiha : boje.tekst, 9);
      ime.centerAlignText();

      const kad = red(kol, v.vrijeme, v.proslo ? boje.tiha : boje.glavna, 11, "bold");
      kad.centerAlignText();
    });
  }

  /* --- zikr --- */
  if (data.zikr) {
    w.addSpacer(mali ? 8 : 12);

    const linija = w.addStack();
    linija.layoutHorizontally();

    const naslov = data.zikr.gotovo
      ? "Elhamdulillah"
      : data.zikr.naslov.replace(/[^\p{L}\p{N}\s.-]/gu, "").trim();

    red(linija, naslov, boje.tiha, 9, "bold");
    linija.addSpacer();
    red(linija,
      data.zikr.gotovo ? "gotovo" : data.zikr.done + " / " + data.zikr.total,
      data.zikr.gotovo ? boje.gotovo : boje.tekst, 10, "bold");

    w.addSpacer(5);

    const dio = data.zikr.total ? data.zikr.done / data.zikr.total : 0;
    const sirina = mali ? 140 : 300;
    const slika = traka(sirina, 6, dio, boje.gotovo, boje.linija);
    const img = w.addImage(slika.image);
    img.cornerRadius = slika.radius;
    img.imageSize = new Size(sirina, 6);
  } else if (!mali) {
    w.addSpacer(10);
    red(w, data.offline ? "bez veze sa aplikacijom" : data.grad || "Sarajevo",
      boje.tiha, 9);
  }

  /* Pred vakat se traži češće osvježavanje — tada odbrojavanje i znači
     nešto. iOS ovo uzima kao molbu, ne kao naredbu. */
  const zaKoliko = (data.vakat && !data.putovanje && data.vakat.preostalo < 30 * 60)
    ? 2 : 10;
  w.refreshAfterDate = new Date(Date.now() + zaKoliko * 60 * 1000);

  return w;
}

/* ----------------------------- start ------------------------------------ */

const data = await ucitaj();
const widget = nacrtaj(data);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  /* Pokretanje iz same aplikacije Scriptable — da se vidi kako izgleda. */
  await widget.presentMedium();
}

Script.complete();
