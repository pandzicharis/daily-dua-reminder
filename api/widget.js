/* ==========================================================================
   GET /api/widget — sve što widget treba, u jednom odgovoru.

     GET /api/widget            (uz zaglavlje X-Zikr-User: haris)
     GET /api/widget?user=haris (kad zaglavlje nije zgodno poslati)

   Postoji zbog jednog pravila: widget ne smije znati nijedno pravilo. Šta je
   danas na spisku, koliko je urađeno, koji je vakat na redu i je li dan ili
   noć — sve to već zna server, iz istog `data.js` i `notification-tasks.js`
   po kojima radi i aplikacija. Widget samo crta ono što dobije.

   Bez imena se vraća samo vaktija (widget bez imena je i dalje koristan);
   zikr se tada izostavlja jer se ne zna čiji bi bio.

   PUTOVANJE gasi vaktiju: ona je sarajevska, a na putu bi bila tuđa. Tada se
   vraća `putovanje: true` i prazan spisak vremena, pa widget zna da nije
   riječ o grešci nego o namjeri.

   ČITA, NE PIŠE. Nijedan poziv odavde ne mijenja stanje — widget se osvježava
   često i ne smije ni slučajno pomjeriti spisak.

   Odgovor:

   `?format=text` vrati iste podatke kao dvije linije običnog teksta — za
   Shortcuts, gdje je svaka vrijednost iz JSON-a jedna radnja u prečici.

     {
       "grad": "Sarajevo",
       "datum": "2026-08-27",
       "doba": "dan" | "noc",          // po satu: dan od 07:00, noć od 19:00
       "tema": "auto" | "dan" | "noc", // režim iz postavki aplikacije
       "vakat": { id, naziv, vrijeme, preostalo, sutra, istek },
       "vakti": [ { id, naziv, vrijeme, namaz, kada, proslo } × 6 ],
       "zikr":  { id, naslov, done, total, ostalo, gotovo } | null,
       "badge": 5                       // koliko dova ukupno čeka
     }
   ========================================================================== */

const url = require("url");
const {
  redis, KEYS, TASKS, VAKTI,
  sarajevoNow, parseTime, weekdayFromKey, userFrom, readPrefs,
  taskTally, taskStatus, badgeCount, blockedBy, quietFor,
  vaktijaZa, sectionsFor, vaktijaZaKorisnika
} = require("./_lib.js");

const { vakatMinute } = require("../vakti.js");

/* Dan počinje kad i dnevni podsjetnik, noć kad i večernji — isti spisak po
   kojem se boji tema u aplikaciji (theme.js). Nigdje se ne prepisuje sat. */
function pocetak(id, rezerva) {
  const task = TASKS.find(function (t) { return t.id === id; });
  const m = task ? parseTime(task.startTime) : null;
  return (m === null) ? rezerva : m;
}

function doba(minutes) {
  const dan = pocetak("dan", 7 * 60);
  const noc = pocetak("navecer", 19 * 60);
  return (minutes >= dan && minutes < noc) ? "dan" : "noc";
}

/* Zikr koji je SADA na redu: onaj čiji je prozor počeo, koji nije završen i
   koga niko ne zaklanja. Kad ih je više (poslije 19:00 i dnevni i večernji),
   uzima se onaj koji je počeo kasnije — to je ono što se trenutno radi.

   Kad je sve urađeno, vraća zadnji koji je danas postojao, sa `gotovo: true`
   — widget tada pokaže da je dan zatvoren, a ne prazninu. */
function tekuciZikr(checked, date, prefs, minutes, weekday) {
  const status = {};
  TASKS.forEach(function (task) {
    status[task.id] = taskStatus(task, checked, date, prefs);
  });

  const zapoceti = TASKS.filter(function (task) {
    if (task.enabled === false) { return false; }
    if (task.days && task.days.indexOf(weekday) === -1) { return false; }
    if (sectionsFor(task, date, prefs).length === 0) { return false; }
    const start = parseTime(task.startTime);
    return start !== null && minutes >= start;
  }).sort(function (a, b) {
    return (parseTime(b.startTime) || 0) - (parseTime(a.startTime) || 0);
  });

  if (!zapoceti.length) { return null; }

  const naRedu = zapoceti.filter(function (task) {
    return status[task.id] !== "done" &&
      !blockedBy(task, status) &&
      !quietFor(task, weekday, minutes, status);
  });

  const task = naRedu[0] || zapoceti[0];
  const tally = taskTally(task, checked, date, prefs);

  return {
    id: task.id,
    naslov: task.title,
    done: tally.done,
    total: tally.total,
    ostalo: Math.max(0, tally.total - tally.done),
    gotovo: status[task.id] === "done"
  };
}

/* Dan ± n, kroz UTC — lokalni sat i ljetno računanje vremena ovdje ne smiju
   pojesti ni jedan dan. */
function danPomjeren(date, delta) {
  return new Date(Date.parse(date + "T00:00:00Z") + delta * 86400000)
    .toISOString().slice(0, 10);
}

/* "za 2 h 13 min" / "za 12 min" — isto pravilo kao u aplikaciji, samo bez
   sekundi: obavijest iz prečice se ne osvježava, pa bi sekunde lagale. */
function preostalo(sekundi) {
  const ukupno = Math.max(0, sekundi || 0);
  const h = Math.floor(ukupno / 3600);
  const m = Math.round((ukupno % 3600) / 60);
  if (h > 0) { return h + " h " + m + " min"; }
  return Math.max(1, m) + " min";
}

/* Dvije linije: vakat pa zikr. Prazne linije se izbacuju, da obavijest ne
   nosi rupu kad zikra nema (bez imena) ili vaktije nema (putovanje). */
function tekst(data) {
  const linije = [];

  if (data.putovanje) {
    linije.push("Na putu — vaktija je isključena.");
  } else if (data.vakat) {
    linije.push(data.vakat.naziv + " " + data.vakat.vrijeme +
      " · za " + preostalo(data.vakat.preostalo));
  } else {
    linije.push("Vaktija nije dostupna.");
  }

  if (data.zikr) {
    linije.push(data.zikr.gotovo
      ? "Zikr: gotovo, elhamdulillah"
      : data.zikr.naslov + ": " + data.zikr.done + " / " + data.zikr.total);
  }

  return linije.join("\n");
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "metoda nije dozvoljena" });
  }

  try {
    const query = (req.query && Object.keys(req.query).length)
      ? req.query
      : (url.parse(req.url, true).query || {});

    const user = userFrom(req, null, query);
    const now = sarajevoNow();
    const weekday = weekdayFromKey(now.date);

    /* Config se čita prije vaktije: na putu se ona i ne traži. */
    const prefs = user ? await readPrefs(user) : null;
    /* Bez imena se ne zna je li neko na putu — tada vrijedi Sarajevo. */
    const putovanje = prefs ? !vaktijaZaKorisnika(prefs) : false;

    const vremena = putovanje ? null : await vaktijaZa(now.date);

    /* Naredni vakat. Poslije jacije je to sutrašnja zora, pa se tek tada
       traži i sutrašnji dan — jedan poziv manje svaki drugi put. */
    let vakat = null;
    const spisak = [];
    /* Zadnji vakat koji je danas prošao — iz njega se računa `istek`. */
    let prosli = null;

    if (vremena) {
      VAKTI.forEach(function (v, i) {
        const minuta = vakatMinute(vremena[i]);
        const proslo = minuta !== null && minuta <= now.minutes;

        spisak.push({
          id: v.id,
          naziv: v.naziv,
          vrijeme: vremena[i],
          /* Izlazak sunca nije namaz — Shortcuts po ovome preskače pravljenje
             podsjetnika za njega, isto kao što ga cron preskače pri slanju. */
          namaz: v.namaz === true,
          /* Datum i vrijeme u jednom komadu: Shortcuts iz ovoga napravi
             pravi trenutak jednom radnjom, bez slaganja datuma i sata. */
          kada: now.date + " " + (vremena[i] || ""),
          proslo: proslo
        });

        if (!vakat && minuta !== null && minuta > now.minutes) {
          vakat = {
            id: v.id,
            naziv: v.naziv,
            vrijeme: vremena[i],
            preostalo: (minuta - now.minutes) * 60,
            sutra: false
          };
        } else if (!vakat && proslo) {
          prosli = minuta;
        }
      });

      if (!vakat) {
        const sutra = await vaktijaZa(danPomjeren(now.date, 1));
        const minuta = sutra ? vakatMinute(sutra[0]) : null;

        if (minuta !== null) {
          vakat = {
            id: VAKTI[0].id,
            naziv: VAKTI[0].naziv,
            vrijeme: sutra[0],
            preostalo: (minuta + 24 * 60 - now.minutes) * 60,
            sutra: true
          };
        }
      }

      /* Koliki je dio TEKUĆEG vakta istekao, 0–1. Widget iz ovoga crta traku
         kao i kartica u aplikaciji, a da ne mora znati nijedno vrijeme osim
         onih koja mu ovdje stignu.

         Prije zore je prethodni vakat jučerašnja jacija, pa se traži i
         jučerašnji dan — on je ionako u kešu iz jučerašnjih ciklusa. Ako ga
         nema, mjeri se od šest sati unazad: traka koja stoji prazna cijelo
         jutro izgleda kao kvar. */
      if (vakat) {
        if (prosli === null) {
          const jucerKey = danPomjeren(now.date, -1);
          const jucer = await vaktijaZa(jucerKey);
          const zadnji = jucer ? vakatMinute(jucer[VAKTI.length - 1]) : null;
          prosli = (zadnji === null) ? null : zadnji - 24 * 60;
        }

        const doVakta = now.minutes + vakat.preostalo / 60;
        const od = (prosli === null) ? doVakta - 6 * 60 : prosli;
        const raspon = Math.max(1, doVakta - od);

        vakat.istek = Math.max(0, Math.min(1,
          Math.round(((now.minutes - od) / raspon) * 1000) / 1000));
      }
    }

    /* Zikr samo kad se zna čiji je. */
    let zikr = null;
    let badge = 0;

    if (user) {
      const checked = (await redis.hgetall(KEYS.items(user, now.date))) || {};
      zikr = tekuciZikr(checked, now.date, prefs, now.minutes, weekday);
      badge = badgeCount(checked, now.date, prefs, now.minutes, weekday, null);
    }

    /* Widget se osvježava često; keširanje na rubu bi mu vraćalo stari
       odgovor i poslije čekiranja u aplikaciji. */
    res.setHeader("Cache-Control", "no-store");

    /* `?format=text` — gotove dvije linije, za Shortcuts.

       Shortcuts ume čitati JSON, ali svaka vrijednost je jedna radnja u
       prečici; ovako je cijela prečica dvije radnje (uzmi adresu, pokaži
       obavijest). Sadržaj je isti, samo sklopljen ovdje. */
    if (String(query.format || "") === "text") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      /* `end()`, ne `send()`: lokalni dev-server je goli Node `res` sa
         dodanim `status()` i `json()` — `send()` na njemu ne postoji. */
      return res.status(200).end(tekst({
        putovanje: putovanje, vakat: vakat, zikr: zikr, grad: "Sarajevo"
      }));
    }

    return res.status(200).json({
      grad: "Sarajevo",
      datum: now.date,
      doba: doba(now.minutes),
      /* Režim teme iz postavki aplikacije: "auto", "dan" ili "noc". Widget iz
         njega bira paletu, a `doba` mu treba samo kad je režim "auto". */
      tema: (prefs && prefs.tema) || "auto",
      /* Na putu vaktije nema, i widget to kaže naglas umjesto da pokaže
         tuđa vremena kao svoja. */
      putovanje: putovanje,
      vakat: vakat,
      vakti: spisak,
      zikr: zikr,
      badge: badge
    });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
