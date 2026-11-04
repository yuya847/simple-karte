// Simple Karte 障害時の参照: keeps this one page and its script, so /downtime/index.html opens without a network.
// Its scope is /downtime/ only: the app itself is never cached or changed by it. With a network the page is
// fetched as usual (and the copy renewed); without one, or when the network does not answer in 4 seconds,
// the kept copy is shown.
var CACHE = "simple-karte-downtime-v1";
var FILES = ["/downtime/index.html", "/downtime/view.js"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(FILES);
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k.indexOf("simple-karte-downtime-") === 0 && k !== CACHE;
            })
            .map(function (k) {
              return caches.delete(k);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || FILES.indexOf(url.pathname) < 0) return;
  var key = url.pathname;
  var fromCache = function () {
    return caches.match(key).then(function (hit) {
      return hit || new Response("この端末には、障害時の参照の画面が保存されていません。", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    });
  };
  var fromNetwork = fetch(event.request).then(function (res) {
    if (res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (cache) {
        cache.put(key, copy);
      });
    }
    return res;
  });
  var timeout = new Promise(function (_, reject) {
    setTimeout(function () {
      reject(new Error("timeout"));
    }, 4000);
  });
  event.respondWith(Promise.race([fromNetwork, timeout]).catch(fromCache));
});
