// sw.js - MateUNA (funciona sin conexión)
// Estrategias:
//  - Archivos propios (html/js/css/csv/imágenes): carga desde caché al instante y se actualiza en segundo plano.
//  - Librerías de CDN (Tailwind, MathJax, Lucide, PapaParse, math.js): se guardan en caché la primera vez que se usan.
//  - Datos de Google Apps Script (GET): primero red, y si no hay conexión se usa la última respuesta guardada.
//  - Los POST (guardar respuestas) NO pasan por aquí: mateuna.js los encola en localStorage y los reenvía al volver la red.

const VERSION = 'v3';                        // sube este número cada vez que quieras forzar una actualización
const STATIC_CACHE = `mateuna-static-${VERSION}`;
const DATA_CACHE = 'mateuna-data';           // respuestas JSON de Apps Script (persiste entre versiones)

// Si algún archivo de esta lista no existe, simplemente se omite (ya no rompe la instalación).
const LOCAL_ASSETS = [
  './',
  './index.html',
  './estudio.html',
  './practica.html',
  './factorizacion.html',
  './limites.html',
  './mateuna.js',
  './materias.js',
  './entrenar.js',
  './mateuna.css',
  './manifest.json',
  // preguntas y ejercicios (nombres tal como están en materias.js)
  './preguntas/p_mate1_175.csv',
  './preguntas/p_mate2_178.csv',
  './preguntas/p_calc_int_756.csv',
  './preguntas/p_topologia_768.csv',
  './preguntas/p_mod_matem_773.csv',
  './ejercicios/p_mate1_175.csv',
  './ejercicios/p_mate2_178.csv',
  './ejercicios/p_calc_int_756.csv',
  './ejercicios/p_topologia_768.csv',
  './ejercicios/p_mod_matem_773.csv',
  './ejercicios.csv',
  // imágenes
  './assets/una_logo.png',
  './assets/mateDOS.png',
  './assets/topologo.jpg',
  './assets/topologo.png',
  './assets/materias/175.svg',
  './assets/materias/756.svg',
  './assets/materias/773.svg'
];

// URLs exactas que usan tus HTML
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js',
  'https://unpkg.com/lucide@0.263.1',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.8.0/math.js'
];

const CDN_HOSTS = [
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];
const API_HOST = 'script.google.com';

// ---------- INSTALACIÓN ----------
async function guardar(cache, request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) await cache.put(request.url, res);
  } catch (e) {
    console.warn('[SW] No se pudo precargar:', request.url);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.all([
      ...LOCAL_ASSETS.map((u) => guardar(cache, new Request(u, { cache: 'reload' }))),
      // las librerías se piden con CORS para poder guardarlas (con no-cors quedan "opacas" y no se guardan bien)
      ...CDN_ASSETS.map((u) => guardar(cache, new Request(u, { mode: 'cors', credentials: 'omit' })))
    ]);
    await self.skipWaiting();
  })());
});

// ---------- ACTIVACIÓN ----------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('mateuna-') && k !== STATIC_CACHE && k !== DATA_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ---------- FETCH ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;           // los POST los maneja la app

  const url = new URL(req.url);

  if (url.host === API_HOST) return event.respondWith(datosApi(event));
  if (CDN_HOSTS.includes(url.host)) return event.respondWith(libreriaCdn(event));
  if (url.origin === self.location.origin) return event.respondWith(archivoLocal(event));
  // cualquier otro dominio (Google login, Crisp, YouTube...) lo maneja el navegador
});

// Archivos propios: caché primero + actualización en segundo plano
async function archivoLocal(event) {
  const req = event.request;
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });

  const red = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  if (hit) {
    event.waitUntil(red);
    return hit;
  }
  const res = await red;
  if (res) return res;

  if (req.mode === 'navigate') {
    const inicio = await cache.match('./index.html');
    if (inicio) return inicio;
  }
  return new Response('Sin conexión y este archivo no está guardado todavía.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

// Librerías de CDN: caché primero; si no está, se descarga con CORS y se guarda
async function libreriaCdn(event) {
  const req = event.request;
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req.url, { ignoreVary: true });

  const red = fetch(new Request(req.url, { mode: 'cors', credentials: 'omit' }))
    .then((res) => {
      if (res && res.ok) cache.put(req.url, res.clone());
      return res;
    })
    .catch(() => null);

  if (hit) {
    event.waitUntil(red);
    return hit;
  }
  const res = await red;
  if (res) return res;
  try { return await fetch(req); } catch (e) { return Response.error(); }
}

const espera = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

// Datos de Apps Script (preguntas, plan de curso, materiales, notas...): red primero, caché de respaldo
async function datosApi(event) {
  const req = event.request;
  const cache = await caches.open(DATA_CACHE);
  const hit = await cache.match(req.url);

  try {
    const red = fetch(req);
    // si ya hay copia guardada, no esperamos más de 6 s a una red lenta
    const res = hit ? await Promise.race([red, espera(6000)]) : await red;

    const tipo = res.headers.get('content-type') || '';
    if (res.ok && tipo.includes('json')) {
      const copia = res.clone();
      // no guardamos respuestas de error ({error: "..."}) para no pisar datos buenos
      event.waitUntil(
        copia.clone().json()
          .then((j) => {
            const esError = j && !Array.isArray(j) && typeof j === 'object' && j.error;
            if (!esError) return cache.put(req.url, copia);
          })
          .catch(() => {})
      );
    }
    return res;
  } catch (err) {
    if (hit) return hit;
    throw err;
  }
}
