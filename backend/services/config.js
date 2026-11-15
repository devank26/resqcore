import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(__dirname, '..');

// Load backend/.env when present (without overriding existing process.env vars)
const dotEnvPath = path.join(BACKEND_ROOT, '.env');
if (fs.existsSync(dotEnvPath)) {
  try {
    const rawEnv = fs.readFileSync(dotEnvPath, 'utf8');
    for (const rawLine of rawEnv.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    console.warn('[Config] Could not parse .env file:', err.message);
  }
}

const env = process.env;

export const IS_PROD = env.NODE_ENV === 'production';
export const PORT = Number(env.PORT) || 5000;
export const DATABASE_URL = env.DATABASE_URL || '';

export const AUTH_TOKENS = {
  command: (env.COMMAND_TOKEN || '').trim(),
  rescue: (env.RESCUE_TOKEN || '').trim(),
  citizen: (env.CITIZEN_TOKEN || '').trim()
};

// --- JWT -------------------------------------------------------------------
let secret = env.JWT_SECRET;
if (!secret) {
  if (IS_PROD) {
    throw new Error('JWT_SECRET is required when NODE_ENV=production');
  }
  secret = crypto.randomBytes(48).toString('hex');
  console.warn('[Config] JWT_SECRET not set - using an ephemeral secret (all tokens are invalidated on restart).');
} else if (IS_PROD && secret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
export const JWT_SECRET = secret;
export const TOKEN_TTL_SECONDS = Number(env.TOKEN_TTL_SECONDS) || 7 * 24 * 3600;

// --- CORS ------------------------------------------------------------------
// ALLOWED_ORIGINS="https://a.example,https://b.example" (or "*" to allow any origin).
// Native mobile clients send no Origin header and are unaffected by CORS.
const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
];
export const ALLOWED_ORIGINS = env.ALLOWED_ORIGINS !== undefined
  ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : (IS_PROD ? [] : DEV_ORIGINS);

export function isOriginAllowed(origin) {
  if (!origin) return true; // non-browser client
  if (ALLOWED_ORIGINS.includes('*')) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

// --- Registration gates ----------------------------------------------------
// Anyone may register as a citizen. command / rescue registration requires an invite code.
// In production an unset code means that role cannot self-register at all.
// Outside production an unset code leaves the role open (convenient for local dev) and a warning is logged.
export const INVITE_CODES = {
  command: env.COMMAND_INVITE_CODE || '',
  rescue: env.RESCUE_INVITE_CODE || ''
};
for (const role of ['command', 'rescue']) {
  if (!INVITE_CODES[role] && !IS_PROD) {
    console.warn(`[Config] ${role.toUpperCase()}_INVITE_CODE not set - '${role}' self-registration is OPEN (development only).`);
  }
}

export const TRUST_PROXY = env.TRUST_PROXY === 'true';

// --- Static hosting (built Command Center) -----------------------------------
function resolveStaticDir() {
  const candidates = [
    env.STATIC_DIR && path.resolve(env.STATIC_DIR),
    path.join(BACKEND_ROOT, 'public'),
    path.resolve(BACKEND_ROOT, '..', 'resqcore', 'dist')
  ].filter(Boolean);
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || null;
}
export const STATIC_DIR = resolveStaticDir();

export const SOS_LIMIT_PER_10_MIN = Number(env.SOS_LIMIT_PER_10_MIN) || 10;
