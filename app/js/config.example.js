const CONFIG = {
	GEMINI_API_KEY: 'YOUR_API_KEY_HERE',
	// チャットWebSocketサーバーのURL（デフォルト: 同じホストのポート3001）
	// Docker+Nginx構成の場合は相対パス: 'ws://YOUR_DOMAIN/ws'
	CHAT_WS_URL: null, // null = 自動（ws://hostname:3001）
};
