/*
 * Wedding Pola offline worker. It caches the camera page and the site's static files so the camera
 * opens with no signal. It never caches anything that depends on a signed-in session or the
 * database: dashboards, the API, auth, and any response that sets a cookie go straight to the network.
 */
const VERSION = "v1";
const CACHE = `wedding-pola-${VERSION}`;
const CAMERA = "/camera";
const ICONS = ["/icons/icon-192.png", "/icons/icon-512.png"];
const STATIC_PREFIX = "/_next/static/";

// Set when a response carries a cookie. Such responses are per-user, so they are never stored.
function storable(response) {
  return response && response.ok && response.type === "basic" && !response.headers.has("set-cookie");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const wanted = new Set([CAMERA, ...ICONS]);
    // Read the camera page to learn the exact hashed JS and CSS files it loads, then keep them too.
    const page = await fetch(CAMERA, { cache: "no-store" }).catch(() => null);
    if (page && page.ok) {
      const html = await page.clone().text();
      for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) wanted.add(match[1]);
      if (storable(page)) await cache.put(CAMERA, page.clone());
    }
    await Promise.all([...wanted].filter((url) => url !== CAMERA).map(async (url) => {
      const res = await fetch(url, { cache: "no-store" }).catch(() => null);
      if (storable(res)) await cache.put(url, res.clone());
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("wedding-pola-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (storable(res)) await cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request).then(async (res) => {
    if (storable(res)) await cache.put(request, res.clone());
    return res;
  });
  if (hit) {
    refresh.catch(() => undefined);
    return hit;
  }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith(STATIC_PREFIX) || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname === CAMERA) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  // Everything else is not handled here, so the browser goes to the network as usual.
});
