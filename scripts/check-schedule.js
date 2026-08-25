/* ==========================================================================
   scripts/check-schedule.js — raspored podsjetnika, bez mreže i bez baze.

     npm run raspored              -> petak, cron svakih 15 min, ništa čekirano
     npm run raspored -- ponedjeljak
     npm run raspored -- 2026-08-21
     npm run raspored -- petak sve            (sve čekirano -> tišina)
     npm run raspored -- petak petak-dio      (jedna petačka stavka urađena)
     npm run raspored -- petak petak-gotov    (petačke stavke urađene)
     npm run raspored -- petak bez-navecera   (sve osim Navečer)

   Odgovara na pitanje "u koje minute bi telefon zazvonio i sa kojim
   tekstom", i to POZIVAJUĆI ISTI KOD koji odlučuje u produkciji: dueSlot(),
   taskStatus(), blockedBy(), lateFrom() i pushPayload() iz api/_lib.js. Ovdje
   se ne prepisuje ni jedno pravilo — da simulacija ne može reći jedno a
   server uraditi drugo.

   Uz ispis, provjerava i četiri tvrdnje kroz svih 7 × 1440 minuta i kroz
   četiri obrasca crona (na :00/:15/:30/:45, pomjeren na :07, svake minute,
   i ispad od tri sata). Ako bilo koja padne, izlazni kod je 1:

     1. najviše JEDAN podsjetnik po ciklusu — nikad dva bannera jedan do drugog
     2. "petak" samo petkom, ne više puta nego što mu prozor ima slotova,
        prvi ne prije njegovog startTime-a, a zadnji slot (onaj od 12:00) ne
        prije 12:00; sa cronom koji pogodi pun sat stižu svi, redom
     3. petkom u 12:01–12:59 ne kreće NIJEDAN novi podsjetnik; jedino što tu
        smije stići je zakasnjeli zadnji petački slot (zato mu je endTime
        "12:59", a ne "12:00")
     4. "dan" petkom 13:00–23:00, ostalim danima od svog startTime-a do 23:00

   Ni jedan sat u tim tvrdnjama nije upisan rukom: svi se izvode iz istog
   spiska po kojem odlučuje i server (TASKS iz api/_lib.js). Pomjeri li se
   jutro u notification-tasks.js, provjera se pomjeri s njim.

   Računa se BEZ korisničkog configa, dakle sa svim sekcijama uključenim.
   Tako i treba: ovdje se provjerava sam raspored, a config ga ne mijenja
   nego samo izbacuje sekcije iz računa (ugašen petak -> total 0 -> "done"
   -> tišina). Kako izgleda kod pojedinog korisnika sa njegovim prekidačima,
   vidi se kroz `/api/cron?dry=1&user=<ime>`.

   Ne šalje ništa i ne dira bazu — za pravu obavijest na uređaju služi
   `npm run test-push`, a za odluku servera nad stvarnim stanjem
   `/api/cron?dry=1`.
   ========================================================================== */

const path = require("path");
const ROOT = path.join(__dirname, "..");

const {
  TASKS, dueSlot, taskStatus, blockedBy, lateFrom, quietFor,
  pushPayload, sectionsForDate, weekdayFromKey, parseTime
} = require(path.join(ROOT, "api", "_lib.js"));

/* Sedmica sa poznatim danima — 2026-08-16 je nedjelja, 21. je petak. */
const WEEK = [
  "2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19",
  "2026-08-20", "2026-08-21", "2026-08-22"
];

const DAY_NAMES = [
  "nedjelja", "ponedjeljak", "utorak", "srijeda",
  "četvrtak", "petak", "subota"
];

/* Interval kao u produkciji, osim ako okruženje kaže drugačije. */
const INTERVAL = (function () {
  const raw = parseInt(process.env.REMINDER_INTERVAL_MINUTES || "60", 10);
  return (!isFinite(raw) || raw < 1) ? 60 : Math.min(raw, 1440);
})();

/* ------------------------------------------------------------------------
   Satnica se ČITA, ne prepisuje

   Tvrdnje ispod govore o satima: kad smije prva petačka, kad prva dnevna,
   koliko petak uopšte ima slotova. Da su ti brojevi ovdje upisani rukom,
   pomjeranje jutra (08:00 -> 07:00) oborilo bi provjeru koja ništa loše nije
   ni našla. Zato se svaki izvodi iz TASKS-a — iz istog spiska po kojem
   odlučuje server.
   ------------------------------------------------------------------------ */
function taskById(id) {
  for (const task of TASKS) {
    if (task.id === id) { return task; }
  }
  throw new Error("nema podsjetnika \"" + id + "\" na spisku");
}

function startOf(id) {
  return parseTime(taskById(id).startTime);
}

/* "00:00" znači ponoć na KRAJU dana — isto pravilo kao u dueSlot(). */
function endOf(id) {
  const end = parseTime(taskById(id).endTime || "22:00");
  return end === 0 ? 24 * 60 : end;
}

/* Koliko slotova prozor uopšte ima pri ovom intervalu. */
function slotsOf(id) {
  return Math.floor((endOf(id) - startOf(id)) / INTERVAL) + 1;
}

const PETAK_START = startOf("petak");
const PETAK_SLOTS = slotsOf("petak");
/* Zadnji slot i minuta u kojoj najranije smije otići (12:00). */
const PETAK_LAST = PETAK_SLOTS - 1;
const PETAK_LAST_AT = PETAK_START + PETAK_LAST * INTERVAL;

const DAN_START = startOf("dan");
/* Prva minuta u kojoj zaklon nad dnevnim više ne stoji (13:00). */
const DAN_PETKOM = endOf("petak") + 1;

/* Sva vremena petačkih obavijesti kad cron pogodi pun sat. */
const PETAK_PUNCTUAL = Array.from({ length: PETAK_SLOTS }, function (_, i) {
  return hhmm(PETAK_START + i * INTERVAL);
}).join(" ");

/* ------------------------------------------------------------------------
   Scenariji — šta je čekirano. Spisak stavki se uzima iz data.js za TAJ
   datum, pa "sve" petkom znači i petačke stavke, a četvrtkom ne.
   ------------------------------------------------------------------------ */
function idsOf(dateKey, filter) {
  const out = {};
  sectionsForDate(dateKey).forEach(function (section) {
    if (filter && !filter(section)) { return; }
    if (section.kind === "quran") { out.quran = "1"; return; }
    (section.items || []).forEach(function (item) { out[item.id] = "1"; });
  });
  return out;
}

const SCENARIJI = {
  "nista": function () { return {}; },
  "sve": function (dateKey) { return idsOf(dateKey); },
  "petak-gotov": function (dateKey) {
    return idsOf(dateKey, function (s) { return s.id === "petak"; });
  },
  /* Samo prva petačka stavka — ovako se vidi tekst "Petak je! Nastavi
     sa zikrom." */
  "petak-dio": function (dateKey) {
    return { "petak-salavati-30": "1" };
  },
  "bez-navecera": function (dateKey) {
    return idsOf(dateKey, function (s) { return s.id !== "navecer"; });
  }
};

/* ------------------------------------------------------------------------
   Jedan dan, jedan obrazac crona -> spisak { minute, task, title, body }

   Vjerno prepisuje SAMO petlju iz api/cron.js (šta se pita i u kojem redu),
   dok sve odluke ostaju u pozvanim funkcijama. `lastSlot` igra Redis ključ
   `sent:<uređaj>:<task>:<datum>`; upisuje se prije "slanja", isto kao tamo.
   ------------------------------------------------------------------------ */
function simulateDay(dateKey, ticks, checked) {
  const weekday = weekdayFromKey(dateKey);
  const lastSlot = {};
  const out = [];

  const status = {};
  TASKS.forEach(function (task) {
    status[task.id] = taskStatus(task, checked, dateKey);
  });

  ticks.forEach(function (minutes) {
    TASKS.forEach(function (task) {
      if (task.enabled === false) { return; }
      if (blockedBy(task, status)) { return; }
      /* Vremenski zaklon — petkom dnevni ćuti dok petački traje. */
      if (quietFor(task, weekday, minutes, status)) { return; }

      const slot = dueSlot({
        minutes: minutes,
        weekday: weekday,
        days: task.days,
        startTime: task.startTime,
        endTime: task.endTime,
        interval: INTERVAL,
        lastSlot: lastSlot[task.id],
        status: status[task.id]
      });

      if (slot === null) { return; }
      lastSlot[task.id] = slot;

      const from = lateFrom(task, weekday);
      const late = from !== null && minutes >= from;
      const shown = JSON.parse(pushPayload(task, status[task.id], late));

      out.push({
        minutes: minutes, slot: slot, task: task.id,
        title: shown.title, body: shown.body
      });
    });
  });

  return { weekday: weekday, status: status, sent: out };
}

/* ------------------------------------------------------------------------
   Obrasci crona
   ------------------------------------------------------------------------ */
function ticksEvery(step, offset) {
  const out = [];
  for (let m = 0; m < 1440; m++) {
    if ((m - (offset || 0)) % step === 0 && m >= (offset || 0)) { out.push(m); }
  }
  return out;
}

const OBRASCI = [
  /* `punctual` = cron koji pogodi pun sat; samo tada se očekuje da stignu
     SVI slotovi. Ostali obrasci pokazuju šta se desi kad kasni ili ne radi. */
  { name: "svakih 15 min (:00 :15 :30 :45)", ticks: ticksEvery(15, 0), punctual: true },
  { name: "svakih 15 min, pomjeren na :07", ticks: ticksEvery(15, 7) },
  { name: "svake minute", ticks: ticksEvery(1, 0), punctual: true },
  {
    name: "ispad od 3h (09:00–12:00 bez crona)",
    ticks: ticksEvery(15, 0).filter(function (m) { return m < 540 || m > 720; })
  }
];

function hhmm(minutes) {
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" +
         String(minutes % 60).padStart(2, "0");
}

/* ------------------------------------------------------------------------
   Tvrdnje — kroz sve dane, sve obrasce, i scenarij "ništa čekirano"
   (najgori slučaj: tada podsjetnici zvone najviše).
   ------------------------------------------------------------------------ */
function checkAll() {
  const fails = [];

  function fail(msg) { fails.push(msg); }

  OBRASCI.forEach(function (obrazac) {
    WEEK.forEach(function (dateKey) {
      const day = DAY_NAMES[weekdayFromKey(dateKey)];

      /* Scenariji koji drže podsjetnike živima cijeli dan. `petak-gotov` je
         tu zato što petkom mijenja pravila: zaklon nad dnevnim pada, pa
         dnevni radi po istom rasporedu kao i svaki drugi dan. */
      [["nista", {}],
       ["bez-navecera", SCENARIJI["bez-navecera"](dateKey)],
       ["petak-gotov", SCENARIJI["petak-gotov"](dateKey)]]
        .forEach(function (pair) {
          const res = simulateDay(dateKey, obrazac.ticks, pair[1]);
          const label = day + " / " + obrazac.name + " / " + pair[0];

          /* 1. najviše jedan podsjetnik po ciklusu */
          const perTick = {};
          res.sent.forEach(function (s) {
            perTick[s.minutes] = (perTick[s.minutes] || 0) + 1;
          });
          Object.keys(perTick).forEach(function (m) {
            if (perTick[m] > 1) {
              fail("[1] " + label + ": " + perTick[m] +
                   " obavijesti u istom ciklusu u " + hhmm(Number(m)));
            }
          });

          const petak = res.sent.filter(function (s) { return s.task === "petak"; });
          const dan = res.sent.filter(function (s) { return s.task === "dan"; });

          /* Je li petački podsjetnik tog dana uopšte imao šta da javi. Kad je
             završen (ili ga tog dana nema), zaklon nad dnevnim pada i dnevni
             radi po uobičajenom rasporedu — pravila 2, 3 i 4 se onda mjere
             kao za bilo koji drugi dan. */
          const petakZaklanja = res.weekday === 5 && res.status.petak !== "done";

          /* 2. "petak" samo petkom */
          if (res.weekday !== 5 && petak.length) {
            fail("[2] " + label + ": petački podsjetnik u " + day);
          }
          if (res.weekday === 5 && pair[0] === "nista" && petakZaklanja) {
            /* Prozor petačkog uz ovaj interval daje tačno PETAK_SLOTS
               slotova i ni jedan više — koliko ih stvarno stigne zavisi od
               crona. */
            if (petak.length > PETAK_SLOTS) {
              fail("[2] " + label + ": petačkih obavijesti " + petak.length +
                   ", najviše " + PETAK_SLOTS + " (" +
                   petak.map(function (s) { return hhmm(s.minutes); }).join(" ") + ")");
            }
            if (petak.length && petak[0].minutes < PETAK_START) {
              fail("[2] " + label + ": prva petačka u " + hhmm(petak[0].minutes) +
                   ", prije " + hhmm(PETAK_START));
            }
            /* Zadnji slot je onaj od 12:00 i ne smije otići prije 12:00. */
            petak.forEach(function (s) {
              if (s.slot === PETAK_LAST && s.minutes < PETAK_LAST_AT) {
                fail("[2] " + label + ": zadnja petačka u " + hhmm(s.minutes) +
                     ", prije " + hhmm(PETAK_LAST_AT));
              }
            });
            /* Sa cronom koji radi na pun sat moraju stići sve pet, u 08–12.
               Kad cron kasni ili ne radi, propušteni slotovi se NE nadoknađuju
               (tvrdnja iznad to pokriva) — isto kao za dnevni podsjetnik. */
            if (obrazac.punctual) {
              const kada = petak.map(function (s) { return hhmm(s.minutes); }).join(" ");
              if (kada !== PETAK_PUNCTUAL) {
                fail("[2] " + label + ": petačke u [" + kada +
                     "], očekivano [" + PETAK_PUNCTUAL + "]");
              }
            }
          }

          /* 3. Dok petački zaklanja, u 12:01–12:59 ne smije krenuti NIJEDAN
             novi podsjetnik: dnevni tu ćuti, a petački je smio poslati samo
             svoj zadnji slot (4) ako je cron zakasnio — to je i razlog zašto
             mu endTime nije "12:00" nego "12:59". */
          if (petakZaklanja) {
            res.sent.forEach(function (s) {
              if (s.minutes <= PETAK_LAST_AT || s.minutes >= DAN_PETKOM) { return; }
              if (s.task === "petak" && s.slot === PETAK_LAST) { return; }
              fail("[3] " + label + ": obavijest (" + s.task + ", slot " +
                   s.slot + ") u " + hhmm(s.minutes) + ", a tu treba tišina");
            });
          }

          /* 4. Prozor dnevnog: njegov startTime kao i svaki dan, osim dok ga
             petački zaklanja — tada je prva dnevna obavijest u 13:00. */
          const prviDan = petakZaklanja ? DAN_PETKOM : DAN_START;
          dan.forEach(function (s) {
            if (s.minutes < prviDan) {
              fail("[4] " + label + ": dnevni u " + hhmm(s.minutes) +
                   ", a najranije smije u " + hhmm(prviDan));
            }
          });

          /* 5. Petkom sa završenim petkom dnevni mora raditi kao i ostalim
             danima — inače bi "završi petak pa nastavi normalno" tiho
             prestalo raditi. */
          if (res.weekday === 5 && pair[0] === "petak-gotov" && obrazac.punctual) {
            if (!dan.length || dan[0].minutes !== DAN_START) {
              fail("[5] " + label + ": prva dnevna u " +
                   (dan.length ? hhmm(dan[0].minutes) : "nikad") +
                   ", a petak je završen pa se očekuje " + hhmm(DAN_START));
            }
          }
        });
    });
  });

  return fails;
}

/* ------------------------------------------------------------------------
   Ispis
   ------------------------------------------------------------------------ */
function resolveDay(arg) {
  if (!arg) { return WEEK[5]; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) { return arg; }
  const i = DAY_NAMES.indexOf(String(arg).toLowerCase());
  return i === -1 ? null : WEEK[i];
}

(function main() {
  const dateKey = resolveDay(process.argv[2]);
  const scenarioName = (process.argv[3] || "nista").toLowerCase();

  if (!dateKey) {
    console.error("\n  Nepoznat dan: \"" + process.argv[2] + "\"." +
      "\n  Koristi ime dana (" + DAY_NAMES.join(", ") + ") ili datum YYYY-MM-DD.\n");
    process.exit(1);
  }
  if (!SCENARIJI[scenarioName]) {
    console.error("\n  Nepoznat scenarij: \"" + scenarioName + "\"." +
      "\n  Postoje: " + Object.keys(SCENARIJI).join(", ") + "\n");
    process.exit(1);
  }

  const checked = SCENARIJI[scenarioName](dateKey);
  const weekday = weekdayFromKey(dateKey);

  console.log("");
  console.log("  " + DAY_NAMES[weekday].toUpperCase() + "  " + dateKey +
    "   ·   cron svakih 15 min   ·   interval " + INTERVAL + " min" +
    "   ·   čekirano: " + scenarioName);
  console.log("");

  /* Prozori i status po podsjetniku — isto što /api/cron vrati u `windows`. */
  TASKS.forEach(function (task) {
    const off = task.enabled === false ||
      (task.days && task.days.indexOf(weekday) === -1);
    const window = off
      ? "—  (danas ga nema)"
      : task.startTime + "–" + (task.endTime || "22:00");

    /* Zaklon zavisi i od sata; ovdje se ispisuje za početak prozora, jer
       upravo tada je i bitno hoće li podsjetnik uopšte krenuti. */
    const status = taskStatus(task, checked, dateKey);
    const statusi = {};
    TASKS.forEach(function (t) { statusi[t.id] = taskStatus(t, checked, dateKey); });
    const zaklon = quietFor(task, weekday, parseTime(task.startTime) || 0, statusi);

    console.log("    " + task.id.padEnd(9) + window.padEnd(22) +
      "status: " + status.padEnd(9) +
      (zaklon ? "ćuti dok traje: " + zaklon : ""));
  });

  const res = simulateDay(dateKey, ticksEvery(15, 0), checked);

  console.log("");
  if (!res.sent.length) {
    console.log("    (nijedna obavijest cijeli dan)");
  }
  res.sent.forEach(function (s) {
    console.log("    " + hhmm(s.minutes) + "   " + s.task.padEnd(8) +
      s.title + " — " + s.body);
  });
  console.log("");

  const blokirani = TASKS
    .filter(function (t) { return blockedBy(t, res.status); })
    .map(function (t) { return t.id + " ← " + blockedBy(t, res.status); });
  if (blokirani.length) {
    console.log("    zaklonjeno: " + blokirani.join(", "));
    console.log("");
  }

  /* Tvrdnje */
  const fails = checkAll();
  const ukupno = OBRASCI.length * WEEK.length * 3;

  if (!fails.length) {
    console.log("  ✓ sve tvrdnje prolaze (" + ukupno +
      " simulacija: 7 dana × 4 obrasca crona × 3 scenarija)");
    console.log("");
    process.exit(0);
  }

  console.log("  ✗ tvrdnje NE prolaze (" + fails.length + "):");
  console.log("");
  fails.slice(0, 40).forEach(function (f) { console.log("    " + f); });
  if (fails.length > 40) {
    console.log("    … i još " + (fails.length - 40));
  }
  console.log("");
  process.exit(1);
})();
