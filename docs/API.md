# ResQCore Backend API Reference (v3.0.0)

Base HTTP URL: `http://<host>:<PORT>` (default `PORT=5000`)  
SSE Stream: `GET /api/stream`  
WebSocket Endpoint: `ws://<host>:<PORT>/ws`

All endpoints, SSE streams, and WebSocket connections **require authentication** unless explicitly marked **Public**.

---

## 1. Environment Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `5000` | HTTP/WS listen port. |
| `DB_PATH` | `./data/resqcore.db` | SQLite database file path (mount persistent volume here). |
| `JWT_SECRET` | Ephemeral in dev; **required in prod** | Secret for HS256 JWT signing (`>=32` bytes recommended). |
| `TOKEN_TTL_SECONDS` | `43200` (12h) | JWT access token lifetime in seconds. |
| `ALLOWED_ORIGINS` | Dev localhost defaults (`5173`, `5000`) | Comma-separated list of allowed CORS & WS origins (or `*`). Empty in prod = same-origin only. |
| `COMMAND_INVITE_CODE` | Open in dev; **required for `command` register in prod** | Invite code required to register a `command` user. |
| `RESCUE_INVITE_CODE` | Open in dev; **required for `rescue` register in prod** | Invite code required to register a `rescue` user. |
| `STATIC_DIR` | Auto-detect `../resqcore/dist` | Directory of built Command Center SPA assets (with `index.html` fallback). |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy to read `X-Forwarded-For` for rate limiting. |
| `SOS_LIMIT_PER_10_MIN` | `10` | Citizen SOS creation rate limit per user per 10 minutes. |

---

## 2. Authentication & Roles

Roles: `command` | `rescue` | `citizen`

### Supplying the JWT
- **REST endpoints:** `Authorization: Bearer <token>`
- **SSE (`GET /api/stream`) & WebSocket (`GET /ws`):** `Authorization: Bearer <token>` header **or** `?token=<token>` query parameter (browsers cannot set custom headers on `EventSource` or `WebSocket`).

### Error Envelope
All errors return JSON:
```json
{ "success": false, "error": "Human-readable message" }
```
Common status codes: `400` (validation/bad JSON), `401` (missing/invalid/expired token or bad credentials), `403` (role/ownership forbidden or CORS/WS origin rejected), `404` (not found or hidden from citizen), `405` (wrong HTTP method), `409` (duplicate user/team/id), `429` (rate limited).

### Auth Endpoints

#### `GET /api/health` — **Public**
Health check (also verifies SQLite connectivity).  
Response `200`:
```json
{
  "success": true,
  "status": "online",
  "service": "ResQCore Unified Real-Time Backend",
  "version": "3.0.0",
  "timestamp": "2026-11-15T12:00:00.000Z"
}
```

#### `POST /api/auth/register` — **Public**
Creates a user account (`scrypt` password hash) and issues a JWT. If `role === "rescue"`, automatically provisions or joins a rescue team and returns `teamId` and `team`.

Request body:
```json
{
  "name": "Capt. Rajesh Negi",
  "email": "rajesh@example.com",
  "phone": "+91 98470 21836",
  "password": "StrongPassword!1",
  "role": "citizen | rescue | command",
  "inviteCode": "required for command/rescue when configured",
  "teamId": "optional (rescue only) — join existing team",
  "teamName": "optional (rescue only) — create team name (defaults to '<name> Unit')",
  "callsign": "optional (rescue only)",
  "specialization": "optional (rescue only)",
  "responders": 4
}
```
Notes:
- At least one of `email` or `phone` is required.
- `password` must be `8..128` characters.

Response `201`:
```json
{
  "success": true,
  "token": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": 43200,
  "expiresAt": "2026-11-16T00:00:00.000Z",
  "user": {
    "id": "usr-...",
    "name": "Capt. Rajesh Negi",
    "email": "rajesh@example.com",
    "phone": "+919847021836",
    "role": "rescue",
    "teamId": "team-...",
    "createdAt": "..."
  },
  "teamId": "team-...",
  "team": { "id": "team-...", "name": "Alpha 01", "status": "Standby", "..." : "..." }
}
```
(`teamId` is `null` and `team` is `null` for `command` and `citizen` roles.)

#### `POST /api/auth/login` — **Public**
Authenticates with email or phone (`identifier`, `email`, `phone`, or `username`) + `password`. Rate-limited (10 failed attempts / 15 min per IP + identifier). If `role === "rescue"` and no team is attached yet, provisions one; otherwise returns the existing `teamId` and `team`.

Request body:
```json
{
  "identifier": "rajesh@example.com",
  "password": "StrongPassword!1"
}
```
Response `200`: Same shape as `POST /api/auth/register`.

#### `GET /api/auth/me` — **Any authenticated role**
Returns the current user profile, `teamId`, and `team` (if `rescue`).

Response `200`:
```json
{ "success": true, "user": { "..." : "..." }, "teamId": "team-... | null", "team": { "..." : "..." } }
```

---

## 3. REST Endpoints

### Citizen SOS & Tracking

#### `POST /api/citizen/sos` — **Role: `citizen`**
Creates a citizen SOS incident owned by the authenticated user (`citizenUserId = user.id`).
- Supports idempotent client `id` (`6..64` chars `[A-Za-z0-9_-]`): retrying with the same `id` by the same user returns `200` with `duplicate: true`; another user using the same `id` receives `409`.
- Coordinates (`coordinates: { lat, lng }` or `lat`/`lng`) are optional; if omitted, no fake GPS coordinates are fabricated.

Request body:
```json
{
  "id": "optional-client-id",
  "title": "Flash Flood Rescue",
  "type": "Flood",
  "location": "Fort Kochi Boat Jetty",
  "fullAddress": "Plot 12, Ferry Road, Fort Kochi",
  "description": "4 civilians trapped on rooftop",
  "contactNumber": "+91 98470 21836",
  "citizenName": "Devank",
  "severity": "Critical | High | Medium | Low",
  "affected": 4,
  "coordinates": { "lat": 9.9658, "lng": 76.2421 }
}
```
Response `201` (or `200` on idempotent retry):
```json
{ "success": true, "duplicate": false, "incident": { "..." : "..." }, "request": { "..." : "..." } }
```

#### `GET /api/citizen/status/:id` — **Any authenticated role**
Fetches a single incident. Citizens can **only** read incidents they created (`404` otherwise).  
Response `200`: `{ "success": true, "request": { ... }, "incident": { ... } }`

#### `GET /api/citizen/requests` and `GET /api/citizen/my-requests` — **Any authenticated role**
- `citizen`: returns only the caller's own requests.
- `command` / `rescue`: returns all citizen SOS requests (optional `?phone=` filter).  
Response `200`: `{ "success": true, "count": 1, "requests": [ ... ] }`

---

### Incidents (`command` & `rescue`)

#### `GET /api/incidents` — **Roles: `command`, `rescue`**
Lists all incidents. Optional query: `?status=Unverified|Verified|Responding|On site|Monitoring|Escalated|Resolved`.  
Response `200`: `{ "success": true, "count": N, "incidents": [ ... ] }`

#### `GET /api/incidents/:id` — **Roles: `command`, `rescue`**
Fetches a single incident by ID.  
Response `200`: `{ "success": true, "incident": { ... } }`

#### `POST /api/incidents/update` — **Roles: `command`, `rescue`**
Updates incident status and/or notes.
- `rescue` can **only** update incidents assigned to `user.teamId` (`403` otherwise), and only to: `Responding`, `On site`, `Monitoring`, `Escalated`, or `Resolved`.
- Resolving a team's last active incident automatically returns the team's status to `Standby`.

Request body:
```json
{
  "incidentId": "RQ-261115-XXXXX",
  "status": "On site",
  "notes": "Arrived on scene",
  "eta": "optional"
}
```
Response `200`: `{ "success": true, "incident": { ... } }`

#### `POST /api/incidents/report` — **Roles: `command`, `rescue`**
Files a new field incident. For `rescue`, automatically attributes the incident to `user.teamId` (any client-supplied team field is ignored).

Request body:
```json
{
  "title": "Bridge Collapse",
  "type": "Structural",
  "location": "Sector 02 Bridge",
  "description": "Main span cracked",
  "severity": "High",
  "affected": 12,
  "coordinates": { "lat": 9.97, "lng": 76.25 }
}
```
Response `201`: `{ "success": true, "incident": { ... } }`

---

### Command Operations (`command` only)

#### `POST /api/command/dispatch` — **Role: `command`**
Dispatches a real registered rescue team to an incident (`404` if team or incident does not exist; `409` if already `Resolved`).

Request body:
```json
{
  "incidentId": "RQ-261115-XXXXX",
  "teamId": "team-...",
  "teamName": "optional alternative to teamId",
  "eta": "5 min",
  "notes": "Speedboat unit deployed"
}
```
Response `200`: `{ "success": true, "incident": { ... }, "request": { ... }, "team": { ... } }`

#### `POST /api/command/verify` — **Role: `command`**
Verifies an `Unverified` incident (`status -> "Verified"`).  
Request body: `{ "incidentId": "RQ-261115-XXXXX" }`  
Response `200`: `{ "success": true, "incident": { ... } }`

#### `POST /api/command/broadcast` — **Role: `command`**
Issues an emergency broadcast alert.

Request body:
```json
{
  "title": "Command Emergency Broadcast",
  "message": "High tide alert until 18:00 IST.",
  "severity": "Critical | High | Medium | Low",
  "audience": "all | citizens | rescue",
  "recipients": "Sector 04 Residents & Units"
}
```
Response `201`: `{ "success": true, "alert": { ... } }`

---

### Rescue Teams, Telemetry & Rescue SOS

#### `GET /api/teams` — **Roles: `command`, `rescue`**
Lists all registered rescue teams (no mock teams exist on a fresh database).  
Response `200`: `{ "success": true, "teams": [ ... ] }`

#### `POST /api/teams/telemetry` — **Role: `rescue`**
Posts GPS & device telemetry for the caller's own `user.teamId` (`403` if body specifies a different `teamId`).

Request body:
```json
{
  "lat": 9.9659,
  "lng": 76.2423,
  "battery": 94,
  "status": "Standby | Deployed | Returning | Offline",
  "signal": "4G",
  "altitude": 12,
  "speed": 28,
  "heading": 145
}
```
Response `200`: `{ "success": true, "team": { ... } }`

#### `POST /api/teams/status` — **Role: `rescue`**
Updates the caller's own team operational status (`Standby`, `Deployed`, `Returning`, `Offline`).  
Request body: `{ "status": "Deployed" }`  
Response `200`: `{ "success": true, "team": { ... } }`

#### `POST /api/teams/sos` — **Role: `rescue`**
Triggers a critical rescue-unit SOS for the caller's `user.teamId`, creating both a critical incident and an active SOS event.  
Request body: `{ "coordinates": { "lat": 9.96, "lng": 76.24 }, "location": "...", "notes": "Unit trapped", "battery": 18 }`  
Response `201`: `{ "success": true, "incident": { ... }, "sosEvent": { ... } }`

#### `GET /api/telemetry/live` — **Roles: `command`, `rescue`**
Returns latest telemetry snapshot per team.  
Response `200`: `{ "success": true, "telemetry": [ ... ] }`

#### `GET /api/telemetry/history/:teamId` — **Roles: `command`, `rescue`**
Returns telemetry history for `:teamId` (query `?limit=100`, max `500`).  
Response `200`: `{ "success": true, "teamId": "team-...", "history": [ ... ] }`

#### `GET /api/sos/active` — **Roles: `command`, `rescue`**
Lists active rescue-team SOS events.  
Response `200`: `{ "success": true, "count": N, "events": [ ... ] }`

#### `POST /api/sos/resolve/:id` — **Role: `command`**
Resolves an active rescue-team SOS event.  
Response `200`: `{ "success": true, "event": { ... } }`

---

### Tactical Chat (`command` & `rescue`)

#### `GET /api/chat/messages` — **Roles: `command`, `rescue`**
Query params: `?channel=all|<channelName>&limit=100&since=<isoTimestamp>`.  
Private team channels (`team-<teamId>`) are visible only to `command` and members of `<teamId>`.  
Response `200`:
- When `channel=all` (default): `{ "success": true, "messages": { "command-net": [ ... ], ... } }`
- When `channel=<name>`: `{ "success": true, "messages": [ ... ] }`

#### `POST /api/chat/send` — **Roles: `command`, `rescue`**
Sends a chat message. Sender identity (`sender`, `senderId`, `senderRole`) is derived strictly from the JWT. Default channel is `command-net`. Rescue users cannot post to another team's `team-<otherId>` channel (`403`).

Request body:
```json
{
  "id": "optional-client-msg-id",
  "channel": "command-net",
  "text": "Civilians secured on speedboat.",
  "locationTag": "optional",
  "isAlert": false
}
```
Response `201` (or `200` on idempotent retry): `{ "success": true, "channel": "command-net", "message": { ... }, "duplicate": false }`

---

### Alerts, Shelters, Sectors, Volunteers & Diagnostics

#### `GET /api/alerts` — **Any authenticated role**
Lists broadcast alerts filtered by role (`citizen` sees `all` + `citizens`; `rescue` sees `all` + `rescue`; `command` sees all).  
Response `200`: `{ "success": true, "alerts": [ ... ] }`

#### `GET /api/shelters` — **Any authenticated role**
Lists reference shelters.  
Response `200`: `{ "success": true, "shelters": [ ... ] }`

#### `POST /api/shelters/update` — **Role: `command`**
Updates shelter occupancy/status.  
Request body: `{ "shelterId": "sh-1", "occupied": 120, "status": "Open | Near Full | Full | Closed" }`  
Response `200`: `{ "success": true, "shelter": { ... } }`

#### `GET /api/sectors` — **Any authenticated role**
Lists reference sectors (optional `?theater=<name>`).  
Response `200`: `{ "success": true, "count": N, "sectors": [ ... ] }`

#### `GET /api/sectors/:id` — **Any authenticated role**
Returns sector details. For `command` and `rescue`, also includes `incidents` and `teams` inside that sector.  
Response `200`: `{ "success": true, "sector": { ... }, "incidents": [...], "teams": [...] }`

#### `PUT /api/sectors/:id` and `POST /api/sectors/:id` — **Role: `command`**
Updates sector status/notes/severity.  
Response `200`: `{ "success": true, "sector": { ... } }`

#### `GET /api/volunteers` — **Roles: `command`, `rescue`**
Lists registered volunteers (optional `?sector_id=` or `?status=`).  
Response `200`: `{ "success": true, "count": N, "volunteers": [ ... ] }`

#### `POST /api/volunteers/register` — **Any authenticated role**
Registers or updates the authenticated user's volunteer profile.  
Request body: `{ "skills": ["First Aid"], "sectorId": "SEC-1", "availability": "Immediate", "coordinates": { "lat": ..., "lng": ... } }`  
Response `201`: `{ "success": true, "volunteer": { ... } }`

#### `PUT /api/volunteers/:id` — **Any authenticated role**
Updates a volunteer's status/sector/availability (allowed for the owning user or staff).  
Response `200`: `{ "success": true, "volunteer": { ... } }`

#### `GET /api/database/stats` — **Role: `command`**
Returns SQLite table counts and DB metadata.  
Response `200`: `{ "success": true, "database": { ... } }`

---

## 4. Real-Time Events (SSE & WebSocket)

### Connection & Visibility Rules
- **SSE (`GET /api/stream`)**: Emits `data: {"type":"connected", ...}` on open and `: ping` every 25s. Closes with `event: token_expired` when the JWT expires.
- **WebSocket (`ws://<host>/ws`)**: Authenticates on HTTP upgrade (`401` on invalid/missing token, `403` on disallowed `Origin`). Sends `{"event":"connected","data":{"userId","role","teamId","service","time"}}` on connect. Automatically disconnects with `{"event":"token_expired",...}` when the JWT expires.
- **Role-based event filtering (`projectForViewer`)**:
  - `command`: receives all events.
  - `rescue`: receives all events **except** `emergency_broadcast` with `audience === "citizens"` and `new_chat_message` on another team's `team-<id>` channel.
  - `citizen`: receives **only** `emergency_broadcast` (`audience` in `["all", "citizens"]`) and `new_citizen_sos`, `incident_assigned` (with `team` details stripped), `incident_verified`, `incident_status_changed` for their **own** `citizenUserId`.

### Server-to-Client Event Names
| Event Name | Trigger | Payload Summary |
| --- | --- | --- |
| `connected` | Stream/WS open | `{ userId, role, teamId, service, time }` |
| `token_expired` | JWT expires while connected | `{ message }` |
| `team_registered` | Rescue user provisions new team | `{ team }` |
| `new_citizen_sos` | `POST /api/citizen/sos` | Full `incident` object |
| `incident_assigned` | `POST /api/command/dispatch` | `{ incidentId, incident, citizenUserId, teamId, teamName, eta, dispatchUpdate, team }` (`team` stripped for citizens) |
| `incident_verified` | `POST /api/command/verify` | `{ incidentId, incident, citizenUserId }` |
| `incident_status_changed` | `POST /api/incidents/update` or WS `update_status` | `{ incidentId, status, incident, citizenUserId }` |
| `incident_reported` | `POST /api/incidents/report` | Full `incident` object |
| `new_rescue_sos` | `POST /api/teams/sos` or WS `sos` | `{ incident, sosEvent, team }` |
| `sos_resolved` | `POST /api/sos/resolve/:id` | `{ sosEvent }` |
| `team_telemetry_update` | `POST /api/teams/telemetry`, `/api/teams/status`, dispatch, resolve, WS `telemetry` | `{ teamId, team }` |
| `new_chat_message` | `POST /api/chat/send` or WS `chat_message` | `{ channel, message }` |
| `emergency_broadcast` | `POST /api/command/broadcast` | `{ alert, message, severity, recipients }` |
| `shelter_updated` | `POST /api/shelters/update` | `{ shelter }` |
| `sector_status_changed` | `PUT/POST /api/sectors/:id` | `{ sector }` |
| `volunteer_registered` | `POST /api/volunteers/register` | `{ volunteer }` |
| `volunteer_updated` | `PUT /api/volunteers/:id` | `{ volunteer }` |

### Client-to-Server WebSocket Messages (`/ws`)
Send JSON frames with `{ "type": "<type>", "data": { ... } }` (server replies with `{"event":"ack","data":{"type","ok":true,"ref"}}` or `{"event":"error","data":{"type","status","message","ref"}}`):

| `type` | Allowed Roles | `data` Payload |
| --- | --- | --- |
| `chat_message` | `command`, `rescue` | `{ channel?, text, id?, locationTag?, isAlert? }` |
| `telemetry` | `rescue` | `{ lat, lng, battery?, status?, signal?, altitude?, speed?, heading? }` |
| `sos` | `rescue` | `{ coordinates?, location?, notes?, battery? }` |
| `update_status` | `command`, `rescue` | `{ incidentId, status, notes?, eta? }` |
| `ping` | Any | `{}` (replies `{ event: "pong", data: { time } }`) |
