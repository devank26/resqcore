/**
 * Shared helpers for backend/test-integration.js and backend/live-platform-test.js.
 * Each run spawns an ISOLATED server (random port, temp DB, temp static dir) - it never touches real data.
 */
import { spawn } from 'child_process';
import http from 'http';
import net from 'net';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const TEST_CODES = { command: 'test-command-code', rescue: 'test-rescue-code' };
export const TEST_ORIGIN = 'http://allowed.example';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(predicate, timeoutMs = 3000, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export async function startTestServer(extraEnv = {}) {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resqcore-test-'));
  const staticDir = path.join(dir, 'public');
  fs.mkdirSync(path.join(staticDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>ResQCore Test UI</title><div id="root"></div>');
  fs.writeFileSync(path.join(staticDir, 'assets', 'app-123.js'), 'console.log("ok");');

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DB_PATH: path.join(dir, 'data', 'test.db'),
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    COMMAND_INVITE_CODE: TEST_CODES.command,
    RESCUE_INVITE_CODE: TEST_CODES.rescue,
    ALLOWED_ORIGINS: TEST_ORIGIN,
    STATIC_DIR: staticDir,
    EVENTBUS_LOG: 'off',
    ...extraEnv
  };

  const child = spawn(process.execPath, [path.join(here, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  let exited = false;
  child.on('exit', () => { exited = true; });

  const baseUrl = `http://127.0.0.1:${port}`;
  const started = Date.now();
  for (;;) {
    if (exited) throw new Error(`Test server exited early:\n${output}`);
    try {
      const res = await request(baseUrl, 'GET', '/api/health');
      if (res.status === 200) break;
    } catch (_) { /* not up yet */ }
    if (Date.now() - started > 15000) {
      child.kill();
      throw new Error(`Test server did not start in time:\n${output}`);
    }
    await sleep(100);
  }

  return {
    port,
    baseUrl,
    env,
    dbPath: env.DB_PATH,
    getOutput: () => output,
    async stop() {
      if (!exited) {
        child.kill();
        await new Promise((r) => child.once('exit', r));
      }
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  };
}

export function request(baseUrl, method, urlPath, { body, token, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(url, {
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      }
    }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(raw); } catch (_) { /* not json */ }
        resolve({ status: res.statusCode, data, raw, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Server-Sent Events client. Resolves { status, events, close } (events only populated when status === 200). */
export function connectSSE(baseUrl, token, { viaQuery = false } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/stream' + (viaQuery ? `?token=${encodeURIComponent(token)}` : ''), baseUrl);
    const events = [];
    const req = http.get(url, { headers: viaQuery || !token ? {} : { Authorization: `Bearer ${token}` } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve({ status: res.statusCode, events, close: () => req.destroy() });
      }
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const part of parts) {
          let type = 'message';
          let data = null;
          for (const line of part.split('\n')) {
            if (line.startsWith('event:')) type = line.slice(6).trim();
            else if (line.startsWith('data:')) {
              const text = line.slice(5).trim();
              try { data = JSON.parse(text); } catch (_) { data = text; }
            }
          }
          if (data !== null) events.push({ type, data });
        }
      });
      resolve({ status: 200, events, close: () => req.destroy() });
    });
    req.on('error', (err) => { if (err.code !== 'ECONNRESET') reject(err); });
  });
}

function wsFrame(obj) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const mask = crypto.randomBytes(4);
  let header;
  if (payload.length <= 125) {
    header = Buffer.from([0x81, 0x80 | payload.length]);
  } else {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  }
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

/**
 * Minimal RFC 6455 client. Resolves { status, messages, send, close }.
 * status is 101 on success, otherwise the HTTP status returned for the upgrade (e.g. 401).
 */
export function connectWS(baseUrl, token, { viaQuery = true, origin } = {}) {
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(baseUrl);
    const messages = [];
    const socket = net.createConnection({ host: hostname, port: Number(port) });
    let upgraded = false;
    let buffer = Buffer.alloc(0);
    let settled = false;

    const done = (value) => { if (!settled) { settled = true; resolve(value); } };

    socket.on('connect', () => {
      const key = crypto.randomBytes(16).toString('base64');
      const lines = [
        `GET /ws${token && viaQuery ? `?token=${encodeURIComponent(token)}` : ''} HTTP/1.1`,
        `Host: ${hostname}:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13'
      ];
      if (token && !viaQuery) lines.push(`Authorization: Bearer ${token}`);
      if (origin) lines.push(`Origin: ${origin}`);
      socket.write(lines.join('\r\n') + '\r\n\r\n');
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!upgraded) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end === -1) return;
        const status = Number(buffer.subarray(0, end).toString().split(' ')[1]);
        buffer = buffer.subarray(end + 4);
        if (status !== 101) {
          socket.destroy();
          return done({ status, messages, send: () => {}, close: () => {} });
        }
        upgraded = true;
        done({
          status: 101,
          messages,
          send: (obj) => socket.write(wsFrame(obj)),
          close: () => socket.destroy()
        });
      }
      while (buffer.length >= 2) {
        const opcode = buffer[0] & 0x0f;
        let length = buffer[1] & 0x7f;
        let offset = 2;
        if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
        else if (length === 127) { if (buffer.length < 10) return; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
        if (buffer.length < offset + length) return;
        const payload = buffer.subarray(offset, offset + length);
        buffer = buffer.subarray(offset + length);
        if (opcode === 0x1) {
          try { messages.push(JSON.parse(payload.toString('utf8'))); } catch (_) { /* ignore */ }
        }
      }
    });

    socket.on('error', (err) => { if (!settled) reject(err); });
  });
}
