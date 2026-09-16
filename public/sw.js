/**
 * Hilman. Studio — service worker.
 *
 * Its whole job is to make the app *open* without a network. It does not try
 * to be an offline database: drafts, queued saves and snapshots live in
 * IndexedDB (see lib/studio-local/), where the app can reason about them.
 *
 * The rule that shapes everything below: nothing private is ever written to
 * Cache Storage. Admin HTML carries the owner's email and dashboard data, and
 * API responses carry content that is not published yet. Both stay on the
 * network. What gets cached is the shell — build assets, icons, and one static
 * offline page.
 *
 * Bump CACHE to roll every cached asset on the next visit.
 */

const CACHE = "hilman-studio-shell-v1";
const OFFLINE_URL = "/studio-offline";

const SHELL = [
  OFFLINE_URL,
  "/icons/studio-192.png",
  "/icons/studio-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Individually, so one 404 during a deploy cannot fail the whole install
      // and leave the app with no offline page at all.
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch((error) => {
            console.warn("[studio sw] could not precache", url, error);
          })
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

/** The page asks for this after a deploy so the new worker takes over at once. */
self.addEventListener("message", (event) => {
  if (event.data === "hilman:skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch the API. Signed uploads and the sync endpoint are mutations
  // with auth on them; a cached copy would be both stale and private.
  if (url.pathname.startsWith("/api/")) return;

  // Build output is content-hashed, so a hit is always the right file.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })()
    );
    return;
  }

  // Studio pages stay network-first: they are personal, and a stale dashboard
  // is worse than an honest offline screen. When the network is gone, hand
  // over the static shell, which reads what is in IndexedDB.
  if (request.mode === "navigate" && url.pathname.startsWith("/admin")) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await caches.match(OFFLINE_URL)) ?? Response.error();
        }
      })()
    );
  }
});
