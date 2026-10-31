// Service worker: shows the pushes from the server (src/lib/push.ts) and opens the page on a
// click. No caching – the pages always come fresh from the server.
/* global self */

self.addEventListener('push', (event) => {
  const message = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(message.title || 'Bretten Kangaroos', {
      body: message.body,
      tag: message.tag,
      icon: '/crest.png',
      badge: '/crest.png',
      data: { url: message.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => 'navigate' in w);
      return open ? open.navigate(url).then((w) => w?.focus()) : self.clients.openWindow(url);
    }),
  );
});
