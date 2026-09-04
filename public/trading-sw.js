/*
 * Clunoid Trading Desk — service worker.
 *
 * Deliberately minimal. It renders the alerts the server pushes, even when
 * every tab is closed, and it does nothing else to the network: the `fetch`
 * listener below never calls respondWith, so every request is left to the
 * browser exactly as if no service worker existed. Nothing is cached. A stale
 * balance is worse than a slow one.
 *
 * Why have a fetch listener at all, then: Chrome will not fire
 * `beforeinstallprompt` without one. It dropped that requirement for installing
 * from the browser's own menu in 108 on mobile and 112 on desktop, but the
 * algorithm behind the prompt still insists on it — and the prompt is what the
 * install button and the install card on this site are built on. Without these
 * two lines they are drawn for an event that never arrives.
 *
 * Scoped to "/trading", which is where the app lives and what the manifest's
 * start_url points at.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Present so the install prompt can fire; deliberately does nothing.
self.addEventListener("fetch", () => { /* straight to the network */ });

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
