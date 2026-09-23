const CACHE_NAME = 'mateuna-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './mateuno.js',
  './mateuno.css',
  './preguntas.csv',
  './ejercicios.csv',
  './estudio.html',
  './pracrica.html',
  './manifest.json',
  './assets/una_logo.png',
  'https://cdn.tailwindcss.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Guardando recursos offline...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignorar peticiones a Google Auth/Sheets API en el SW para no interferir con la red activa
  if (event.request.url.includes('script.google.com') || event.request.url.includes('accounts.google.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Si no hay red, simplemente no hace nada y devuelve la respuesta cacheada
      });

      return cachedResponse || fetchPromise;
    })
  );
});
