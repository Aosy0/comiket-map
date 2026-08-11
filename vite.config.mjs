import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: path.join(root, 'app'),
	server: {
		host: '0.0.0.0',
		port: 5173,
		// 開発時はキャッシュを無効化して、マップやJSの変更を即時反映する
		headers: {
			'Cache-Control': 'no-store',
		},
	},
	build: {
		outDir: path.join(root, 'dist'),
	},
});
