/**
 * LocalStorage管理モジュール
 */

const Storage = {
  KEYS: {
    CIRCLES: 'c107_circles',
    SETTINGS: 'c107_settings'
  },

  /**
   * IndexedDB - マップ画像保存用
   */
  MapData: {
    DB_NAME: 'c107_maps',
    DB_VERSION: 1,
    STORE_NAME: 'images',

    async open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
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
    }
  },

  /**
   * サークル一覧を取得
   */
  getCircles() {
    try {
      const data = localStorage.getItem(this.KEYS.CIRCLES);
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
      localStorage.setItem(this.KEYS.CIRCLES, JSON.stringify(circles));
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
    const index = circles.findIndex(c => c.id === id);
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
    const filtered = circles.filter(c => c.id !== id);
    this.saveCircles(filtered);
    return filtered;
  },

  /**
   * サークルのチェック状態を切り替え
   */
  toggleCheck(id) {
    const circles = this.getCircles();
    const circle = circles.find(c => c.id === id);
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
      circles = circles.filter(c => c.day === options.day);
    }

    // 検索フィルター
    if (options.search) {
      const term = options.search.toLowerCase();
      circles = circles.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.space.toLowerCase().includes(term) ||
        (c.genre && c.genre.toLowerCase().includes(term))
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
      circles: this.getCircles()
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
        const existingIds = new Set(existing.map(c => c.id));
        const newCircles = data.circles.filter(c => !existingIds.has(c.id));
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
      const data = localStorage.getItem(this.KEYS.SETTINGS);
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
      localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(merged));
      return true;
    } catch (e) {
      console.error('Failed to save settings:', e);
      return false;
    }
  },

  /**
   * 全データを削除
   */
  clearAll() {
    localStorage.removeItem(this.KEYS.CIRCLES);
    localStorage.removeItem(this.KEYS.SETTINGS);
  }
};
