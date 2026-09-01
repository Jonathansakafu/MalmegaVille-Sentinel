// MalmegaVille Sentinel push notification service worker.
// Receives push events from the browser's push service and shows a
// notification even when no dashboard tab is open, then focuses/opens the
// dashboard when the notification is clicked.

self.addEventListener('push', (event) => {
  let payload = { title: 'MalmegaVille Sentinel', body: 'A new security event was detected.', url: '/' };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch (error) {
    // Non-JSON push payload; fall back to the default text above.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/logo.jpeg',
      badge: '/logo.jpeg',
      data: { url: payload.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
