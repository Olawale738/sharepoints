const CACHE_NAME = "letw-shell-v2";
const SHELL = [
  "/",
  "/login",
  "/offline",
  "/manifest.webmanifest",
  "/letw-logo.png",
  "/letw-logo-transparent.png",
  "/dashboard",
  "/dashboard/mobile-app",
  "/dashboard/membership-card",
  "/dashboard/knowledge",
  "/dashboard/certificates"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && (SHELL.includes(url.pathname) || !url.pathname.startsWith("/dashboard"))) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/offline")))
  );
});
