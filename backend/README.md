# ResQCore Unified Real-Time Backend

The **ResQCore Real-Time Backend** unifies all three mission-critical operational applications:
1. **Command Center** (`resqcore` - Web React Dashboard)
2. **Citizen App** (`citizen app` - Flutter Mobile App)
3. **Rescue Team Tactical Ops** (`rescue team/RescueApp` - Flutter Mobile App)

---

## 🚀 Quick Start

### Start the Backend
From project root:
```bash
start-backend.bat
```
Or directly using Node:
```bash
cd backend
node server.js
```
Or via npm in `resqcore`:
```bash
cd resqcore
npm run backend
# or
npm run bridge
```

The server binds to `http://0.0.0.0:5000` supporting localhost, emulator (`10.0.2.2`), and local network connections.

---

## 📡 Real-Time Communication Architecture

```
┌─────────────────┐       ┌────────────────────┐       ┌──────────────────┐
│   Citizen App   │       │   Command Center   │       │   Rescue Team    │
│  (Flutter App)  │       │    (React Vite)    │       │  (Flutter App)   │
└────────┬────────┘       └─────────┬──────────┘       └────────┬─────────┘
         │                          │                           │
         │ REST / SOS               │ SSE Stream                │ WebSocket / REST
         │ Auto-poll                │ Real-time Events          │ Real-time Events
         ▼                          ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED RESQCORE BACKEND (Port 5000)                 │
│                                                                         │
│  - EventBus (Dual Fan-out: SSE + RFC 6455 WebSockets)                   │
│  - REST API Gateway (CORS Enabled, Zero External Dependencies)          │
│  - Reactive In-Memory State Store with Disk Persistence (db.json)       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Operational Event Lifecycle

### 1. Citizen Emergency SOS
- Citizen taps **1-Touch SOS** or submits a categorized disaster report.
- Backend receives `POST /api/citizen/sos`.
- **Command Center** receives instant `new_citizen_sos` via SSE stream (displays high-priority toast, adds to active queue & map pin).
- **Rescue Team** receives instant notification via WebSocket (alert in tactical feed).

### 2. Command Center Triage & Dispatch
- Command operator inspects incident and assigns a rescue unit (e.g., `Bravo 02` with `ETA 8 min`).
- Backend receives `POST /api/command/dispatch`.
- **Citizen App** status automatically changes from `Pending` to `Assigned`, displaying: *"Bravo 02 is en route · ETA 8 min"*.
- **Rescue Team App** receives dispatch order in real-time, showing incident in active tactical assignments.

### 3. Tactical Field Updates & Resolution
- Field rescuers update status (`En route` ➔ `On site` ➔ `Resolved`).
- Backend receives `POST /api/incidents/update` or WebSocket message.
- **Command Center** drawer and map marker update to `On site` / `Resolved`.
- **Citizen App** updates to `Resolved / Evacuation completed`.

### 4. Tactical Radio & Communications
- Rescuers send messages or location tags from `TacticalChatScreen`.
- Command operators reply from `CommunicationPage`.
- Messages sync bi-directionally in real-time across WebSockets and SSE.

### 5. Emergency Mass Broadcasts
- Command Center issues evacuation advisories or weather alerts via `POST /api/command/broadcast`.
- Broadcast is fanned out to Citizen App (`Live alerts` tab) and Rescue Team App (tactical banner).

---

## 🛡️ Demo Mode Preservation Guarantee
**Demo Mode in all three apps remains 100% untouched:**
- **Command Center**: Clicking *"Enter Live Demo Mode"* activates simulated timer generating mock Kerala incidents without altering real backend state.
- **Citizen App**: Tapping *"Explore Demo Mode"* enters local simulated session with pre-seeded demo reports.
- **Rescue Team App**: Tapping **1-Tap Demo Personas** (`Commander`, `Medical`, `Civilian`) logs into demo mode offline.
- Real backend integration activates seamlessly when users perform standard authentication or connect live.
