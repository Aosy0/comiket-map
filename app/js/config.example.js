const CONFIG = {
	GEMINI_API_KEY: 'YOUR_API_KEY_HERE',
	// チャットWebSocketサーバーのURL
	// 本番環境(cmap.aosy.f5.si)では自動設定されるためnullでOK
	// カスタムドメインの場合: 'wss://YOUR_DOMAIN/ws'
	// ローカル開発: null（自動で ws://hostname:3001）
	CHAT_WS_URL: null,
};
