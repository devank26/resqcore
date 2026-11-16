import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fcfs,
  roundRobin,
  srtf,
  edf,
  priorityAging,
  mlfq,
  compareSchedulers,
  incidentsToProcesses,
  detectDeadlock,
  getBuiltInDeadlockScenarios,
  Semaphore,
  Mutex,
  producerConsumerDemo,
  haversineKm,
  suggestTeams
} from './osAlgorithms.js';

const TEXTBOOK = [
  { pid: 'P1', arrival: 0, burst: 5, priority: 10 },
  { pid: 'P2', arrival: 1, burst: 3, priority: 10 },
  { pid: 'P3', arrival: 2, burst: 8, priority: 10 },
  { pid: 'P4', arrival: 3, burst: 6, priority: 10 }
];

test('Textbook CPU schedulers: FCFS, SRTF, Round Robin q=4, and compareSchedulers', () => {
  const rFcfs = fcfs(TEXTBOOK);
  assert.deepEqual(
    rFcfs.processes.map((p) => p.completion),
    [5, 8, 16, 22]
  );
  assert.equal(rFcfs.metrics.avgWaiting, 5.75);
  assert.equal(rFcfs.metrics.avgTurnaround, 11.25);

  const rSrtf = srtf(TEXTBOOK);
  const byPidSrtf = Object.fromEntries(rSrtf.processes.map((p) => [p.pid, p.completion]));
  assert.deepEqual(byPidSrtf, { P2: 4, P1: 8, P4: 14, P3: 22 });
  assert.equal(rSrtf.metrics.avgWaiting, 5);
  assert.equal(rSrtf.metrics.avgTurnaround, 10.5);

  const rRr = roundRobin(TEXTBOOK, { quantum: 4 });
  const byPidRr = Object.fromEntries(rRr.processes.map((p) => [p.pid, p.completion]));
  assert.deepEqual(byPidRr, { P2: 7, P1: 16, P3: 20, P4: 22 });
  assert.equal(rRr.metrics.avgWaiting, 9.25);
  assert.equal(rRr.metrics.avgTurnaround, 14.75);
  assert.equal(rRr.metrics.contextSwitches, 6);

  const cmp = compareSchedulers(TEXTBOOK, { quantum: 4 });
  assert.equal(cmp.algorithms.length, 6);
  assert.equal(cmp.best.avgWaiting, 'SRTF');
});

test('EDF vs FCFS missed deadlines', () => {
  const work = [
    { pid: 'A', arrival: 0, burst: 4, deadline: 10 },
    { pid: 'B', arrival: 0, burst: 3, deadline: 5 }
  ];
  assert.equal(fcfs(work).metrics.deadlinesMissed, 1);
  assert.equal(edf(work).metrics.deadlinesMissed, 0);
});

test('Priority aging prevents starvation of LOW behind HI', () => {
  const work = [
    { pid: 'LOW', arrival: 0, burst: 3, priority: 1 },
    { pid: 'HI', arrival: 0, burst: 30, priority: 10 }
  ];
  const noBoost = priorityAging(work, { ageInterval: 10, boost: 0 });
  assert.equal(noBoost.processes.find((p) => p.pid === 'LOW').completion, 33);

  const withBoost = priorityAging(work, { ageInterval: 10, boost: 5 });
  assert.equal(withBoost.processes.find((p) => p.pid === 'LOW').completion, 23);
});

test('MLFQ favors SHORT arriving at t=5 over LONG', () => {
  const work = [
    { pid: 'LONG', arrival: 0, burst: 20 },
    { pid: 'SHORT', arrival: 5, burst: 2 }
  ];
  const resMlfq = mlfq(work);
  const shortMlfq = resMlfq.processes.find((p) => p.pid === 'SHORT');
  const longMlfq = resMlfq.processes.find((p) => p.pid === 'LONG');
  assert.equal(shortMlfq.completion, 7);
  assert.equal(shortMlfq.response, 0);
  assert.equal(longMlfq.completion, 22);

  const resFcfs = fcfs(work);
  assert.equal(resFcfs.processes.find((p) => p.pid === 'SHORT').completion, 22);
});

test('Idle time makespan and CPU utilization', () => {
  const res = fcfs([{ pid: 'ONLY', arrival: 3, burst: 2 }]);
  assert.equal(res.metrics.makespan, 5);
  assert.equal(res.metrics.cpuUtilization, 40);
});

test('incidentsToProcesses maps severity, affected burst bonus, and 10-min capped arrival gap', () => {
  const base = Date.UTC(2026, 10, 15, 10, 0, 0);
  const procs = incidentsToProcesses([
    { id: 'I1', severity: 'Critical', affected: 40, createdAt: new Date(base).toISOString() },
    { id: 'I2', severity: 'Low', affected: 0, createdAt: new Date(base + 5 * 60_000).toISOString() }
  ]);
  assert.equal(procs[0].priority, 100);
  assert.equal(procs[0].burst, 24);
  assert.equal(procs[1].arrival, 5);
});

test('Deadlock scenarios A (deadlock + cycle + victim INC-FIRE) and B (safe order [INC-FLOOD])', () => {
  const [a, b] = getBuiltInDeadlockScenarios();
  assert.equal(a.hasDeadlock, true);
  assert.deepEqual(a.deadlocked.sort(), ['INC-FIRE', 'INC-FLOOD']);
  assert.ok(a.cycle.length >= 3);
  assert.equal(a.suggestedVictim, 'INC-FIRE');

  assert.equal(b.hasDeadlock, false);
  assert.deepEqual(b.safeOrder, ['INC-FLOOD']);

  // Also test detectDeadlock directly returns clean explanation
  const direct = detectDeadlock({ available: {}, processes: [] });
  assert.equal(direct.hasDeadlock, false);
});

test('Semaphore and Mutex behavior & FIFO handoff', () => {
  const sem = new Semaphore(1);
  assert.equal(sem.wait('a'), true);
  assert.equal(sem.wait('b'), false);
  assert.equal(sem.wait('c'), false);
  assert.equal(sem.signal(), 'b');
  assert.equal(sem.signal(), 'c');
  assert.equal(sem.signal(), null);
  assert.equal(sem.count, 1);

  const mutex = new Mutex();
  assert.equal(mutex.lock('op1'), true);
  assert.equal(mutex.lock('op2'), false);
  assert.throws(() => mutex.unlock('op2'));
  assert.equal(mutex.unlock('op1'), 'op2');
  assert.equal(mutex.owner, 'op2');
});

test('Producer-consumer deterministic trace logs BLOCKED and never exceeds capacity', () => {
  const res = producerConsumerDemo({ capacity: 3, items: 6, consumeEvery: 2 });
  assert.equal(res.produced, 6);
  assert.equal(res.consumed, 6);
  assert.ok(res.trace.every((entry) => entry.buffer.length <= 3));
  assert.ok(res.trace.some((entry) => entry.action.includes('BLOCKED')));
});

test('Smart team selection uses Haversine distance and category specialty bonus', () => {
  assert.equal(haversineKm(30.3, 78.0, 30.3, 78.0), 0);

  const suggestions = suggestTeams(
    { category: 'Flood', coordinates: { lat: 30.3, lng: 78.0 } },
    [
      { id: 'near', name: 'Fire Response', specialization: 'Fire Response', status: 'Available', latitude: 30.31, longitude: 78.0 },
      { id: 'boat', name: 'Water Rescue', specialization: 'Water Rescue', status: 'Available', latitude: 30.34, longitude: 78.0 },
      { id: 'busy', name: 'Busy Boat', specialization: 'Water Rescue', status: 'Deployed', latitude: 30.301, longitude: 78.0 }
    ]
  );

  assert.equal(suggestions.some((s) => s.teamId === 'busy'), false);
  assert.equal(suggestions[0].teamId, 'boat');
  assert.equal(suggestions[0].suitable, true);
});
