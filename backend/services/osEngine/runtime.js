import { dbManager as db } from '../database.js';
import { eventBus } from '../eventBus.js';
import { createLiveOs } from './liveOs.js';
import { RESOURCE_KEYS } from './osMonitor.js';
import {
  KEY_TO_DB_ID,
  mapIncident,
  mapResourceRows,
  mapTeam
} from './liveAdapter.js';

let persistEnabled = false;

function handleOsAuditEvent(entry) {
  if (!persistEnabled || !entry) return;
  db.appendOsEvent({
    type: entry.type,
    pid: entry.pid || null,
    detail: entry.message || entry.detail || '',
    payload: entry
  }).catch((err) => {
    console.error('[OS Runtime] Failed to persist event log:', err?.message || err);
  });
}

export const liveOs = createLiveOs({
  onEvent: handleOsAuditEvent,
  maxEvents: 40
});

let agingTimer = null;

export function buildTeamNameMap(teamList = []) {
  const map = new Map();
  for (const t of teamList) {
    if (t?.name && t?.id) {
      map.set(String(t.name).toLowerCase(), String(t.id));
    }
  }
  return map;
}

export function osVectorToDbAllocations(vector = {}, catalogById = null) {
  const items = [];
  for (const key of RESOURCE_KEYS) {
    const qty = Math.floor(Number(vector?.[key] ?? 0));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const resourceId = KEY_TO_DB_ID[key];
    if (!resourceId) continue;
    if (catalogById && !catalogById.has(resourceId)) continue;
    items.push({ resourceId, quantity: qty, maxNeed: qty });
  }
  return items;
}

export async function initLiveOsFromDb() {
  persistEnabled = false;
  try {
    const [incidents, teams, snap, recentEvents] = await Promise.all([
      db.getAllIncidents(),
      db.getAllTeams(),
      db.getResourcesSnapshot(),
      db.getRecentOsEvents(40).catch(() => [])
    ]);

    liveOs.syncFromStore([], [], Date.now());
    if (snap?.resources?.length) {
      const mappedPool = mapResourceRows(snap.resources);
      liveOs.setTotals(mappedPool.total);
    }

    const mappedTeams = teams.map((t) => mapTeam(t));
    const teamNameToId = buildTeamNameMap(mappedTeams);
    const mappedIncidents = incidents.map((inc) => mapIncident(inc, { teamNameToId }));
    const seedEvents = recentEvents.map((ev) => ({
      id: String(ev.id),
      type: ev.type,
      message: ev.detail || ev.message || '',
      pid: ev.pid || null,
      timestamp: ev.createdAt || new Date(ev.at || Date.now()).toISOString()
    }));

    liveOs.syncFromStore(mappedIncidents, mappedTeams, Date.now(), { seedEvents });
  } finally {
    persistEnabled = true;
  }
  return getOsLiveSnapshot();
}

export function getOsLiveSnapshot() {
  return liveOs.getSnapshot(Date.now());
}

export function broadcastOsLive() {
  const snapshot = getOsLiveSnapshot();
  eventBus.emitRealtime('OS_LIVE_UPDATED', snapshot);
  eventBus.emitRealtime('os_state', snapshot);
  return snapshot;
}

export function startLiveAgingTimer(intervalMs = 30_000) {
  if (agingTimer) return;
  agingTimer = setInterval(() => {
    const snap = getOsLiveSnapshot();
    if (snap.queueCount > 0) {
      eventBus.emitRealtime('OS_LIVE_UPDATED', snap);
      eventBus.emitRealtime('os_state', snap);
    }
  }, intervalMs);
  agingTimer.unref?.();
}

export function stopLiveAgingTimer() {
  if (agingTimer) {
    clearInterval(agingTimer);
    agingTimer = null;
  }
}
