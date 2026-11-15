# ResQCore Deployment Guide

## 1. Prerequisites
- Node.js 20+ (`node:20-alpine` in Docker)
- PostgreSQL 15+ (local, Docker Compose, or Railway Managed Postgres)
- Flutter SDK (for building Citizen App and Rescue Team App)

## 2. Environment Variables (`backend`)
Set these environment variables on your host (e.g. Railway Service Variables or `.env`):

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/resqcore
COMMAND_TOKEN=replace-with-strong-command-token
RESCUE_TOKEN=replace-with-strong-rescue-token
CITIZEN_TOKEN=replace-with-strong-citizen-token
ALLOWED_ORIGINS=https://your-app.up.railway.app
```

> `backend/server.js` automatically executes `backend/db/schema.sql` once at startup using `DATABASE_URL` (with SSL enabled when `NODE_ENV=production`).

## 3. Deploy to Railway (Single Service: Backend + Web Command Center)
1. Push this repository to GitHub.
2. In Railway, create a **New Project** -> **Deploy from GitHub repo**.
3. Add a **PostgreSQL** service in the same Railway project.
4. On the app service, set **Variables**:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `NODE_ENV=production`
   - `COMMAND_TOKEN=<your-command-token>`
   - `RESCUE_TOKEN=<your-rescue-token>`
   - `CITIZEN_TOKEN=<your-citizen-token>`
   - `ALLOWED_ORIGINS=https://<your-railway-domain>.up.railway.app`
   - (Optional build-time vars for web) `VITE_GOOGLE_MAPS_API_KEY=<key>`, `VITE_COMMAND_TOKEN=<your-command-token>`
5. Railway uses `railway.json` and the root `Dockerfile` automatically:
   - Builds `resqcore/` (`npm run build`)
   - Copies `resqcore/dist` into `backend/public`
   - Serves both `/api/*` + `/ws` and the Command Center SPA from port `5000` (or Railway's `$PORT`).
6. Verify health check:
   ```bash
   curl https://<your-railway-domain>.up.railway.app/api/health
   ```

## 4. Local Docker Compose
```bash
docker compose up --build
```

## 5. Build Flutter Mobile / Web Clients

### Citizen App (`citizen app/`)
```bash
cd "citizen app"
flutter pub get
flutter build apk --release \
  --dart-define=API_BASE_URL=https://<your-railway-domain>.up.railway.app \
  --dart-define=CITIZEN_TOKEN=<your-citizen-token>
```

### Rescue Team App (`rescue team/RescueApp/`)
```bash
cd "rescue team/RescueApp"
flutter pub get
flutter build apk --release \
  --dart-define=API_BASE_URL=https://<your-railway-domain>.up.railway.app \
  --dart-define=RESCUE_TOKEN=<your-rescue-token>
```
