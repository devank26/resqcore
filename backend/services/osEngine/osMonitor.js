/**
 * ResQCore OS Concepts Engine — Module A (Priority Scoring with Aging) & Module B (Banker's Algorithm)
 * Pure, dependency-free module (no DB, no HTTP).
 */

export const RESOURCE_KEYS = ['ambulances', 'boats', 'medicalKits', 'foodPacks'];

export const RESOURCE_LABELS = {
  ambulances: 'Ambulances',
  boats: 'Boats',
  medicalKits: 'Medical kits',
  foodPacks: 'Food packs'
};

export const DEFAULT_POOL = Object.freeze({
  ambulances: 10,
  boats: 5,
  medicalKits: 100,
  foodPacks: 500
});

export const PRIORITY_SCORES = Object.freeze({
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
  minor: 25,
  info: 20
});

export const CATEGORY_BONUS = Object.freeze({
  fire: 10,
  medical: 8,
  rescue: 8,
  flood: 5
});

export const AGING_INTERVAL = 5 * 60 * 1000; // 5 minutes
export const AGING_STEP_BOOST = 20;
export const QUEUE_CAPACITY = 10;

// ---- 4-Resource Vector Helpers ---------------------------------------------

export function emptyVector() {
  return { ambulances: 0, boats: 0, medicalKits: 0, foodPacks: 0 };
}

export function normalizeVector(raw = {}) {
  const out = emptyVector();
  if (!raw || typeof raw !== 'object') return out;
  for (const key of RESOURCE_KEYS) {
    const n = Number(raw[key] ?? 0);
    out[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return out;
}

export function cloneVector(vec = {}) {
  return normalizeVector(vec);
}

export function addVectors(a = {}, b = {}) {
  const va = normalizeVector(a);
  const vb = normalizeVector(b);
  const out = emptyVector();
  for (const key of RESOURCE_KEYS) {
    out[key] = va[key] + vb[key];
  }
  return out;
}

export function subtractVectors(a = {}, b = {}) {
  const va = normalizeVector(a);
  const vb = normalizeVector(b);
  const out = emptyVector();
  for (const key of RESOURCE_KEYS) {
    out[key] = Math.max(0, va[key] - vb[key]);
  }
  return out;
}

/** True when every key of `a` is <= the corresponding key of `b`. */
export function fits(a = {}, b = {}) {
  const va = normalizeVector(a);
  const vb = normalizeVector(b);
  for (const key of RESOURCE_KEYS) {
    if (va[key] > vb[key]) return false;
  }
  return true;
}

// ---- Module A: Priority Scoring with Aging ---------------------------------

export function resolveCategoryBonus(category) {
  const text = String(category || '').toLowerCase();
  if (!text) return 0;
  if (Object.prototype.hasOwnProperty.call(CATEGORY_BONUS, text)) {
    return CATEGORY_BONUS[text];
  }
  let best = 0;
  for (const [key, bonus] of Object.entries(CATEGORY_BONUS)) {
    if (text.includes(key)) {
      best = Math.max(best, bonus);
    }
  }
  return best;
}

export function computePriority({ severity = 'low', category = '', affected = 0 } = {}) {
  const sevKey = String(severity || '').trim().toLowerCase();
  const severityScore = PRIORITY_SCORES[sevKey] ?? PRIORITY_SCORES.low;
  const categoryBonus = resolveCategoryBonus(category);
  const peopleCount = Math.max(0, Number(affected) || 0);
  const peopleScore = Math.min(15, Math.floor(peopleCount / 10));
  return Math.min(100, severityScore + categoryBonus + peopleScore);
}

export function classifyTier(score) {
  if (score >= 80) return 'Immediate';
  if (score >= 50) return 'Delayed';
  return 'Minor';
}

export function scoreIncident(incidentOrPcb, now = Date.now()) {
  const basePriority = Number.isFinite(incidentOrPcb.basePriority)
    ? incidentOrPcb.basePriority
    : computePriority({
        severity: incidentOrPcb.severity,
        category: incidentOrPcb.category || incidentOrPcb.type,
        affected: incidentOrPcb.affected ?? incidentOrPcb.affectedCount
      });

  const arrivalTime = Number.isFinite(incidentOrPcb.arrivalTime) ? incidentOrPcb.arrivalTime : now;
  const stopAt =
    incidentOrPcb.state === 'RUNNING' || incidentOrPcb.state === 'TERMINATED'
      ? (incidentOrPcb.dispatchedAt ?? incidentOrPcb.completedAt ?? now)
      : now;

  const waitingMs = Math.max(0, stopAt - arrivalTime);
  const agingBoost = Math.floor(waitingMs / AGING_INTERVAL) * AGING_STEP_BOOST;
  const effectiveScore = Math.min(100, basePriority + agingBoost);
  const priorityTier = classifyTier(effectiveScore);
  const waitTimeSeconds = Math.floor(waitingMs / 1000);

  return {
    basePriority,
    agingBoost,
    effectiveScore,
    priorityTier,
    waitTimeSeconds,
    waitingMs
  };
}

// ---- Module B: Banker's Algorithm ------------------------------------------

export function need(process) {
  return subtractVectors(process?.maximum, process?.allocation);
}

export function findSafeSequence(processes = [], available = {}) {
  const work = normalizeVector(available);
  const finished = new Array(processes.length).fill(false);
  const sequence = [];

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let i = 0; i < processes.length; i += 1) {
      if (finished[i]) continue;
      const proc = processes[i];
      const procNeed = need(proc);
      if (fits(procNeed, work)) {
        const alloc = normalizeVector(proc.allocation);
        for (const key of RESOURCE_KEYS) {
          work[key] += alloc[key];
        }
        finished[i] = true;
        sequence.push(proc.pid);
        progressed = true;
      }
    }
  }

  const blocked = [];
  for (let i = 0; i < processes.length; i += 1) {
    if (!finished[i]) blocked.push(processes[i].pid);
  }

  return {
    safe: blocked.length === 0,
    sequence,
    blocked
  };
}

export function requestIsSafe(view, pid, request = {}) {
  if (!view || !Array.isArray(view.processes)) {
    return { granted: false, reason: `Process ${pid} not found.` };
  }

  const targetIdx = view.processes.findIndex((p) => p.pid === pid);
  if (targetIdx === -1) {
    return { granted: false, reason: `Process ${pid} not found.` };
  }

  const req = normalizeVector(request);
  const avail = normalizeVector(view.available);
  const target = view.processes[targetIdx];
  const procNeed = need(target);

  // 2. request <= need
  if (!fits(req, procNeed)) {
    return {
      granted: false,
      reason: 'Request exceeds this process maximum need.'
    };
  }

  // 3. request <= available
  const shortages = [];
  for (const key of RESOURCE_KEYS) {
    if (req[key] > avail[key]) {
      shortages.push(`${RESOURCE_LABELS[key]}: requested ${req[key]}, available ${avail[key]}`);
    }
  }
  if (shortages.length > 0) {
    return {
      granted: false,
      reason: `Insufficient available resources (${shortages.join(', ')}).`
    };
  }

  // 4. Tentatively allocate on a COPY and check safe sequence
  const simAvailable = subtractVectors(avail, req);
  const simProcesses = view.processes.map((p, idx) => ({
    pid: p.pid,
    maximum: normalizeVector(p.maximum),
    allocation: idx === targetIdx ? addVectors(p.allocation, req) : normalizeVector(p.allocation)
  }));

  const safety = findSafeSequence(simProcesses, simAvailable);
  if (!safety.safe) {
    return {
      granted: false,
      reason: `Request denied: the tentative allocation leaves no safe sequence; blocked: ${safety.blocked.join(', ')}.`
    };
  }

  // 5. Commit onto view
  view.processes[targetIdx].allocation = addVectors(target.allocation, req);
  view.available = simAvailable;

  return {
    granted: true,
    reason: 'Safe state preserved.',
    safeSequence: safety.sequence
  };
}
