/**
 * WebSocket チャット中継サーバー
 *
 * 使い方:
 *   node ws-server.mjs
 *   → ws://localhost:3001
 *
 * 環境変数:
 *   WS_PORT (デフォルト: 3001)
 *   WS_ORIGIN (許可するオリジン, カンマ区切り, デフォルト: http://localhost:3000)
 *
 * プロトコル:
 *   全てJSON形式のテキストメッセージ
 *
 *   Client → Server:
 *     {"type":"join","roomId":"...","name":"..."}
 *     {"type":"message","text":"..."}
 *     {"type":"ping"}
 *
 *   Server → Client:
 *     {"type":"joined","name":"...","peerCount":2}
 *     {"type":"message","name":"...","text":"...","timestamp":1234567890}
 *     {"type":"user-joined","name":"...","peerCount":2}
 *     {"type":"user-left","name":"...","peerCount":1}
 *     {"type":"error","message":"..."}
 *     {"type":"pong"}
 */

import crypto from 'node:crypto';
import http from 'node:http';

const PORT = Number.parseInt(process.env.WS_PORT, 10) || 3001;
const ALLOWED_ORIGINS = (process.env.WS_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim());

// ---- WebSocketハンドシェイク (Node.js標準API) ----
// 軽量なのでwsライブラリ未使用、生のhttpモジュールで実装

const clients = new Map(); // ws → { socket, roomId, name }
const rooms = new Map(); // roomId → Set<ws>

function generateAcceptKey(key) {
	const hash = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
	return hash;
}

function sendFrame(ws, data) {
	try {
		const payload = Buffer.from(data, 'utf-8');
		const frame = Buffer.alloc(2 + payload.length);
		frame[0] = 0x81; // FIN + text opcode
		frame[1] = payload.length;
		payload.copy(frame, 2);
		ws.write(frame);
	} catch (e) {
		// ignore write errors
	}
}

function sendJSON(ws, obj) {
	sendFrame(ws, JSON.stringify(obj));
}

function broadcast(roomId, message, senderWs = null) {
	const room = rooms.get(roomId);
	if (!room) return;
	for (const ws of room) {
		if (ws === senderWs) continue;
		sendJSON(ws, message);
	}
}

function broadcastPeerCount(roomId) {
	const room = rooms.get(roomId);
	if (!room) return;
	const peerCount = room.size;
	for (const ws of room) {
		const info = clients.get(ws);
		if (info) {
			sendJSON(ws, { type: 'peer-count', peerCount });
		}
	}
}

function handleMessage(ws, text) {
	let msg;
	try {
		msg = JSON.parse(text);
	} catch {
		sendJSON(ws, { type: 'error', message: 'Invalid JSON' });
		return;
	}

	const info = clients.get(ws);

	switch (msg.type) {
		case 'join': {
			if (!msg.roomId || !msg.name) {
				sendJSON(ws, { type: 'error', message: 'roomId and name required' });
				return;
			}
			// 既に部屋にいる場合は先にleave
			if (info) {
				handleMessage(ws, JSON.stringify({ type: 'leave' }));
			}

			const roomId = msg.roomId;
			if (!rooms.has(roomId)) {
				rooms.set(roomId, new Set());
			}
			rooms.get(roomId).add(ws);
			clients.set(ws, { socket: ws, roomId, name: msg.name });

			sendJSON(ws, { type: 'joined', name: msg.name, peerCount: rooms.get(roomId).size });
			broadcast(roomId, { type: 'user-joined', name: msg.name, peerCount: rooms.get(roomId).size }, ws);
			break;
		}

		case 'leave': {
			if (!info) return;
			const { roomId, name } = info;
			const room = rooms.get(roomId);
			if (room) {
				room.delete(ws);
				if (room.size === 0) {
					rooms.delete(roomId);
				} else {
					broadcast(roomId, { type: 'user-left', name, peerCount: room.size });
				}
			}
			clients.delete(ws);
			break;
		}

		case 'message': {
			if (!info) {
				sendJSON(ws, { type: 'error', message: 'Not joined' });
				return;
			}
			if (!msg.text || typeof msg.text !== 'string' || msg.text.trim().length === 0) {
				sendJSON(ws, { type: 'error', message: 'Empty message' });
				return;
			}
			// 長さ制限 (1000文字)
			const text = msg.text.trim().slice(0, 1000);
			const timestamp = Date.now();
			broadcast(
				info.roomId,
				{
					type: 'message',
					name: info.name,
					text,
					timestamp,
				},
				ws,
			);
			// 送信者にも確認を返す
			sendJSON(ws, { type: 'message-sent', text, timestamp });
			break;
		}

		case 'ping': {
			sendJSON(ws, { type: 'pong' });
			break;
		}

		default:
			sendJSON(ws, { type: 'error', message: `Unknown type: ${msg.type}` });
	}
}

function handleDisconnect(ws) {
	const info = clients.get(ws);
	if (info) {
		const { roomId, name } = info;
		const room = rooms.get(roomId);
		if (room) {
			room.delete(ws);
			if (room.size === 0) {
				rooms.delete(roomId);
			} else {
				broadcast(roomId, { type: 'user-left', name, peerCount: room.size });
			}
		}
		clients.delete(ws);
	}
}

// ---- HTTPサーバー (WebSocket accept + ヘルスチェック) ----
const server = http.createServer((req, res) => {
	// ヘルスチェック用
	if (req.url === '/health') {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end(`OK (rooms: ${rooms.size}, connections: ${clients.size})`);
		return;
	}
	res.writeHead(404);
	res.end();
});

server.on('upgrade', (req, socket, head) => {
	// オリジンチェック
	const origin = req.headers.origin || '';
	if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes('*') && !ALLOWED_ORIGINS.includes(origin)) {
		socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
		socket.destroy();
		return;
	}

	const key = req.headers['sec-websocket-key'];
	if (!key) {
		socket.destroy();
		return;
	}

	// ハンドシェイク
	const acceptKey = generateAcceptKey(key);
	socket.write(
		`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey}\r\n\r\n`,
	);

	// クライアント管理
	clients.set(socket, null); // joinするまではnull

	let buffer = Buffer.alloc(0);

	socket.on('data', (chunk) => {
		buffer = Buffer.concat([buffer, chunk]);

		while (buffer.length >= 2) {
			const opcode = buffer[0] & 0x0f;
			const masked = (buffer[1] & 0x80) !== 0;
			let payloadLen = buffer[1] & 0x7f;
			let offset = 2;

			if (payloadLen === 126) {
				if (buffer.length < 4) return;
				payloadLen = buffer.readUInt16BE(2);
				offset = 4;
			} else if (payloadLen === 127) {
				if (buffer.length < 10) return;
				payloadLen = Number(buffer.readBigUInt64BE(2));
				offset = 10;
			}

			if (buffer.length < offset + (masked ? 4 : 0) + payloadLen) return;

			let mask = null;
			if (masked) {
				mask = buffer.slice(offset, offset + 4);
				offset += 4;
			}

			let payload = buffer.slice(offset, offset + payloadLen);
			if (mask) {
				for (let i = 0; i < payload.length; i++) {
					payload[i] ^= mask[i % 4];
				}
			}

			buffer = buffer.slice(offset + payloadLen);

			if (opcode === 0x8) {
				// Close frame
				handleDisconnect(socket);
				try {
					socket.end();
				} catch {}
				return;
			}

			if (opcode === 0x9) {
				// Ping → Pong
				const pong = Buffer.alloc(2);
				pong[0] = 0x8a; // FIN + pong
				pong[1] = 0x00;
				try {
					socket.write(pong);
				} catch {}
				continue;
			}

			if (opcode === 0x1 || opcode === 0x2) {
				// Text or Binary frame
				const text = payload.toString('utf-8');
				handleMessage(socket, text);
			}
		}
	});

	socket.on('close', () => {
		handleDisconnect(socket);
	});

	socket.on('error', () => {
		handleDisconnect(socket);
	});
});

server.listen(PORT, () => {
	console.log('\n  C108 チャットサーバー');
	console.log('  -----------------------------------------');
	console.log(`  -> ws://localhost:${PORT}`);
	console.log(`  -> 許可オリジン: ${ALLOWED_ORIGINS.join(', ')}`);
	console.log(`  -> ヘルスチェック: http://localhost:${PORT}/health\n`);
});
