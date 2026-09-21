// Service worker: solo cachea el "shell" de la app para abrirla sin conexion.
// NO toca las llamadas a la API ni a Supabase (antes, sin red, una llamada a la API podia devolver el HTML de la app).
const CACHE = 'coil-v2';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(['/']); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // Supabase, CDNs, etc.: directo a la red
  const isPage = req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/manifest.json';
  if (!isPage) return;                                        // /records, /save, /auth, ... : directo a la red
  e.respondWith(
    fetch(req).then(function (resp) {
      const copy = resp.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return resp;
    }).catch(function () {
      return caches.match(req).then(function (r) { return r || caches.match('/'); });
    })
  );
});
