-- =============================================================================
-- ResQCore PostgreSQL: complete database (schema + DBMS features) in ONE file
-- Save as backend/db/schema.sql  -- also paste/run it in pgAdmin Query Tool.
-- Safe to run repeatedly. Runs as a single transaction: all or nothing.
--   Part 1: tables + indexes (mirrors the SQLite schema 1:1) + OS-engine tables
--   Part 2: foreign keys, views, triggers, stored functions, resource seed data
-- =============================================================================

BEGIN;

-- ################ PART 1: SCHEMA ################
-- ResQCore PostgreSQL schema
-- Mirrors backend/services/database.js (SQLite) table-for-table and column-for-column,
-- so the existing store/database code only needs sync->async + placeholder changes.
--
-- Type mapping choices (to avoid touching application code):
--   REAL      -> DOUBLE PRECISION  (pg REAL is float4 and would corrupt lat/lng)
--   INTEGER 0/1 flags stay INTEGER (code reads/writes 0/1, not true/false)
--   TEXT dates stay TEXT           (code writes ISO strings; format kept identical)
--   AUTOINCREMENT -> SERIAL        (int4, so node-pg returns a JS number, not a string)
-- No foreign keys, same as the SQLite schema (seed/test data does not guarantee order).
--
-- Run:  psql "$DATABASE_URL" -f resqcore_schema_postgres.sql
-- Safe to re-run (IF NOT EXISTS everywhere).


CREATE TABLE IF NOT EXISTS sectors (
  id            TEXT PRIMARY KEY,
  theater       TEXT NOT NULL,
  name          TEXT NOT NULL,
  short_name    TEXT NOT NULL,
  color         TEXT NOT NULL,
  description   TEXT,
  center_lat    DOUBLE PRECISION NOT NULL,
  center_lng    DOUBLE PRECISION NOT NULL,
  bounds_json   TEXT NOT NULL,
  status        TEXT DEFAULT 'Active',
  alert_level   TEXT DEFAULT 'Normal',
  created_at    TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  location          TEXT NOT NULL,
  short_location    TEXT,
  area              TEXT,
  affected          INTEGER DEFAULT 1,
  severity          TEXT DEFAULT 'High',
  status            TEXT DEFAULT 'Unverified',
  response_summary  TEXT,
  response_detail   TEXT,
  description       TEXT,
  field_report      TEXT,
  contact_number    TEXT,
  citizen_name      TEXT,
  assigned_team     TEXT,
  eta               TEXT,
  substatus         TEXT,
  coordinates_json  TEXT NOT NULL,
  sector_id         TEXT,
  is_citizen_sos    INTEGER DEFAULT 0,
  created_at        TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  specialization  TEXT,
  status          TEXT DEFAULT 'Available',
  responders      INTEGER DEFAULT 6,
  task            TEXT,
  battery         INTEGER DEFAULT 100,
  eta             TEXT,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  sector_id       TEXT,
  updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS citizens (
  id            TEXT PRIMARY KEY,
  full_name     TEXT NOT NULL,
  phone_number  TEXT,
  email         TEXT,
  blood_group   TEXT,
  sector_id     TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  last_seen     TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  channel_id      TEXT NOT NULL,
  sender          TEXT NOT NULL,
  role            TEXT NOT NULL,
  initials        TEXT,
  is_self         INTEGER DEFAULT 0,
  time            TEXT,
  text            TEXT,
  location_tag    TEXT,
  attachment_url  TEXT,
  is_alert        INTEGER DEFAULT 0,
  sector_id       TEXT,
  created_at      TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  code        TEXT,
  subtitle    TEXT,
  severity    TEXT DEFAULT 'Critical',
  recipients  TEXT,
  issued_by   TEXT,
  sector_id   TEXT,
  created_at  TEXT
);

CREATE TABLE IF NOT EXISTS shelters (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  location   TEXT,
  capacity   INTEGER DEFAULT 100,
  occupied   INTEGER DEFAULT 0,
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  sector_id  TEXT
);

CREATE TABLE IF NOT EXISTS volunteers (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  phone          TEXT,
  email          TEXT,
  skills         TEXT DEFAULT '[]',
  sector_id      TEXT,
  status         TEXT DEFAULT 'Available',
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  team_id        TEXT,
  -- same 'YYYY-MM-DD HH24:MI:SS' UTC format as SQLite's datetime('now')
  registered_at  TEXT DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'),
  last_seen      TEXT DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS telemetry (
  id           SERIAL PRIMARY KEY,
  team_id      TEXT NOT NULL,
  team_name    TEXT,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  battery      INTEGER DEFAULT 100,
  signal       TEXT DEFAULT 'Strong',
  status       TEXT DEFAULT 'Deployed',
  altitude     DOUBLE PRECISION,
  speed        DOUBLE PRECISION,
  heading      DOUBLE PRECISION,
  recorded_at  TEXT DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS sos_events (
  id             TEXT PRIMARY KEY,
  team_id        TEXT NOT NULL,
  team_name      TEXT,
  operator_name  TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  location_text  TEXT,
  notes          TEXT,
  severity       TEXT DEFAULT 'Critical',
  resolved       INTEGER DEFAULT 0,
  incident_id    TEXT,
  triggered_at   TEXT DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'),
  resolved_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_incidents_status    ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity  ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_sector    ON incidents(sector_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel    ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_team      ON telemetry(team_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_time      ON telemetry(recorded_at);
CREATE INDEX IF NOT EXISTS idx_sos_team            ON sos_events(team_id);
CREATE INDEX IF NOT EXISTS idx_sos_resolved        ON sos_events(resolved);
CREATE INDEX IF NOT EXISTS idx_volunteers_sector   ON volunteers(sector_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_status   ON volunteers(status);

-- ---------------------------------------------------------------------------
-- OPTIONAL: extra tables for the OS-engine features (team lock, Banker's
-- algorithm, audit log). Nothing in the current app code depends on these;
-- delete this block if you don't need it.
-- ---------------------------------------------------------------------------

-- One row per dispatch. The partial unique index is the DB-level backup for
-- "a team can only hold one active assignment" (mutual exclusion).
CREATE TABLE IF NOT EXISTS assignments (
  id            SERIAL PRIMARY KEY,
  incident_id   TEXT NOT NULL,
  team_id       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Assigned',   -- Assigned | On site | Completed | Cancelled
  eta           TEXT,
  notes         TEXT,
  assigned_at   TEXT DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'),
  completed_at  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_active_team
  ON assignments(team_id) WHERE status IN ('Assigned', 'On site');
CREATE INDEX IF NOT EXISTS idx_assignments_incident ON assignments(incident_id);

-- Resource pool for Banker's algorithm: total = fixed capacity, available = free now.
CREATE TABLE IF NOT EXISTS resources (
  id         TEXT PRIMARY KEY,        -- e.g. 'ambulance', 'boat', 'medical_kit', 'helicopter', 'drone'
  name       TEXT NOT NULL,
  total      INTEGER NOT NULL DEFAULT 0,
  available  INTEGER NOT NULL DEFAULT 0,
  CHECK (available >= 0 AND available <= total)
);

-- Resources currently held by an incident.
CREATE TABLE IF NOT EXISTS resource_allocations (
  id            SERIAL PRIMARY KEY,
  incident_id   TEXT NOT NULL,
  resource_id   TEXT NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  max_need      INTEGER,
  allocated_at  TEXT DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'),
  released_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_alloc_incident ON resource_allocations(incident_id);

CREATE TABLE IF NOT EXISTS command_logs (
  id            SERIAL PRIMARY KEY,
  action        TEXT NOT NULL,
  target_id     TEXT,
  target_type   TEXT,
  performed_by  TEXT,
  created_at    TEXT DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

-- ################ PART 2: DBMS FEATURES ################
-- ResQCore PostgreSQL DBMS features
-- Run AFTER resqcore_schema_postgres.sql (needs its optional tables).
--   psql "$DATABASE_URL" -f backend/db/features.sql
-- Safe to re-run.
--
-- Contents: foreign keys, integrity checks, views, triggers (audit log,
-- resource accounting, timestamps), stored functions (atomic team assignment,
-- resource allocation, completion) and seed data for the resource pool.


-- ---------------------------------------------------------------------------
-- Helper: current UTC time in the same text format the app already uses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION utc_now_text() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')
$$;

-- ---------------------------------------------------------------------------
-- 1. Referential integrity (only on the new tables, so existing app inserts
--    into incidents/teams/etc. are never blocked)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_assignments_incident') THEN
    ALTER TABLE assignments ADD CONSTRAINT fk_assignments_incident
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_assignments_team') THEN
    ALTER TABLE assignments ADD CONSTRAINT fk_assignments_team
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_alloc_incident') THEN
    ALTER TABLE resource_allocations ADD CONSTRAINT fk_alloc_incident
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_alloc_resource') THEN
    ALTER TABLE resource_allocations ADD CONSTRAINT fk_alloc_resource
      FOREIGN KEY (resource_id) REFERENCES resources(id);
  END IF;
  -- Domain rule: a shelter can never hold more people than its capacity.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_shelter_occupancy') THEN
    ALTER TABLE shelters ADD CONSTRAINT chk_shelter_occupancy
      CHECK (occupied >= 0 AND occupied <= capacity) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Views
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_active_incidents AS
  SELECT id, title, severity, status, location, assigned_team, eta, created_at
  FROM incidents
  WHERE status <> 'Resolved';

CREATE OR REPLACE VIEW v_incident_stats AS
  SELECT severity, status, COUNT(*)::int AS total
  FROM incidents
  GROUP BY severity, status;

CREATE OR REPLACE VIEW v_team_load AS
  SELECT t.id AS team_id, t.name, t.status AS team_status,
         COUNT(a.id)::int AS active_assignments
  FROM teams t
  LEFT JOIN assignments a
         ON a.team_id = t.id AND a.status IN ('Assigned', 'On site')
  GROUP BY t.id, t.name, t.status;

CREATE OR REPLACE VIEW v_resource_utilization AS
  SELECT id, name, total, available,
         total - available AS in_use,
         CASE WHEN total = 0 THEN 0
              ELSE ROUND(100.0 * (total - available) / total, 1) END AS utilization_pct
  FROM resources;

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------

-- 3a. Audit log: every new incident and every status change is recorded.
CREATE OR REPLACE FUNCTION trg_incident_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO command_logs(action, target_id, target_type, performed_by)
    VALUES ('INCIDENT_CREATED', NEW.id, 'incident', COALESCE(NEW.citizen_name, 'system'));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO command_logs(action, target_id, target_type, performed_by)
    VALUES ('STATUS_' || OLD.status || '_TO_' || NEW.status, NEW.id, 'incident',
            COALESCE(NEW.assigned_team, 'system'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS incident_audit ON incidents;
CREATE TRIGGER incident_audit
  AFTER INSERT OR UPDATE OF status ON incidents
  FOR EACH ROW EXECUTE FUNCTION trg_incident_audit();

-- 3b. Resource accounting: the pool is adjusted automatically. If an
-- allocation would drive 'available' below zero, the CHECK constraint on
-- resources aborts the whole statement (no over-allocation is possible).
CREATE OR REPLACE FUNCTION trg_resource_accounting() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE resources SET available = available - NEW.quantity WHERE id = NEW.resource_id;
  ELSIF OLD.released_at IS NULL AND NEW.released_at IS NOT NULL THEN
    UPDATE resources SET available = available + NEW.quantity WHERE id = NEW.resource_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS resource_accounting ON resource_allocations;
CREATE TRIGGER resource_accounting
  AFTER INSERT OR UPDATE OF released_at ON resource_allocations
  FOR EACH ROW EXECUTE FUNCTION trg_resource_accounting();

-- 3c. Stamp completed_at automatically when an assignment ends.
CREATE OR REPLACE FUNCTION trg_assignment_complete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('Completed', 'Cancelled') AND NEW.completed_at IS NULL THEN
    NEW.completed_at := utc_now_text();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS assignment_complete ON assignments;
CREATE TRIGGER assignment_complete
  BEFORE UPDATE ON assignments
  FOR EACH ROW EXECUTE FUNCTION trg_assignment_complete();

-- ---------------------------------------------------------------------------
-- 4. Stored functions (each call runs as ONE atomic transaction)
-- ---------------------------------------------------------------------------

-- Assign a team to an incident. The team row is locked (SELECT ... FOR UPDATE)
-- so two operators dispatching the same team at once are serialized: the second
-- one gets 'team_locked'. This is the mutual-exclusion requirement, done in the DB.
CREATE OR REPLACE FUNCTION assign_team(
  p_incident_id TEXT, p_team_id TEXT, p_eta TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS assignments
LANGUAGE plpgsql AS $$
DECLARE
  v_team_name TEXT;
  v_row assignments;
BEGIN
  SELECT name INTO v_team_name FROM teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'team_not_found: %', p_team_id USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'incident_not_found: %', p_incident_id USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM assignments
             WHERE team_id = p_team_id AND status IN ('Assigned', 'On site')) THEN
    RAISE EXCEPTION 'team_locked: % already has an active assignment', p_team_id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO assignments(incident_id, team_id, status, eta, notes)
  VALUES (p_incident_id, p_team_id, 'Assigned', p_eta, p_notes)
  RETURNING * INTO v_row;

  UPDATE incidents SET assigned_team = v_team_name, eta = COALESCE(p_eta, eta)
  WHERE id = p_incident_id;

  RETURN v_row;
END $$;

-- Finish an assignment (releases the team lock).
CREATE OR REPLACE FUNCTION complete_assignment(p_incident_id TEXT, p_team_id TEXT)
RETURNS assignments
LANGUAGE plpgsql AS $$
DECLARE v_row assignments;
BEGIN
  UPDATE assignments SET status = 'Completed'
  WHERE incident_id = p_incident_id AND team_id = p_team_id
    AND status IN ('Assigned', 'On site')
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END $$;

-- Allocate scarce resources to an incident. The resource row is locked, the
-- request is rejected if stock is insufficient, and the pool is updated by the
-- trigger above. (The Banker's-algorithm safety check itself runs in the OS
-- engine in Node; this function is the atomic commit step after it approves.)
CREATE OR REPLACE FUNCTION allocate_resource(
  p_incident_id TEXT, p_resource_id TEXT, p_quantity INTEGER, p_max_need INTEGER DEFAULT NULL
) RETURNS resource_allocations
LANGUAGE plpgsql AS $$
DECLARE
  v_available INTEGER;
  v_row resource_allocations;
BEGIN
  SELECT available INTO v_available FROM resources WHERE id = p_resource_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'resource_not_found: %', p_resource_id USING ERRCODE = 'P0002';
  END IF;
  IF p_quantity > v_available THEN
    RAISE EXCEPTION 'insufficient_resource: requested %, available %', p_quantity, v_available
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO resource_allocations(incident_id, resource_id, quantity, max_need)
  VALUES (p_incident_id, p_resource_id, p_quantity, p_max_need)
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

-- Release everything an incident holds (call when it is resolved).
CREATE OR REPLACE FUNCTION release_incident_resources(p_incident_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE resource_allocations SET released_at = utc_now_text()
  WHERE incident_id = p_incident_id AND released_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Seed: resource pool (numbers taken from the RescueTeam Resources mockup;
--    edit freely)
-- ---------------------------------------------------------------------------
INSERT INTO resources(id, name, total, available) VALUES
  ('medical_kit', 'Medical Kits', 18, 18),
  ('ambulance',   'Ambulances',    6,  6),
  ('boat',        'Rescue Boats',  4,  4),
  ('food_pack',   'Food Packets', 500, 500),
  ('drone',       'Drones',        3,  3),
  ('helicopter',  'Helicopters',   2,  2)
ON CONFLICT (id) DO NOTHING;

-- Forward-compatible columns used by application services & feeds
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS citizen_user_id TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS assigned_team_id TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS is_rescue_sos INTEGER DEFAULT 0;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS callsign TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_role TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'all';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE shelters ADD COLUMN IF NOT EXISTS amenities TEXT;
ALTER TABLE shelters ADD COLUMN IF NOT EXISTS has_medical INTEGER DEFAULT 0;
ALTER TABLE shelters ADD COLUMN IF NOT EXISTS has_airlift INTEGER DEFAULT 0;
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS requested_resources_json TEXT DEFAULT '[]';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS other_needs_json TEXT DEFAULT '[]';

CREATE TABLE IF NOT EXISTS os_event_log (
  id           SERIAL PRIMARY KEY,
  event_type   TEXT NOT NULL,
  pid          TEXT,
  detail       TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_os_event_log_id ON os_event_log(id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_source_ext
  ON alerts(source, external_id) WHERE source IS NOT NULL AND external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name_ci
  ON teams(LOWER(name));

COMMIT;
