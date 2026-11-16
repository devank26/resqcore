/**
 * ResQCore OS Concepts Engine — Modules D, E, F, G
 * Pure, dependency-free OS algorithms (CPU Schedulers, Deadlock Detection, Semaphores/Mutex, Smart Selection).
 */
import { RESOURCE_KEYS, emptyVector, normalizeVector, cloneVector, fits } from './osMonitor.js';

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// ============================================================================
// Module D: CPU-Style Schedulers
// ============================================================================

export const DEMO_WORKLOAD = Object.freeze([
  { pid: 'FLOOD-1', arrival: 0, burst: 12, priority: 100, deadline: 30 },
  { pid: 'FIRE-1', arrival: 2, burst: 8, priority: 75, deadline: 20 },
  { pid: 'MEDICAL-1', arrival: 3, burst: 5, priority: 100, deadline: 15 },
  { pid: 'COLLAPSE-1', arrival: 5, burst: 15, priority: 75, deadline: 60 },
  { pid: 'ROAD-1', arrival: 6, burst: 3, priority: 25, deadline: 120 },
  { pid: 'SHELTER-1', arrival: 8, burst: 6, priority: 50, deadline: 90 }
]);

const SEVERITY_SCHEDULE_TABLE = {
  critical: { priority: 100, burst: 20, deadlineOffset: 30 },
  high: { priority: 75, burst: 15, deadlineOffset: 60 },
  medium: { priority: 50, burst: 10, deadlineOffset: 120 },
  low: { priority: 25, burst: 5, deadlineOffset: 240 },
  minor: { priority: 25, burst: 5, deadlineOffset: 240 },
  info: { priority: 10, burst: 3, deadlineOffset: 480 }
};

function normalizeProcesses(processes = []) {
  return processes.map((raw, idx) => {
    const arrival = Math.max(0, Math.round(Number(raw.arrival) || 0));
    const burst = Math.max(1, Math.ceil(Number(raw.burst) || 1));
    const priority = Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 0;
    const rawDl = raw.deadline;
    const deadline =
      rawDl === undefined || rawDl === null || rawDl === '' || !Number.isFinite(Number(rawDl))
        ? Infinity
        : Number(rawDl);

    return {
      pid: String(raw.pid || raw.id || `P${idx + 1}`),
      arrival,
      burst,
      priority,
      deadline,
      remaining: burst,
      firstStart: null,
      completion: null,
      waited: 0,
      level: 0,
      sliceUsed: 0
    };
  });
}

function buildSegments(timeline = []) {
  const segments = [];
  for (let t = 0; t < timeline.length; t += 1) {
    const pid = timeline[t] ?? null;
    const prev = segments[segments.length - 1];
    if (prev && prev.pid === pid) {
      prev.end = t + 1;
    } else {
      segments.push({ pid, start: t, end: t + 1 });
    }
  }
  return segments;
}

function finalizeSimulation(algorithm, procs, timeline) {
  const makespan = timeline.length;
  const segments = buildSegments(timeline);

  let busyTicks = 0;
  let contextSwitches = 0;
  let lastNonIdle = null;
  for (let t = 0; t < timeline.length; t += 1) {
    const pid = timeline[t];
    if (pid !== null) {
      busyTicks += 1;
      if (lastNonIdle !== null && pid !== lastNonIdle) {
        contextSwitches += 1;
      }
      lastNonIdle = pid;
    }
  }

  let totalWait = 0;
  let totalTurn = 0;
  let totalResp = 0;
  let deadlinesMissed = 0;

  const procResults = procs.map((p) => {
    const completion = p.completion ?? makespan;
    const start = p.firstStart ?? p.arrival;
    const turnaround = completion - p.arrival;
    const waiting = turnaround - p.burst;
    const response = start - p.arrival;
    const missedDeadline = Number.isFinite(p.deadline) && completion > p.deadline;
    if (missedDeadline) deadlinesMissed += 1;
    totalWait += waiting;
    totalTurn += turnaround;
    totalResp += response;

    return {
      pid: p.pid,
      arrival: p.arrival,
      burst: p.burst,
      priority: p.priority,
      deadline: Number.isFinite(p.deadline) ? p.deadline : null,
      start,
      completion,
      response,
      turnaround,
      waiting,
      missedDeadline
    };
  });

  const count = procResults.length;
  return {
    algorithm,
    segments,
    processes: procResults,
    metrics: {
      avgWaiting: count ? round2(totalWait / count) : 0,
      avgTurnaround: count ? round2(totalTurn / count) : 0,
      avgResponse: count ? round2(totalResp / count) : 0,
      throughput: makespan ? round4(count / makespan) : 0,
      cpuUtilization: makespan ? round2((busyTicks / makespan) * 100) : 0,
      contextSwitches,
      deadlinesMissed,
      makespan
    }
  };
}

function allDone(procs) {
  return procs.every((p) => p.remaining === 0);
}

export function fcfs(processes = []) {
  const procs = normalizeProcesses(processes);
  if (procs.length === 0) return finalizeSimulation('FCFS', [], []);

  const timeline = [];
  let current = null;
  let t = 0;

  while (!allDone(procs)) {
    if (!current || current.remaining === 0) {
      const ready = procs
        .filter((p) => p.remaining > 0 && p.arrival <= t)
        .sort((a, b) => a.arrival - b.arrival || a.pid.localeCompare(b.pid));
      current = ready[0] || null;
    }

    if (!current) {
      const nextArrival = Math.min(...procs.filter((p) => p.remaining > 0).map((p) => p.arrival));
      while (t < nextArrival) {
        timeline.push(null);
        t += 1;
      }
      continue;
    }

    if (current.firstStart === null) current.firstStart = t;
    timeline.push(current.pid);
    current.remaining -= 1;
    t += 1;
    if (current.remaining === 0) {
      current.completion = t;
      current = null;
    }
  }

  return finalizeSimulation('FCFS', procs, timeline);
}

export function roundRobin(processes = [], { quantum = 4 } = {}) {
  const q = Math.max(1, Math.floor(Number(quantum) || 4));
  const procs = normalizeProcesses(processes);
  if (procs.length === 0) return finalizeSimulation('Round Robin', [], []);

  const byArrival = new Map();
  for (const p of procs) {
    if (!byArrival.has(p.arrival)) byArrival.set(p.arrival, []);
    byArrival.get(p.arrival).push(p);
  }
  for (const arr of byArrival.values()) {
    arr.sort((a, b) => a.pid.localeCompare(b.pid));
  }

  const queue = [];
  const timeline = [];
  let current = null;
  let t = 0;

  while (!allDone(procs)) {
    const arrivals = byArrival.get(t);
    if (arrivals) {
      for (const p of arrivals) queue.push(p);
    }

    if (current && current.remaining > 0 && current.sliceUsed >= q) {
      current.sliceUsed = 0;
      queue.push(current);
      current = null;
    }

    if (!current) {
      if (queue.length > 0) {
        current = queue.shift();
        current.sliceUsed = 0;
      } else {
        const nextArrival = Math.min(...procs.filter((p) => p.remaining > 0).map((p) => p.arrival));
        while (t < nextArrival) {
          timeline.push(null);
          t += 1;
        }
        continue;
      }
    }

    if (current.firstStart === null) current.firstStart = t;
    timeline.push(current.pid);
    current.remaining -= 1;
    current.sliceUsed += 1;
    t += 1;
    if (current.remaining === 0) {
      current.completion = t;
      current = null;
    }
  }

  return finalizeSimulation('Round Robin', procs, timeline);
}

export function srtf(processes = []) {
  const procs = normalizeProcesses(processes);
  if (procs.length === 0) return finalizeSimulation('SRTF', [], []);

  const timeline = [];
  let current = null;
  let t = 0;

  while (!allDone(procs)) {
    const ready = procs.filter((p) => p.remaining > 0 && p.arrival <= t);
    if (ready.length === 0) {
      const nextArrival = Math.min(...procs.filter((p) => p.remaining > 0).map((p) => p.arrival));
      while (t < nextArrival) {
        timeline.push(null);
        t += 1;
      }
      current = null;
      continue;
    }

    ready.sort((a, b) => {
      if (a.remaining !== b.remaining) return a.remaining - b.remaining;
      if (current) {
        if (a === current && b !== current) return -1;
        if (b === current && a !== current) return 1;
      }
      if (a.arrival !== b.arrival) return a.arrival - b.arrival;
      return a.pid.localeCompare(b.pid);
    });

    current = ready[0];
    if (current.firstStart === null) current.firstStart = t;
    timeline.push(current.pid);
    current.remaining -= 1;
    t += 1;
    if (current.remaining === 0) {
      current.completion = t;
      current = null;
    }
  }

  return finalizeSimulation('SRTF', procs, timeline);
}

export function edf(processes = []) {
  const procs = normalizeProcesses(processes);
  if (procs.length === 0) return finalizeSimulation('EDF', [], []);

  const timeline = [];
  let current = null;
  let t = 0;

  while (!allDone(procs)) {
    const ready = procs.filter((p) => p.remaining > 0 && p.arrival <= t);
    if (ready.length === 0) {
      const nextArrival = Math.min(...procs.filter((p) => p.remaining > 0).map((p) => p.arrival));
      while (t < nextArrival) {
        timeline.push(null);
        t += 1;
      }
      current = null;
      continue;
    }

    ready.sort((a, b) => {
      if (a.deadline !== b.deadline) return a.deadline - b.deadline;
      if (current) {
        if (a === current && b !== current) return -1;
        if (b === current && a !== current) return 1;
      }
      if (a.arrival !== b.arrival) return a.arrival - b.arrival;
      return a.pid.localeCompare(b.pid);
    });

    current = ready[0];
    if (current.firstStart === null) current.firstStart = t;
    timeline.push(current.pid);
    current.remaining -= 1;
    t += 1;
    if (current.remaining === 0) {
      current.completion = t;
      current = null;
    }
  }

  return finalizeSimulation('EDF', procs, timeline);
}

export function priorityAging(processes = [], { ageInterval = 10, boost = 1 } = {}) {
  const interval = Math.max(1, Math.floor(Number(ageInterval) || 10));
  const boostVal = Math.max(0, Number(boost) || 0);
  const procs = normalizeProcesses(processes);
  if (procs.length === 0) return finalizeSimulation('Priority + Aging', [], []);

  const effectivePrio = (p) => p.priority + Math.floor(p.waited / interval) * boostVal;

  const timeline = [];
  let current = null;
  let t = 0;

  while (!allDone(procs)) {
    const ready = procs.filter((p) => p.remaining > 0 && p.arrival <= t);
    if (ready.length === 0) {
      const nextArrival = Math.min(...procs.filter((p) => p.remaining > 0).map((p) => p.arrival));
      while (t < nextArrival) {
        timeline.push(null);
        t += 1;
      }
      current = null;
      continue;
    }

    ready.sort((a, b) => {
      const diff = effectivePrio(b) - effectivePrio(a);
      if (diff !== 0) return diff;
      if (current) {
        if (a === current && b !== current) return -1;
        if (b === current && a !== current) return 1;
      }
      if (a.arrival !== b.arrival) return a.arrival - b.arrival;
      return a.pid.localeCompare(b.pid);
    });

    current = ready[0];
    if (current.firstStart === null) current.firstStart = t;
    timeline.push(current.pid);

    for (const p of ready) {
      if (p !== current) p.waited += 1;
    }

    current.remaining -= 1;
    t += 1;
    if (current.remaining === 0) {
      current.completion = t;
      current = null;
    }
  }

  return finalizeSimulation('Priority + Aging', procs, timeline);
}

export function mlfq(processes = [], { quanta = [4, 8], boostEvery = 50 } = {}) {
  const q0 = Math.max(1, Number(quanta[0] ?? 4));
  const q1 = Math.max(1, Number(quanta[1] ?? 8));
  const levelQuanta = [q0, q1, Infinity];
  const boostPeriod = Number.isFinite(Number(boostEvery)) && Number(boostEvery) > 0 ? Number(boostEvery) : 0;

  const procs = normalizeProcesses(processes);
  if (procs.length === 0) return finalizeSimulation('MLFQ', [], []);

  const byArrival = new Map();
  for (const p of procs) {
    if (!byArrival.has(p.arrival)) byArrival.set(p.arrival, []);
    byArrival.get(p.arrival).push(p);
  }
  for (const arr of byArrival.values()) {
    arr.sort((a, b) => a.pid.localeCompare(b.pid));
  }

  const queues = [[], [], []];
  const timeline = [];
  let current = null;
  let t = 0;

  while (!allDone(procs)) {
    if (boostPeriod > 0 && t > 0 && t % boostPeriod === 0) {
      if (current && current.remaining > 0) {
        current.level = 0;
        current.sliceUsed = 0;
        queues[0].push(current);
        current = null;
      }
      for (let lvl = 1; lvl < 3; lvl += 1) {
        while (queues[lvl].length > 0) {
          const p = queues[lvl].shift();
          p.level = 0;
          p.sliceUsed = 0;
          queues[0].push(p);
        }
      }
    }

    const arrivals = byArrival.get(t);
    if (arrivals) {
      for (const p of arrivals) {
        p.level = 0;
        p.sliceUsed = 0;
        queues[0].push(p);
      }
    }

    if (current && current.remaining > 0) {
      const qLimit = levelQuanta[current.level];
      if (current.sliceUsed >= qLimit) {
        current.level = Math.min(2, current.level + 1);
        current.sliceUsed = 0;
        queues[current.level].push(current);
        current = null;
      } else {
        // Higher non-empty queue preempts lower queue; preempted process keeps level and goes to tail of its queue
        const higherWaiting = queues.findIndex((q, lvl) => lvl < current.level && q.length > 0);
        if (higherWaiting !== -1) {
          current.sliceUsed = 0;
          queues[current.level].push(current);
          current = null;
        }
      }
    }

    if (!current) {
      const pickLevel = queues.findIndex((q) => q.length > 0);
      if (pickLevel !== -1) {
        current = queues[pickLevel].shift();
        current.sliceUsed = 0;
      } else {
        const nextArrival = Math.min(...procs.filter((p) => p.remaining > 0).map((p) => p.arrival));
        while (t < nextArrival) {
          timeline.push(null);
          t += 1;
        }
        continue;
      }
    }

    if (current.firstStart === null) current.firstStart = t;
    timeline.push(current.pid);
    current.remaining -= 1;
    current.sliceUsed += 1;
    t += 1;
    if (current.remaining === 0) {
      current.completion = t;
      current = null;
    }
  }

  return finalizeSimulation('MLFQ', procs, timeline);
}

export function compareSchedulers(processes = [], { quantum = 4 } = {}) {
  const results = [
    fcfs(processes),
    roundRobin(processes, { quantum }),
    srtf(processes),
    edf(processes),
    priorityAging(processes),
    mlfq(processes)
  ];

  const pickMin = (field) =>
    results.reduce((best, r) => (r.metrics[field] < best.metrics[field] ? r : best), results[0]).algorithm;
  const pickMax = (field) =>
    results.reduce((best, r) => (r.metrics[field] > best.metrics[field] ? r : best), results[0]).algorithm;

  return {
    algorithms: results,
    best: results.length
      ? {
          avgWaiting: pickMin('avgWaiting'),
          avgTurnaround: pickMin('avgTurnaround'),
          avgResponse: pickMin('avgResponse'),
          deadlinesMissed: pickMin('deadlinesMissed'),
          throughput: pickMax('throughput')
        }
      : {}
  };
}

export function incidentsToProcesses(incidents = []) {
  if (!Array.isArray(incidents) || incidents.length === 0) return [];

  const withTimes = incidents.map((inc, idx) => {
    const rawTs = inc.arrivalTime ?? inc.createdAt ?? inc.created_at;
    let ms = typeof rawTs === 'number' && Number.isFinite(rawTs) ? rawTs : Date.parse(rawTs);
    if (!Number.isFinite(ms)) ms = Date.now() + idx * 60_000;
    return { inc, ms };
  });

  withTimes.sort((a, b) => a.ms - b.ms);

  let compressedArrival = 0;
  return withTimes.map(({ inc, ms }, idx) => {
    if (idx > 0) {
      const gapMin = Math.max(0, Math.round((ms - withTimes[idx - 1].ms) / 60_000));
      compressedArrival += Math.min(10, gapMin);
    }

    const sev = String(inc.severity || 'low').trim().toLowerCase();
    const spec = SEVERITY_SCHEDULE_TABLE[sev] || SEVERITY_SCHEDULE_TABLE.low;
    const affected = Math.max(0, Number(inc.affected ?? inc.affectedCount ?? 0) || 0);
    const burst = spec.burst + Math.min(15, Math.floor(affected / 10));

    return {
      pid: String(inc.pid || inc.id || `INC-${idx + 1}`),
      title: inc.title || inc.id,
      arrival: compressedArrival,
      burst,
      priority: spec.priority,
      deadline: compressedArrival + spec.deadlineOffset
    };
  });
}

// ============================================================================
// Module E: Deadlock Detection
// ============================================================================

export const DEADLOCK_SCENARIOS = {
  deadlock: {
    name: 'Scenario A — Mutual Resource Hold-and-Wait (Deadlock)',
    available: { ambulances: 0, boats: 0, medicalKits: 0, foodPacks: 0 },
    processes: [
      {
        pid: 'INC-FLOOD',
        priority: 75,
        allocation: { ambulances: 1, boats: 0, medicalKits: 0, foodPacks: 0 },
        request: { ambulances: 0, boats: 1, medicalKits: 0, foodPacks: 0 }
      },
      {
        pid: 'INC-FIRE',
        priority: 50,
        allocation: { ambulances: 0, boats: 1, medicalKits: 0, foodPacks: 0 },
        request: { ambulances: 1, boats: 0, medicalKits: 0, foodPacks: 0 }
      }
    ]
  },
  safe: {
    name: 'Scenario B — Sufficient Boat Available (Safe)',
    available: { ambulances: 0, boats: 1, medicalKits: 0, foodPacks: 0 },
    processes: [
      {
        pid: 'INC-FLOOD',
        priority: 75,
        allocation: { ambulances: 1, boats: 0, medicalKits: 0, foodPacks: 0 },
        request: { ambulances: 0, boats: 1, medicalKits: 0, foodPacks: 0 }
      },
      {
        pid: 'INC-FIRE',
        priority: 50,
        allocation: emptyVector(),
        request: emptyVector()
      }
    ]
  }
};

function totalUnits(vec) {
  let sum = 0;
  for (const key of RESOURCE_KEYS) sum += Number(vec?.[key] || 0);
  return sum;
}

function findGraphCycle(edges = []) {
  const adj = new Map();
  const nodes = new Set();
  for (const e of edges) {
    nodes.add(e.from);
    nodes.add(e.to);
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }

  const state = new Map(); // 0/undef = unvisited, 1 = visiting, 2 = done
  const stack = [];

  function dfs(u) {
    state.set(u, 1);
    stack.push(u);
    for (const v of adj.get(u) || []) {
      const st = state.get(v) || 0;
      if (st === 1) {
        const idx = stack.indexOf(v);
        return stack.slice(idx).concat(v);
      }
      if (st === 0) {
        const cyc = dfs(v);
        if (cyc) return cyc;
      }
    }
    stack.pop();
    state.set(u, 2);
    return null;
  }

  for (const node of nodes) {
    if (!state.has(node)) {
      const cyc = dfs(node);
      if (cyc) return cyc;
    }
  }
  return [];
}

export function detectDeadlock({ available = {}, processes = [] } = {}) {
  const work = normalizeVector(available);
  const procs = processes.map((p) => ({
    pid: String(p.pid),
    priority: Number.isFinite(Number(p.priority)) ? Number(p.priority) : 0,
    allocation: normalizeVector(p.allocation),
    request: normalizeVector(p.request)
  }));

  const finished = new Array(procs.length).fill(false);
  const safeOrder = [];

  // A process with zero allocation and zero request is already finished
  for (let i = 0; i < procs.length; i += 1) {
    if (totalUnits(procs[i].allocation) === 0 && totalUnits(procs[i].request) === 0) {
      finished[i] = true;
    }
  }

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let i = 0; i < procs.length; i += 1) {
      if (finished[i]) continue;
      if (fits(procs[i].request, work)) {
        for (const key of RESOURCE_KEYS) {
          work[key] += procs[i].allocation[key];
        }
        finished[i] = true;
        safeOrder.push(procs[i].pid);
        progressed = true;
      }
    }
  }

  const deadlockedProcs = [];
  for (let i = 0; i < procs.length; i += 1) {
    if (!finished[i]) deadlockedProcs.push(procs[i]);
  }

  const edges = [];
  for (const p of procs) {
    for (const key of RESOURCE_KEYS) {
      if (p.allocation[key] > 0) {
        edges.push({
          from: `R:${key}`,
          to: `P:${p.pid}`,
          units: p.allocation[key],
          kind: 'assignment'
        });
      }
      if (p.request[key] > 0) {
        edges.push({
          from: `P:${p.pid}`,
          to: `R:${key}`,
          units: p.request[key],
          kind: 'request'
        });
      }
    }
  }

  const deadlocked = deadlockedProcs.map((p) => p.pid);
  const hasDeadlock = deadlocked.length > 0;
  const cycle = hasDeadlock ? findGraphCycle(edges) : [];

  let suggestedVictim = null;
  if (hasDeadlock) {
    const sorted = [...deadlockedProcs].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const allocDiff = totalUnits(a.allocation) - totalUnits(b.allocation);
      if (allocDiff !== 0) return allocDiff;
      return a.pid.localeCompare(b.pid);
    });
    suggestedVictim = sorted[0].pid;
  }

  const explanation = hasDeadlock
    ? `Deadlock detected among ${deadlocked.join(', ')}. Cycle: ${cycle.length ? cycle.join(' -> ') : 'circular wait'}. Preempt lowest-priority victim ${suggestedVictim} to break the cycle.`
    : safeOrder.length
      ? `No deadlock. Safe completion order: ${safeOrder.join(' -> ')}.`
      : 'No active resource wait cycle detected.';

  return {
    hasDeadlock,
    deadlocked,
    safeOrder,
    cycle,
    edges,
    suggestedVictim,
    explanation
  };
}

export function getBuiltInDeadlockScenarios() {
  return [
    { id: 'scenario-a', name: DEADLOCK_SCENARIOS.deadlock.name, ...detectDeadlock(DEADLOCK_SCENARIOS.deadlock) },
    { id: 'scenario-b', name: DEADLOCK_SCENARIOS.safe.name, ...detectDeadlock(DEADLOCK_SCENARIOS.safe) }
  ];
}

export function buildDeadlockFromLive(snapshot) {
  if (!snapshot) {
    return {
      hasDeadlock: false,
      deadlocked: [],
      safeOrder: [],
      cycle: [],
      edges: [],
      suggestedVictim: null,
      explanation: "Live OS snapshot unavailable. Banker's avoidance keeps the live pool deadlock-free."
    };
  }
  const available = snapshot.banker?.available || emptyVector();
  const procs = (snapshot.processes || [])
    .filter((p) => p.state === 'READY' || p.state === 'RUNNING')
    .map((p) => ({
      pid: p.pid,
      priority: p.effectiveScore ?? p.basePriority ?? 0,
      allocation: cloneVector(p.allocation),
      request: p.state === 'READY' ? cloneVector(p.maximum) : emptyVector()
    }));

  const result = detectDeadlock({ available, processes: procs });
  return {
    ...result,
    explanation: `${result.explanation} Because ResQCore enforces Banker's safe-state avoidance at dispatch time, a live deadlock should never form.`
  };
}

// ============================================================================
// Module F: Semaphores, Mutex & Producer-Consumer
// ============================================================================

export class Semaphore {
  constructor(count = 1) {
    this.count = Math.max(0, Math.floor(Number(count) || 0));
    this.waiters = [];
  }

  wait(who) {
    if (this.count > 0) {
      this.count -= 1;
      return true;
    }
    this.waiters.push(who);
    return false;
  }

  signal() {
    if (this.waiters.length > 0) {
      return this.waiters.shift();
    }
    this.count += 1;
    return null;
  }
}

export class Mutex {
  constructor() {
    this.locked = false;
    this.owner = null;
    this.waiters = [];
  }

  lock(who) {
    if (!this.locked) {
      this.locked = true;
      this.owner = who;
      return true;
    }
    this.waiters.push(who);
    return false;
  }

  unlock(who) {
    if (!this.locked) {
      throw new Error('Mutex is not currently locked.');
    }
    if (this.owner !== who) {
      throw new Error(`Mutex unlock denied: locked by ${this.owner}, caller is ${who}.`);
    }
    if (this.waiters.length > 0) {
      this.owner = this.waiters.shift();
      return this.owner;
    }
    this.locked = false;
    this.owner = null;
    return null;
  }
}

export function producerConsumerDemo({ capacity = 3, items = 6, consumeEvery = 2 } = {}) {
  const cap = Math.max(1, Math.min(20, Math.floor(Number(capacity) || 3)));
  const totalItems = Math.max(1, Math.min(50, Math.floor(Number(items) || 6)));
  const every = Math.max(1, Math.floor(Number(consumeEvery) || 2));

  const empty = new Semaphore(cap);
  const full = new Semaphore(0);
  const mutex = new Mutex();
  const buffer = [];
  const trace = [];

  let produced = 0;
  let consumed = 0;
  let step = 0;
  let blockedItem = null;
  let nextToProduce = 1;

  const snapState = (actor, action) => {
    trace.push({
      step,
      actor,
      action,
      buffer: [...buffer],
      empty: empty.count,
      full: full.count
    });
  };

  while ((produced < totalItems || consumed < totalItems) && step < totalItems * every + cap * 10 + 50) {
    step += 1;

    // 1. Producer step (SOS intake) if not already waiting & more items remain
    if (blockedItem === null && nextToProduce <= totalItems) {
      const label = `SOS-${nextToProduce}`;
      if (empty.wait(`Producer:${label}`)) {
        mutex.lock('Producer');
        buffer.push(label);
        produced += 1;
        nextToProduce += 1;
        mutex.unlock('Producer');
        full.signal();
        snapState('Producer (SOS Intake)', `PRODUCED ${label} into bounded intake buffer`);
      } else {
        blockedItem = label;
        nextToProduce += 1;
        snapState('Producer (SOS Intake)', `BLOCKED waiting on empty semaphore for ${label}`);
      }
    }

    // 2. Consumer step (Dispatcher) every `consumeEvery` steps (and while draining remaining items once producer is done)
    const draining = produced === totalItems && blockedItem === null && buffer.length > 0;
    if ((step % every === 0 || draining) && consumed < totalItems) {
      if (full.wait('Consumer:Dispatcher')) {
        mutex.lock('Consumer');
        const taken = buffer.shift();
        consumed += 1;
        mutex.unlock('Consumer');
        snapState('Consumer (Dispatcher)', `CONSUMED ${taken} for rescue dispatch`);

        const woken = empty.signal();
        if (woken && blockedItem !== null) {
          const item = blockedItem;
          blockedItem = null;
          mutex.lock('Producer');
          buffer.push(item);
          produced += 1;
          mutex.unlock('Producer');
          full.signal();
          snapState('Producer (Woken)', `UNBLOCKED & PRODUCED ${item} after empty.signal()`);
        }
      }
    }
  }

  return {
    capacity: cap,
    items: totalItems,
    produced,
    consumed,
    trace
  };
}

// ============================================================================
// Module G: Smart Resource Selection
// ============================================================================

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const SPECIALTY_RULES = [
  { inc: /(flood|water|boat|river|coastal|inundation)/i, team: /(water|boat|marine|flood|rescue)/i },
  { inc: /(fire|smoke|burn)/i, team: /(fire|hazmat)/i },
  { inc: /(medical|injury|accident|sos|health)/i, team: /(medic|medical|triage|ambulance)/i },
  { inc: /(collapse|quake|landslide|rubble)/i, team: /(search|urban|rescue|structural)/i }
];

function isTeamSuitable(incident, team) {
  const catText = `${incident?.category || ''} ${incident?.type || ''} ${incident?.title || ''}`;
  const teamText = `${team?.specialization || ''} ${team?.name || ''} ${team?.type || ''}`;
  for (const rule of SPECIALTY_RULES) {
    if (rule.inc.test(catText) && rule.team.test(teamText)) {
      return true;
    }
  }
  return false;
}

export function suggestTeams(incident = {}, teams = [], { speedKmh = 40 } = {}) {
  const speed = Math.max(1, Number(speedKmh) || 40);
  const incLat = Number(
    incident?.coordinates?.lat ?? incident?.coordinates?.latitude ?? incident?.lat ?? incident?.latitude
  );
  const incLng = Number(
    incident?.coordinates?.lng ?? incident?.coordinates?.longitude ?? incident?.lng ?? incident?.longitude
  );
  const incHasCoords = Number.isFinite(incLat) && Number.isFinite(incLng);

  const ranked = (teams || [])
    .filter((t) => String(t?.status || '') === 'Available')
    .map((t) => {
      const teamLat = Number(
        t?.latitude ?? t?.lat ?? t?.coordinates?.lat ?? t?.coordinates?.latitude
      );
      const teamLng = Number(
        t?.longitude ?? t?.lng ?? t?.coordinates?.lng ?? t?.coordinates?.longitude
      );
      const hasCoords = incHasCoords && Number.isFinite(teamLat) && Number.isFinite(teamLng);
      const suitable = isTeamSuitable(incident, t);

      let distanceKm = null;
      let etaMinutes = null;
      let score = 9999;

      if (hasCoords) {
        const dist = haversineKm(incLat, incLng, teamLat, teamLng);
        distanceKm = round2(dist);
        etaMinutes = Math.max(1, Math.round((dist / speed) * 60));
        score = round2(dist - (suitable ? 5 : 0));
      }

      return {
        teamId: t.id,
        name: t.name,
        specialization: t.specialization || t.type || 'General',
        distanceKm,
        etaMinutes,
        suitable,
        score
      };
    });

  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const da = a.distanceKm ?? Infinity;
    const db = b.distanceKm ?? Infinity;
    if (da !== db) return da - db;
    return String(a.name).localeCompare(String(b.name));
  });

  return ranked;
}
