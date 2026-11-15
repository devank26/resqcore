import test from 'node:test';
import assert from 'node:assert/strict';
import { AGING_INTERVAL } from './osMonitor.js';
import { createLiveOs, computeDemand } from './liveOs.js';

test('Live OS layer: READY priority order and aging prevention of starvation', () => {
  const os = createLiveOs();
  const t0 = 1_700_000_000_000;

  os.admit({ id: 'LOW-1', severity: 'Low', category: 'General', affected: 1 }, t0);
  os.admit({ id: 'MED-1', severity: 'Medium', category: 'General', affected: 1 }, t0 + 100);
  os.admit({ id: 'CRIT-1', severity: 'Critical', category: 'Fire', affected: 5 }, t0 + 200);

  const snap0 = os.getSnapshot(t0 + 200);
  assert.deepEqual(snap0.readyQueue, ['CRIT-1', 'MED-1', 'LOW-1']);

  // +10 minutes later LOW-1 aging boost raises effectiveScore above 50 -> no longer Minor
  const snap10 = os.getSnapshot(t0 + 2 * AGING_INTERVAL);
  const low10 = snap10.processes.find((p) => p.pid === 'LOW-1');
  assert.ok(low10.effectiveScore > low10.basePriority);
  assert.notEqual(low10.priorityTier, 'Minor');
});

test('Live OS layer: bounded queue reports overCapacity without dropping real emergencies', () => {
  const os = createLiveOs({ queueCapacity: 10 });
  const t0 = 1_700_000_000_000;
  for (let i = 1; i <= 11; i += 1) {
    const res = os.admit({ id: `INC-${i}`, severity: 'Low', affected: 1 }, t0 + i);
    assert.equal(res.accepted, true);
  }
  const snap = os.getSnapshot(t0 + 20);
  assert.equal(snap.queueCount, 11);
  assert.equal(snap.overCapacity, true);
});

test('Live OS layer: dispatch, complete, Banker denial, mutex denial, duplicate dispatch, priority inversion, assign, syncFromStore, demand clamp, requestedResources', () => {
  const t0 = 1_700_000_000_000;
  const os = createLiveOs({
    total: { ambulances: 1, boats: 2, medicalKits: 50, foodPacks: 200 }
  });
  os.syncTeams([
    { id: 'T1', name: 'Alpha', status: 'Available' },
    { id: 'T2', name: 'Bravo', status: 'Available' },
    { id: 'T3', name: 'Charlie', status: 'Deployed' }
  ]);

  // Critical demand needs 2 ambulances normally -> clamped to pool total 1 so dispatch can succeed
  const clamped = computeDemand({ severity: 'Critical', category: 'Fire', affected: 5 }, { ambulances: 1, boats: 2, medicalKits: 50, foodPacks: 200 });
  assert.equal(clamped.demand.ambulances, 1);
  assert.equal(clamped.clamped, true);

  // requestedResources {ambulances:3, boats:1} produces demand {3,1,0,0} (against large pool)
  const explicit = computeDemand(
    { requestedResources: { ambulances: 3, boats: 1 }, severity: 'Low', affected: 50 },
    { ambulances: 10, boats: 5, medicalKits: 100, foodPacks: 500 }
  );
  assert.deepEqual(explicit.demand, { ambulances: 3, boats: 1, medicalKits: 0, foodPacks: 0 });

  os.admit({ id: 'C1', severity: 'Critical', category: 'Fire', affected: 5 }, t0);
  os.admit({ id: 'C2', severity: 'Critical', category: 'Fire', affected: 5 }, t0 + 10);
  os.admit({ id: 'L1', severity: 'Low', category: 'General', affected: 1 }, t0 + 20);

  // Deploying to already-Deployed team refused (409)
  const busyRes = os.dispatch('C1', 'T3', t0 + 100);
  assert.equal(busyRes.success, false);
  assert.equal(busyRes.status, 409);

  // Priority inversion when dispatching Low L1 while Critical C1 waits
  const piRes = os.dispatch('L1', 'T1', t0 + 110);
  assert.equal(piRes.success, true);
  assert.equal(piRes.priorityInversion, true);

  // Assign moves running incident from T1 to T2 and frees T1
  const reassign = os.assign('L1', 'T2', t0 + 120);
  assert.equal(reassign.success, true);
  let snap = os.getSnapshot(t0 + 120);
  assert.equal(snap.teams.find((t) => t.id === 'T1').status, 'Available');
  assert.equal(snap.teams.find((t) => t.id === 'T2').status, 'Deployed');

  // Dispatch C1 on T1 (takes the 1 ambulance)
  const d1 = os.dispatch('C1', 'T1', t0 + 130);
  assert.equal(d1.success, true);
  assert.equal(os.getSnapshot(t0 + 130).banker.available.ambulances, 0);

  // Dispatching C1 twice fails
  const dupDispatch = os.dispatch('C1', 'T1', t0 + 135);
  assert.equal(dupDispatch.success, false);

  // Free T2 cleanly by completing L1 first
  os.complete('L1', t0 + 150);

  // Second critical dispatch C2 on now-Available T2 is denied by Banker ("Allocation denied") because ambulances=1 is exhausted
  const d2 = os.dispatch('C2', 'T2', t0 + 160);
  assert.equal(d2.success, false);
  assert.match(d2.message, /^Allocation denied/);

  // Complete C1 restores ambulance & frees T1
  os.complete('C1', t0 + 200);
  snap = os.getSnapshot(t0 + 200);
  assert.equal(snap.banker.available.ambulances, 1);
  assert.equal(snap.teams.find((t) => t.id === 'T1').status, 'Available');

  // syncFromStore rebuilds one RUNNING, one READY, and skips Resolved
  os.syncFromStore(
    [
      { id: 'RUN-1', severity: 'High', category: 'Flood', status: 'Responding', assignedTeamId: 'T1', createdAt: t0 },
      { id: 'RDY-1', severity: 'Medium', category: 'Medical', status: 'Verified', createdAt: t0 + 10 },
      { id: 'RES-1', severity: 'Critical', category: 'Fire', status: 'Resolved', createdAt: t0 + 20 }
    ],
    [{ id: 'T1', name: 'Alpha', status: 'Deployed' }],
    t0 + 100
  );
  const rebuilt = os.getSnapshot(t0 + 100);
  assert.deepEqual(rebuilt.runningPids, ['RUN-1']);
  assert.deepEqual(rebuilt.readyQueue, ['RDY-1']);
  assert.equal(rebuilt.processes.find((p) => p.pid === 'RES-1'), undefined);
});

test('Live OS pool: two incidents each requesting 2 ambulances with pool=2 -> second is denied', () => {
  const os = createLiveOs({ total: { ambulances: 2, boats: 0, medicalKits: 10, foodPacks: 50 } });
  os.syncTeams([
    { id: 'T1', name: 'Team 1', status: 'Available' },
    { id: 'T2', name: 'Team 2', status: 'Available' }
  ]);
  os.admit({ id: 'A1', requestedResources: { ambulances: 2 } }, 1000);
  os.admit({ id: 'A2', requestedResources: { ambulances: 2 } }, 1001);

  assert.equal(os.dispatch('A1', 'T1', 1010).success, true);
  const res2 = os.dispatch('A2', 'T2', 1020);
  assert.equal(res2.success, false);
  assert.match(res2.message, /Allocation denied/);
});
