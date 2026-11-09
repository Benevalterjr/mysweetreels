const CACHE_NAME = 'sweetreels-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/logo.svg',
  '/logo-icon.svg',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/data/reels.json'
];

// Instalação: pré-armazena arquivos estáticos essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pré-armazenando recursos essenciais do PWA');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativação: remove caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removendo cache obsoleto:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptação de requisições: estratégia Network-First para APIs e dados frescos
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // APIs do servidor e fontes externas dinâmicas: sempre Network-First (sem interferir em cotações e extrações)
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  // Requisições normais da aplicação (Stale-While-Revalidate para velocidade máxima)
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});
