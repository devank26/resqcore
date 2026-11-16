import test from 'node:test';
import assert from 'node:assert/strict';
import { AGING_INTERVAL, DEFAULT_POOL } from './osMonitor.js';
import { createLiveOs } from './liveOs.js';
import {
  mapIncident,
  mapTeam,
  mapResourceRows,
  sanitizeRequestedResources,
  sanitizeOtherNeeds,
  createLiveDataSource
} from './liveAdapter.js';

test('Adapter maps live incident JSON, team JSON, coordinates variants, team name -> id, and unknown severity -> low', () => {
  const teams = [
    mapTeam({
      id: 'team-1',
      name: 'Alpha 01',
      status: 'Available',
      lat: 30.31,
      lng: 78.03,
      specialization: 'Water Rescue',
      responders: 6
    })
  ];
  assert.equal(teams[0].latitude, 30.31);
  assert.equal(teams[0].longitude, 78.03);

  const mappedNested = mapIncident(
    {
      id: 'INC-100',
      title: 'Canal Breach',
      type: 'Flood',
      severity: 'Unexpected',
      affectedCount: 14,
      status: 'Responding',
      assignedTeam: 'Alpha 01',
      created_at: '2026-11-15T12:00:00Z',
      coordinates: { lat: 30.32, lng: 78.04 }
    },
    teams
  );
  assert.equal(mappedNested.pid, 'INC-100');
  assert.equal(mappedNested.severity, 'low');
  assert.equal(mappedNested.affected, 14);
  assert.equal(mappedNested.assignedTeamId, 'team-1');
  assert.deepEqual(mappedNested.coordinates, { lat: 30.32, lng: 78.04 });

  const mappedFlat = mapIncident({
    id: 'INC-101',
    title: 'Landslide',
    severity: 'High',
    lat: 30.35,
    lng: 78.08
  });
  assert.deepEqual(mappedFlat.coordinates, { lat: 30.35, lng: 78.08 });
});

test('Resource row mapper converts DB rows to pool totals, allocated, and available, with fallback', () => {
  const mapped = mapResourceRows([
    { name: 'Ambulance', total: 10, available: 7 },
    { name: 'Rescue Boat', total: 5, available: 5 },
    { name: 'Medical Kit', total: 100, available: 60 },
    { name: 'Food Packets', total: 500, available: 280 }
  ]);
  assert.deepEqual(mapped.total, { ambulances: 10, boats: 5, medicalKits: 100, foodPacks: 500 });
  assert.deepEqual(mapped.allocated, { ambulances: 3, boats: 0, medicalKits: 40, foodPacks: 220 });
  assert.deepEqual(mapped.available, { ambulances: 7, boats: 5, medicalKits: 60, foodPacks: 280 });
  assert.equal(mapped.usedFallback, false);

  const fallback = mapResourceRows([]);
  assert.deepEqual(fallback.total, DEFAULT_POOL);
  assert.equal(fallback.usedFallback, true);
});

test('Live-ingestion events: duplicate INCIDENT_CREATED creates one PCB, Resolved restores resources, unknown ignored', () => {
  const os = createLiveOs();
  os.syncTeams([{ id: 'T1', name: 'Bravo', status: 'Available' }]);
  const src = createLiveDataSource({ liveOs: os, pollIntervalMs: 0 });
  const now = 1_700_000_000_000;

  const incPayload = {
    id: 'INC-DUP-1',
    title: 'Roof fire',
    type: 'Fire',
    severity: 'High',
    affected: 5,
    status: 'Verified',
    createdAt: new Date(now).toISOString()
  };

  src.handleEvent('INCIDENT_CREATED', { incident: incPayload }, now);
  src.handleEvent('INCIDENT_CREATED', { incident: incPayload }, now + 500);
  assert.equal(os.getSnapshot(now + 500).processes.length, 1);

  src.handleEvent('INCIDENT_ASSIGNED', { incidentId: 'INC-DUP-1', teamId: 'T1', teamName: 'Bravo' }, now + 1000);
  assert.equal(os.getSnapshot(now + 1000).banker.available.ambulances, 9);

  src.handleEvent('INCIDENT_STATUS_UPDATED', { incidentId: 'INC-DUP-1', status: 'Resolved' }, now + 2000);
  const afterResolve = os.getSnapshot(now + 2000);
  assert.equal(afterResolve.banker.available.ambulances, 10);
  assert.equal(afterResolve.processes[0].state, 'TERMINATED');

  // Unknown incident Resolved does not throw
  assert.doesNotThrow(() => src.handleEvent('INCIDENT_STATUS_UPDATED', { incidentId: 'NO-SUCH-ID', status: 'Resolved' }));
  // Unknown event type handled safely
  assert.doesNotThrow(() => src.handleEvent('SOME_UNKNOWN_EVENT', { hello: 'world' }));
});

test('Creation time aging (~12 min -> wait ~720s, boost 40) vs >24h startup replacement by now', () => {
  const os = createLiveOs();
  const now = 1_700_000_000_000;

  const twelveMinAgo = now - 12 * 60_000;
  os.admit({ id: 'AGE-12M', severity: 'Low', category: 'General', affected: 1, arrivalTime: twelveMinAgo }, now);
  const pcb12 = os.getSnapshot(now).processes.find((p) => p.pid === 'AGE-12M');
  assert.ok(pcb12.waitTimeSeconds >= 719 && pcb12.waitTimeSeconds <= 721);
  assert.equal(pcb12.agingBoost, 40);

  // Startup rebuild with a 3-day-old incident treats it as arriving "now"
  const threeDaysAgo = now - 3 * 24 * 60 * 60_000;
  os.syncFromStore([{ id: 'OLD-3D', severity: 'Low', status: 'Unverified', arrivalTime: threeDaysAgo }], [], now);
  const pcb3d = os.getSnapshot(now).processes.find((p) => p.pid === 'OLD-3D');
  assert.equal(pcb3d.waitTimeSeconds, 0);
  assert.equal(pcb3d.agingBoost, 0);
});

test('Live source outage marks snapshot stale=true keeping last data, and recovers on return', async () => {
  const os = createLiveOs();
  let fail = false;
  let incidents = [{ id: 'LIVE-1', title: 'Bridge Collapse', severity: 'Critical', status: 'Verified', createdAt: new Date().toISOString() }];

  const src = createLiveDataSource({
    liveOs: os,
    pollIntervalMs: 0,
    fetchIncidents: async () => {
      if (fail) throw new Error('ECONNREFUSED');
      return incidents;
    },
    fetchTeams: async () => [{ id: 'T1', name: 'Rescue 1', status: 'Available' }],
    fetchResources: async () => [{ name: 'Ambulance', total: 8, available: 8 }]
  });

  const first = await src.syncNow();
  assert.equal(first.ok, true);
  assert.equal(first.snapshot.stale, false);
  assert.equal(first.snapshot.processes.length, 1);

  fail = true;
  const outage = await src.syncNow();
  src.stop(); // cancel scheduled retry timer cleanly
  assert.equal(outage.ok, false);
  assert.equal(outage.snapshot.stale, true);
  assert.equal(outage.snapshot.processes.length, 1); // last known snapshot preserved

  fail = false;
  incidents = [...incidents, { id: 'LIVE-2', title: 'Fire', severity: 'High', status: 'Verified', createdAt: new Date().toISOString() }];
  const recovered = await src.syncNow();
  assert.equal(recovered.ok, true);
  assert.equal(recovered.snapshot.stale, false);
  assert.equal(recovered.snapshot.processes.length, 2);
});

test('Sanitizers clamp requestedResources (1..20) and limit otherNeeds to 10 short strings', () => {
  assert.deepEqual(sanitizeRequestedResources({ ambulances: 99, boats: 1, badKey: 5 }), { ambulances: 20, boats: 1 });
  assert.deepEqual(sanitizeOtherNeeds(['Drinking water', '  Flashlights  ', 123, '', 'Drinking water']), ['Drinking water', 'Flashlights']);
});
