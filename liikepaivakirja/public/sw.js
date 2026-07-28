/* Self-destroying service worker — the kill switch.
 *
 * This file exists at the same URL the previous workbox worker was published at,
 * so a browser that already has that worker installed will fetch this on its next
 * update check, see different bytes, install it, and run the code below. That is
 * the only reliable way to retire a service worker on a device you cannot reach:
 * simply deleting sw.js from the deploy also works, but not promptly enough on
 * iOS, where there are no developer tools and no way for the user to intervene.
 *
 * It clears the Cache Storage API and unregisters itself. It does NOT touch
 * IndexedDB — that is a separate store and it holds the diary. Nothing here can
 * lose an entry.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* carry on: unregistering matters more than tidying up */
      }
      try {
        await self.registration.unregister();
      } catch {
        /* ignore */
      }
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        clients.forEach((c) => c.navigate(c.url));
      } catch {
        /* ignore */
      }
    })()
  );
});
