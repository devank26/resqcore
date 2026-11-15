import crypto from 'crypto';
import { dbManager as db } from './database.js';
import { eventBus } from './eventBus.js';
import { AUTH_TOKENS } from './config.js';
import { osEngine, checkBankersSafety } from './osEngine/index.js';
import {
  HttpError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  tooMany,
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
  eventBus.emitRealtime('os_state', osEngine.getState());
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
    if (result.created) {
      eventBus.emitRealtime('team_registered', { team });
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

  const normalizedRequested = normalizeResourceRequests(body.resources ?? body.requestedResources);
  let requestedResources = [];
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
  const resourceSummary = requestedResources.length
    ? ` · Requested: ${requestedResources.map((r) => `${r.name} x${r.quantity}`).join(', ')}`
    : '';

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

  const candidateId = clientId || db.generateIncidentId();
  const admission = osEngine.admitIncident({ id: candidateId, title, severity, type, affected });
  if (!admission.accepted) {
    throw tooMany(admission.error, { retryAfter: admission.retryAfter });
  }

  let incident;
  try {
    incident = await createIncidentRecord(
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
        createdBy: user.id || 'citizen',
        coords
      },
      { clientId: candidateId }
    );
  } catch (err) {
    osEngine.completePcb(candidateId);
    throw err;
  }

  eventBus.emitRealtime('new_citizen_sos', incident);
  emitOsState();
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

  // Banker's algorithm safety check + DB allocate_resource commit when resources are requested
  const resourceItems = normalizeResourceRequests(body.resources);
  if (resourceItems.length > 0) {
    const snap = await db.getResourcesSnapshot();
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
    for (const item of resourceItems) {
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

    try {
      await db.allocateResourcesBatch(incident.id, resourceItems);
    } catch (err) {
      throw mapPgLockOrResourceError(err);
    }
  }

  try {
    await db.assignTeamAtomic({
      incidentId: incident.id,
      teamId: team.id,
      eta,
      notes,
      teamName: team.name,
      fieldReport
    });
  } catch (err) {
    throw mapPgLockOrResourceError(err);
  }

  const updated = await db.getIncidentById(incident.id);
  const updatedTeam = await db.getTeamById(team.id);

  try {
    osEngine.dispatchPcb(updated, team.id);
  } catch (err) {
    throw mapPgLockOrResourceError(err);
  }

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
  return { incident: updated, team: updatedTeam };
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
  eventBus.emitRealtime('incident_verified', {
    incidentId: updated.id,
    incident: updated,
    citizenUserId: updated.citizenUserId
  });
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
    osEngine.completePcb(incident.id);

    if (incident.assignedTeamId) {
      const remaining = await db.countActiveIncidentsForTeam(incident.assignedTeamId);
      if (remaining === 0) {
        const freedTeam = await db.updateTeam(incident.assignedTeamId, {
          status: 'Available',
          task: null,
          eta: null
        });
        emitTeamUpdate(freedTeam);
      }
    }
    emitOsState();
  }

  eventBus.emitRealtime('incident_status_changed', {
    incidentId: updated.id,
    status: updated.status,
    notes,
    incident: updated,
    citizenUserId: updated.citizenUserId
  });
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
    createdBy: user.id || user.role,
    coords
  });

  osEngine.admitIncident(incident);
  eventBus.emitRealtime('incident_reported', incident);
  emitOsState();
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

  emitTeamUpdate(updated);
  return updated;
}

export async function setTeamStatus(user, body) {
  const teamId = body.teamId;
  if (!teamId) throw badRequest('teamId is required');
  const team = await db.getTeamById(teamId);
  if (!team) throw notFound('Team not found');
  const status = oneOf(body.status, TEAM_STATUSES.filter((s) => s !== 'SOS'), { field: 'status' });
  const updated = await db.updateTeam(team.id, { status });
  emitTeamUpdate(updated);
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

  osEngine.admitIncident(incident);
  emitTeamUpdate(updatedTeam);
  eventBus.emitRealtime('new_rescue_sos', { incident, sosEvent, team: updatedTeam });
  emitOsState();
  return { incident, sosEvent, team: updatedTeam };
}

export async function resolveSos(user, sosId) {
  const existing = await db.getSosEvent(sosId);
  if (!existing) throw notFound('SOS event not found');
  const resolved = await db.resolveSosEvent(sosId);
  if (existing.teamId) {
    const t = await db.getTeamById(existing.teamId);
    if (t && t.status === 'SOS') {
      emitTeamUpdate(await db.updateTeam(t.id, { status: 'Available', task: null }));
    }
  }
  eventBus.emitRealtime('sos_resolved', { sosEvent: resolved });
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
