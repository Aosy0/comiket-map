/**
 * Service Worker - オフラインキャッシュ
 */

const CACHE_NAME = 'c107map-v34';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css?v=34',
  '/js/app.js?v=30',
  '/js/storage.js?v=22',
  '/js/map.js?v=21',
  '/js/sync.js?v=18',
  '/js/pdf-handler.js?v=3',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/maps/map_east456.svg',
  '/maps/map_east78.svg',
  '/maps/map_west.svg',
  '/maps/map_south.svg'
];

// インストール時にアセットをキャッシュ
self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// キャッシュファースト戦略
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then(response => {
            // 有効なレスポンスのみキャッシュ
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return response;
          });
      })
      .catch(() => {
        // オフライン時のフォールバック
        return caches.match('/index.html');
      })
  );
});
