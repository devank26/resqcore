import { createHash, createHmac, randomBytes } from 'node:crypto';

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function createTrackingToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashTrackingToken(token) };
}

export function hashTrackingToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function hashRateLimitKey(value) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('Supabase JWT signing secret is not configured.');
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function createCitizenRealtimeToken(incidentId, tokenHash) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('Supabase JWT signing secret is not configured.');

  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJson({
    iss: 'supabase',
    aud: 'authenticated',
    role: 'anon',
    iat: now,
    exp: now + 60 * 60 * 24 * 30,
    incident_id: incidentId,
    tracking_token_hash: tokenHash,
  });
  const content = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(content).digest('base64url');
  return `${content}.${signature}`;
}
