const CACHE = 'coil-v1';
const OFFLINE = ['/'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(OFFLINE); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  // Network first for API calls
  if (e.request.url.includes('/scan') || e.request.url.includes('/records') || 
      e.request.url.includes('/delete') || e.request.url.includes('/updatewo') ||
      e.request.url.includes('/extractpdf')) return;
  e.respondWith(
    fetch(e.request).catch(function() {
      return caches.match(e.request).then(function(r) {
        return r || caches.match('/');
      });
    })
  );
});
