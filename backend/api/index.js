import { randomBytes, randomUUID } from 'node:crypto';
import { ApiError, getOptionalUser, requireAdmin, requireCommand, requireRescueTeam, requireStaff } from './_lib/auth.js';
import { getAdminClient } from './_lib/supabase.js';
import { createCitizenRealtimeToken, createTrackingToken, hashRateLimitKey, hashTrackingToken } from './_lib/tracking-token.js';
import { serializeAlert, serializeIncident, serializeMessage, serializeTeam, serializeTrackingUpdate } from './_lib/serializers.js';

const allowedOrigins = new Set([
  'https://resqcore.vercel.app',
  'https://resqcore-63a2.vercel.app',
  'https://resqcore-citizen.vercel.app',
  'https://resqcore-rescue-team.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]);

const incidentColumns = 'id,title,type,location,full_address,short_location,area,affected,severity,status,response_summary,response_detail,description,field_report,contact_number,citizen_name,assigned_team,team_id,eta,substatus,coordinates,sector_id,is_citizen_sos,is_rescue_sos,created_by,created_at,updated_at';
const teamColumns = 'id,name,specialization,status,responders,task,battery,eta,lat,lng,sector_id,updated_at';
const messageColumns = 'id,channel_id,sender,role,initials,is_self,text,location_tag,attachment_url,is_alert,team_id,created_at';
const alertColumns = 'id,title,code,subtitle,severity,recipients,issued_by,sector_id,created_by,created_at';
const validIncidentStatuses = new Set(['Pending', 'Unverified', 'Verified', 'Responding', 'On site', 'Resolved', 'Escalated']);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Incident-Tracking-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk.toString();
    if (raw.length > 1_000_000) throw new ApiError(413, 'Request body is too large.');
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON.');
  }
}

function apiPath(req) {
  const url = new URL(req.url || '/', 'https://api.resqcore.invalid');
  const forwardedPath = url.searchParams.get('path');
  if (forwardedPath) return `/${forwardedPath.replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
}

function requireText(value, field, maxLength = 500) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new ApiError(400, `${field} is required and must be under ${maxLength} characters.`);
  }
  return value.trim();
}

function requireCoordinate(value, field, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new ApiError(400, `Invalid ${field}.`);
  return number;
}

function normalizePhone(value) {
  return String(value || '').replace(/[^0-9+]/g, '').slice(0, 24);
}

function getClientIp(req) {
  const header = req.headers['x-forwarded-for'] || req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || '';
  return String(header).split(',')[0].trim() || 'unknown';
}

async function requireIncidentAccess(context, incidentId) {
  const { data, error } = await getAdminClient()
    .from('incidents')
    .select(incidentColumns)
    .eq('id', incidentId)
    .maybeSingle();
  if (error) throw new ApiError(503, 'Could not load the incident.');
  if (!data) throw new ApiError(404, 'Incident not found.');
  if (context.role === 'rescue_team' && data.team_id !== context.teamId) throw new ApiError(403, 'This incident is assigned to another team.');
  return data;
}

async function listIncidents(context, status) {
  let query = getAdminClient().from('incidents').select(incidentColumns).order('created_at', { ascending: false }).limit(500);
  if (status && status !== 'All') query = query.eq('status', status);
  if (context.role === 'rescue_team') query = query.eq('team_id', context.teamId);
  const { data, error } = await query;
  if (error) throw new ApiError(503, 'Could not load incidents.');
  return data.map(serializeIncident);
}

async function getTrackingToken(incidentId, token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) throw new ApiError(401, 'Valid tracking access is required.');
  const { data, error } = await getAdminClient()
    .from('incident_tracking_tokens')
    .select('incident_id,token_hash,expires_at')
    .eq('incident_id', incidentId)
    .maybeSingle();
  const tokenHash = hashTrackingToken(token);
  if (error || !data || data.expires_at <= new Date().toISOString() || data.token_hash !== tokenHash) {
    throw new ApiError(404, 'Tracking access is invalid or expired.');
  }
  return data;
}

async function handle(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const route = apiPath(req);
  const method = req.method || 'GET';
  const db = getAdminClient();

  if (route === '/health' && method === 'GET') {
    return sendJson(res, 200, { status: 'online', service: 'ResQCore Vercel API', realtime: 'Supabase Realtime', timestamp: new Date().toISOString() });
  }

  if (route === '/auth/me' && method === 'GET') {
    const context = await requireStaff(req);
    return sendJson(res, 200, { success: true, user: { id: context.user.id, email: context.email }, role: context.role, teamId: context.teamId });
  }

  if (route === '/citizen/sos' && method === 'POST') {
    const ipHash = hashRateLimitKey(getClientIp(req));
    const { data: allowed, error: limitError } = await db.rpc('allow_public_sos', { p_ip_hash: ipHash });
    if (limitError) throw new ApiError(503, 'Emergency submission is temporarily unavailable.');
    if (!allowed) throw new ApiError(429, 'Too many SOS submissions. Please wait a few minutes and retry.');

    const body = await readBody(req);
    const title = requireText(body.title || 'Emergency SOS', 'title', 160);
    const location = requireText(body.location || body.fullAddress, 'location', 500);
    const fullAddress = String(body.fullAddress || location).trim().slice(0, 700);
    const description = String(body.description || '').trim().slice(0, 2000);
    const citizenName = String(body.citizenName || 'Citizen').trim().slice(0, 120);
    const contactNumber = normalizePhone(body.contactNumber);
    const coordinates = {
      latitude: requireCoordinate(body.coordinates?.latitude ?? body.coordinates?.lat, 'latitude', -90, 90),
      longitude: requireCoordinate(body.coordinates?.longitude ?? body.coordinates?.lng, 'longitude', -180, 180),
    };
    const user = await getOptionalUser(req);
    const id = `RQ-${Date.now()}-${randomBytes(3).toString('hex')}`;
    const { token, tokenHash } = createTrackingToken();
    const row = {
      id,
      title,
      type: String(body.type || 'General').slice(0, 80),
      location,
      full_address: fullAddress,
      short_location: location,
      area: location,
      affected: 1,
      severity: ['Low', 'Medium', 'High', 'Critical'].includes(body.severity) ? body.severity : 'High',
      status: 'Pending',
      response_summary: 'Emergency received',
      response_detail: 'Waiting for command center review',
      description,
      contact_number: contactNumber,
      citizen_name: citizenName,
      coordinates,
      is_citizen_sos: true,
      created_by: user?.id || null,
    };
    const { data: incident, error: insertError } = await db.from('incidents').insert(row).select(incidentColumns).single();
    if (insertError) throw new ApiError(503, 'Could not submit the emergency report.');

    const { error: tokenError } = await db.from('incident_tracking_tokens').insert({
      incident_id: id,
      nonce: randomBytes(16).toString('hex'),
      token_hash: tokenHash,
    });
    if (tokenError) {
      await db.from('incidents').delete().eq('id', id);
      throw new ApiError(503, 'Could not create secure incident tracking.');
    }

    return sendJson(res, 201, {
      success: true,
      incident: serializeIncident(incident),
      request: { id, status: incident.status, responseSummary: incident.response_summary },
      trackingToken: token,
    });
  }

  if (route.startsWith('/citizen/status/') && method === 'GET') {
    const id = decodeURIComponent(route.slice('/citizen/status/'.length));
    const access = await getTrackingToken(id, req.headers['x-incident-tracking-token']);
    const { data, error } = await db.from('incident_tracking_updates').select('incident_id,status,assigned_team,eta,response_summary,response_detail,updated_at').eq('incident_id', id).maybeSingle();
    if (error || !data) throw new ApiError(404, 'Tracking information is not available.');
    return sendJson(res, 200, { success: true, request: serializeTrackingUpdate(data), expiresAt: access.expires_at });
  }

  if (route === '/citizen/realtime-token' && method === 'POST') {
    const body = await readBody(req);
    const id = requireText(body.incidentId, 'incidentId', 100);
    const access = await getTrackingToken(id, body.trackingToken);
    return sendJson(res, 200, { success: true, token: createCitizenRealtimeToken(id, access.token_hash), expiresAt: access.expires_at });
  }

  if (route === '/citizen/alerts' && method === 'GET') {
    const { data, error } = await db.from('public_alerts').select('id,title,message,severity,created_at').order('created_at', { ascending: false }).limit(50);
    if (error) throw new ApiError(503, 'Could not load public alerts.');
    return sendJson(res, 200, { success: true, alerts: data });
  }

  if (route === '/citizen/my-requests' && method === 'GET') {
    const user = await getOptionalUser(req);
    if (!user) throw new ApiError(401, 'Sign in to view your saved reports.');
    const { data, error } = await db.from('incidents').select('id,title,status,assigned_team,eta,response_summary,response_detail,created_at').eq('created_by', user.id).order('created_at', { ascending: false }).limit(100);
    if (error) throw new ApiError(503, 'Could not load your reports.');
    return sendJson(res, 200, { success: true, requests: data.map((item) => ({ id: item.id, title: item.title, status: item.status, assignedTeam: item.assigned_team, eta: item.eta, responseSummary: item.response_summary, responseDetail: item.response_detail, createdAt: item.created_at })) });
  }

  if (route === '/incidents' && method === 'GET') {
    const context = await requireStaff(req);
    const incidents = await listIncidents(context, new URL(req.url, 'https://api.resqcore.invalid').searchParams.get('status'));
    return sendJson(res, 200, { success: true, count: incidents.length, incidents });
  }

  if (route.startsWith('/incidents/') && method === 'GET') {
    const context = await requireStaff(req);
    const incident = await requireIncidentAccess(context, decodeURIComponent(route.slice('/incidents/'.length)));
    return sendJson(res, 200, { success: true, incident: serializeIncident(incident) });
  }

  if (route === '/command/dispatch' && method === 'POST') {
    await requireCommand(req);
    const body = await readBody(req);
    const incidentId = requireText(body.requestId || body.incidentId, 'incidentId', 100);
    const teamName = requireText(body.teamName, 'teamName', 120);
    const { data: team, error: teamError } = await db.from('teams').select(teamColumns).eq('name', teamName).maybeSingle();
    if (teamError) throw new ApiError(503, 'Could not load the selected team.');
    if (!team) throw new ApiError(404, 'The selected team does not exist.');
    const eta = String(body.eta || '10 min').trim().slice(0, 60);
    const substatus = `${team.name} dispatched · ETA ${eta}`;
    const { data: incident, error } = await db.from('incidents').update({
      team_id: team.id,
      assigned_team: team.name,
      eta,
      status: 'Responding',
      response_summary: team.name,
      response_detail: `ETA ${eta}`,
      substatus,
      updated_at: new Date().toISOString(),
    }).eq('id', incidentId).select(incidentColumns).maybeSingle();
    if (error) throw new ApiError(503, 'Could not dispatch the rescue team.');
    if (!incident) throw new ApiError(404, 'Incident not found.');
    await db.from('teams').update({ status: 'Deployed', task: `${incident.id} · ${incident.title}`, eta: `ETA ${eta}`, updated_at: new Date().toISOString() }).eq('id', team.id);
    return sendJson(res, 200, { success: true, incident: serializeIncident(incident), request: serializeIncident(incident) });
  }

  if (route === '/command/verify' && method === 'POST') {
    await requireCommand(req);
    const body = await readBody(req);
    const incidentId = requireText(body.incidentId, 'incidentId', 100);
    const { data, error } = await db.from('incidents').update({ status: 'Verified', response_summary: 'Verified · Standby for dispatch', response_detail: 'Ready to assign', substatus: 'Verified by Command Center', updated_at: new Date().toISOString() }).eq('id', incidentId).select(incidentColumns).maybeSingle();
    if (error) throw new ApiError(503, 'Could not verify the incident.');
    if (!data) throw new ApiError(404, 'Incident not found.');
    return sendJson(res, 200, { success: true, incident: serializeIncident(data) });
  }

  if (route === '/incidents/update' && method === 'POST') {
    const context = await requireStaff(req, ['command_admin', 'command_operator', 'rescue_team']);
    const body = await readBody(req);
    const incidentId = requireText(body.incidentId, 'incidentId', 100);
    if (!validIncidentStatuses.has(body.status)) throw new ApiError(400, 'Invalid incident status.');
    const existing = await requireIncidentAccess(context, incidentId);
    const updates = {
      status: body.status,
      substatus: String(body.notes || existing.substatus || '').slice(0, 500),
      response_detail: String(body.notes || existing.response_detail || '').slice(0, 500),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await db.from('incidents').update(updates).eq('id', incidentId).select(incidentColumns).single();
    if (error) throw new ApiError(503, 'Could not update the incident.');
    return sendJson(res, 200, { success: true, incident: serializeIncident(data) });
  }

  if (route === '/incidents/report' && method === 'POST') {
    const context = await requireRescueTeam(req);
    const body = await readBody(req);
    const title = requireText(body.title, 'title', 160);
    const location = requireText(body.location, 'location', 500);
    const { data: team } = await db.from('teams').select(teamColumns).eq('id', context.teamId).maybeSingle();
    if (!team) throw new ApiError(403, 'The staff account has no active team assignment.');
    const incident = {
      id: `RQ-${Date.now()}-${randomBytes(3).toString('hex')}`,
      title,
      type: 'Field report',
      location,
      short_location: location,
      area: location,
      severity: ['Low', 'Medium', 'High', 'Critical'].includes(body.severity) ? body.severity : 'Medium',
      status: 'Responding',
      response_summary: 'Field report received',
      response_detail: String(body.description || '').slice(0, 1000),
      description: String(body.description || '').slice(0, 2000),
      field_report: `Reported by ${context.email}`,
      assigned_team: team.name,
      team_id: team.id,
      coordinates: body.coordinates || {},
      is_rescue_sos: false,
      created_by: context.user.id,
    };
    const { data, error } = await db.from('incidents').insert(incident).select(incidentColumns).single();
    if (error) throw new ApiError(503, 'Could not report the field incident.');
    return sendJson(res, 201, { success: true, incident: serializeIncident(data) });
  }

  if (route === '/teams/sos' && method === 'POST') {
    const context = await requireRescueTeam(req);
    const body = await readBody(req);
    const { data: team } = await db.from('teams').select(teamColumns).eq('id', context.teamId).maybeSingle();
    if (!team) throw new ApiError(403, 'The staff account has no active team assignment.');
    const coordinates = body.coordinates || {};
    const incidentId = `SOS-${Date.now()}-${randomBytes(3).toString('hex')}`;
    const incidentPayload = {
      id: incidentId,
      title: `TACTICAL SOS: ${team.name} in distress`,
      type: 'Rescue SOS',
      location: String(body.location || 'GPS Pin').slice(0, 500),
      short_location: String(body.location || 'GPS Pin').slice(0, 120),
      area: String(body.location || 'Tactical Sector').slice(0, 500),
      severity: 'Critical',
      status: 'Escalated',
      description: String(body.notes || 'Emergency distress beacon triggered.').slice(0, 2000),
      assigned_team: 'ALL AVAILABLE UNITS',
      team_id: team.id,
      coordinates,
      is_rescue_sos: true,
      created_by: context.user.id,
    };
    const { data: incident, error } = await db.from('incidents').insert(incidentPayload).select(incidentColumns).single();
    if (error) throw new ApiError(503, 'Could not submit the tactical distress signal.');
    const { error: sosError } = await db.from('sos_events').insert({
      id: incidentId,
      team_id: team.id,
      team_name: team.name,
      operator_name: String(body.operatorName || context.email).slice(0, 120),
      lat: coordinates.latitude ?? coordinates.lat ?? null,
      lng: coordinates.longitude ?? coordinates.lng ?? null,
      location_text: incidentPayload.location,
      notes: incidentPayload.description,
      incident_id: incidentId,
    });
    if (sosError) throw new ApiError(503, 'The incident was created, but its distress event could not be stored.');
    return sendJson(res, 201, { success: true, incident: serializeIncident(incident) });
  }

  if (route === '/teams' && method === 'GET') {
    const context = await requireStaff(req);
    let query = db.from('teams').select(teamColumns).order('name');
    if (context.role === 'rescue_team') query = query.eq('id', context.teamId);
    const { data, error } = await query;
    if (error) throw new ApiError(503, 'Could not load teams.');
    return sendJson(res, 200, { success: true, teams: data.map(serializeTeam) });
  }

  if (route === '/teams/telemetry' && method === 'POST') {
    const context = await requireRescueTeam(req);
    const body = await readBody(req);
    const lat = requireCoordinate(body.lat, 'latitude', -90, 90);
    const lng = requireCoordinate(body.lng, 'longitude', -180, 180);
    const battery = Math.max(0, Math.min(100, Number(body.battery) || 100));
    const { data: team, error } = await db.from('teams').update({ lat, lng, battery, status: String(body.status || 'Deployed').slice(0, 80), updated_at: new Date().toISOString() }).eq('id', context.teamId).select(teamColumns).maybeSingle();
    if (error) throw new ApiError(503, 'Could not update team telemetry.');
    if (!team) throw new ApiError(404, 'Assigned team not found.');
    const { error: telemetryError } = await db.from('telemetry').insert({ team_id: team.id, lat, lng, battery, status: team.status });
    if (telemetryError) throw new ApiError(503, 'Could not store team telemetry.');
    return sendJson(res, 200, { success: true, team: serializeTeam(team) });
  }

  if (route === '/chat/messages' && method === 'GET') {
    const context = await requireStaff(req);
    const requestedChannel = new URL(req.url, 'https://api.resqcore.invalid').searchParams.get('channel');
    const channel = context.role === 'rescue_team' ? `team:${context.teamId}` : (requestedChannel || 'command:all');
    if (context.role !== 'rescue_team' && channel !== 'command:all') throw new ApiError(403, 'Unknown command channel.');
    const { data, error } = await db.from('messages').select(messageColumns).eq('channel_id', channel).order('created_at', { ascending: true }).limit(200);
    if (error) throw new ApiError(503, 'Could not load tactical messages.');
    return sendJson(res, 200, { success: true, messages: { [channel]: data.map(serializeMessage) } });
  }

  if (route === '/chat/send' && method === 'POST') {
    const context = await requireStaff(req);
    const body = await readBody(req);
    const text = requireText(body.text, 'text', 4000);
    const channel = context.role === 'rescue_team' ? `team:${context.teamId}` : 'command:all';
    const initials = context.email.split('@')[0].slice(0, 2).toUpperCase();
    const { data, error } = await db.from('messages').insert({
      id: `MSG-${Date.now()}-${randomBytes(3).toString('hex')}`,
      channel_id: channel,
      sender: context.user.user_metadata?.full_name || context.email,
      role: context.role,
      initials,
      text,
      location_tag: String(body.locationTag || '').slice(0, 200),
      is_alert: Boolean(body.isAlert),
      team_id: context.teamId,
      created_by: context.user.id,
    }).select(messageColumns).single();
    if (error) throw new ApiError(503, 'Could not send the tactical message.');
    return sendJson(res, 201, { success: true, channel, message: serializeMessage(data) });
  }

  if (route === '/alerts' && method === 'GET') {
    await requireStaff(req);
    const { data, error } = await db.from('alerts').select(alertColumns).order('created_at', { ascending: false }).limit(100);
    if (error) throw new ApiError(503, 'Could not load operational alerts.');
    return sendJson(res, 200, { success: true, alerts: data.map(serializeAlert) });
  }

  if (route === '/command/broadcast' && method === 'POST') {
    const context = await requireCommand(req);
    const body = await readBody(req);
    const message = requireText(body.message, 'message', 1000);
    const id = `ALT-${Date.now()}-${randomBytes(3).toString('hex')}`;
    const severity = ['Info', 'Low', 'Medium', 'High', 'Critical'].includes(body.severity) ? body.severity : 'High';
    const { data: alert, error } = await db.from('alerts').insert({
      id,
      title: 'Command Emergency Broadcast',
      code: `HQ-${Date.now().toString().slice(-6)}`,
      subtitle: message,
      severity,
      recipients: String(body.recipients || 'All active units').slice(0, 120),
      issued_by: context.email,
      created_by: context.user.id,
    }).select(alertColumns).single();
    if (error) throw new ApiError(503, 'Could not create the alert.');
    const { error: publicError } = await db.from('public_alerts').insert({ id, title: alert.title, message, severity });
    if (publicError) throw new ApiError(503, 'The alert was created, but citizen notification could not be published.');
    return sendJson(res, 201, { success: true, alert: serializeAlert(alert) });
  }

  if (route === '/shelters' && method === 'GET') {
    await requireStaff(req);
    const { data, error } = await db.from('shelters').select('*').order('name');
    if (error) throw new ApiError(503, 'Could not load shelters.');
    return sendJson(res, 200, { success: true, shelters: data.map((item) => ({ ...item, coordinates: { lat: item.lat, lng: item.lng, latitude: item.lat, longitude: item.lng } })) });
  }

  if (route.startsWith('/sectors/') && method === 'GET') {
    const context = await requireStaff(req);
    const id = decodeURIComponent(route.slice('/sectors/'.length));
    const { data: sector, error } = await db.from('sectors').select('*').eq('id', id).maybeSingle();
    if (error) throw new ApiError(503, 'Could not load sector information.');
    if (!sector) throw new ApiError(404, 'Sector not found.');
    const [incidentRows, teamRows] = await Promise.all([
      listIncidents(context, 'All'),
      db.from('teams').select(teamColumns).eq('sector_id', id),
    ]);
    if (teamRows.error) throw new ApiError(503, 'Could not load sector teams.');
    return sendJson(res, 200, { success: true, sector, incidents: incidentRows.filter((item) => item.sectorId === id), teams: teamRows.data.map(serializeTeam) });
  }

  if (route === '/sectors' && method === 'GET') {
    await requireStaff(req);
    let query = db.from('sectors').select('*').order('id');
    const theater = new URL(req.url, 'https://api.resqcore.invalid').searchParams.get('theater');
    if (theater) query = query.eq('theater', theater);
    const { data, error } = await query;
    if (error) throw new ApiError(503, 'Could not load sectors.');
    return sendJson(res, 200, { success: true, count: data.length, sectors: data });
  }

  if (route === '/volunteers' && method === 'GET') {
    const context = await requireStaff(req);
    let query = db.from('volunteers').select('*').order('registered_at', { ascending: false }).limit(500);
    const params = new URL(req.url, 'https://api.resqcore.invalid').searchParams;
    if (params.has('status')) query = query.eq('status', params.get('status'));
    if (params.has('sector_id')) query = query.eq('sector_id', params.get('sector_id'));
    if (context.role === 'rescue_team') query = query.eq('team_id', context.teamId);
    const { data, error } = await query;
    if (error) throw new ApiError(503, 'Could not load volunteers.');
    return sendJson(res, 200, { success: true, count: data.length, volunteers: data });
  }

  if (route === '/volunteers/register' && method === 'POST') {
    const context = await requireStaff(req);
    const body = await readBody(req);
    const name = requireText(body.name, 'name', 120);
    const teamId = context.role === 'rescue_team' ? context.teamId : (body.teamId || null);
    if (teamId) {
      const { data: team, error: teamError } = await db.from('teams').select('id').eq('id', teamId).maybeSingle();
      if (teamError) throw new ApiError(503, 'Could not verify the assigned team.');
      if (!team) throw new ApiError(404, 'The assigned team does not exist.');
    }
    const { data, error } = await db.from('volunteers').insert({
      id: `VOL-${Date.now()}-${randomBytes(2).toString('hex')}`,
      name,
      phone: normalizePhone(body.phone),
      email: String(body.email || '').trim().toLowerCase().slice(0, 254),
      skills: Array.isArray(body.skills) ? body.skills.slice(0, 20) : [],
      sector_id: body.sectorId || null,
      status: 'Available',
      team_id: teamId,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
    }).select('*').single();
    if (error) throw new ApiError(503, 'Could not register the volunteer.');
    return sendJson(res, 201, { success: true, volunteer: data, createdBy: context.user.id });
  }

  if (route.startsWith('/volunteers/') && method === 'PUT') {
    const context = await requireStaff(req);
    const id = decodeURIComponent(route.slice('/volunteers/'.length));
    const body = await readBody(req);
    const status = requireText(body.status, 'status', 60);
    let query = db.from('volunteers').update({ status, last_seen: new Date().toISOString() }).eq('id', id);
    if (context.role === 'rescue_team') query = query.eq('team_id', context.teamId);
    const { data, error } = await query.select('*').maybeSingle();
    if (error) throw new ApiError(503, 'Could not update volunteer status.');
    if (!data) throw new ApiError(404, 'Volunteer not found.');
    return sendJson(res, 200, { success: true, volunteer: data });
  }

  if (route === '/telemetry/live' && method === 'GET') {
    await requireStaff(req);
    const { data, error } = await db.from('telemetry').select('*').order('recorded_at', { ascending: false }).limit(500);
    if (error) throw new ApiError(503, 'Could not load telemetry.');
    return sendJson(res, 200, { success: true, telemetry: data });
  }

  if (route.startsWith('/telemetry/history/') && method === 'GET') {
    const context = await requireStaff(req);
    const teamId = decodeURIComponent(route.slice('/telemetry/history/'.length));
    if (context.role === 'rescue_team' && teamId !== context.teamId) throw new ApiError(403, 'This telemetry belongs to another team.');
    const limit = Math.min(500, Math.max(1, Number(new URL(req.url, 'https://api.resqcore.invalid').searchParams.get('limit')) || 100));
    const { data, error } = await db.from('telemetry').select('*').eq('team_id', teamId).order('recorded_at', { ascending: false }).limit(limit);
    if (error) throw new ApiError(503, 'Could not load telemetry history.');
    return sendJson(res, 200, { success: true, teamId, history: data });
  }

  if (route === '/sos/active' && method === 'GET') {
    const context = await requireStaff(req);
    let query = db.from('sos_events').select('*').eq('resolved', false).order('triggered_at', { ascending: false });
    if (context.role === 'rescue_team') query = query.eq('team_id', context.teamId);
    const { data, error } = await query;
    if (error) throw new ApiError(503, 'Could not load active SOS events.');
    return sendJson(res, 200, { success: true, count: data.length, events: data });
  }

  if (route.startsWith('/sos/resolve/') && method === 'POST') {
    await requireCommand(req);
    const id = decodeURIComponent(route.slice('/sos/resolve/'.length));
    const { data, error } = await db.from('sos_events').update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', id).select('*').maybeSingle();
    if (error) throw new ApiError(503, 'Could not resolve the SOS event.');
    if (!data) throw new ApiError(404, 'SOS event not found.');
    return sendJson(res, 200, { success: true, event: data });
  }

  if (route === '/admin/teams' && method === 'GET') {
    await requireAdmin(req);
    const { data, error } = await db.from('teams').select(teamColumns).order('name');
    if (error) throw new ApiError(503, 'Could not load teams.');
    return sendJson(res, 200, { success: true, teams: data.map(serializeTeam) });
  }

  if (route === '/admin/teams' && method === 'POST') {
    await requireAdmin(req);
    const body = await readBody(req);
    const name = requireText(body.name, 'name', 120);
    const { data, error } = await db.from('teams').insert({
      id: String(body.id || `TEAM-${randomUUID().slice(0, 8)}`).toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
      name,
      specialization: String(body.specialization || 'Field Response').slice(0, 120),
      status: 'Available',
      responders: Math.max(0, Math.min(200, Number(body.responders) || 0)),
      sector_id: body.sectorId || null,
    }).select(teamColumns).single();
    if (error) throw new ApiError(error.code === '23505' ? 409 : 503, error.code === '23505' ? 'A team with that name or id already exists.' : 'Could not create the team.');
    return sendJson(res, 201, { success: true, team: serializeTeam(data) });
  }

  if (route === '/admin/staff-invites' && method === 'GET') {
    await requireAdmin(req);
    const { data, error } = await db.from('staff_invites').select('email,role,team_id,created_at,accepted_at').order('created_at', { ascending: false }).limit(200);
    if (error) throw new ApiError(503, 'Could not load staff invitations.');
    return sendJson(res, 200, { success: true, invites: data });
  }

  if (route === '/admin/staff-invites' && method === 'POST') {
    const context = await requireAdmin(req);
    const body = await readBody(req);
    const email = requireText(body.email, 'email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter a valid email address.');
    if (!['command_operator', 'rescue_team'].includes(body.role)) throw new ApiError(400, 'Invalid staff role.');
    const teamId = body.role === 'rescue_team' ? requireText(body.teamId, 'teamId', 100) : null;
    if (teamId) {
      const { data: team, error: teamError } = await db.from('teams').select('id').eq('id', teamId).maybeSingle();
      if (teamError) throw new ApiError(503, 'Could not verify the selected team.');
      if (!team) throw new ApiError(404, 'The selected rescue team does not exist.');
    }
    const { data, error } = await db.from('staff_invites').upsert({ email, role: body.role, team_id: teamId, invited_by: context.user.id, accepted_at: null }, { onConflict: 'email' }).select('email,role,team_id,created_at,accepted_at').single();
    if (error) throw new ApiError(503, 'Could not create the staff invitation.');
    return sendJson(res, 201, { success: true, invite: data });
  }

  if (route === '/database/stats' && method === 'GET') {
    await requireCommand(req);
    const tables = ['incidents', 'teams', 'messages', 'alerts', 'volunteers', 'sos_events'];
    const counts = await Promise.all(tables.map((table) => db.from(table).select('id', { count: 'exact', head: true })));
    if (counts.some((item) => item.error)) throw new ApiError(503, 'Could not load database statistics.');
    return sendJson(res, 200, { success: true, database: Object.fromEntries(tables.map((table, index) => [table, counts[index].count || 0])) });
  }

  throw new ApiError(404, 'Endpoint not found.');
}

export default async function handler(req, res) {
  try {
    await handle(req, res);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    if (status >= 500) console.error('[ResQCore API]', error.message);
    if (!res.headersSent) sendJson(res, status, { error: status >= 500 ? 'The backend could not complete the request.' : error.message });
    else res.end();
  }
}
