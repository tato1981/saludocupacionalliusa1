// Service Worker - Sistema de Salud Ocupacional
// Manejo mínimo de caché: solo assets estáticos, nunca HTML/API (SSR)
const CACHE_NAME = 'salud-ocu-v1';
const STATIC_CACHE = [
  '/icono-rapido.png',
  '/icon.png',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_CACHE.map(url => new Request(url, { cache: 'reload' }))))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Solo cachear imágenes y assets estáticos, nunca páginas HTML ni API
  if (/\.(png|jpg|jpeg|webp|svg|ico|gif|woff2|woff)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          return cached || new Response('', { status: 503 });
        }
      })
    );
  }
  // Resto (HTML, API, JS, CSS): red directamente — datos siempre frescos
});
