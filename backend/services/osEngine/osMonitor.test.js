import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POOL,
  AGING_INTERVAL,
  computePriority,
  scoreIncident,
  need,
  findSafeSequence,
  requestIsSafe
} from './osMonitor.js';

test('computePriority calculates severity + category bonus + people score clamped at 100', () => {
  assert.equal(computePriority({ severity: 'Critical', category: 'Flood', affected: 40 }), 100);
  assert.equal(computePriority({ severity: 'High', category: 'Fire', affected: 20 }), 87); // 75 + 10 + 2
  assert.equal(computePriority({ severity: 'Medium', category: 'Medical', affected: 10 }), 59); // 50 + 8 + 1
  assert.equal(computePriority({ severity: 'Low', category: 'General', affected: 1 }), 25);
  assert.equal(computePriority({ severity: 'Banana', category: 'General', affected: 1 }), 25); // unknown -> low
});

test('scoreIncident applies +20 aging boost per 5 minutes and classifies tier cleanly', () => {
  const t0 = 1_700_000_000_000;
  const lowInc = { id: 'LOW-1', severity: 'Low', category: 'General', affected: 1, arrivalTime: t0, state: 'READY' };
  const s0 = scoreIncident(lowInc, t0);
  assert.equal(s0.basePriority, 25);
  assert.equal(s0.agingBoost, 0);
  assert.equal(s0.effectiveScore, 25);
  assert.equal(s0.priorityTier, 'Minor');

  // +10 min => 2 intervals => +40 => 65 Delayed (no longer Minor)
  const s10 = scoreIncident(lowInc, t0 + 2 * AGING_INTERVAL);
  assert.equal(s10.agingBoost, 40);
  assert.equal(s10.effectiveScore, 65);
  assert.equal(s10.priorityTier, 'Delayed');
  assert.equal(s10.waitTimeSeconds, 600);

  // +15 min => 3 intervals => +60 => 85 Immediate
  const s15 = scoreIncident(lowInc, t0 + 3 * AGING_INTERVAL);
  assert.equal(s15.effectiveScore, 85);
  assert.equal(s15.priorityTier, 'Immediate');
});

test('Banker need, findSafeSequence, and requestIsSafe enforce safety rules', () => {
  const proc = {
    pid: 'P1',
    maximum: { ambulances: 3, boats: 1, medicalKits: 5, foodPacks: 10 },
    allocation: { ambulances: 1, boats: 0, medicalKits: 2, foodPacks: 4 }
  };
  assert.deepEqual(need(proc), { ambulances: 2, boats: 1, medicalKits: 3, foodPacks: 6 });

  const view = {
    total: { ...DEFAULT_POOL, ambulances: 2 },
    available: { ambulances: 1, boats: 5, medicalKits: 100, foodPacks: 500 },
    processes: [
      {
        pid: 'INC-1',
        maximum: { ambulances: 2, boats: 0, medicalKits: 1, foodPacks: 1 },
        allocation: { ambulances: 1, boats: 0, medicalKits: 1, foodPacks: 1 }
      },
      {
        pid: 'INC-2',
        maximum: { ambulances: 2, boats: 0, medicalKits: 1, foodPacks: 1 },
        allocation: { ambulances: 0, boats: 0, medicalKits: 0, foodPacks: 0 }
      }
    ]
  };

  // Exceeds need
  const exceedNeed = requestIsSafe(view, 'INC-2', { ambulances: 3 });
  assert.equal(exceedNeed.granted, false);
  assert.equal(exceedNeed.reason, 'Request exceeds this process maximum need.');

  // Exceeds available
  const exceedAvail = requestIsSafe(view, 'INC-2', { ambulances: 2 });
  assert.equal(exceedAvail.granted, false);
  assert.equal(exceedAvail.reason, 'Insufficient available resources (Ambulances: requested 2, available 1).');

  // Tentative allocation leaves INC-1 needing 1 ambulance and INC-2 needing 1 ambulance with 0 available -> unsafe!
  const unsafe = requestIsSafe(view, 'INC-2', { ambulances: 1 });
  assert.equal(unsafe.granted, false);
  assert.match(unsafe.reason, /leaves no safe sequence; blocked:/);

  // Safe sequence passes when finishing INC-1 leaves 2 ambulances for INC-2
  const seq = findSafeSequence(view.processes, view.available);
  assert.equal(seq.safe, true);
  assert.deepEqual(seq.sequence, ['INC-1', 'INC-2']);

  // Valid safe commit mutates allocation & available
  const ok = requestIsSafe(view, 'INC-1', { ambulances: 1 });
  assert.equal(ok.granted, true);
  assert.equal(ok.reason, 'Safe state preserved.');
  assert.equal(view.available.ambulances, 0);
});
