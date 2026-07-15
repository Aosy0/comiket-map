/**
 * 友達管理モジュール
 * QRコード共有・スキャン、友達一覧・詳細表示、チャット
 */
const Friends = {
	STORAGE_KEY: 'C108_friends',
	QR_EXPIRY_MS: 5 * 60 * 1000,
	WS_URL: (() => {
		if (typeof CONFIG !== 'undefined' && CONFIG.CHAT_WS_URL) return CONFIG.CHAT_WS_URL;
		if (location.hostname === 'cmap.aosy.f5.si') return `wss://${location.hostname}/ws`;
		return `ws://${location.hostname}:3001`;
	})(),

	friends: [],
	_scanning: false,
	_scanLoopId: null,

	// チャット状態
	_chatWs: null,
	_chatFriendId: null,
	_chatMessages: {}, // friendId -> [{name, text, timestamp, isMine}]

	// 共有用WebSocket（QR生成・スキャン時に相互友達登録）
	_shareWs: null,
	_shareRoomId: null,
	_shareMyName: null,

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
		const base64 = btoa(encodeURIComponent(JSON.stringify(obj)));
		return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	},

	_decode(str) {
		let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
		const r = base64.length % 4;
		if (r === 2) base64 += '==';
		else if (r === 3) base64 += '=';
		return JSON.parse(decodeURIComponent(atob(base64)));
	},

	_generateRoomId() {
		return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
	},

	/**
	 * 共有URLを生成（QRコード用）
	 * 自分の名前を入力させ、ルームIDを発行する
	 */
	generateShareURL() {
		const circles = Storage.getCircles();
		console.log('[ChatDebug] circles count:', circles.length);
		if (circles.length === 0) {
			App.showToast('サークルが登録されていません', 1);
			return null;
		}

		const defaultName = this._defaultMyName();
		const myName = prompt(
			`${circles.length}件のサークルを共有します。\n相手に表示されるあなたの名前を入力してください。`,
			defaultName,
		);
		console.log('[ChatDebug] prompt result:', myName);
		if (myName === null) return null;

		const roomId = this._generateRoomId();
		const finalName = myName.trim() || defaultName;
		const data = {
			v: 1,
			exp: Date.now() + this.QR_EXPIRY_MS,
			name: finalName,
			roomId,
			circles,
		};
		const encoded = this._encode(data);
		const url = `${location.origin}${location.pathname}#friend=${encoded}`;
		console.log('[ChatDebug] generated URL length:', url.length);

		// WebSocket接続用に保存
		this._pendingShareRoomId = roomId;
		this._pendingShareName = finalName;

		return url;
	},

	_defaultMyName() {
		const now = new Date();
		return `名無し${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
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

	/**
	 * 友達を追加
	 * @param {Object} data - { name, circles, roomId, myName }
	 */
	addFriend(data) {
		const friend = {
			id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
			name: data.name || '友達',
			myName: data.myName || '',
			roomId: data.roomId || '',
			circles: data.circles || [],
			addedAt: new Date().toISOString(),
		};
		this.friends.push(friend);
		this.save();
		return friend;
	},

	deleteFriend(id) {
		if (!confirm('この友達を削除しますか？')) return;
		this.closeChat();
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
	_countdownIntervalId: null,

	_startCountdown(endTime) {
		this._stopCountdown();
		const el = document.getElementById('shareCountdown');
		if (!el) return;

		const tick = () => {
			const remaining = endTime - Date.now();
			if (remaining <= 0) {
				el.textContent = '期限切れ';
				this._stopCountdown();
				return;
			}
			const m = Math.floor(remaining / 60000);
			const s = Math.floor((remaining % 60000) / 1000);
			el.textContent = `残り ${m}:${String(s).padStart(2, '0')}`;
		};
		tick();
		this._countdownIntervalId = setInterval(tick, 1000);
	},

	_stopCountdown() {
		if (this._countdownIntervalId) {
			clearInterval(this._countdownIntervalId);
			this._countdownIntervalId = null;
		}
	},

	// 共有用WebSocket接続（QR生成・スキャン時に相互友達登録）
	_connectShareWs(roomId, name) {
		this._disconnectShareWs();
		this._shareRoomId = roomId;
		this._shareMyName = name;

		try {
			const ws = new WebSocket(this.WS_URL);
			this._shareWs = ws;

			ws.onopen = () => {
				ws.send(JSON.stringify({ type: 'join', roomId, name }));
			};

			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data);
					this._onShareMessage(msg);
				} catch (e) {
					console.error('Share message parse error:', e);
				}
			};

			ws.onclose = () => {
				this._shareWs = null;
			};
		} catch (e) {
			console.error('Share WebSocket error:', e);
		}
	},

	_disconnectShareWs() {
		if (this._shareWs) {
			try {
				this._shareWs.close();
			} catch (e) {}
			this._shareWs = null;
		}
		this._shareRoomId = null;
		this._shareMyName = null;
	},

	_onShareMessage(msg) {
		switch (msg.type) {
			case 'user-joined': {
				const peerName = msg.name;
				if (!peerName || peerName === this._shareMyName) return;
				if (!this._shareRoomId) return;

				const existing = this.friends.find(
					(f) => f.name === peerName && f.roomId === this._shareRoomId,
				);
				if (existing) return;

				this.addFriend({
					name: peerName,
					myName: this._shareMyName || '',
					roomId: this._shareRoomId,
					circles: [],
				});
				this.renderFriendsList();
				App.showToast(`「${peerName}」が友達に追加されました`, 0);
				break;
			}
		}
	},

	shareList() {
		const url = this.generateShareURL();
		if (!url) return;

		if (url.length > 4000) {
			App.showToast('データ量が多すぎます', 2);
			return;
		}

		console.log('[ChatDebug] Share URL:', url);
		const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}`;
		document.getElementById('shareQRImage').src = qrSrc;

		const expiryTime = Date.now() + this.QR_EXPIRY_MS;
		const expiry = new Date(expiryTime);
		document.getElementById('shareExpiryInfo').textContent =
			`このQRコードは5分間（${String(expiry.getHours()).padStart(2, '0')}:${String(expiry.getMinutes()).padStart(2, '0')}まで）有効です`;

		document.getElementById('shareModal').classList.remove('hidden');
		this._startCountdown(expiryTime);

		// QRコードをスキャンした相手と自動で友達登録するためのWebSocket接続
		if (this._pendingShareRoomId && this._pendingShareName) {
			this._connectShareWs(this._pendingShareRoomId, this._pendingShareName);
		}

		setTimeout(() => {
			document.getElementById('shareModal').classList.add('hidden');
			this._stopCountdown();
			this._disconnectShareWs();
			App.showToast('QRコードの有効期限が切れました', 0);
		}, this.QR_EXPIRY_MS);
	},

	// === リアルタイムカメラスキャン ===
	async startCameraScanner() {
		console.log('[ChatDebug] startCameraScanner called');

		if (!navigator.mediaDevices?.getUserMedia) {
			console.error('[ChatDebug] getUserMedia not supported');
			App.showToast('カメラに対応していません', 2);
			return;
		}

		const view = document.getElementById('cameraView');
		const video = document.getElementById('cameraVideo');
		const status = document.getElementById('cameraStatus');
		view.classList.remove('hidden');
		status.textContent = 'カメラを起動しています...';

		try {
			console.log('[ChatDebug] Requesting camera access...');
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
				audio: false,
			});
			console.log('[ChatDebug] Camera stream obtained:', stream.getVideoTracks().length, 'tracks');
			video.srcObject = stream;
			await video.play();
			console.log('[ChatDebug] Video playing, dimensions:', video.videoWidth, 'x', video.videoHeight);

			status.textContent = 'QRコードを枠内に収めてください';
			this._scanning = true;
			console.log('[ChatDebug] Starting scan loop, jsQR type:', typeof jsQR);
			this._scanLoop();
		} catch (err) {
			console.error('[ChatDebug] Camera error:', err);
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
		if (video && video.srcObject) {
			video.srcObject.getTracks().forEach((t) => t.stop());
			video.srcObject = null;
		}

		const cameraView = document.getElementById('cameraView');
		if (cameraView) cameraView.classList.add('hidden');
	},

	_scanLoop() {
		if (!this._scanning) return;

		if (typeof jsQR === 'undefined') {
			console.error('[ChatDebug] jsQR library not loaded');
			App.showToast('QR読み取りライブラリが読み込めません', 2);
			this._scanning = false;
			return;
		}

		console.log('[ChatDebug] _scanLoop started, jsQR:', typeof jsQR, 'default:', typeof jsQR.default);

		const video = document.getElementById('cameraVideo');
		const canvas = document.getElementById('cameraCanvas');
		const ctx = canvas.getContext('2d', { willReadFrequently: true });

		let frameCount = 0;

		const tick = () => {
			if (!this._scanning) return;

			frameCount++;

			if (video.readyState >= video.HAVE_ENOUGH_DATA) {
				const w = 640;
				const h = Math.round((video.videoHeight / video.videoWidth) * w);
				canvas.width = w;
				canvas.height = h;
				ctx.drawImage(video, 0, 0, w, h);
				const imageData = ctx.getImageData(0, 0, w, h);

				try {
					const jsQRFunc = typeof jsQR === 'function' ? jsQR : jsQR.default;
					if (frameCount <= 5) {
						console.log('[ChatDebug] Frame', frameCount, '- trying jsQR, func type:', typeof jsQRFunc);
					}
					const result = jsQRFunc(imageData.data, w, h, {
						inversionAttempts: 'attemptBoth',
					});
					if (result?.data) {
						console.log('[ChatDebug] QR detected:', result.data);
						this._scanning = false;
						this._handleDetectedQR(result.data);
						return;
					}
				} catch (e) {
					console.error('[ChatDebug] QR decode error:', e);
				}
			} else {
				if (frameCount <= 5) {
					console.log('[ChatDebug] Frame', frameCount, '- video not ready, readyState:', video.readyState);
				}
			}

			this._scanLoopId = setTimeout(tick, 250);
		};

		this._scanLoopId = setTimeout(tick, 300);
	},

	_handleDetectedQR(text) {
		console.log('[ChatDebug] _handleDetectedQR called with:', text);

		try {
			this.stopCameraScanner();
			const hashIndex = text.indexOf('#');
			console.log('[ChatDebug] hashIndex:', hashIndex);
			if (hashIndex === -1) throw new Error('無効なデータです');
			const hash = text.slice(hashIndex + 1);
			console.log('[ChatDebug] hash:', hash);
			if (!hash.startsWith('friend=')) throw new Error('無効なデータです');

			const data = this.decodeFriendData(hash.slice('friend='.length));
			console.log('[ChatDebug] decoded data:', data);
			if (!data) throw new Error('データの解析に失敗しました');
			if (Date.now() > data.exp) throw new Error('QRコードの有効期限が切れています');

			// data.name が送信者の名前、data.roomId がチャットルームID
			const peerName = data.name || '友達';
			const defaultName = `名無し${String(new Date().getHours()).padStart(2, '0')}${String(new Date().getMinutes()).padStart(2, '0')}`;
			const myName = prompt(
				`「${peerName}」から${data.circles.length}件のサークルを受け取りました。\nあなたの名前を入力してください（相手に表示されます）`,
				defaultName,
			);
			console.log('[ChatDebug] prompt result:', myName);
			if (myName === null) return;

			this.addFriend({
				name: peerName,
				myName: myName.trim() || defaultName,
				roomId: data.roomId || '',
				circles: data.circles,
			});
			this.renderFriendsList();
			App.showToast(`「${peerName}」を友達に追加しました`, 0);

			// 相手に自分が参加したことを通知（相互友達登録）
			if (data.roomId) {
				this._connectShareWs(data.roomId, myName.trim() || defaultName);
			}
		} catch (err) {
			console.error('[ChatDebug] error:', err);
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

		const tryDecode = (width, height) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			ctx.drawImage(img, 0, 0, width, height);
			const imageData = ctx.getImageData(0, 0, width, height);
			const jsQRFunc = typeof jsQR === 'function' ? jsQR : jsQR.default;
			return jsQRFunc(imageData.data, imageData.width, imageData.height, {
				inversionAttempts: 'attemptBoth',
			});
		};

		// 元のサイズで試行
		let result = tryDecode(img.naturalWidth, img.naturalHeight);

		// 失敗した場合、縮小して再試行（大きな画像はノイズが多く認識率が下がるため）
		if (!result && img.naturalWidth > 1200) {
			const scale = 1200 / img.naturalWidth;
			result = tryDecode(1200, Math.round(img.naturalHeight * scale));
		}
		if (!result && img.naturalWidth > 800) {
			const scale = 800 / img.naturalWidth;
			result = tryDecode(800, Math.round(img.naturalHeight * scale));
		}

		URL.revokeObjectURL(img.src);

		if (!result) throw new Error('QRコードを読み取れませんでした');
		return result.data;
	},

	async handleQRScanFromFile(file) {
		console.log('[ChatDebug] handleQRScanFromFile called');
		try {
			const text = await this.processQRImage(file);
			console.log('[ChatDebug] QR text extracted:', text);
			this._handleDetectedQR(text);
		} catch (err) {
			console.error('[ChatDebug] QR scan error:', err);
			App.showToast(err.message, 2);
		}
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
					<div class="friend-item-meta">${f.circles.length}件のサークル${f.roomId ? ' • チャット可' : ''}</div>
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

	// === 友達詳細 ===
	showFriendDetail(id) {
		const friend = this.friends.find((f) => f.id === id);
		if (!friend) return;
		this.currentFriendId = id;

		document.getElementById('friendsListView').classList.add('hidden');
		document.getElementById('friendDetailView').classList.remove('hidden');
		document.getElementById('friendDetailName').textContent = friend.name;

		// チャットセクションの表示/非表示
		const chatSection = document.getElementById('friendChatSection');
		const chatHeaderBtn = document.getElementById('openChatBtn');
		if (friend.roomId) {
			if (chatSection) chatSection.classList.remove('hidden');
			if (chatHeaderBtn) chatHeaderBtn.classList.remove('hidden');
		} else {
			if (chatSection) chatSection.classList.add('hidden');
			if (chatHeaderBtn) chatHeaderBtn.classList.add('hidden');
		}

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
		this.closeChat();
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

		const peerName = data.name || '友達';
		const defaultName = `名無し${String(new Date().getHours()).padStart(2, '0')}${String(new Date().getMinutes()).padStart(2, '0')}`;
		const myName = prompt(
			`「${peerName}」から${data.circles.length}件のサークルを受け取りました。\nあなたの名前を入力してください（相手に表示されます）`,
			defaultName,
		);
		if (myName === null) return;

		this.addFriend({
			name: peerName,
			myName: myName.trim() || defaultName,
			roomId: data.roomId || '',
			circles: data.circles,
		});
		this.renderFriendsList();
		App.showToast(`「${peerName}」を友達に追加しました`, 0);

		// 相手に自分が参加したことを通知（相互友達登録）
		if (data.roomId) {
			this._connectShareWs(data.roomId, myName.trim() || defaultName);
		}
	},

	// ================================================================
	//  チャット機能
	// ================================================================

	/**
	 * チャット画面を開く
	 */
	openChat(friendId) {
		const friend = this.friends.find((f) => f.id === friendId);
		if (!friend || !friend.roomId) return;

		this._chatFriendId = friendId;
		if (!this._chatMessages[friendId]) {
			this._chatMessages[friendId] = [];
		}

		// チャットビューを表示
		document.getElementById('friendDetailView').classList.add('hidden');
		document.getElementById('chatView').classList.remove('hidden');

		// ヘッダーに相手の名前を設定
		document.getElementById('chatViewName').textContent = friend.name;

		// 接続状態を更新
		this._updateChatStatus('接続中...');

		// WebSocket接続
		this._connectChatWs(friend);

		// 過去のメッセージを表示
		this._renderChatMessages();

		// 入力欄をフォーカス
		const input = document.getElementById('chatInput');
		if (input) setTimeout(() => input.focus(), 300);
	},

	/**
	 * チャット画面を閉じる
	 */
	closeChat() {
		this._disconnectChatWs();
		this._chatFriendId = null;

		document.getElementById('chatView').classList.add('hidden');
		// friendDetailViewの表示状態は呼び出し元で制御
	},

	/**
	 * WebSocketに接続
	 */
	_connectChatWs(friend) {
		this._disconnectChatWs();

		try {
			const ws = new WebSocket(this.WS_URL);
			this._chatWs = ws;

			ws.onopen = () => {
				// ルームに参加
				ws.send(
					JSON.stringify({
						type: 'join',
						roomId: friend.roomId,
						name: friend.myName || '名無し',
					}),
				);
			};

			ws.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data);
					this._onChatMessage(msg);
				} catch (e) {
					console.error('Chat message parse error:', e);
				}
			};

			ws.onclose = () => {
				if (this._chatWs === ws) {
					this._updateChatStatus('オフライン');
					this._chatWs = null;
				}
			};

			ws.onerror = () => {
				this._updateChatStatus('接続エラー');
			};
		} catch (e) {
			console.error('WebSocket connection error:', e);
			this._updateChatStatus('接続エラー');
		}
	},

	/**
	 * WebSocket切断
	 */
	_disconnectChatWs() {
		if (this._chatWs) {
			try {
				this._chatWs.close();
			} catch (e) {
				// ignore
			}
			this._chatWs = null;
		}
	},

	/**
	 * WebSocketからのメッセージを処理
	 */
	_onChatMessage(msg) {
		const friendId = this._chatFriendId;
		if (!friendId) return;

		switch (msg.type) {
			case 'joined':
				this._updateChatStatus('接続済み');
				break;

			case 'peer-count':
				this._updateChatStatus(msg.peerCount >= 2 ? 'オンライン' : '待機中');
				break;

			case 'user-joined':
				this._updateChatStatus('オンライン');
				this._addMessageToCache(friendId, {
					name: '',
					text: `「${msg.name}」が参加しました`,
					timestamp: Date.now(),
					isMine: false,
					isSystem: true,
				});
				break;

			case 'user-left':
				this._updateChatStatus('相手が退出しました');
				this._addMessageToCache(friendId, {
					name: '',
					text: `「${msg.name}」が退出しました`,
					timestamp: Date.now(),
					isMine: false,
					isSystem: true,
				});
				break;

			case 'message': {
				const friend = this.friends.find((f) => f.id === friendId);
				const isMine = friend ? msg.name === friend.myName : false;
				this._addMessageToCache(friendId, {
					name: msg.name,
					text: msg.text,
					timestamp: msg.timestamp,
					isMine,
				});
				break;
			}

			case 'message-sent':
				// 自分の送信確認（既にキャッシュ済みなのでスキップ）
				break;

			case 'pong':
				break;

			case 'error':
				App.showToast(`チャットエラー: ${msg.message}`, 2);
				break;
		}
	},

	/**
	 * メッセージをキャッシュに追加してUIを更新
	 */
	_addMessageToCache(friendId, msg) {
		if (!this._chatMessages[friendId]) {
			this._chatMessages[friendId] = [];
		}
		this._chatMessages[friendId].push(msg);
		this._renderChatMessages();
	},

	/**
	 * チャットメッセージ一覧を描画
	 */
	_renderChatMessages() {
		const container = document.getElementById('chatMessages');
		if (!container) return;

		const friendId = this._chatFriendId;
		const messages = friendId ? this._chatMessages[friendId] || [] : [];

		if (messages.length === 0) {
			container.innerHTML = '<p class="chat-empty">メッセージはまだありません</p>';
			return;
		}

		container.innerHTML = messages
			.map((msg) => {
				if (msg.isSystem) {
					return `<div class="chat-system-msg">${App.escapeHtml(msg.text)}</div>`;
				}
				const bubbleClass = msg.isMine ? 'chat-bubble-mine' : 'chat-bubble-peer';
				const containerClass = msg.isMine ? 'chat-msg-mine' : 'chat-msg-peer';
				const nameHtml = msg.isMine ? '' : `<div class="chat-bubble-name">${App.escapeHtml(msg.name)}</div>`;
				const time = new Date(msg.timestamp);
				const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
				const wrappedText = this._wrapText(msg.text, 30)
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/\n/g, '<br>');

				return `
				<div class="chat-msg ${containerClass}">
					${nameHtml}
					<div class="chat-bubble ${bubbleClass}">
						<div class="chat-bubble-text">${wrappedText}</div>
					</div>
					<div class="chat-time">${timeStr}</div>
				</div>`;
			})
			.join('');

		// 最新メッセージにスクロール
		container.scrollTop = container.scrollHeight;
	},

	/**
	 * 吹き出しの1行あたりの文字数制限
	 */
	_wrapText(text, maxWidth) {
		const lines = [];
		for (const paragraph of text.split('\n')) {
			let line = '';
			let lineWidth = 0;
			for (const char of paragraph) {
				const charWidth = char.codePointAt(0) > 255 ? 2 : 1;
				if (lineWidth + charWidth > maxWidth) {
					lines.push(line);
					line = char;
					lineWidth = charWidth;
				} else {
					line += char;
					lineWidth += charWidth;
				}
			}
			lines.push(line);
		}
		return lines.join('\n');
	},

	/**
	 * チャットの接続状態を更新
	 */
	_updateChatStatus(text) {
		const el = document.getElementById('chatStatus');
		if (el) el.textContent = text;
	},

	/**
	 * メッセージを送信
	 */
	sendChatMessage() {
		const input = document.getElementById('chatInput');
		if (!input) return;

		const text = input.value.trim();
		if (!text) return;

		const friendId = this._chatFriendId;
		if (!friendId) return;

		const friend = this.friends.find((f) => f.id === friendId);
		if (!friend) return;

		if (!this._chatWs || this._chatWs.readyState !== WebSocket.OPEN) {
			App.showToast('チャットに接続されていません', 2);
			return;
		}

		// 自分のメッセージをすぐに表示（楽観的UI）
		this._addMessageToCache(friendId, {
			name: friend.myName || '名無し',
			text,
			timestamp: Date.now(),
			isMine: true,
		});

		// WebSocketで送信
		this._chatWs.send(JSON.stringify({ type: 'message', text }));

		input.value = '';
		input.focus();
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
			closeModal.addEventListener('click', () => {
				this._stopCountdown();
				document.getElementById('shareModal').classList.add('hidden');
			});
		}
		const shareModal = document.getElementById('shareModal');
		if (shareModal) {
			shareModal.addEventListener('click', (e) => {
				if (e.target === shareModal) {
					this._stopCountdown();
					shareModal.classList.add('hidden');
				}
			});
		}

		// === チャットイベント ===
		const openChat = () => {
			const friendId = this.currentFriendId;
			if (friendId) this.openChat(friendId);
		};
		const chatBtn = document.getElementById('openChatBtn');
		if (chatBtn) chatBtn.addEventListener('click', openChat);
		const chatBtn2 = document.getElementById('openChatBtn2');
		if (chatBtn2) chatBtn2.addEventListener('click', openChat);

		const chatBackBtn = document.getElementById('chatBackBtn');
		if (chatBackBtn) {
			chatBackBtn.addEventListener('click', () => {
				this.closeChat();
				const friendId = this.currentFriendId;
				if (friendId) {
					document.getElementById('friendDetailView').classList.remove('hidden');
				}
			});
		}

		const chatSendBtn = document.getElementById('chatSendBtn');
		if (chatSendBtn) {
			chatSendBtn.addEventListener('click', () => this.sendChatMessage());
		}

		const chatInput = document.getElementById('chatInput');
		if (chatInput) {
			chatInput.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					this.sendChatMessage();
				}
			});
		}
	},
};
