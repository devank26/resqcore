import http from 'http';
import { URL } from 'url';
import { store } from './services/store.js';
import { eventBus } from './services/eventBus.js';
import { SimpleWebSocketServer } from './services/websocketServer.js';

const PORT = process.env.PORT || 5000;

// Helper to send JSON responses
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
  });
  res.end(JSON.stringify(data));
}

// Helper to parse JSON body
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      // Protect against oversized payload
      if (body.length > 2e6) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // Global CORS handling
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method;

  // 1. Health & Diagnostics
  if (pathname === '/api/health' && method === 'GET') {
    return sendJSON(res, 200, {
      status: 'online',
      service: 'ResQCore Unified Real-Time Backend',
      version: '2.0.0',
      connectedSSE: eventBus.getSSEClientCount(),
      connectedWS: wsServer ? wsServer.getConnectedCount() : 0,
      activeIncidents: store.getIncidents().length,
      teamsCount: store.getTeams().length,
      timestamp: new Date().toISOString()
    });
  }

  // 2. Server-Sent Events (SSE) Real-Time Stream (Command Center & Web Clients)
  if (pathname === '/api/stream' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now(), service: 'ResQCore Real-Time Event Stream' })}\n\n`);
    eventBus.addSSEClient(res);

    req.on('close', () => {
      eventBus.removeSSEClient(res);
    });
    return;
  }

  // 3. Citizen SOS & Emergency Reports
  if (pathname === '/api/citizen/sos' && method === 'POST') {
    const data = await parseBody(req);
    const newIncident = store.addIncident({
      id: data.id,
      title: data.title || 'Emergency SOS',
      type: data.type || 'General',
      location: data.location,
      fullAddress: data.fullAddress,
      description: data.description,
      contactNumber: data.contactNumber,
      citizenName: data.citizenName || 'Citizen User',
      coordinates: data.coordinates,
      severity: data.severity || 'High',
      isCitizenSOS: true
    });

    // Real-Time Fanout to Command Center & Rescue Units
    eventBus.emitRealtime('new_citizen_sos', newIncident);
    console.log(`[Backend SOS] New SOS created by ${newIncident.citizenName} (${newIncident.id}) at ${newIncident.location}`);

    return sendJSON(res, 201, { success: true, incident: newIncident, request: newIncident });
  }

  // 4. Incident Status Check by ID (For Citizen App tracking)
  if (pathname.startsWith('/api/citizen/status/') && method === 'GET') {
    const id = pathname.replace('/api/citizen/status/', '');
    const found = store.getIncidentById(id);
    if (found) {
      return sendJSON(res, 200, { success: true, request: found, incident: found });
    } else {
      return sendJSON(res, 404, { error: 'Request not found' });
    }
  }

  // 5. Citizen's My-Requests
  if ((pathname === '/api/citizen/requests' || pathname === '/api/citizen/my-requests') && method === 'GET') {
    const phone = url.searchParams.get('phone');
    let requests = store.getIncidents();
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      requests = requests.filter((r) => {
        const rPhone = (r.contactNumber || '').replace(/[^0-9]/g, '');
        return rPhone.includes(cleanPhone) || cleanPhone.includes(rPhone);
      });
    }
    return sendJSON(res, 200, { success: true, count: requests.length, requests });
  }

  // 6. Get All Incidents (For Command Center & Rescue Apps)
  if (pathname === '/api/incidents' && method === 'GET') {
    const status = url.searchParams.get('status');
    let list = store.getIncidents();
    if (status && status !== 'All') {
      list = list.filter((i) => i.status.toLowerCase() === status.toLowerCase());
    }
    return sendJSON(res, 200, { success: true, count: list.length, incidents: list });
  }

  // 7. Get Single Incident
  if (pathname.startsWith('/api/incidents/') && method === 'GET') {
    const id = pathname.replace('/api/incidents/', '');
    const found = store.getIncidentById(id);
    if (found) {
      return sendJSON(res, 200, { success: true, incident: found });
    }
    return sendJSON(res, 404, { error: 'Incident not found' });
  }

  // 8. Command Center Dispatches Team to Incident
  if (pathname === '/api/command/dispatch' && method === 'POST') {
    const { requestId, incidentId, teamName, eta, notes } = await parseBody(req);
    const targetId = requestId || incidentId;

    if (!targetId) {
      return sendJSON(res, 400, { error: 'Missing incidentId or requestId' });
    }

    const result = store.assignTeam(targetId, teamName || 'Alpha 01', eta || '10 min', notes);
    if (!result) {
      return sendJSON(res, 404, { error: 'Incident not found' });
    }

    const { incident, team } = result;

    // Real-Time Fanout
    eventBus.emitRealtime('incident_assigned', {
      incidentId: incident.id,
      incident,
      teamName: incident.assignedTeam,
      eta: incident.eta,
      dispatchUpdate: `${incident.assignedTeam} dispatched · ETA ${incident.eta}`,
      team
    });

    console.log(`[Backend Dispatch] ${incident.assignedTeam} assigned to ${incident.id} (ETA: ${incident.eta})`);
    return sendJSON(res, 200, { success: true, incident, request: incident });
  }

  // 9. Command Center Verifies Incident
  if (pathname === '/api/command/verify' && method === 'POST') {
    const { incidentId } = await parseBody(req);
    const incident = store.verifyIncident(incidentId);
    if (!incident) {
      return sendJSON(res, 404, { error: 'Incident not found' });
    }

    eventBus.emitRealtime('incident_verified', { incidentId: incident.id, incident });
    return sendJSON(res, 200, { success: true, incident });
  }

  // 10. Update Incident Status (e.g. from Rescue Team: 'Responding', 'On site', 'Resolved')
  if (pathname === '/api/incidents/update' && method === 'POST') {
    const { incidentId, status, notes, teamName } = await parseBody(req);
    const updated = store.updateIncidentStatus(incidentId, status, notes, teamName);

    if (!updated) {
      return sendJSON(res, 404, { error: 'Incident not found' });
    }

    eventBus.emitRealtime('incident_status_changed', {
      incidentId: updated.id,
      incident: updated,
      status: updated.status,
      notes: notes || updated.substatus
    });

    console.log(`[Backend Incident] Status for ${updated.id} updated to '${updated.status}'`);
    return sendJSON(res, 200, { success: true, incident: updated });
  }

  // 11. Rescue Team Reports New Incident from Field
  if (pathname === '/api/incidents/report' && method === 'POST') {
    const data = await parseBody(req);
    const newIncident = store.addIncident({
      title: data.title || 'Field Incident',
      location: data.location || 'Tactical Sector',
      severity: data.severity || 'Medium',
      description: data.description || '',
      status: 'Responding',
      assignedTeam: data.teamName || 'Field Unit',
      fieldReport: `Field reconnaissance reported by ${data.reporter || 'Field Team'}`,
      coordinates: data.coordinates,
      isCitizenSOS: false,
      isRescueSOS: false
    });

    eventBus.emitRealtime('incident_reported', { incident: newIncident });
    return sendJSON(res, 201, { success: true, incident: newIncident });
  }

  // 12. Rescue Team Field SOS Beacon
  if (pathname === '/api/teams/sos' && method === 'POST') {
    const data = await parseBody(req);
    const sosIncident = store.addIncident({
      title: `🚨 TACTICAL SOS: ${data.teamName || 'Rescue Unit'} In Distress`,
      location: data.location || 'GPS Pin',
      severity: 'Critical',
      description: data.notes || `Emergency distress beacon triggered by ${data.operatorName || 'Rescuer'} (${data.teamName || 'Team Alpha'}). Immediate reinforcement required.`,
      status: 'Escalated',
      assignedTeam: 'ALL AVAILABLE UNITS',
      coordinates: data.coordinates,
      isRescueSOS: true,
      isCitizenSOS: false
    });

    store.createSosEvent({
      teamId: data.teamId,
      teamName: data.teamName,
      operatorName: data.operatorName,
      lat: data.coordinates?.lat || data.coordinates?.latitude,
      lng: data.coordinates?.lng || data.coordinates?.longitude,
      locationText: data.location,
      notes: data.notes,
      incidentId: sosIncident.id
    });

    eventBus.emitRealtime('new_rescue_sos', {
      sosIncident,
      teamId: data.teamId,
      teamName: data.teamName,
      coordinates: data.coordinates
    });

    return sendJSON(res, 201, { success: true, incident: sosIncident });
  }

  // 13. Teams List & Telemetry
  if (pathname === '/api/teams' && method === 'GET') {
    return sendJSON(res, 200, { success: true, teams: store.getTeams() });
  }

  if (pathname === '/api/teams/telemetry' && method === 'POST') {
    const { teamId, lat, lng, battery, status } = await parseBody(req);
    const updatedTeam = store.updateTeamTelemetry(teamId, { lat, lng, battery, status });

    if (updatedTeam) {
      eventBus.emitRealtime('team_telemetry_update', {
        teamId: updatedTeam.id,
        team: updatedTeam,
        lat: updatedTeam.coordinates.lat,
        lng: updatedTeam.coordinates.lng,
        battery: updatedTeam.battery,
        status: updatedTeam.status
      });
      return sendJSON(res, 200, { success: true, team: updatedTeam });
    }
    return sendJSON(res, 404, { error: 'Team not found' });
  }

  // 14. Tactical Communications & Chat
  if (pathname === '/api/chat/messages' && method === 'GET') {
    const channel = url.searchParams.get('channel') || 'all';
    return sendJSON(res, 200, { success: true, messages: store.getMessages(channel) });
  }

  if (pathname === '/api/chat/send' && method === 'POST') {
    const { channel, sender, role, text, locationTag, attachmentUrl, isAlert, initials, isSelf } = await parseBody(req);
    if (!text || !text.trim()) {
      return sendJSON(res, 400, { error: 'Message text cannot be empty' });
    }

    const { channel: targetChannel, message } = store.addMessage(channel || 'ernakulam-command', {
      sender,
      role,
      text,
      locationTag,
      attachmentUrl,
      isAlert,
      initials,
      isSelf
    });

    eventBus.emitRealtime('new_chat_message', {
      channel: targetChannel,
      message
    });

    return sendJSON(res, 201, { success: true, channel: targetChannel, message });
  }

  // 15. Command Center Broadcasts & Alerts
  if (pathname === '/api/alerts' && method === 'GET') {
    return sendJSON(res, 200, { success: true, alerts: store.getAlerts() });
  }

  if (pathname === '/api/command/broadcast' && method === 'POST') {
    const { recipients, message, severity, issuedBy } = await parseBody(req);
    if (!message || !message.trim()) {
      return sendJSON(res, 400, { error: 'Broadcast message cannot be empty' });
    }

    const newAlert = store.addBroadcast({ recipients, message, severity, issuedBy });

    eventBus.emitRealtime('emergency_broadcast', {
      alert: newAlert,
      message,
      severity,
      recipients
    });

    console.log(`[Backend Broadcast] Dispatched to ${recipients}: "${message.slice(0, 50)}..."`);
    return sendJSON(res, 201, { success: true, alert: newAlert });
  }

  // 16. Shelters & Evacuees
  if (pathname === '/api/shelters' && method === 'GET') {
    return sendJSON(res, 200, { success: true, shelters: store.getShelters() });
  }

  if (pathname === '/api/shelters/update' && method === 'POST') {
    const { shelterId, occupied } = await parseBody(req);
    const shelter = store.updateShelterOccupancy(shelterId, occupied);
    if (shelter) {
      eventBus.emitRealtime('shelter_updated', { shelter });
      return sendJSON(res, 200, { success: true, shelter });
    }
    return sendJSON(res, 404, { error: 'Shelter not found' });
  }

  // 17. Tactical Sectors API
  if (pathname === '/api/sectors' && method === 'GET') {
    const theater = url.searchParams.get('theater');
    const sectors = store.getSectors(theater);
    return sendJSON(res, 200, { success: true, count: sectors.length, sectors });
  }

  if (pathname.startsWith('/api/sectors/') && method === 'GET') {
    const id = pathname.replace('/api/sectors/', '');
    const sector = store.getSectorById(id);
    if (!sector) return sendJSON(res, 404, { error: 'Sector not found' });

    const sectorIncidents = store.getIncidents().filter((i) => i.sectorId === id);
    const sectorTeams = store.getTeams().filter((t) => t.sectorId === id);
    return sendJSON(res, 200, { success: true, sector, incidents: sectorIncidents, teams: sectorTeams });
  }

  if (pathname.startsWith('/api/sectors/') && (method === 'PUT' || method === 'POST')) {
    const id = pathname.replace('/api/sectors/', '');
    const data = await parseBody(req);
    const updated = store.updateSector(id, data);
    if (!updated) return sendJSON(res, 404, { error: 'Sector not found' });
    eventBus.emitRealtime('sector_status_changed', { sector: updated });
    return sendJSON(res, 200, { success: true, sector: updated });
  }

  // 18. SQLite Database Stats & Diagnostics
  if (pathname === '/api/database/stats' && method === 'GET') {
    return sendJSON(res, 200, { success: true, database: store.getDatabaseStats() });
  }

  // VOLUNTEER ROUTES
  if (pathname === '/api/volunteers' && method === 'GET') {
    const sector_id = url.searchParams.get('sector_id');
    const status = url.searchParams.get('status');
    const volunteers = store.getVolunteers({ sector_id, status });
    return sendJSON(res, 200, { success: true, count: volunteers.length, volunteers });
  }

  if (pathname === '/api/volunteers/register' && method === 'POST') {
    const data = await parseBody(req);
    if (!data.name) return sendJSON(res, 400, { error: 'Name is required' });
    const volunteer = store.addVolunteer(data);
    eventBus.emitRealtime('volunteer_registered', { volunteer });
    console.log(`[Backend Volunteers] New volunteer: ${volunteer.name} (${volunteer.id})`);
    return sendJSON(res, 201, { success: true, volunteer });
  }

  if (pathname.startsWith('/api/volunteers/') && method === 'PUT') {
    const id = pathname.replace('/api/volunteers/', '');
    const { status } = await parseBody(req);
    const volunteer = store.updateVolunteerStatus(id, status);
    if (!volunteer) return sendJSON(res, 404, { error: 'Volunteer not found' });
    eventBus.emitRealtime('volunteer_updated', { volunteer });
    return sendJSON(res, 200, { success: true, volunteer });
  }

  // TELEMETRY ROUTES
  if (pathname === '/api/telemetry/live' && method === 'GET') {
    const liveData = store.getLiveTelemetry();
    return sendJSON(res, 200, { success: true, telemetry: liveData });
  }

  if (pathname.startsWith('/api/telemetry/history/') && method === 'GET') {
    const teamId = pathname.replace('/api/telemetry/history/', '');
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const history = store.getTelemetryHistory(teamId, limit);
    return sendJSON(res, 200, { success: true, teamId, history });
  }

  // SOS EVENTS ROUTES
  if (pathname === '/api/sos/active' && method === 'GET') {
    const events = store.getActiveSosEvents();
    return sendJSON(res, 200, { success: true, count: events.length, events });
  }

  if (pathname.startsWith('/api/sos/resolve/') && method === 'POST') {
    const id = pathname.replace('/api/sos/resolve/', '');
    const resolved = store.resolveSosEvent(id);
    if (!resolved) return sendJSON(res, 404, { error: 'SOS event not found' });
    eventBus.emitRealtime('sos_resolved', { sosId: id, event: resolved });
    return sendJSON(res, 200, { success: true, event: resolved });
  }

  // 404 fallback
  return sendJSON(res, 404, { error: 'Endpoint not found', path: pathname });
});

// Attach WebSocket Server to the same HTTP server
const wsServer = new SimpleWebSocketServer(server, { path: '/ws' });
eventBus.setWebSocketServer(wsServer);

// Handle inbound WebSocket messages from mobile or command center clients
wsServer.onMessage((msg, client) => {
  try {
    const type = msg.type || msg.event;
    const data = msg.data || msg;

    if (type === 'chat_message') {
      const { channel, message } = store.addMessage(data.channel || 'ernakulam-command', {
        sender: data.sender || client.meta.name || 'Mobile Operative',
        role: data.role || client.role,
        text: data.text,
        locationTag: data.locationTag,
        attachmentUrl: data.attachmentUrl
      });
      eventBus.emitRealtime('new_chat_message', { channel, message });
    } else if (type === 'telemetry') {
      const updated = store.updateTeamTelemetry(data.teamId || client.meta.teamId, data);
      if (updated) {
        eventBus.emitRealtime('team_telemetry_update', {
          teamId: updated.id,
          team: updated,
          lat: updated.coordinates.lat,
          lng: updated.coordinates.lng,
          battery: updated.battery,
          status: updated.status
        });
      }
    } else if (type === 'sos') {
      const sosInc = store.addIncident({
        title: `🚨 TACTICAL SOS: ${data.teamName || 'Field Unit'} Beacon`,
        location: data.location || 'GPS Pin',
        severity: 'High',
        description: data.text || 'Emergency SOS beacon triggered in tactical field operations.',
        status: 'Escalated',
        assignedTeam: 'NEAREST AVAILABLE UNITS',
        coordinates: data.coordinates
      });
      eventBus.emitRealtime('new_rescue_sos', { sosIncident: sosInc });
    } else if (type === 'update_status') {
      const updated = store.updateIncidentStatus(data.incidentId, data.status, data.notes, data.teamName);
      if (updated) {
        eventBus.emitRealtime('incident_status_changed', {
          incidentId: updated.id,
          incident: updated,
          status: updated.status,
          notes: data.notes
        });
      }
    }
  } catch (err) {
    console.warn('[WebSocket Inbound Error]:', err.message);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`============================================================`);
  console.log(`[ResQCore Unified Backend] RUNNING ON http://0.0.0.0:${PORT}`);
  console.log(`- REST API Gateway:      http://localhost:${PORT}/api/health`);
  console.log(`- Real-Time SSE Stream:  http://localhost:${PORT}/api/stream`);
  console.log(`- Real-Time WebSocket:   ws://localhost:${PORT}/ws`);
  console.log(`- Citizen SOS Endpoint:  http://localhost:${PORT}/api/citizen/sos`);
  console.log(`- Command Dispatch:      http://localhost:${PORT}/api/command/dispatch`);
  console.log(`- Tactical Chat:         http://localhost:${PORT}/api/chat/send`);
  console.log(`- Teams Telemetry:       http://localhost:${PORT}/api/teams/telemetry`);
  console.log(`============================================================`);
});
