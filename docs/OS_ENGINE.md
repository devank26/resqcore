# ResQCore Operating System Concepts Engine

Every disaster incident in ResQCore competes for scarce ambulances, rescue boats, medical kits, food packets, and rescue teams. The OS engine treats each emergency incident as a **Process Control Block (PCB)** so dispatchers allocate scarce resources safely, avoid starvation, prevent double-dispatching teams, and detect deadlocks before they happen.

---

## OS Concepts & ResQCore Mapping

### 1. Process Control Block (PCB) & Process States
A **Process Control Block (PCB)** tracks an execution unit's identity, state, priority, resource allocation, and timing telemetry throughout its lifecycle. In ResQCore, each SOS or emergency report becomes a live PCB transitioning through **`READY`** (waiting in the intake queue), **`RUNNING`** (dispatched to a field team with allocated resources), and **`TERMINATED`** (incident `Resolved`, resources and team released).

### 2. Bounded Intake Queue & Priority Scheduling with Aging
In an operating system, a **Priority Scheduler with Aging** keeps high-urgency work moving first while gradually boosting waiting low-priority tasks so they never suffer indefinite starvation. ResQCore scores each incident as `Severity (Critical 60 / High 45 / Medium 25 / Low 10) + Category Bonus (+15 medical/collapse/sos/rescue, +10 flood/fire/landslide) + People Bonus` (clamped 0–100) and adds **+20 points every 5 minutes** of waiting in `READY`. When the intake buffer exceeds `queueCapacity = 10`, ResQCore raises `overCapacity = true` without ever dropping a real emergency.

### 3. Banker's Algorithm (Deadlock Avoidance)
**Banker's Algorithm** evaluates whether granting a resource vector keeps the system in a **safe state** where all active and queued processes have at least one completion ordering without exceeding available supply. Before committing a team dispatch to PostgreSQL, ResQCore checks `request <= need <= available` across `[ambulances, boats, medicalKits, foodPacks]`; if no safe sequence exists, the dispatch is rejected with HTTP `409 Conflict` ("Allocation denied") and **nothing is mutated in the database**.

### 4. Team Mutex Locks
A **Mutex (Mutual Exclusion Lock)** ensures only one critical section accesses a shared resource at any moment. Each rescue team owns a mutex lock: assigning a second incident to an already `Deployed` or locked team returns `409 Conflict` (`LOCK_DENIED`), while resolving or reassigning cleanly releases the mutex and sets the team back to `Available`.

### 5. CPU Scheduling Benchmarks (`osAlgorithms`)
Comparative OS schedulers quantify waiting, turnaround, response time, context switches, and deadline adherence on the same workload. ResQCore's **Scheduler Lab** runs six pure algorithms side by side — **FCFS**, **Round Robin (configurable quantum)**, **SRTF (preemptive)**, **EDF (Earliest Deadline First)**, **Priority with Aging**, and **MLFQ (3-level Multi-Level Feedback Queue)** — using live open incidents (`>= 2` required, otherwise labelled `DEMO DATA`).

### 6. Deadlock Detection (Wait-For / Resource Allocation Graph)
Whereas Banker's prevents deadlocks dynamically, **Deadlock Detection** builds directed assignment (`Resource -> Process`) and request (`Process -> Resource`) edges to uncover circular wait cycles among held resources. The Scheduler Lab renders built-in Scenario A (circular wait cycle with suggested lowest-priority preemption victim `INC-FIRE`), Scenario B (safe resolution order), and live snapshot inspection.

### 7. Semaphores & Producer-Consumer Bounded Buffer
Counting **Semaphores** (`empty`, `full`) and a buffer **Mutex** coordinate producers generating SOS packets with dispatchers consuming them under finite capacity. The Scheduler Lab simulates the bounded SOS intake buffer step-by-step and highlights `BLOCKED` steps whenever producers fill the buffer before consumers drain it.

---

## Pure Module Architecture (`backend/services/osEngine/`)

| File | Responsibility |
|---|---|
| `osMonitor.js` | Resource vectors (`ambulances`, `boats`, `medicalKits`, `foodPacks`), priority + aging scoring, priority tiers, Banker's safety engine (`need`, `findSafeSequence`, `requestIsSafe`) |
| `liveOs.js` | Live OS state coordinator (`admit`, `updateFromIncident`, `dispatch`, `assign`, `complete`, `syncFromStore`, `syncTeams`, `setTotals`, `getSnapshot`) |
| `osAlgorithms.js` | Six CPU schedulers (`fcfs`, `roundRobin`, `srtf`, `edf`, `priorityAging`, `mlfq`, `compareSchedulers`), `incidentsToProcesses`, deadlock graph detector, `Semaphore`, `Mutex`, `producerConsumerDemo`, `suggestTeams` |
| `liveAdapter.js` | Pure payload adapters (`mapIncident`, `mapTeam`, `mapResourceRows`), `sanitizeRequestedResources`, `sanitizeOtherNeeds`, polling + reconnect coordinator (`createLiveDataSource`) |
| `runtime.js` | PostgreSQL startup state loader (`initLiveOsFromDb`), OS audit persistence (`os_event_log`), periodic aging broadcast (`OS_LIVE_UPDATED`) |

---

## HTTP & WebSocket API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/os-live` | Current live OS Monitor snapshot (`processes`, `readyQueue`, `runningPids`, `banker`, `teams`, `metrics`, `events`) |
| `POST` | `/api/os-live/resources` | Update resource pool totals (e.g. `{"ambulances": 2}`), returns `400` on invalid numbers or `409` if lower than allocated |
| `GET` | `/api/os-algo/schedulers?source=live\|demo&quantum=4` | Run and compare all 6 schedulers on live incidents (`>=2` open) or demo workload |
| `POST` | `/api/os-algo/schedulers` | Run comparison on custom `{ processes: [...], quantum }` (1–50 processes) |
| `GET` | `/api/os-algo/deadlock` | Built-in Scenarios A & B + live Resource Allocation Graph detection |
| `GET` | `/api/os-algo/semaphore-demo?capacity=3&items=6` | Deterministic bounded-buffer producer-consumer trace |
| `GET` | `/api/incidents/:id/suggest-team` | Rank `Available` teams by Haversine distance + `-5 km` disaster specialty bonus |
| `WS` | `/ws?token=...` | Emits `{ "type": "OS_LIVE_UPDATED", "data": <snapshot> }` after SOS intake, verification, dispatch, pool change, or resolve |

---

## Live Demonstration Walkthrough

1. **Admit 3 Incidents of Different Severity:** Submit Low, High, and Critical incidents (via Citizen App or `/api/citizen/sos`). Open **OS Monitor** — watch the `READY` queue sort immediately by `effectiveScore` (`Critical > High > Low`) without refreshing, and observe wait seconds + `+20` aging boost after 5 minutes.
2. **Assign a Team (Safe Allocation):** Verify and dispatch an `Available` team to one Critical incident. Available counts in the **Banker's** panel drop immediately, the process moves to `RUNNING` with allocated vector, its assigned team displays `LOCKED`, and PostgreSQL `resources` / `resource_allocations` update in parallel.
3. **Demonstrate Banker's Denial:** In the **Modify Resource Pool** form on OS Monitor, lower `Ambulances` to equal just enough for currently running incidents (or `2`), then attempt to verify and dispatch another incident requesting 2 ambulances. Dispatch is refused (`409 Allocation denied`) with exact Banker reason shown in `lastRequest` and Audit Log while database tables stay unchanged.
4. **Resolve the Running Incident:** Mark the running incident **Resolved** in the Incident drawer. Both its allocated resources and locked team return to `Available`, its PCB enters `TERMINATED`, and the waiting/running Gantt bar finishes.
5. **Explore Scheduler Lab:** Open **Scheduler Lab**, compare all 6 schedulers (`LIVE` or `DEMO` with `quantum = 4`), inspect colour-coded CSS Gantt charts with grey idle blocks, inspect Deadlock Scenario A's circular cycle and victim (`INC-FIRE`), inspect `BLOCKED` steps in the Semaphore Producer-Consumer table, and test **Smart Team Selection** for any open incident.
