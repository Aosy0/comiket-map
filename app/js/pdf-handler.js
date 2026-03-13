/**
 * PDF Handler - PDFを画像に変換するモジュール
 * PDF.js (CDN) を使用
 */

const PDFHandler = {
  pdfjsLib: null,
  currentPDF: null,
  currentPageNum: 1,

  /**
   * 初期化 - PDF.jsライブラリを設定
   */
  async init() {
    // PDF.js のグローバル変数をチェック
    if (typeof pdfjsLib !== 'undefined') {
      this.pdfjsLib = pdfjsLib;
      // PDF.js 3.x 用のワーカー設定
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      console.log('[PDFHandler] Initialized with PDF.js 3.x');
      return true;
    }

    console.error('[PDFHandler] pdfjsLib not found - PDF.js library not loaded');
    return false;
  },

  /**
   * ファイルがPDFかどうかを判定
   */
  isPDF(file) {
    return file && (
      file.type === 'application/pdf' ||
      file.name?.toLowerCase().endsWith('.pdf')
    );
  },

  /**
   * PDFファイルを読み込む
   * @param {File} file - PDFファイル
   * @returns {Promise<{numPages: number, pdf: object}>}
   */
  async loadPDF(file) {
    if (!this.pdfjsLib) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const typedArray = new Uint8Array(e.target.result);
          const pdf = await this.pdfjsLib.getDocument({ data: typedArray }).promise;
          this.currentPDF = pdf;
          resolve({
            numPages: pdf.numPages,
            pdf: pdf
          });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * PDFの指定ページを画像（Blob）に変換
   * @param {number} pageNum - ページ番号（1始まり）
   * @param {number} scale - スケール（デフォルト: 2.0 で高解像度）
   * @returns {Promise<Blob>}
   */
  async renderPageToBlob(pageNum = 1, scale = 2.0) {
    if (!this.currentPDF) {
      throw new Error('PDF not loaded');
    }

    const page = await this.currentPDF.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Canvas作成
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // レンダリング
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    // CanvasをBlobに変換
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      }, 'image/png', 1.0);
    });
  },

  /**
   * PDFの指定ページをプレビュー用Data URLとして取得
   * @param {number} pageNum - ページ番号（1始まり）
   * @param {number} scale - スケール（プレビュー用は小さめ）
   * @returns {Promise<string>}
   */
  async renderPageToDataURL(pageNum = 1, scale = 1.0) {
    if (!this.currentPDF) {
      throw new Error('PDF not loaded');
    }

    const page = await this.currentPDF.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    return canvas.toDataURL('image/png');
  },

  /**
   * 現在のPDFをクリア
   */
  clear() {
    if (this.currentPDF) {
      this.currentPDF.destroy();
      this.currentPDF = null;
    }
    this.currentPageNum = 1;
  }
};

// グローバルに公開
window.PDFHandler = PDFHandler;
