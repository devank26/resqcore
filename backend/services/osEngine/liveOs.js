/**
 * ResQCore OS Concepts Engine — Module C: Live OS Layer (createLiveOs factory)
 * Pure state machine (no DB, no HTTP inside). Receives callbacks/snapshots cleanly.
 */
import {
  RESOURCE_KEYS,
  RESOURCE_LABELS,
  DEFAULT_POOL,
  QUEUE_CAPACITY,
  emptyVector,
  normalizeVector,
  cloneVector,
  addVectors,
  scoreIncident,
  need,
  findSafeSequence,
  requestIsSafe
} from './osMonitor.js';

const MAX_REQUESTED_RESOURCE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function clampInt(value, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function parseTimestampMs(raw, fallback) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function computeDemand(incident = {}, poolTotal = DEFAULT_POOL) {
  const total = normalizeVector(poolTotal);
  const reqRaw = incident.requestedResources;
  const rawDemand = emptyVector();

  let hasExplicit = false;
  if (reqRaw && typeof reqRaw === 'object' && !Array.isArray(reqRaw)) {
    const keys = Object.keys(reqRaw);
    if (keys.length > 0) {
      hasExplicit = true;
      for (const key of RESOURCE_KEYS) {
        if (reqRaw[key] !== undefined && reqRaw[key] !== null && reqRaw[key] !== '') {
          rawDemand[key] = clampInt(reqRaw[key], 0, MAX_REQUESTED_RESOURCE);
        }
      }
    }
  } else if (Array.isArray(reqRaw) && reqRaw.length > 0) {
    for (const item of reqRaw) {
      const mapped = ARRAY_ID_TO_KEY[String(item?.resourceId || item?.id || '').toLowerCase()];
      const qty = clampInt(item?.quantity ?? 0, 0, MAX_REQUESTED_RESOURCE);
      if (mapped && qty > 0) {
        rawDemand[mapped] = clampInt(rawDemand[mapped] + qty, 0, MAX_REQUESTED_RESOURCE);
        hasExplicit = true;
      }
    }
  }

  if (!hasExplicit) {
    const severity = String(incident.severity || 'low').trim().toLowerCase();
    const category = String(incident.category || incident.type || '').trim().toLowerCase();
    const affected = Math.max(1, Number(incident.affected ?? incident.affectedCount ?? 1) || 1);

    const needsAmbulance =
      severity === 'critical' ||
      severity === 'high' ||
      /(medical|fire|accident|quake|collapse|sos|distress)/.test(category);
    const needsBoat = /(flood|water|boat|river|coastal|inundation)/.test(category);

    rawDemand.ambulances = needsAmbulance ? (severity === 'critical' ? 2 : 1) : 0;
    rawDemand.boats = needsBoat ? (severity === 'critical' ? 2 : 1) : 0;
    rawDemand.medicalKits = Math.min(10, Math.max(1, Math.ceil(affected / 20)));
    rawDemand.foodPacks = Math.min(50, Math.ceil(affected / 2));
  }

  const demand = emptyVector();
  const clampedFields = [];
  for (const key of RESOURCE_KEYS) {
    if (rawDemand[key] > total[key]) {
      demand[key] = total[key];
      clampedFields.push(`${key}: ${rawDemand[key]}->${total[key]}`);
    } else {
      demand[key] = rawDemand[key];
    }
  }

  return { demand, clamped: clampedFields.length > 0, clampedFields };
}

export function createLiveOs(options = {}) {
  const queueCapacity = Number.isInteger(options.queueCapacity) && options.queueCapacity > 0
    ? options.queueCapacity
    : QUEUE_CAPACITY;
  const maxEvents = Number.isInteger(options.maxEvents) && options.maxEvents > 0
    ? options.maxEvents
    : 60;
  const maxStartupAgeMs = Number.isFinite(options.maxStartupAgeMs) ? options.maxStartupAgeMs : DAY_MS;
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;

  const initialTotal = options.total ? normalizeVector(options.total) : cloneVector(DEFAULT_POOL);

  const pcbs = new Map();
  const teams = new Map();
  const teamLocks = new Set();
  const events = [];
  let eventSeq = 1;
  let stale = false;
  let lastUpdated = Date.now();
  let lastMessage = 'OS Engine initialized and ready.';

  const banker = {
    total: cloneVector(initialTotal),
    available: cloneVector(initialTotal),
    processes: [],
    lastRequest: null
  };

  function logEvent(type, message, pid = null, timestamp = Date.now()) {
    const entry = {
      id: `osev-${eventSeq++}`,
      type,
      message,
      pid: pid || null,
      timestamp: typeof timestamp === 'number' ? new Date(timestamp).toISOString() : String(timestamp)
    };
    events.unshift(entry);
    if (events.length > maxEvents) events.length = maxEvents;
    lastMessage = message;
    lastUpdated = Date.now();
    if (onEvent) {
      try {
        onEvent(entry);
      } catch (_) {
        /* never fail engine on audit hook errors */
      }
    }
    return entry;
  }

  function resolveTeamRecord(teamOrId) {
    if (!teamOrId) return null;
    if (typeof teamOrId === 'string') {
      const existing = teams.get(teamOrId);
      if (existing) return existing;
      for (const t of teams.values()) {
        if (t.name && t.name.toLowerCase() === teamOrId.toLowerCase()) return t;
      }
      const created = { id: teamOrId, name: teamOrId, status: 'Available', assignedPid: null };
      teams.set(created.id, created);
      return created;
    }
    const id = String(teamOrId.id || teamOrId.teamId || '').trim();
    if (!id) return null;
    const prev = teams.get(id);
    if (prev) {
      if (teamOrId.name) prev.name = teamOrId.name;
      return prev;
    }
    const created = {
      id,
      name: teamOrId.name || id,
      status: teamOrId.status || 'Available',
      assignedPid: teamOrId.assignedPid ?? null
    };
    teams.set(id, created);
    return created;
  }

  function ensureBankerProcess(pcb) {
    const existing = banker.processes.find((p) => p.pid === pcb.pid);
    if (!existing) {
      banker.processes.push({
        pid: pcb.pid,
        maximum: cloneVector(pcb.maximum),
        allocation: cloneVector(pcb.allocation)
      });
    }
  }

  function admit(incident, now = Date.now(), { startupMode = false } = {}) {
    const pid = String(incident?.pid || incident?.id || '').trim();
    if (!pid) {
      return { accepted: false, status: 400, message: 'Incident id (pid) is required.' };
    }
    if (pcbs.has(pid)) {
      return { accepted: true, duplicate: true, pcb: pcbs.get(pid) };
    }

    let arrivalTime = parseTimestampMs(incident.arrivalTime ?? incident.createdAt, now);
    if (startupMode && now - arrivalTime > maxStartupAgeMs) {
      arrivalTime = now;
    }

    const category = String(incident.category || incident.type || 'General').trim() || 'General';
    const severity = String(incident.severity || 'Low').trim() || 'Low';
    const affected = Math.max(1, Number(incident.affected ?? incident.affectedCount ?? 1) || 1);
    const { demand, clamped, clampedFields } = computeDemand(
      { severity, category, affected, requestedResources: incident.requestedResources },
      banker.total
    );

    const scored = scoreIncident({ severity, category, affected, arrivalTime, state: 'READY' }, now);

    const pcb = {
      pid,
      title: String(incident.title || pid),
      category,
      severity,
      affected,
      state: 'READY',
      teamId: null,
      basePriority: scored.basePriority,
      arrivalTime,
      dispatchedAt: null,
      completedAt: null,
      maximum: cloneVector(demand),
      allocation: emptyVector(),
      request: cloneVector(demand),
      agingBoost: scored.agingBoost,
      effectiveScore: scored.effectiveScore,
      priorityTier: scored.priorityTier,
      waitTimeSeconds: scored.waitTimeSeconds
    };

    pcbs.set(pid, pcb);
    ensureBankerProcess(pcb);
    logEvent(
      'SOS_ARRIVED',
      `${pid} admitted (${pcb.severity}, P=${pcb.effectiveScore} ${pcb.priorityTier}).`,
      pid,
      now
    );

    if (clamped) {
      logEvent(
        'DEMAND_CLAMPED',
        `${pid} resource demand clamped to pool total (${clampedFields.join(', ')}).`,
        pid,
        now
      );
    }

    return { accepted: true, duplicate: false, pcb };
  }

  function updateFromIncident(incident, now = Date.now()) {
    const pid = String(incident?.pid || incident?.id || '').trim();
    if (!pid) return null;
    const status = String(incident.status || 'Unverified');
    if (status === 'Resolved') {
      return complete(pid, now);
    }
    if (!pcbs.has(pid)) {
      admit(incident, now);
    }
    const pcb = pcbs.get(pid);
    if (pcb && pcb.state !== 'TERMINATED') {
      pcb.title = String(incident.title || pcb.title);
      pcb.severity = String(incident.severity || pcb.severity);
      pcb.category = String(incident.category || incident.type || pcb.category);
      pcb.affected = Math.max(1, Number(incident.affected ?? incident.affectedCount ?? pcb.affected) || 1);
      const rescored = scoreIncident(pcb, now);
      pcb.basePriority = rescored.basePriority;
      pcb.agingBoost = rescored.agingBoost;
      pcb.effectiveScore = rescored.effectiveScore;
      pcb.priorityTier = rescored.priorityTier;
      pcb.waitTimeSeconds = rescored.waitTimeSeconds;
    }
    return pcb;
  }

  function dispatch(pid, team, now = Date.now()) {
    const pcb = pcbs.get(pid);
    if (!pcb) {
      return { success: false, status: 404, message: `Incident ${pid} not found.`, priorityInversion: false };
    }
    if (pcb.state !== 'READY') {
      return {
        success: false,
        status: 409,
        message: `Incident ${pid} is already ${pcb.state}.`,
        priorityInversion: false
      };
    }

    const teamRecord = resolveTeamRecord(team);
    if (!teamRecord) {
      return { success: false, status: 400, message: 'Valid team is required.', priorityInversion: false };
    }

    if (teamLocks.has(teamRecord.id) || teamRecord.status !== 'Available') {
      const msg = `Team ${teamRecord.name} is locked or not Available (${teamRecord.status}).`;
      logEvent('LOCK_DENIED', msg, pid, now);
      return { success: false, status: 409, message: msg, priorityInversion: false };
    }

    teamLocks.add(teamRecord.id);
    try {
      // Evaluate current READY queue scores at `now`
      const currentScore = scoreIncident(pcb, now).effectiveScore;
      let topReady = null;
      let topScore = -Infinity;
      for (const candidate of pcbs.values()) {
        if (candidate.state !== 'READY') continue;
        const cScore = scoreIncident(candidate, now).effectiveScore;
        if (
          cScore > topScore ||
          (cScore === topScore && candidate.arrivalTime < (topReady?.arrivalTime ?? Infinity))
        ) {
          topReady = candidate;
          topScore = cScore;
        }
      }

      const priorityInversion = Boolean(topReady && topReady.pid !== pid && topScore > currentScore);
      if (priorityInversion) {
        logEvent(
          'PRIORITY_INVERSION',
          `Dispatching ${pid} (score ${currentScore}) ahead of higher-priority ${topReady.pid} (score ${topScore}).`,
          pid,
          now
        );
      }

      ensureBankerProcess(pcb);
      const safety = requestIsSafe(banker, pid, pcb.request);
      banker.lastRequest = {
        pid,
        request: cloneVector(pcb.request),
        granted: safety.granted,
        reason: safety.reason,
        safeSequence: safety.safeSequence || [],
        timestamp: new Date(now).toISOString()
      };

      if (!safety.granted) {
        const msg = `Allocation denied for ${pid}: ${safety.reason}`;
        logEvent('ALLOCATION_DENIED', msg, pid, now);
        return {
          success: false,
          status: 409,
          message: msg,
          reason: safety.reason,
          priorityInversion
        };
      }

      pcb.state = 'RUNNING';
      pcb.teamId = teamRecord.id;
      pcb.dispatchedAt = now;
      pcb.allocation = cloneVector(pcb.request);
      const rescored = scoreIncident(pcb, now);
      pcb.effectiveScore = rescored.effectiveScore;
      pcb.priorityTier = rescored.priorityTier;
      pcb.waitTimeSeconds = rescored.waitTimeSeconds;
      pcb.agingBoost = rescored.agingBoost;

      teamRecord.status = 'Deployed';
      teamRecord.assignedPid = pid;

      const msg = `${pid} dispatched to ${teamRecord.name} (${teamRecord.id}).`;
      logEvent('DISPATCHED', msg, pid, now);

      return {
        success: true,
        status: 200,
        message: msg,
        priorityInversion,
        pcb,
        safeSequence: safety.safeSequence
      };
    } finally {
      teamLocks.delete(teamRecord.id);
    }
  }

  function assign(pid, team, now = Date.now()) {
    const pcb = pcbs.get(pid);
    if (pcb && pcb.state === 'RUNNING') {
      const targetTeam = resolveTeamRecord(team);
      if (!targetTeam) {
        return { success: false, status: 400, message: 'Valid team is required.', priorityInversion: false };
      }
      if (pcb.teamId === targetTeam.id) {
        return { success: true, status: 200, message: `${pid} already assigned to ${targetTeam.name}.`, priorityInversion: false, pcb };
      }
      if (teamLocks.has(targetTeam.id) || targetTeam.status !== 'Available') {
        const msg = `Team ${targetTeam.name} is locked or not Available (${targetTeam.status}).`;
        logEvent('LOCK_DENIED', msg, pid, now);
        return { success: false, status: 409, message: msg, priorityInversion: false };
      }

      const oldTeam = pcb.teamId ? teams.get(pcb.teamId) : null;
      if (oldTeam) {
        oldTeam.status = 'Available';
        oldTeam.assignedPid = null;
      }

      pcb.teamId = targetTeam.id;
      targetTeam.status = 'Deployed';
      targetTeam.assignedPid = pid;

      const msg = `${pid} reassigned from ${oldTeam?.name || 'previous unit'} to ${targetTeam.name}.`;
      logEvent('REASSIGNED', msg, pid, now);
      return { success: true, status: 200, message: msg, priorityInversion: false, pcb };
    }

    return dispatch(pid, team, now);
  }

  function complete(pid, now = Date.now()) {
    const pcb = pcbs.get(pid);
    if (!pcb) {
      return { success: true, ignored: true, message: `Unknown process ${pid} ignored.` };
    }
    if (pcb.state === 'TERMINATED') {
      return { success: true, alreadyTerminated: true, pcb };
    }

    if (pcb.state === 'RUNNING') {
      banker.available = addVectors(banker.available, pcb.allocation);
      pcb.allocation = emptyVector();
    }

    banker.processes = banker.processes.filter((p) => p.pid !== pid);

    if (pcb.teamId) {
      const t = teams.get(pcb.teamId);
      if (t) {
        t.status = 'Available';
        if (t.assignedPid === pid || !t.assignedPid) {
          t.assignedPid = null;
        }
      }
    }

    pcb.state = 'TERMINATED';
    pcb.completedAt = now;
    const rescored = scoreIncident(pcb, now);
    pcb.waitTimeSeconds = rescored.waitTimeSeconds;

    const msg = `${pid} completed and resources/team released.`;
    logEvent('COMPLETED', msg, pid, now);
    return { success: true, pcb };
  }

  function syncTeams(teamList = []) {
    const incomingIds = new Set();
    for (const raw of teamList) {
      const id = String(raw?.id || '').trim();
      if (!id) continue;
      incomingIds.add(id);
      const existing = teams.get(id);
      const status = String(raw.status || 'Available');
      const assignedPid = status === 'Available' ? null : (existing?.assignedPid ?? raw.task ?? null);
      teams.set(id, {
        id,
        name: String(raw.name || id),
        status,
        assignedPid
      });
    }
    lastUpdated = Date.now();
  }

  function setTotals(partial = {}) {
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
      return { success: false, status: 400, message: 'Resource totals must be a JSON object.' };
    }

    const entries = Object.entries(partial).filter(([k]) => RESOURCE_KEYS.includes(k));
    if (entries.length === 0) {
      return {
        success: false,
        status: 400,
        message: `Provide at least one resource key: ${RESOURCE_KEYS.join(', ')}.`
      };
    }

    const allocated = emptyVector();
    for (const proc of banker.processes) {
      for (const key of RESOURCE_KEYS) {
        allocated[key] += proc.allocation[key] || 0;
      }
    }

    for (const [key, rawVal] of entries) {
      if (typeof rawVal === 'boolean' || rawVal === null || rawVal === '') {
        return { success: false, status: 400, message: `${key} must be a non-negative integer.` };
      }
      const val = Number(rawVal);
      if (!Number.isInteger(val) || val < 0) {
        return { success: false, status: 400, message: `${key} must be a non-negative integer.` };
      }
      if (val < allocated[key]) {
        return {
          success: false,
          status: 409,
          message: `Cannot lower ${RESOURCE_LABELS[key]} total to ${val} while ${allocated[key]} are allocated.`
        };
      }
    }

    for (const [key, rawVal] of entries) {
      const val = Number(rawVal);
      banker.total[key] = val;
      banker.available[key] = val - allocated[key];
    }

    logEvent('POOL_UPDATED', `Resource pool totals updated (${entries.map(([k, v]) => `${k}=${v}`).join(', ')}).`);
    return {
      success: true,
      status: 200,
      total: cloneVector(banker.total),
      available: cloneVector(banker.available)
    };
  }

  function syncFromStore(incidents = [], teamList = [], now = Date.now(), { seedEvents = null } = {}) {
    pcbs.clear();
    teams.clear();
    teamLocks.clear();
    banker.processes = [];
    banker.available = cloneVector(banker.total);
    banker.lastRequest = null;

    if (Array.isArray(seedEvents) && events.length === 0) {
      for (const ev of seedEvents.slice(0, maxEvents)) {
        events.push(ev);
      }
    }

    syncTeams(teamList);

    for (const rawInc of incidents) {
      if (!rawInc) continue;
      if (String(rawInc.status || '').trim() === 'Resolved') continue;

      const adm = admit(rawInc, now, { startupMode: true });
      if (!adm.accepted || !adm.pcb) continue;
      const pcb = adm.pcb;

      const hasAssignedTeam = Boolean(
        (rawInc.assignedTeamId && String(rawInc.assignedTeamId).trim()) ||
        (rawInc.assignedTeam && String(rawInc.assignedTeam).trim() && rawInc.assignedTeam !== 'Unassigned')
      );
      const isActiveStatus = String(rawInc.status || 'Unverified') !== 'Unverified';

      if (isActiveStatus && hasAssignedTeam) {
        const teamLookup = rawInc.assignedTeamId
          ? teams.get(rawInc.assignedTeamId) || { id: rawInc.assignedTeamId, name: rawInc.assignedTeam || rawInc.assignedTeamId, status: 'Available' }
          : [...teams.values()].find((t) => t.name.toLowerCase() === String(rawInc.assignedTeam).toLowerCase()) ||
            { id: String(rawInc.assignedTeam), name: String(rawInc.assignedTeam), status: 'Available' };

        const teamRec = resolveTeamRecord(teamLookup);
        ensureBankerProcess(pcb);
        const safety = requestIsSafe(banker, pcb.pid, pcb.request);

        pcb.state = 'RUNNING';
        pcb.teamId = teamRec?.id || null;
        pcb.dispatchedAt = pcb.arrivalTime;
        if (safety.granted) {
          pcb.allocation = cloneVector(pcb.request);
        } else {
          pcb.allocation = emptyVector();
          logEvent(
            'SYNC_ZERO_ALLOC',
            `${pcb.pid} rebuilt RUNNING on ${teamRec?.name || 'team'} with 0 resource allocation (${safety.reason}).`,
            pcb.pid,
            now
          );
        }

        if (teamRec) {
          teamRec.status = 'Deployed';
          teamRec.assignedPid = pcb.pid;
        }
      }
    }

    stale = false;
    lastUpdated = now;
  }

  function setStale(isStale, message = null) {
    stale = Boolean(isStale);
    if (message) lastMessage = message;
    lastUpdated = Date.now();
  }

  function getSnapshot(now = Date.now()) {
    const scoredPcbs = [];
    const readyList = [];
    const runningPids = [];

    for (const pcb of pcbs.values()) {
      const s = scoreIncident(pcb, now);
      pcb.basePriority = s.basePriority;
      pcb.agingBoost = s.agingBoost;
      pcb.effectiveScore = s.effectiveScore;
      pcb.priorityTier = s.priorityTier;
      pcb.waitTimeSeconds = s.waitTimeSeconds;

      const viewPcb = {
        pid: pcb.pid,
        title: pcb.title,
        category: pcb.category,
        severity: pcb.severity,
        affected: pcb.affected,
        state: pcb.state,
        teamId: pcb.teamId,
        basePriority: pcb.basePriority,
        agingBoost: pcb.agingBoost,
        effectiveScore: pcb.effectiveScore,
        priorityTier: pcb.priorityTier,
        waitTimeSeconds: pcb.waitTimeSeconds,
        maximum: cloneVector(pcb.maximum),
        allocation: cloneVector(pcb.allocation),
        request: cloneVector(pcb.request),
        arrivalTime: pcb.arrivalTime,
        dispatchedAt: pcb.dispatchedAt,
        completedAt: pcb.completedAt
      };
      scoredPcbs.push(viewPcb);

      if (pcb.state === 'READY') readyList.push(viewPcb);
      else if (pcb.state === 'RUNNING') runningPids.push(pcb.pid);
    }

    readyList.sort((a, b) => {
      if (b.effectiveScore !== a.effectiveScore) return b.effectiveScore - a.effectiveScore;
      return a.arrivalTime - b.arrivalTime;
    });

    const bankerProcs = banker.processes.map((p) => ({
      pid: p.pid,
      maximum: cloneVector(p.maximum),
      allocation: cloneVector(p.allocation),
      need: need(p)
    }));
    const safety = findSafeSequence(banker.processes, banker.available);

    const dispatchedPcbs = scoredPcbs.filter((p) => p.dispatchedAt != null);
    const completedPcbs = scoredPcbs.filter((p) => p.completedAt != null);
    const avgSec = (arr, fn) =>
      arr.length ? Math.round((arr.reduce((sum, item) => sum + fn(item), 0) / arr.length / 1000) * 100) / 100 : 0;

    return {
      live: true,
      stale,
      lastUpdated: new Date(lastUpdated).toISOString(),
      queueCapacity,
      queueCount: readyList.length,
      overCapacity: readyList.length > queueCapacity,
      readyQueue: readyList.map((p) => p.pid),
      runningPids,
      processes: scoredPcbs,
      teams: [...teams.values()].map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        assignedPid: t.assignedPid,
        locked: teamLocks.has(t.id) || Boolean(t.assignedPid) || t.status === 'Deployed'
      })),
      banker: {
        total: cloneVector(banker.total),
        available: cloneVector(banker.available),
        resourceNames: [...RESOURCE_KEYS],
        processes: bankerProcs,
        safeSequence: safety.sequence,
        isSafe: safety.safe,
        lastRequest: banker.lastRequest ? { ...banker.lastRequest } : null
      },
      metrics: {
        totalProcesses: scoredPcbs.length,
        dispatched: dispatchedPcbs.length,
        completed: completedPcbs.length,
        avgResponseSeconds: avgSec(dispatchedPcbs, (p) => Math.max(0, p.dispatchedAt - p.arrivalTime)),
        avgTurnaroundSeconds: avgSec(completedPcbs, (p) => Math.max(0, p.completedAt - p.arrivalTime))
      },
      events: events.slice(0, maxEvents),
      message: lastMessage
    };
  }

  return {
    admit,
    updateFromIncident,
    dispatch,
    assign,
    complete,
    syncFromStore,
    syncTeams,
    setTotals,
    setStale,
    getSnapshot,
    // exposed for unit assertions & tests
    _internal: { pcbs, teams, teamLocks, banker, events }
  };
}
