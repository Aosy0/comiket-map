/**
 * C107 サークルマップ - メインアプリケーション
 */

const App = {
	currentDay: 'all',
	searchTerm: '',
	compactMode: false,

	// ドラッグ並び替え用
	isDraggingReorder: false,
	dragPointerId: null,
	dragCard: null,
	dragPlaceholder: null,
	dragOffsetY: 0,

	/**
	 * 初期化
	 */
	init() {
		console.log('C107 サークルマップ - 初期化開始');

		// 設定を読み込み
		this.loadSettings();

		this.bindEvents();
		this.renderCircleList();
		this.updateOnlineStatus();
		this.registerServiceWorker();
		this.checkCacheStatus();

		// マップ初期化
		MapViewer.init();

		// URLハッシュからのデータ読み込み
		this.loadFromURLHash();

		console.log('C107 サークルマップ - 初期化完了');
	},

	/**
	 * 設定を読み込み
	 */
	loadSettings() {
		const settings = Storage.getSettings();
		this.compactMode = settings.compactMode || false;
	},

	/**
	 * コンパクトモードを切り替え
	 */
	toggleCompactMode(enabled) {
		this.compactMode = enabled;
		Storage.saveSettings({ compactMode: enabled });
		this.renderCircleList();

		// ボタンの見た目を更新
		// const compactToggleBtn = document.getElementById('compactToggleBtn');
		// if (compactToggleBtn) {
		// 	this.updateCompactToggleButton(compactToggleBtn);
		// }
	},

	/**
	 * コンパクトモード切り替えボタンの見た目を更新
	 */
	// updateCompactToggleButton(btn) {
	// 	console.log('ボタン更新:', this.compactMode);
	// 	btn.classList.toggle('active', this.compactMode);
	// 	const icon = btn.querySelector('use');
	// 	const text = btn.querySelector('.compact-toggle-text');
	// 	if (icon) {
	// 		const newHref = this.compactMode ? '#icon-view-list' : '#icon-view-compact';
	// 		icon.setAttribute('href', newHref);
	// 		// SVG use要素の互換性のため
	// 		icon.setAttribute('xlink:href', newHref);
	// 		console.log('アイコン変更:', newHref);
	// 	}
	// 	if (text) {
	// 		text.textContent = this.compactMode ? '通常表示' : 'コンパクト';
	// 	}
	// },

	/**
	 * Service Worker登録
	 */
	registerServiceWorker() {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker
				.register('/sw.js')
				.then((reg) => {
					console.log('Service Worker registered:', reg.scope);
				})
				.catch((err) => {
					console.error('Service Worker registration failed:', err);
				});
		}
	},

	/**
	 * イベントバインド
	 */
	bindEvents() {
		// タブ切り替え
		document.querySelectorAll('.tab-btn').forEach((btn) => {
			btn.addEventListener('click', (e) => this.switchTab(e.target.closest('.tab-btn').dataset.tab));
		});

		// 日付フィルター
		document.querySelectorAll('.filter-btn').forEach((btn) => {
			btn.addEventListener('click', (e) => this.filterByDay(e.target.dataset.day));
		});

		// 検索
		const searchInput = document.getElementById('searchInput');
		if (searchInput) {
			searchInput.addEventListener('input', (e) => {
				this.searchTerm = e.target.value;
				this.renderCircleList();
			});
		}

		// サークル追加フォーム
		const addForm = document.getElementById('addCircleForm');
		if (addForm) {
			addForm.addEventListener('submit', (e) => this.handleAddCircle(e));
		}

		// 編集フォーム
		const editForm = document.getElementById('editCircleForm');
		if (editForm) {
			editForm.addEventListener('submit', (e) => this.handleEditCircle(e));
		}

		// モーダル閉じる
		const closeModal = document.getElementById('closeModal');
		if (closeModal) {
			closeModal.addEventListener('click', () => this.closeEditModal());
		}

		// 削除ボタン
		const deleteBtn = document.getElementById('deleteCircle');
		if (deleteBtn) {
			deleteBtn.addEventListener('click', () => this.handleDeleteCircle());
		}

		// エクスポート
		const exportBtn = document.getElementById('exportData');
		if (exportBtn) {
			exportBtn.addEventListener('click', () => this.exportData());
		}

		// インポート
		const importBtn = document.getElementById('importData');
		const importFile = document.getElementById('importFile');
		if (importBtn && importFile) {
			importBtn.addEventListener('click', () => importFile.click());
			importFile.addEventListener('change', (e) => this.importData(e));
		}

		// データ削除
		const clearBtn = document.getElementById('clearData');
		if (clearBtn) {
			clearBtn.addEventListener('click', () => this.clearAllData());
		}

		// 全マップリセット
		const resetAllMapsBtn = document.getElementById('resetAllMaps');
		if (resetAllMapsBtn) {
			resetAllMapsBtn.addEventListener('click', () => this.resetAllMaps());
		}

		// アプリ強制更新
		const forceUpdateBtn = document.getElementById('forceUpdate');
		if (forceUpdateBtn) {
			forceUpdateBtn.addEventListener('click', () => this.forceUpdate());
		}

		// コンパクトモード切り替え（リスト画面のボタン）
		const compactToggleBtn = document.getElementById('compactToggleBtn');
		if (compactToggleBtn) {
			console.log('コンパクトモードボタンが見つかりました');
			// 初期状態を設定
			this.updateCompactToggleButton(compactToggleBtn);
			compactToggleBtn.addEventListener('change', (e) => {
				console.log('コンパクトモードボタンがクリックされました');
				// e.stopPropagation();
				this.compactMode = e.target.checked; // テスト用
				console.log(this.compactMode);
				this.toggleCompactMode(this.compactMode);
				// this.updateCompactToggleButton(compactToggleBtn);
			});
		} else {
			console.warn('コンパクトモードボタンが見つかりません');
		}

		// オンライン状態監視
		window.addEventListener('online', () => this.updateOnlineStatus());
		window.addEventListener('offline', () => this.updateOnlineStatus());

		// モーダル外クリックで閉じる
		const modal = document.getElementById('editModal');
		if (modal) {
			modal.addEventListener('click', (e) => {
				if (e.target === modal) this.closeEditModal();
			});
		}

		// 同期機能 - QRコード共有
		const shareQRBtn = document.getElementById('shareQR');
		if (shareQRBtn) {
			shareQRBtn.addEventListener('click', () => this.showShareQR());
		}

		// 同期機能 - URL共有
		const shareURLBtn = document.getElementById('shareURL');
		if (shareURLBtn) {
			shareURLBtn.addEventListener('click', () => this.showShareURL());
		}

		// 同期機能 - コード共有
		const shareCodeBtn = document.getElementById('shareCode');
		if (shareCodeBtn) {
			shareCodeBtn.addEventListener('click', () => this.showShareCode());
		}

		// 同期機能 - コード読み込み
		const importCodeBtn = document.getElementById('importCode');
		if (importCodeBtn) {
			importCodeBtn.addEventListener('click', () => this.showImportCode());
		}

		// 同期モーダル - 閉じるボタン
		const closeSyncQR = document.getElementById('closeSyncQRModal');
		if (closeSyncQR) {
			closeSyncQR.addEventListener('click', () => document.getElementById('syncQRModal').classList.add('hidden'));
		}

		const closeSyncURL = document.getElementById('closeSyncURLModal');
		if (closeSyncURL) {
			closeSyncURL.addEventListener('click', () => document.getElementById('syncURLModal').classList.add('hidden'));
		}

		const closeSyncCode = document.getElementById('closeSyncCodeModal');
		if (closeSyncCode) {
			closeSyncCode.addEventListener('click', () => document.getElementById('syncCodeModal').classList.add('hidden'));
		}

		const closeImportCode = document.getElementById('closeImportCodeModal');
		if (closeImportCode) {
			closeImportCode.addEventListener('click', () =>
				document.getElementById('importCodeModal').classList.add('hidden'),
			);
		}

		// 同期モーダル - コピーボタン
		const copyURLBtn = document.getElementById('copyURL');
		if (copyURLBtn) {
			copyURLBtn.addEventListener('click', () => this.copyShareURL());
		}

		const copyCodeBtn = document.getElementById('copyCode');
		if (copyCodeBtn) {
			copyCodeBtn.addEventListener('click', () => this.copyShareCode());
		}

		// 同期モーダル - インポート実行
		const executeImportBtn = document.getElementById('executeImport');
		if (executeImportBtn) {
			executeImportBtn.addEventListener('click', () => this.executeImport());
		}

		// 同期モーダル - モーダル外クリッ クで閉じる
		const syncModals = ['syncQRModal', 'syncURLModal', 'syncCodeModal', 'importCodeModal'];
		syncModals.forEach((modalId) => {
			const syncModal = document.getElementById(modalId);
			if (syncModal) {
				syncModal.addEventListener('click', (e) => {
					if (e.target === syncModal) syncModal.classList.add('hidden');
				});
			}
		});
	},

	/**
	 * タブ切り替え
	 */
	switchTab(tabId) {
		// ボタンのアクティブ状態
		document.querySelectorAll('.tab-btn').forEach((btn) => {
			btn.classList.toggle('active', btn.dataset.tab === tabId);
		});

		// コンテンツの表示
		document.querySelectorAll('.tab-content').forEach((content) => {
			content.classList.toggle('active', content.id === `tab-${tabId}`);
		});

		// マップタブに切り替えた場合、表示後にフィット調整
		if (tabId === 'map') {
			// DOMの更新を待ってからフィット処理を実行
			requestAnimationFrame(() => {
				if (typeof MapViewer !== 'undefined' && MapViewer.fitToContainer) {
					MapViewer.fitToContainer();
				}
			});
		}

		// 設定タブに切り替えた場合、マップ管理リストを更新
		if (tabId === 'settings') {
			this.updateMapManagementList();
		}
	},

	/**
	 * 日付フィルター
	 */
	filterByDay(day) {
		this.currentDay = day;
		document.querySelectorAll('.filter-btn').forEach((btn) => {
			btn.classList.toggle('active', btn.dataset.day === day);
		});
		this.renderCircleList();
	},

	/**
	 * サークルリスト描画
	 */
	renderCircleList() {
		const container = document.getElementById('circleList');
		if (!container) return;

		// コンパクトモードのクラスを切り替え
		container.classList.toggle('compact', this.compactMode);

		const circles = Storage.filterCircles({
			day: this.currentDay,
			search: this.searchTerm,
			skipSort: true,
		});

		if (circles.length === 0) {
			container.innerHTML = '<p class="empty-message">サークルが登録されていません</p>';
			return;
		}

		// コンパクトモードに応じてカード生成関数を選択
		const createCard = this.compactMode ? this.createCompactCircleCard.bind(this) : this.createCircleCard.bind(this);
		container.innerHTML = circles.map((circle) => createCard(circle)).join('');

		// ドラッグ並び替えを有効化（コンテナに1回だけバインド）
		this.bindDragReorder(container);

		// カードのイベントバインド
		container.querySelectorAll('.circle-card').forEach((card) => {
			card.addEventListener('click', (e) => {
				if (this.isDraggingReorder) return;
				if (!e.target.closest('.check-btn') && !e.target.closest('.drag-handle')) {
					this.openEditModal(card.dataset.id);
				}
			});
		});

		// チェックボタンのイベント
		container.querySelectorAll('.check-btn').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleCheck(btn.dataset.id);
			});
		});
	},

	/**
	 * サークルカードHTML生成
	 */
	createCircleCard(circle) {
		const dayLabel = circle.day === '1' ? '1日目' : '2日目';
		const priorityClass = `priority-${circle.priority}`;
		const checkedClass = circle.checked ? 'checked' : '';
		const checkBtnClass = circle.checked ? 'check-btn checked' : 'check-btn';
		const checkIcon = circle.checked
			? '<svg class="icon icon-sm"><use href="#icon-check"/></svg>'
			: '<svg class="icon icon-sm"><use href="#icon-pending"/></svg>';
		const checkBtnText = circle.checked ? '済' : '未';

		return `
            <div class="circle-card ${priorityClass} ${checkedClass}" data-id="${circle.id}">
                <div class="circle-header">
            <button type="button" class="drag-handle" aria-label="ドラッグして並び替え" title="ドラッグして並び替え">≡</button>
                    <span class="circle-name">${this.escapeHtml(circle.name)}</span>
                    <span class="circle-space">${this.escapeHtml(circle.space)}</span>
                </div>
                <div class="circle-info">
                    <span><svg class="icon icon-sm"><use href="#icon-event"/></svg> ${dayLabel}</span>
                    ${circle.genre ? `<span><svg class="icon icon-sm"><use href="#icon-folder"/></svg> ${this.escapeHtml(circle.genre)}</span>` : ''}
                </div>
                ${circle.memo ? `<div class="circle-memo">${this.escapeHtml(circle.memo)}</div>` : ''}
                <div class="circle-actions">
                    <button class="${checkBtnClass}" data-id="${circle.id}">${checkIcon} ${checkBtnText}</button>
                </div>
            </div>
        `;
	},

	/**
	 * コンパクトモード用サークルカードHTML生成
	 */
	createCompactCircleCard(circle) {
		const priorityClass = `priority-${circle.priority}`;
		const checkedClass = circle.checked ? 'checked' : '';
		const checkBtnClass = circle.checked ? 'check-btn checked' : 'check-btn';
		const checkIcon = circle.checked
			? '<svg class="icon icon-sm"><use href="#icon-check"/></svg>'
			: '<svg class="icon icon-sm"><use href="#icon-pending"/></svg>';
		const checkBtnText = circle.checked ? '済' : '未';

		return `
            <div class="circle-card ${priorityClass} ${checkedClass}" data-id="${circle.id}">
                <button type="button" class="drag-handle" aria-label="ドラッグして並び替え" title="ドラッグして並び替え">≡</button>
                <div class="circle-header">
                    <span class="circle-name">${this.escapeHtml(circle.name)}</span>
                    <span class="circle-space">${this.escapeHtml(circle.space)}</span>
                </div>
                <div class="circle-actions">
                    <button class="${checkBtnClass}" data-id="${circle.id}">${checkIcon} ${checkBtnText}</button>
                </div>
            </div>
        `;
	},

	/**
	 * ドラッグ並び替えのイベントをバインド（1回だけ）
	 */
	bindDragReorder(container) {
		if (!container || container.dataset.dragBound === '1') return;
		container.dataset.dragBound = '1';

		container.addEventListener('pointerdown', (e) => {
			const handle = e.target.closest('.drag-handle');
			if (!handle) return;
			const card = handle.closest('.circle-card');
			if (!card) return;

			// 右クリック等は無視
			if (e.button != null && e.button !== 0) return;

			this.startDragReorder(e, container, card, handle);
		});

		container.addEventListener(
			'pointermove',
			(e) => {
				if (!this.isDraggingReorder) return;
				if (this.dragPointerId !== e.pointerId) return;
				this.onDragReorderMove(e, container);
			},
			{ passive: false },
		);

		const end = (e) => {
			if (!this.isDraggingReorder) return;
			if (this.dragPointerId !== e.pointerId) return;
			this.endDragReorder(container);
		};

		container.addEventListener('pointerup', end);
		container.addEventListener('pointercancel', end);
	},

	startDragReorder(e, container, card, handle) {
		e.preventDefault();

		this.isDraggingReorder = true;
		this.dragPointerId = e.pointerId;
		this.dragCard = card;

		const rect = card.getBoundingClientRect();
		this.dragOffsetY = e.clientY - rect.top;

		// プレースホルダーを挿入（カード分のスペースを確保）
		const placeholder = document.createElement('div');
		placeholder.className = 'circle-placeholder';
		placeholder.style.height = `${rect.height}px`;
		this.dragPlaceholder = placeholder;

		card.parentNode.insertBefore(placeholder, card);

		// カードを浮かせる
		card.classList.add('dragging');
		card.style.position = 'fixed';
		card.style.left = `${rect.left}px`;
		card.style.top = `${rect.top}px`;
		card.style.width = `${rect.width}px`;
		card.style.zIndex = '1000';
		card.style.pointerEvents = 'none';

		// ポインタキャプチャ（取りこぼし防止）
		if (handle.setPointerCapture) {
			try {
				handle.setPointerCapture(e.pointerId);
			} catch (_) {}
		}
	},

	onDragReorderMove(e, container) {
		e.preventDefault();
		if (!this.dragCard || !this.dragPlaceholder) return;

		// ドラッグ中カードの見た目位置
		this.dragCard.style.top = `${e.clientY - this.dragOffsetY}px`;

		const el = document.elementFromPoint(e.clientX, e.clientY);
		const overCard = el?.closest?.('.circle-card');
		if (!overCard) return;
		if (overCard === this.dragCard) return;
		if (overCard.classList.contains('dragging')) return;

		const overRect = overCard.getBoundingClientRect();
		const before = e.clientY < overRect.top + overRect.height / 2;

		if (before) {
			container.insertBefore(this.dragPlaceholder, overCard);
		} else {
			container.insertBefore(this.dragPlaceholder, overCard.nextSibling);
		}
	},

	endDragReorder(container) {
		if (!this.dragCard || !this.dragPlaceholder) {
			this.isDraggingReorder = false;
			this.dragPointerId = null;
			return;
		}

		// DOMに戻す
		this.dragCard.classList.remove('dragging');
		this.dragCard.style.position = '';
		this.dragCard.style.left = '';
		this.dragCard.style.top = '';
		this.dragCard.style.width = '';
		this.dragCard.style.zIndex = '';
		this.dragCard.style.pointerEvents = '';

		container.insertBefore(this.dragCard, this.dragPlaceholder);
		this.dragPlaceholder.remove();

		// 表示中リストの順を保存（フィルタ/検索中でも「表示されている枠」の中だけ入れ替え）
		const visibleIds = Array.from(container.querySelectorAll('.circle-card'))
			.map((node) => node.dataset.id)
			.filter(Boolean);
		this.persistVisibleOrder(visibleIds);

		// 状態リセット
		this.isDraggingReorder = false;
		this.dragPointerId = null;
		this.dragCard = null;
		this.dragPlaceholder = null;
		this.dragOffsetY = 0;

		// 再描画（イベント/状態の整合性を保つ）
		this.renderCircleList();
	},

	/**
	 * 表示中サークルの新しい順序を、全データへ反映して保存
	 */
	persistVisibleOrder(visibleIds) {
		if (!Array.isArray(visibleIds) || visibleIds.length === 0) return;

		const all = Storage.getCircles();
		const visibleSet = new Set(visibleIds);
		const queue = visibleIds.map((id) => all.find((c) => c.id === id)).filter(Boolean);

		if (queue.length !== visibleIds.length) return;

		let i = 0;
		const reordered = all.map((c) => (visibleSet.has(c.id) ? queue[i++] : c));
		Storage.saveCircles(reordered);
	},

	/**
	 * チェック状態切り替え
	 */
	toggleCheck(id) {
		Storage.toggleCheck(id);
		this.renderCircleList();
	},

	/**
	 * サークル追加
	 */
	handleAddCircle(e) {
		e.preventDefault();

		const circle = {
			name: document.getElementById('circleName').value.trim(),
			space: document.getElementById('spaceNumber').value.trim(),
			day: document.getElementById('circleDay').value,
			genre: document.getElementById('circleGenre').value.trim(),
			memo: document.getElementById('circleMemo').value.trim(),
			priority: document.getElementById('circlePriority').value,
		};

		Storage.addCircle(circle);
		e.target.reset();
		this.showToast('サークルを追加しました');
		this.switchTab('list');
		this.renderCircleList();
	},

	/**
	 * 編集モーダルを開く
	 */
	openEditModal(id) {
		const circles = Storage.getCircles();
		const circle = circles.find((c) => c.id === id);
		if (!circle) return;

		document.getElementById('editCircleId').value = circle.id;
		document.getElementById('editCircleName').value = circle.name;
		document.getElementById('editSpaceNumber').value = circle.space;
		document.getElementById('editCircleDay').value = circle.day;
		document.getElementById('editCircleGenre').value = circle.genre || '';
		document.getElementById('editCircleMemo').value = circle.memo || '';
		document.getElementById('editCirclePriority').value = circle.priority;

		document.getElementById('editModal').classList.remove('hidden');
	},

	/**
	 * 編集モーダルを閉じる
	 */
	closeEditModal() {
		document.getElementById('editModal').classList.add('hidden');
	},

	/**
	 * サークル編集
	 */
	handleEditCircle(e) {
		e.preventDefault();

		const id = document.getElementById('editCircleId').value;
		const updates = {
			name: document.getElementById('editCircleName').value.trim(),
			space: document.getElementById('editSpaceNumber').value.trim(),
			day: document.getElementById('editCircleDay').value,
			genre: document.getElementById('editCircleGenre').value.trim(),
			memo: document.getElementById('editCircleMemo').value.trim(),
			priority: document.getElementById('editCirclePriority').value,
		};

		Storage.updateCircle(id, updates);
		this.closeEditModal();
		this.showToast('サークルを更新しました');
		this.renderCircleList();
	},

	/**
	 * サークル削除
	 */
	handleDeleteCircle() {
		if (!confirm('このサークルを削除しますか？')) return;

		const id = document.getElementById('editCircleId').value;
		Storage.deleteCircle(id);
		this.closeEditModal();
		this.showToast('サークルを削除しました');
		this.renderCircleList();
	},

	/**
	 * データエクスポート
	 */
	exportData() {
		const data = Storage.exportData();
		const blob = new Blob([data], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = `c107_circles_${new Date().toISOString().slice(0, 10)}.json`;
		a.click();

		URL.revokeObjectURL(url);
		this.showToast('エクスポートしました');
	},

	/**
	 * データインポート
	 */
	importData(e) {
		const file = e.target.files[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			const result = Storage.importData(event.target.result);
			if (result.success) {
				this.showToast(`${result.imported}件のサークルをインポートしました`);
				this.renderCircleList();
			} else {
				this.showToast(`インポートに失敗しました: ${result.error}`);
			}
		};
		reader.readAsText(file);
		e.target.value = '';
	},

	/**
	 * 全データ削除
	 */
	clearAllData() {
		if (!confirm('全てのデータを削除しますか？この操作は取り消せません。')) return;
		if (!confirm('本当に削除しますか？')) return;

		Storage.clearAll();
		this.showToast('全データを削除しました');
		this.renderCircleList();
	},

	/**
	 * オンライン状態更新
	 */
	updateOnlineStatus() {
		const status = document.getElementById('onlineStatus');
		if (status) {
			if (navigator.onLine) {
				status.innerHTML = '<svg class="icon icon-sm"><use href="#icon-wifi"/></svg> オンライン';
				status.classList.remove('offline');
			} else {
				status.innerHTML = '<svg class="icon icon-sm"><use href="#icon-wifi-off"/></svg> オフライン';
				status.classList.add('offline');
			}
		}
	},

	/**
	 * キャッシュ状態確認
	 */
	async checkCacheStatus() {
		const status = document.getElementById('cacheStatus');
		if (!status) return;

		if ('caches' in window) {
			try {
				const cacheNames = await caches.keys();
				if (cacheNames.length > 0) {
					status.textContent = 'キャッシュ状態: ✅ オフライン対応済み';
				} else {
					status.textContent = 'キャッシュ状態: ⏳ 準備中...';
				}
			} catch (e) {
				status.textContent = 'キャッシュ状態: ❌ エラー';
			}
		} else {
			status.textContent = 'キャッシュ状態: ⚠️ 非対応ブラウザ';
		}
	},

	/**
	 * アプリを強制更新（キャッシュクリア＋リロード）
	 */
	async forceUpdate() {
		if (!confirm('アプリを最新版に更新します。\nページが再読み込みされます。よろしいですか？')) {
			return;
		}

		this.showToast('更新中...');

		try {
			// Service Workerの登録を解除
			if ('serviceWorker' in navigator) {
				const registrations = await navigator.serviceWorker.getRegistrations();
				for (const reg of registrations) {
					await reg.unregister();
				}
			}

			// すべてのキャッシュを削除
			if ('caches' in window) {
				const cacheNames = await caches.keys();
				await Promise.all(cacheNames.map((name) => caches.delete(name)));
			}

			// 少し待ってからリロード（キャッシュなしで取得）
			setTimeout(() => {
				location.reload();
			}, 500);
		} catch (e) {
			console.error('Force update failed:', e);
			this.showToast('更新に失敗しました');
		}
	},

	/**
	 * トースト表示
	 */
	showToast(message) {
		const toast = document.getElementById('toast');
		if (!toast) return;

		toast.textContent = message;
		toast.classList.remove('hidden');

		setTimeout(() => {
			toast.classList.add('hidden');
		}, 2500);
	},

	/**
	 * HTMLエスケープ
	 */
	escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	},

	/**
	 * URLハッシュからデータを読み込み
	 */
	loadFromURLHash() {
		const circles = Sync.loadFromHash();
		if (circles && circles.length > 0) {
			if (confirm(`URLから${circles.length}件のサークルデータが検出されました。\n読み込みますか？`)) {
				const existing = Storage.getCircles();
				if (existing.length > 0) {
					if (
						confirm(
							`現在${existing.length}件のサークルが登録されています。\n統合しますか？\n\n「OK」= 統合する / 「キャンセル」= 上書きする`,
						)
					) {
						// 統合
						const existingIds = new Set(existing.map((c) => c.id));
						const newCircles = circles.filter((c) => !existingIds.has(c.id));
						Storage.saveCircles([...existing, ...newCircles]);
						this.showToast(`${newCircles.length}件のサークルを追加しました`);
					} else {
						// 上書き
						Storage.saveCircles(circles);
						this.showToast(`${circles.length}件のサークルを読み込みました`);
					}
				} else {
					Storage.saveCircles(circles);
					this.showToast(`${circles.length}件のサークルを読み込みました`);
				}
				this.renderCircleList();
				// ハッシュをクリア
				window.history.replaceState(null, '', window.location.pathname);
			}
		}
	},

	/**
	 * QRコード共有
	 */
	showShareQR() {
		const size = Sync.getDataSize();
		const url = Sync.generateShareURL();

		// URL長さチェック
		if (url.length > 2000) {
			this.showToast('⚠️ データ量が多すぎます。「コードで共有」を使用してください');
			return;
		}

		document.getElementById('syncInfo').textContent = `${size.circles}件のサークルデータ (${size.humanReadable})`;

		const qrImage = document.getElementById('qrImage');
		qrImage.src = Sync.generateQRCode(url);

		document.getElementById('syncQRModal').classList.remove('hidden');
	},

	/**
	 * URL共有
	 */
	showShareURL() {
		const size = Sync.getDataSize();
		const url = Sync.generateShareURL();

		// URL長さチェック
		if (url.length > 2000) {
			this.showToast('⚠️ データ量が多すぎます。「コードで共有」を使用してください');
			return;
		}

		document.getElementById('syncURLInfo').textContent = `${size.circles}件のサークルデータ (${size.humanReadable})`;
		document.getElementById('shareURLText').value = url;

		document.getElementById('syncURLModal').classList.remove('hidden');
	},

	/**
	 * コード共有
	 */
	showShareCode() {
		const size = Sync.getDataSize();
		const code = Sync.encodeData();

		document.getElementById('syncCodeInfo').textContent = `${size.circles}件のサークルデータ (${size.humanReadable})`;
		document.getElementById('shareCodeText').value = code;

		document.getElementById('syncCodeModal').classList.remove('hidden');
	},

	/**
	 * コード読み込みモーダルを表示
	 */
	showImportCode() {
		document.getElementById('importCodeText').value = '';
		document.getElementById('importCodeModal').classList.remove('hidden');
	},

	/**
	 * コードからインポート実行
	 */
	executeImport() {
		let input = document.getElementById('importCodeText').value.trim();

		if (!input) {
			this.showToast('コードまたはURLを入力してください');
			return;
		}

		// URLの場合はハッシュ部分のみ抽出
		if (input.startsWith('http')) {
			const hashIndex = input.indexOf('#');
			if (hashIndex !== -1) {
				input = input.substring(hashIndex + 1);
			} else {
				this.showToast('無効なURLです');
				return;
			}
		}

		const result = Sync.importData(input);

		if (result.success) {
			this.showToast(`${result.imported}件のサークルを${result.mode}しました`);
			this.renderCircleList();
			document.getElementById('importCodeModal').classList.add('hidden');
		} else {
			this.showToast(`エラー: ${result.error}`);
		}
	},

	/**
	 * URLをクリップボードにコピー
	 */
	async copyShareURL() {
		const url = document.getElementById('shareURLText').value;
		const success = await Sync.copyToClipboard(url);
		this.showToast(success ? 'URLをコピーしました' : 'コピーに失敗しました');
	},

	/**
	 * コードをクリップボードにコピー
	 */
	async copyShareCode() {
		const code = document.getElementById('shareCodeText').value;
		const success = await Sync.copyToClipboard(code);
		this.showToast(success ? 'コードをコピーしました' : 'コピーに失敗しました');
	},

	/**
	 * マップ管理リストを更新
	 */
	async updateMapManagementList() {
		const container = document.getElementById('mapManagementList');
		if (!container) return;

		const areas = [
			{ key: 'e456', name: '東4-6ホール' },
			{ key: 'e78', name: '東7-8ホール' },
			{ key: 'w', name: '西1-4ホール' },
			{ key: 's', name: '南1-4ホール' },
		];

		container.innerHTML = '';

		for (const area of areas) {
			const row = document.createElement('div');
			row.className = 'map-management-item';

			const label = document.createElement('span');
			label.className = 'map-area-name';
			label.textContent = area.name;

			const status = document.createElement('span');
			status.className = 'map-status';

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'map-delete-btn';
			deleteBtn.textContent = '削除';
			deleteBtn.dataset.areaKey = area.key;
			deleteBtn.dataset.areaName = area.name;

			// カスタムマップの有無を確認
			let hasCustomMap = false;
			let pageInfo = '';

			try {
				if (Storage.MapData) {
					const pageCount = await Storage.MapData.getPageCount(area.key);
					if (pageCount > 0) {
						hasCustomMap = true;
						pageInfo = `（${pageCount}ページ）`;
					} else {
						const blob = await Storage.MapData.getImage(area.key);
						if (blob) {
							hasCustomMap = true;
							pageInfo = '（単一画像）';
						}
					}
				}
			} catch (e) {
				console.error('Failed to check map:', e);
			}

			if (hasCustomMap) {
				status.textContent = `✅ カスタム${pageInfo}`;
				status.classList.add('custom');
				deleteBtn.classList.remove('hidden');
				deleteBtn.onclick = () => this.deleteMapFromSettings(area.key, area.name);
			} else {
				status.textContent = '📍 デフォルト';
				status.classList.add('default');
				deleteBtn.classList.add('hidden');
			}

			row.appendChild(label);
			row.appendChild(status);
			row.appendChild(deleteBtn);
			container.appendChild(row);
		}
	},

	/**
	 * 設定画面からマップを削除
	 */
	async deleteMapFromSettings(areaKey, areaName) {
		if (!confirm(`${areaName}のカスタムマップを削除しますか？`)) return;

		try {
			if (Storage.MapData) {
				await Storage.MapData.deleteAllPages(areaKey);
				this.showToast(`${areaName}のマップを削除しました`);
				this.updateMapManagementList();
			}
		} catch (e) {
			console.error('Failed to delete map:', e);
			this.showToast('削除に失敗しました');
		}
	},

	/**
	 * すべてのマップデータをリセット
	 */
	async resetAllMaps() {
		if (!confirm('すべてのカスタムマップデータを削除しますか？\nこの操作は取り消せません。')) return;

		try {
			// IndexedDBのマップデータベースを完全に削除
			await new Promise((resolve, reject) => {
				const request = indexedDB.deleteDatabase('c107_maps');
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
				request.onblocked = () => {
					console.warn('Database deletion blocked');
					resolve();
				};
			});

			this.showToast('すべてのマップデータを削除しました');
			this.updateMapManagementList();

			// マップビューアをリロード
			if (typeof MapViewer !== 'undefined') {
				MapViewer.loadMap(MapViewer.currentMapKey);
			}
		} catch (e) {
			console.error('Failed to reset all maps:', e);
			this.showToast('リセットに失敗しました');
		}
	},
};

// アプリ初期化
document.addEventListener('DOMContentLoaded', () => App.init());
