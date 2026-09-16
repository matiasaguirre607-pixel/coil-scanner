const CACHE = 'coil-v2';
const STATIC = ['/', '/manifest.json'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(STATIC); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;
  // Network first for API calls
  if (url.includes('/scan') || url.includes('/records') || url.includes('/delete') || 
      url.includes('/updatewo') || url.includes('/extractpdf') || url.includes('/produccion') ||
      url.includes('supabase.co')) return;
  // Cache first for static assets
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var network = fetch(e.request).then(function(resp) {
        if (resp.ok) {
          var clone = resp.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return resp;
      });
      return cached || network;
    })
  );
});

// Push notification support
self.addEventListener('push', function(e) {
  if (!e.data) return;
  var data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'Coil Scanner', {
      body: data.body || '',
      icon: '/manifest.json',
      badge: '/manifest.json'
    })
  );
});
