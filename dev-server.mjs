/**
 * ローカル開発サーバー
 * - 静的ファイル配信（app/ ディレクトリ）
 * - /api/gemini → Gemini API へのプロキシ
 *
 * 使い方: node dev-server.mjs
 * → http://localhost:3000
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

// ---- .env から GEMINI_API_KEY を読む ----
let GEMINI_API_KEY = '';
try {
	const env = fs.readFileSync('.env', 'utf-8');
	const match = env.match(/^GEMINI_API_KEY=(.+)$/m);
	if (match) GEMINI_API_KEY = match[1].trim();
} catch {
	console.warn('.env が見つかりません。AIチャットは利用できません。');
}

if (!GEMINI_API_KEY) {
	console.warn('GEMINI_API_KEY が設定されていません。AIチャットは利用できません。');
}

// ---- Gemini API プロキシ ----
const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_PATH = `/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

function proxyGeminiAPI(req, res) {
	if (!GEMINI_API_KEY) {
		res.writeHead(503, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: { message: 'APIキーが設定されていません' } }));
		return;
	}

	let body = '';
	req.on('data', (chunk) => (body += chunk));
	req.on('end', () => {
		const options = {
			method: 'POST',
			hostname: GEMINI_HOST,
			path: GEMINI_PATH,
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(body),
			},
		};

		const proxyReq = https.request(options, (proxyRes) => {
			let data = '';
			proxyRes.on('data', (chunk) => (data += chunk));
			proxyRes.on('end', () => {
				res.writeHead(proxyRes.statusCode, {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				});
				res.end(data);
			});
		});

		proxyReq.on('error', (err) => {
			console.error('Gemini API プロキシエラー:', err.message);
			res.writeHead(502, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: { message: 'Gemini APIとの通信に失敗しました' } }));
		});

		proxyReq.write(body);
		proxyReq.end();
	});
}

// ---- 静的ファイル配信 ----
const APP_DIR = new URL('app/', import.meta.url).pathname;
// Windows対応: 先頭の / を除去したりドライブレター対応
const APP_DIR_PATH = APP_DIR.startsWith('/') && process.platform === 'win32'
	? APP_DIR.slice(1)  // /C:/... → C:/...
	: APP_DIR;

const MIME_TYPES = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.webp': 'image/webp',
	'.txt': 'text/plain',
};

function serveStatic(req, res) {
	// URLからパスとクエリを分離 (?v=36 などを無視)
	const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
	let filePath = parsedUrl.pathname;

	// デフォルト → index.html
	if (filePath === '/' || filePath === '') {
		filePath = '/index.html';
	}

	const fullPath = path.join(APP_DIR_PATH, filePath);
	const ext = path.extname(filePath);

	fs.readFile(fullPath, (err, data) => {
		if (err) {
			// SPAフォールバック: 見つからない → index.html
			fs.readFile(path.join(APP_DIR_PATH, 'index.html'), (err2, data2) => {
				if (err2) {
					res.writeHead(404, { 'Content-Type': 'text/plain' });
					res.end('Not found');
					return;
				}
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end(data2);
			});
			return;
		}
		res.writeHead(200, {
			'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
		});
		res.end(data);
	});
}

// ---- サーバー起動 ----
const PORT = parseInt(process.env.PORT, 10) || 3000;

http.createServer((req, res) => {
	if (req.method === 'POST' && req.url === '/api/gemini') {
		proxyGeminiAPI(req, res);
	} else {
		serveStatic(req, res);
	}
}).listen(PORT, () => {
	console.log(`\n  C108 サークルマップ - 開発サーバー`);
	console.log(`  -----------------------------------------`);
	console.log(`  -> http://localhost:${PORT}`);
	console.log(`  -> AIチャット: ${GEMINI_API_KEY ? '利用可 (GEMINI_API_KEY 設定済み)' : '利用不可 (.env に GEMINI_API_KEY を設定してください)'}\n`);
});
