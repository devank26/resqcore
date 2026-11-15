import test from 'node:test';
import assert from 'node:assert/strict';
import { OSEngine, computePriority, checkBankersSafety } from './index.js';

test('computePriority ranks severity + category + affected consistently', () => {
  const crit = computePriority({ severity: 'Critical', category: 'Flood', affected: 50 });
  const high = computePriority({ severity: 'High', category: 'Flood', affected: 5 });
  const low = computePriority({ severity: 'Low', category: 'General', affected: 1 });
  assert.ok(crit > high);
  assert.ok(high > low);
});

test('aging increases priority every 30s and prevents starvation', () => {
  const engine = new OSEngine({ agingIntervalMs: 30_000 });
  const t0 = 1_000_000;
  engine.admitIncident({ id: 'LOW-1', severity: 'Low', type: 'General', affected: 1 }, t0);
  const before = engine.pcbs.get('LOW-1').priority;

  // 29s: not yet aged
  assert.equal(engine.applyAging(t0 + 29_000), 0);
  assert.equal(engine.pcbs.get('LOW-1').priority, before);

  // 90s: +3 ticks
  assert.equal(engine.applyAging(t0 + 90_000), 1);
  assert.equal(engine.pcbs.get('LOW-1').ageTicks, 3);
  assert.equal(engine.pcbs.get('LOW-1').priority, before + 3);
});

test('bounded intake queue (cap 10): low gets 429 + retryAfter, critical evicts lowest', () => {
  const engine = new OSEngine({ queueCapacity: 10 });
  const t0 = 1_000_000;

  for (let i = 1; i <= 10; i++) {
    const res = engine.admitIncident({ id: `INC-${i}`, severity: 'Low', type: 'General', affected: 1 }, t0 + i);
    assert.equal(res.accepted, true);
  }
  assert.equal(engine.intakeQueue.length, 10);

  // 11th Low -> 429 + retryAfter
  const rejected = engine.admitIncident({ id: 'INC-11', severity: 'Low', type: 'General', affected: 1 }, t0 + 20);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.status, 429);
  assert.ok(rejected.retryAfter > 0);

  // Critical replaces lowest priority
  const crit = engine.admitIncident({ id: 'CRIT-1', severity: 'Critical', type: 'SOS', affected: 20 }, t0 + 30);
  assert.equal(crit.accepted, true);
  assert.equal(crit.evictedPid, 'INC-10');
  assert.equal(engine.intakeQueue.length, 10);
  assert.equal(engine.peekNextReady().pid, 'CRIT-1');
});

test('priority-preemptive scheduler, team mutex, and waiting/turnaround/response metrics', () => {
  const engine = new OSEngine();
  const t0 = 1_000_000;

  engine.admitIncident({ id: 'INC-L', severity: 'Low', type: 'General', affected: 1 }, t0);
  engine.admitIncident({ id: 'INC-C', severity: 'Critical', type: 'Collapse', affected: 10 }, t0 + 100);

  // Dispatch low on team-1
  engine.dispatchPcb('INC-L', 'team-1', t0 + 1000);
  assert.throws(() => engine.acquireTeamMutex('team-1', 'INC-C'), /team_locked/);

  // Dispatch critical on team-2 -> preempts lower-priority running PCB
  engine.dispatchPcb('INC-C', 'team-2', t0 + 2000);
  assert.equal(engine.preemptions, 1);
  assert.equal(engine.pcbs.get('INC-L').preemptedCount, 1);

  engine.completePcb('INC-L', t0 + 5000);
  engine.completePcb('INC-C', t0 + 6000);
  // team-1 mutex released on completion
  assert.equal(engine.acquireTeamMutex('team-1', 'INC-NEXT'), true);

  const metrics = engine.getMetrics();
  assert.equal(metrics.terminatedCount, 2);
  assert.ok(metrics.avgWaitingTimeMs > 0);
  assert.ok(metrics.avgResponseTimeMs > 0);
  assert.ok(metrics.avgTurnaroundTimeMs > 0);
});

test('Banker algorithm approves safe allocation and rejects unsafe state', () => {
  const safe = checkBankersSafety({
    available: { boat: 2, ambulance: 3 },
    allocations: { 'INC-1': { boat: 2, ambulance: 1 } },
    maxNeeds: { 'INC-1': { boat: 3, ambulance: 2 }, 'INC-2': { boat: 2, ambulance: 2 } },
    request: { boat: 1, ambulance: 1 },
    requesterId: 'INC-2'
  });
  assert.equal(safe.safe, true);
  assert.equal(safe.sequence.length, 2);

  // Unsafe: if INC-2 takes all remaining boats (2), INC-1 needs 1 boat & 1 ambulance -> deadlock!
  const unsafe = checkBankersSafety({
    available: { boat: 2, ambulance: 1 },
    allocations: { 'INC-1': { boat: 2, ambulance: 1 }, 'INC-2': { boat: 0, ambulance: 1 } },
    maxNeeds: { 'INC-1': { boat: 4, ambulance: 2 }, 'INC-2': { boat: 3, ambulance: 3 } },
    request: { boat: 2, ambulance: 0 },
    requesterId: 'INC-2'
  });
  assert.equal(unsafe.safe, false);
  assert.match(unsafe.reason, /^insufficient_resource/);
});
