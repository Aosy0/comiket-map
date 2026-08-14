/**
 * Vite 開発サーバー設定
 *
 * - root: 'app'（現在のディレクトリ構造をそのまま配信）
 * - /api/gemini → Gemini API へのプロキシ（APIキーはサーバー側のみで保持）
 *
 * 使い方: npm run dev
 * → http://localhost:5173
 *
 * ※ WebSocketチャットサーバー（ws-server.mjs）は別プロセスで起動すること:
 *   node ws-server.mjs（ws://localhost:3001）
 *
 * セキュリティ:
 * - GEMINI_API_KEY は .env からサーバー側（この設定）でのみ読み込む
 * - VITE_ プレフィックスなしのためクライアント（import.meta.env）には公開されない
 * - 転送は x-goog-api-key ヘッダーで行い、URL にキーを含めない
 */
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const geminiApiKey = env.GEMINI_API_KEY ?? '';

	return {
		root: 'app',
		plugins: [
			{
				name: 'gemini-api-key-check',
				configureServer(server) {
					// キー未設定なら /api/gemini を 503 で遮断（dev-server.mjs と同等の挙動）
					server.middlewares.use('/api/gemini', (req, res, next) => {
						if (!geminiApiKey) {
							res.statusCode = 503;
							res.setHeader('Content-Type', 'application/json');
							res.end(
								JSON.stringify({
									error: { message: 'APIキーが設定されていません' },
								}),
							);
							return;
						}
						next();
					});
				},
			},
		],
		server: {
			host: '0.0.0.0',
			port: 5173,
			strictPort: true,
			// 開発時はキャッシュを無効化して、マップやJSの変更を即時反映する
			headers: {
				'Cache-Control': 'no-store',
			},
			proxy: {
				'/api/gemini': {
					target: 'https://generativelanguage.googleapis.com',
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api\/gemini$/, '/v1beta/models/gemini-3.1-flash-lite:generateContent'),
					// キーはヘッダーで転送（URL に載せずログに残さない）
					headers: geminiApiKey ? { 'x-goog-api-key': geminiApiKey } : undefined,
				},
			},
		},
		build: {
			outDir: 'dist',
		},
	};
});
