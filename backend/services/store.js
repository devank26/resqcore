import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbManager } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

class DataStore {
  constructor() {
    this.incidents = [];
    this.teams = [];
    this.messages = {};
    this.alerts = [];
    this.shelters = [];
    this.saveTimeout = null;

    this.init();
  }

  init() {
    try {
      // 1. Primary Source of Truth: SQLite Database
      this.incidents = dbManager.getAllIncidents();
      this.teams = dbManager.getAllTeams();
      this.alerts = dbManager.getAllAlerts();
      this.shelters = dbManager.getAllShelters();

      // Load messages grouped by channel
      const allMsgs = dbManager.getMessages();
      this.messages = {};
      for (const m of allMsgs) {
        const ch = m.channel || m.channelId || 'ernakulam-command';
        if (!this.messages[ch]) {
          this.messages[ch] = [];
        }
        this.messages[ch].push(m);
      }

      console.log(`[DataStore] Loaded ${this.incidents.length} incidents & ${this.teams.length} teams from SQLite database.`);
    } catch (err) {
      console.warn('[DataStore] Error initializing from SQLite, fallback:', err.message);
    }

    // Mirror to JSON for file inspection/backward compatibility
    this.scheduleSave();
  }

  scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        const payload = {
          incidents: this.incidents,
          teams: this.teams,
          messages: this.messages,
          alerts: this.alerts,
          shelters: this.shelters,
          sectors: dbManager.getSectors(),
          lastSaved: new Date().toISOString()
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(payload, null, 2), 'utf8');
      } catch (err) {
        console.warn('[DataStore] Auto-save error:', err.message);
      }
    }, 1000);
  }

  // --- Sectors ---
  getSectors(theater = null) {
    return dbManager.getSectors(theater);
  }

  getSectorById(id) {
    return dbManager.getSectorById(id);
  }

  updateSector(id, updates) {
    return dbManager.updateSector(id, updates);
  }

  // --- Incidents ---
  getIncidents() {
    return this.incidents;
  }

  getIncidentById(id) {
    return this.incidents.find((i) => i.id === id);
  }

  addIncident(incidentData) {
    const now = new Date();
    const id =
      incidentData.id ||
      `RQ-${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const lat = incidentData.coordinates?.latitude || incidentData.coordinates?.lat || 30.3165;
    const lng = incidentData.coordinates?.longitude || incidentData.coordinates?.lng || 78.0322;

    const foundSector = dbManager.findSectorForPoint(lat, lng);
    const sectorId = incidentData.sectorId || (foundSector ? foundSector.id : 'SEC-UK-01');

    const newIncident = {
      id,
      title: incidentData.title || 'Emergency Distress Call',
      location: incidentData.location || incidentData.fullAddress || 'Sector 04 Grid',
      shortLocation: incidentData.location ? incidentData.location.split('·')[0].trim() : 'Active Zone',
      area: incidentData.area || incidentData.location || 'Tactical Sector',
      affected: incidentData.affected || incidentData.affectedCount || 1,
      affectedCount: incidentData.affected || incidentData.affectedCount || 1,
      time: `Today · ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      timeAgo: 'Just now',
      timestamp: `Today · ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      severity: incidentData.severity || 'High',
      status: incidentData.status || 'Unverified',
      responseSummary: incidentData.responseSummary || 'Citizen SOS · Awaiting verification',
      responseDetail: incidentData.responseDetail || 'Verify to respond',
      description: incidentData.description || 'Emergency assistance requested.',
      fieldReport: incidentData.fieldReport || `Citizen reported · Contact: ${incidentData.contactNumber || 'N/A'}`,
      contactNumber: incidentData.contactNumber || '+91 98470 21836',
      citizenName: incidentData.citizenName || 'Citizen User',
      assignedTeam: incidentData.assignedTeam || null,
      teamAssigned: incidentData.assignedTeam || incidentData.teamAssigned || 'Unassigned',
      eta: incidentData.eta || null,
      substatus: incidentData.substatus || 'Awaiting triage by Command Center',
      sectorId,
      coordinates: {
        lat: typeof lat === 'number' ? `${lat.toFixed(4)}° N` : String(lat),
        lng: typeof lng === 'number' ? `${lng.toFixed(4)}° E` : String(lng),
        latitude: typeof lat === 'number' ? lat : parseFloat(lat) || 30.3165,
        longitude: typeof lng === 'number' ? lng : parseFloat(lng) || 78.0322,
        x: 50,
        y: 50
      },
      isCitizenSOS: Boolean(incidentData.isCitizenSOS ?? (incidentData.isRescueSOS ? false : Boolean(incidentData.citizenName || (typeof id === 'string' && id.startsWith('RQ-'))))),
      isRescueSOS: Boolean(incidentData.isRescueSOS),
      createdAt: now.toISOString()
    };

    // Save to SQLite DB
    dbManager.insertIncident(newIncident);

    // Prepend to active memory list
    this.incidents.unshift(newIncident);
    this.scheduleSave();
    return newIncident;
  }

  assignTeam(incidentId, teamName, eta = '10 min', notes = '') {
    const incident = this.getIncidentById(incidentId);
    if (!incident) return null;

    incident.status = 'Responding';
    incident.assignedTeam = teamName;
    incident.teamAssigned = teamName;
    incident.eta = eta;
    incident.responseSummary = teamName;
    incident.responseDetail = `ETA ${eta}`;
    incident.substatus = `${teamName} dispatched · ETA ${eta}`;
    if (notes) {
      incident.fieldReport = `${incident.fieldReport || ''} · ${notes}`.trim();
    }

    // Persist to SQLite
    dbManager.updateIncident(incidentId, {
      status: 'Responding',
      assignedTeam: teamName,
      eta,
      responseSummary: incident.responseSummary,
      responseDetail: incident.responseDetail,
      substatus: incident.substatus,
      fieldReport: incident.fieldReport
    });

    // Also update team status in teams list & DB
    const team = this.teams.find((t) => t.name.toLowerCase() === teamName.toLowerCase() || t.id.toLowerCase() === teamName.toLowerCase());
    if (team) {
      team.status = 'Deployed';
      team.task = `${incident.id} · ${incident.title}`;
      team.eta = `ETA ${eta}`;
      dbManager.updateTeamTelemetry(team.id, { status: 'Deployed' });
    }

    this.scheduleSave();
    return { incident, team };
  }

  verifyIncident(incidentId) {
    const incident = this.getIncidentById(incidentId);
    if (!incident) return null;

    if (incident.status === 'Unverified') {
      incident.status = 'Verified';
      incident.responseSummary = 'Verified · Standby for dispatch';
      incident.responseDetail = 'Ready to assign';
      incident.substatus = 'Verified by Command Center';

      dbManager.updateIncident(incidentId, {
        status: 'Verified',
        responseSummary: incident.responseSummary,
        responseDetail: incident.responseDetail,
        substatus: incident.substatus
      });
    }
    this.scheduleSave();
    return incident;
  }

  updateIncidentStatus(incidentId, status, notes = null, teamName = null) {
    const incident = this.getIncidentById(incidentId);
    if (!incident) return null;

    incident.status = status;
    if (teamName) {
      incident.assignedTeam = teamName;
      incident.teamAssigned = teamName;
    }
    if (notes) {
      incident.substatus = notes;
      incident.responseDetail = notes;
    }

    if (status === 'Resolved') {
      incident.responseSummary = 'Resolved';
      incident.responseDetail = 'Operation completed';
      incident.substatus = 'Incident cleared and verified';
    } else if (status === 'On site') {
      incident.responseSummary = incident.assignedTeam || 'Unit On Scene';
      incident.responseDetail = 'Active operations in progress';
    }

    dbManager.updateIncident(incidentId, {
      status,
      assignedTeam: incident.assignedTeam,
      responseSummary: incident.responseSummary,
      responseDetail: incident.responseDetail,
      substatus: incident.substatus
    });

    this.scheduleSave();
    return incident;
  }

  // --- Teams & Telemetry ---
  getTeams() {
    return this.teams;
  }

  updateTeamTelemetry(teamId, { lat, lng, battery, status }) {
    let team = this.teams.find((t) => t.id === teamId || t.name.toLowerCase() === (teamId || '').toLowerCase());
    if (!team && teamId) {
      const cleanId = teamId.toLowerCase().replace(/[^a-z0-9]/g, '');
      team = this.teams.find((t) => {
        const tIdClean = t.id.toLowerCase().replace(/[^a-z0-9]/g, '');
        const tNameClean = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return (cleanId && (tIdClean.includes(cleanId) || cleanId.includes(tIdClean) ||
               tNameClean.includes(cleanId) || cleanId.includes(tNameClean)));
      });
    }

    if (!team) {
      team = {
        id: (teamId || 'unit-01').toLowerCase().replace(/\s+/g, '-'),
        name: teamId || 'Field Team',
        status: status || 'Deployed',
        battery: Number(battery || 100),
        coordinates: { lat: Number(lat || 30.5593), lng: Number(lng || 79.5644) }
      };
      this.teams.push(team);
    }

    if (lat !== undefined && lng !== undefined) {
      team.coordinates = { lat: Number(lat), lng: Number(lng) };
    }
    if (battery !== undefined) team.battery = Number(battery);
    if (status !== undefined) team.status = status;
    team.lastTelemetry = new Date().toISOString();

    // Persist to SQLite
    dbManager.updateTeamTelemetry(team.id, { lat, lng, battery, status });

    this.scheduleSave();
    return team;
  }

  // --- Messages & Tactical Comms ---
  getMessages(channelId) {
    if (channelId && channelId !== 'all') {
      return this.messages[channelId] || [];
    }
    return this.messages;
  }

  addMessage(channelId, messageData) {
    const channel = channelId || 'ernakulam-command';
    if (!this.messages[channel]) {
      this.messages[channel] = [];
    }

    const savedMsg = dbManager.insertMessage({
      ...messageData,
      channelId: channel
    });

    this.messages[channel].push(savedMsg);
    this.scheduleSave();
    return { channel, message: savedMsg };
  }

  // --- Alerts & Broadcasts ---
  getAlerts() {
    return this.alerts;
  }

  addBroadcast({ recipients, message, severity = 'Critical', issuedBy = 'Command Center' }) {
    const savedAlert = dbManager.insertAlert({
      title: 'Command Emergency Broadcast',
      code: `ALL-UNITS-${String(Math.floor(100 + Math.random() * 900))}`,
      subtitle: message,
      severity,
      recipients: recipients || 'All active units',
      issuedBy
    });

    this.alerts.unshift(savedAlert);
    this.scheduleSave();
    return savedAlert;
  }

  // --- Shelters ---
  getShelters() {
    return this.shelters;
  }

  updateShelterOccupancy(shelterId, occupied) {
    const shelter = this.shelters.find((s) => s.id === shelterId);
    if (!shelter) return null;
    shelter.occupied = occupied;
    this.scheduleSave();
    return shelter;
  }

  getDatabaseStats() {
    return dbManager.getDatabaseStats();
  }

  // Volunteer wrappers
  getVolunteers(filters = {}) {
    try {
      return dbManager.getAllVolunteers(filters);
    } catch (e) {
      console.error('[Store] getVolunteers error:', e);
      return [];
    }
  }

  addVolunteer(data) {
    try {
      return dbManager.addVolunteer(data);
    } catch (e) {
      console.error('[Store] addVolunteer error:', e);
      return null;
    }
  }

  updateVolunteerStatus(id, status) {
    try {
      return dbManager.updateVolunteerStatus(id, status);
    } catch (e) {
      console.error('[Store] updateVolunteerStatus error:', e);
      return null;
    }
  }

  // Telemetry wrappers
  getLiveTelemetry() {
    try {
      return dbManager.getLatestTelemetry();
    } catch (e) {
      console.error('[Store] getLiveTelemetry error:', e);
      return [];
    }
  }

  getTelemetryHistory(teamId, limit = 100) {
    try {
      return dbManager.getTelemetryHistory(teamId, limit);
    } catch (e) {
      console.error('[Store] getTelemetryHistory error:', e);
      return [];
    }
  }

  // SOS event wrappers
  createSosEvent(data) {
    try {
      return dbManager.createSosEvent(data);
    } catch (e) {
      console.error('[Store] createSosEvent error:', e);
      return null;
    }
  }

  resolveSosEvent(id) {
    try {
      return dbManager.resolveSosEvent(id);
    } catch (e) {
      console.error('[Store] resolveSosEvent error:', e);
      return null;
    }
  }

  getActiveSosEvents() {
    try {
      return dbManager.getActiveSosEvents();
    } catch (e) {
      console.error('[Store] getActiveSosEvents error:', e);
      return [];
    }
  }
}

export const store = new DataStore();
