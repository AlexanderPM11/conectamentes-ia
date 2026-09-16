const SW_VERSION = new URL(self.location.href).searchParams.get('v') || 'app';
const CACHE = `conectamente-shell-${SW_VERSION}`;
const SHELL = ['/', '/index.html', '/manifest.json?v=20260916-2', '/offline.html', '/icons/icon-180.png?v=20260916-2', '/icons/icon-192.png?v=20260916-2', '/icons/icon-512.png?v=20260916-2'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))), self.clients.claim()])));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js' || url.pathname === '/manifest.json') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put('/index.html', response.clone()));
      return response;
    }).catch(() => caches.match('/index.html').then(cached => cached ?? caches.match('/offline.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached ?? fetch(event.request).then(response => {
    if (response.ok && (event.request.destination || event.request.mode === 'navigate')) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match('/offline.html') : undefined)));
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    const payload = event.data ? event.data.json() : { title: 'ConectaMentes IA', body: 'Tienes una nueva notificación.', url: '/' };
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visibleWindow = windows.find(client => client.visibilityState === 'visible');
    if (visibleWindow) {
      visibleWindow.postMessage({ type: 'PUSH_NOTIFICATION', payload });
      return;
    }
    await self.registration.showNotification(payload.title || 'ConectaMentes IA', {
      body: payload.body || 'Tienes una nueva notificación.',
      icon: payload.icon || '/icons/icon-192.png?v=20260916-2',
      badge: payload.badge || '/icons/icon-192.png?v=20260916-2',
      tag: `conectamentes-${payload.type || 'general'}-${payload.referenceId || payload.id || 'new'}`,
      data: { url: payload.url || '/', notificationId: payload.id },
      vibrate: [180, 90, 180]
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const current = windows.find(client => client.url.startsWith(self.location.origin));
    if (current) {
      await current.navigate(targetUrl);
      return current.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
