/**
 * Service Worker - オフラインキャッシュ
 */

const CACHE_NAME = 'circlemap-v66';
const ASSETS_TO_CACHE = [
	'/',
	'/index.html',
	'/css/style.css?v=48',
	'/js/app.js?v=43',
	'/js/storage.js?v=25',
	'/js/map.js?v=25',
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

// Stale-While-Revalidate + タイムアウト戦略
// - キャッシュがあれば即座に返す（弱い電波でも遅延なし）
// - 裏でネットワークから最新を取得し、成功時のみキャッシュを更新
// - fetch はタイムアウト付き（3秒）。弱い電波で長時間待たない
// - タイムアウト・失敗時はキャッシュのまま表示を継続
const FETCH_TIMEOUT_MS = 3000;

// タイムアウト付きfetch
function fetchWithTimeout(request) {
	return new Promise((resolve, reject) => {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		fetch(request, { signal: controller.signal })
			.then((response) => {
				clearTimeout(timer);
				resolve(response);
			})
			.catch((err) => {
				clearTimeout(timer);
				reject(err);
			});
	});
}

self.addEventListener('fetch', (event) => {
	// キャッシュ対象外のリクエスト（GET以外）は素通し
	if (event.request.method !== 'GET') {
		return;
	}

	event.respondWith(
		caches.match(event.request).then((cachedResponse) => {
			// 裏で最新を取得してキャッシュを更新（失敗しても表示には影響しない）
			const revalidate = fetchWithTimeout(event.request)
				.then((response) => {
					if (response && response.status === 200 && response.type === 'basic') {
						const responseToCache = response.clone();
						caches.open(CACHE_NAME).then((cache) => {
							cache.put(event.request, responseToCache);
						});
					}
					return response;
				})
				.catch(() => null);

			// キャッシュがあれば即座に返し、無ければネットワーク結果を待つ
			if (cachedResponse) {
				// 更新を待たずにキャッシュを返す（弱電波でも即表示）
				event.waitUntil(revalidate);
				return cachedResponse;
			}
			// キャッシュが無い場合: ネットワークから取得（タイムアウト付き）
			return revalidate.then((response) => {
				if (response) return response;
				// ネットワーク失敗時: ナビゲーションなら index.html へフォールバック
				if (event.request.mode === 'navigate') {
					return caches.match('/index.html');
				}
				return new Response('', { status: 504, statusText: 'Offline' });
			});
		}),
	);
});
