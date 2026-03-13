/**
 * データ同期モジュール
 * URLハッシュ、QRコード、共有コードの3方式に対応
 */

const Sync = {
  /**
   * データをBase64エンコード
   */
  encodeData() {
    const circles = Storage.getCircles();
    const data = {
      version: '1.1.1',
      exportedAt: new Date().toISOString(),
      circles: circles
    };
    return btoa(encodeURIComponent(JSON.stringify(data)));
  },

  /**
   * Base64データをデコード
   */
  decodeData(code) {
    try {
      const json = decodeURIComponent(atob(code));
      const data = JSON.parse(json);
      return data;
    } catch (e) {
      console.error('Failed to decode data:', e);
      return null;
    }
  },

  /**
   * 共有URLを生成
   */
  generateShareURL() {
    const code = this.encodeData();
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}#${code}`;
  },

  /**
   * URLハッシュからデータを読み込み
   */
  loadFromHash() {
    const hash = window.location.hash.slice(1); // # を除去
    if (!hash) return null;

    const data = this.decodeData(hash);
    if (data && data.circles) {
      return data.circles;
    }
    return null;
  },

  /**
   * QRコード（SVG）を生成
   * シンプルなQRコード生成（軽量版）
   */
  generateQRCode(text) {
    // QRコードライブラリを使わず、データURLとして表示
    // 実際のQRコード生成は外部サービスAPIを利用（軽量）
    const size = 256;
    const encoded = encodeURIComponent(text);
    // Google Chart APIの代替として、QR Server APIを使用（無料、軽量）
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
  },

  /**
   * データをインポート
   */
  importData(code) {
    const data = this.decodeData(code);
    if (!data || !data.circles) {
      return { success: false, error: '無効なコードです' };
    }

    // 既存データとマージするか確認
    const existing = Storage.getCircles();
    if (existing.length > 0) {
      if (!confirm(`現在${existing.length}件のサークルが登録されています。\n新しいデータと統合しますか？\n\n「OK」= 統合する\n「キャンセル」= 上書きする`)) {
        // 上書き
        Storage.saveCircles(data.circles);
        return { success: true, imported: data.circles.length, mode: '上書き' };
      }
    }

    // マージ
    const existingIds = new Set(existing.map(c => c.id));
    const newCircles = data.circles.filter(c => !existingIds.has(c.id));
    const merged = [...existing, ...newCircles];
    Storage.saveCircles(merged);

    return { 
      success: true, 
      imported: newCircles.length,
      total: merged.length,
      mode: '統合'
    };
  },

  /**
   * 共有コードをクリップボードにコピー
   */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // フォールバック
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    }
  },

  /**
   * データサイズを取得（表示用）
   */
  getDataSize() {
    const circles = Storage.getCircles();
    const jsonSize = JSON.stringify(circles).length;
    const encodedSize = this.encodeData().length;
    
    return {
      circles: circles.length,
      jsonBytes: jsonSize,
      encodedBytes: encodedSize,
      humanReadable: this.formatBytes(encodedSize)
    };
  },

  /**
   * バイト数を人間が読みやすい形式に変換
   */
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
};
