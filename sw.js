const CACHE_NAME = "taxi-bo-v90";
const APP_SHELL = [
  "./",
  "./index.html",
  "./academy.html",
  "./settings.html",
  "./four-in-one.html",
  "./four-in-one.css?v=2",
  "./four-in-one.js?v=2",
  "./phone.html",
  "./styles.css?v=90",
  "./app.js?v=90",
  "./academy.js?v=80",
  "./settings.js?v=80",
  "./phone.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((asset) =>
          cache.add(asset).catch((error) => {
            console.warn("TaxiBo cache skipped", asset, error);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request, {
        cache: "no-store"
      })
    );
    return;
  }

  const isAppFile =
    url.origin === self.location.origin &&
    (url.pathname.endsWith("/") ||
      url.pathname.endsWith("/index.html") ||
      url.pathname.endsWith("/academy.html") ||
      url.pathname.endsWith("/settings.html") ||
      url.pathname.endsWith("/phone.html") ||
      url.pathname.endsWith("/styles.css") ||
      url.pathname.endsWith("/app.js") ||
      url.pathname.endsWith("/academy.js") ||
      url.pathname.endsWith("/settings.js") ||
      url.pathname.endsWith("/phone.js"));

  if (isAppFile) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
