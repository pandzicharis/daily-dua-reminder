/* ==========================================================================
   notifications.js — PWA i podsjetnici (frontend dio)

   Ovdje NEMA nikakvog mjerenja vremena. Nema setTimeout, setInterval ni
   sličnog — kad je aplikacija zatvorena, ništa od toga ne bi radilo.
   O tome KADA se šalje podsjetnik odlučuje isključivo server (api/cron.js).

   Ovaj fajl radi samo:
     1. registruje service worker
     2. traži dozvolu i pravi push pretplatu
     3. crta dugme za uključivanje/isključivanje

   Šta je danas čekirano ne ide odavde — to je posao sync.js, jer je stanje
   zajedničko za sve uređaje i vrijedi i kad podsjetnici uopšte nisu
   uključeni. Server sam računa dokle je koji podsjetnik došao.
   ========================================================================== */

(function () {
  "use strict";

  var SUB_ID_KEY = "moj-zikr-sub-id";   /* id pretplate koji vrati server */

  var el = {
    btn: document.getElementById("notifyBtn"),
    status: document.getElementById("notifyStatus")
  };

  var supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  /* ------------------------------------------------------------------------
     Pomoćno
     ------------------------------------------------------------------------ */

  /* VAPID javni ključ dolazi kao base64url string, a pushManager traži
     Uint8Array — otuda ova konverzija. */
  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = window.atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) { out[i] = raw.charCodeAt(i); }
    return out;
  }

  function setStatus(text, tone) {
    if (!el.status) { return; }
    el.status.textContent = text;
    el.status.className = "notify-status" + (tone ? " is-" + tone : "");
  }

  /* Da li je PWA pokrenuta sa Home Screena. iOS traži baš to za push. */
  function isStandalone() {
    return window.navigator.standalone === true ||
           window.matchMedia("(display-mode: standalone)").matches;
  }

  /* ------------------------------------------------------------------------
     Uključivanje / isključivanje
     ------------------------------------------------------------------------ */

  function registerSW() {
    return navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
      .then(function () { return navigator.serviceWorker.ready; });
  }

  function enable() {
    if (!supported) { return; }

    setStatus("Tražim dozvolu…");
    el.btn.disabled = true;

    /* iOS izdaje push pretplatu samo instaliranoj PWA. */
    if (!isStandalone() && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      el.btn.disabled = false;
      setStatus("Prvo dodaj aplikaciju na početni ekran (Podijeli → Dodaj na početni ekran), pa uključi podsjetnike odatle.", "warn");
      return;
    }

    Notification.requestPermission()
      .then(function (permission) {
        if (permission !== "granted") {
          throw new Error("Dozvola je odbijena. Uključi je u postavkama telefona.");
        }
        return registerSW();
      })
      .then(function (reg) {
        /* Javni VAPID ključ dolazi sa servera — tako postoji samo na
           jednom mjestu (env varijabla) i ne može se raziće sa privatnim. */
        return fetch("/api/config")
          .then(function (r) {
            /* Najčešći uzrok: otvoreno preko običnog static servera ili
               file://, gdje /api/ uopšte ne postoji. */
            if (r.status === 404) {
              throw new Error("Backend nije dostupan (/api/config → 404). Pokreni `vercel dev` ili otvori objavljenu verziju na Vercelu.");
            }
            if (!r.ok) {
              throw new Error("Server ne daje VAPID ključ (" + r.status + ") — provjeri VAPID_PUBLIC_KEY u env varijablama.");
            }
            return r.json();
          }, function () {
            throw new Error("Nema veze sa serverom.");
          })
          .then(function (cfg) {
            if (!cfg || !cfg.vapidPublicKey) {
              throw new Error("Server nije vratio VAPID ključ.");
            }
            return reg.pushManager.getSubscription().then(function (existing) {
              if (existing) { return existing; }
              return reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey)
              }).then(null, function (e) {
                throw new Error("Browser nije izdao pretplatu: " + ((e && e.message) || e));
              });
            });
          });
      })
      .then(function (sub) {
        return fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() })
        }).then(function (res) {
          if (!res.ok) {
            throw new Error("Server nije primio pretplatu (" + res.status + ") — provjeri bazu (KV_REST_API_*).");
          }
          return res.json();
        });
      })
      .then(function (data) {
        if (!data || !data.id) { throw new Error("server nije vratio id"); }
        localStorage.setItem(SUB_ID_KEY, data.id);
        render();
      })
      .catch(function (err) {
        el.btn.disabled = false;
        /* Puna greška ide u konzolu, a korisniku se ispiše konkretan
           razlog — "nije uspjelo" ne kazuje šta popraviti. */
        if (window.console && console.error) { console.error("Podsjetnici:", err); }
        setStatus(
          (err && err.message) || "Nije uspjelo uključivanje podsjetnika.",
          "warn"
        );
      });
  }

  function disable() {
    el.btn.disabled = true;

    navigator.serviceWorker.ready
      .then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) {
        if (!sub) { return null; }
        var endpoint = sub.endpoint;
        return sub.unsubscribe().then(function () {
          return fetch("/api/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: endpoint })
          });
        });
      })
      .catch(function () { /* svejedno gasimo lokalno */ })
      .then(function () {
        localStorage.removeItem(SUB_ID_KEY);
        el.btn.disabled = false;
        render();
      });
  }

  /* ------------------------------------------------------------------------
     Prikaz kontrole
     ------------------------------------------------------------------------ */

  function render() {
    if (!el.btn) { return; }

    if (!supported) {
      el.btn.hidden = true;
      setStatus("Ovaj browser ne podržava podsjetnike.");
      return;
    }

    var on = !!localStorage.getItem(SUB_ID_KEY) &&
             Notification.permission === "granted";

    el.btn.disabled = false;
    el.btn.textContent = on ? "Isključi podsjetnike" : "Uključi podsjetnike";
    el.btn.classList.toggle("is-on", on);

    if (on) {
      setStatus("Podsjetnici su uključeni.", "ok");
    } else if (Notification.permission === "denied") {
      setStatus("Obavijesti su blokirane u postavkama telefona.", "warn");
    } else {
      setStatus("Podsjetnik dok dnevni zikr ne bude završen.");
    }
  }

  /* ------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------ */

  if (el.btn) {
    el.btn.addEventListener("click", function () {
      if (localStorage.getItem(SUB_ID_KEY)) { disable(); } else { enable(); }
    });
  }

  if (supported) {
    /* Registruj SW i pri običnom otvaranju — tako offline keš i push rade
       i prije nego korisnik dodirne dugme. */
    registerSW().then(function () {
      /* Pretplata je mogla nestati (reinstalacija, brisanje podataka). */
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription();
      });
    }).then(function (sub) {
      if (!sub && localStorage.getItem(SUB_ID_KEY)) {
        localStorage.removeItem(SUB_ID_KEY);
      }
      render();
    }).catch(function () { render(); });

    /* Klik na notifikaciju kad je aplikacija već otvorena. */
    navigator.serviceWorker.addEventListener("message", function (e) {
      var msg = e.data || {};
      if (msg.type !== "navigate" || !msg.url) { return; }
      var hash = String(msg.url).split("#")[1];
      if (!hash) { return; }
      var node = document.getElementById(hash);
      if (node) { node.scrollIntoView({ block: "start" }); }
    });
  } else {
    render();
  }

})();
