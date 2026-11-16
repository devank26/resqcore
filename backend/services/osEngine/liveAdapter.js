/**
 * ResQCore OS Concepts Engine — Live Data Adapter & LiveDataSource interface
 * Pure dependency-free adapter module: maps external incident/team/resource payloads,
 * enforces idempotent & ordered event ingestion, handles 10s reconciliation & backoff recovery.
 */
import {
  RESOURCE_KEYS,
  DEFAULT_POOL,
  PRIORITY_SCORES,
  emptyVector,
  cloneVector
} from './osMonitor.js';

const ARRAY_ID_TO_KEY = {
  ambulance: 'ambulances',
  ambulances: 'ambulances',
  boat: 'boats',
  boats: 'boats',
  medical_kit: 'medicalKits',
  medicalkit: 'medicalKits',
  medicalkits: 'medicalKits',
  food_pack: 'foodPacks',
  foodpack: 'foodPacks',
  foodpacks: 'foodPacks'
};

export const KEY_TO_DB_ID = Object.freeze({
  ambulances: 'ambulance',
  boats: 'boat',
  medicalKits: 'medical_kit',
  foodPacks: 'food_pack'
});

export function mapResourceNameToKey(nameOrId) {
  const s = String(nameOrId || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'ambulances' || s.includes('ambulance')) return 'ambulances';
  if (s === 'boats' || s.includes('boat')) return 'boats';
  if (s === 'medicalkits' || s === 'medical_kit' || s.includes('medical')) return 'medicalKits';
  if (s === 'foodpacks' || s === 'food_pack' || s.includes('food')) return 'foodPacks';
  return null;
}

export function mapResourceRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      total: cloneVector(DEFAULT_POOL),
      allocated: emptyVector(),
      available: cloneVector(DEFAULT_POOL),
      usedFallback: true
    };
  }

  const total = emptyVector();
  const available = emptyVector();
  const allocated = emptyVector();
  let matched = 0;

  for (const row of rows) {
    if (!row) continue;
    const key = mapResourceNameToKey(row.name || row.id);
    if (!key) continue;
    const t = Math.max(0, Math.floor(Number(row.total ?? 0) || 0));
    const av = Math.max(0, Math.min(t, Math.floor(Number(row.available ?? t) || 0)));
    total[key] = t;
    available[key] = av;
    allocated[key] = Math.max(0, t - av);
    matched += 1;
  }

  if (matched === 0) {
    return {
      total: cloneVector(DEFAULT_POOL),
      allocated: emptyVector(),
      available: cloneVector(DEFAULT_POOL),
      usedFallback: true
    };
  }

  return { total, allocated, available, usedFallback: false };
}

export function mapTeam(raw = {}) {
  const lat = Number(raw.latitude ?? raw.lat ?? raw.coordinates?.lat ?? raw.coordinates?.latitude);
  const lng = Number(raw.longitude ?? raw.lng ?? raw.coordinates?.lng ?? raw.coordinates?.longitude);
  return {
    id: String(raw.id || raw.teamId || '').trim(),
    name: String(raw.name || raw.teamName || raw.id || '').trim(),
    status: String(raw.status || 'Available').trim() || 'Available',
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    specialization: String(raw.specialization || raw.type || 'SAR').trim(),
    responders: Math.max(1, Math.floor(Number(raw.responders ?? 4) || 4)),
    task: raw.task ?? null
  };
}

function normalizeRequestedForAdapter(rawReq) {
  if (!rawReq) return undefined;
  if (typeof rawReq === 'object' && !Array.isArray(rawReq)) {
    const out = {};
    let anyKey = false;
    for (const k of RESOURCE_KEYS) {
      if (rawReq[k] !== undefined && rawReq[k] !== null && rawReq[k] !== '') {
        out[k] = Math.max(0, Math.min(20, Math.floor(Number(rawReq[k]) || 0)));
        anyKey = true;
      }
    }
    return anyKey ? out : undefined;
  }
  if (Array.isArray(rawReq) && rawReq.length > 0) {
    const out = emptyVector();
    let anyPositive = false;
    for (const item of rawReq) {
      const k = ARRAY_ID_TO_KEY[String(item?.resourceId || item?.id || '').toLowerCase()];
      const q = Math.max(0, Math.min(20, Math.floor(Number(item?.quantity ?? 0) || 0)));
      if (k && q > 0) {
        out[k] = Math.min(20, out[k] + q);
        anyPositive = true;
      }
    }
    return anyPositive ? out : undefined;
  }
  return undefined;
}

export function mapIncident(raw = {}, teams = []) {
  const pid = String(raw.pid || raw.id || '').trim();
  const title = String(raw.title || pid).trim();
  const category = String(raw.category || raw.type || 'General').trim() || 'General';

  const rawSev = String(raw.severity || '').trim();
  const sevLower = rawSev.toLowerCase();
  const severity = Object.prototype.hasOwnProperty.call(PRIORITY_SCORES, sevLower)
    ? rawSev
    : 'low';

  const affected = Math.max(1, Math.floor(Number(raw.affected ?? raw.affectedCount ?? 1) || 1));
  const status = String(raw.status || 'Unverified').trim() || 'Unverified';
  const assignedTeam = raw.assignedTeam && raw.assignedTeam !== 'Unassigned' ? String(raw.assignedTeam).trim() : null;

  let assignedTeamId = raw.assignedTeamId ? String(raw.assignedTeamId).trim() : null;
  if (!assignedTeamId && assignedTeam && Array.isArray(teams) && teams.length > 0) {
    const match = teams.find(
      (t) => t?.name && String(t.name).trim().toLowerCase() === assignedTeam.toLowerCase()
    );
    if (match?.id) assignedTeamId = String(match.id);
  }

  const lat = Number(raw.coordinates?.lat ?? raw.coordinates?.latitude ?? raw.lat ?? raw.latitude);
  const lng = Number(raw.coordinates?.lng ?? raw.coordinates?.longitude ?? raw.lng ?? raw.longitude);
  const coordinates = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  const createdAt = raw.createdAt ?? raw.created_at ?? raw.arrivalTime ?? null;
  const arrivalParsed =
    typeof createdAt === 'number' && Number.isFinite(createdAt)
      ? createdAt
      : createdAt
        ? Date.parse(createdAt)
        : NaN;

  const requestedResources = normalizeRequestedForAdapter(raw.requestedResources);

  return {
    id: pid,
    pid,
    title,
    category,
    severity,
    affected,
    status,
    assignedTeam,
    assignedTeamId,
    createdAt,
    arrivalTime: Number.isFinite(arrivalParsed) ? arrivalParsed : undefined,
    coordinates,
    ...(requestedResources ? { requestedResources } : {})
  };
}

export function sanitizeRequestedResources(input) {
  if (!input) return null;
  if (typeof input === 'object' && !Array.isArray(input)) {
    const out = {};
    let hasPositive = false;
    for (const k of RESOURCE_KEYS) {
      if (input[k] === undefined || input[k] === null || input[k] === '') continue;
      const n = Math.floor(Number(input[k]));
      if (Number.isFinite(n) && n >= 1) {
        out[k] = Math.min(20, n);
        hasPositive = true;
      } else if (Number.isFinite(n) && n === 0) {
        out[k] = 0;
      }
    }
    return hasPositive || Object.keys(out).length > 0 ? out : null;
  }
  return null;
}

export function sanitizeOtherNeeds(input) {
  if (!Array.isArray(input)) return [];
  const cleaned = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const text = item.trim().slice(0, 80);
    if (text && !cleaned.includes(text)) {
      cleaned.push(text);
      if (cleaned.length >= 10) break;
    }
  }
  return cleaned;
}

/**
 * LiveDataSource coordinator (supports REST+WS, PostgreSQL polling, or direct hooks).
 */
export function createLiveDataSource({
  fetchIncidents,
  fetchTeams,
  fetchResources,
  subscribe,
  liveOs,
  pollIntervalMs = 10_000,
  onSnapshot = null,
  onEventLog = null
} = {}) {
  const incidentVersions = new Map();
  let pollTimer = null;
  let backoffTimer = null;
  let backoffMs = 1000;
  let unsubscribe = null;
  let stopped = false;

  const emitSnap = () => {
    const snap = liveOs.getSnapshot();
    if (typeof onSnapshot === 'function') onSnapshot(snap);
    return snap;
  };

  function scheduleBackoffRetry() {
    if (stopped || backoffTimer) return;
    const wait = backoffMs;
    backoffMs = Math.min(15_000, backoffMs * 2);
    backoffTimer = setTimeout(async () => {
      backoffTimer = null;
      if (!stopped) await syncNow({ isRetry: true });
    }, wait);
    backoffTimer.unref?.();
  }

  async function syncNow() {
    try {
      const [rawIncidents, rawTeams, rawResources] = await Promise.all([
        fetchIncidents ? fetchIncidents() : [],
        fetchTeams ? fetchTeams() : [],
        fetchResources ? fetchResources() : []
      ]);

      const mappedTeams = (rawTeams || []).map(mapTeam).filter((t) => t.id);
      const mappedIncidents = (rawIncidents || []).map((inc) => mapIncident(inc, mappedTeams)).filter((i) => i.pid);

      if (rawResources && rawResources.length > 0) {
        const resMap = mapResourceRows(rawResources);
        liveOs.setTotals(resMap.total);
      }

      liveOs.syncFromStore(mappedIncidents, mappedTeams, Date.now());
      for (const inc of mappedIncidents) {
        const ts = Date.parse(inc.updatedAt || inc.createdAt || '') || Date.now();
        incidentVersions.set(inc.pid, Math.max(incidentVersions.get(inc.pid) || 0, ts));
      }
      liveOs.setStale(false, 'Synchronized with live data source.');
      backoffMs = 1000;
      if (backoffTimer) {
        clearTimeout(backoffTimer);
        backoffTimer = null;
      }
      return { ok: true, snapshot: emitSnap() };
    } catch (err) {
      liveOs.setStale(true, `Live source unreachable: ${err?.message || 'connection error'}`);
      scheduleBackoffRetry();
      return { ok: false, error: err?.message || 'sync failed', snapshot: emitSnap() };
    }
  }

  function isOlderEvent(pid, rawPayload) {
    if (!pid || !rawPayload) return false;
    const rawTs = rawPayload.updatedAt ?? rawPayload.timestamp ?? rawPayload.incident?.updatedAt;
    if (!rawTs) return false;
    const ts = typeof rawTs === 'number' ? rawTs : Date.parse(rawTs);
    if (!Number.isFinite(ts)) return false;
    const prev = incidentVersions.get(pid);
    if (prev !== undefined && ts < prev) {
      return true;
    }
    incidentVersions.set(pid, ts);
    return false;
  }

  function handleEvent(type, payload = {}, now = Date.now()) {
    if (onEventLog) onEventLog(type, payload);
    const evType = String(type || '').trim();
    if (!evType) return null;

    const rawInc = payload.incident || (payload.id && payload.title ? payload : null);
    const pid = String(payload.incidentId || rawInc?.id || payload.pid || '').trim();

    if (pid && isOlderEvent(pid, payload)) {
      return { ignored: true, reason: 'older_event' };
    }

    const mappedTeamsSnapshot = [...liveOs._internal.teams.values()];
    const mappedInc = rawInc ? mapIncident(rawInc, mappedTeamsSnapshot) : null;

    switch (evType) {
      case 'INCIDENT_CREATED':
      case 'new_citizen_sos':
      case 'incident_reported':
      case 'new_rescue_sos': {
        if (!mappedInc) return null;
        if (mappedInc.status === 'Resolved') return liveOs.complete(mappedInc.pid, now);
        liveOs.admit(mappedInc, now);
        return emitSnap();
      }
      case 'INCIDENT_VERIFIED':
      case 'incident_verified': {
        if (mappedInc) liveOs.updateFromIncident(mappedInc, now);
        return emitSnap();
      }
      case 'INCIDENT_ASSIGNED':
      case 'incident_assigned': {
        if (mappedInc && !liveOs._internal.pcbs.has(mappedInc.pid)) {
          liveOs.admit(mappedInc, now);
        }
        const teamPayload = payload.team
          ? mapTeam(payload.team)
          : (payload.teamId || mappedInc?.assignedTeamId || mappedInc?.assignedTeam)
            ? {
                id: payload.teamId || mappedInc?.assignedTeamId || mappedInc?.assignedTeam,
                name: payload.teamName || mappedInc?.assignedTeam || payload.teamId,
                status: 'Available'
              }
            : null;
        if (pid && teamPayload) {
          const existingPcb = liveOs._internal.pcbs.get(pid);
          if (existingPcb?.state === 'RUNNING') {
            liveOs.assign(pid, teamPayload, now);
          } else {
            const res = liveOs.dispatch(pid, teamPayload, now);
            if (!res.success && mappedInc) {
              // Historical external assignment fallback: mark RUNNING safely without dropping history
              liveOs.syncTeams([teamPayload]);
              const pcb = liveOs._internal.pcbs.get(pid);
              if (pcb) {
                pcb.state = 'RUNNING';
                pcb.teamId = teamPayload.id;
                pcb.dispatchedAt = pcb.dispatchedAt ?? now;
              }
            }
          }
        }
        return emitSnap();
      }
      case 'INCIDENT_STATUS_UPDATED':
      case 'incident_status_changed': {
        const status = String(payload.status || mappedInc?.status || '').trim();
        if (status === 'Resolved') {
          if (pid) liveOs.complete(pid, now);
        } else if (mappedInc) {
          liveOs.updateFromIncident(mappedInc, now);
        }
        return emitSnap();
      }
      case 'TEAM_UPDATED':
      case 'team_telemetry_update':
      case 'team_registered': {
        const teamList = payload.teams
          ? payload.teams.map(mapTeam)
          : payload.team
            ? [mapTeam(payload.team)]
            : payload.teamId
              ? [mapTeam({ id: payload.teamId, status: payload.status, name: payload.name || payload.teamId })]
              : [];
        if (teamList.length > 0) liveOs.syncTeams(teamList);
        return emitSnap();
      }
      case 'RESOURCES_UPDATED': {
        if (Array.isArray(payload.resources)) {
          const resMap = mapResourceRows(payload.resources);
          liveOs.setTotals(resMap.total);
        } else if (payload.totals) {
          liveOs.setTotals(payload.totals);
        }
        return emitSnap();
      }
      default:
        // Unknown message types handled safely without throwing
        return { ignored: true, type: evType };
    }
  }

  async function start() {
    stopped = false;
    await syncNow();
    if (typeof subscribe === 'function') {
      unsubscribe = subscribe(
        (type, payload) => handleEvent(type, payload),
        (connected) => {
          if (!connected) {
            liveOs.setStale(true, 'Live event channel disconnected; retrying...');
            scheduleBackoffRetry();
          } else {
            syncNow();
          }
        }
      );
    }
    if (pollIntervalMs > 0) {
      pollTimer = setInterval(() => {
        if (!stopped) syncNow();
      }, pollIntervalMs);
      pollTimer.unref?.();
    }
  }

  function stop() {
    stopped = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (backoffTimer) {
      clearTimeout(backoffTimer);
      backoffTimer = null;
    }
    if (typeof unsubscribe === 'function') {
      unsubscribe();
      unsubscribe = null;
    }
  }

  return {
    start,
    stop,
    syncNow,
    handleEvent
  };
}
