/* ==========================================================================
   service-worker.js
   --------------------------------------------------------------------------
   Service worker radi SAMO četiri stvari:
     1. prima push poruku i prikazuje obavijest
     2. postavlja broj na ikonici aplikacije (broj stiže uz push)
     3. obrađuje klik na obavijest (otvara / fokusira aplikaciju)
     4. drži offline kopiju statičkih fajlova

   NIKAKVO zakazivanje se ne dešava ovdje. Kad je PWA zatvorena, service
   worker ne radi — zakazivanje je isključivo na serveru (Vercel Cron).
   ========================================================================== */

var CACHE = "moj-zikr-v4";

/* Ikonice obavijesti se keširaju već pri instalaciji. Push može doći kad
   uređaj nema mreže, a obavijest bez ikonice ne izgleda kao da je iz
   aplikacije — ostatak fajlova se kešira sam, kroz `fetch`. */
var NOTIFICATION_ICONS = ["/icons/icon-192.png", "/icons/icon-96.png"];

/* Nova verzija preuzima odmah, bez čekanja da se zatvore svi tabovi. */
self.addEventListener("install", function (event) {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(NOTIFICATION_ICONS); })
      /* Bez mreže pri instalaciji — keširaće se pri prvom otvaranju. */
      .catch(function () {})
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key === CACHE ? null : caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* ------------------------------------------------------------------------
   Offline — network-first
   Uvijek prvo mreža (da nikad ne servira zastarjeli sadržaj), a keš je
   rezerva kad nema interneta. /api/ se nikad ne kešira.
   ------------------------------------------------------------------------ */
self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") { return; }

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) { return; }
  if (url.pathname.indexOf("/api/") === 0) { return; }

  event.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) { return hit; }
          if (req.mode === "navigate") { return caches.match("/index.html"); }
          return Response.error();
        });
      })
  );
});

/* ------------------------------------------------------------------------
   Broj na ikonici — kad je aplikacija zatvorena, ovo je jedino mjesto koje
   ga može promijeniti.

   Pravilo se ovdje NE računa: server ga je već izračunao (`badgeCount()` u
   api/_lib.js) i poslao uz podsjetnik, jer je on jedini koji zna šta je
   čekirano dok aplikacija ne radi. Ovdje se broj samo postavi.

   Isto pravilo, pisano na tri mjesta jer su tri svijeta (ekran, server,
   service worker), stoji u zaglavlju badge.js.

   Push bez `badge` polja (npr. `npm run test-push`) NE dira ikonicu —
   proba izgleda obavijesti ne smije ostaviti izmišljen broj za sobom.

   SVAKI DAN JE NOV BROJAČ, pa uz broj stiže i dan za koji je izbrojan
   (`badgeDan`). Push ima TTL od 55 minuta i APNs ga zna isporučiti sa
   zakašnjenjem: onaj poslan u 23:00 može stići u 00:20, a tada jučerašnji
   broj nije "malo star" nego pogrešan — novi dan počinje prazan. Takva
   poruka zato ikonicu ČISTI umjesto da je naslika; nula je u tom trenutku
   tačan odgovor, jer prvi podsjetnik novog dana tek slijedi.
   ------------------------------------------------------------------------ */

/* "YYYY-MM-DD" po lokalnom vremenu uređaja — istim pravilom kojim aplikacija
   računa svoj dan (`getLocalDateKey()` u script.js), da se ikonica i ekran ne
   mogu raziće. Server računa po Sarajevu; za uređaj u drugoj zoni se ta dva
   dana mogu razlikovati, i tada se ikonica jednom očisti bez potrebe —
   bezopasno, jer je prvo otvaranje aplikacije ili prvi sljedeći podsjetnik
   ionako prepišu. */
function danasKey() {
  var d = new Date();
  return d.getFullYear() + "-" +
         String(d.getMonth() + 1).padStart(2, "0") + "-" +
         String(d.getDate()).padStart(2, "0");
}

function postaviBroj(n) {
  if (n === null) { return Promise.resolve(); }
  if (!self.navigator || typeof self.navigator.setAppBadge !== "function") {
    return Promise.resolve();
  }

  var p = n > 0 ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge();
  /* Bez dozvole za obavijesti iOS odbije poziv — nema se šta popraviti. */
  return Promise.resolve(p).catch(function () {});
}

/* ------------------------------------------------------------------------
   Push — server je odlučio da treba podsjetnik, ovdje se samo prikazuje

   Osim kad je sesija U TOKU: tada spisak već stoji pred korisnikom i
   obavijest o istoj toj stvari je samo smetnja.

   "Sesija u toku" znači oba uslova zajedno:

     visibilityState === "visible"   prozor nije minimiziran, nije druga
                                     kartica, nije pozadina na telefonu
     focused === true                prozor je onaj u kojem korisnik radi

   Samo `visible` nije dovoljno: na laptopu prozor iza drugog programa i
   dalje prijavljuje "visible", a to nije aktivna sesija — tamo obavijest
   treba da stigne. Sve što nije aktivna sesija se računa kao zatvoreno.

   Nema izuzetka od `userVisibleOnly` — pravilo traži vidljiv odgovor na
   push, a aktivna aplikacija to jeste, pa browser ne prikazuje svoju
   zamjensku obavijest.
   ------------------------------------------------------------------------ */

function sessionInProgress() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true })
    .then(function (list) {
      return list.some(function (client) {
        return client.visibilityState === "visible" &&
               client.focused === true &&
               new URL(client.url).origin === self.location.origin;
      });
    })
    /* Ako se spisak prozora ne može dobiti, radije prikaži obavijest nego
       da je korisnik nikad ne dobije. */
    .catch(function () { return false; });
}

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }

  var title = data.title || "Zikr";
  var options = {
    body: data.body || "",
    /* Isti tag = nova obavijest zamjenjuje staru istog podsjetnika, pa se ne
       gomila deset istih na zaključanom ekranu. Dnevni i večernji imaju
       različit tag, pa se ne gaze međusobno. */
    tag: data.tag || "moj-zikr",
    /* Bez ovoga bi zamjena po istom tagu bila nijema — obavijest bi se tiho
       osvježila, bez zvuka i bez bannera. */
    renotify: true,
    /* Zvuk pušta sam OS, svojim podrazumijevanim tonom za obavijesti (macOS
       i iOS ne daju webu da bira ton). Jedino što se odavde može jeste da
       obavijest NE bude nijema, pa je `silent` izričito false. */
    silent: false,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-96.png",
    data: { url: data.url || "/", taskId: data.taskId || null }
  };

  /* Broj za ikonicu. Stiže kao obično polje u push poruci; sve što nije
     valjan broj znači "ne diraj ikonicu". */
  var badge = (typeof data.badge === "number" && isFinite(data.badge))
    ? Math.max(0, Math.round(data.badge))
    : null;

  /* Zakašnjela poruka iz jučerašnjeg dana — očisti ikonicu umjesto da na nju
     preneseš jučerašnji broj. Poruka bez `badgeDan` se ne dira: nju šalje
     samo proba, koja broj ionako ne nosi. */
  if (badge !== null && data.badgeDan && data.badgeDan !== danasKey()) {
    badge = 0;
  }

  event.waitUntil(
    Promise.all([
      /* Ikonica se postavlja UVIJEK, i kad se obavijest preskoči zbog
         aktivne sesije: tada je aplikacija otvorena pa će svoj broj
         svejedno prepisati, a kad nije — ovo je jedini put do ikonice. */
      postaviBroj(badge),
      sessionInProgress().then(function (aktivna) {
        if (aktivna) { return; }
        return self.registration.showNotification(title, options);
      })
    ])
  );
});

/* ------------------------------------------------------------------------
   Klik na obavijest — fokusiraj otvorenu PWA, inače je otvori
   ------------------------------------------------------------------------ */
self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  var target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(function (list) {
        for (var i = 0; i < list.length; i++) {
          var client = list[i];
          if (new URL(client.url).origin !== self.location.origin) { continue; }
          /* Prozor već postoji — samo mu reci gdje da skoči. */
          client.postMessage({ type: "navigate", url: target });
          return client.focus();
        }
        return self.clients.openWindow(target);
      })
  );
});

/* ------------------------------------------------------------------------
   Pretplata je istekla / browser ju je zamijenio novom
   Pokušaj se pretplatiti ponovo i javi backendu novi endpoint.
   ------------------------------------------------------------------------ */
self.addEventListener("pushsubscriptionchange", function (event) {
  var old = event.oldSubscription || null;
  var key = old && old.options ? old.options.applicationServerKey : null;

  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key
    })
      .then(function (sub) {
        return fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.toJSON(),
            oldEndpoint: old ? old.endpoint : null
          })
        });
      })
      .catch(function () {
        /* Bez dozvole ili bez ključa se ne može ništa — korisnik će
           ponovo uključiti podsjetnike iz aplikacije. */
      })
  );
});
