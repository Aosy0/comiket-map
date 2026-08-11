/**
 * Service Worker - オフラインキャッシュ
 */

const CACHE_NAME = 'circlemap-v64';
const ASSETS_TO_CACHE = [
	'/',
	'/index.html',
	'/css/style.css?v=47',
	'/js/app.js?v=43',
	'/js/storage.js?v=24',
	'/js/map.js?v=24',
	'/js/sync.js?v=18',
	'/js/jsQR.js?v=3',
	'/js/friends.js?v=9',
	'/js/pdf-handler.js?v=3',
	'/system_instruction.txt',
	'/manifest.json',
	'/icons/icon-192.png',
	'/icons/icon-512.png',
	'/maps/map_overview.svg',
	'/maps/map_east123.svg',
	'/maps/map_east7.svg',
	'/maps/map_west12.svg',
	'/maps/map_south12.svg',
];

// インストール時にアセットをキャッシュ
self.addEventListener('install', (event) => {
	console.log('[SW] Install');
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => {
				console.log('[SW] Caching assets');
				return cache.addAll(ASSETS_TO_CACHE);
			})
			.then(() => self.skipWaiting()),
	);
});

// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
	console.log('[SW] Activate');
	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) => {
				return Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
			})
			.then(() => self.clients.claim()),
	);
});

// ネットワークファースト戦略
// - オンライン時: 常に最新を取得（キャッシュも裏で更新）
// - オフライン時: キャッシュから提供
// - /maps/*.svg はマップ差し替えが頻繁なため、常にネットワーク優先
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	const isMapFile = url.pathname.startsWith('/maps/');

	// マップファイル: キャッシュしない（常に最新）
	if (isMapFile) {
		event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
		return;
	}

	event.respondWith(
		fetch(event.request)
			.then((response) => {
				if (!response || response.status !== 200 || response.type !== 'basic') {
					return response;
				}
				const responseToCache = response.clone();
				caches.open(CACHE_NAME).then((cache) => {
					cache.put(event.request, responseToCache);
				});
				return response;
			})
			.catch(() => {
				return caches.match(event.request).then((cached) => {
					if (cached) return cached;
					return caches.match('/index.html');
				});
			}),
	);
});
