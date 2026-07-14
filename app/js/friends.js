/**
 * 友達管理モジュール
 * QRコード共有・スキャン、友達一覧・詳細表示
 */
const Friends = {
	STORAGE_KEY: 'C108_friends',
	QR_EXPIRY_MS: 5 * 60 * 1000,

	friends: [],
	_scanning: false,
	_scanLoopId: null,

	init() {
		this.load();
		this.bindEvents();
		this.renderFriendsList();
	},

	load() {
		try {
			const data = localStorage.getItem(this.STORAGE_KEY);
			this.friends = data ? JSON.parse(data) : [];
		} catch (e) {
			this.friends = [];
		}
	},

	save() {
		localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.friends));
	},

	_encode(obj) {
		return btoa(encodeURIComponent(JSON.stringify(obj)));
	},

	_decode(str) {
		return JSON.parse(decodeURIComponent(atob(str)));
	},

	generateShareURL() {
		const data = {
			v: 1,
			exp: Date.now() + this.QR_EXPIRY_MS,
			circles: Storage.getCircles(),
		};
		const encoded = this._encode(data);
		return `${location.origin}${location.pathname}#friend=${encoded}`;
	},

	decodeFriendData(encoded) {
		try {
			const data = this._decode(encoded);
			if (!data || !data.circles || !data.exp || data.v !== 1) return null;
			return data;
		} catch (e) {
			return null;
		}
	},

	addFriend(data) {
		const friend = {
			id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
			name: data.name || '友達',
			circles: data.circles || [],
			addedAt: new Date().toISOString(),
		};
		this.friends.push(friend);
		this.save();
		return friend;
	},

	deleteFriend(id) {
		if (!confirm('この友達を削除しますか？')) return;
		this.friends = this.friends.filter((f) => f.id !== id);
		this.save();
		if (this.currentFriendId === id) this.showFriendsList();
		else this.renderFriendsList();
	},

	_defaultName() {
		const now = new Date();
		return `友達 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
	},

	// === 共有 ===
	shareList() {
		const circles = Storage.getCircles();
		if (circles.length === 0) {
			App.showToast('サークルが登録されていません', 1);
			return;
		}
		const size = JSON.stringify(circles).length;
		if (size > 50000) {
			App.showToast('データ量が多すぎます（50KB以内推奨）', 2);
			return;
		}

		const url = this.generateShareURL();
		if (url.length > 4000) {
			App.showToast('データ量が多すぎます', 2);
			return;
		}

		const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(url)}`;
		document.getElementById('shareQRImage').src = qrSrc;

		const expiry = new Date(Date.now() + this.QR_EXPIRY_MS);
		document.getElementById('shareExpiryInfo').textContent =
			`このQRコードは5分間（${String(expiry.getHours()).padStart(2, '0')}:${String(expiry.getMinutes()).padStart(2, '0')}まで）有効です`;

		document.getElementById('shareModal').classList.remove('hidden');

		setTimeout(() => {
			document.getElementById('shareModal').classList.add('hidden');
			App.showToast('QRコードの有効期限が切れました', 0);
		}, this.QR_EXPIRY_MS);
	},

	// === リアルタイムカメラスキャン ===
	async startCameraScanner() {
		if (!navigator.mediaDevices?.getUserMedia) {
			App.showToast('カメラに対応していません', 2);
			return;
		}

		const view = document.getElementById('cameraView');
		const video = document.getElementById('cameraVideo');
		const status = document.getElementById('cameraStatus');
		view.classList.remove('hidden');
		status.textContent = 'カメラを起動しています...';

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
				audio: false,
			});
			video.srcObject = stream;
			await video.play();

			status.textContent = 'QRコードを枠内に収めてください';
			this._scanning = true;
			this._scanLoop();
		} catch (err) {
			console.error('Camera error:', err);
			view.classList.add('hidden');
			App.showToast('カメラにアクセスできません', 2);
		}
	},

	stopCameraScanner() {
		this._scanning = false;
		if (this._scanLoopId) {
			clearTimeout(this._scanLoopId);
			this._scanLoopId = null;
		}

		const video = document.getElementById('cameraVideo');
		if (video.srcObject) {
			video.srcObject.getTracks().forEach((t) => t.stop());
			video.srcObject = null;
		}

		document.getElementById('cameraView').classList.add('hidden');
	},

	_scanLoop() {
		if (!this._scanning) return;

		const video = document.getElementById('cameraVideo');
		const canvas = document.getElementById('cameraCanvas');
		const ctx = canvas.getContext('2d', { willReadFrequently: true });

		const tick = () => {
			if (!this._scanning) return;

			if (video.readyState >= video.HAVE_ENOUGH_DATA) {
				const w = 320;
				const h = Math.round((video.videoHeight / video.videoWidth) * w);
				canvas.width = w;
				canvas.height = h;
				ctx.drawImage(video, 0, 0, w, h);
				const imageData = ctx.getImageData(0, 0, w, h);

				try {
					const result = jsQR.default(imageData.data, w, h, {
						inversionAttempts: 'dontInvert',
					});
					if (result?.data) {
						this._scanning = false;
						this._handleDetectedQR(result.data);
						return;
					}
				} catch (e) {
					// ignore decode errors, keep scanning
				}
			}

			this._scanLoopId = setTimeout(tick, 250);
		};

		this._scanLoopId = setTimeout(tick, 300);
	},

	_handleDetectedQR(text) {
		this.stopCameraScanner();

		try {
			const hashIndex = text.indexOf('#');
			if (hashIndex === -1) throw new Error('無効なデータです');
			const hash = text.slice(hashIndex + 1);
			if (!hash.startsWith('friend=')) throw new Error('無効なデータです');

			const data = this.decodeFriendData(hash.slice('friend='.length));
			if (!data) throw new Error('データの解析に失敗しました');
			if (Date.now() > data.exp) throw new Error('QRコードの有効期限が切れています');

			const name = prompt(
				`${data.circles.length}件のサークルを受け取りました。\n友達の名前を入力してください`,
				this._defaultName(),
			);
			if (name === null) return;
			this.addFriend({ name: name || '友達', circles: data.circles });
			this.renderFriendsList();
			App.showToast('友達を追加しました', 0);
		} catch (err) {
			App.showToast(err.message, 2);
		}
	},

	// === 画像アップロード（フォールバック） ===
	async processQRImage(file) {
		const img = await new Promise((resolve, reject) => {
			const el = new Image();
			el.onload = () => resolve(el);
			el.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
			el.src = URL.createObjectURL(file);
		});

		const canvas = document.createElement('canvas');
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(img, 0, 0);
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		URL.revokeObjectURL(img.src);

		const result = jsQR.default(imageData.data, imageData.width, imageData.height);
		if (!result) throw new Error('QRコードを読み取れませんでした');
		return result.data;
	},

	async handleQRScanFromFile(file) {
		const text = await this.processQRImage(file);
		this._handleDetectedQR(text);
	},

	// === 友達一覧 ===
	renderFriendsList() {
		const el = document.getElementById('friendsList');
		if (!el) return;

		if (this.friends.length === 0) {
			el.innerHTML = '<p class="empty-message">友達がまだ登録されていません</p>';
			return;
		}

		el.innerHTML = this.friends
			.map(
				(f) => `
			<div class="friend-item" data-id="${f.id}">
				<div class="friend-item-info">
					<div class="friend-item-name">${App.escapeHtml(f.name)}</div>
					<div class="friend-item-meta">${f.circles.length}件のサークル</div>
				</div>
				<button class="friend-delete-btn" data-id="${f.id}">削除</button>
			</div>`,
			)
			.join('');

		el.querySelectorAll('.friend-item').forEach((item) => {
			item.addEventListener('click', (e) => {
				if (e.target.closest('.friend-delete-btn')) return;
				this.showFriendDetail(item.dataset.id);
			});
		});
		el.querySelectorAll('.friend-delete-btn').forEach((btn) => {
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.deleteFriend(btn.dataset.id);
			});
		});
	},

	showFriendDetail(id) {
		const friend = this.friends.find((f) => f.id === id);
		if (!friend) return;
		this.currentFriendId = id;

		document.getElementById('friendsListView').classList.add('hidden');
		document.getElementById('friendDetailView').classList.remove('hidden');
		document.getElementById('friendDetailName').textContent = friend.name;
		this._renderFriendCircles(friend);
	},

	_renderFriendCircles(friend) {
		const container = document.getElementById('friendCircleList');
		if (!container) return;

		const circles = friend.circles || [];
		if (circles.length === 0) {
			container.innerHTML = '<p class="empty-message">サークルがありません</p>';
			return;
		}

		container.innerHTML = circles
			.map(
				(c) => `
			<div class="circle-card">
				<div class="circle-header">
					<span class="circle-name">${App.escapeHtml(c.name)}</span>
					<span class="circle-space">${App.escapeHtml(c.space)}</span>
				</div>
				<div class="circle-info">
					<span>${c.day === '1' ? '1日目' : '2日目'}</span>
					${c.genre ? `<span>${App.escapeHtml(c.genre)}</span>` : ''}
				</div>
				${c.memo ? `<div class="circle-memo">${App.escapeHtml(c.memo)}</div>` : ''}
			</div>`,
			)
			.join('');
	},

	showFriendsList() {
		document.getElementById('friendsListView').classList.remove('hidden');
		document.getElementById('friendDetailView').classList.add('hidden');
		this.currentFriendId = null;
		this.renderFriendsList();
	},

	importFromHash(encoded) {
		const data = this.decodeFriendData(encoded);
		if (!data) {
			App.showToast('無効なデータです', 2);
			return;
		}
		if (Date.now() > data.exp) {
			App.showToast('QRコードの有効期限が切れています', 2);
			return;
		}

		const name = prompt('友達の名前を入力してください', this._defaultName());
		if (name === null) return;
		this.addFriend({ name: name || '友達', circles: data.circles });
		this.renderFriendsList();
		App.showToast('友達を追加しました', 0);
	},

	// === イベントバインド ===
	bindEvents() {
		const scanBtn = document.getElementById('scanQRBtn');
		const scanInput = document.getElementById('qrScanInput');

		if (scanBtn) {
			scanBtn.addEventListener('click', () => this.startCameraScanner());
		}

		if (scanInput) {
			scanInput.addEventListener('change', async (e) => {
				const file = e.target.files[0];
				if (!file) return;
				scanInput.value = '';
				try {
					await this.handleQRScanFromFile(file);
				} catch (err) {
					App.showToast(err.message, 2);
				}
			});
		}

		const closeCameraBtn = document.getElementById('cameraCloseBtn');
		if (closeCameraBtn) {
			closeCameraBtn.addEventListener('click', () => this.stopCameraScanner());
		}

		const cameraGalleryBtn = document.getElementById('cameraGalleryBtn');
		if (cameraGalleryBtn) {
			cameraGalleryBtn.addEventListener('click', () => {
				this.stopCameraScanner();
				if (scanInput) scanInput.click();
			});
		}

		const shareBtn = document.getElementById('shareListBtn');
		if (shareBtn) {
			shareBtn.addEventListener('click', () => this.shareList());
		}

		const backBtn = document.getElementById('backToFriendsList');
		if (backBtn) {
			backBtn.addEventListener('click', () => this.showFriendsList());
		}

		const closeModal = document.getElementById('closeShareModal');
		if (closeModal) {
			closeModal.addEventListener('click', () =>
				document.getElementById('shareModal').classList.add('hidden'),
			);
		}
		const shareModal = document.getElementById('shareModal');
		if (shareModal) {
			shareModal.addEventListener('click', (e) => {
				if (e.target === shareModal) shareModal.classList.add('hidden');
			});
		}
	},
};
