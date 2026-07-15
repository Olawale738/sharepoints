const CACHE_NAME = "letw-shell-v3";
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
  "/dashboard/certificates",
  "/dashboard/calendar",
  "/dashboard/profile",
  "/dashboard/admin",
  "/dashboard/admin/platform-excellence",
  "/dashboard/admin/enterprise",
  "/dashboard/admin/executive-operations",
  "/dashboard/admin/notifications",
  "/dashboard/access-requests"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          const response = preload || (await fetch(event.request));
          if (response.ok) {
            const copy = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, copy);
          }
          return response;
        } catch {
          const cached = await caches.match(event.request);
          return cached || (await caches.match("/offline")) || new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && (SHELL.includes(url.pathname) || !url.pathname.startsWith("/dashboard"))) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => {
          if (event.request.destination === "document") return caches.match("/offline");
          return new Response("", { status: 504 });
        });
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "LETW", body: event.data ? event.data.text() : "New LETW notification" };
  }

  const title = payload.title || "LETW";
  const options = {
    body: payload.body || "You have a new LETW update.",
    icon: "/letw-logo.png",
    badge: "/letw-logo.png",
    tag: payload.tag || "letw-notification",
    data: {
      url: payload.url || payload.href || "/dashboard"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url === targetUrl) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
