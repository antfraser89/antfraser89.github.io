// Park!'s service worker: keeps the game playable with no connection.
// Everything from this folder is served from the cache when it is there, and
// refreshed in the background, so a new version arrives on the next visit.
const CACHE = 'park-v8.0.0';
const SHELL = ['./', 'index.html', 'css/style.css', 'css/screens.css', 'js/main.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'privacy.html', 'terms.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const ours = url.origin === self.location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!ours && !font) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: ours && request.mode === 'navigate' });
      const fresh = fetch(request).then((response) => {
        if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      // pictures and fonts never change under the same name: the cache is enough
      if (cached && (font || /\.(webp|png|svg|woff2)$/.test(url.pathname))) return cached;
      return cached ? (event.waitUntil(fresh), cached) : fresh;
    }),
  );
});
