/* ==========================================================================
   dev-panel.js — testni panel. RADI SAMO NA LOCALHOSTU.

   Jedno mjesto sa kojeg se provjerava sve što se inače ne može isprobati bez
   čekanja: koji je dan, koje je vrijeme i šta bi server u tom trenutku
   poslao.

     Dan      strelice ‹ › mijenjaju dan koji aplikacija prikazuje, pa se
              petačka sekcija vidi bez čekanja petka. Kvačice na danu koji
              nije današnji idu u odvojen, lokalni prostor i NE dijele se sa
              serverom (vidi `isPreview()` u script.js).

     Vrijeme  glumi se SERVERU pri okidanju — aplikacija sama nema sat.

     Okidanje "pošalji" pozove pravi /api/cron sa tim danom i vremenom, pa
              obavijest stigne na uređaj. "samo pokaži" (dry) ne pošalje i ne
              upiše ništa, samo javi šta bi bilo.

   Ni jedno pravilo se ovdje ne prepisuje: šta se šalje i sa kojim tekstom
   odlučuje isključivo server (api/cron.js), a panel ispisuje njegov
   izvještaj. Zato panel ne može pokazati jedno a produkcija uraditi drugo.

   Gašenje: van localhosta se `init()` nikad ne izvrši. Uz to, server otvara
   /api/cron bez CRON_SECRET-a samo kad je REMINDER_TIME_TRAVEL=1 (samo u
   .env.local) I zahtjev dolazi sa localhosta — vidi `devUnlocked()` u
   api/_lib.js. Dakle i da se fajl objavi, panel u produkciji ne radi ništa.
   ========================================================================== */

(function () {
  "use strict";

  var host = location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") { return; }

  /* Aplikacija mora biti učitana — panel se veže na njen mali API. */
  if (!window.mojZikr) { return; }

  var DAY_NAMES = [
    "Nedjelja", "Ponedjeljak", "Utorak", "Srijeda",
    "Četvrtak", "Petak", "Subota"
  ];

  /* Vremena koja se najčešće provjeravaju. Petačke granice su tu namjerno:
     12:00 je zadnji petački podsjetnik, 12:15 mora biti tišina, a u 13:00
     kreće dnevni. */
  var TIMES = ["08:00", "10:00", "12:00", "12:15", "13:00", "19:00", "23:00"];

  var el = {};
  var atTime = "12:00";

  /* 60 = kako je u produkciji (jedan podsjetnik na sat). 1 = brzo, svaka
     minuta je nov slot. Šalje se serveru po pozivu, pa ne zavisi od
     REMINDER_INTERVAL_MINUTES u .env.local. */
  var interval = 60;

  /* ------------------------------------------------------------------------
     Sitni graditelji
     ------------------------------------------------------------------------ */

  function node(tag, className, text) {
    var n = document.createElement(tag);
    if (className) { n.className = className; }
    if (text !== undefined) { n.textContent = text; }
    return n;
  }

  function button(className, text, onClick) {
    var b = node("button", className, text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  function weekdayOf(key) {
    var p = key.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  }

  /* Prvi petak od prikazanog dana (uključujući njega). */
  function nextFriday(key) {
    var p = key.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    while (d.getUTCDay() !== 5) { d.setUTCDate(d.getUTCDate() + 1); }
    return d.getUTCFullYear() + "-" +
           String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
           String(d.getUTCDate()).padStart(2, "0");
  }

  function prettyDay(key) {
    var p = key.split("-").map(Number);
    return DAY_NAMES[weekdayOf(key)] + ", " + p[2] + "." + p[1] + "." + p[0] + ".";
  }

  /* ------------------------------------------------------------------------
     Okidanje — pozove pravi scheduler i ispiše njegov izvještaj
     ------------------------------------------------------------------------ */

  function fire(dry) {
    var day = window.mojZikr.dan();

    /* Odluka ide po onome što je NA EKRANU, a ne po bazi: na probnom danu
       kvačice se čuvaju lokalno i namjerno ne idu na server, pa bi bez ovoga
       svaka proba izgledala kao "ništa čekirano" i tekst bi uvijek bio
       "Nemoj zaboraviti". Server ovo koristi samo za taj poziv i ništa ne
       upisuje. */
    var checked = Object.keys(window.mojZikr.cekirano()).join(",");

    /* Ime ide uz `checked`: stanje sa ekrana je stanje JEDNOG korisnika, pa
       server bez ovoga nametne ovaj spisak i tuđim uređajima i izvještaj
       slaže. Bez imena (config prazan) server gleda sve uređaje, što je
       tačno ono što treba na svježoj instalaciji. */
    var user = (window.mojZikrConfig && window.mojZikrConfig.korisnik()) || "";

    var params = "date=" + encodeURIComponent(day) +
                 "&at=" + encodeURIComponent(atTime) +
                 "&interval=" + interval +
                 "&checked=" + encodeURIComponent(checked) +
                 (user ? "&user=" + encodeURIComponent(user) : "") +
                 (el.reset.checked ? "&reset=1" : "") +
                 (dry ? "&dry=1" : "");

    setResult("čekam server…", null);

    fetch("/api/cron?" + params, { headers: { "Accept": "application/json" } })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (out) {
        if (!out.ok) {
          /* Najčešće: REMINDER_TIME_TRAVEL nije postavljen, pa server traži
             CRON_SECRET i vraća 401. */
          setResult((out.data && out.data.error) || "server je odbio zahtjev",
            "Dodaj REMINDER_TIME_TRAVEL=1 u .env.local i restartuj `npm run dev`.");
          return;
        }
        renderReport(out.data, dry);
      })
      .catch(function (err) {
        setResult("nema veze sa serverom", String((err && err.message) || err));
      });
  }

  function renderReport(r, dry) {
    el.result.textContent = "";

    var head = node("p", "devp-result-head");
    head.textContent = (dry ? "samo prikaz · " : "poslano · ") +
      hhmmOf(r.minutes) + " · " + DAY_NAMES[r.weekday] +
      " · interval " + r.interval + " min" +
      (r.checkedFrom === "ekran" ? " · po ekranu" : "");
    el.result.appendChild(head);

    /* Čiji spisak — da se nikad ne pomiješa proba sa tuđim. */
    var imena = Object.keys(r.users || {});
    if (el.host) {
      el.host.textContent = "localhost · " +
        (imena.length ? imena.join(", ") : "bez korisnika");
    }

    if (!r.devices) {
      el.result.appendChild(node("p", "devp-warn",
        "Nijedan uređaj nije pretplaćen — uključi podsjetnike (zvono) pa okini opet."));
    }

    if (!r.sent || !r.sent.length) {
      el.result.appendChild(node("p", "devp-silent", "tišina — ništa se ne šalje"));
    } else {
      r.sent.forEach(function (s) {
        var row = node("div", "devp-sent");
        row.appendChild(node("span", "devp-tag", s.task));
        var txt = node("span", "devp-sent-text");
        txt.appendChild(node("strong", null, s.title || ""));
        txt.appendChild(node("span", null, " " + (s.body || "")));
        row.appendChild(txt);
        el.result.appendChild(row);
      });
    }

    /* Zašto — prozori, status i zaklanjanje, doslovno iz izvještaja. Sve to
       zavisi od spiska i configa POJEDINOG korisnika, pa se ispisuje po
       korisniku. Sa jednim (uobičajeno) izgleda kao i prije, samo sa imenom
       iznad. */
    imena.forEach(function (ime) {
      var u = r.users[ime];

      var head = node("p", "devp-user");
      head.textContent = ime + " · " + u.devices +
        (u.devices === 1 ? " uređaj" : " uređaja");
      /* Isključene stavke su čest razlog tišine: one smanjuju `total`, pa
         podsjetnik zna biti "done" a da ništa ne izgleda urađeno. Neka se
         vidi bez kopanja po bazi. */
      var skriveno = (u.prefs && u.prefs.skriveno) || [];
      if (skriveno.length) {
        head.textContent += " · isključeno stavki: " + skriveno.length;
      }
      el.result.appendChild(head);

      var why = node("dl", "devp-why");
      Object.keys(u.windows || {}).forEach(function (id) {
        why.appendChild(node("dt", null, id));
        why.appendChild(node("dd", null,
          u.windows[id] + "   ·   " + ((u.status || {})[id] || "?")));
      });
      /* Broj koji bi u tom trenutku stajao na ikonici aplikacije. Ne prati
         obavijesti nego prozore: zbir neurađenog iz svih podsjetnika čiji je
         startTime prošao, pa se vidi i kad je sve ostalo tiho. */
      why.appendChild(node("dt", null, "ikonica"));
      why.appendChild(node("dd", null,
        u.badge ? String(u.badge) : "bez broja"));

      if (u.quiet && u.quiet.length) {
        why.appendChild(node("dt", null, "ćuti"));
        why.appendChild(node("dd", null, u.quiet.join(", ")));
      }
      if (u.blocked && u.blocked.length) {
        why.appendChild(node("dt", null, "zaklonjeno"));
        why.appendChild(node("dd", null, u.blocked.join(", ")));
      }
      el.result.appendChild(why);
    });
  }

  function hhmmOf(minutes) {
    return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" +
           String(minutes % 60).padStart(2, "0");
  }

  function setResult(text, hint) {
    el.result.textContent = "";
    el.result.appendChild(node("p", "devp-result-head", text));
    if (hint) { el.result.appendChild(node("p", "devp-warn", hint)); }
  }

  /* ------------------------------------------------------------------------
     Panel
     ------------------------------------------------------------------------ */

  function build() {
    el.panel = node("aside", "devp");
    el.panel.hidden = true;

    var head = node("div", "devp-head");
    head.appendChild(node("span", "devp-title", "proba"));
    el.host = node("span", "devp-host", "localhost");
    head.appendChild(el.host);
    head.appendChild(button("devp-close", "✕", toggle));
    el.panel.appendChild(head);

    /* --- dan --- */
    el.panel.appendChild(node("p", "devp-label", "Dan"));

    var dayRow = node("div", "devp-day");
    dayRow.appendChild(button("devp-arrow", "‹", function () {
      window.mojZikr.pomjeri(-1);
    }));
    el.dayText = node("span", "devp-day-text");
    dayRow.appendChild(el.dayText);
    dayRow.appendChild(button("devp-arrow", "›", function () {
      window.mojZikr.pomjeri(1);
    }));
    el.panel.appendChild(dayRow);

    var dayBtns = node("div", "devp-chips");
    dayBtns.appendChild(button("devp-chip", "danas", function () {
      window.mojZikr.prikazi(window.mojZikr.danas());
    }));
    dayBtns.appendChild(button("devp-chip", "prvi petak", function () {
      window.mojZikr.prikazi(nextFriday(window.mojZikr.danas()));
    }));
    el.panel.appendChild(dayBtns);

    /* --- vrijeme --- */
    el.panel.appendChild(node("p", "devp-label", "Vrijeme (glumi se serveru)"));

    el.timeChips = node("div", "devp-chips");
    TIMES.forEach(function (t) {
      el.timeChips.appendChild(button("devp-chip", t, function () {
        atTime = t;
        el.timeInput.value = t;
        syncTimeChips();
      }));
    });
    el.panel.appendChild(el.timeChips);

    el.timeInput = document.createElement("input");
    el.timeInput.type = "time";
    el.timeInput.className = "devp-time";
    el.timeInput.value = atTime;
    el.timeInput.addEventListener("change", function () {
      atTime = el.timeInput.value || atTime;
      syncTimeChips();
    });
    el.panel.appendChild(el.timeInput);

    /* --- interval --- */
    el.panel.appendChild(node("p", "devp-label", "Interval"));

    el.intervalChips = node("div", "devp-chips");
    [[60, "60 min · kao u produkciji"], [1, "1 min · brzo"]].forEach(function (pair) {
      el.intervalChips.appendChild(button("devp-chip", pair[1], function () {
        interval = pair[0];
        syncIntervalChips();
      }));
    });
    el.panel.appendChild(el.intervalChips);

    /* --- okidanje --- */
    var resetRow = node("label", "devp-check");
    el.reset = document.createElement("input");
    el.reset.type = "checkbox";
    el.reset.checked = true;
    resetRow.appendChild(el.reset);
    resetRow.appendChild(node("span", null,
      "resetuj “poslano” (da isti trenutak može opet)"));
    el.panel.appendChild(resetRow);

    var fireRow = node("div", "devp-fire");
    fireRow.appendChild(button("devp-btn devp-btn-main", "Okini — pošalji",
      function () { fire(false); }));
    fireRow.appendChild(button("devp-btn", "samo pokaži",
      function () { fire(true); }));
    el.panel.appendChild(fireRow);

    el.result = node("div", "devp-result");
    el.panel.appendChild(el.result);
    setResult("okini pa se ovdje ispiše šta je server odlučio", null);

    document.body.appendChild(el.panel);

    /* Dugme koje panel otvara — stoji dolje lijevo, van puta. */
    el.fab = button("devp-fab", "", toggle);
    el.fab.setAttribute("aria-label", "Testni panel");
    el.fab.title = "Testni panel (localhost)";
    el.fab.appendChild(node("span", "devp-fab-dot"));
    el.fab.appendChild(node("span", "devp-fab-text", "proba"));
    document.body.appendChild(el.fab);
  }

  function syncIntervalChips() {
    Array.prototype.forEach.call(
      el.intervalChips.querySelectorAll(".devp-chip"),
      function (chip) {
        chip.classList.toggle("is-on", chip.textContent.indexOf(interval + " min") === 0);
      }
    );
  }

  function syncTimeChips() {
    Array.prototype.forEach.call(
      el.timeChips.querySelectorAll(".devp-chip"),
      function (chip) {
        chip.classList.toggle("is-on", chip.textContent === atTime);
      }
    );
  }

  function toggle() {
    el.panel.hidden = !el.panel.hidden;
    el.fab.classList.toggle("is-open", !el.panel.hidden);
  }

  /* Traka na vrhu ekrana dok se gleda dan koji nije današnji — da se proba
     nikad ne pomiješa sa stvarnim danom. */
  function buildRibbon() {
    el.ribbon = node("div", "devp-ribbon");
    el.ribbon.appendChild(el.ribbonText = node("span", null, ""));
    el.ribbon.appendChild(button("devp-ribbon-btn", "natrag na danas", function () {
      window.mojZikr.prikazi(window.mojZikr.danas());
    }));
    document.body.appendChild(el.ribbon);
  }

  /* ------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------ */

  build();
  buildRibbon();
  syncTimeChips();
  syncIntervalChips();

  window.mojZikr.naPromjenu(function (day, today) {
    el.dayText.textContent = prettyDay(day);
    var proba = day !== today;
    el.ribbon.hidden = !proba;
    el.ribbonText.textContent = "proba: " + prettyDay(day) +
      " — kvačice se ne dijele";
    document.body.classList.toggle("has-devp-ribbon", proba);
  });

})();
