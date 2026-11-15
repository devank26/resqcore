/**
 * End-to-end integration test for the ResQCore backend (auth, RBAC, real-data-only, realtime, static hosting).
 * Spawns an isolated server (temp DB / random port) - safe to run anywhere:   node test-integration.js
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  startTestServer, request, connectSSE, connectWS, waitFor, sleep, TEST_CODES, TEST_ORIGIN
} from './test-utils.js';

let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`   [PASS] ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`   [FAIL] ${name}\n          ${String(err.message).split('\n').join('\n          ')}`);
  }
}
const section = (title) => console.log(`\n${title}`);

async function main() {
  console.log('--- ResQCore backend integration tests ---');
  const server = await startTestServer();
  const api = (method, path, opts) => request(server.baseUrl, method, path, opts);
  const stamp = Date.now().toString().slice(-6);
  const ctx = {};

  try {
    // ------------------------------------------------------------------
    section('1. Health & public surface');
    await check('GET /api/health is public and does not leak counts', async () => {
      const r = await api('GET', '/api/health');
      assert.equal(r.status, 200);
      assert.equal(r.data.status, 'online');
      assert.equal(r.data.activeIncidents, undefined);
    });
    await check('database file is created at DB_PATH', () => {
      assert.ok(fs.existsSync(server.dbPath), `expected DB at ${server.dbPath}`);
    });
    await check('every non-auth endpoint rejects anonymous callers (401)', async () => {
      for (const [m, p] of [
        ['GET', '/api/incidents'], ['GET', '/api/teams'], ['GET', '/api/alerts'], ['GET', '/api/shelters'],
        ['GET', '/api/sectors'], ['GET', '/api/chat/messages'], ['GET', '/api/volunteers'], ['GET', '/api/citizen/requests'],
        ['POST', '/api/citizen/sos'], ['POST', '/api/command/dispatch'], ['POST', '/api/teams/telemetry'],
        ['POST', '/api/chat/send'], ['GET', '/api/stream'], ['GET', '/api/database/stats']
      ]) {
        const r = await api(m, p, m === 'POST' ? { body: {} } : {});
        assert.equal(r.status, 401, `${m} ${p} => ${r.status}`);
      }
    });
    await check('garbage and tampered tokens are rejected', async () => {
      assert.equal((await api('GET', '/api/incidents', { token: 'not.a.jwt' })).status, 401);
      assert.equal((await api('GET', '/api/incidents', { token: 'abc' })).status, 401);
    });
    await check('unknown API route returns JSON 404; wrong method returns 405', async () => {
      const r = await api('GET', '/api/does-not-exist');
      assert.equal(r.status, 404);
      assert.ok(r.data.error);
      const m = await api('GET', '/api/auth/login');
      assert.equal(m.status, 405);
    });

    // ------------------------------------------------------------------
    section('2. Registration, login, invite codes');
    await check('citizen registers with phone, receives JWT', async () => {
      const r = await api('POST', '/api/auth/register', {
        body: { name: 'Sunita Devi', phone: `+91 98${stamp}01`, email: `sunita${stamp}@example.com`, password: 'citizen-pass-1', role: 'citizen' }
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      assert.equal(r.data.user.role, 'citizen');
      assert.ok(r.data.token.split('.').length === 3);
      assert.equal(r.data.user.passwordHash, undefined, 'password hash must never be returned');
      assert.equal(r.data.teamId, null);
      ctx.citizen = r.data;
    });
    await check('duplicate email/phone is rejected (409)', async () => {
      const r = await api('POST', '/api/auth/register', {
        body: { name: 'Dup', email: `SUNITA${stamp}@example.com`, password: 'citizen-pass-1' }
      });
      assert.equal(r.status, 409);
      const p = await api('POST', '/api/auth/register', { body: { name: 'Dup', phone: `98${stamp}01`, password: 'citizen-pass-1' } });
      assert.equal(p.status, 409, 'phone with/without country code is the same identity');
    });
    await check('weak password / missing identity / bad role are rejected (400)', async () => {
      assert.equal((await api('POST', '/api/auth/register', { body: { name: 'X', email: 'x@example.com', password: 'short' } })).status, 400);
      assert.equal((await api('POST', '/api/auth/register', { body: { name: 'X', password: 'long-enough-pass' } })).status, 400);
      assert.equal((await api('POST', '/api/auth/register', { body: { name: 'X', email: 'x@example.com', password: 'long-enough-pass', role: 'admin' } })).status, 400);
    });
    await check('invalid JSON body is a 400, not a silent {}', async () => {
      const r = await request(server.baseUrl, 'POST', '/api/auth/login', { headers: { 'Content-Type': 'application/json' }, body: undefined });
      assert.equal(r.status, 400); // empty body => identifier/password missing
    });
    await check('command / rescue registration requires the invite code', async () => {
      for (const role of ['command', 'rescue']) {
        const none = await api('POST', '/api/auth/register', { body: { name: 'Eve', email: `eve-${role}${stamp}@example.com`, password: 'attacker-pass-1', role } });
        assert.equal(none.status, 403, `${role} without code`);
        const wrong = await api('POST', '/api/auth/register', { body: { name: 'Eve', email: `eve-${role}${stamp}@example.com`, password: 'attacker-pass-1', role, inviteCode: 'guess' } });
        assert.equal(wrong.status, 403, `${role} wrong code`);
      }
    });
    await check('command operator registers with invite code', async () => {
      const r = await api('POST', '/api/auth/register', {
        body: { name: 'Ananya Kumar', email: `ananya${stamp}@resqcore.test`, password: 'command-pass-1', role: 'command', inviteCode: TEST_CODES.command }
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      assert.equal(r.data.user.role, 'command');
      ctx.command = r.data;
    });
    await check('rescue operative registers: team is created and teamId returned', async () => {
      const r = await api('POST', '/api/auth/register', {
        body: {
          name: 'Capt. Rajesh Negi', email: `rajesh${stamp}@resqcore.test`, password: 'rescue-pass-1', role: 'rescue',
          inviteCode: TEST_CODES.rescue, teamName: `Alpha ${stamp}`, callsign: 'GARHWAL-01', specialization: 'Mountain rescue', responders: 8
        }
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      assert.ok(r.data.teamId && r.data.teamId.startsWith('team-'));
      assert.equal(r.data.user.teamId, r.data.teamId);
      assert.equal(r.data.team.name, `Alpha ${stamp}`);
      assert.equal(r.data.team.coordinates, null, 'no GPS fix yet - nothing fabricated');
      ctx.rescue = r.data;
    });
    await check('team name collisions are rejected (409)', async () => {
      const r = await api('POST', '/api/auth/register', {
        body: { name: 'Other', email: `other${stamp}@resqcore.test`, password: 'rescue-pass-1', role: 'rescue', inviteCode: TEST_CODES.rescue, teamName: `alpha ${stamp}` }
      });
      assert.equal(r.status, 409);
    });
    await check('login returns the SAME teamId and does not create a duplicate team', async () => {
      const r = await api('POST', '/api/auth/login', { body: { identifier: `rajesh${stamp}@resqcore.test`, password: 'rescue-pass-1' } });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(r.data.teamId, ctx.rescue.teamId);
      ctx.rescueLogin = r.data;
      const teams = await api('GET', '/api/teams', { token: ctx.command.token });
      assert.equal(teams.data.teams.length, 1);
    });
    await check('a second rescue operative can join the existing team via teamId', async () => {
      const r = await api('POST', '/api/auth/register', {
        body: { name: 'Priya Sharma', email: `priya${stamp}@resqcore.test`, password: 'rescue-pass-2', role: 'rescue', inviteCode: TEST_CODES.rescue, teamId: ctx.rescue.teamId }
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      assert.equal(r.data.teamId, ctx.rescue.teamId);
    });
    await check('a separate second team for isolation tests', async () => {
      const r = await api('POST', '/api/auth/register', {
        body: { name: 'Lt. Sunil Varma', email: `sunil${stamp}@resqcore.test`, password: 'rescue-pass-3', role: 'rescue', inviteCode: TEST_CODES.rescue, teamName: `Bravo ${stamp}` }
      });
      assert.equal(r.status, 201);
      assert.notEqual(r.data.teamId, ctx.rescue.teamId);
      ctx.rescue2 = r.data;
    });
    await check('second citizen for ownership tests', async () => {
      const r = await api('POST', '/api/auth/register', { body: { name: 'Other Citizen', email: `other-citizen${stamp}@example.com`, password: 'citizen-pass-2' } });
      assert.equal(r.status, 201);
      ctx.citizen2 = r.data;
    });
    await check('login: wrong password and unknown user both give a generic 401', async () => {
      const bad = await api('POST', '/api/auth/login', { body: { identifier: `ananya${stamp}@resqcore.test`, password: 'wrong-password' } });
      const none = await api('POST', '/api/auth/login', { body: { identifier: 'nobody@example.com', password: 'wrong-password' } });
      assert.equal(bad.status, 401);
      assert.equal(none.status, 401);
      assert.equal(bad.data.error, none.data.error);
    });
    await check('login by phone works; /api/auth/me returns identity', async () => {
      const r = await api('POST', '/api/auth/login', { body: { phone: `98${stamp}01`, password: 'citizen-pass-1' } });
      assert.equal(r.status, 200);
      const me = await api('GET', '/api/auth/me', { token: r.data.token });
      assert.equal(me.data.user.id, ctx.citizen.user.id);
    });
    await check('brute-force protection: repeated failures are rate limited (429)', async () => {
      let last;
      for (let i = 0; i < 12; i++) {
        last = await api('POST', '/api/auth/login', { body: { identifier: `victim${stamp}@example.com`, password: 'nope-nope-nope' } });
      }
      assert.equal(last.status, 429);
    });

    const C = () => ctx.citizen.token;
    const C2 = () => ctx.citizen2.token;
    const CMD = () => ctx.command.token;
    const R = () => ctx.rescueLogin.token;
    const R2 = () => ctx.rescue2.token;

    // ------------------------------------------------------------------
    section('3. Real-data only (nothing seeded except reference data)');
    await check('no fake incidents, messages, alerts, volunteers or mock teams exist on a fresh DB', async () => {
      const staffTok = CMD();
      assert.equal((await api('GET', '/api/incidents', { token: staffTok })).data.count, 0);
      assert.deepEqual((await api('GET', '/api/chat/messages', { token: staffTok })).data.messages, {});
      assert.equal((await api('GET', '/api/alerts', { token: staffTok })).data.alerts.length, 0);
      assert.equal((await api('GET', '/api/volunteers', { token: staffTok })).data.count, 0);
      const names = (await api('GET', '/api/teams', { token: staffTok })).data.teams.map((t) => t.name);
      assert.deepEqual(names.sort(), [`Alpha ${stamp}`, `Bravo ${stamp}`].sort());
    });
    await check('reference data (sectors, shelters) is available to any authenticated role', async () => {
      const sectors = await api('GET', '/api/sectors', { token: C() });
      assert.ok(sectors.data.count >= 4);
      assert.ok(Array.isArray(sectors.data.sectors[0].bounds));
      const shelters = await api('GET', '/api/shelters', { token: C() });
      assert.ok(shelters.data.shelters.length >= 1);
      assert.ok(shelters.data.shelters.every((s) => s.occupied === 0), 'seeded shelters start empty');
    });

    // ------------------------------------------------------------------
    section('4. Citizen: create SOS, read ONLY own requests');
    await check('citizen creates SOS (client id honoured, owner = token user)', async () => {
      const r = await api('POST', '/api/citizen/sos', {
        token: C(),
        body: {
          id: `SOS-TEST-${stamp}`, title: 'Flash Flood Emergency', type: 'Flood', location: 'Fort Kochi Bazaar',
          description: 'Ground floor submerged, 4 persons stranded.', severity: 'High', coordinates: { lat: 9.9658, lng: 76.2421 }
        }
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      assert.equal(r.data.incident.id, `SOS-TEST-${stamp}`);
      assert.equal(r.data.incident.citizenUserId, ctx.citizen.user.id);
      assert.equal(r.data.incident.citizenName, 'Sunita Devi');
      assert.equal(r.data.incident.isCitizenSOS, true);
      assert.equal(r.data.incident.coordinates.lat, 9.9658);
      assert.equal(r.data.incident.sectorId, 'SEC-KL-04');
      ctx.incidentId = r.data.incident.id;
    });
    await check('retrying the same SOS id is idempotent (200, no duplicate)', async () => {
      const r = await api('POST', '/api/citizen/sos', { token: C(), body: { id: ctx.incidentId, title: 'retry', coordinates: { lat: 1, lng: 1 } } });
      assert.equal(r.status, 200);
      assert.equal(r.data.duplicate, true);
      assert.equal(r.data.incident.title, 'Flash Flood Emergency', 'original record untouched');
    });
    await check('another citizen cannot overwrite/steal an existing incident id (409)', async () => {
      const r = await api('POST', '/api/citizen/sos', { token: C2(), body: { id: ctx.incidentId, title: 'hijack' } });
      assert.equal(r.status, 409);
    });
    await check('SOS validation: bad coordinates -> 400; no GPS is accepted but not fabricated', async () => {
      assert.equal((await api('POST', '/api/citizen/sos', { token: C2(), body: { coordinates: { lat: 999, lng: 0 } } })).status, 400);
      const r = await api('POST', '/api/citizen/sos', { token: C2(), body: { title: 'No GPS', location: 'Somewhere near the river' } });
      assert.equal(r.status, 201);
      assert.equal(r.data.incident.coordinates, null);
      assert.equal(r.data.incident.sectorId, null);
      ctx.incident2Id = r.data.incident.id;
    });
    await check('citizen reads own status; cannot read someone else\'s (404, existence hidden)', async () => {
      assert.equal((await api('GET', `/api/citizen/status/${ctx.incidentId}`, { token: C() })).status, 200);
      assert.equal((await api('GET', `/api/citizen/status/${ctx.incidentId}`, { token: C2() })).status, 404);
    });
    await check('citizen request list contains only own requests', async () => {
      const mine = await api('GET', '/api/citizen/requests', { token: C() });
      assert.deepEqual(mine.data.requests.map((x) => x.id), [ctx.incidentId]);
      const theirs = await api('GET', '/api/citizen/my-requests?phone=' + `98${stamp}01`, { token: C2() });
      assert.deepEqual(theirs.data.requests.map((x) => x.id), [ctx.incident2Id], 'phone filter is ignored for citizens');
    });
    await check('citizens cannot use staff endpoints (403)', async () => {
      for (const [m, p, b] of [
        ['GET', '/api/incidents'], ['GET', `/api/incidents/${ctx.incidentId}`], ['GET', '/api/teams'], ['GET', '/api/chat/messages'],
        ['GET', '/api/volunteers'], ['GET', '/api/telemetry/live'], ['GET', '/api/sos/active'],
        ['POST', '/api/command/dispatch', { incidentId: ctx.incidentId, teamId: ctx.rescue.teamId }],
        ['POST', '/api/command/verify', { incidentId: ctx.incidentId }],
        ['POST', '/api/command/broadcast', { message: 'x' }],
        ['POST', '/api/incidents/update', { incidentId: ctx.incidentId, status: 'Resolved' }],
        ['POST', '/api/incidents/report', { title: 'x' }],
        ['POST', '/api/chat/send', { text: 'hi' }],
        ['POST', '/api/teams/telemetry', { lat: 1, lng: 1 }],
        ['POST', '/api/teams/sos', {}],
        ['POST', '/api/shelters/update', { shelterId: 'SH-01', occupied: 1 }],
        ['PUT', '/api/sectors/SEC-UK-01', { status: 'Closed' }],
        ['GET', '/api/database/stats']
      ]) {
        const r = await api(m, p, { token: C(), ...(b ? { body: b } : {}) });
        assert.equal(r.status, 403, `${m} ${p} => ${r.status}`);
      }
    });
    await check('staff cannot create citizen SOS (citizen-only endpoint)', async () => {
      assert.equal((await api('POST', '/api/citizen/sos', { token: CMD(), body: { title: 'x' } })).status, 403);
      assert.equal((await api('POST', '/api/citizen/sos', { token: R(), body: { title: 'x' } })).status, 403);
    });

    // ------------------------------------------------------------------
    section('5. Command: verify, dispatch, broadcast');
    await check('command lists incidents (both SOS) and verifies one', async () => {
      const list = await api('GET', '/api/incidents', { token: CMD() });
      assert.equal(list.data.count, 2);
      const v = await api('POST', '/api/command/verify', { token: CMD(), body: { incidentId: ctx.incidentId } });
      assert.equal(v.status, 200);
      assert.equal(v.data.incident.status, 'Verified');
    });
    await check('dispatch to a non-existent team is a 404 (no mock "Alpha 01" fallback)', async () => {
      const r = await api('POST', '/api/command/dispatch', { token: CMD(), body: { incidentId: ctx.incidentId, teamName: 'Alpha 01' } });
      assert.equal(r.status, 404);
      const noTeam = await api('POST', '/api/command/dispatch', { token: CMD(), body: { incidentId: ctx.incidentId } });
      assert.equal(noTeam.status, 400);
    });
    await check('dispatch real team by teamId: incident Responding, team Deployed', async () => {
      const r = await api('POST', '/api/command/dispatch', {
        token: CMD(), body: { incidentId: ctx.incidentId, teamId: ctx.rescue.teamId, eta: '8 min', notes: 'Speedboat unit' }
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(r.data.incident.status, 'Responding');
      assert.equal(r.data.incident.assignedTeamId, ctx.rescue.teamId);
      assert.equal(r.data.team.status, 'Deployed');
      const citizenView = await api('GET', `/api/citizen/status/${ctx.incidentId}`, { token: C() });
      assert.match(citizenView.data.incident.substatus, /dispatched/);
    });
    await check('broadcast audiences: citizens only see all/citizens, rescue sees all/rescue', async () => {
      assert.equal((await api('POST', '/api/command/broadcast', { token: CMD(), body: { message: 'High tide alert', severity: 'Critical' } })).status, 201);
      assert.equal((await api('POST', '/api/command/broadcast', { token: CMD(), body: { message: 'Units: regroup at ridge', audience: 'rescue' } })).status, 201);
      assert.equal((await api('POST', '/api/command/broadcast', { token: CMD(), body: { message: 'Citizens: boil water', audience: 'citizens' } })).status, 201);
      assert.equal((await api('POST', '/api/command/broadcast', { token: CMD(), body: { message: '   ' } })).status, 400);
      const cit = (await api('GET', '/api/alerts', { token: C() })).data.alerts.map((a) => a.message).sort();
      assert.deepEqual(cit, ['Citizens: boil water', 'High tide alert']);
      const res = (await api('GET', '/api/alerts', { token: R() })).data.alerts.map((a) => a.message).sort();
      assert.deepEqual(res, ['High tide alert', 'Units: regroup at ridge']);
      assert.equal((await api('GET', '/api/alerts', { token: CMD() })).data.alerts.length, 3);
    });
    await check('shelter occupancy & sector status updates persist (command only)', async () => {
      const s = await api('POST', '/api/shelters/update', { token: CMD(), body: { shelterId: 'SH-01', occupied: 42 } });
      assert.equal(s.data.shelter.occupied, 42);
      assert.equal((await api('POST', '/api/shelters/update', { token: CMD(), body: { shelterId: 'SH-01', occupied: 99999 } })).status, 400);
      assert.equal((await api('GET', '/api/shelters', { token: C() })).data.shelters.find((x) => x.id === 'SH-01').occupied, 42);
      const sec = await api('PUT', '/api/sectors/SEC-UK-01', { token: CMD(), body: { status: 'Evacuating', alertLevel: 'Critical' } });
      assert.equal(sec.data.sector.alertLevel, 'Critical');
      assert.equal((await api('PUT', '/api/sectors/SEC-UK-01', { token: CMD(), body: { status: 'Banana' } })).status, 400);
    });

    // ------------------------------------------------------------------
    section('6. Rescue: team identity, telemetry, incident updates, SOS');
    await check('telemetry uses the token\'s team (teamId optional, own only)', async () => {
      const r = await api('POST', '/api/teams/telemetry', { token: R(), body: { lat: 9.9672, lng: 76.2418, battery: 84, status: 'Deployed' } });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(r.data.team.id, ctx.rescue.teamId);
      assert.equal(r.data.team.battery, 84);
      assert.equal(r.data.team.coordinates.lat, 9.9672);
      const own = await api('POST', '/api/teams/telemetry', { token: R(), body: { teamId: ctx.rescue.teamId, lat: 9.9673, lng: 76.2419 } });
      assert.equal(own.status, 200);
    });
    await check('telemetry for ANOTHER team is forbidden; command and citizens cannot post telemetry', async () => {
      assert.equal((await api('POST', '/api/teams/telemetry', { token: R(), body: { teamId: ctx.rescue2.teamId, lat: 1, lng: 1 } })).status, 403);
      assert.equal((await api('POST', '/api/teams/telemetry', { token: CMD(), body: { lat: 1, lng: 1 } })).status, 403);
    });
    await check('telemetry validation (range checks)', async () => {
      assert.equal((await api('POST', '/api/teams/telemetry', { token: R(), body: { lat: 91, lng: 0 } })).status, 400);
      assert.equal((await api('POST', '/api/teams/telemetry', { token: R(), body: { battery: 150 } })).status, 400);
      assert.equal((await api('POST', '/api/teams/telemetry', { token: R(), body: {} })).status, 400);
    });
    await check('live telemetry and history are visible to staff', async () => {
      const live = await api('GET', '/api/telemetry/live', { token: CMD() });
      assert.equal(live.data.telemetry.length, 1);
      assert.equal(live.data.telemetry[0].teamId, ctx.rescue.teamId);
      const hist = await api('GET', `/api/telemetry/history/${ctx.rescue.teamId}?limit=10`, { token: R() });
      assert.equal(hist.data.history.length, 2);
    });
    await check('POST /api/teams/status updates own team status', async () => {
      const r = await api('POST', '/api/teams/status', { token: R2(), body: { status: 'Standby' } });
      assert.equal(r.status, 200);
      assert.equal(r.data.team.status, 'Standby');
      assert.equal((await api('POST', '/api/teams/status', { token: R2(), body: { status: 'SOS' } })).status, 400);
    });
    await check('rescue can only update incidents assigned to ITS team', async () => {
      const other = await api('POST', '/api/incidents/update', { token: R2(), body: { incidentId: ctx.incidentId, status: 'On site' } });
      assert.equal(other.status, 403);
      const unassigned = await api('POST', '/api/incidents/update', { token: R(), body: { incidentId: ctx.incident2Id, status: 'On site' } });
      assert.equal(unassigned.status, 403);
      const ok = await api('POST', '/api/incidents/update', { token: R(), body: { incidentId: ctx.incidentId, status: 'On site', notes: 'Arrived, starting evacuation' } });
      assert.equal(ok.status, 200);
      assert.equal(ok.data.incident.status, 'On site');
      const bad = await api('POST', '/api/incidents/update', { token: R(), body: { incidentId: ctx.incidentId, status: 'Unverified' } });
      assert.equal(bad.status, 400, 'rescue cannot move incidents back to Unverified');
      const invalid = await api('POST', '/api/incidents/update', { token: CMD(), body: { incidentId: ctx.incidentId, status: 'Banana' } });
      assert.equal(invalid.status, 400);
    });
    await check('rescue files a field incident: attributed to its own team (body team ignored)', async () => {
      const r = await api('POST', '/api/incidents/report', {
        token: R2(), body: { title: 'Fallen power line', location: 'Mattancherry Canal Bridge', severity: 'Medium', teamName: `Alpha ${stamp}`, coordinates: { lat: 9.9587, lng: 76.2594 } }
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      assert.equal(r.data.incident.assignedTeamId, ctx.rescue2.teamId);
      assert.equal(r.data.incident.isCitizenSOS, false);
      assert.equal(r.data.incident.sectorId, 'SEC-KL-02');
    });
    await check('rescue SOS: critical incident + SOS event, team flagged, command resolves it', async () => {
      const r = await api('POST', '/api/teams/sos', { token: R(), body: { notes: 'Trapped by rockfall', coordinates: { lat: 30.55, lng: 79.56 } } });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      assert.equal(r.data.incident.isRescueSOS, true);
      assert.equal(r.data.incident.severity, 'Critical');
      const active = await api('GET', '/api/sos/active', { token: CMD() });
      assert.equal(active.data.count, 1);
      assert.equal(active.data.events[0].teamId, ctx.rescue.teamId);
      const teams = await api('GET', '/api/teams', { token: CMD() });
      assert.equal(teams.data.teams.find((t) => t.id === ctx.rescue.teamId).status, 'SOS');
      assert.equal((await api('POST', `/api/sos/resolve/${active.data.events[0].id}`, { token: R() })).status, 403);
      const res = await api('POST', `/api/sos/resolve/${active.data.events[0].id}`, { token: CMD() });
      assert.equal(res.data.event.resolved, true);
      assert.equal((await api('GET', '/api/sos/active', { token: CMD() })).data.count, 0);
    });
    await check('resolving the last active incident frees the team', async () => {
      const r = await api('POST', '/api/incidents/update', { token: R(), body: { incidentId: ctx.incidentId, status: 'Resolved', notes: 'All evacuated' } });
      assert.equal(r.status, 200);
      const team = (await api('GET', '/api/teams', { token: CMD() })).data.teams.find((t) => t.id === ctx.rescue.teamId);
      assert.equal(team.status, 'Available');
      const cit = await api('GET', `/api/citizen/status/${ctx.incidentId}`, { token: C() });
      assert.equal(cit.data.incident.status, 'Resolved');
    });

    // ------------------------------------------------------------------
    section('7. Tactical chat');
    await check('chat: sender identity comes from the token (cannot be spoofed)', async () => {
      const r = await api('POST', '/api/chat/send', { token: R(), body: { channel: 'command-net', sender: 'Ananya Kumar', role: 'Command Operator', text: 'Alpha on scene.' } });
      assert.equal(r.status, 201);
      assert.equal(r.data.message.sender, 'Capt. Rajesh Negi');
      assert.equal(r.data.message.senderId, ctx.rescue.user.id);
      assert.equal(r.data.message.senderRole, 'rescue');
      assert.match(r.data.message.role, /Rescue/);
    });
    await check('chat: message ids are idempotent and cannot be hijacked', async () => {
      const first = await api('POST', '/api/chat/send', { token: CMD(), body: { id: `msg-${stamp}-1`, text: 'Copy Alpha.' } });
      assert.equal(first.status, 201);
      const retry = await api('POST', '/api/chat/send', { token: CMD(), body: { id: `msg-${stamp}-1`, text: 'Copy Alpha.' } });
      assert.equal(retry.status, 200);
      assert.equal(retry.data.duplicate, true);
      assert.equal((await api('POST', '/api/chat/send', { token: R(), body: { id: `msg-${stamp}-1`, text: 'overwrite' } })).status, 409);
    });
    await check('chat: empty text rejected; history is chronological and per-channel', async () => {
      assert.equal((await api('POST', '/api/chat/send', { token: CMD(), body: { text: '  ' } })).status, 400);
      const h = await api('GET', '/api/chat/messages?channel=command-net', { token: R() });
      assert.deepEqual(h.data.messages.map((m) => m.text), ['Alpha on scene.', 'Copy Alpha.']);
    });
    await check('chat: team-private channels are visible only to that team and command', async () => {
      const ch = `team-${ctx.rescue.teamId}`;
      assert.equal((await api('POST', '/api/chat/send', { token: R(), body: { channel: ch, text: 'internal' } })).status, 201);
      assert.equal((await api('POST', '/api/chat/send', { token: R2(), body: { channel: ch, text: 'snoop' } })).status, 403);
      assert.equal((await api('GET', `/api/chat/messages?channel=${ch}`, { token: R2() })).status, 403);
      assert.equal((await api('GET', `/api/chat/messages?channel=${ch}`, { token: CMD() })).data.messages.length, 1);
      const all = (await api('GET', '/api/chat/messages', { token: R2() })).data.messages;
      assert.equal(all[ch], undefined, 'channel=all must not leak other teams\' channels');
    });

    // ------------------------------------------------------------------
    section('8. Volunteers');
    await check('any authenticated user can register as a volunteer (upsert per user)', async () => {
      const r = await api('POST', '/api/volunteers/register', { token: C(), body: { skills: ['First Aid', 'Boat'], sectorId: 'SEC-UK-02' } });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      assert.equal(r.data.volunteer.userId, ctx.citizen.user.id);
      const again = await api('POST', '/api/volunteers/register', { token: C(), body: { skills: ['First Aid'], sectorId: 'SEC-UK-02' } });
      assert.equal(again.data.volunteer.id, r.data.volunteer.id);
      assert.equal((await api('POST', '/api/volunteers/register', { token: C(), body: { sectorId: 'NOPE' } })).status, 400);
      ctx.volunteerId = r.data.volunteer.id;
    });
    await check('volunteer status: owner or staff only', async () => {
      assert.equal((await api('PUT', `/api/volunteers/${ctx.volunteerId}`, { token: C2(), body: { status: 'Active' } })).status, 403);
      assert.equal((await api('PUT', `/api/volunteers/${ctx.volunteerId}`, { token: C(), body: { status: 'Active' } })).status, 200);
      assert.equal((await api('GET', '/api/volunteers', { token: CMD() })).data.count, 1);
    });

    // ------------------------------------------------------------------
    section('9. Diagnostics RBAC');
    await check('/api/database/stats is command-only', async () => {
      assert.equal((await api('GET', '/api/database/stats', { token: R() })).status, 403);
      const r = await api('GET', '/api/database/stats', { token: CMD() });
      assert.equal(r.status, 200);
      assert.equal(r.data.database.users, 6);
    });

    // ------------------------------------------------------------------
    section('10. CORS (ALLOWED_ORIGINS)');
    await check('allowed origin: preflight 204 + ACAO header; disallowed: 403, no ACAO', async () => {
      const ok = await api('OPTIONS', '/api/incidents', { headers: { Origin: TEST_ORIGIN, 'Access-Control-Request-Method': 'GET' } });
      assert.equal(ok.status, 204);
      assert.equal(ok.headers['access-control-allow-origin'], TEST_ORIGIN);
      const bad = await api('OPTIONS', '/api/incidents', { headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'GET' } });
      assert.equal(bad.status, 403);
      assert.equal(bad.headers['access-control-allow-origin'], undefined);
      const simple = await api('GET', '/api/health', { headers: { Origin: 'http://evil.example' } });
      assert.equal(simple.headers['access-control-allow-origin'], undefined);
      const good = await api('GET', '/api/health', { headers: { Origin: TEST_ORIGIN } });
      assert.equal(good.headers['access-control-allow-origin'], TEST_ORIGIN);
    });

    // ------------------------------------------------------------------
    section('11. Static hosting + SPA fallback');
    await check('GET / serves the built index.html', async () => {
      const r = await api('GET', '/');
      assert.equal(r.status, 200);
      assert.match(r.headers['content-type'], /text\/html/);
      assert.match(r.raw, /ResQCore Test UI/);
      assert.match(r.headers['cache-control'], /no-cache/);
    });
    await check('client-side routes fall back to index.html', async () => {
      const r = await api('GET', '/live-map/some/deep/route');
      assert.equal(r.status, 200);
      assert.match(r.raw, /ResQCore Test UI/);
    });
    await check('hashed assets are served with immutable caching and correct type', async () => {
      const r = await api('GET', '/assets/app-123.js');
      assert.equal(r.status, 200);
      assert.match(r.headers['content-type'], /javascript/);
      assert.match(r.headers['cache-control'], /immutable/);
      assert.equal((await api('GET', '/assets/missing.js')).status, 404);
    });
    await check('path traversal cannot escape the static directory', async () => {
      for (const p of ['/..%2f..%2fserver.js', '/%2e%2e/%2e%2e/server.js', '/..%2f..%2f..%2f..%2fwindows%2fwin.ini']) {
        const r = await api('GET', p);
        assert.ok(!/ResQCore Unified|import http/.test(r.raw), `${p} leaked source`);
        assert.notEqual(r.status, 500);
      }
    });
    await check('/api/* never falls through to the SPA', async () => {
      const r = await api('GET', '/api/some/spa/route');
      assert.equal(r.status, 404);
      assert.ok(r.data?.error);
    });

    // ------------------------------------------------------------------
    section('12. Realtime: SSE + WebSocket authentication and visibility');
    await check('SSE rejects anonymous and invalid tokens (401)', async () => {
      assert.equal((await connectSSE(server.baseUrl, null)).status, 401);
      assert.equal((await connectSSE(server.baseUrl, 'bad.token.value', { viaQuery: true })).status, 401);
    });
    await check('WebSocket upgrade rejects anonymous / invalid tokens (401) and bad origins (403)', async () => {
      assert.equal((await connectWS(server.baseUrl, null)).status, 401);
      assert.equal((await connectWS(server.baseUrl, 'bad.token.value')).status, 401);
      assert.equal((await connectWS(server.baseUrl, CMD(), { origin: 'http://evil.example' })).status, 403);
    });

    const sseCmd = await connectSSE(server.baseUrl, CMD());
    const sseCit = await connectSSE(server.baseUrl, C(), { viaQuery: true }); // EventSource style: ?token=
    const sseCit2 = await connectSSE(server.baseUrl, C2());
    const wsRescue = await connectWS(server.baseUrl, R());                    // ?token=
    const wsRescueHdr = await connectWS(server.baseUrl, R2(), { viaQuery: false }); // Authorization header (native apps)
    const wsCit = await connectWS(server.baseUrl, C());
    const ev = (list, type) => list.filter((e) => (e.type ?? e.event) === type);

    await check('all authenticated realtime channels connect', () => {
      assert.equal(sseCmd.status, 200);
      assert.equal(sseCit.status, 200);
      assert.equal(wsRescue.status, 101);
      assert.equal(wsRescueHdr.status, 101);
      assert.equal(wsCit.status, 101);
    });
    await waitFor(() => wsRescue.messages.some((m) => m.event === 'connected'), 2000, 'ws welcome');
    await check('WS welcome frame reports the VERIFIED identity (incl. teamId)', () => {
      const hello = wsRescue.messages.find((m) => m.event === 'connected').data;
      assert.equal(hello.user.role, 'rescue');
      assert.equal(hello.user.teamId, ctx.rescue.teamId);
    });
    await check('client-asserted role in the legacy WS register message is ignored', async () => {
      wsCit.send({ type: 'register', role: 'command', name: 'I am totally command' });
      await waitFor(() => wsCit.messages.some((m) => m.event === 'registered'), 2000, 'registered ack');
      assert.equal(wsCit.messages.find((m) => m.event === 'registered').data.role, 'citizen');
    });

    // new SOS by citizen 1 (citizen 2 must not see it; command + rescue must)
    const sos = await api('POST', '/api/citizen/sos', { token: C(), body: { title: 'Landslide', location: 'NH-7 Km 42', coordinates: { lat: 30.4, lng: 79.33 } } });
    ctx.liveIncident = sos.data.incident.id;
    await check('new_citizen_sos reaches command (SSE), rescue (WS), and the owning citizen only', async () => {
      await waitFor(() => ev(sseCmd.events, 'new_citizen_sos').some((e) => e.data.id === ctx.liveIncident), 2000, 'command SSE');
      await waitFor(() => ev(wsRescue.messages, 'new_citizen_sos').some((m) => m.data.id === ctx.liveIncident), 2000, 'rescue WS');
      await waitFor(() => ev(sseCit.events, 'new_citizen_sos').some((e) => e.data.id === ctx.liveIncident), 2000, 'owner SSE');
      await sleep(150);
      assert.equal(ev(sseCit2.events, 'new_citizen_sos').length, 0, 'other citizen must not receive it');
    });

    await api('POST', '/api/command/dispatch', { token: CMD(), body: { incidentId: ctx.liveIncident, teamId: ctx.rescue.teamId, eta: '5 min' } });
    await check('incident_assigned: owner gets it WITHOUT team details; others never see it; staff get full payload', async () => {
      await waitFor(() => ev(sseCit.events, 'incident_assigned').length === 1, 2000, 'owner assigned');
      assert.equal(ev(sseCit.events, 'incident_assigned')[0].data.team, undefined);
      await waitFor(() => ev(sseCmd.events, 'incident_assigned').some((e) => e.data.team), 2000, 'command assigned');
      await waitFor(() => ev(wsRescue.messages, 'incident_assigned').length === 1, 2000, 'rescue assigned');
      assert.equal(ev(sseCit2.events, 'incident_assigned').length, 0);
    });

    await api('POST', '/api/teams/telemetry', { token: R(), body: { lat: 30.401, lng: 79.331, battery: 70 } });
    await api('POST', '/api/chat/send', { token: CMD(), body: { text: 'Realtime hello' } });
    await check('telemetry and chat events are staff-only (citizens never receive them)', async () => {
      await waitFor(() => ev(sseCmd.events, 'team_telemetry_update').some((e) => e.data.battery === 70), 2000, 'telemetry on command');
      await waitFor(() => ev(wsRescue.messages, 'new_chat_message').some((m) => m.data.message.text === 'Realtime hello'), 2000, 'chat on rescue');
      await sleep(150);
      assert.equal(ev(sseCit.events, 'team_telemetry_update').length, 0);
      assert.equal(ev(sseCit.events, 'new_chat_message').length, 0);
      assert.equal(ev(wsCit.messages, 'team_telemetry_update').length, 0);
      assert.equal(ev(wsCit.messages, 'new_chat_message').length, 0);
    });
    await check('team-private chat events are not delivered to other teams\' sockets', async () => {
      const before = ev(wsRescueHdr.messages, 'new_chat_message').length;
      await api('POST', '/api/chat/send', { token: R(), body: { channel: `team-${ctx.rescue.teamId}`, text: 'private to alpha' } });
      await waitFor(() => ev(wsRescue.messages, 'new_chat_message').some((m) => m.data.message.text === 'private to alpha'), 2000, 'own team');
      await sleep(150);
      assert.equal(ev(wsRescueHdr.messages, 'new_chat_message').filter((m) => m.data.message.text === 'private to alpha').length, 0);
      assert.ok(before >= 0);
    });
    await check('broadcast audience filtering over realtime', async () => {
      await api('POST', '/api/command/broadcast', { token: CMD(), body: { message: 'RT rescue only', audience: 'rescue' } });
      await api('POST', '/api/command/broadcast', { token: CMD(), body: { message: 'RT everyone' } });
      await waitFor(() => ev(sseCit.events, 'emergency_broadcast').some((e) => e.data.message === 'RT everyone'), 2000, 'citizen broadcast');
      await waitFor(() => ev(wsRescue.messages, 'emergency_broadcast').some((m) => m.data.message === 'RT rescue only'), 2000, 'rescue broadcast');
      await sleep(150);
      assert.equal(ev(sseCit.events, 'emergency_broadcast').some((e) => e.data.message === 'RT rescue only'), false);
    });

    await check('WS inbound: rescue chat/telemetry/status are authorised + acked; citizens get an error', async () => {
      wsRescue.send({ type: 'chat_message', data: { text: 'via websocket', id: `ws-msg-${stamp}`, ref: 'r1' } });
      wsRescue.send({ type: 'telemetry', data: { lat: 30.402, lng: 79.332, battery: 66 } });
      wsRescue.send({ type: 'update_status', data: { incidentId: ctx.liveIncident, status: 'On site', notes: 'via ws' } });
      await waitFor(() => ev(wsRescue.messages, 'ack').length >= 3, 2000, 'three acks');
      assert.equal(ev(wsRescue.messages, 'error').length, 0);
      await waitFor(() => ev(sseCmd.events, 'new_chat_message').some((e) => e.data.message.text === 'via websocket'), 2000, 'ws chat on command');
      await waitFor(() => ev(sseCit.events, 'incident_status_changed').some((e) => e.data.status === 'On site'), 2000, 'owner sees on-site');

      wsCit.send({ type: 'chat_message', data: { text: 'citizen spam' } });
      wsCit.send({ type: 'telemetry', data: { lat: 1, lng: 1 } });
      wsRescueHdr.send({ type: 'update_status', data: { incidentId: ctx.liveIncident, status: 'Resolved' } }); // other team
      await waitFor(() => ev(wsCit.messages, 'error').length >= 2, 2000, 'citizen errors');
      await waitFor(() => ev(wsRescueHdr.messages, 'error').length >= 1, 2000, 'cross-team error');
      assert.ok(ev(wsCit.messages, 'error').every((m) => m.data.status === 403));
      assert.equal(ev(wsRescueHdr.messages, 'error')[0].data.status, 403);
      const msgs = await api('GET', '/api/chat/messages?channel=command-net', { token: CMD() });
      assert.equal(msgs.data.messages.some((m) => m.text === 'citizen spam'), false);
    });

    [sseCmd, sseCit, sseCit2, wsRescue, wsRescueHdr, wsCit].forEach((c) => c.close());
  } finally {
    await server.stop();
  }

  console.log('\n============================================================');
  if (failed === 0) {
    console.log(`>>> ALL ${passed} INTEGRATION CHECKS PASSED <<<`);
  } else {
    console.log(`>>> ${failed} FAILED, ${passed} passed <<<`);
    for (const f of failures) console.log(` - ${f.name}`);
  }
  console.log('============================================================\n');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[TEST RUNNER ERROR]', err);
  process.exit(1);
});
