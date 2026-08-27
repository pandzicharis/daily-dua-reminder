/* ==========================================================================
   scripts/check-vaktija.js — obavijesti o vaktu na papiru.

     npm run vaktija                     -> danas, ciklus svakih 15 min
     npm run vaktija -- 1                -> ciklus svake minute
     npm run vaktija -- 5 2026-09-01     -> drugi ritam i drugi dan

   Odgovara na pitanje "u koju minutu bi telefon javio koji vakat, i koliko
   bi kasnio", i to POZIVAJUĆI ISTI KOD koji odlučuje u produkciji:
   `vaktijaZa()` i `vaktiDue()` iz api/_lib.js. Ovdje se ne prepisuje ni
   jedno pravilo — ni tolerancija, ni to koji vakat dobija obavijest.

   ZAŠTO POSTOJI. Vakat je tačan trenutak, a ciklus se vrti onako kako je
   podešen: koliko je gust cron, toliko je tačna obavijest. To se inače vidi
   tek kad prođe ikindija, a ovdje se vidi odmah, za cijeli dan.

   Uz ispis provjerava četiri tvrdnje; ako bilo koja padne, izlazni kod je 1:

     1. svaki namaz dobije TAČNO JEDNU obavijest — nikad dvije za isti vakat
     2. izlazak sunca ne dobija nijednu (nije namaz)
     3. nijedna ne kasni više od jednog ciklusa
     4. tolerancija je veća od razmaka ciklusa — inače bi se vakat mogao
        preskočiti (ciklus prije vakta, pa sljedeći tek kad tolerancija
        istekne)

   Ne šalje ništa i ne dira ničiji spisak. Vaktiju skida jednom i ostavlja je
   u lokalnom kešu (.dev-store.json), isto kao što bi je scheduler ostavio u
   Redisu — pa drugi poziv ne ide na mrežu.

   Za PRAVU obavijest na uređaju služi testni panel u aplikaciji (dev-panel,
   sekcija „Vaktija") ili `/api/cron?at=<vrijeme>&reset=1` sa localhosta.
   ========================================================================== */

const path = require("path");
const ROOT = path.join(__dirname, "..");

const {
  VAKTI, VAKAT_TOLERANCIJA, vaktijaZa, vaktiDue, vakatPayload, sarajevoNow
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
   kao na serveru: jednom poslan vakat se ne šalje ponovo (tamo je to zapis u
   Redisu, ovdje skup u memoriji). */
function simuliraj(vremena) {
  const poslano = new Set();
  const out = [];

  for (let minuta = 0; minuta < 24 * 60; minuta += ritam) {
    vaktiDue(vremena, minuta).forEach(function (d) {
      if (poslano.has(d.vakat.id)) { return; }
      poslano.add(d.vakat.id);

      const shown = JSON.parse(vakatPayload(d.vakat, d.vrijeme));
      out.push({
        id: d.vakat.id,
        naziv: d.vakat.naziv,
        vrijeme: d.vrijeme,
        vakatMinuta: d.minuta,
        ciklus: minuta,
        kasni: minuta - d.minuta,
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
  console.log("  ciklus svakih " + ritam + " min · tolerancija " +
    VAKAT_TOLERANCIJA + " min");
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
      console.log("    " + ime + String(kad).padStart(6) + "   ✗ nijedna obavijest");
      return;
    }

    console.log("    " + ime + String(kad).padStart(6) +
      "   obavijest " + hhmm(p.ciklus) +
      "   (+" + p.kasni + " min)   " + p.title);
  });

  console.log("");
  console.log("  provjere:");

  /* 1. svaki namaz tačno jednom */
  const namazi = VAKTI.filter(function (v) { return v.namaz; });
  const bez = namazi.filter(function (v) { return !poId[v.id]; });
  const visak = poslate.length - Object.keys(poId).length;

  if (bez.length) {
    fail("bez obavijesti: " + bez.map(function (v) { return v.naziv; }).join(", "));
  } else if (visak > 0) {
    fail("neki vakat je poslan više puta");
  } else {
    ok("svaki namaz dobije tačno jednu obavijest (" + namazi.length + ")");
  }

  /* 2. izlazak sunca nikad */
  if (poId.izlazak) {
    fail("izlazak sunca je dobio obavijest, a nije namaz");
  } else {
    ok("izlazak sunca ne dobija obavijest");
  }

  /* 3. kašnjenje unutar jednog ciklusa */
  const najgore = poslate.reduce(function (max, p) {
    return Math.max(max, p.kasni);
  }, 0);

  if (najgore >= ritam + 1) {
    fail("najveće kašnjenje " + najgore + " min, a ciklus je " + ritam + " min");
  } else {
    ok("najveće kašnjenje " + najgore + " min (ciklus " + ritam + " min)");
  }

  /* 4. tolerancija mora pokriti razmak ciklusa */
  if (VAKAT_TOLERANCIJA <= ritam) {
    fail("tolerancija (" + VAKAT_TOLERANCIJA + " min) nije veća od ciklusa (" +
      ritam + " min) — vakat se može preskočiti");
  } else {
    ok("tolerancija " + VAKAT_TOLERANCIJA + " min pokriva ciklus od " +
      ritam + " min");
  }

  console.log("");
  console.log(pao ? "  NEŠTO NE VALJA" : "  sve u redu");
  console.log("");

  process.exit(pao ? 1 : 0);
})();
