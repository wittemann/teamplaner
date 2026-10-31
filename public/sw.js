// Service worker: shows the pushes from the server (src/lib/push.ts) and opens the page on a
// click. No caching – the pages always come fresh from the server.
/* global self */

self.addEventListener('push', (event) => {
  const message = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(message.title || 'Bretten Kangaroos', {
      body: message.body,
      tag: message.tag,
      icon: '/icon-192.png',
      badge: '/crest.png',
      data: { url: message.url || '/' },
    }),
  );
});

// A new version takes over at once, and pages opened before it become controlled (so they get
// the message below)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// An open page (often the installed app in the background) is told to load the address fresh –
// iPhones would otherwise just bring back the page as it was, with an old coach note.
// See the listener in src/layouts/Base.astro.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      if (!open) return self.clients.openWindow(url);
      open.postMessage({ type: 'open', url });
      return open.focus().catch(() => undefined);
    }),
  );
});
