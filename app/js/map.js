/**
 * マップ表示・操作モジュール
 */

const MapViewer = {
  container: null,
  image: null,
  scale: 1,
  minScale: 0.5,
  maxScale: 4,
  translateX: 0,
  translateY: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  lastTouchDistance: 0,
  lastPinchCenterX: 0,
  lastPinchCenterY: 0,

  // マップ画像パス
  maps: {
    e456: '/maps/map_east456.svg',
    e78: '/maps/map_east78.svg',
    w: '/maps/map_west.svg',
    s: '/maps/map_south.svg'
  },

  // 現在表示中のマップキー
  currentMapKey: 'e456',

  // ページ関連プロパティ
  currentPage: 1,
  totalPages: 0,

  /**
   * 初期化
   */
  init() {
    this.container = document.getElementById('mapContainer');
    this.image = document.getElementById('mapImage');

    if (!this.container || !this.image) return;

    this.bindEvents();
    this.initModalEvents();
    this.loadMap('e456');
  },

  /**
   * イベントバインド
   */
  bindEvents() {
    // マウスイベント
    this.container.addEventListener('mousedown', (e) => this.onDragStart(e));
    this.container.addEventListener('mousemove', (e) => this.onDragMove(e));
    this.container.addEventListener('mouseup', () => this.onDragEnd());
    this.container.addEventListener('mouseleave', () => this.onDragEnd());
    this.container.addEventListener('wheel', (e) => this.onWheel(e));

    // タッチイベント
    this.container.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    this.container.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    this.container.addEventListener('touchend', () => this.onDragEnd());

    // マップ選択
    const mapSelect = document.getElementById('mapSelect');
    if (mapSelect) {
      mapSelect.addEventListener('change', (e) => this.loadMap(e.target.value));
    }

    // ページセレクター
    const pageSelect = document.getElementById('mapPageSelect');
    if (pageSelect) {
      pageSelect.addEventListener('change', (e) => this.switchPage(parseInt(e.target.value)));
    }

    // リセットボタン
    const resetBtn = document.getElementById('mapReset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.fitToContainer());
    }

    // 削除ボタン
    const deleteBtn = document.getElementById('mapDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.deleteCurrentMap());
    }

    // 設定ボタン
    const customBtn = document.getElementById('mapCustomBtn');
    if (customBtn) {
      customBtn.addEventListener('click', () => this.openModal());
    }
  },

  /**
   * モーダル関連イベント
   */
  initModalEvents() {
    const modal = document.getElementById('mapModal');
    const closeBtn = document.getElementById('mapModalCloseBtn');
    const fileInput = document.getElementById('mapFileInput');
    const saveBtn = document.getElementById('saveMapImageBtn');
    const resetBtn = document.getElementById('resetMapImageBtn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveCustomMap());
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetToDefault());
    }

    // 現在のエリアに全ページ保存ボタン
    const saveToCurrentAreaBtn = document.getElementById('saveToCurrentAreaBtn');
    if (saveToCurrentAreaBtn) {
      saveToCurrentAreaBtn.addEventListener('click', () => this.saveToCurrentArea());
    }

    // ドラッグ＆ドロップとクリップボード対応
    this.initDragAndDrop();
    this.initPasteHandler();
  },

  /**
   * モーダルを開く
   */
  openModal() {
    const modal = document.getElementById('mapModal');
    const areaNameEl = document.getElementById('currentAreaName');
    const mapSelect = document.getElementById('mapSelect');

    if (areaNameEl && mapSelect) {
      const option = mapSelect.options[mapSelect.selectedIndex];
      areaNameEl.textContent = option ? option.text : this.currentMapKey;
    }

    // 入力リセット
    const fileInput = document.getElementById('mapFileInput');
    if (fileInput) fileInput.value = '';

    document.getElementById('fileNameDisplay').textContent = '未選択';
    document.getElementById('previewArea').classList.add('hidden');
    document.getElementById('saveMapImageBtn').disabled = true;
    document.getElementById('saveMapImageBtn').style.display = '';

    // PDF一括インポートUIを隠す
    const pdfBulkImport = document.getElementById('pdfBulkImport');
    if (pdfBulkImport) pdfBulkImport.classList.add('hidden');

    // PDFHandlerをクリア
    if (window.PDFHandler) {
      window.PDFHandler.clear();
    }
    this.selectedPDFBlob = null;
    this.pdfPageBlobs = [];

    modal.classList.remove('hidden');
  },

  // 選択されたファイルを一時保持
  selectedFile: null,
  // PDF変換後のBlobを保持
  selectedPDFBlob: null,
  // PDF全ページのBlobを保持
  pdfPageBlobs: [],

  // 公式PDF用のエリアマッピング（ページ番号 -> エリアキー）
  officialPDFMapping: {
    1: { key: 'e456', name: '東4-6ホール' },
    2: { key: 'e78', name: '東7-8ホール' },
    3: { key: 's', name: '南1-4ホール' },
    4: { key: 'w', name: '西1-4ホール' }
  },

  /**
   * ファイル選択ハンドラ
   */
  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) this.setPreviewFile(file);
  },

  /**
   * ファイルをプレビューにセット（画像・PDF対応）
   */
  async setPreviewFile(file) {
    if (!file) return;

    const isPDF = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    if (!isPDF && !isImage) {
      this.showToast('画像またはPDFファイルを選択してください');
      return;
    }

    document.getElementById('fileNameDisplay').textContent = file.name || 'ファイル';

    if (isPDF) {
      await this.handlePDFFile(file);
    } else {
      await this.handleImageFile(file);
    }
  },

  /**
   * 画像ファイルを処理
   */
  async handleImageFile(file) {
    this.selectedFile = file;
    this.selectedPDFBlob = null;
    this.pdfPageBlobs = [];
    document.getElementById('saveMapImageBtn').disabled = false;
    document.getElementById('saveMapImageBtn').style.display = '';

    // PDF一括インポートUIを隠す
    const pdfBulkImport = document.getElementById('pdfBulkImport');
    if (pdfBulkImport) pdfBulkImport.classList.add('hidden');

    // プレビュー表示
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.getElementById('uploadPreview');
      img.src = e.target.result;
      document.getElementById('previewArea').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  },

  /**
   * PDFファイルを処理
   */
  async handlePDFFile(file) {
    this.selectedFile = null;
    this.selectedPDFBlob = null;
    this.pdfPageBlobs = [];

    // PDFHandlerが利用可能か確認
    if (!window.PDFHandler) {
      this.showToast('PDF機能の読み込み中です。少々お待ちください...');
      // 少し待ってリトライ
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!window.PDFHandler) {
        this.showToast('PDF機能を利用できません');
        return;
      }
    }

    try {
      this.showToast('PDFを読み込み中...');

      // PDF.jsを初期化
      await window.PDFHandler.init();

      // PDFを読み込む
      const { numPages } = await window.PDFHandler.loadPDF(file);

      // 公式PDFかどうかを判定（4ページのPDFは公式PDFと推定）
      const isOfficialPDF = numPages === 4;

      // 全ページを画像に変換
      this.showToast(`全${numPages}ページを変換中...`);
      for (let i = 1; i <= numPages; i++) {
        const blob = await window.PDFHandler.renderPageToBlob(i, 2.5);
        const mapping = this.officialPDFMapping[i];
        this.pdfPageBlobs.push({
          pageNum: i,
          blob: blob,
          areaKey: isOfficialPDF && mapping ? mapping.key : null,
          areaName: isOfficialPDF && mapping ? mapping.name : `${i}ページ目`
        });
      }

      // 一括インポートUIを構築
      this.buildPDFBulkImportUI(isOfficialPDF);

      // 最初のページをプレビュー
      const firstPageURL = await window.PDFHandler.renderPageToDataURL(1, 1.0);
      const img = document.getElementById('uploadPreview');
      img.src = firstPageURL;
      document.getElementById('previewArea').classList.remove('hidden');

      this.showToast(`PDF読み込み完了（全${numPages}ページ）`);

    } catch (e) {
      console.error('[MapViewer] PDF load error:', e);
      this.showToast('PDFの読み込みに失敗しました');
    }
  },

  /**
   * PDF一括インポートUIを構築
   */
  buildPDFBulkImportUI(isOfficialPDF) {
    const container = document.getElementById('pdfBulkImport');
    const mappingsDiv = document.getElementById('pdfPageMappings');
    const applyBtn = document.getElementById('applyAllPagesBtn');

    if (!container || !mappingsDiv) return;

    // 利用可能なエリアオプション
    const areaOptions = [
      { key: 'e456', name: '東4-6ホール' },
      { key: 'e78', name: '東7-8ホール' },
      { key: 's', name: '南1-4ホール' },
      { key: 'w', name: '西1-4ホール' },
      { key: '', name: '（スキップ）' }
    ];

    // マッピングUIを構築
    mappingsDiv.innerHTML = '';
    this.pdfPageBlobs.forEach((page, index) => {
      const row = document.createElement('div');
      row.className = 'pdf-page-mapping';

      const pageLabel = document.createElement('span');
      pageLabel.className = 'page-num';
      pageLabel.textContent = `${page.pageNum}ページ目`;

      const select = document.createElement('select');
      select.id = `pdfAreaSelect_${index}`;
      select.dataset.index = index;

      areaOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.key;
        option.textContent = opt.name;
        if (page.areaKey === opt.key) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      // 選択変更時にpdfPageBlobsを更新
      select.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        this.pdfPageBlobs[idx].areaKey = e.target.value;
      });

      row.appendChild(pageLabel);
      row.appendChild(select);

      if (isOfficialPDF && page.areaKey) {
        const badge = document.createElement('span');
        badge.className = 'area-preview';
        badge.textContent = '✓ 自動検出';
        badge.style.color = '#4caf50';
        row.appendChild(badge);
      }

      mappingsDiv.appendChild(row);
    });

    // 適用ボタンのイベント
    if (applyBtn) {
      applyBtn.onclick = () => this.applyAllPDFPages();
    }

    // UIを表示
    container.classList.remove('hidden');

    // 現在のエリア名を表示
    const currentAreaNameInPdf = document.getElementById('currentAreaNameInPdf');
    const mapSelect = document.getElementById('mapSelect');
    if (currentAreaNameInPdf && mapSelect) {
      const option = mapSelect.options[mapSelect.selectedIndex];
      currentAreaNameInPdf.textContent = option ? option.text : this.currentMapKey;
    }

    // 単一ページ用の保存ボタンは非表示
    document.getElementById('saveMapImageBtn').style.display = 'none';
  },

  /**
   * 現在のエリアに全ページを保存
   */
  async saveToCurrentArea() {
    if (!this.pdfPageBlobs || this.pdfPageBlobs.length === 0) {
      this.showToast('PDFが読み込まれていません');
      return;
    }

    try {
      const areaKey = this.currentMapKey;
      const numPages = this.pdfPageBlobs.length;

      // 既存のページを削除
      await Storage.MapData.deleteAllPages(areaKey);

      // 全ページをページ番号付きで保存
      for (let i = 0; i < numPages; i++) {
        await Storage.MapData.saveImageWithPage(areaKey, i + 1, this.pdfPageBlobs[i].blob);
      }
      await Storage.MapData.savePageCount(areaKey, numPages);

      this.showToast(`${numPages}ページを保存しました`);
      document.getElementById('mapModal').classList.add('hidden');

      // リセット
      this.pdfPageBlobs = [];
      if (window.PDFHandler) {
        window.PDFHandler.clear();
      }
      document.getElementById('saveMapImageBtn').style.display = '';

      // マップをリロード
      this.loadMap(this.currentMapKey);
    } catch (e) {
      console.error('[MapViewer] Failed to save to current area:', e);
      this.showToast('保存に失敗しました');
    }
  },

  /**
   * 全PDFページを一括適用
   */
  async applyAllPDFPages() {
    if (!this.pdfPageBlobs || this.pdfPageBlobs.length === 0) {
      this.showToast('PDFが読み込まれていません');
      return;
    }

    try {
      let savedCount = 0;

      // エリア別に保存するページをグループ化
      const areaPages = {};
      for (const page of this.pdfPageBlobs) {
        if (page.areaKey && page.blob) {
          if (!areaPages[page.areaKey]) {
            areaPages[page.areaKey] = [];
          }
          areaPages[page.areaKey].push(page);
        }
      }

      // 各エリアごとにページを保存
      for (const [areaKey, pages] of Object.entries(areaPages)) {
        if (pages.length === 1) {
          // 単一ページの場合は従来通り
          await Storage.MapData.saveImage(areaKey, pages[0].blob);
          await Storage.MapData.savePageCount(areaKey, 0);
        } else {
          // 複数ページの場合はページ番号付きで保存
          for (let i = 0; i < pages.length; i++) {
            await Storage.MapData.saveImageWithPage(areaKey, i + 1, pages[i].blob);
          }
          await Storage.MapData.savePageCount(areaKey, pages.length);
        }
        savedCount += pages.length;
      }

      if (savedCount > 0) {
        this.showToast(`${savedCount}件のマップを保存しました`);
        document.getElementById('mapModal').classList.add('hidden');

        // リセット
        this.pdfPageBlobs = [];
        if (window.PDFHandler) {
          window.PDFHandler.clear();
        }

        // 保存ボタンを再表示
        document.getElementById('saveMapImageBtn').style.display = '';

        // 現在のマップをリロード
        this.loadMap(this.currentMapKey);
      } else {
        this.showToast('保存するページが選択されていません');
      }

    } catch (e) {
      console.error('[MapViewer] Failed to save PDF pages:', e);
      this.showToast('保存に失敗しました');
    }
  },

  /**
   * PDFの指定ページをレンダリング（単一ページ用・後方互換）
   */
  async renderPDFPage(pageNum) {
    try {
      // プレビュー用（小さめ）
      const dataURL = await window.PDFHandler.renderPageToDataURL(pageNum, 1.0);
      const img = document.getElementById('uploadPreview');
      img.src = dataURL;
      document.getElementById('previewArea').classList.remove('hidden');

      // 保存用（高解像度）のBlobを生成
      this.selectedPDFBlob = await window.PDFHandler.renderPageToBlob(pageNum, 2.5);
      this.selectedFile = null;

      document.getElementById('saveMapImageBtn').disabled = false;

    } catch (e) {
      console.error('[MapViewer] PDF render error:', e);
      this.showToast('ページのレンダリングに失敗しました');
    }
  },

  /**
   * ドラッグ＆ドロップ初期化
   */
  initDragAndDrop() {
    const dropZone = document.querySelector('.file-upload-section');
    if (!dropZone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('drag-over');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (file) this.setPreviewFile(file);
    });
  },

  /**
   * クリップボード貼り付け対応
   */
  initPasteHandler() {
    document.addEventListener('paste', (e) => {
      const modal = document.getElementById('mapModal');
      if (!modal || modal.classList.contains('hidden')) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            this.setPreviewFile(file);
            this.showToast('クリップボードから画像を取得しました');
          }
          break;
        }
      }
    });
  },

  /**
   * カスタムマップ保存
   */
  async saveCustomMap() {
    // PDFから変換したBlob または 画像ファイル
    const blobToSave = this.selectedPDFBlob || this.selectedFile;

    if (!blobToSave) {
      this.showToast('画像が選択されていません');
      return;
    }

    try {
      if (Storage.MapData) {
        await Storage.MapData.saveImage(this.currentMapKey, blobToSave);
        this.showToast('画像を保存しました');
        document.getElementById('mapModal').classList.add('hidden');

        // リセット
        this.selectedFile = null;
        this.selectedPDFBlob = null;
        if (window.PDFHandler) {
          window.PDFHandler.clear();
        }

        this.loadMap(this.currentMapKey); // リロード
      }
    } catch (e) {
      console.error('Failed to save image:', e);
      this.showToast('保存に失敗しました');
    }
  },

  /**
   * デフォルトに戻す
   */
  async resetToDefault() {
    if (!confirm('カスタム画像を削除してデフォルトに戻しますか？')) return;

    try {
      if (Storage.MapData) {
        // ページ分割含むすべての画像を削除
        await Storage.MapData.deleteAllPages(this.currentMapKey);
        this.showToast('デフォルトに戻しました');
        document.getElementById('mapModal').classList.add('hidden');
        this.loadMap(this.currentMapKey);
      }
    } catch (e) {
      console.error('Failed to delete image:', e);
    }
  },

  /**
   * マップ読み込み
   */
  async loadMap(mapKey, pageNum = 1) {
    this.currentMapKey = mapKey;
    const mapSelect = document.getElementById('mapSelect');
    if (mapSelect && mapSelect.value !== mapKey) {
      mapSelect.value = mapKey;
    }

    // ページ情報をリセット
    this.currentPage = pageNum;
    this.totalPages = 0;
    let hasCustomMap = false;

    // 1. IndexedDBからページ数を確認
    try {
      if (Storage.MapData) {
        const pageCount = await Storage.MapData.getPageCount(mapKey);
        this.totalPages = pageCount;

        // ページ分割された画像がある場合
        if (pageCount > 0) {
          // 指定ページの画像を取得
          const blob = await Storage.MapData.getImageWithPage(mapKey, pageNum);
          if (blob) {
            const url = URL.createObjectURL(blob);
            this.setImage(url);
            this.updatePageSelector();
            hasCustomMap = true;
            this.updateDeleteButton(hasCustomMap);
            return;
          }
        } else {
          // 単一画像の場合（旧形式との互換性）
          const blob = await Storage.MapData.getImage(mapKey);
          if (blob) {
            const url = URL.createObjectURL(blob);
            this.setImage(url);
            this.updatePageSelector();
            hasCustomMap = true;
            this.updateDeleteButton(hasCustomMap);
            return;
          }
        }
      }
    } catch (e) {
      console.error('Failed to load custom map:', e);
    }

    // 2. なければデフォルトSVG
    this.updatePageSelector();
    this.updateDeleteButton(hasCustomMap);
    const defaultSrc = this.maps[mapKey];
    if (defaultSrc) {
      this.setImage(defaultSrc);

      // 初回表示時の案内
      if (!localStorage.getItem('c107_usage_guide_shown')) {
        setTimeout(() => {
          this.showToast('ℹ️ 公式マップを利用するには⚙️ボタンから設定してください', 5000);
          localStorage.setItem('c107_usage_guide_shown', 'true');
        }, 1000);
      }
    }
  },

  /**
   * 削除ボタンの表示/非表示を更新
   */
  updateDeleteButton(hasCustomMap) {
    const deleteBtn = document.getElementById('mapDeleteBtn');
    if (deleteBtn) {
      if (hasCustomMap) {
        deleteBtn.classList.remove('hidden');
      } else {
        deleteBtn.classList.add('hidden');
      }
    }
  },

  /**
   * 現在のマップを削除
   */
  async deleteCurrentMap() {
    if (!confirm('このエリアのカスタムマップを削除しますか？')) return;

    try {
      if (Storage.MapData) {
        await Storage.MapData.deleteAllPages(this.currentMapKey);
        this.showToast('マップを削除しました');
        this.loadMap(this.currentMapKey);
      }
    } catch (e) {
      console.error('Failed to delete map:', e);
      this.showToast('削除に失敗しました');
    }
  },

  /**
   * ページ切り替え
   */
  async switchPage(pageNum) {
    if (pageNum === this.currentPage || pageNum < 1 || pageNum > this.totalPages) {
      return;
    }

    this.currentPage = pageNum;

    try {
      const blob = await Storage.MapData.getImageWithPage(this.currentMapKey, pageNum);
      if (blob) {
        const url = URL.createObjectURL(blob);
        this.setImage(url);
        this.updatePageSelector();
      }
    } catch (e) {
      console.error('Failed to switch page:', e);
      this.showToast('ページの読み込みに失敗しました');
    }
  },

  /**
   * ページセレクターを更新
   */
  updatePageSelector() {
    const pageSelectWrapper = document.getElementById('mapPageSelectWrapper');
    const pageSelect = document.getElementById('mapPageSelect');

    if (!pageSelectWrapper || !pageSelect) return;

    // ページ分割がない場合は非表示
    if (this.totalPages === 0) {
      pageSelectWrapper.classList.add('hidden');
      return;
    }

    // ページセレクターを表示してオプションを更新
    pageSelectWrapper.classList.remove('hidden');
    pageSelect.innerHTML = '';

    for (let i = 1; i <= this.totalPages; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `${i}ページ目`;
      if (i === this.currentPage) {
        option.selected = true;
      }
      pageSelect.appendChild(option);
    }
  },

  setImage(src) {
    if (this.image) {
      this.image.onload = () => this.fitToContainer();
      this.image.src = src;
    }
  },

  showToast(msg, duration = 3000) {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = msg;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), duration);
    }
  },

  /**
   * コンテナに収まるようにスケールを計算
   */
  fitToContainer() {
    if (!this.container || !this.image) return;

    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const imageWidth = this.image.naturalWidth;
    const imageHeight = this.image.naturalHeight;

    if (imageWidth === 0 || imageHeight === 0) return;

    // コンテナに収まる最大スケールを計算
    const scaleX = containerWidth / imageWidth;
    const scaleY = containerHeight / imageHeight;
    const fitScale = Math.min(scaleX, scaleY);

    // 最小スケールを全体表示サイズに設定（これより小さくならない）
    this.minScale = fitScale;
    this.scale = fitScale;

    // 画像を中央に配置（CSSのleft:50%, top:50%に対応してオフセット）
    // 画像の中心をコンテナの中心に合わせる
    this.translateX = -(imageWidth * this.scale) / 2;
    this.translateY = -(imageHeight * this.scale) / 2;

    this.updateTransform();
  },

  /**
   * リセット（全体表示に戻す）
   */
  reset() {
    this.fitToContainer();
  },

  /**
   * トランスフォーム更新
   */
  updateTransform() {
    if (this.image) {
      this.image.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }
  },

  /**
   * ドラッグ開始
   */
  onDragStart(e) {
    this.isDragging = true;
    this.startX = e.clientX - this.translateX;
    this.startY = e.clientY - this.translateY;
  },

  /**
   * ドラッグ移動
   */
  onDragMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    this.translateX = e.clientX - this.startX;
    this.translateY = e.clientY - this.startY;
    this.constrainPosition();
    this.updateTransform();
  },

  /**
   * ドラッグ終了
   */
  onDragEnd() {
    this.isDragging = false;
  },

  /**
   * マウスホイール
   */
  onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoom(delta, e.clientX, e.clientY);
  },

  /**
   * タッチ開始
   */
  onTouchStart(e) {
    if (e.touches.length === 1) {
      // シングルタッチ：ドラッグ
      this.isDragging = true;
      this.startX = e.touches[0].clientX - this.translateX;
      this.startY = e.touches[0].clientY - this.translateY;
    } else if (e.touches.length === 2) {
      // ダブルタッチ：ピンチズーム + 移動
      this.isDragging = false;
      this.lastTouchDistance = this.getTouchDistance(e.touches);
      // ピンチの中心点を記録
      this.lastPinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      this.lastPinchCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  },

  /**
   * タッチ移動
   */
  onTouchMove(e) {
    e.preventDefault();

    if (e.touches.length === 1 && this.isDragging) {
      // ドラッグ
      this.translateX = e.touches[0].clientX - this.startX;
      this.translateY = e.touches[0].clientY - this.startY;
      this.constrainPosition();
      this.updateTransform();
    } else if (e.touches.length === 2) {
      // ピンチズーム + 移動
      const distance = this.getTouchDistance(e.touches);
      const delta = distance / this.lastTouchDistance;

      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      // ピンチ中心の移動量を計算
      const panX = centerX - this.lastPinchCenterX;
      const panY = centerY - this.lastPinchCenterY;

      // 移動を適用
      this.translateX += panX;
      this.translateY += panY;

      // ズームを適用
      this.zoom(delta, centerX, centerY);

      // 次回計算用に更新
      this.lastTouchDistance = distance;
      this.lastPinchCenterX = centerX;
      this.lastPinchCenterY = centerY;
    }
  },

  /**
   * 2点間の距離を計算
   */
  getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },

  /**
   * ズーム（カーソル/ピンチ位置を中心に拡大縮小）
   */
  zoom(delta, centerX, centerY) {
    const rect = this.container.getBoundingClientRect();

    // コンテナ中央からの相対座標（CSSでleft:50%, top:50%を使用しているため）
    const containerCenterX = rect.width / 2;
    const containerCenterY = rect.height / 2;

    // カーソル位置（コンテナ相対）
    const mouseX = centerX - rect.left;
    const mouseY = centerY - rect.top;

    // カーソル位置から画像の座標を計算
    // 画像の左上は (containerCenterX + translateX, containerCenterY + translateY)
    const imageX = (mouseX - containerCenterX - this.translateX) / this.scale;
    const imageY = (mouseY - containerCenterY - this.translateY) / this.scale;

    const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * delta));

    if (newScale !== this.scale) {
      // 新しいスケールでの画像座標から逆算してtranslateを調整
      this.translateX = mouseX - containerCenterX - imageX * newScale;
      this.translateY = mouseY - containerCenterY - imageY * newScale;
      this.scale = newScale;
      this.constrainPosition();
      this.updateTransform();
    }
  },

  /**
   * 画像が画面外にはみ出さないよう位置を制限
   */
  constrainPosition() {
    if (!this.container || !this.image) return;

    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const imageWidth = this.image.naturalWidth * this.scale;
    const imageHeight = this.image.naturalHeight * this.scale;

    // 画像の実際の位置（CSSのleft:50%, top:50%から計算）
    // 画像左端 = containerWidth/2 + translateX
    // 画像右端 = containerWidth/2 + translateX + imageWidth
    const halfContainerW = containerWidth / 2;
    const halfContainerH = containerHeight / 2;

    // 画像が画面より小さい場合は中央寄せ
    if (imageWidth <= containerWidth) {
      this.translateX = -imageWidth / 2;
    } else {
      // 左端がコンテナ右端を超えないよう制限 (画像左端 < containerWidth)
      // halfContainerW + translateX < containerWidth → translateX < halfContainerW
      // でも画像の一部は見えていてほしいので、画像右端がコンテナ左端より右にある必要
      // halfContainerW + translateX + imageWidth > 0 → translateX > -halfContainerW - imageWidth

      // 画像右端がコンテナ左端より右
      const minX = -halfContainerW - imageWidth + 50; // 50pxは最低限見える範囲
      // 画像左端がコンテナ右端より左
      const maxX = halfContainerW - 50;

      this.translateX = Math.max(minX, Math.min(maxX, this.translateX));
    }

    if (imageHeight <= containerHeight) {
      this.translateY = -imageHeight / 2;
    } else {
      const minY = -halfContainerH - imageHeight + 50;
      const maxY = halfContainerH - 50;

      this.translateY = Math.max(minY, Math.min(maxY, this.translateY));
    }
  }
};
