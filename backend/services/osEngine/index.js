import { checkBankersSafety } from './banker.js';

export { checkBankersSafety };

const SEVERITY_WEIGHT = {
  Critical: 70,
  High: 50,
  Medium: 30,
  Low: 10
};

const CATEGORY_WEIGHT = {
  sos: 15,
  rescue: 15,
  medical: 15,
  collapse: 15,
  earthquake: 15,
  flood: 10,
  fire: 10,
  landslide: 10
};

export function computePriority({ severity = 'High', category = 'General', affected = 1 } = {}) {
  const sev = SEVERITY_WEIGHT[severity] ?? 30;
  const catKey = String(category || '').toLowerCase();
  let cat = 0;
  for (const [k, w] of Object.entries(CATEGORY_WEIGHT)) {
    if (catKey.includes(k)) {
      cat = Math.max(cat, w);
    }
  }
  const aff = Math.min(20, Math.floor(Math.log2(Math.max(1, Number(affected) || 1)) * 4));
  return sev + cat + aff;
}

export class OSEngine {
  constructor({ queueCapacity = 10, agingIntervalMs = 30_000 } = {}) {
    this.queueCapacity = queueCapacity;
    this.agingIntervalMs = agingIntervalMs;
    this.pcbs = new Map(); // pid -> PCB
    this.intakeQueue = []; // array of pids in READY state
    this.teamMutexes = new Map(); // teamId -> pid
    this.preemptions = 0;
    this.totalAdmitted = 0;
    this.totalRejected = 0;
    this._agingTimer = null;
  }

  startAgingTimer(onAged) {
    if (this._agingTimer) return;
    this._agingTimer = setInterval(() => {
      const changed = this.applyAging(Date.now());
      if (changed > 0 && typeof onAged === 'function') onAged(this.getState());
    }, this.agingIntervalMs);
    this._agingTimer.unref?.();
  }

  stopAgingTimer() {
    if (this._agingTimer) {
      clearInterval(this._agingTimer);
      this._agingTimer = null;
    }
  }

  _sortIntakeQueue() {
    this.intakeQueue.sort((aId, bId) => {
      const a = this.pcbs.get(aId);
      const b = this.pcbs.get(bId);
      if (!a || !b) return 0;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.arrivalTime - b.arrivalTime;
    });
  }

  /**
   * Admits an incident as a PCB into the bounded READY intake queue.
   * Cap = 10: Critical incidents replace the lowest-priority queued item;
   * lower-priority requests when full receive { accepted: false, status: 429, retryAfter }.
   */
  admitIncident(incident, now = Date.now()) {
    const pid = incident.id;
    if (this.pcbs.has(pid)) {
      return { accepted: true, duplicate: true, pcb: this.pcbs.get(pid) };
    }

    const severity = incident.severity || 'High';
    const category = incident.type || incident.category || 'General';
    const affected = Number(incident.affected || 1);
    const basePriority = computePriority({ severity, category, affected });

    let evictedPid = null;
    if (this.intakeQueue.length >= this.queueCapacity) {
      this._sortIntakeQueue();
      const lowestPid = this.intakeQueue[this.intakeQueue.length - 1];
      const lowestPcb = this.pcbs.get(lowestPid);

      if (severity === 'Critical' && lowestPcb && basePriority > lowestPcb.priority) {
        this.intakeQueue.pop();
        lowestPcb.state = 'TERMINATED';
        lowestPcb.completionTime = now;
        evictedPid = lowestPid;
      } else {
        this.totalRejected += 1;
        return {
          accepted: false,
          status: 429,
          retryAfter: 30,
          error: 'Intake queue is at capacity; retry later'
        };
      }
    }

    const pcb = {
      pid,
      title: incident.title || pid,
      state: 'READY',
      severity,
      category,
      affected,
      basePriority,
      priority: basePriority,
      ageTicks: 0,
      preemptedCount: 0,
      assignedTeamId: null,
      arrivalTime: now,
      readyTime: now,
      startTime: null,
      completionTime: null,
      lastAgedAt: now,
      waitTimeMs: 0,
      turnaroundTimeMs: null,
      responseTimeMs: null
    };

    this.pcbs.set(pid, pcb);
    this.intakeQueue.push(pid);
    this._sortIntakeQueue();
    this.totalAdmitted += 1;

    return { accepted: true, duplicate: false, evictedPid, pcb };
  }

  /** Priority aging: +1 priority per 30s spent in READY or WAITING. */
  applyAging(now = Date.now()) {
    let changed = 0;
    for (const pcb of this.pcbs.values()) {
      if (pcb.state !== 'READY' && pcb.state !== 'WAITING') continue;
      const elapsed = now - pcb.lastAgedAt;
      if (elapsed >= this.agingIntervalMs) {
        const ticks = Math.floor(elapsed / this.agingIntervalMs);
        pcb.ageTicks += ticks;
        pcb.priority = pcb.basePriority + pcb.ageTicks;
        pcb.lastAgedAt += ticks * this.agingIntervalMs;
        changed += 1;
      }
    }
    if (changed > 0) this._sortIntakeQueue();
    return changed;
  }

  /** Returns the highest-priority READY PCB without removing it. */
  peekNextReady() {
    this._sortIntakeQueue();
    const pid = this.intakeQueue[0];
    return pid ? this.pcbs.get(pid) : null;
  }

  /** Team mutex: ensures only one incident holds a team lock at any time. */
  acquireTeamMutex(teamId, incidentId) {
    const holder = this.teamMutexes.get(teamId);
    if (holder && holder !== incidentId) {
      throw new Error(`team_locked: ${teamId} is locked by ${holder}`);
    }
    this.teamMutexes.set(teamId, incidentId);
    return true;
  }

  releaseTeamMutex(teamId, incidentId) {
    if (!teamId) return false;
    const holder = this.teamMutexes.get(teamId);
    if (!holder || (incidentId && holder !== incidentId)) return false;
    this.teamMutexes.delete(teamId);
    return true;
  }

  /**
   * Dispatches an incident PCB to RUNNING on `teamId`, acquiring its team mutex
   * and recording priority preemption if a lower-priority incident is currently RUNNING.
   */
  dispatchPcb(incident, teamId, now = Date.now()) {
    const pid = typeof incident === 'string' ? incident : incident.id;
    this.acquireTeamMutex(teamId, pid);

    if (!this.pcbs.has(pid) && typeof incident === 'object') {
      this.admitIncident(incident, now);
    }
    const pcb = this.pcbs.get(pid);
    if (!pcb) return null;

    // Priority-preemptive check against lower-priority RUNNING PCBs
    for (const other of this.pcbs.values()) {
      if (other.pid !== pid && other.state === 'RUNNING' && pcb.priority > other.priority) {
        other.preemptedCount += 1;
        this.preemptions += 1;
      }
    }

    this.intakeQueue = this.intakeQueue.filter((id) => id !== pid);
    pcb.state = 'RUNNING';
    pcb.assignedTeamId = teamId;
    if (pcb.startTime === null) {
      pcb.startTime = now;
      pcb.responseTimeMs = now - pcb.arrivalTime;
      pcb.waitTimeMs = now - pcb.readyTime;
    }
    return pcb;
  }

  completePcb(incidentId, now = Date.now()) {
    const pcb = this.pcbs.get(incidentId);
    if (!pcb) return null;
    if (pcb.assignedTeamId) {
      this.releaseTeamMutex(pcb.assignedTeamId, incidentId);
    }
    pcb.state = 'TERMINATED';
    pcb.completionTime = now;
    pcb.turnaroundTimeMs = now - pcb.arrivalTime;
    if (pcb.startTime === null) {
      pcb.waitTimeMs = now - pcb.readyTime;
      pcb.responseTimeMs = pcb.turnaroundTimeMs;
    }
    this.intakeQueue = this.intakeQueue.filter((id) => id !== incidentId);
    return pcb;
  }

  getMetrics() {
    const all = [...this.pcbs.values()];
    const terminated = all.filter((p) => p.state === 'TERMINATED' && p.turnaroundTimeMs != null);
    const responded = all.filter((p) => p.responseTimeMs != null);
    const avg = (arr, fn) => (arr.length ? Math.round(arr.reduce((s, x) => s + fn(x), 0) / arr.length) : 0);

    return {
      totalAdmitted: this.totalAdmitted,
      totalRejected: this.totalRejected,
      readyCount: this.intakeQueue.length,
      runningCount: all.filter((p) => p.state === 'RUNNING').length,
      terminatedCount: all.filter((p) => p.state === 'TERMINATED').length,
      queueCapacity: this.queueCapacity,
      preemptions: this.preemptions,
      avgWaitingTimeMs: avg(responded, (p) => p.waitTimeMs),
      avgResponseTimeMs: avg(responded, (p) => p.responseTimeMs),
      avgTurnaroundTimeMs: avg(terminated, (p) => p.turnaroundTimeMs)
    };
  }

  getState() {
    this._sortIntakeQueue();
    return {
      metrics: this.getMetrics(),
      readyQueue: this.intakeQueue.map((id) => this.pcbs.get(id)).filter(Boolean),
      running: [...this.pcbs.values()].filter((p) => p.state === 'RUNNING'),
      mutexes: Object.fromEntries(this.teamMutexes.entries()),
      pcbs: [...this.pcbs.values()]
    };
  }
}

export const osEngine = new OSEngine();
