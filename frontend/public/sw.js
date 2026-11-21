const CACHE_NAME = 'itinbee-shell-v2';
const SHELL_ROUTES = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/llms.txt'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ROUTES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API routes or Next.js App Router RSC flight / prefetch requests
  if (
    url.pathname.startsWith('/api/') ||
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-Prefetch') === '1' ||
    url.searchParams.has('_rsc')
  ) {
    return;
  }

  if (url.pathname.startsWith('/t/') || url.pathname.startsWith('/trip/') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
  }
});
