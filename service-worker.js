const CACHE_NAME = "decodemoi-v2";
const SHELL_ASSETS = ["index.html", "manifest.json", "assets/icone-decodemoi.png", "assets/dee-monogram.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      if (list.length) return list[0].focus();
      return self.clients.openWindow("/");
    })
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  const isDocument = event.request.mode === "navigate" || event.request.destination === "document" || url.pathname.endsWith(".html") || url.pathname === "/";
  event.respondWith(
    fetch(event.request, isDocument ? { cache: "no-store" } : undefined)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
