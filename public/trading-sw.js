/*
 * Clunoid Trading Desk — service worker.
 *
 * Two jobs. It renders the alerts the server pushes, even when every tab is
 * closed. And it makes the installed app open fast.
 *
 * It used to cache nothing — "a stale balance is worse than a slow one" — and
 * that reasoning still holds for the numbers. But nothing here caches a
 * balance: those come over the API and the socket, which are never touched.
 * What was slow was the SHELL: with nothing cached, opening the app meant
 * downloading the page and every script over whatever network the phone had
 * before a pixel could paint, and on a slow one Android called it "not
 * responding".
 *
 * So: pages go to the network FIRST, and a fast connection gets exactly what
 * it got before — the latest build. When the network is slow, the cached copy
 * is served after a short wait instead, and the fresh copy is stored whenever
 * it lands for the next launch. Next's build assets under /_next/static carry
 * a content hash in the URL and never change, so those are cache-first. The
 * shell is cached at install so the first launch after installing already has
 * something to paint from.
 *
 * Registered at scope "/", which is where the manifest's start_url points and
 * where the app actually lands.
 */
const VERSION = "clunoid-shell-v1";
const NET_TIMEOUT_MS = 2500;
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const immutable = (url) => url.pathname.startsWith("/_next/static/") || /\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf)$/i.test(url.pathname);
const cacheable = (res) => res && res.ok && res.type === "basic";
function withTimeout(promise) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), NET_TIMEOUT_MS);
    promise.then((res) => { clearTimeout(t); resolve(res); }, () => { clearTimeout(t); resolve(null); });
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never the API, never the data routes: a balance is not a thing to cache.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) return;
  // Only pages and build assets. Anything else — RSC payloads, streams — is left alone.
  const isPage = req.mode === "navigate";
  if (!isPage && !immutable(url)) return;

  if (immutable(url)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (cacheable(res)) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      })),
    );
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const net = fetch(req).then((res) => {
      if (cacheable(res)) cache.put(req, res.clone());
      return res;
    });
    net.catch(() => {});
    const fresh = await withTimeout(net);
    if (fresh) return fresh;
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    return fetch(req);
  })());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {};
  }
  const title = data.title || "Clunoid Trading Desk";
  const options = {
    body: data.body || "New trading signal.",
    tag: data.tag || "trading-signal",
    data: { url: data.url || "/" },
    icon: "/icon.png",
    badge: "/icon.png",
    renotify: true,
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
