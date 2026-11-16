import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import {
  PORT, IS_PROD, STATIC_DIR, ALLOWED_ORIGINS, isOriginAllowed
} from './services/config.js';
import { dbManager as db } from './services/database.js';
import { eventBus } from './services/eventBus.js';
import { SimpleWebSocketServer } from './services/websocketServer.js';
import { extractToken, verifyEnvBearerToken } from './services/auth.js';
import { HttpError, badRequest, forbidden, notFound, unauthorized } from './services/errors.js';
import * as actions from './services/actions.js';
import {
  getOsLiveSnapshot,
  initLiveOsFromDb,
  startLiveAgingTimer,
  stopLiveAgingTimer
} from './services/osEngine/runtime.js';
import { startFeeds, stopFeeds } from './services/feeds.js';

const VERSION = '3.0.0';
const MAX_BODY_BYTES = 1024 * 1024;

const ANY = ['command', 'rescue', 'citizen'];
const STAFF = ['command', 'rescue'];
const COMMAND = ['command'];
const RESCUE = ['rescue'];

// ------------------------------------------------------------------ helpers

class Reply {
  constructor(status, body) { this.status = status; this.body = body; }
}
const reply = (status, body) => new Reply(status, body);
const HANDLED = Symbol('handled');

function sameHostOrigin(origin, req) {
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  res.setHeader('Vary', 'Origin');
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes('*') ? '*' : origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function sendJSON(res, status, data, extraHeaders = {}) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        reject(new HttpError(413, 'Request body too large'));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(badRequest('JSON body must be an object'));
        }
        resolve(parsed);
      } catch {
        reject(badRequest('Request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function authenticate(req, url) {
  const token = extractToken(req, url);
  if (!token) return null;
  const role = verifyEnvBearerToken(token);
  if (!role) return null;
  const headerTeamId = req.headers['x-team-id'];
  const queryTeamId = url?.searchParams?.get('teamId');
  return {
    user: {
      id: `env-${role}`,
      name: `${role.toUpperCase()} Operator`,
      role,
      teamId: (typeof headerTeamId === 'string' && headerTeamId.trim()) || (queryTeamId && queryTeamId.trim()) || null
    }
  };
}

// ------------------------------------------------------------------ routing

const routes = [];

/** roles: null = public, otherwise the list of roles allowed to call it. */
function route(method, pattern, roles, handler) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, regex, keys, roles, handler });
}

function matchRoute(method, pathname) {
  let pathMatched = false;
  for (const r of routes) {
    const m = r.regex.exec(pathname);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { route: r, params };
  }
  return { route: null, pathMatched };
}

// ---- public / auth
route('GET', '/api/health', null, async () => {
  await db.query('SELECT 1');
  return { status: 'online', service: 'ResQCore Unified Real-Time Backend', version: VERSION, timestamp: new Date().toISOString() };
});

route('POST', '/api/auth/login', null, async ({ body }) => actions.login(body));
route('POST', '/api/auth/register', null, async ({ body }) => actions.login(body));
route('GET', '/api/auth/me', ANY, async ({ user }) => ({ success: true, user }));

// ---- realtime stream (SSE)
route('GET', '/api/stream', ANY, async ({ req, res, user }) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const viewer = { id: user.id, role: user.role, name: user.name, teamId: user.teamId || null };
  res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now(), service: 'ResQCore Real-Time Event Stream', role: user.role, userId: user.id })}\n\n`);
  const client = eventBus.addSSEClient(res, viewer);

  req.on('close', () => {
    eventBus.removeSSEClient(client);
  });
  return HANDLED;
});

// ---- OS engine state & algorithms (Section 9)
route('GET', '/api/os/state', null, async () => ({ success: true, state: getOsLiveSnapshot() }));
route('GET', '/api/os-live', null, async () => actions.getOsLive());
route('POST', '/api/os-live/resources', COMMAND, async ({ body }) =>
  await actions.updateOsResourceTotals(body)
);
route('GET', '/api/os-algo/schedulers', null, async ({ query }) =>
  await actions.getSchedulerComparison({
    source: query.get('source') || 'live',
    quantum: query.get('quantum')
  })
);
route('POST', '/api/os-algo/schedulers', null, async ({ body }) =>
  actions.runCustomSchedulerComparison(body)
);
route('GET', '/api/os-algo/deadlock', null, async () => actions.getDeadlockAnalysis());
route('GET', '/api/os-algo/semaphore-demo', null, async ({ query }) =>
  actions.getSemaphoreDemo({
    capacity: query.get('capacity'),
    items: query.get('items'),
    consumeEvery: query.get('consumeEvery')
  })
);

// ---- citizen
route('POST', '/api/citizen/sos', ['citizen', 'command'], async ({ user, body }) => {
  const { incident, duplicate } = await actions.createCitizenSos(user, body);
  return reply(duplicate ? 200 : 201, { success: true, duplicate, incident, request: incident });
});

route('GET', '/api/citizen/status/:id', null, async ({ params }) => {
  const incident = await actions.getIncidentById(params.id);
  return { success: true, request: incident, incident };
});

const myRequests = async ({ query }) => {
  const requests = await actions.listCitizenRequests({ phone: query.get('phone') });
  return { success: true, count: requests.length, requests };
};
route('GET', '/api/citizen/requests', null, myRequests);
route('GET', '/api/citizen/my-requests', null, myRequests);

// ---- incidents
route('GET', '/api/incidents', null, async ({ query }) => {
  const list = await actions.listIncidents({ status: query.get('status') });
  return { success: true, count: list.length, incidents: list };
});
route('GET', '/api/incidents/:id/suggest-team', null, async ({ params }) =>
  await actions.suggestTeamsForIncident(params.id)
);
route('GET', '/api/incidents/:id', null, async ({ params }) => ({
  success: true,
  incident: await actions.getIncidentById(params.id)
}));
route('POST', '/api/incidents/update', STAFF, async ({ user, body }) => ({
  success: true,
  incident: await actions.updateIncidentStatus(user, body)
}));
route('POST', '/api/incidents/report', STAFF, async ({ user, body }) =>
  reply(201, { success: true, incident: await actions.reportFieldIncident(user, body) })
);

// ---- command
route('POST', '/api/command/dispatch', COMMAND, async ({ user, body }) => {
  const { incident, team } = await actions.dispatchTeam(user, body);
  return { success: true, incident, request: incident, team };
});
route('POST', '/api/command/verify', COMMAND, async ({ user, body }) => ({
  success: true,
  incident: await actions.verifyIncident(user, body)
}));
route('POST', '/api/command/broadcast', COMMAND, async ({ user, body }) =>
  reply(201, { success: true, alert: await actions.broadcast(user, body) })
);

// ---- teams / telemetry
route('GET', '/api/teams', null, async () => ({ success: true, teams: await actions.listTeams() }));
route('POST', '/api/teams/telemetry', RESCUE, async ({ user, body }) => ({
  success: true,
  team: await actions.postTelemetry(user, body)
}));
route('POST', '/api/teams/status', RESCUE, async ({ user, body }) => ({
  success: true,
  team: await actions.setTeamStatus(user, body)
}));
route('POST', '/api/teams/sos', RESCUE, async ({ user, body }) => {
  const { incident, sosEvent, team } = await actions.createRescueSos(user, body);
  return reply(201, { success: true, incident, sosEvent, team });
});
route('GET', '/api/telemetry/live', null, async () => ({
  success: true,
  telemetry: await db.getLatestTelemetry()
}));
route('GET', '/api/telemetry/history/:teamId', null, async ({ params, query }) => {
  const limit = Math.min(Math.max(parseInt(query.get('limit') || '100', 10) || 100, 1), 500);
  return { success: true, teamId: params.teamId, history: await db.getTelemetryHistory(params.teamId, limit) };
});

// ---- rescue SOS events
route('GET', '/api/sos/active', null, async () => {
  const events = await db.getActiveSosEvents();
  return { success: true, count: events.length, events };
});
route('POST', '/api/sos/resolve/:id', COMMAND, async ({ user, params }) => ({
  success: true,
  event: await actions.resolveSos(user, params.id)
}));

// ---- chat
route('GET', '/api/chat/messages', null, async ({ user, query }) => ({
  success: true,
  messages: await actions.listMessages({ channel: query.get('channel') || 'all', limit: query.get('limit'), since: query.get('since'), user })
}));
route('POST', '/api/chat/send', STAFF, async ({ user, body }) => {
  const { channel, message, duplicate } = await actions.sendChat(user, body);
  return reply(duplicate ? 200 : 201, { success: true, channel, message, duplicate });
});

// ---- alerts / shelters / sectors
route('GET', '/api/alerts', null, async ({ user }) => ({
  success: true,
  alerts: await actions.listAlerts(user)
}));
route('GET', '/api/shelters', null, async () => ({
  success: true,
  shelters: await db.getShelters()
}));
route('GET', '/api/resources', null, async () => ({
  success: true,
  ...(await db.getResourcesSnapshot())
}));
route('POST', '/api/shelters/update', COMMAND, async ({ user, body }) => ({
  success: true,
  shelter: await actions.updateShelter(user, body)
}));

route('GET', '/api/sectors', null, async ({ query }) => {
  const sectors = await db.getSectors(query.get('theater'));
  return { success: true, count: sectors.length, sectors };
});
route('GET', '/api/sectors/:id', null, async ({ params }) => {
  const sector = await db.getSectorById(params.id);
  if (!sector) throw notFound('Sector not found');
  const allIncidents = await db.getAllIncidents();
  const allTeams = await db.getAllTeams();
  return {
    success: true,
    sector,
    incidents: allIncidents.filter((i) => i.sectorId === params.id),
    teams: allTeams.filter((t) => t.sectorId === params.id)
  };
});
const sectorUpdate = async ({ user, params, body }) => ({
  success: true,
  sector: await actions.updateSector(user, params.id, body)
});
route('PUT', '/api/sectors/:id', COMMAND, sectorUpdate);
route('POST', '/api/sectors/:id', COMMAND, sectorUpdate);

// ---- volunteers
route('GET', '/api/volunteers', null, async ({ query }) => {
  const volunteers = await db.getAllVolunteers({ sectorId: query.get('sector_id') || query.get('sectorId'), status: query.get('status') });
  return { success: true, count: volunteers.length, volunteers };
});
route('POST', '/api/volunteers/register', ANY, async ({ user, body }) =>
  reply(201, { success: true, volunteer: await actions.registerVolunteer(user, body) })
);
route('PUT', '/api/volunteers/:id', ANY, async ({ user, params, body }) => ({
  success: true,
  volunteer: await actions.setVolunteerStatus(user, params.id, body)
}));

// ---- diagnostics & operational intelligence
route('GET', '/api/database/stats', null, async () => ({
  success: true,
  database: await db.getStats()
}));
route('GET', '/api/reports/intelligence', null, async () => ({
  success: true,
  intelligence: await actions.getOperationalIntelligence()
}));

// ------------------------------------------------------------------ static hosting (../resqcore/dist)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

function sendFile(req, res, filePath, stat, immutable) {
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res, pathname) {
  if (!STATIC_DIR || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    sendJSON(res, 400, { success: false, error: 'Bad request path' });
    return true;
  }
  const full = path.resolve(STATIC_DIR, '.' + path.posix.normalize('/' + rel));
  if (full !== STATIC_DIR && !full.startsWith(STATIC_DIR + path.sep)) {
    sendJSON(res, 403, { success: false, error: 'Forbidden' });
    return true;
  }

  try {
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      sendFile(req, res, full, stat, /^\/assets\//.test(pathname));
      return true;
    }
  } catch (_) { /* fall through to SPA fallback */ }

  if (path.extname(pathname) === '') {
    const index = path.join(STATIC_DIR, 'index.html');
    sendFile(req, res, index, fs.statSync(index), false);
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ server

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  applySecurityHeaders(res);
  applyCors(req, res);

  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendJSON(res, 400, { success: false, error: 'Bad request' });
  }
  const pathname = url.pathname;
  const isApi = pathname === '/api' || pathname.startsWith('/api/');

  if (isApi) {
    res.on('finish', () => {
      if (pathname !== '/api/health') console.log(`[HTTP] ${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
    });
  }

  if (req.method === 'OPTIONS') {
    if (req.headers.origin && !isOriginAllowed(req.headers.origin) && !sameHostOrigin(req.headers.origin, req)) {
      res.writeHead(403);
      return res.end();
    }
    res.writeHead(204);
    return res.end();
  }

  if (!isApi) {
    if (serveStatic(req, res, pathname)) return;
    if (pathname === '/' && !STATIC_DIR) {
      return sendJSON(res, 200, { service: 'ResQCore Unified Real-Time Backend', version: VERSION, message: 'API only - no built Command Center found (set STATIC_DIR).' });
    }
    return sendJSON(res, 404, { success: false, error: 'Not found' });
  }

  try {
    const { route: matched, params, pathMatched } = matchRoute(req.method, pathname);
    if (!matched) {
      if (pathMatched) throw new HttpError(405, 'Method not allowed');
      throw notFound('Endpoint not found');
    }

    const auth = authenticate(req, url);
    if (matched.roles) {
      if (!auth) throw unauthorized();
      if (!matched.roles.includes(auth.user.role)) throw forbidden(`This endpoint requires role: ${matched.roles.join(' or ')}`);
    }

    const hasBody = req.method === 'POST' || req.method === 'PUT';
    const body = hasBody ? await readJson(req) : {};

    const result = await matched.handler({
      req,
      res,
      url,
      params,
      body,
      query: url.searchParams,
      user: auth?.user || null
    });
    if (result === HANDLED) return;
    if (result instanceof Reply) return sendJSON(res, result.status, result.body);
    return sendJSON(res, 200, { success: true, ...result });
  } catch (err) {
    if (err instanceof HttpError) {
      const headers = err.status === 429 && err.extra?.retryAfter ? { 'Retry-After': String(err.extra.retryAfter) } : {};
      return sendJSON(res, err.status, { success: false, error: err.message, ...err.extra }, headers);
    }
    console.error(`[HTTP] Unhandled error on ${req.method} ${pathname}:`, err);
    return sendJSON(res, 500, { success: false, error: 'Internal server error' });
  }
});

// ------------------------------------------------------------------ WebSocket

const wsServer = new SimpleWebSocketServer(server, {
  path: '/ws',
  authenticate: (req, url) => {
    const auth = authenticate(req, url);
    return auth ? { id: auth.user.id, role: auth.user.role, name: auth.user.name, teamId: auth.user.teamId } : null;
  },
  isOriginAllowed: (origin, req) => isOriginAllowed(origin) || sameHostOrigin(origin, req)
});
eventBus.setWebSocketServer(wsServer);

wsServer.onMessage(async (msg, client) => {
  const type = msg.type || msg.event;
  const data = msg.data && typeof msg.data === 'object' ? msg.data : msg;
  try {
    const user = client.viewer;
    if (!user) throw unauthorized('Authentication required');
    const need = (roles) => {
      if (!roles.includes(user.role)) throw forbidden(`'${type}' requires role: ${roles.join(' or ')}`);
    };

    switch (type) {
      case 'chat_message':
        need(STAFF);
        await actions.sendChat(user, data);
        break;
      case 'telemetry':
        need(RESCUE);
        await actions.postTelemetry(user, data);
        break;
      case 'sos':
        need(RESCUE);
        await actions.createRescueSos(user, data);
        break;
      case 'update_status':
        need(STAFF);
        await actions.updateIncidentStatus(user, data);
        break;
      default:
        throw badRequest(`Unknown message type '${type}'`);
    }
    wsServer.sendToClient(client, { event: 'ack', data: { type, ok: true, ref: data.ref ?? data.id ?? null } });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (!(err instanceof HttpError)) console.error('[WebSocket Inbound Error]:', err);
    wsServer.sendToClient(client, {
      event: 'error',
      data: { type, status, message: err instanceof HttpError ? err.message : 'Internal server error', ref: data.ref ?? data.id ?? null }
    });
  }
});

// ------------------------------------------------------------------ lifecycle

await db.init();
await initLiveOsFromDb();
startLiveAgingTimer(30_000);
startFeeds();

server.listen(PORT, '0.0.0.0', () => {
  console.log('============================================================');
  console.log(`[ResQCore Backend v${VERSION}] listening on http://0.0.0.0:${PORT}  (${IS_PROD ? 'production' : 'development'})`);
  console.log(`- Static UI:  ${STATIC_DIR || 'none (API only)'}`);
  console.log(`- CORS:       ${ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS.join(', ') : 'same-origin only'}`);
  console.log('============================================================');
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Lifecycle] ${signal} received, shutting down...`);
  stopFeeds();
  stopLiveAgingTimer();
  const force = setTimeout(() => process.exit(1), 5000);
  force.unref();
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
  for (const client of eventBus.sseClients) { try { client.res.end(); } catch (_) { /* ignore */ } }
  for (const client of wsServer.clients) { try { client.socket.end(); } catch (_) { /* ignore */ } }
  server.closeIdleConnections?.();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
