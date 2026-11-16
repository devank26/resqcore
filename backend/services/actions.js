import crypto from 'crypto';
import { dbManager as db } from './database.js';
import { eventBus } from './eventBus.js';
import { AUTH_TOKENS } from './config.js';
import {
  checkBankersSafety,
  sanitizeRequestedResources,
  sanitizeOtherNeeds,
  mapIncident,
  mapTeam,
  suggestTeams,
  compareSchedulers,
  incidentsToProcesses,
  DEMO_WORKLOAD,
  getBuiltInDeadlockScenarios,
  buildDeadlockFromLive,
  producerConsumerDemo,
  RESOURCE_KEYS,
  RESOURCE_LABELS,
  KEY_TO_DB_ID
} from './osEngine/index.js';
import {
  liveOs,
  osVectorToDbAllocations,
  broadcastOsLive,
  getOsLiveSnapshot
} from './osEngine/runtime.js';
import { computeOperationalIntelligence } from './intelligence.js';
import {
  HttpError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  cleanString,
  oneOf,
  parseCoords
} from './errors.js';

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const INCIDENT_STATUSES = ['Unverified', 'Verified', 'Responding', 'On site', 'Monitoring', 'Escalated', 'Resolved'];
const RESCUE_ALLOWED_STATUSES = ['Responding', 'On site', 'Monitoring', 'Escalated', 'Resolved'];
const TEAM_STATUSES = ['Available', 'Standby', 'Deployed', 'Returning', 'Offline', 'SOS'];
const VOLUNTEER_STATUSES = ['Available', 'Assigned', 'Deployed', 'Offline'];
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const CHANNEL_RE = /^[A-Za-z0-9:_-]{1,64}$/;

const numberInRange = (val, min, max, field) => {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${field} must be between ${min} and ${max}`);
  return n;
};

const initialsOf = (name) =>
  String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('') || 'RC';

function mapPgLockOrResourceError(err) {
  const msg = String(err?.message || '');
  if (msg.startsWith('team_locked') || msg.startsWith('insufficient_resource')) {
    return conflict(msg);
  }
  if (msg.startsWith('team_not_found') || msg.startsWith('incident_not_found') || msg.startsWith('resource_not_found')) {
    return notFound(msg);
  }
  return err;
}

function emitTeamUpdate(team) {
  if (!team) return;
  eventBus.emitRealtime('team_telemetry_update', {
    teamId: team.id,
    team,
    status: team.status,
    battery: team.battery,
    lat: team.coordinates?.lat ?? null,
    lng: team.coordinates?.lng ?? null,
    coordinates: team.coordinates,
    task: team.task,
    eta: team.eta,
    sectorId: team.sectorId,
    timestamp: team.lastUpdate
  });
}

function emitOsState() {
  return broadcastOsLive();
}

function emitIntelligenceUpdated(reason = 'update') {
  eventBus.emitRealtime('intelligence_updated', {
    reason,
    at: new Date().toISOString()
  });
}

function syncTeamRecord(team) {
  if (!team) return;
  liveOs.syncTeams([mapTeam(team)]);
}

function formatRequestedSummary(requestedResources, otherNeeds = []) {
  const parts = [];
  if (Array.isArray(requestedResources) && requestedResources.length > 0) {
    parts.push(`Requested: ${requestedResources.map((r) => `${r.name || r.resourceId} x${r.quantity}`).join(', ')}`);
  } else if (requestedResources && typeof requestedResources === 'object') {
    const entries = RESOURCE_KEYS
      .filter((k) => Number(requestedResources[k] || 0) > 0)
      .map((k) => `${RESOURCE_LABELS[k] || k} x${requestedResources[k]}`);
    if (entries.length > 0) parts.push(`Requested: ${entries.join(', ')}`);
  }
  if (Array.isArray(otherNeeds) && otherNeeds.length > 0) {
    parts.push(`Other needs: ${otherNeeds.join(', ')}`);
  }
  return parts.length ? ` · ${parts.join(' · ')}` : '';
}

// ============================== auth / login ==============================

export async function login(body = {}) {
  const role = oneOf(body.role || 'rescue', ['command', 'rescue', 'citizen'], { field: 'role' });
  const name = cleanString(body.name, { max: 80, field: 'name' }) || `${role.toUpperCase()} Operator`;

  let team = null;
  if (role === 'rescue') {
    const teamName = cleanString(body.teamName ?? body.team?.name, { max: 80, field: 'teamName' }) || name;
    const callsign = cleanString(body.callsign ?? body.team?.callsign, { max: 30, field: 'callsign' }) || null;
    const specialization = cleanString(body.specialization ?? body.team?.specialization, { max: 80, field: 'specialization' }) || 'SAR';
    const respondersRaw = body.responders ?? body.team?.responders;
    const responders = Number.isInteger(respondersRaw) && respondersRaw >= 1 && respondersRaw <= 100 ? respondersRaw : 4;

    const result = await db.findOrCreateTeam({
      teamId: body.teamId || body.team?.id || null,
      name: teamName,
      callsign,
      specialization,
      responders,
      createdBy: name
    });
    team = result.team;
    syncTeamRecord(team);
    if (result.created) {
      eventBus.emitRealtime('team_registered', { team });
      emitOsState();
      emitIntelligenceUpdated('team_registered');
    }
  }

  return {
    success: true,
    role,
    user: { id: team ? `usr-${team.id}` : `usr-${role}`, name, role, teamId: team?.id || null },
    teamId: team?.id || null,
    team,
    token: AUTH_TOKENS[role] || null
  };
}

// ============================== incidents ==============================

function resolveCoords(body, team) {
  let coords = parseCoords(body.coordinates);
  if (!coords && (body.lat !== undefined || body.latitude !== undefined)) {
    coords = parseCoords({ lat: body.lat ?? body.latitude, lng: body.lng ?? body.longitude });
  }
  if (!coords && team?.coordinates) coords = { lat: team.coordinates.lat, lng: team.coordinates.lng };
  return coords;
}

async function createIncidentRecord(fields, { clientId } = {}) {
  const coords = fields.coords;
  const sector = coords ? await db.findSectorForPoint(coords.lat, coords.lng) : null;
  const base = {
    ...fields,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    sectorId: sector?.id ?? null,
    shortLocation: fields.location ? fields.location.split('·')[0].trim() : ''
  };
  if (clientId) return db.insertIncident({ ...base, id: clientId });

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.insertIncident({ ...base, id: db.generateIncidentId() });
    } catch (err) {
      if (!/unique|duplicate/i.test(err.message)) throw err;
    }
  }
  throw new HttpError(500, 'Could not allocate unique incident id');
}

export async function createCitizenSos(user, body) {
  const coords = resolveCoords(body, null);
  const description = cleanString(body.description, { max: 2000, field: 'description' });
  const title = cleanString(body.title, { max: 200, field: 'title' }) || 'Emergency SOS';
  const location =
    cleanString(body.location, { max: 300, field: 'location' }) ||
    cleanString(body.fullAddress, { max: 300, field: 'fullAddress' }) ||
    (coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : '');
  const affected = Number.isInteger(body.affected) && body.affected > 0 && body.affected <= 100000 ? body.affected : 1;
  const contactNumber = cleanString(body.contactNumber, { max: 30, field: 'contactNumber' }) || '';
  const severity = oneOf(body.severity, SEVERITIES, { field: 'severity', fallback: 'High' });
  const type = cleanString(body.type, { max: 50, field: 'type' }) || 'General';

  const otherNeeds = sanitizeOtherNeeds(body.otherNeeds);
  const rawResources = body.requestedResources ?? body.resources;
  let requestedResources = [];
  if (rawResources && !Array.isArray(rawResources) && typeof rawResources === 'object') {
    requestedResources = sanitizeRequestedResources(rawResources) || [];
  } else {
    const normalizedRequested = normalizeResourceRequests(rawResources);
    if (normalizedRequested.length > 0) {
      const { resources: catalog } = await db.getResourcesSnapshot();
      const byId = new Map(catalog.map((r) => [r.id, r]));
      requestedResources = normalizedRequested
        .filter((item) => byId.has(item.resourceId))
        .map((item) => {
          const res = byId.get(item.resourceId);
          const cap = Math.max(Number(res.total) || 100, 1);
          const quantity = Math.min(Math.max(1, item.quantity), cap);
          return { resourceId: item.resourceId, name: res.name, quantity };
        });
    }
  }
  const resourceSummary = formatRequestedSummary(requestedResources, otherNeeds);

  let clientId = null;
  if (body.id !== undefined && body.id !== null && body.id !== '') {
    if (typeof body.id !== 'string' || !CLIENT_ID_RE.test(body.id)) {
      throw badRequest('id must be 6-64 chars of [A-Za-z0-9_-]');
    }
    clientId = body.id;
    const existing = await db.getIncidentById(clientId);
    if (existing) {
      return { incident: existing, duplicate: true };
    }
  }

  const incident = await createIncidentRecord(
    {
      title,
      type,
      location,
      area: cleanString(body.fullAddress, { max: 300, field: 'fullAddress' }) || location,
      affected,
      severity,
      status: 'Unverified',
      responseSummary: 'Citizen SOS · Awaiting verification',
      responseDetail: 'Verify to respond',
      substatus: coords ? 'Awaiting triage by Command Center' : 'Awaiting triage · no GPS fix supplied',
      description: description || 'Emergency assistance requested.',
      fieldReport: `Citizen reported · Contact: ${contactNumber || 'N/A'}${resourceSummary}`,
      contactNumber,
      citizenName: cleanString(body.citizenName, { max: 100, field: 'citizenName' }) || user.name || 'Citizen',
      citizenUserId: user.id || null,
      isCitizenSOS: true,
      requestedResources,
      otherNeeds,
      createdBy: user.id || 'citizen',
      coords
    },
    { clientId }
  );

  liveOs.admit(mapIncident(incident));
  eventBus.emitRealtime('new_citizen_sos', incident);
  emitOsState();
  emitIntelligenceUpdated('new_citizen_sos');
  return { incident, duplicate: false };
}

export async function getIncidentById(id) {
  const incident = await db.getIncidentById(id);
  if (!incident) throw notFound('Incident not found');
  return incident;
}

export async function listIncidents({ status } = {}) {
  return db.getAllIncidents({ status });
}

export async function listCitizenRequests({ phone } = {}) {
  let list = await db.getAllIncidents();
  if (phone) {
    const clean = String(phone).replace(/\D/g, '');
    if (clean) {
      list = list.filter((r) => {
        const p = (r.contactNumber || '').replace(/\D/g, '');
        return p && (p.includes(clean) || clean.includes(p));
      });
    }
  }
  return list.filter((r) => r.isCitizenSOS);
}

function normalizeResourceRequests(rawResources) {
  if (!rawResources) return [];
  if (Array.isArray(rawResources)) {
    const merged = new Map();
    for (const r of rawResources) {
      const resourceId = String(r?.resourceId || r?.id || '').trim();
      const quantity = Math.floor(Number(r?.quantity ?? 0));
      if (!resourceId || !Number.isFinite(quantity) || quantity <= 0) continue;
      const prev = merged.get(resourceId);
      const maxNeedRaw = r?.maxNeed !== undefined ? Math.floor(Number(r.maxNeed)) : quantity;
      const maxNeed = Number.isFinite(maxNeedRaw) && maxNeedRaw >= quantity ? maxNeedRaw : quantity;
      if (prev) {
        prev.quantity += quantity;
        prev.maxNeed = Math.max(prev.maxNeed, prev.quantity, maxNeed);
      } else {
        merged.set(resourceId, { resourceId, quantity, maxNeed });
      }
    }
    return [...merged.values()];
  }
  if (typeof rawResources === 'object') {
    return Object.entries(rawResources)
      .map(([resourceId, q]) => [String(resourceId).trim(), Math.floor(Number(q))])
      .filter(([resourceId, q]) => resourceId && Number.isFinite(q) && q > 0)
      .map(([resourceId, q]) => ({ resourceId, quantity: q, maxNeed: q }));
  }
  return [];
}

export async function dispatchTeam(user, body) {
  const targetId = body.requestId || body.incidentId;
  if (!targetId) throw badRequest('incidentId (or requestId) is required');

  let team = null;
  if (body.teamId) team = await db.getTeamById(body.teamId);
  else if (body.teamName) team = await db.getTeamByName(body.teamName);
  else throw badRequest('teamId (or teamName) is required');
  if (!team) throw notFound('Team not found');

  const incident = await db.getIncidentById(targetId);
  if (!incident) throw notFound('Incident not found');
  if (incident.status === 'Resolved') throw conflict('Incident is already resolved');

  const eta = cleanString(body.eta, { max: 30, field: 'eta' }) || '10 min';
  const notes = cleanString(body.notes, { max: 500, field: 'notes' });
  const fieldReport = notes ? `${incident.fieldReport || ''} · ${notes}`.trim() : null;

  // Ensure live OS engine tracks this incident and reflects current DB team availability
  if (!liveOs._internal.pcbs.has(incident.id)) {
    liveOs.admit(mapIncident(incident));
  }
  const existingLiveTeam = liveOs._internal.teams.get(team.id);
  if (!existingLiveTeam || team.status !== 'Available' || existingLiveTeam.status === 'Available') {
    syncTeamRecord(team);
  }

  // Optional explicit DB resource items (e.g. drone, helicopter, or explicit dispatch override)
  const explicitResourceItems = normalizeResourceRequests(body.resources);
  const osIdSet = new Set(Object.values(KEY_TO_DB_ID));
  const extraResourceItems = explicitResourceItems.filter((item) => !osIdSet.has(item.resourceId));

  // If dispatching fresh and caller explicitly specified OS-tracked resource overrides, apply before Banker check
  const livePcbBefore = liveOs._internal.pcbs.get(incident.id);
  if (livePcbBefore && livePcbBefore.state === 'READY' && explicitResourceItems.length > 0) {
    const dbIdToKey = Object.fromEntries(Object.entries(KEY_TO_DB_ID).map(([k, v]) => [v, k]));
    let hasOsOverride = false;
    const overrideReq = { ...livePcbBefore.request };
    for (const item of explicitResourceItems) {
      const osKey = dbIdToKey[item.resourceId];
      if (osKey) {
        hasOsOverride = true;
        overrideReq[osKey] = Math.max(0, Math.min(liveOs._internal.banker.total[osKey] ?? item.quantity, item.quantity));
      }
    }
    if (hasOsOverride) {
      livePcbBefore.request = overrideReq;
      livePcbBefore.maximum = { ...overrideReq };
      const bp = liveOs._internal.banker.processes.find((p) => p.pid === incident.id);
      if (bp) bp.maximum = { ...overrideReq };
    }
  }

  // Check extra non-OS DB resources via Banker if supplied
  const snap = await db.getResourcesSnapshot();
  const catalogById = new Map(snap.resources.map((r) => [r.id, r]));
  if (extraResourceItems.length > 0) {
    const available = {};
    for (const r of snap.resources) available[r.id] = Number(r.available);

    const allocations = {};
    const maxNeeds = {};
    for (const row of snap.allocations) {
      allocations[row.incident_id] ||= {};
      maxNeeds[row.incident_id] ||= {};
      allocations[row.incident_id][row.resource_id] = (allocations[row.incident_id][row.resource_id] || 0) + Number(row.quantity);
      maxNeeds[row.incident_id][row.resource_id] = Math.max(
        maxNeeds[row.incident_id][row.resource_id] || 0,
        Number(row.max_need ?? row.quantity)
      );
    }

    const requestMap = {};
    maxNeeds[incident.id] ||= { ...(allocations[incident.id] || {}) };
    for (const item of extraResourceItems) {
      requestMap[item.resourceId] = (requestMap[item.resourceId] || 0) + item.quantity;
      maxNeeds[incident.id][item.resourceId] = Math.max(
        maxNeeds[incident.id][item.resourceId] || 0,
        (allocations[incident.id]?.[item.resourceId] || 0) + item.maxNeed
      );
    }

    const safety = checkBankersSafety({
      available,
      allocations,
      maxNeeds,
      request: requestMap,
      requesterId: incident.id
    });
    if (!safety.safe) {
      throw conflict(safety.reason);
    }
  }

  // 1. Check team mutex + Banker's safety in OS engine BEFORE touching DB
  const isReassign = Boolean(incident.assignedTeamId && incident.assignedTeamId !== team.id);
  const osResult = incident.assignedTeamId
    ? liveOs.assign(incident.id, mapTeam(team))
    : liveOs.dispatch(incident.id, mapTeam(team));

  if (!osResult.success) {
    emitOsState();
    throw new HttpError(osResult.status || 409, osResult.message);
  }

  // 2. Commit resource allocations + team assignment to PostgreSQL; roll back OS engine if DB save fails
  const osAllocItems = isReassign
    ? []
    : osVectorToDbAllocations(osResult.pcb?.allocation || {}, catalogById);
  const allocMap = new Map(osAllocItems.map((i) => [i.resourceId, i]));
  for (const extra of extraResourceItems) {
    if (catalogById.has(extra.resourceId)) {
      allocMap.set(extra.resourceId, extra);
    }
  }
  const dbAllocItems = [...allocMap.values()];

  let allocatedInDb = false;
  try {
    if (dbAllocItems.length > 0) {
      await db.allocateResourcesBatch(incident.id, dbAllocItems);
      allocatedInDb = true;
    }
    await db.assignTeamAtomic({
      incidentId: incident.id,
      teamId: team.id,
      eta,
      notes,
      teamName: team.name,
      fieldReport
    });
    if (isReassign) {
      const freedOld = await db.releaseOldTeamAssignment(incident.id, incident.assignedTeamId);
      if (freedOld) {
        syncTeamRecord(freedOld);
        emitTeamUpdate(freedOld);
      }
    }
  } catch (err) {
    if (allocatedInDb) {
      await db.releaseIncidentAllocations(incident.id).catch(() => {});
    }
    liveOs.complete(incident.id);
    emitOsState();
    throw mapPgLockOrResourceError(err);
  }

  const updated = await db.getIncidentById(incident.id);
  const updatedTeam = await db.getTeamById(team.id);

  eventBus.emitRealtime('incident_assigned', {
    incidentId: updated.id,
    incident: updated,
    citizenUserId: updated.citizenUserId,
    teamId: updatedTeam.id,
    teamName: updated.assignedTeam,
    eta: updated.eta,
    dispatchUpdate: `${updated.assignedTeam} dispatched · ETA ${updated.eta}`,
    team: updatedTeam
  });
  emitTeamUpdate(updatedTeam);
  emitOsState();
  emitIntelligenceUpdated('incident_assigned');
  return { incident: updated, team: updatedTeam, osResult };
}

export async function verifyIncident(user, body) {
  const incident = await db.getIncidentById(body.incidentId);
  if (!incident) throw notFound('Incident not found');
  if (incident.status !== 'Unverified') return incident;
  const updated = await db.updateIncident(incident.id, {
    status: 'Verified',
    responseSummary: 'Verified · Standby for dispatch',
    responseDetail: 'Ready to assign',
    substatus: 'Verified by Command Center'
  });
  liveOs.updateFromIncident(mapIncident(updated));
  eventBus.emitRealtime('incident_verified', {
    incidentId: updated.id,
    incident: updated,
    citizenUserId: updated.citizenUserId
  });
  emitOsState();
  emitIntelligenceUpdated('incident_verified');
  return updated;
}

export async function updateIncidentStatus(user, body) {
  const incident = await db.getIncidentById(body.incidentId);
  if (!incident) throw notFound('Incident not found');

  const allowed = user.role === 'command' ? INCIDENT_STATUSES : RESCUE_ALLOWED_STATUSES;
  const status = oneOf(body.status, allowed, { field: 'status' });
  if (incident.status === 'Resolved' && status === 'Resolved') {
    return incident;
  }
  const notes = cleanString(body.notes, { max: 500, field: 'notes' });
  const eta = cleanString(body.eta, { max: 30, field: 'eta' });

  const patch = {
    status,
    substatus: notes || `Status updated to ${status}`,
    responseDetail: status === 'Resolved' ? 'Completed' : notes || incident.responseDetail
  };
  if (eta) patch.eta = eta;
  if (notes && !String(incident.fieldReport || '').trim().endsWith(notes)) {
    patch.fieldReport = `${incident.fieldReport || ''} · ${notes}`.trim();
  }

  const updated = await db.updateIncident(incident.id, patch);

  if (status === 'On site' && incident.assignedTeamId) {
    await db.markAssignmentOnSite(incident.id, incident.assignedTeamId);
  }

  if (status === 'Resolved') {
    await db.resolveIncidentAtomic(incident.id, incident.assignedTeamId);
    liveOs.complete(incident.id);

    if (incident.assignedTeamId) {
      const remaining = await db.countActiveIncidentsForTeam(incident.assignedTeamId);
      if (remaining === 0) {
        const freedTeam = await db.updateTeam(incident.assignedTeamId, {
          status: 'Available',
          task: null,
          eta: null
        });
        syncTeamRecord(freedTeam);
        emitTeamUpdate(freedTeam);
      }
    }
    emitOsState();
  } else {
    liveOs.updateFromIncident(mapIncident(updated));
    emitOsState();
  }

  eventBus.emitRealtime('incident_status_changed', {
    incidentId: updated.id,
    status: updated.status,
    notes,
    incident: updated,
    citizenUserId: updated.citizenUserId
  });
  emitIntelligenceUpdated('incident_status_changed');
  return updated;
}

export async function reportFieldIncident(user, body) {
  const coords = resolveCoords(body, null);
  const title = cleanString(body.title, { max: 200, required: true, field: 'title' });
  const location =
    cleanString(body.location, { max: 300, field: 'location' }) ||
    (coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : '');
  const severity = oneOf(body.severity, SEVERITIES, { field: 'severity', fallback: 'High' });
  const type = cleanString(body.type, { max: 50, field: 'type' }) || 'Field Report';
  const affected = Number.isInteger(body.affected) && body.affected > 0 && body.affected <= 100000 ? body.affected : 1;

  const team = body.teamId ? await db.getTeamById(body.teamId) : null;
  const rawReq = body.requestedResources ?? body.resources;
  const requestedResources = rawReq && !Array.isArray(rawReq) && typeof rawReq === 'object'
    ? sanitizeRequestedResources(rawReq) || []
    : [];
  const otherNeeds = sanitizeOtherNeeds(body.otherNeeds);
  const incident = await createIncidentRecord({
    title,
    type,
    location,
    area: location,
    affected,
    severity,
    status: team ? 'Responding' : 'Verified',
    assignedTeam: team?.name ?? null,
    assignedTeamId: team?.id ?? null,
    responseSummary: team ? team.name : 'Command Report',
    responseDetail: team ? 'Field Unit On Scene' : 'Verified report',
    substatus: team ? `Reported by ${team.name}` : 'Reported by Command Center',
    description: cleanString(body.description, { max: 2000, field: 'description' }),
    fieldReport: cleanString(body.notes, { max: 500, field: 'notes' }),
    isCitizenSOS: false,
    requestedResources,
    otherNeeds,
    createdBy: user.id || user.role,
    coords
  });

  liveOs.admit(mapIncident(incident));
  if (team) {
    liveOs.dispatch(incident.id, mapTeam(team));
  }
  eventBus.emitRealtime('incident_reported', incident);
  emitOsState();
  emitIntelligenceUpdated('incident_reported');
  return incident;
}

// ============================== rescue team ops ==============================

export async function postTelemetry(user, body) {
  const teamId = body.teamId;
  if (!teamId) throw badRequest('teamId is required');
  const team = await db.getTeamById(teamId);
  if (!team) throw notFound('Team not found');

  const coords = resolveCoords(body, null);
  if (!coords) throw badRequest('lat and lng (or coordinates) are required');

  const sector = await db.findSectorForPoint(coords.lat, coords.lng);
  const patch = {
    lat: coords.lat,
    lng: coords.lng,
    sectorId: sector?.id ?? team.sectorId ?? null
  };
  const battery = numberInRange(body.battery, 0, 100, 'battery');
  if (battery !== null) patch.battery = Math.round(battery);
  if (body.status) {
    const rawStatus = body.status === 'SOS Active' ? 'SOS' : body.status;
    const requestedStatus = oneOf(rawStatus, TEAM_STATUSES, { field: 'status' });
    // Avoid marking an unassigned Available team as 'Deployed' from periodic GPS heartbeats
    if (requestedStatus === 'Deployed') {
      const activeCount = await db.countActiveIncidentsForTeam(team.id);
      if (activeCount > 0) {
        patch.status = 'Deployed';
      } else if (team.status !== 'SOS') {
        patch.status = team.status === 'Deployed' ? 'Available' : team.status;
      }
    } else if (team.status !== 'SOS' || requestedStatus === 'Available') {
      patch.status = requestedStatus;
    }
  }

  const updated = await db.updateTeam(team.id, patch);
  await db.recordTelemetry(updated, {
    lat: coords.lat,
    lng: coords.lng,
    battery: patch.battery,
    status: patch.status,
    signal: cleanString(body.signal, { max: 20, field: 'signal' }) || null,
    altitude: numberInRange(body.altitude, -1000, 100000, 'altitude'),
    speed: numberInRange(body.speed, 0, 1000, 'speed'),
    heading: numberInRange(body.heading, 0, 360, 'heading')
  });

  syncTeamRecord(updated);
  emitTeamUpdate(updated);
  if (updated.status !== team.status) emitOsState();
  emitIntelligenceUpdated('telemetry_recorded');
  return updated;
}

export async function setTeamStatus(user, body) {
  const teamId = body.teamId;
  if (!teamId) throw badRequest('teamId is required');
  const team = await db.getTeamById(teamId);
  if (!team) throw notFound('Team not found');
  const status = oneOf(body.status, TEAM_STATUSES.filter((s) => s !== 'SOS'), { field: 'status' });
  const updated = await db.updateTeam(team.id, { status });
  syncTeamRecord(updated);
  emitTeamUpdate(updated);
  emitOsState();
  emitIntelligenceUpdated('team_status_changed');
  return updated;
}

export async function createRescueSos(user, body) {
  const teamId = body.teamId;
  if (!teamId) throw badRequest('teamId is required');
  const team = await db.getTeamById(teamId);
  if (!team) throw notFound('Team not found');

  const coords = resolveCoords(body, team);
  const notes = cleanString(body.notes, { max: 500, field: 'notes' }) || 'Emergency distress signal activated by field unit.';
  const location =
    cleanString(body.location, { max: 300, field: 'location' }) ||
    (coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'GPS fix unavailable');

  const incident = await createIncidentRecord({
    title: `TEAM SOS: ${team.name} — Immediate Backup Required`,
    type: 'Rescue SOS',
    location,
    area: location,
    affected: team.responders || 1,
    severity: 'Critical',
    status: 'Escalated',
    assignedTeam: team.name,
    assignedTeamId: team.id,
    responseSummary: 'MAYDAY · Rescue SOS',
    responseDetail: 'Immediate backup requested',
    substatus: `SOS from ${team.name}`,
    description: notes,
    fieldReport: `Operator ${user.name || team.name}: ${notes}`,
    isRescueSOS: true,
    createdBy: user.id || team.id,
    coords
  });

  const sosEvent = await db.createSosEvent({
    teamId: team.id,
    teamName: team.name,
    operatorName: user.name || team.name,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    locationText: location,
    notes,
    incidentId: incident.id
  });

  const updatedTeam = await db.updateTeam(team.id, {
    status: 'SOS',
    task: `SOS · ${incident.id}`,
    ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
    ...(body.battery !== undefined ? { battery: Math.round(numberInRange(body.battery, 0, 100, 'battery')) } : {})
  });

  liveOs.admit(mapIncident(incident));
  syncTeamRecord(updatedTeam);
  emitTeamUpdate(updatedTeam);
  eventBus.emitRealtime('new_rescue_sos', { incident, sosEvent, team: updatedTeam });
  emitOsState();
  emitIntelligenceUpdated('new_rescue_sos');
  return { incident, sosEvent, team: updatedTeam };
}

export async function resolveSos(user, sosId) {
  const existing = await db.getSosEvent(sosId);
  if (!existing) throw notFound('SOS event not found');
  const resolved = await db.resolveSosEvent(sosId);
  if (existing.teamId) {
    const t = await db.getTeamById(existing.teamId);
    if (t && t.status === 'SOS') {
      const updatedTeam = await db.updateTeam(t.id, { status: 'Available', task: null });
      syncTeamRecord(updatedTeam);
      emitTeamUpdate(updatedTeam);
    }
  }
  eventBus.emitRealtime('sos_resolved', { sosEvent: resolved });
  emitOsState();
  emitIntelligenceUpdated('sos_resolved');
  return resolved;
}

export async function listTeams() {
  return db.getAllTeams();
}

// ============================== chat ==============================

export const DEFAULT_CHANNEL = 'command-net';

export async function sendChat(user, body) {
  const channel = cleanString(body.channel, { max: 64, field: 'channel' }) || DEFAULT_CHANNEL;
  if (!CHANNEL_RE.test(channel)) throw badRequest('channel must be 1-64 chars of [A-Za-z0-9:_-]');
  const text = cleanString(body.text, { max: 2000, required: true, field: 'text' });

  let id = null;
  if (body.id !== undefined && body.id !== null && body.id !== '') {
    if (typeof body.id !== 'string' || !CLIENT_ID_RE.test(body.id)) {
      throw badRequest('id must be 6-64 chars of [A-Za-z0-9_-]');
    }
    id = body.id;
    const existing = await db.getMessageById(id);
    if (existing) return { channel: existing.channel, message: existing, duplicate: true };
  }

  const message = await db.insertMessage({
    id,
    channel,
    sender: cleanString(body.sender, { max: 80, field: 'sender' }) || user.name || user.role,
    senderId: user.id || user.role,
    senderRole: user.role,
    role: cleanString(body.role, { max: 60, field: 'role' }) || (user.role === 'command' ? 'Command Operator' : 'Rescue Team'),
    initials: initialsOf(body.sender || user.name || user.role),
    text,
    locationTag: cleanString(body.locationTag, { max: 200, field: 'locationTag' }),
    isAlert: user.role === 'command' && body.isAlert === true
  });
  eventBus.emitRealtime('new_chat_message', { channel, message });
  return { channel, message, duplicate: false };
}

export async function listMessages({ channel, limit, since, user } = {}) {
  const max = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const canSeeChannel = (ch) => {
    if (!ch || !ch.startsWith('team-')) return true;
    if (user?.role === 'command') return true;
    if (user?.role === 'rescue' && user?.teamId) return ch === `team-${user.teamId}`;
    return !user || user.role !== 'rescue';
  };
  if (channel && channel !== 'all') {
    if (!canSeeChannel(channel)) throw forbidden('Access denied to private team channel');
    return db.getChannelMessages(channel, { limit: max, since });
  }
  const grouped = {};
  for (const m of await db.getAllMessages({ limit: 500 })) {
    if (!canSeeChannel(m.channel)) continue;
    (grouped[m.channel] ||= []).push(m);
  }
  return grouped;
}

// ============================== alerts / broadcasts ==============================

export async function listAlerts(user) {
  const audiences =
    user?.role === 'citizen' ? ['all', 'citizens'] : user?.role === 'rescue' ? ['all', 'rescue'] : undefined;
  return db.getAlerts({ audiences });
}

export async function broadcast(user, body) {
  const message = cleanString(body.message, { max: 1000, required: true, field: 'message' });
  const severity = oneOf(body.severity, SEVERITIES, { field: 'severity', fallback: 'Critical' });
  const audience = oneOf(body.audience, ['all', 'citizens', 'rescue'], { field: 'audience', fallback: 'all' });
  const alert = await db.insertAlert({
    title: cleanString(body.title, { max: 150, field: 'title' }) || 'Command Emergency Broadcast',
    code: `ALL-UNITS-${crypto.randomInt(100, 1000)}`,
    subtitle: message,
    severity,
    recipients: cleanString(body.recipients, { max: 200, field: 'recipients' }) || (audience === 'all' ? 'All users' : audience),
    audience,
    issuedBy: user.name || 'Command'
  });
  eventBus.emitRealtime('emergency_broadcast', { alert, message, severity, recipients: alert.recipients });
  return alert;
}

// ============================== shelters / sectors / volunteers ==============================

export async function updateShelter(user, body) {
  const shelter = await db.getShelterById(body.shelterId);
  if (!shelter) throw notFound('Shelter not found');
  const occupied = Number(body.occupied);
  if (!Number.isInteger(occupied) || occupied < 0 || occupied > shelter.capacity) {
    throw badRequest(`occupied must be an integer between 0 and ${shelter.capacity}`);
  }
  const updated = await db.updateShelterOccupancy(shelter.id, occupied);
  eventBus.emitRealtime('shelter_updated', { shelter: updated });
  emitIntelligenceUpdated('shelter_updated');
  return updated;
}

export async function updateSector(user, sectorId, body) {
  const existing = await db.getSectorById(sectorId);
  if (!existing) throw notFound('Sector not found');
  const status = body.status ? oneOf(body.status, ['Active', 'Monitoring', 'Lockdown', 'Evacuating'], { field: 'status' }) : undefined;
  const alertLevel = body.alertLevel
    ? oneOf(body.alertLevel, ['Normal', 'Advisory', 'Warning', 'Critical'], { field: 'alertLevel' })
    : undefined;
  const updated = await db.updateSector(sectorId, { status, alertLevel });
  eventBus.emitRealtime('sector_status_changed', { sector: updated });
  return updated;
}

export async function registerVolunteer(user, body) {
  const name = cleanString(body.name, { max: 100, field: 'name' }) || user.name || 'Volunteer';
  const phone = cleanString(body.phone, { max: 30, field: 'phone' }) || '';
  const email = cleanString(body.email, { max: 120, field: 'email' }) || '';
  const skills = Array.isArray(body.skills) ? body.skills.map((s) => String(s).trim().slice(0, 40)).filter(Boolean).slice(0, 20) : [];
  const sectorId = cleanString(body.sectorId, { max: 40, field: 'sectorId' }) || null;
  if (sectorId && !(await db.getSectorById(sectorId))) throw badRequest('Unknown sectorId');
  const coords = resolveCoords(body, null);

  const volunteer = await db.upsertVolunteerForUser(user.id || email || name, {
    name,
    phone,
    email,
    skills,
    sectorId,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    teamId: body.teamId || null
  });
  eventBus.emitRealtime('volunteer_registered', { volunteer });
  return volunteer;
}

export async function setVolunteerStatus(user, id, body) {
  const existing = await db.getVolunteerById(id);
  if (!existing) throw notFound('Volunteer not found');
  const status = oneOf(body.status, VOLUNTEER_STATUSES, { field: 'status' });
  const updated = await db.updateVolunteerStatus(id, status);
  eventBus.emitRealtime('volunteer_updated', { volunteer: updated });
  return updated;
}

// ============================== OS monitor & algorithms ==============================

export function getOsLive() {
  return getOsLiveSnapshot();
}

export async function updateOsResourceTotals(body = {}) {
  const result = liveOs.setTotals(body);
  if (!result.success) {
    throw new HttpError(result.status || 400, result.message);
  }
  try {
    await db.setResourceTotalsInDb(body);
  } catch (err) {
    const snap = await db.getResourcesSnapshot().catch(() => null);
    if (snap?.resources?.length) {
      const totals = {};
      for (const [k, id] of Object.entries(KEY_TO_DB_ID)) {
        const row = snap.resources.find((r) => r.id === id);
        if (row) totals[k] = Number(row.total);
      }
      liveOs.setTotals(totals);
    }
    throw new HttpError(err?.statusCode || 400, err?.message || 'Failed to update resource totals');
  }
  const updatedSnapshot = emitOsState();
  emitIntelligenceUpdated('resources_updated');
  return updatedSnapshot;
}

function parseIntBounded(raw, fallback, min, max, field) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`${field} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export async function getSchedulerComparison({ source = 'live', quantum = 4 } = {}) {
  const q = parseIntBounded(quantum, 4, 1, 50, 'quantum');
  const mode = String(source || 'live').toLowerCase() === 'demo' ? 'demo' : 'live';

  if (mode === 'live') {
    const all = await db.getAllIncidents();
    const open = all.filter((i) => i.status !== 'Resolved').map((i) => mapIncident(i));
    const liveProcs = incidentsToProcesses(open);
    if (liveProcs.length >= 2) {
      const comparison = compareSchedulers(liveProcs, { quantum: q });
      return {
        source: 'live',
        requestedSource: 'live',
        isDemoData: false,
        quantum: q,
        workload: liveProcs,
        ...comparison
      };
    }
    const comparison = compareSchedulers(DEMO_WORKLOAD, { quantum: q });
    return {
      source: 'demo',
      requestedSource: 'live',
      isDemoData: true,
      fallbackReason: 'Fewer than 2 open live incidents; showing demo workload',
      quantum: q,
      workload: DEMO_WORKLOAD,
      ...comparison
    };
  }

  const comparison = compareSchedulers(DEMO_WORKLOAD, { quantum: q });
  return {
    source: 'demo',
    requestedSource: 'demo',
    isDemoData: true,
    quantum: q,
    workload: DEMO_WORKLOAD,
    ...comparison
  };
}

export function runCustomSchedulerComparison(body = {}) {
  if (!Array.isArray(body.processes) || body.processes.length < 1 || body.processes.length > 50) {
    throw badRequest('processes must be an array of 1 to 50 process objects');
  }
  const q = parseIntBounded(body.quantum, 4, 1, 50, 'quantum');
  const cleaned = body.processes.map((p, idx) => {
    const pid = cleanString(p?.pid || p?.id, { max: 40 }) || `P${idx + 1}`;
    const arrival = Number(p?.arrival ?? 0);
    const burst = Number(p?.burst);
    const priority = Number(p?.priority ?? 50);
    const deadline = p?.deadline !== undefined && p?.deadline !== null ? Number(p.deadline) : null;
    if (!Number.isFinite(arrival) || arrival < 0) throw badRequest(`${pid}: arrival must be >= 0`);
    if (!Number.isFinite(burst) || burst <= 0 || burst > 1000) throw badRequest(`${pid}: burst must be in (0, 1000]`);
    if (!Number.isFinite(priority)) throw badRequest(`${pid}: priority must be finite`);
    return {
      pid,
      arrival,
      burst,
      priority,
      ...(deadline !== null && Number.isFinite(deadline) ? { deadline } : {})
    };
  });
  const comparison = compareSchedulers(cleaned, { quantum: q });
  return {
    source: 'custom',
    isDemoData: false,
    quantum: q,
    workload: cleaned,
    ...comparison
  };
}

export function getDeadlockAnalysis() {
  const snapshot = getOsLiveSnapshot();
  return {
    scenarios: getBuiltInDeadlockScenarios(),
    live: buildDeadlockFromLive(snapshot),
    timestamp: snapshot.lastUpdated
  };
}

export function getSemaphoreDemo({ capacity = 3, items = 6, consumeEvery = 2 } = {}) {
  const cap = parseIntBounded(capacity, 3, 1, 20, 'capacity');
  const cnt = parseIntBounded(items, 6, 1, 50, 'items');
  const rate = parseIntBounded(consumeEvery, 2, 1, 10, 'consumeEvery');
  return producerConsumerDemo({ capacity: cap, items: cnt, consumeEvery: rate });
}

export async function suggestTeamsForIncident(incidentId) {
  const incident = await db.getIncidentById(incidentId);
  if (!incident) throw notFound('Incident not found');
  const teams = await db.getAllTeams();
  const suggestions = suggestTeams(mapIncident(incident), teams.map(mapTeam));
  return {
    incidentId: incident.id,
    incidentTitle: incident.title,
    category: incident.type,
    suggestions,
    count: suggestions.length
  };
}

export async function getOperationalIntelligence() {
  const data = await db.getOperationalIntelligenceData();
  const osSnapshot = getOsLiveSnapshot();
  return computeOperationalIntelligence({ ...data, osSnapshot });
}
