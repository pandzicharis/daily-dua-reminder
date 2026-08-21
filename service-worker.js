/* ==========================================================================
   service-worker.js
   --------------------------------------------------------------------------
   Service worker radi SAMO tri stvari:
     1. prima push poruku i prikazuje obavijest
     2. obrađuje klik na obavijest (otvara / fokusira aplikaciju)
     3. drži offline kopiju statičkih fajlova

   NIKAKVO zakazivanje se ne dešava ovdje. Kad je PWA zatvorena, service
   worker ne radi — zakazivanje je isključivo na serveru (Vercel Cron).
   ========================================================================== */

var CACHE = "moj-zikr-v3";

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

  event.waitUntil(
    sessionInProgress().then(function (aktivna) {
      if (aktivna) { return; }
      return self.registration.showNotification(title, options);
    })
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
