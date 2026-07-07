/*
 * Clunoid Trading Desk — push service worker.
 *
 * Deliberately minimal: it handles ONLY `push` and `notificationclick`. It has
 * NO `fetch` handler, so it never intercepts, caches, or alters any network
 * request — the rest of the app behaves exactly as if no service worker existed.
 * Its sole job is to render alerts the server pushes, even when every tab is
 * closed. Scoped narrowly (registered with scope "/trading") so it governs only
 * the desk.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

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
    data: { url: data.url || "/trading" },
    icon: "/icon.png",
    badge: "/icon.png",
    renotify: true,
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/trading";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes("/trading") && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
