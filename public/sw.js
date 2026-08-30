/*
 * Pepper Pan service worker.
 *
 * Its only job is notifications. There is deliberately no offline caching
 * here: a menu, a price and an order status are exactly the things that must
 * never be served stale, and a shop that shows yesterday's "sold out" is
 * worse than one that shows a network error.
 *
 * This file is served from /sw.js so its scope is the whole site. Moving it
 * would silently shrink that scope to its own folder.
 */

// Take over immediately rather than waiting for every tab to close — an old
// worker would keep showing the old notification text after a deploy.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
);

self.addEventListener("push", (event) => {
  // A push with no readable payload still means *something* happened, and
  // silence would be the wrong answer — browsers may also revoke the
  // subscription of a worker that receives a push and shows nothing.
  let data = {
    title: "Pepper Pan",
    body: "May bago sa order mo.",
    url: "/orders",
  };

  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch {
      /* keep the default */
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.png",
      badge: "/icon.png",
      // Collapses updates about the same thing: the current state belongs on
      // the lock screen, not a history of it.
      tag: data.tag,
      renotify: Boolean(data.tag),
      // A stall's notifications are worth a buzz — this is the whole point of
      // the feature for the owner, who is cooking and not looking.
      vibrate: [90, 60, 90],
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Reuse a tab that's already open on this site rather than piling up
      // windows — the owner taps these all day.
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              /* focusing is already most of the value */
            }
          }
          return;
        }
      }

      await self.clients.openWindow(target);
    })()
  );
});
