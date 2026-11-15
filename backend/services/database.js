import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { seedIncidents, seedTeams, seedMessages, seedAlerts, seedShelters } from '../data/seedData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'resqcore.db');

export const INITIAL_SECTORS = [
  // Uttarakhand (Primary Theater)
  {
    id: 'SEC-UK-01',
    theater: 'uttarakhand',
    name: 'Sector 1: Alpha Valley',
    short_name: 'SEC-1: Alpha',
    color: '#EF4444',
    description: 'Alaknanda River Gorge & Lower Valley. Flash flood & landslide vulnerability.',
    center_lat: 30.565,
    center_lng: 79.545,
    bounds: [
      { lat: 30.585, lng: 79.525 },
      { lat: 30.585, lng: 79.565 },
      { lat: 30.545, lng: 79.565 },
      { lat: 30.545, lng: 79.525 }
    ],
    status: 'Evacuating',
    alert_level: 'Critical'
  },
  {
    id: 'SEC-UK-02',
    theater: 'uttarakhand',
    name: 'Sector 2: Bravo Urban',
    short_name: 'SEC-2: Bravo',
    color: '#F59E0B',
    description: 'Joshimath Urban Center & Main Bazaar. Structural monitoring & shelter zone.',
    center_lat: 30.565,
    center_lng: 79.585,
    bounds: [
      { lat: 30.585, lng: 79.565 },
      { lat: 30.585, lng: 79.605 },
      { lat: 30.545, lng: 79.605 },
      { lat: 30.545, lng: 79.565 }
    ],
    status: 'Active',
    alert_level: 'Warning'
  },
  {
    id: 'SEC-UK-03',
    theater: 'uttarakhand',
    name: 'Sector 3: Charlie Ridge',
    short_name: 'SEC-3: Charlie',
    color: '#38BDF8',
    description: 'Auli / Upper Mountain Ridge. Helipad extraction & high-altitude recon.',
    center_lat: 30.525,
    center_lng: 79.585,
    bounds: [
      { lat: 30.545, lng: 79.565 },
      { lat: 30.545, lng: 79.605 },
      { lat: 30.505, lng: 79.605 },
      { lat: 30.505, lng: 79.565 }
    ],
    status: 'Active',
    alert_level: 'Normal'
  },
  {
    id: 'SEC-UK-04',
    theater: 'uttarakhand',
    name: 'Sector 4: Delta Logistics',
    short_name: 'SEC-4: Delta',
    color: '#10B981',
    description: 'Chamoli Transit & National Highway Corridor. Heavy machinery & staging.',
    center_lat: 30.525,
    center_lng: 79.545,
    bounds: [
      { lat: 30.545, lng: 79.525 },
      { lat: 30.545, lng: 79.565 },
      { lat: 30.505, lng: 79.565 },
      { lat: 30.505, lng: 79.525 }
    ],
    status: 'Secured',
    alert_level: 'Normal'
  },
  // Kerala (Demo Theater)
  {
    id: 'SEC-KL-01',
    theater: 'kerala',
    name: 'Sector 1: Coastal Vypin',
    short_name: 'SEC-1: Vypin',
    color: '#EF4444',
    description: 'Vypin Island Coastal Surge Zone. Coastal erosion and high tide warnings.',
    center_lat: 9.992,
    center_lng: 76.225,
    bounds: [
      { lat: 10.010, lng: 76.210 },
      { lat: 10.010, lng: 76.240 },
      { lat: 9.975, lng: 76.240 },
      { lat: 9.975, lng: 76.210 }
    ],
    status: 'Active',
    alert_level: 'Warning'
  },
  {
    id: 'SEC-KL-02',
    theater: 'kerala',
    name: 'Sector 2: Mattancherry Basin',
    short_name: 'SEC-2: Mattancherry',
    color: '#F59E0B',
    description: 'Historic District & Canal Inundation Zone.',
    center_lat: 9.958,
    center_lng: 76.260,
    bounds: [
      { lat: 9.975, lng: 76.245 },
      { lat: 9.975, lng: 76.275 },
      { lat: 9.940, lng: 76.275 },
      { lat: 9.940, lng: 76.245 }
    ],
    status: 'Active',
    alert_level: 'Normal'
  },
  {
    id: 'SEC-KL-03',
    theater: 'kerala',
    name: 'Sector 3: Willingdon Hub',
    short_name: 'SEC-3: Port Hub',
    color: '#38BDF8',
    description: 'Willingdon Island Maritime Logistics & Naval Base Relief Staging.',
    center_lat: 9.945,
    center_lng: 76.280,
    bounds: [
      { lat: 9.965, lng: 76.265 },
      { lat: 9.965, lng: 76.305 },
      { lat: 9.925, lng: 76.305 },
      { lat: 9.925, lng: 76.265 }
    ],
    status: 'Secured',
    alert_level: 'Normal'
  },
  {
    id: 'SEC-KL-04',
    theater: 'kerala',
    name: 'Sector 4: Fort Kochi Waterways',
    short_name: 'SEC-4: Fort Kochi',
    color: '#10B981',
    description: 'Low-Lying Canal Basin & Ferry Terminal. Swiftwater rescue boat grid.',
    center_lat: 9.966,
    center_lng: 76.240,
    bounds: [
      { lat: 9.975, lng: 76.220 },
      { lat: 9.975, lng: 76.250 },
      { lat: 9.945, lng: 76.250 },
      { lat: 9.945, lng: 76.220 }
    ],
    status: 'Active',
    alert_level: 'Normal'
  }
];

class DatabaseManager {
  constructor() {
    this._db = null;
  }

  get db() {
    if (!this._db) {
      this.init();
    }
    return this._db;
  }

  init() {
    if (this._db) return this;
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    this._db = new DatabaseSync(DB_PATH);

    // SQLite performance pragmas
    this._db.exec('PRAGMA journal_mode=WAL;');
    this._db.exec('PRAGMA synchronous=NORMAL;');
    this._db.exec('PRAGMA foreign_keys=ON;');

    this._initSchema();
    this._seedIfEmpty();
    console.log('[SQLite DB] Schema initialized successfully at', DB_PATH);
    return this;
  }

  _initSchema() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS sectors (
        id TEXT PRIMARY KEY,
        theater TEXT NOT NULL,
        name TEXT NOT NULL,
        short_name TEXT NOT NULL,
        color TEXT NOT NULL,
        description TEXT,
        center_lat REAL NOT NULL,
        center_lng REAL NOT NULL,
        bounds_json TEXT NOT NULL,
        status TEXT DEFAULT 'Active',
        alert_level TEXT DEFAULT 'Normal',
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS incidents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        location TEXT NOT NULL,
        short_location TEXT,
        area TEXT,
        affected INTEGER DEFAULT 1,
        severity TEXT DEFAULT 'High',
        status TEXT DEFAULT 'Unverified',
        response_summary TEXT,
        response_detail TEXT,
        description TEXT,
        field_report TEXT,
        contact_number TEXT,
        citizen_name TEXT,
        assigned_team TEXT,
        eta TEXT,
        substatus TEXT,
        coordinates_json TEXT NOT NULL,
        sector_id TEXT,
        is_citizen_sos INTEGER DEFAULT 0,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        specialization TEXT,
        status TEXT DEFAULT 'Available',
        responders INTEGER DEFAULT 6,
        task TEXT,
        battery INTEGER DEFAULT 100,
        eta TEXT,
        lat REAL,
        lng REAL,
        sector_id TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS citizens (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        phone_number TEXT,
        email TEXT,
        blood_group TEXT,
        sector_id TEXT,
        lat REAL,
        lng REAL,
        last_seen TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        role TEXT NOT NULL,
        initials TEXT,
        is_self INTEGER DEFAULT 0,
        time TEXT,
        text TEXT,
        location_tag TEXT,
        attachment_url TEXT,
        is_alert INTEGER DEFAULT 0,
        sector_id TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        code TEXT,
        subtitle TEXT,
        severity TEXT DEFAULT 'Critical',
        recipients TEXT,
        issued_by TEXT,
        sector_id TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS shelters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT,
        capacity INTEGER DEFAULT 100,
        occupied INTEGER DEFAULT 0,
        lat REAL,
        lng REAL,
        sector_id TEXT
      );

      CREATE TABLE IF NOT EXISTS volunteers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        skills TEXT DEFAULT '[]',
        sector_id TEXT,
        status TEXT DEFAULT 'Available',
        lat REAL,
        lng REAL,
        team_id TEXT,
        registered_at TEXT DEFAULT (datetime('now')),
        last_seen TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id TEXT NOT NULL,
        team_name TEXT,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        battery INTEGER DEFAULT 100,
        signal TEXT DEFAULT 'Strong',
        status TEXT DEFAULT 'Deployed',
        altitude REAL,
        speed REAL,
        heading REAL,
        recorded_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sos_events (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        team_name TEXT,
        operator_name TEXT,
        lat REAL,
        lng REAL,
        location_text TEXT,
        notes TEXT,
        severity TEXT DEFAULT 'Critical',
        resolved INTEGER DEFAULT 0,
        incident_id TEXT,
        triggered_at TEXT DEFAULT (datetime('now')),
        resolved_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
      CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
      CREATE INDEX IF NOT EXISTS idx_incidents_sector ON incidents(sector_id);
      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);
      CREATE INDEX IF NOT EXISTS idx_telemetry_team ON telemetry(team_id);
      CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry(recorded_at);
      CREATE INDEX IF NOT EXISTS idx_sos_team ON sos_events(team_id);
      CREATE INDEX IF NOT EXISTS idx_sos_resolved ON sos_events(resolved);
      CREATE INDEX IF NOT EXISTS idx_volunteers_sector ON volunteers(sector_id);
      CREATE INDEX IF NOT EXISTS idx_volunteers_status ON volunteers(status);
    `);
  }

  _seedIfEmpty() {
    const sectorCount = this.db.prepare('SELECT COUNT(*) as c FROM sectors').get().c;
    if (sectorCount === 0) {
      const insert = this.db.prepare(`
        INSERT OR IGNORE INTO sectors (id, theater, name, short_name, color, description, center_lat, center_lng, bounds_json, status, alert_level, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      for (const s of INITIAL_SECTORS) {
        insert.run(s.id, s.theater, s.name, s.short_name, s.color, s.description, s.center_lat, s.center_lng, JSON.stringify(s.bounds), s.status, s.alert_level);
      }
      console.log(`[SQLite DB] Seeded ${INITIAL_SECTORS.length} sectors`);
    }

    const volCount = this.db.prepare('SELECT COUNT(*) as c FROM volunteers').get().c;
    if (volCount === 0) {
      const seedVols = [
        { id: 'VOL-001', name: 'Ravi Sharma', phone: '+91 98110 11001', skills: ['First Aid', 'Search & Rescue', 'Communication'], sector_id: 'SEC-UK-01', status: 'Active', lat: 30.570, lng: 79.530 },
        { id: 'VOL-002', name: 'Priya Singh', phone: '+91 98110 11002', skills: ['Medical', 'Trauma Care', 'Triage'], sector_id: 'SEC-UK-02', status: 'Active', lat: 30.568, lng: 79.588 },
        { id: 'VOL-003', name: 'Arun Negi', phone: '+91 98110 11003', skills: ['Mountain Rescue', 'Rope Work', 'Navigation'], sector_id: 'SEC-UK-03', status: 'Available', lat: 30.527, lng: 79.590 },
        { id: 'VOL-004', name: 'Sunita Rawat', phone: '+91 98110 11004', skills: ['Logistics', 'Supply Chain', 'Shelter Management'], sector_id: 'SEC-UK-04', status: 'Active', lat: 30.522, lng: 79.548 },
        { id: 'VOL-005', name: 'Deepak Bisht', phone: '+91 98110 11005', skills: ['Drone Operation', 'Surveillance', 'Mapping'], sector_id: 'SEC-UK-01', status: 'Available', lat: 30.575, lng: 79.540 },
        { id: 'VOL-006', name: 'Meena Joshi', phone: '+91 98110 11006', skills: ['Counseling', 'Community Liaison', 'Translation'], sector_id: 'SEC-UK-02', status: 'Resting', lat: 30.562, lng: 79.580 },
      ];
      const insert = this.db.prepare(`
        INSERT OR IGNORE INTO volunteers (id, name, phone, skills, sector_id, status, lat, lng)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const v of seedVols) {
        insert.run(v.id, v.name, v.phone, JSON.stringify(v.skills), v.sector_id, v.status, v.lat, v.lng);
      }
      console.log(`[SQLite DB] Seeded ${seedVols.length} volunteers`);
    }
  }

  findSectorForPoint(lat, lng) {
    if (lat == null || lng == null) return null;
    const sectors = this.db.prepare('SELECT * FROM sectors').all();
    for (const sector of sectors) {
      let bounds;
      try { bounds = JSON.parse(sector.bounds_json || '[]'); } catch (_) { continue; }
      if (!bounds || bounds.length < 4) continue;
      const lats = bounds.map(b => b.lat);
      const lngs = bounds.map(b => b.lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
        return sector;
      }
    }
    return null;
  }

  // =================== INCIDENTS ===================
  getAllIncidents(filters = {}) {
    let query = 'SELECT * FROM incidents';
    const params = [];
    const conditions = [];
    if (filters.status && filters.status !== 'All') { conditions.push('status = ?'); params.push(filters.status); }
    if (filters.sector_id) { conditions.push('sector_id = ?'); params.push(filters.sector_id); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC';
    return this.db.prepare(query).all(...params).map(r => this._parseIncident(r));
  }

  getIncidentById(id) {
    const r = this.db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
    return r ? this._parseIncident(r) : null;
  }

  addIncident(data) {
    const id = data.id || `INC-${Date.now()}`;
    const coords = data.coordinates || {};
    const lat = typeof coords.latitude === 'number' ? coords.latitude : (typeof coords.lat === 'number' ? coords.lat : (parseFloat(coords.lat) || 30.5593));
    const lng = typeof coords.longitude === 'number' ? coords.longitude : (typeof coords.lng === 'number' ? coords.lng : (parseFloat(coords.lng) || 79.5644));
    const sector = this.findSectorForPoint(lat, lng);

    this.db.prepare(`
      INSERT OR REPLACE INTO incidents (
        id, title, location, short_location, area, affected, severity, status,
        response_summary, response_detail, description, field_report,
        contact_number, citizen_name, assigned_team, eta, substatus,
        coordinates_json, sector_id, is_citizen_sos, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id,
      data.title || 'Incident',
      data.location || data.fullAddress || '',
      data.shortLocation || data.location || '',
      data.area || data.location || '',
      data.affected || data.affectedCount || 1,
      data.severity || 'Medium',
      data.status || 'Active',
      data.responseSummary || data.substatus || '',
      data.responseDetail || '',
      data.description || '',
      data.fieldReport || '',
      data.contactNumber || '',
      data.citizenName || '',
      data.assignedTeam || null,
      data.eta || null,
      data.substatus || '',
      JSON.stringify(coords),
      sector?.id || (typeof data.sectorId === 'object' ? data.sectorId?.id : data.sectorId) || 'SEC-UK-01',
      data.isCitizenSOS ? 1 : 0
    );

    return this.getIncidentById(id);
  }

  insertIncident(data) {
    return this.addIncident(data);
  }

  updateIncident(id, data = {}) {
    const existing = this.db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
    if (!existing) return null;
    this.db.prepare(`
      UPDATE incidents SET
        status = COALESCE(?, status),
        substatus = COALESCE(?, substatus),
        assigned_team = COALESCE(?, assigned_team),
        eta = COALESCE(?, eta),
        response_summary = COALESCE(?, response_summary),
        response_detail = COALESCE(?, response_detail)
      WHERE id = ?
    `).run(
      data.status ?? null,
      data.substatus ?? null,
      data.assignedTeam ?? null,
      data.eta ?? null,
      data.responseSummary ?? null,
      data.responseDetail ?? null,
      id
    );
    return this.getIncidentById(id);
  }

  updateIncidentStatus(id, status, notes, teamName) {
    const existing = this.db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
    if (!existing) return null;
    this.db.prepare(`
      UPDATE incidents SET status = ?, substatus = ?, assigned_team = COALESCE(?, assigned_team) WHERE id = ?
    `).run(status, notes || existing.substatus, teamName || null, id);
    return this.getIncidentById(id);
  }

  verifyIncident(id) {
    this.db.prepare(`UPDATE incidents SET status = 'Verified' WHERE id = ?`).run(id);
    return this.getIncidentById(id);
  }

  assignTeam(id, teamName, eta, notes) {
    const inc = this.getIncidentById(id);
    if (!inc) return null;
    this.db.prepare(`UPDATE incidents SET assigned_team = ?, eta = ?, status = 'Responding', substatus = ? WHERE id = ?`)
      .run(teamName, eta || '10 min', notes || `${teamName} dispatched · ETA ${eta || '10 min'}`, id);
    const updatedInc = this.getIncidentById(id);
    const team = this.db.prepare('SELECT * FROM teams WHERE name = ?').get(teamName);
    return { incident: updatedInc, team: team ? this._parseTeam(team) : null };
  }

  _parseIncident(r) {
    let coords = {};
    try { coords = JSON.parse(r.coordinates_json || '{}'); } catch (_) {}
    return {
      id: r.id,
      title: r.title,
      location: r.location,
      shortLocation: r.short_location || r.location,
      area: r.area || r.location,
      affected: r.affected,
      affectedCount: r.affected,
      severity: r.severity,
      status: r.status,
      responseSummary: r.response_summary,
      responseDetail: r.response_detail,
      description: r.description,
      fieldReport: r.field_report,
      contactNumber: r.contact_number,
      citizenName: r.citizen_name,
      assignedTeam: r.assigned_team,
      teamAssigned: r.assigned_team,
      eta: r.eta,
      substatus: r.substatus,
      coordinates: coords,
      sectorId: r.sector_id,
      isCitizenSOS: r.is_citizen_sos === 1,
      createdAt: r.created_at
    };
  }

  // =================== TEAMS ===================
  getAllTeams() {
    return this.db.prepare('SELECT * FROM teams ORDER BY name').all().map(r => this._parseTeam(r));
  }

  getTeamById(id) {
    const r = this.db.prepare('SELECT * FROM teams WHERE id = ? OR name = ?').get(id, id);
    return r ? this._parseTeam(r) : null;
  }

  updateTeamTelemetry(teamId, { lat, lng, battery, status, signal, altitude, speed, heading } = {}) {
    const cleanId = (teamId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let team = this.db.prepare('SELECT * FROM teams WHERE id = ? OR name = ?').get(teamId, teamId);
    if (!team) {
      const all = this.db.prepare('SELECT * FROM teams').all();
      team = all.find(t => {
        const tIdClean = t.id.toLowerCase().replace(/[^a-z0-9]/g, '');
        const tNameClean = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return (cleanId && (tIdClean.includes(cleanId) || cleanId.includes(tIdClean) ||
               tNameClean.includes(cleanId) || cleanId.includes(tNameClean)));
      });
    }

    if (!team && lat != null && lng != null) {
      const newId = (teamId || 'unit-01').toLowerCase().replace(/\s+/g, '-');
      this.db.prepare(`
        INSERT OR IGNORE INTO teams (id, name, specialization, status, battery, lat, lng, updated_at)
        VALUES (?, ?, 'Field Response', ?, ?, ?, ?, datetime('now'))
      `).run(newId, teamId || 'Field Team', status || 'Deployed', battery ?? 100, lat, lng);
      team = this.db.prepare('SELECT * FROM teams WHERE id = ?').get(newId);
    }

    if (!team) return null;

    if (lat != null && lng != null) {
      this.db.prepare(`UPDATE teams SET lat = ?, lng = ?, battery = COALESCE(?, battery), status = COALESCE(?, status), updated_at = datetime('now') WHERE id = ?`)
        .run(lat, lng, battery ?? null, status ?? null, team.id);

      // Log to telemetry time-series
      this.db.prepare(`
        INSERT INTO telemetry (team_id, team_name, lat, lng, battery, status, signal, altitude, speed, heading)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(team.id, team.name, lat, lng, battery ?? team.battery, status ?? team.status, signal ?? 'Strong', altitude ?? null, speed ?? null, heading ?? null);

      // Keep only last 500 telemetry records per team
      this.db.prepare(`DELETE FROM telemetry WHERE team_id = ? AND id NOT IN (SELECT id FROM telemetry WHERE team_id = ? ORDER BY recorded_at DESC LIMIT 500)`)
        .run(team.id, team.id);
    }

    return this.getTeamById(team.id);
  }

  getLatestTelemetry() {
    return this.db.prepare(`
      SELECT t.*, tm.name as team_name_full FROM telemetry t
      INNER JOIN (SELECT team_id, MAX(recorded_at) as max_time FROM telemetry GROUP BY team_id) latest
      ON t.team_id = latest.team_id AND t.recorded_at = latest.max_time
      LEFT JOIN teams tm ON t.team_id = tm.id
      ORDER BY t.recorded_at DESC
    `).all();
  }

  getTelemetryHistory(teamId, limit = 100) {
    return this.db.prepare('SELECT * FROM telemetry WHERE team_id = ? ORDER BY recorded_at DESC LIMIT ?').all(teamId, limit);
  }

  _parseTeam(r) {
    return {
      id: r.id,
      name: r.name,
      specialization: r.specialization,
      type: r.specialization || 'SAR',
      status: r.status,
      responders: r.responders,
      task: r.task,
      battery: r.battery,
      eta: r.eta,
      coordinates: { lat: r.lat, lng: r.lng, latitude: r.lat, longitude: r.lng },
      lat: r.lat,
      lng: r.lng,
      sectorId: r.sector_id,
      lastUpdate: r.updated_at
    };
  }

  // =================== SOS EVENTS ===================
  createSosEvent({ teamId, teamName, operatorName, lat, lng, locationText, notes, incidentId } = {}) {
    const id = `SOS-${Date.now()}`;
    this.db.prepare(`
      INSERT INTO sos_events (id, team_id, team_name, operator_name, lat, lng, location_text, notes, incident_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, teamId, teamName || '', operatorName || '', lat || null, lng || null, locationText || '', notes || '', incidentId || null);
    return this.db.prepare('SELECT * FROM sos_events WHERE id = ?').get(id);
  }

  resolveSosEvent(id) {
    this.db.prepare(`UPDATE sos_events SET resolved = 1, resolved_at = datetime('now') WHERE id = ?`).run(id);
    return this.db.prepare('SELECT * FROM sos_events WHERE id = ?').get(id);
  }

  getActiveSosEvents() {
    return this.db.prepare('SELECT * FROM sos_events WHERE resolved = 0 ORDER BY triggered_at DESC').all();
  }

  // =================== VOLUNTEERS ===================
  getAllVolunteers(filters = {}) {
    let query = 'SELECT * FROM volunteers';
    const params = [];
    const conditions = [];
    if (filters.sector_id) { conditions.push('sector_id = ?'); params.push(filters.sector_id); }
    if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY registered_at DESC';
    return this.db.prepare(query).all(...params).map(r => this._parseVolunteer(r));
  }

  addVolunteer(data) {
    const id = data.id || `VOL-${Date.now()}`;
    this.db.prepare(`
      INSERT OR REPLACE INTO volunteers (id, name, phone, email, skills, sector_id, status, lat, lng, team_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.phone || '', data.email || '', JSON.stringify(data.skills || []), data.sectorId || null, data.status || 'Available', data.lat || null, data.lng || null, data.teamId || null);
    return this.db.prepare('SELECT * FROM volunteers WHERE id = ?').get(id);
  }

  updateVolunteerStatus(id, status) {
    this.db.prepare(`UPDATE volunteers SET status = ?, last_seen = datetime('now') WHERE id = ?`).run(status, id);
    return this.db.prepare('SELECT * FROM volunteers WHERE id = ?').get(id);
  }

  _parseVolunteer(r) {
    let skills = [];
    try { skills = JSON.parse(r.skills || '[]'); } catch (_) {}
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      skills,
      sectorId: r.sector_id,
      status: r.status,
      lat: r.lat,
      lng: r.lng,
      teamId: r.team_id,
      registeredAt: r.registered_at,
      lastSeen: r.last_seen
    };
  }

  // =================== MESSAGES ===================
  getMessages(channel = 'all') {
    if (channel === 'all' || !channel) {
      return this.db.prepare('SELECT * FROM messages ORDER BY created_at ASC LIMIT 200').all().map(r => this._parseMessage(r));
    }
    return this.db.prepare('SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at ASC LIMIT 100').all(channel).map(r => this._parseMessage(r));
  }

  addMessage(channel, data) {
    const id = data.id || `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const timeStr = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    this.db.prepare(`
      INSERT INTO messages (id, channel_id, sender, role, text, location_tag, is_alert, initials, is_self, time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      id, channel || 'ernakulam-command', data.sender || 'System', data.role || 'Operative',
      data.text, data.locationTag || '', data.isAlert ? 1 : 0, data.initials || 'HQ',
      data.isSelf ? 1 : 0, timeStr
    );
    return { channel, message: this._parseMessage(this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id)) };
  }

  insertMessage(data = {}) {
    const channel = data.channelId || data.channel || 'ernakulam-command';
    return this.addMessage(channel, data).message;
  }

  _parseMessage(r) {
    return {
      id: r.id,
      channel: r.channel_id,
      channelId: r.channel_id,
      sender: r.sender,
      role: r.role,
      text: r.text,
      locationTag: r.location_tag,
      isAlert: r.is_alert === 1,
      initials: r.initials,
      isSelf: r.is_self === 1,
      time: r.time,
      timestamp: r.created_at || r.time
    };
  }

  // =================== ALERTS ===================
  getAlerts() {
    return this.db.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 50').all();
  }

  getAllAlerts() {
    return this.getAlerts();
  }

  addAlert(data) {
    const id = `ALT-${Date.now()}`;
    this.db.prepare(`INSERT INTO alerts (id, title, subtitle, severity, recipients, issued_by, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`)
      .run(id, data.title, data.subtitle || '', data.severity || 'Critical', data.recipients || 'ALL', data.issuedBy || 'HQ');
    return this.db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
  }

  insertAlert(data = {}) {
    return this.addAlert(data);
  }

  // =================== SHELTERS ===================
  getShelters() {
    return this.db.prepare('SELECT * FROM shelters ORDER BY name').all().map(r => ({
      ...r,
      coordinates: { lat: r.lat, lng: r.lng, latitude: r.lat, longitude: r.lng }
    }));
  }

  getAllShelters() {
    return this.getShelters();
  }

  // =================== SECTORS ===================
  getAllSectors(theater) {
    if (theater) return this.db.prepare('SELECT * FROM sectors WHERE theater = ? ORDER BY id').all(theater);
    return this.db.prepare('SELECT * FROM sectors ORDER BY theater, id').all();
  }

  getSectors(theater) {
    return this.getAllSectors(theater);
  }

  getSectorById(id) {
    return this.db.prepare('SELECT * FROM sectors WHERE id = ?').get(id);
  }

  updateSector(id, { status, alert_level } = {}) {
    this.db.prepare(`UPDATE sectors SET status = COALESCE(?, status), alert_level = COALESCE(?, alert_level) WHERE id = ?`)
      .run(status ?? null, alert_level ?? null, id);
    return this.getSectorById(id);
  }

  // =================== STATS ===================
  getStats() {
    return {
      incidents: this.db.prepare('SELECT COUNT(*) as c FROM incidents').get().c,
      active_incidents: this.db.prepare("SELECT COUNT(*) as c FROM incidents WHERE status != 'Resolved'").get().c,
      teams: this.db.prepare('SELECT COUNT(*) as c FROM teams').get().c,
      sectors: this.db.prepare('SELECT COUNT(*) as c FROM sectors').get().c,
      messages: this.db.prepare('SELECT COUNT(*) as c FROM messages').get().c,
      volunteers: this.db.prepare('SELECT COUNT(*) as c FROM volunteers').get().c,
      active_volunteers: this.db.prepare("SELECT COUNT(*) as c FROM volunteers WHERE status IN ('Active','Available')").get().c,
      sos_active: this.db.prepare('SELECT COUNT(*) as c FROM sos_events WHERE resolved = 0').get().c,
      telemetry_records: this.db.prepare('SELECT COUNT(*) as c FROM telemetry').get().c,
      db_path: DB_PATH
    };
  }

  getDatabaseStats() {
    return this.getStats();
  }
}

export const dbManager = new DatabaseManager().init();
