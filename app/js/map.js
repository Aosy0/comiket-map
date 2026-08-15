/**
 * マップ表示・操作モジュール
 */

const MapViewer = {
	container: null,
	image: null,
	scale: 1,
	minScale: 0.5,
	maxScale: 10,
	// マップ別の最大拡大倍率（全体表示に対する倍率。未指定は8倍）
	mapMaxZoomFactors: {
		east123: 12,
		west12: 12,
	},
	translateX: 0,
	translateY: 0,
	isDragging: false,
	startX: 0,
	startY: 0,
	lastTouchDistance: 0,
	lastPinchCenterX: 0,
	lastPinchCenterY: 0,

	// サークル色付け（SVG内のrectを直接塗りつぶす）
	circleColors: {}, // { '東7-A-1': '#fde047' } の色マップ
	circleStorageKey: Storage.KEYS.CIRCLE_COLORS,
	// サークルタップ色付けが有効な自作SVGマップ
	circleEnabledMaps: ['east123', 'east7', 'west12'],
	circlePalette: ['#fde047', '#86efac', '#93c5fd', '#fca5a5'], // 黄→緑→青→赤→解除
	dragStartX: 0,
	dragStartY: 0,

	// 慣性スクロール（指を離した後の滑り）用
	velocityX: 0,
	velocityY: 0,
	lastMoveX: 0,
	lastMoveY: 0,
	lastMoveTime: 0,
	inertiaAnimFrame: null,
	isInertiaRunning: false,

	// マップ画像パス
	maps: {
		east123: '/maps/map_east123.svg',
		east7: '/maps/map_east7.svg',
		west12: '/maps/map_west12.svg',
		south12: '/maps/map_south12.svg',
		overview: '/maps/map_overview.svg',
	},
	// 開発環境ではキャッシュを無効化して最新のマップを読み込む
	mapUrl(mapKey) {
		const base = this.maps[mapKey];
		if (!base) return base;
		const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
		return isDev ? `${base}?v=${Date.now()}` : base;
	},

	// 現在表示中のマップキー
	currentMapKey: 'east123',

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

		this.loadCircleColors();
		this.bindEvents();
		this.initModalEvents();
		this.loadMap('east123');
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
		this.container.addEventListener('click', (e) => this.onCircleClick(e));
		this.container.addEventListener('wheel', (e) => this.onWheel(e));

		// タッチイベント
		this.container.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
		this.container.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
		this.container.addEventListener('touchend', (e) => this.onTouchEnd(e));
		this.container.addEventListener('touchcancel', () => this.onDragEnd());

		// マップ選択
		const mapSelect = document.getElementById('mapSelect');
		if (mapSelect) {
			mapSelect.addEventListener('change', (e) => this.loadMap(e.target.value));
		}

		// ページセレクター
		const pageSelect = document.getElementById('mapPageSelect');
		if (pageSelect) {
			pageSelect.addEventListener('change', (e) => this.switchPage(Number.parseInt(e.target.value)));
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

		// ウィンドウリサイズ時にフィット（連続リサイズ対策で遅延実行）
		let resizeTimer = null;
		window.addEventListener('resize', () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => this.fitToContainer(), 200);
		});
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
		1: { key: 'east123', name: '東1-3ホール' },
		2: { key: 'east7', name: '東7ホール' },
		3: { key: 'west12', name: '西1-2ホール' },
		4: { key: 'south12', name: '南1-2ホール' },
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
			await new Promise((resolve) => setTimeout(resolve, 1000));
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
					areaName: isOfficialPDF && mapping ? mapping.name : `${i}ページ目`,
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
			{ key: 'east123', name: '東1-3ホール' },
			{ key: 'east7', name: '東7ホール' },
			{ key: 'west12', name: '西1-2ホール' },
			{ key: 'south12', name: '南1-2ホール' },
			{ key: '', name: '（スキップ）' },
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

			areaOptions.forEach((opt) => {
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
				const idx = Number.parseInt(e.target.dataset.index);
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

		['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
			dropZone.addEventListener(eventName, (e) => {
				e.preventDefault();
				e.stopPropagation();
			});
		});

		['dragenter', 'dragover'].forEach((eventName) => {
			dropZone.addEventListener(eventName, () => {
				dropZone.classList.add('drag-over');
			});
		});

		['dragleave', 'drop'].forEach((eventName) => {
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
		const defaultSrc = this.mapUrl(mapKey);
		if (defaultSrc) {
			await this.setImage(defaultSrc);

			// 自作SVGマップのみサークルタップ色付けを有効化（東1-3・東7・西1-2）
			if (this.circleEnabledMaps.includes(mapKey)) {
				await this.setupCircleOverlay();
			}

			// 初回表示時の案内
			if (!localStorage.getItem('usage_guide_shown')) {
				setTimeout(() => {
					this.showToast('ℹ️ 公式マップを利用するには⚙️ボタンから設定してください', 5000);
					localStorage.setItem('usage_guide_shown', 'true');
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
	 * 点 (x, y) に祖先チェーンの transform を SVG 仕様通りに適用して絶対座標を返す。
	 * translate / rotate / matrix に対応。戻り値は [x, y, rotateAngle]。
	 */
	applyTransformToPoint(el, x, y) {
		let angle = 0;
		const chain = [];
		let node = el;
		while (node?.getAttribute) {
			chain.push(node);
			node = node.parentNode;
		}
		// 要素自身の transform から祖先の順に適用（SVG: 点は自身→親→祖父母の順で変換）
		for (let i = 0; i < chain.length; i++) {
			const t = chain[i].getAttribute('transform');
			if (!t) continue;
			const ops = [];
			const re = /(translate|rotate|matrix)\(([^)]*)\)/g;
			let m;
			while ((m = re.exec(t)) !== null) {
				ops.push([m[1], m[2]]);
			}
			// 同じ transform 内の操作は右から左に適用（transform="A B" は B を先に適用）
			for (let k = ops.length - 1; k >= 0; k--) {
				const [kind, argsStr] = ops[k];
				const args = argsStr
					.split(/[\s,]+/)
					.map(Number)
					.filter((n) => !Number.isNaN(n));
				if (kind === 'translate') {
					x += args[0];
					y += args[1] || 0;
				} else if (kind === 'rotate') {
					angle += args[0];
					const rad = (args[0] * Math.PI) / 180;
					if (args.length >= 3) {
						const cx = args[1];
						const cy = args[2];
						x -= cx;
						y -= cy;
						const nx = x * Math.cos(rad) - y * Math.sin(rad);
						const ny = x * Math.sin(rad) + y * Math.cos(rad);
						x = nx + cx;
						y = ny + cy;
					} else {
						const nx = x * Math.cos(rad) - y * Math.sin(rad);
						const ny = x * Math.sin(rad) + y * Math.cos(rad);
						x = nx;
						y = ny;
					}
				} else if (kind === 'matrix') {
					const a = args[0],
						b = args[1],
						c = args[2],
						d = args[3],
						e = args[4],
						f = args[5];
					const nx = a * x + c * y + e;
					const ny = b * x + d * y + f;
					x = nx;
					y = ny;
				}
			}
		}
		return [x, y, angle];
	},

	/**
	 * サークルrectを直接操作（オーバーレイを使わずSVG内を直接塗りつぶす）
	 */
	async setupCircleOverlay() {
		if (!this.circleEnabledMaps.includes(this.currentMapKey)) return;
		// インラインSVG読み込み済みの場合のみ直接バインド
		if (this.image && this.image.tagName === 'svg') {
			this.bindCircleRects();
			return;
		}
		// <img> の場合は読み込み完了を待ってバインド
		if (this.image && this.image.tagName === 'IMG') {
			if (this.image.complete) {
				this.bindCircleRects();
			} else {
				this.image.addEventListener('load', () => this.bindCircleRects(), { once: true });
			}
		}
	},

	/**
	 * サークルセルのクリック/タップ処理（ドラッグ判定後に色を切り替える）
	 */
	onCircleClick(e) {
		const target = e.target;
		if (!target || !target.hasAttribute || !target.hasAttribute('data-circle')) return;
		const dx = Math.abs(e.clientX - this.dragStartX);
		const dy = Math.abs(e.clientY - this.dragStartY);
		if (dx > 10 || dy > 10) return;
		this.cycleCircleColor(target);
	},

	/**
	 * 色をサイクルで切り替え（最後は解除）
	 */
	cycleCircleColor(rect) {
		const id = rect.getAttribute('data-circle');
		const current = this.circleColors[id];
		const idx = current ? this.circlePalette.indexOf(current) : -1;
		let next;
		if (idx === -1) {
			next = this.circlePalette[0];
		} else if (idx >= this.circlePalette.length - 1) {
			next = null;
		} else {
			next = this.circlePalette[idx + 1];
		}
		if (next) {
			this.circleColors[id] = next;
			rect.style.fill = next;
		} else {
			delete this.circleColors[id];
			rect.style.fill = 'transparent';
		}
		this.saveCircleColors();
	},

	/**
	 * 保存済みの色を読み込み
	 */
	loadCircleColors() {
		try {
			this.circleColors = JSON.parse(localStorage.getItem(this.circleStorageKey) || '{}');
		} catch (e) {
			this.circleColors = {};
		}
	},

	/**
	 * 色を保存
	 */
	saveCircleColors() {
		try {
			localStorage.setItem(this.circleStorageKey, JSON.stringify(this.circleColors));
		} catch (e) {
			console.error('[MapViewer] failed to save circle colors:', e);
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

	async setImage(src) {
		this.stopInertia();
		if (!this.image) return;
		// SVGマップはインライン表示してズーム時の解像度を維持する
		if (/\.svg(\?|$)/.test(src)) {
			await this.loadInlineSvg(src);
			return;
		}
		this.image.onload = () => this.fitToContainer();
		this.image.src = src;
	},

	/**
	 * SVGをfetchしてインライン要素として表示（ラスタライズせずベクターのまま）
	 */
	async loadInlineSvg(src) {
		try {
			const res = await fetch(src);
			if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
			const text = await res.text();
			const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
			const svgEl = doc.documentElement;
			// 既存の img を置き換え
			const old = this.image;
			this.image = svgEl;
			this.image.classList.add('map-image');
			this.image.style.position = 'absolute';
			this.image.style.left = '50%';
			this.image.style.top = '50%';
			this.image.style.transformOrigin = '0 0';
			// naturalWidth/naturalHeight 互換プロパティを設定
			const vb = (svgEl.getAttribute('viewBox') || '').split(/\s+/).map(Number);
			this.image.naturalWidth = vb[2] || 199.58;
			this.image.naturalHeight = vb[3] || 198.03;
			// width/height 属性を viewBox に合わせて設定（CSSのmax-width影響で二重拡大されるのを防ぐ）
			this.image.setAttribute('width', this.image.naturalWidth);
			this.image.setAttribute('height', this.image.naturalHeight);
			// width/height を直接変更して拡大するため、max-width制限を無効化
			this.image.style.maxWidth = 'none';
			old.replaceWith(this.image);
			this.fitToContainer();
		} catch (e) {
			console.error('[MapViewer] inline SVG load failed:', e);
			this.image.src = src;
			this.image.onload = () => this.fitToContainer();
		}
	},

	/**
	 * インラインSVG内のサークルrectにクリック処理を直接バインドし、保存済み色を復元する
	 */
	bindCircleRects() {
		if (!this.image) return;
		const svg = this.image;
		// 番号テキストがクリックを横取りしないよう透過する
		svg.querySelectorAll('text').forEach((t) => {
			t.style.pointerEvents = 'none';
		});
		const rects = svg.querySelectorAll('rect[data-circle]');
		rects.forEach((rect) => {
			const id = rect.getAttribute('data-circle');
			// 透明でもクリック可能にする
			rect.style.pointerEvents = 'all';
			rect.style.cursor = 'pointer';
			const color = this.circleColors[id];
			if (color) {
				rect.style.fill = color;
				rect.setAttribute('fill-opacity', '0.6');
			} else {
				rect.style.fill = 'transparent';
			}
			if (!rect._circleBound) {
				rect.addEventListener('click', (e) => this.onCircleRectClick(e, rect));
				rect._circleBound = true;
			}
		});
	},

	/**
	 * サークルrectを直接クリックしたときの処理
	 */
	onCircleRectClick(e, rect) {
		const dx = Math.abs(e.clientX - this.dragStartX);
		const dy = Math.abs(e.clientY - this.dragStartY);
		if (dx > 10 || dy > 10) return;
		e.stopPropagation();
		this.cycleCircleColor(rect);
	},

	showToast(msg, duration = 3000) {
		const toast = document.getElementById('toast');
		if (toast) {
			toast.textContent = msg;
			toast.classList.remove('hidden', 'hiding');
			toast.classList.add('show');
			setTimeout(() => {
				toast.classList.add('hiding');
				setTimeout(() => {
					toast.classList.remove('show', 'hiding');
				}, 300);
			}, duration);
		}
	},

	/**
	 * コンテナに収まるようにスケールを計算
	 */
	fitToContainer() {
		this.stopInertia();
		if (!this.container || !this.image) return;

		const containerWidth = this.container.clientWidth;
		const containerHeight = this.container.clientHeight;
		const imageWidth = this.image.naturalWidth;
		const imageHeight = this.image.naturalHeight;

		// マップタブが非アクティブでコンテナサイズが0の場合は、表示後に再試行
		if (containerWidth === 0 || containerHeight === 0) {
			requestAnimationFrame(() => this.fitToContainer());
			return;
		}

		if (imageWidth === 0 || imageHeight === 0) return;

		// コンテナに収まる最大スケールを計算
		const scaleX = containerWidth / imageWidth;
		const scaleY = containerHeight / imageHeight;
		const fitScale = Math.min(scaleX, scaleY);

		// 全体表示はコンテナにぴったりではなく、わずかに余白を持たせる（見切れ防止）
		const viewScale = fitScale * 0.97;
		// 縮小は全体表示から少し余白が見えるところまで、拡大は全体表示の8倍まで（マップ別に上書き可）
		this.minScale = fitScale * 0.94;
		this.maxScale = fitScale * (this.mapMaxZoomFactors[this.currentMapKey] ?? 8);
		this.scale = viewScale;

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
			// scale()での拡大はラスタライズされてぼやけるため、width/heightを直接変更して拡大する
			this.image.style.width = `${this.image.naturalWidth * this.scale}px`;
			this.image.style.height = `${this.image.naturalHeight * this.scale}px`;
			this.image.style.transform = `translate(${this.translateX}px, ${this.translateY}px)`;
		}
	},

	/**
	 * ドラッグ開始
	 */
	onDragStart(e) {
		this.stopInertia();
		this.isDragging = true;
		this.dragStartX = e.clientX;
		this.dragStartY = e.clientY;
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
	 * タッチ終了：速度が残っていれば慣性スクロールを開始
	 */
	onTouchEnd(e) {
		const wasDragging = this.isDragging;
		this.onDragEnd();

		// ピンチ操作の終了では慣性を開始しない
		if (!wasDragging || e.changedTouches.length !== 1) return;

		// 指を離す前に止めていた時間が長いほど速度を減衰
		if (this.lastMoveTime > 0) {
			const elapsed = e.timeStamp - this.lastMoveTime;
			if (elapsed > 50) {
				const decay = 0.9 ** (elapsed / 16);
				this.velocityX *= decay;
				this.velocityY *= decay;
			}
		}

		if (Math.hypot(this.velocityX, this.velocityY) >= 0.05) {
			this.startInertia();
		}
	},

	/**
	 * 慣性スクロール開始（ブラウザスクロールのような摩擦減衰で滑る）
	 */
	startInertia() {
		this.stopInertia();
		this.isInertiaRunning = true;
		let lastFrameTime = 0;

		const step = (now) => {
			if (!this.isInertiaRunning) return;
			// フレーム間隔（タブ切り替え等で間隔が空いた場合は上限で制限）
			const dt = lastFrameTime ? Math.min(now - lastFrameTime, 32) : 16;
			lastFrameTime = now;

			this.translateX += this.velocityX * dt;
			this.translateY += this.velocityY * dt;

			// 端に到達したらその方向の速度をゼロにして停止
			const { clampedX, clampedY } = this.constrainPosition();
			if (clampedX) this.velocityX = 0;
			if (clampedY) this.velocityY = 0;

			this.updateTransform();

			// フレームレート非依存の減衰（16msあたり0.92倍）
			const decay = 0.92 ** (dt / 16);
			this.velocityX *= decay;
			this.velocityY *= decay;

			if (Math.hypot(this.velocityX, this.velocityY) < 0.02) {
				this.stopInertia();
				return;
			}
			this.inertiaAnimFrame = requestAnimationFrame(step);
		};

		this.inertiaAnimFrame = requestAnimationFrame(step);
	},

	/**
	 * 慣性スクロール停止
	 */
	stopInertia() {
		this.isInertiaRunning = false;
		if (this.inertiaAnimFrame) {
			cancelAnimationFrame(this.inertiaAnimFrame);
			this.inertiaAnimFrame = null;
		}
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
		this.stopInertia();
		this.velocityX = 0;
		this.velocityY = 0;
		this.lastMoveTime = 0;

		if (e.touches.length === 1) {
			// シングルタッチ：ドラッグ
			this.isDragging = true;
			this.dragStartX = e.touches[0].clientX;
			this.dragStartY = e.touches[0].clientY;
			this.startX = e.touches[0].clientX - this.translateX;
			this.startY = e.touches[0].clientY - this.translateY;
			// 慣性速度の計測開始位置を記録
			this.lastMoveX = e.touches[0].clientX;
			this.lastMoveY = e.touches[0].clientY;
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
			const x = e.touches[0].clientX;
			const y = e.touches[0].clientY;
			const now = e.timeStamp;

			// 直前の移動量から速度を計測（イベント間隔が異常に長い場合は無視）
			if (this.lastMoveTime > 0 && now > this.lastMoveTime && now - this.lastMoveTime < 100) {
				const dt = now - this.lastMoveTime;
				const vx = (x - this.lastMoveX) / dt;
				const vy = (y - this.lastMoveY) / dt;
				// 指数平滑化で指のジッターによる速度ブレを抑える
				this.velocityX = this.velocityX * 0.7 + vx * 0.3;
				this.velocityY = this.velocityY * 0.7 + vy * 0.3;
			}
			this.lastMoveX = x;
			this.lastMoveY = y;
			this.lastMoveTime = now;

			this.translateX = x - this.startX;
			this.translateY = y - this.startY;
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
		this.stopInertia();
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
	 * @returns {{clampedX: boolean, clampedY: boolean}} 各軸でクランプされたか
	 */
	constrainPosition() {
		if (!this.container || !this.image) return { clampedX: false, clampedY: false };

		const containerWidth = this.container.clientWidth;
		const containerHeight = this.container.clientHeight;
		const imageWidth = this.image.naturalWidth * this.scale;
		const imageHeight = this.image.naturalHeight * this.scale;

		// 画像の実際の位置（CSSのleft:50%, top:50%から計算）
		// 画像左端 = containerWidth/2 + translateX
		// 画像右端 = containerWidth/2 + translateX + imageWidth
		const halfContainerW = containerWidth / 2;
		const halfContainerH = containerHeight / 2;

		let clampedX = false;
		let clampedY = false;

		// 画像が画面より小さい場合は中央寄せ
		if (imageWidth <= containerWidth) {
			clampedX = this.translateX !== -imageWidth / 2;
			this.translateX = -imageWidth / 2;
		} else {
			// 画像右端がコンテナ左端まで動かせる（右端も画面内に表示可能）
			const minX = -halfContainerW - imageWidth;
			// 画像左端がコンテナ右端まで動かせる（左端も画面内に表示可能）
			const maxX = halfContainerW;
			const clamped = Math.max(minX, Math.min(maxX, this.translateX));
			clampedX = clamped !== this.translateX;
			this.translateX = clamped;
		}

		if (imageHeight <= containerHeight) {
			clampedY = this.translateY !== -imageHeight / 2;
			this.translateY = -imageHeight / 2;
		} else {
			const minY = -halfContainerH - imageHeight;
			const maxY = halfContainerH;
			const clamped = Math.max(minY, Math.min(maxY, this.translateY));
			clampedY = clamped !== this.translateY;
			this.translateY = clamped;
		}

		return { clampedX, clampedY };
	},
};
