import test from 'node:test';
import assert from 'node:assert/strict';

import { dbManager as db } from '../database.js';
import { eventBus } from '../eventBus.js';
import * as actions from '../actions.js';
import { initLiveOsFromDb, liveOs } from './runtime.js';

function resetLiveOs({ totals = { ambulances: 6, boats: 4, medicalKits: 18, foodPacks: 500 } } = {}) {
  liveOs._internal.pcbs.clear();
  liveOs._internal.teams.clear();
  liveOs._internal.teamLocks.clear();
  liveOs._internal.banker.processes = [];
  liveOs._internal.banker.lastRequest = null;
  liveOs._internal.events.length = 0;
  liveOs.setTotals(totals);
  liveOs._internal.events.length = 0;
}

function patchDb(t, overrides) {
  const originals = {};
  for (const [k, fn] of Object.entries(overrides)) {
    originals[k] = db[k];
    db[k] = fn;
  }
  t.after(() => {
    for (const [k, orig] of Object.entries(originals)) {
      db[k] = orig;
    }
  });
}

test('Section 9 hooks: SOS admission, team dispatch, Banker 409 without DB mutation, DB failure rollback, resolve', async (t) => {
  resetLiveOs({ totals: { ambulances: 2, boats: 4, medicalKits: 18, foodPacks: 500 } });

  const store = {
    incidents: new Map(),
    teams: new Map([
      ['T1', { id: 'T1', name: 'Alpha', status: 'Available', specialization: 'Flood Rescue', responders: 4, coordinates: { lat: 30.32, lng: 78.03 } }],
      ['T2', { id: 'T2', name: 'Bravo', status: 'Available', specialization: 'Medical', responders: 4, coordinates: { lat: 30.33, lng: 78.04 } }]
    ]),
    resources: [
      { id: 'ambulance', name: 'Ambulances', total: 2, available: 2 },
      { id: 'boat', name: 'Rescue Boats', total: 4, available: 4 },
      { id: 'medical_kit', name: 'Medical Kits', total: 18, available: 18 },
      { id: 'food_pack', name: 'Food Packets', total: 500, available: 500 }
    ]
  };
  let seq = 1;
  let allocateCalls = 0;
  let assignCalls = 0;
  let throwOnAssign = false;
  const emittedTypes = [];
  const sub = ({ event }) => emittedTypes.push(event);
  eventBus.on('*', sub);
  t.after(() => eventBus.off('*', sub));

  patchDb(t, {
    generateIncidentId: () => `INC-T-${seq++}`,
    findSectorForPoint: async () => ({ id: 'SEC-1' }),
    getResourcesSnapshot: async () => ({ resources: store.resources, allocations: [] }),
    insertIncident: async (data) => {
      const rec = {
        ...data,
        status: data.status || 'Unverified',
        coordinates: data.lat != null ? { lat: data.lat, lng: data.lng } : null,
        createdAt: new Date().toISOString()
      };
      store.incidents.set(rec.id, rec);
      return rec;
    },
    getIncidentById: async (id) => store.incidents.get(id) || null,
    getAllIncidents: async () => [...store.incidents.values()],
    getTeamById: async (id) => store.teams.get(id) || null,
    getAllTeams: async () => [...store.teams.values()],
    allocateResourcesBatch: async () => { allocateCalls++; return []; },
    assignTeamAtomic: async ({ incidentId, teamId, eta }) => {
      assignCalls++;
      if (throwOnAssign) throw new Error('simulated DB outage');
      const inc = store.incidents.get(incidentId);
      const tm = store.teams.get(teamId);
      inc.status = 'Responding';
      inc.assignedTeam = tm.name;
      inc.assignedTeamId = tm.id;
      inc.eta = eta;
      tm.status = 'Deployed';
      return {};
    },
    releaseIncidentAllocations: async () => 1,
    releaseOldTeamAssignment: async (incId, oldTeamId) => store.teams.get(oldTeamId),
    updateIncident: async (id, patch) => {
      const inc = store.incidents.get(id);
      Object.assign(inc, patch);
      return inc;
    },
    resolveIncidentAtomic: async () => 1,
    countActiveIncidentsForTeam: async () => 0,
    updateTeam: async (id, patch) => {
      const tm = store.teams.get(id);
      Object.assign(tm, patch);
      return tm;
    },
    setResourceTotalsInDb: async () => store.resources,
    appendOsEvent: async () => {}
  });

  // 1. Admit SOS with sanitized requestedResources + otherNeeds
  const sos1 = await actions.createCitizenSos(
    { id: 'cit-1', name: 'Citizen 1', role: 'citizen' },
    {
      title: 'Hospital Emergency',
      severity: 'Critical',
      type: 'Medical',
      affected: 5,
      lat: 30.31,
      lng: 78.02,
      requestedResources: { ambulances: 2, medicalKits: 2, foodPacks: 999 },
      otherNeeds: ['Oxygen cylinders', ' ', 'Blankets']
    }
  );
  assert.equal(sos1.incident.requestedResources.foodPacks, 20);
  assert.deepEqual(sos1.incident.otherNeeds, ['Oxygen cylinders', 'Blankets']);
  assert.ok(emittedTypes.includes('OS_LIVE_UPDATED'));

  const sos2 = await actions.createCitizenSos(
    { id: 'cit-2', name: 'Citizen 2', role: 'citizen' },
    {
      title: 'Second Emergency',
      severity: 'High',
      type: 'Medical',
      requestedResources: { ambulances: 2 }
    }
  );

  // Verify then Dispatch sos1 -> succeeds and leaves 0 ambulances in pool
  await actions.verifyIncident({ id: 'cmd', role: 'command' }, { incidentId: sos1.incident.id });
  const disp1 = await actions.dispatchTeam({ id: 'cmd', role: 'command' }, { incidentId: sos1.incident.id, teamId: 'T1' });
  assert.equal(disp1.incident.status, 'Responding');
  assert.equal(actions.getOsLive().banker.available.ambulances, 0);

  // Dispatch sos2 needing 2 ambulances -> Banker's 409 denial & ZERO new DB writes!
  const beforeAlloc = allocateCalls;
  const beforeAssign = assignCalls;
  await assert.rejects(
    () => actions.dispatchTeam({ id: 'cmd', role: 'command' }, { incidentId: sos2.incident.id, teamId: 'T2' }),
    (err) => err.status === 409 && /Allocation denied/i.test(err.message)
  );
  assert.equal(allocateCalls, beforeAlloc);
  assert.equal(assignCalls, beforeAssign);
  assert.equal(store.incidents.get(sos2.incident.id).status, 'Unverified');
  assert.equal(actions.getOsLive().banker.lastRequest.granted, false);

  // Resolve sos1 -> restores ambulances and frees T1
  await actions.updateIncidentStatus({ id: 'cmd', role: 'command' }, { incidentId: sos1.incident.id, status: 'Resolved' });
  assert.equal(actions.getOsLive().banker.available.ambulances, 2);
  assert.equal(store.teams.get('T1').status, 'Available');

  // If DB commit fails AFTER OS dispatch -> liveOs.complete undoes the OS lock/allocation
  throwOnAssign = true;
  await assert.rejects(
    () => actions.dispatchTeam({ id: 'cmd', role: 'command' }, { incidentId: sos2.incident.id, teamId: 'T2' }),
    /simulated DB outage/
  );
  assert.equal(actions.getOsLive().banker.available.ambulances, 2);
  assert.equal(liveOs._internal.teams.get('T2').status, 'Available');
});

test('Section 9 endpoints: schedulers, custom processes, deadlock, semaphore, suggest-team, resource updates', async (t) => {
  resetLiveOs({ totals: { ambulances: 6, boats: 4, medicalKits: 18, foodPacks: 500 } });

  patchDb(t, {
    getAllIncidents: async () => [],
    getAllTeams: async () => [
      { id: 'T-W', name: 'Water Unit', status: 'Available', specialization: 'Water rescue', responders: 5, coordinates: { lat: 30.34, lng: 78.00 } },
      { id: 'T-F', name: 'Fire Unit', status: 'Available', specialization: 'Fire response', responders: 4, coordinates: { lat: 30.31, lng: 78.00 } },
      { id: 'T-B', name: 'Busy Unit', status: 'Deployed', specialization: 'Flood Water Rescue', responders: 4, coordinates: { lat: 30.30, lng: 78.00 } }
    ],
    getIncidentById: async (id) =>
      id === 'INC-S1'
        ? { id: 'INC-S1', title: 'River Flood', type: 'Flood', severity: 'High', status: 'Verified', affected: 10, coordinates: { lat: 30.30, lng: 78.00 } }
        : null,
    setResourceTotalsInDb: async () => [],
    appendOsEvent: async () => {}
  });

  // Live schedulers with < 2 active incidents falls back cleanly to DEMO_WORKLOAD
  const liveFallback = await actions.getSchedulerComparison({ source: 'live', quantum: 4 });
  assert.equal(liveFallback.source, 'demo');
  assert.equal(liveFallback.isDemoData, true);
  assert.equal(liveFallback.workload.length, 6);

  // Custom schedulers validation (1..50 processes)
  assert.throws(() => actions.runCustomSchedulerComparison({ processes: [] }), /1 to 50/);
  const custom = actions.runCustomSchedulerComparison({
    quantum: 4,
    processes: [
      { pid: 'P1', arrival: 0, burst: 5, priority: 1 },
      { pid: 'P2', arrival: 1, burst: 3, priority: 2 }
    ]
  });
  assert.equal(custom.algorithms.length, 6);

  // Deadlock & semaphore
  const dl = actions.getDeadlockAnalysis();
  assert.equal(dl.scenarios.length, 2);
  assert.equal(dl.scenarios[0].hasDeadlock, true);
  assert.equal(dl.scenarios[1].hasDeadlock, false);

  const sem = actions.getSemaphoreDemo({ capacity: 3, items: 6 });
  assert.equal(sem.produced, 6);
  assert.equal(sem.consumed, 6);
  assert.ok(sem.trace.some((entry) => entry.action.includes('BLOCKED')));

  // Smart team suggestion
  const sug = await actions.suggestTeamsForIncident('INC-S1');
  assert.equal(sug.suggestions[0].teamId, 'T-W');

  // Update resource totals (valid vs invalid)
  const upd = await actions.updateOsResourceTotals({ ambulances: 2 });
  assert.equal(upd.banker.total.ambulances, 2);
  await assert.rejects(() => actions.updateOsResourceTotals({ ambulances: -1 }), /non-negative integer/);

  // initLiveOsFromDb loads DB pool totals rather than falling back to constants
  patchDb(t, {
    getResourcesSnapshot: async () => ({
      resources: [
        { id: 'ambulance', name: 'Ambulances', total: 6, available: 6 },
        { id: 'boat', name: 'Rescue Boats', total: 4, available: 4 },
        { id: 'medical_kit', name: 'Medical Kits', total: 18, available: 18 },
        { id: 'food_pack', name: 'Food Packets', total: 500, available: 500 }
      ],
      allocations: []
    }),
    getRecentOsEvents: async () => []
  });
  const initSnap = await initLiveOsFromDb();
  assert.deepEqual(initSnap.banker.total, { ambulances: 6, boats: 4, medicalKits: 18, foodPacks: 500 });
});
