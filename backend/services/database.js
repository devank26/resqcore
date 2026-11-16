import pg from 'pg';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { BACKEND_ROOT, DATABASE_URL, IS_PROD } from './config.js';
import { referenceSectors, referenceShelters, referenceVolunteers } from '../data/seedData.js';

const { Pool } = pg;

const nowIso = () => new Date().toISOString();
const shortId = (len = 5) =>
  crypto.randomBytes(8).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, len).toUpperCase();
const bool = (v) => (v ? 1 : 0);

class DatabaseManager {
  constructor() {
    this._pool = null;
    this._initPromise = null;
  }

  get pool() {
    if (!this._pool) {
      if (!DATABASE_URL) {
        throw new Error('DATABASE_URL environment variable is required');
      }
      this._pool = new Pool({
        connectionString: DATABASE_URL,
        ...(IS_PROD ? { ssl: { rejectUnauthorized: false } } : {})
      });
    }
    return this._pool;
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      const schemaPath = path.join(BACKEND_ROOT, 'db', 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await this.pool.query(schemaSql);
      await this._seedReferenceData();
      console.log('[PostgreSQL DB] Schema initialized and ready');
      return this;
    })();
    return this._initPromise;
  }

  async close() {
    if (!this._pool) return;
    try {
      await this._pool.end();
    } catch (err) {
      console.warn('[PostgreSQL DB] Error while closing:', err.message);
    }
    this._pool = null;
    this._initPromise = null;
  }

  async query(sql, params = []) {
    return this.pool.query(sql, params);
  }

  async tx(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        /* ignore rollback errors */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async _seedReferenceData() {
    const secCount = Number((await this.query('SELECT COUNT(*) AS c FROM sectors')).rows[0].c);
    if (secCount === 0) {
      await this.tx(async (client) => {
        for (const s of referenceSectors) {
          await client.query(
            `INSERT INTO sectors (id, theater, name, short_name, color, description, center_lat, center_lng, bounds_json, status, alert_level, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (id) DO NOTHING`,
            [
              s.id, s.theater, s.name, s.short_name, s.color, s.description,
              s.center_lat, s.center_lng, JSON.stringify(s.bounds), s.status, s.alert_level, nowIso()
            ]
          );
        }
      });
      console.log(`[PostgreSQL DB] Seeded ${referenceSectors.length} reference sectors`);
    }

    const shCount = Number((await this.query('SELECT COUNT(*) AS c FROM shelters')).rows[0].c);
    if (shCount === 0) {
      await this.tx(async (client) => {
        for (const sh of referenceShelters) {
          const sec = await this.getSectorById(sh.sector_id, client);
          await client.query(
            `INSERT INTO shelters (id, name, location, capacity, occupied, lat, lng, sector_id, amenities, has_medical, has_airlift)
             VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO NOTHING`,
            [
              sh.id, sh.name, sh.location, sh.capacity,
              sec?.center.lat ?? null, sec?.center.lng ?? null,
              sh.sector_id, sh.amenities, bool(sh.has_medical), bool(sh.has_airlift)
            ]
          );
        }
      });
      console.log(`[PostgreSQL DB] Seeded ${referenceShelters.length} reference shelters`);
    }

    const volCount = Number((await this.query('SELECT COUNT(*) AS c FROM volunteers')).rows[0].c);
    if (volCount === 0 && referenceVolunteers.length > 0) {
      await this.tx(async (client) => {
        for (const v of referenceVolunteers) {
          await client.query(
            `INSERT INTO volunteers (id, name, phone, email, skills, sector_id, status, lat, lng)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO NOTHING`,
            [
              v.id, v.name, v.phone || '', v.email || '', JSON.stringify(v.skills || []),
              v.sector_id || null, v.status || 'Available', v.lat ?? null, v.lng ?? null
            ]
          );
        }
      });
      console.log(`[PostgreSQL DB] Seeded ${referenceVolunteers.length} reference volunteers`);
    }
  }

  // =================== SECTORS ===================
  async getSectors(theater) {
    const res = theater
      ? await this.query('SELECT * FROM sectors WHERE theater = $1 ORDER BY id', [theater])
      : await this.query('SELECT * FROM sectors ORDER BY theater, id');
    return res.rows.map((r) => this._parseSector(r));
  }

  async getSectorById(id, client = null) {
    const runner = client || this.pool;
    const res = await runner.query('SELECT * FROM sectors WHERE id = $1', [id]);
    return res.rows[0] ? this._parseSector(res.rows[0]) : null;
  }

  async updateSector(id, { status, alertLevel } = {}) {
    await this.query(
      'UPDATE sectors SET status = COALESCE($1, status), alert_level = COALESCE($2, alert_level) WHERE id = $3',
      [status ?? null, alertLevel ?? null, id]
    );
    return this.getSectorById(id);
  }

  async findSectorForPoint(lat, lng) {
    if (lat == null || lng == null) return null;
    for (const sector of await this.getSectors()) {
      const lats = sector.bounds.map((b) => b.lat);
      const lngs = sector.bounds.map((b) => b.lng);
      if (!lats.length) continue;
      if (lat >= Math.min(...lats) && lat <= Math.max(...lats) && lng >= Math.min(...lngs) && lng <= Math.max(...lngs)) {
        return sector;
      }
    }
    return null;
  }

  _parseSector(r) {
    let bounds = [];
    try { bounds = JSON.parse(r.bounds_json || '[]'); } catch (_) { /* ignore */ }
    return {
      id: r.id,
      theater: r.theater,
      name: r.name,
      shortName: r.short_name,
      color: r.color,
      description: r.description,
      center: { lat: r.center_lat, lng: r.center_lng },
      bounds,
      status: r.status,
      alertLevel: r.alert_level
    };
  }

  // =================== TEAMS ===================
  async createTeam({ name, callsign, specialization, responders, createdBy }) {
    const id = `team-${crypto.randomBytes(5).toString('hex')}`;
    const ts = nowIso();
    await this.query(
      `INSERT INTO teams (id, name, callsign, specialization, status, responders, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Available', $5, $6, $7, $8)`,
      [id, name, callsign || null, specialization || null, responders || 1, createdBy || null, ts, ts]
    );
    return this.getTeamById(id);
  }

  async findOrCreateTeam({ teamId, name, callsign, specialization, responders, createdBy }) {
    if (teamId) {
      const existingById = await this.getTeamById(teamId);
      if (existingById) return { team: existingById, created: false };
    }
    if (name) {
      const existingByName = await this.getTeamByName(name);
      if (existingByName) return { team: existingByName, created: false };
    }
    const team = await this.createTeam({
      name: name || `Rescue Unit ${shortId(4)}`,
      callsign,
      specialization,
      responders,
      createdBy
    });
    return { team, created: true };
  }

  async getTeamById(id) {
    if (!id) return null;
    const res = await this.query('SELECT * FROM teams WHERE id = $1', [id]);
    return res.rows[0] ? this._parseTeam(res.rows[0]) : null;
  }

  async getTeamByName(name) {
    if (!name) return null;
    const res = await this.query('SELECT * FROM teams WHERE LOWER(name) = LOWER($1)', [name]);
    return res.rows[0] ? this._parseTeam(res.rows[0]) : null;
  }

  async getAllTeams() {
    const res = await this.query('SELECT * FROM teams ORDER BY LOWER(name)');
    return res.rows.map((r) => this._parseTeam(r));
  }

  async updateTeam(id, patch, client = null) {
    const map = {
      status: 'status', battery: 'battery', task: 'task', eta: 'eta',
      lat: 'lat', lng: 'lng', sectorId: 'sector_id', responders: 'responders'
    };
    const sets = [];
    const params = [];
    let idx = 1;
    for (const [key, col] of Object.entries(map)) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        sets.push(`${col} = $${idx++}`);
        params.push(patch[key] ?? null);
      }
    }
    sets.push(`updated_at = $${idx++}`);
    params.push(nowIso(), id);
    const runner = client || this.pool;
    await runner.query(`UPDATE teams SET ${sets.join(', ')} WHERE id = $${idx}`, params);
    return this.getTeamById(id);
  }

  async recordTelemetry(team, { lat, lng, battery, signal, status, altitude, speed, heading }) {
    await this.tx(async (client) => {
      await client.query(
        `INSERT INTO telemetry (team_id, team_name, lat, lng, battery, signal, status, altitude, speed, heading, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          team.id, team.name, lat, lng, battery ?? team.battery ?? null, signal ?? null,
          status ?? team.status ?? null, altitude ?? null, speed ?? null, heading ?? null, nowIso()
        ]
      );
      await client.query(
        `DELETE FROM telemetry WHERE team_id = $1 AND id <= (
           SELECT id FROM telemetry WHERE team_id = $1 ORDER BY id DESC LIMIT 1 OFFSET 500
         )`,
        [team.id]
      );
    });
  }

  async getLatestTelemetry() {
    const res = await this.query(
      `SELECT * FROM telemetry WHERE id IN (SELECT MAX(id) FROM telemetry GROUP BY team_id) ORDER BY recorded_at DESC`
    );
    return res.rows.map((r) => this._parseTelemetry(r));
  }

  async getTelemetryHistory(teamId, limit = 100) {
    const res = await this.query('SELECT * FROM telemetry WHERE team_id = $1 ORDER BY id DESC LIMIT $2', [teamId, limit]);
    return res.rows.map((r) => this._parseTelemetry(r));
  }

  _parseTelemetry(r) {
    return {
      id: r.id, teamId: r.team_id, teamName: r.team_name, lat: r.lat, lng: r.lng,
      battery: r.battery, signal: r.signal, status: r.status,
      altitude: r.altitude, speed: r.speed, heading: r.heading, recordedAt: r.recorded_at
    };
  }

  _parseTeam(r) {
    const hasFix = r.lat != null && r.lng != null;
    return {
      id: r.id,
      name: r.name,
      callsign: r.callsign,
      specialization: r.specialization,
      type: r.specialization || 'SAR',
      status: r.status,
      responders: r.responders,
      task: r.task,
      battery: r.battery,
      eta: r.eta,
      coordinates: hasFix ? { lat: r.lat, lng: r.lng, latitude: r.lat, longitude: r.lng } : null,
      sectorId: r.sector_id,
      createdAt: r.created_at,
      lastUpdate: r.updated_at
    };
  }

  // =================== INCIDENTS & ASSIGNMENTS ===================
  generateIncidentId() {
    const d = new Date();
    const stamp = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `RQ-${stamp}-${shortId(5)}`;
  }

  async insertIncident(data) {
    const ts = nowIso();
    const rawReq = data.requestedResources;
    const requestedResourcesJson = JSON.stringify(
      Array.isArray(rawReq) || (rawReq && typeof rawReq === 'object') ? rawReq : []
    );
    const otherNeedsJson = JSON.stringify(
      Array.isArray(data.otherNeeds) ? data.otherNeeds : []
    );
    await this.query(
      `INSERT INTO incidents (
         id, title, type, location, short_location, area, affected, severity, status,
         response_summary, response_detail, description, field_report, contact_number,
         citizen_name, citizen_user_id, assigned_team, assigned_team_id, eta, substatus,
         coordinates_json, lat, lng, sector_id, is_citizen_sos, is_rescue_sos, requested_resources_json, other_needs_json, created_by, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, '{}', $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)`,
      [
        data.id, data.title, data.type ?? null, data.location ?? '', data.shortLocation ?? '', data.area ?? '',
        data.affected ?? 1, data.severity, data.status,
        data.responseSummary ?? '', data.responseDetail ?? '', data.description ?? '', data.fieldReport ?? '',
        data.contactNumber ?? '', data.citizenName ?? '', data.citizenUserId ?? null,
        data.assignedTeam ?? null, data.assignedTeamId ?? null, data.eta ?? null, data.substatus ?? '',
        data.lat ?? null, data.lng ?? null, data.sectorId ?? null,
        bool(data.isCitizenSOS), bool(data.isRescueSOS), requestedResourcesJson, otherNeedsJson, data.createdBy ?? null, ts, ts
      ]
    );
    return this.getIncidentById(data.id);
  }

  async getIncidentById(id) {
    if (!id) return null;
    const res = await this.query('SELECT * FROM incidents WHERE id = $1', [id]);
    return res.rows[0] ? this._parseIncident(res.rows[0]) : null;
  }

  async getAllIncidents({ status, citizenUserId, assignedTeamId } = {}) {
    const where = [];
    const params = [];
    let idx = 1;
    if (status && status !== 'All') { where.push(`LOWER(status) = LOWER($${idx++})`); params.push(status); }
    if (citizenUserId) { where.push(`citizen_user_id = $${idx++}`); params.push(citizenUserId); }
    if (assignedTeamId) { where.push(`assigned_team_id = $${idx++}`); params.push(assignedTeamId); }
    const sql = `SELECT * FROM incidents ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
    const res = await this.query(sql, params);
    return res.rows.map((r) => this._parseIncident(r));
  }

  async countActiveIncidentsForTeam(teamId) {
    const res = await this.query(
      "SELECT COUNT(*) AS c FROM incidents WHERE assigned_team_id = $1 AND status != 'Resolved'",
      [teamId]
    );
    return Number(res.rows[0].c);
  }

  async updateIncident(id, patch, client = null) {
    const map = {
      status: 'status', substatus: 'substatus', assignedTeam: 'assigned_team', assignedTeamId: 'assigned_team_id',
      eta: 'eta', responseSummary: 'response_summary', responseDetail: 'response_detail', fieldReport: 'field_report'
    };
    const sets = [];
    const params = [];
    let idx = 1;
    for (const [key, col] of Object.entries(map)) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        sets.push(`${col} = $${idx++}`);
        params.push(patch[key] ?? null);
      }
    }
    sets.push(`updated_at = $${idx++}`);
    params.push(nowIso(), id);
    const runner = client || this.pool;
    await runner.query(`UPDATE incidents SET ${sets.join(', ')} WHERE id = $${idx}`, params);
    return this.getIncidentById(id);
  }

  async assignTeamAtomic({ incidentId, teamId, eta, notes, teamName, fieldReport }) {
    return this.tx(async (client) => {
      const assignRes = await client.query(
        'SELECT * FROM assign_team($1, $2, $3, $4)',
        [incidentId, teamId, eta ?? null, notes ?? null]
      );
      await client.query(
        `UPDATE incidents
         SET status = 'Responding',
             assigned_team = $1,
             assigned_team_id = $2,
             eta = COALESCE($3, eta),
             response_summary = $1,
             response_detail = $4,
             substatus = $5,
             field_report = COALESCE($6, field_report),
             updated_at = $7
         WHERE id = $8`,
        [
          teamName,
          teamId,
          eta ?? null,
          `ETA ${eta || '10 min'}`,
          `${teamName} dispatched · ETA ${eta || '10 min'}`,
          fieldReport ?? null,
          nowIso(),
          incidentId
        ]
      );
      await client.query(
        `UPDATE teams SET status = 'Deployed', task = $1, eta = $2, updated_at = $3 WHERE id = $4`,
        [incidentId, `ETA ${eta || '10 min'}`, nowIso(), teamId]
      );
      return assignRes.rows[0];
    });
  }

  async markAssignmentOnSite(incidentId, teamId) {
    if (!incidentId || !teamId) return;
    await this.query(
      `UPDATE assignments SET status = 'On site' WHERE incident_id = $1 AND team_id = $2 AND status = 'Assigned'`,
      [incidentId, teamId]
    );
  }

  async resolveIncidentAtomic(incidentId, teamId) {
    return this.tx(async (client) => {
      if (teamId) {
        const activeAssign = await client.query(
          `SELECT 1 FROM assignments WHERE incident_id = $1 AND team_id = $2 AND status IN ('Assigned', 'On site') LIMIT 1`,
          [incidentId, teamId]
        );
        if (activeAssign.rowCount > 0) {
          await client.query('SELECT * FROM complete_assignment($1, $2)', [incidentId, teamId]);
        }
      }
      const relRes = await client.query('SELECT release_incident_resources($1) AS released', [incidentId]);
      return Number(relRes.rows[0]?.released || 0);
    });
  }

  async releaseIncidentAllocations(incidentId) {
    const res = await this.query('SELECT release_incident_resources($1) AS released', [incidentId]);
    return Number(res.rows[0]?.released || 0);
  }

  async releaseOldTeamAssignment(incidentId, oldTeamId) {
    if (!incidentId || !oldTeamId) return null;
    await this.query(
      `UPDATE assignments SET status = 'Completed'
       WHERE incident_id = $1 AND team_id = $2 AND status IN ('Assigned', 'On site')`,
      [incidentId, oldTeamId]
    );
    const remaining = await this.countActiveIncidentsForTeam(oldTeamId);
    if (remaining === 0) {
      return this.updateTeam(oldTeamId, { status: 'Available', task: null, eta: null });
    }
    return this.getTeamById(oldTeamId);
  }

  async getResourcesSnapshot() {
    const resRows = await this.query('SELECT id, name, total, available FROM resources ORDER BY id');
    const allocRows = await this.query(
      'SELECT incident_id, resource_id, quantity, max_need FROM resource_allocations WHERE released_at IS NULL'
    );
    return { resources: resRows.rows, allocations: allocRows.rows };
  }

  async allocateResourcesBatch(incidentId, items) {
    return this.tx(async (client) => {
      const allocated = [];
      for (const { resourceId, quantity, maxNeed } of items) {
        const res = await client.query(
          'SELECT * FROM allocate_resource($1, $2, $3, $4)',
          [incidentId, resourceId, quantity, maxNeed ?? quantity]
        );
        allocated.push(res.rows[0]);
      }
      return allocated;
    });
  }

  _parseIncident(r) {
    const hasFix = r.lat != null && r.lng != null;
    return {
      id: r.id,
      title: r.title,
      type: r.type,
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
      citizenUserId: r.citizen_user_id,
      assignedTeam: r.assigned_team,
      assignedTeamId: r.assigned_team_id,
      teamAssigned: r.assigned_team,
      eta: r.eta,
      substatus: r.substatus,
      coordinates: hasFix ? { lat: r.lat, lng: r.lng, latitude: r.lat, longitude: r.lng } : null,
      sectorId: r.sector_id,
      isCitizenSOS: r.is_citizen_sos === 1,
      isRescueSOS: r.is_rescue_sos === 1,
      requestedResources: (() => {
        try {
          const parsed = JSON.parse(r.requested_resources_json || '[]');
          if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) {
            return parsed;
          }
          return [];
        } catch {
          return [];
        }
      })(),
      otherNeeds: (() => {
        try {
          const parsed = JSON.parse(r.other_needs_json || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  // =================== SOS EVENTS ===================
  async createSosEvent({ teamId, teamName, operatorName, lat, lng, locationText, notes, incidentId }) {
    const id = `SOSEV-${shortId(8)}`;
    await this.query(
      `INSERT INTO sos_events (id, team_id, team_name, operator_name, lat, lng, location_text, notes, incident_id, triggered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, teamId, teamName || '', operatorName || '', lat ?? null, lng ?? null, locationText || '', notes || '', incidentId || null, nowIso()]
    );
    return this.getSosEvent(id);
  }

  async getSosEvent(id) {
    const res = await this.query('SELECT * FROM sos_events WHERE id = $1', [id]);
    return res.rows[0] ? this._parseSos(res.rows[0]) : null;
  }

  async resolveSosEvent(id) {
    await this.query('UPDATE sos_events SET resolved = 1, resolved_at = $1 WHERE id = $2 AND resolved = 0', [nowIso(), id]);
    return this.getSosEvent(id);
  }

  async getActiveSosEvents() {
    const res = await this.query('SELECT * FROM sos_events WHERE resolved = 0 ORDER BY triggered_at DESC');
    return res.rows.map((r) => this._parseSos(r));
  }

  _parseSos(r) {
    return {
      id: r.id, teamId: r.team_id, teamName: r.team_name, operatorName: r.operator_name,
      lat: r.lat, lng: r.lng, locationText: r.location_text, notes: r.notes, severity: r.severity,
      resolved: r.resolved === 1, incidentId: r.incident_id, triggeredAt: r.triggered_at, resolvedAt: r.resolved_at
    };
  }

  // =================== VOLUNTEERS ===================
  async getAllVolunteers({ sectorId, status } = {}) {
    const where = [];
    const params = [];
    let idx = 1;
    if (sectorId) { where.push(`sector_id = $${idx++}`); params.push(sectorId); }
    if (status) { where.push(`status = $${idx++}`); params.push(status); }
    const sql = `SELECT * FROM volunteers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY registered_at DESC`;
    const res = await this.query(sql, params);
    return res.rows.map((r) => this._parseVolunteer(r));
  }

  async getVolunteerById(id) {
    const res = await this.query('SELECT * FROM volunteers WHERE id = $1', [id]);
    return res.rows[0] ? this._parseVolunteer(res.rows[0]) : null;
  }

  async getVolunteerByUser(userId) {
    const res = await this.query('SELECT * FROM volunteers WHERE user_id = $1', [userId]);
    return res.rows[0] ? this._parseVolunteer(res.rows[0]) : null;
  }

  async upsertVolunteerForUser(userId, data) {
    const existing = await this.query('SELECT id FROM volunteers WHERE user_id = $1', [userId]);
    const ts = nowIso();
    if (existing.rows[0]) {
      const vid = existing.rows[0].id;
      await this.query(
        `UPDATE volunteers SET name = $1, phone = $2, email = $3, skills = $4, sector_id = $5, lat = $6, lng = $7, team_id = $8, last_seen = $9
         WHERE id = $10`,
        [
          data.name, data.phone || '', data.email || '', JSON.stringify(data.skills || []),
          data.sectorId ?? null, data.lat ?? null, data.lng ?? null, data.teamId ?? null, ts, vid
        ]
      );
      return this.getVolunteerById(vid);
    }
    const id = `VOL-${shortId(8)}`;
    await this.query(
      `INSERT INTO volunteers (id, user_id, name, phone, email, skills, sector_id, status, lat, lng, team_id, registered_at, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Available', $8, $9, $10, $11, $12)`,
      [
        id, userId, data.name, data.phone || '', data.email || '', JSON.stringify(data.skills || []),
        data.sectorId ?? null, data.lat ?? null, data.lng ?? null, data.teamId ?? null, ts, ts
      ]
    );
    return this.getVolunteerById(id);
  }

  async updateVolunteerStatus(id, status) {
    await this.query('UPDATE volunteers SET status = $1, last_seen = $2 WHERE id = $3', [status, nowIso(), id]);
    return this.getVolunteerById(id);
  }

  _parseVolunteer(r) {
    let skills = [];
    try { skills = JSON.parse(r.skills || '[]'); } catch (_) { /* ignore */ }
    return {
      id: r.id, userId: r.user_id, name: r.name, phone: r.phone, email: r.email, skills,
      sectorId: r.sector_id, status: r.status, lat: r.lat, lng: r.lng, teamId: r.team_id,
      registeredAt: r.registered_at, lastSeen: r.last_seen
    };
  }

  // =================== MESSAGES ===================
  async insertMessage({ id, channel, sender, senderId, senderRole, role, initials, text, locationTag, isAlert }) {
    const mid = id || `MSG-${Date.now()}-${shortId(4)}`;
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    await this.query(
      `INSERT INTO messages (id, channel_id, sender, sender_id, sender_role, role, initials, is_self, time, text, location_tag, is_alert, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [mid, channel, sender, senderId ?? null, senderRole ?? null, role, initials ?? '', time, text, locationTag || '', bool(isAlert), nowIso()]
    );
    return this.getMessageById(mid);
  }

  async getMessageById(id) {
    const res = await this.query('SELECT * FROM messages WHERE id = $1', [id]);
    return res.rows[0] ? this._parseMessage(res.rows[0]) : null;
  }

  async getChannelMessages(channel, { limit = 100, since } = {}) {
    const res = since
      ? await this.query(
          `SELECT * FROM (
             SELECT * FROM messages WHERE channel_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT $3
           ) sub ORDER BY created_at ASC`,
          [channel, since, limit]
        )
      : await this.query(
          `SELECT * FROM (
             SELECT * FROM messages WHERE channel_id = $1 ORDER BY created_at DESC LIMIT $2
           ) sub ORDER BY created_at ASC`,
          [channel, limit]
        );
    return res.rows.map((r) => this._parseMessage(r));
  }

  async getAllMessages({ limit = 500 } = {}) {
    const res = await this.query(
      `SELECT * FROM (SELECT * FROM messages ORDER BY created_at DESC LIMIT $1) sub ORDER BY created_at ASC`,
      [limit]
    );
    return res.rows.map((r) => this._parseMessage(r));
  }

  _parseMessage(r) {
    return {
      id: r.id,
      channel: r.channel_id,
      channelId: r.channel_id,
      sender: r.sender,
      senderId: r.sender_id,
      senderRole: r.sender_role,
      role: r.role,
      initials: r.initials,
      text: r.text,
      locationTag: r.location_tag,
      isAlert: r.is_alert === 1,
      time: r.time,
      timestamp: r.created_at,
      createdAt: r.created_at
    };
  }

  // =================== ALERTS ===================
  async insertAlert({ title, code, subtitle, severity, recipients, audience, issuedBy, sectorId, source, externalId }) {
    const id = `ALT-${Date.now()}-${shortId(3)}`;
    if (source && externalId) {
      const res = await this.query(
        `INSERT INTO alerts (id, title, code, subtitle, severity, recipients, audience, issued_by, sector_id, source, external_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (source, external_id) WHERE source IS NOT NULL AND external_id IS NOT NULL DO NOTHING
         RETURNING *`,
        [id, title, code || null, subtitle || '', severity || 'Critical', recipients || '', audience || 'all', issuedBy || '', sectorId ?? null, source, externalId, nowIso()]
      );
      return res.rows[0] ? this._parseAlert(res.rows[0]) : null;
    }
    const res = await this.query(
      `INSERT INTO alerts (id, title, code, subtitle, severity, recipients, audience, issued_by, sector_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, title, code || null, subtitle || '', severity || 'Critical', recipients || '', audience || 'all', issuedBy || '', sectorId ?? null, nowIso()]
    );
    return this._parseAlert(res.rows[0]);
  }

  async getAlerts({ audiences, limit = 50 } = {}) {
    const res = audiences?.length
      ? await this.query(
          `SELECT * FROM alerts WHERE audience = ANY($1::text[]) ORDER BY created_at DESC LIMIT $2`,
          [audiences, limit]
        )
      : await this.query('SELECT * FROM alerts ORDER BY created_at DESC LIMIT $1', [limit]);
    return res.rows.map((r) => this._parseAlert(r));
  }

  _parseAlert(r) {
    return {
      id: r.id,
      title: r.title,
      code: r.code,
      subtitle: r.subtitle,
      message: r.subtitle,
      severity: r.severity,
      recipients: r.recipients,
      audience: r.audience || 'all',
      issuedBy: r.issued_by,
      sectorId: r.sector_id,
      source: r.source || null,
      externalId: r.external_id || null,
      createdAt: r.created_at
    };
  }

  // =================== SHELTERS ===================
  async getShelters() {
    const res = await this.query('SELECT * FROM shelters ORDER BY name');
    return res.rows.map((r) => this._parseShelter(r));
  }

  async getShelterById(id) {
    const res = await this.query('SELECT * FROM shelters WHERE id = $1', [id]);
    return res.rows[0] ? this._parseShelter(res.rows[0]) : null;
  }

  async updateShelterOccupancy(id, occupied) {
    await this.query('UPDATE shelters SET occupied = $1 WHERE id = $2', [occupied, id]);
    return this.getShelterById(id);
  }

  _parseShelter(r) {
    const hasFix = r.lat != null && r.lng != null;
    return {
      id: r.id, name: r.name, location: r.location, capacity: r.capacity, occupied: r.occupied,
      amenities: r.amenities, hasMedical: r.has_medical === 1, hasAirlift: r.has_airlift === 1,
      sectorId: r.sector_id,
      coordinates: hasFix ? { lat: r.lat, lng: r.lng, latitude: r.lat, longitude: r.lng } : null
    };
  }

  // =================== STATS ===================
  async getStats() {
    const count = async (sql) => Number((await this.query(sql)).rows[0].c);
    return {
      incidents: await count('SELECT COUNT(*) AS c FROM incidents'),
      activeIncidents: await count("SELECT COUNT(*) AS c FROM incidents WHERE status != 'Resolved'"),
      teams: await count('SELECT COUNT(*) AS c FROM teams'),
      sectors: await count('SELECT COUNT(*) AS c FROM sectors'),
      shelters: await count('SELECT COUNT(*) AS c FROM shelters'),
      messages: await count('SELECT COUNT(*) AS c FROM messages'),
      volunteers: await count('SELECT COUNT(*) AS c FROM volunteers'),
      activeSos: await count('SELECT COUNT(*) AS c FROM sos_events WHERE resolved = 0'),
      telemetryRecords: await count('SELECT COUNT(*) AS c FROM telemetry')
    };
  }

  // =================== OS ENGINE PERSISTENCE ===================
  async appendOsEvent({ type, pid = null, detail = '', payload = {} } = {}) {
    await this.query(
      `INSERT INTO os_event_log (event_type, pid, detail, payload_json, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [String(type || 'EVENT'), pid ? String(pid) : null, String(detail || ''), JSON.stringify(payload || {}), nowIso()]
    );
  }

  async getRecentOsEvents(limit = 40) {
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 40));
    const res = await this.query(
      'SELECT id, event_type, pid, detail, payload_json, created_at FROM os_event_log ORDER BY id DESC LIMIT $1',
      [safeLimit]
    );
    return res.rows.map((r) => {
      let payload = {};
      try { payload = JSON.parse(r.payload_json || '{}'); } catch { payload = {}; }
      return {
        id: r.id,
        type: r.event_type,
        pid: r.pid,
        detail: r.detail,
        payload,
        at: Date.parse(r.created_at) || Date.now(),
        createdAt: r.created_at
      };
    });
  }

  async setResourceTotalsInDb(updates = {}) {
    const KEY_TO_DB = {
      ambulances: { id: 'ambulance', name: 'Ambulances' },
      boats: { id: 'boat', name: 'Rescue Boats' },
      medicalKits: { id: 'medical_kit', name: 'Medical Kits' },
      foodPacks: { id: 'food_pack', name: 'Food Packets' }
    };
    return this.tx(async (client) => {
      for (const [key, val] of Object.entries(updates || {})) {
        const meta = KEY_TO_DB[key];
        if (!meta) continue;
        const n = Number(val);
        if (!Number.isInteger(n) || n < 0) {
          const err = new Error(`Invalid resource total for ${key}: must be a non-negative integer`);
          err.statusCode = 400;
          throw err;
        }
        const cur = await client.query('SELECT id, total, available FROM resources WHERE id = $1 FOR UPDATE', [meta.id]);
        if (cur.rows.length === 0) {
          await client.query(
            'INSERT INTO resources (id, name, total, available) VALUES ($1, $2, $3, $3)',
            [meta.id, meta.name, n]
          );
        } else {
          const oldTotal = Number(cur.rows[0].total || 0);
          const oldAvail = Number(cur.rows[0].available || 0);
          const inUse = Math.max(0, oldTotal - oldAvail);
          if (n < inUse) {
            const err = new Error(`Cannot set ${key} total to ${n}: ${inUse} currently allocated`);
            err.statusCode = 409;
            throw err;
          }
          const newAvail = n - inUse;
          await client.query('UPDATE resources SET total = $1, available = $2 WHERE id = $3', [n, newAvail, meta.id]);
        }
      }
      const resRows = await client.query('SELECT id, name, total, available FROM resources ORDER BY id');
      return resRows.rows;
    });
  }

  async getOperationalIntelligenceData() {
    const [
      incidents,
      teams,
      shelters,
      resSnap,
      sectors,
      assignRes,
      telemetry,
      telemCountRes
    ] = await Promise.all([
      this.getAllIncidents(),
      this.getAllTeams(),
      this.getShelters(),
      this.getResourcesSnapshot(),
      this.getSectors(),
      this.query('SELECT incident_id, team_id, status, eta, assigned_at, completed_at FROM assignments ORDER BY id ASC'),
      this.getLatestTelemetry(),
      this.query('SELECT COUNT(*) AS c FROM telemetry')
    ]);
    return {
      incidents,
      teams,
      shelters,
      resources: resSnap.resources || [],
      sectors,
      assignments: assignRes.rows || [],
      telemetry,
      telemetryCount: Number(telemCountRes.rows[0]?.c || 0)
    };
  }
}

export const dbManager = new DatabaseManager();
