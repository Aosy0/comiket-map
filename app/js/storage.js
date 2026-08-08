/**
 * LocalStorage管理モジュール
 */

const Storage = {
	KEYS: {
		// グローバル設定キー
		EVENTS: 'app_events',
		CURRENT_EVENT: 'app_current_event',
		MIGRATED: 'app_migrated_v2',
		// 旧バージョン（C108固定）のキー - マイグレーション用
		LEGACY_CIRCLES: 'C108_circles',
		LEGACY_SETTINGS: 'C108_settings',
		LEGACY_FRIENDS: 'C108_friends',
	},

	// デフォルトの開催回一覧
	DEFAULT_EVENTS: ['107', '108'],
	// 旧データの移行先開催回
	LEGACY_EVENT_ID: '107',
	// 旧IndexedDB名
	LEGACY_MAPS_DB: 'C108_maps',

	/**
	 * 開催回一覧を取得（未設定ならデフォルト）
	 */
	getEvents() {
		try {
			const data = localStorage.getItem(this.KEYS.EVENTS);
			if (data) {
				const events = JSON.parse(data);
				if (Array.isArray(events) && events.length > 0) {
					return events;
				}
			}
		} catch (e) {
			console.error('Failed to get events:', e);
		}
		return [...this.DEFAULT_EVENTS];
	},

	/**
	 * 開催回一覧を保存
	 */
	saveEvents(events) {
		try {
			localStorage.setItem(this.KEYS.EVENTS, JSON.stringify(events));
			return true;
		} catch (e) {
			console.error('Failed to save events:', e);
			return false;
		}
	},

	/**
	 * 現在選択中の開催回を取得（未設定なら最新の開催回）
	 */
	getCurrentEvent() {
		const stored = localStorage.getItem(this.KEYS.CURRENT_EVENT);
		if (stored) return stored;
		const events = this.getEvents();
		return events[events.length - 1];
	},

	/**
	 * 現在選択中の開催回を設定
	 */
	setCurrentEvent(eventId) {
		localStorage.setItem(this.KEYS.CURRENT_EVENT, eventId);
	},

	/**
	 * 開催回の表示ラベル（例: "107" -> "C107"）
	 */
	getEventLabel(eventId) {
		return `C${eventId}`;
	},

	/**
	 * 現在イベント用のサークル保存キー
	 */
	getCirclesKey() {
		return `circles_${this.getCurrentEvent()}`;
	},

	/**
	 * 現在イベント用の設定保存キー
	 */
	getSettingsKey() {
		return `settings_${this.getCurrentEvent()}`;
	},

	/**
	 * 現在イベント用の友達保存キー
	 */
	getFriendsKey() {
		return `friends_${this.getCurrentEvent()}`;
	},

	/**
	 * 旧データ（C108固定キー）をC107のキーへ移行（初回起動時のみ）
	 * @returns {boolean} 旧データが存在し移行を実行した場合は true
	 */
	migrateLegacyData() {
		if (localStorage.getItem(this.KEYS.MIGRATED)) return false;

		let migrated = false;
		const legacyPairs = [
			[this.KEYS.LEGACY_CIRCLES, `circles_${this.LEGACY_EVENT_ID}`],
			[this.KEYS.LEGACY_SETTINGS, `settings_${this.LEGACY_EVENT_ID}`],
			[this.KEYS.LEGACY_FRIENDS, `friends_${this.LEGACY_EVENT_ID}`],
		];
		for (const [legacyKey, newKey] of legacyPairs) {
			const legacyData = localStorage.getItem(legacyKey);
			if (legacyData === null) continue;
			// 移行先にデータが無い場合のみコピー
			if (localStorage.getItem(newKey) === null) {
				localStorage.setItem(newKey, legacyData);
			}
			localStorage.removeItem(legacyKey);
			migrated = true;
		}

		localStorage.setItem(this.KEYS.MIGRATED, 'true');
		return migrated;
	},

	/**
	 * 旧IndexedDB（C108_maps）をC107用DB（maps_107）へコピーして削除
	 * 非同期で実行する（fire-and-forget）
	 */
	async migrateLegacyMapsAsync() {
		try {
			if (!('indexedDB' in window)) return;

			// 旧DBの存在確認
			let dbNames = [];
			try {
				const dbs = await indexedDB.databases();
				dbNames = dbs.map((d) => d.name);
			} catch (e) {
				return;
			}
			if (!dbNames.includes(this.LEGACY_MAPS_DB)) return;

			const targetName = `maps_${this.LEGACY_EVENT_ID}`;
			const srcDb = await this.MapData.openDB(this.LEGACY_MAPS_DB);
			const dstDb = await this.MapData.openDB(targetName);
			try {
				// 全エントリをコピー
				const keys = await this.MapData.getAllKeys(srcDb);
				for (const key of keys) {
					const value = await this.MapData.getByKey(srcDb, key);
					await this.MapData.putByKey(dstDb, key, value);
				}
			} finally {
				srcDb.close();
				dstDb.close();
			}

			// 旧DBを削除
			await new Promise((resolve, reject) => {
				const req = indexedDB.deleteDatabase(this.LEGACY_MAPS_DB);
				req.onsuccess = () => resolve();
				req.onerror = () => reject(req.error);
				req.onblocked = () => resolve();
			});
			console.log('IndexedDBの旧データをC107へ移行しました');
		} catch (e) {
			console.error('Failed to migrate legacy maps:', e);
		}
	},

	/**
	 * IndexedDB - マップ画像保存用
	 */
	MapData: {
		DB_VERSION: 1,
		STORE_NAME: 'images',

		/**
		 * 現在イベント用のDB名
		 */
		getDBName() {
			return `maps_${Storage.getCurrentEvent()}`;
		},

		/**
		 * 指定DB名で開く（マイグレーション用にも使用）
		 */
		async openDB(dbName) {
			return new Promise((resolve, reject) => {
				const req = indexedDB.open(dbName, this.DB_VERSION);
				req.onupgradeneeded = (e) => {
					const db = e.target.result;
					if (!db.objectStoreNames.contains(this.STORE_NAME)) {
						db.createObjectStore(this.STORE_NAME);
					}
				};
				req.onsuccess = (e) => resolve(e.target.result);
				req.onerror = (e) => reject(e);
			});
		},

		async open() {
			return this.openDB(this.getDBName());
		},

		/**
		 * 指定DBの全キーを取得（マイグレーション用）
		 */
		getAllKeys(db) {
			return new Promise((resolve, reject) => {
				const tx = db.transaction(this.STORE_NAME, 'readonly');
				const req = tx.objectStore(this.STORE_NAME).getAllKeys();
				req.onsuccess = () => resolve(req.result);
				req.onerror = (e) => reject(e);
			});
		},

		/**
		 * 指定DBからキーで取得（マイグレーション用）
		 */
		getByKey(db, key) {
			return new Promise((resolve, reject) => {
				const tx = db.transaction(this.STORE_NAME, 'readonly');
				const req = tx.objectStore(this.STORE_NAME).get(key);
				req.onsuccess = () => resolve(req.result);
				req.onerror = (e) => reject(e);
			});
		},

		/**
		 * 指定DBへキーで保存（マイグレーション用）
		 */
		putByKey(db, key, value) {
			return new Promise((resolve, reject) => {
				const tx = db.transaction(this.STORE_NAME, 'readwrite');
				const req = tx.objectStore(this.STORE_NAME).put(value, key);
				req.onsuccess = () => resolve();
				req.onerror = (e) => reject(e);
			});
		},

		async saveImage(key, file) {
			const db = await this.open();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(this.STORE_NAME, 'readwrite');
				const store = tx.objectStore(this.STORE_NAME);
				const req = store.put(file, key);
				req.onsuccess = () => resolve(true);
				req.onerror = (e) => reject(e);
			});
		},

		async getImage(key) {
			const db = await this.open();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(this.STORE_NAME, 'readonly');
				const store = tx.objectStore(this.STORE_NAME);
				const req = store.get(key);
				req.onsuccess = () => resolve(req.result);
				req.onerror = (e) => reject(e);
			});
		},

		async deleteImage(key) {
			const db = await this.open();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(this.STORE_NAME, 'readwrite');
				const store = tx.objectStore(this.STORE_NAME);
				const req = store.delete(key);
				req.onsuccess = () => resolve(true);
				req.onerror = (e) => reject(e);
			});
		},

		/**
		 * ページ番号付きで画像を保存
		 * @param {string} areaKey - エリアキー (e456, e78, w, s)
		 * @param {number} pageNum - ページ番号 (1始まり)
		 * @param {Blob} file - 画像データ
		 */
		async saveImageWithPage(areaKey, pageNum, file) {
			const key = `${areaKey}_page${pageNum}`;
			return this.saveImage(key, file);
		},

		/**
		 * ページ番号付きで画像を取得
		 * @param {string} areaKey - エリアキー
		 * @param {number} pageNum - ページ番号 (1始まり)
		 */
		async getImageWithPage(areaKey, pageNum) {
			const key = `${areaKey}_page${pageNum}`;
			return this.getImage(key);
		},

		/**
		 * エリアのページ数メタデータを保存
		 * @param {string} areaKey - エリアキー
		 * @param {number} totalPages - 総ページ数
		 */
		async savePageCount(areaKey, totalPages) {
			const key = `${areaKey}_pagecount`;
			const db = await this.open();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(this.STORE_NAME, 'readwrite');
				const store = tx.objectStore(this.STORE_NAME);
				const req = store.put(totalPages, key);
				req.onsuccess = () => resolve(true);
				req.onerror = (e) => reject(e);
			});
		},

		/**
		 * エリアのページ数を取得
		 * @param {string} areaKey - エリアキー
		 * @returns {Promise<number>} 総ページ数 (ページ分割なしなら0)
		 */
		async getPageCount(areaKey) {
			const key = `${areaKey}_pagecount`;
			const db = await this.open();
			return new Promise((resolve, reject) => {
				const tx = db.transaction(this.STORE_NAME, 'readonly');
				const store = tx.objectStore(this.STORE_NAME);
				const req = store.get(key);
				req.onsuccess = () => resolve(req.result || 0);
				req.onerror = (e) => reject(e);
			});
		},

		/**
		 * エリアのすべてのページを削除
		 * @param {string} areaKey - エリアキー
		 */
		async deleteAllPages(areaKey) {
			const db = await this.open();
			const pageCount = await this.getPageCount(areaKey);

			// 既存の単一画像を削除
			await this.deleteImage(areaKey).catch(() => {});

			// ページ分割された画像をすべて削除
			if (pageCount > 0) {
				for (let i = 1; i <= pageCount; i++) {
					await this.deleteImage(`${areaKey}_page${i}`).catch(() => {});
				}
				// ページ数メタデータを削除
				await this.deleteImage(`${areaKey}_pagecount`).catch(() => {});
			}

			return true;
		},
	},

	/**
	 * サークル一覧を取得
	 */
	getCircles() {
		try {
			const data = localStorage.getItem(this.getCirclesKey());
			return data ? JSON.parse(data) : [];
		} catch (e) {
			console.error('Failed to get circles:', e);
			return [];
		}
	},

	/**
	 * サークル一覧を保存
	 */
	saveCircles(circles) {
		try {
			localStorage.setItem(this.getCirclesKey(), JSON.stringify(circles));
			return true;
		} catch (e) {
			console.error('Failed to save circles:', e);
			return false;
		}
	},

	/**
	 * サークルを追加
	 */
	addCircle(circle) {
		const circles = this.getCircles();
		circle.id = Date.now().toString();
		circle.checked = false;
		circle.createdAt = new Date().toISOString();
		circles.push(circle);
		this.saveCircles(circles);
		return circle;
	},

	/**
	 * サークルを更新
	 */
	updateCircle(id, updates) {
		const circles = this.getCircles();
		const index = circles.findIndex((c) => c.id === id);
		if (index !== -1) {
			circles[index] = { ...circles[index], ...updates };
			this.saveCircles(circles);
			return circles[index];
		}
		return null;
	},

	/**
	 * サークルを削除
	 */
	deleteCircle(id) {
		const circles = this.getCircles();
		const filtered = circles.filter((c) => c.id !== id);
		this.saveCircles(filtered);
		return filtered;
	},

	/**
	 * サークルのチェック状態を切り替え
	 */
	toggleCheck(id) {
		const circles = this.getCircles();
		const circle = circles.find((c) => c.id === id);
		if (circle) {
			circle.checked = !circle.checked;
			this.saveCircles(circles);
			return circle;
		}
		return null;
	},

	/**
	 * サークルを検索・フィルタリング
	 */
	filterCircles(options = {}) {
		let circles = this.getCircles();

		// 日付フィルター
		if (options.day && options.day !== 'all') {
			circles = circles.filter((c) => c.day === options.day);
		}

		// 検索フィルター
		if (options.search) {
			const term = options.search.toLowerCase();
			circles = circles.filter(
				(c) =>
					c.name.toLowerCase().includes(term) ||
					c.space.toLowerCase().includes(term) ||
					c.genre?.toLowerCase().includes(term),
			);
		}

		// ソート（優先度順、スペース順）
		// skipSort が true の場合はソートしない（手動並び替え時）
		if (!options.skipSort) {
			circles.sort((a, b) => {
				const priorityOrder = { high: 0, medium: 1, low: 2 };
				const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
				if (pDiff !== 0) return pDiff;
				return a.space.localeCompare(b.space);
			});
		}

		return circles;
	},

	/**
	 * 全データをエクスポート
	 */
	exportData() {
		const data = {
			version: '1.0',
			exportedAt: new Date().toISOString(),
			circles: this.getCircles(),
		};
		return JSON.stringify(data, null, 2);
	},

	/**
	 * データをインポート
	 */
	importData(jsonString) {
		try {
			const data = JSON.parse(jsonString);
			if (data.circles && Array.isArray(data.circles)) {
				// 既存データとマージ
				const existing = this.getCircles();
				const existingIds = new Set(existing.map((c) => c.id));
				const newCircles = data.circles.filter((c) => !existingIds.has(c.id));
				const merged = [...existing, ...newCircles];
				this.saveCircles(merged);
				return { success: true, imported: newCircles.length };
			}
			return { success: false, error: 'Invalid data format' };
		} catch (e) {
			return { success: false, error: e.message };
		}
	},

	/**
	 * 設定を取得
	 */
	getSettings() {
		try {
			const data = localStorage.getItem(this.getSettingsKey());
			return data ? JSON.parse(data) : {};
		} catch (e) {
			console.error('Failed to get settings:', e);
			return {};
		}
	},

	/**
	 * 設定を保存
	 */
	saveSettings(settings) {
		try {
			const current = this.getSettings();
			const merged = { ...current, ...settings };
			localStorage.setItem(this.getSettingsKey(), JSON.stringify(merged));
			return true;
		} catch (e) {
			console.error('Failed to save settings:', e);
			return false;
		}
	},

	/**
	 * 全データを削除（現在イベントのサークル・設定・友達）
	 */
	clearAll() {
		localStorage.removeItem(this.getCirclesKey());
		localStorage.removeItem(this.getSettingsKey());
		localStorage.removeItem(this.getFriendsKey());
	},
};
