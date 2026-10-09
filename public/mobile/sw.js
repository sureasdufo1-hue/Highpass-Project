// HiPass MediQ Service Worker (PWA Offline App Shell Cache)
// Security Principle: Only static client assets (HTML, CSS, JS, Icons) are cached.
// Sensitive clinical data and API endpoints (/api/*) are NEVER stored in cache.

const CACHE_NAME = "hipass-mediq-shell-v5";

const APP_SHELL_ASSETS = [
  "/mobile/",
  "/mobile/index.html",
  "/mobile/style.css",
  "/ui/tokens.css",
  "/ui/components.css",
  "/ui/mobile.css",
  "/ui/brand.css",
  "/brand/mediq-source.png",
  "/mobile/app.js",
  "/qrcode.js",
  "/capstone-auth.js",
  "/patient-pixel-viewer.js",
  "/mobile/manifest.json",
  "/mobile/icon-192.png",
  "/mobile/icon-512.png",
  "/mobile/icon.svg"
];

// 1. Install Event: Precache Application Shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(APP_SHELL_ASSETS.map(async asset => {
        const response = await fetch(asset, { credentials: "omit", cache: "reload", signal: AbortSignal.timeout(10000) });
        if (response.status !== 200 || response.type === "opaque") throw new Error("APP_SHELL_UNAVAILABLE");
        await cache.put(asset, response);
      }));
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up outdated caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name.startsWith("hipass-mediq-shell-") && name !== CACHE_NAME) {
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

  // Exact public shell allowlist only; never handle credentials, query-bearing
  // URLs, DICOMweb or arbitrary /mobile/* responses through the cache.
  if (requestUrl.origin !== self.location.origin || requestUrl.search ||
      event.request.headers.has("authorization") ||
      !APP_SHELL_ASSETS.includes(requestUrl.pathname)) {
    return;
  }

  // Network first prevents an old role-header client surviving a deployment.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(event.request, { signal: AbortSignal.timeout(10000) });
        if (response.status === 200 && response.type !== "opaque") await cache.put(event.request, response.clone());
        return response;
      } catch {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          const shell = await cache.match("/mobile/index.html");
          if (shell) return shell;
        }
        return Response.error();
      }
    })()
  );
});
