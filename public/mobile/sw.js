// HiPass MediQ Service Worker (PWA Offline App Shell Cache)
// Security Principle: Only static client assets (HTML, CSS, JS, Icons) are cached.
// Sensitive clinical data and API endpoints (/api/*) are NEVER stored in cache.

const CACHE_NAME = "hipass-mediq-shell-v1";

const APP_SHELL_ASSETS = [
  "/mobile/",
  "/mobile/index.html",
  "/mobile/style.css",
  "/mobile/app.js",
  "/qrcode.js",
  "/mobile/manifest.json",
  "/mobile/icon-192.png",
  "/mobile/icon-512.png",
  "/mobile/icon.svg"
];

// 1. Install Event: Precache Application Shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up outdated caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Routing & Cache Strategy
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // Exclude non-GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // Security Rule: NEVER cache /api/* or sensitive endpoints
  if (requestUrl.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App Shell Cache Strategy: Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // If valid response from same-origin static asset, update cache
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            requestUrl.origin === self.location.origin &&
            (requestUrl.pathname.startsWith("/mobile/") || requestUrl.pathname.endsWith(".js") || requestUrl.pathname.endsWith(".css"))
          ) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // Offline navigation fallback
          if (event.request.mode === "navigate") {
            return cache.match("/mobile/index.html");
          }
        });

        return cachedResponse || fetchPromise;
      });
    })
  );
});
