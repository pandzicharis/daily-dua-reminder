/* ==========================================================================
   scripts/check-vaktija.js — obavijesti o vaktu na papiru.

     npm run vaktija                     -> danas, ciklus svakih 15 min
     npm run vaktija -- 1                -> ciklus svake minute
     npm run vaktija -- 5 2026-09-01     -> drugi ritam i drugi dan

   Odgovara na pitanje "u koju minutu bi telefon najavio koji namaz", i to
   POZIVAJUĆI ISTI KOD koji odlučuje u produkciji: `vaktijaZa()` i
   `vaktiDue()` iz api/_lib.js. Ovdje se ne prepisuje ni jedno pravilo — ni
   prozor najave, ni to koji vakat dobija obavijest.

   ZAŠTO POSTOJI. Obavijest je najava: stiže do petnaest minuta prije vakta,
   a u sam vakat se ćuti. Da li će pogoditi taj prozor zavisi od toga koliko
   je gust cron — a to se inače vidi tek kad prođe ikindija.

   Uz ispis provjerava četiri tvrdnje; ako bilo koja padne, izlazni kod je 1:

     1. svaki namaz dobije TAČNO JEDNU najavu — nikad dvije za isti vakat
     2. izlazak sunca ne dobija nijednu (nije namaz)
     3. svaka najava pada PRIJE svog vakta, unutar prozora od 15 minuta
     4. prozor najave je veći od razmaka ciklusa — inače bi ga cron mogao
        preskočiti (ciklus prije prozora, pa sljedeći tek kad vakat prođe)

   Ne šalje ništa i ne dira ničiji spisak. Vaktiju skida jednom i ostavlja je
   u lokalnom kešu (.dev-store.json), isto kao što bi je scheduler ostavio u
   Redisu — pa drugi poziv ne ide na mrežu.

   Za PRAVU obavijest na uređaju služi testni panel u aplikaciji (dev-panel,
   sekcija „Vaktija") ili `/api/cron?at=<vrijeme>&reset=1` sa localhosta —
   `at` mora pasti u prozor najave, dakle do 15 minuta prije vakta.
   ========================================================================== */

const path = require("path");
const ROOT = path.join(__dirname, "..");

const {
  VAKTI, NAJAVA_MIN, vaktijaZa, vaktiDue, vakatPayload, sarajevoNow
} = require(path.join(ROOT, "api", "_lib.js"));

const { vakatMinute } = require(path.join(ROOT, "vakti.js"));

/* --- argumenti ---------------------------------------------------------- */

const args = process.argv.slice(2);
const ritam = Math.max(1, Math.min(120, parseInt(args[0], 10) || 15));
const datum = /^\d{4}-\d{2}-\d{2}$/.test(args[1] || "") ? args[1] : sarajevoNow().date;

function hhmm(minuta) {
  const h = Math.floor(minuta / 60);
  const m = minuta % 60;
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}

/* --- simulacija dana ----------------------------------------------------- */

/* Cijeli dan ciklusa, minutu po minutu kako bi ih vrtio cron. Dedup je isti
   kao na serveru: jednom najavljen vakat se ne najavljuje ponovo (tamo je to
   zapis u Redisu, ovdje skup u memoriji). */
function simuliraj(vremena) {
  const poslano = new Set();
  const out = [];

  for (let minuta = 0; minuta < 24 * 60; minuta += ritam) {
    vaktiDue(vremena, minuta).forEach(function (d) {
      if (poslano.has(d.vakat.id)) { return; }
      poslano.add(d.vakat.id);

      const shown = JSON.parse(vakatPayload(d.vakat, d.vrijeme, d.za));
      out.push({
        id: d.vakat.id,
        naziv: d.vakat.naziv,
        vrijeme: d.vrijeme,
        vakatMinuta: d.minuta,
        ciklus: minuta,
        /* koliko je minuta PRIJE vakta najava otišla */
        prije: d.za,
        title: shown.title,
        body: shown.body
      });
    });
  }

  return out;
}

/* --- ispis i provjere ---------------------------------------------------- */

let pao = false;

function fail(poruka) {
  pao = true;
  console.log("    ✗ " + poruka);
}

function ok(poruka) {
  console.log("    ✓ " + poruka);
}

(async function () {
  const vremena = await vaktijaZa(datum);

  if (!vremena) {
    console.log("");
    console.log("  Vaktija se ne može dobiti (api.vaktija.ba ne odgovara).");
    console.log("");
    process.exit(1);
  }

  const poslate = simuliraj(vremena);
  const poId = {};
  poslate.forEach(function (p) { poId[p.id] = p; });

  console.log("");
  console.log("  Vaktija · Sarajevo · " + datum);
  console.log("  ciklus svakih " + ritam + " min · najava do " +
    NAJAVA_MIN + " min prije vakta");
  console.log("");

  VAKTI.forEach(function (vakat, i) {
    const kad = vremena[i];
    const ime = vakat.naziv.padEnd(15);

    if (!vakat.namaz) {
      console.log("    " + ime + String(kad).padStart(6) +
        "   —   nije namaz, obavijest ne ide");
      return;
    }

    const p = poId[vakat.id];
    if (!p) {
      console.log("    " + ime + String(kad).padStart(6) + "   ✗ nijedna najava");
      return;
    }

    console.log("    " + ime + String(kad).padStart(6) +
      "   najava " + hhmm(p.ciklus) +
      "   (" + p.prije + " min prije)   " + p.body);
  });

  console.log("");
  console.log("  provjere:");

  /* 1. svaki namaz tačno jednom */
  const namazi = VAKTI.filter(function (v) { return v.namaz; });
  const bez = namazi.filter(function (v) { return !poId[v.id]; });
  const visak = poslate.length - Object.keys(poId).length;

  if (bez.length) {
    fail("bez najave: " + bez.map(function (v) { return v.naziv; }).join(", "));
  } else if (visak > 0) {
    fail("neki vakat je najavljen više puta");
  } else {
    ok("svaki namaz dobije tačno jednu najavu (" + namazi.length + ")");
  }

  /* 2. izlazak sunca nikad */
  if (poId.izlazak) {
    fail("izlazak sunca je dobio najavu, a nije namaz");
  } else {
    ok("izlazak sunca ne dobija najavu");
  }

  /* 3. svaka najava prije svog vakta, unutar prozora */
  const kasne = poslate.filter(function (p) { return p.prije < 0; });
  const rane = poslate.filter(function (p) { return p.prije > NAJAVA_MIN; });

  if (kasne.length) {
    fail("najava poslije vakta: " +
      kasne.map(function (p) { return p.naziv; }).join(", "));
  } else if (rane.length) {
    fail("najava ranija od " + NAJAVA_MIN + " min: " +
      rane.map(function (p) { return p.naziv; }).join(", "));
  } else {
    const najkasnija = poslate.reduce(function (min, p) {
      return Math.min(min, p.prije);
    }, NAJAVA_MIN);
    ok("svaka najava je prije svog vakta (najtijesnija " + najkasnija + " min)");
  }

  /* 4. prozor najave mora pokriti razmak ciklusa */
  if (NAJAVA_MIN <= ritam) {
    fail("prozor najave (" + NAJAVA_MIN + " min) nije veći od ciklusa (" +
      ritam + " min) — vakat se može preskočiti");
  } else {
    ok("prozor najave " + NAJAVA_MIN + " min pokriva ciklus od " +
      ritam + " min");
  }

  console.log("");
  console.log(pao ? "  NEŠTO NE VALJA" : "  sve u redu");
  console.log("");

  process.exit(pao ? 1 : 0);
})();
