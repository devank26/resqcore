import crypto from 'crypto';
import { promisify } from 'util';
import { JWT_SECRET, TOKEN_TTL_SECONDS, AUTH_TOKENS } from './config.js';

const scrypt = promisify(crypto.scrypt);

// ---- password hashing (scrypt) ---------------------------------------------------
const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(keyB64, 'base64');
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Used to burn equivalent CPU time when the account does not exist (avoids user enumeration by timing).
let dummyHashPromise = null;
export function verifyAgainstDummy(password) {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('resqcore-dummy-password');
  return dummyHashPromise.then((hash) => verifyPassword(password, hash)).then(() => false);
}

// ---- JWT (HS256) -------------------------------------------------------------------
const b64u = (input) => Buffer.from(input).toString('base64url');

function sign(data) {
  return crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
}

export function signToken(claims, ttlSeconds = TOKEN_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { ...claims, iat: now, exp: now + ttlSeconds };
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  return { token: `${head}.${body}.${sign(`${head}.${body}`)}`, expiresAt: payload.exp, expiresIn: ttlSeconds };
}

export function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = sign(`${head}.${body}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256') return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Checks a token against COMMAND_TOKEN / RESCUE_TOKEN / CITIZEN_TOKEN env vars. Returns role or null. */
export function verifyEnvBearerToken(token) {
  if (typeof token !== 'string' || !token) return null;
  const given = Buffer.from(token);
  for (const role of ['command', 'rescue', 'citizen']) {
    const expectedStr = AUTH_TOKENS[role];
    if (!expectedStr) continue;
    const expected = Buffer.from(expectedStr);
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
      return role;
    }
  }
  return null;
}

/** Extracts a bearer token from the Authorization header or (for EventSource/WebSocket) the ?token= query param. */
export function extractToken(req, url) {
  const header = req.headers['authorization'];
  if (header && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
  const q = url?.searchParams?.get('token');
  return q || null;
}
