# ResQCore Disaster Management Platform

A unified, real-time emergency disaster management and tactical response ecosystem linking trapped citizens, rapid rescue field operatives, and centralized command centers.

---

## 🏗️ Platform Architecture & File Locations

| Component | Technology | Directory | Default Port / Target | Description |
|-----------|-----------|-----------|------------------------|-------------|
| **Unified Real-Time Backend** | Node.js, Express, SSE, WebSockets, SQLite | [`backend/`](file:///c:/resqcore-disaster%20mangment%20platform/backend) | `http://localhost:5000` | Real-time event bus, state persistence, dispatch engine & telemetry |
| **Command Center Web App** | React 18, Vite, Google Maps API, Tailwind | [`resqcore/`](file:///c:/resqcore-disaster%20mangment%20platform/resqcore) | `http://localhost:5173` | Tactical overview, live incident map, team dispatch & communications |
| **Citizen Mobile App** | Flutter (Dart), FlutterMap + Google Tiles, Geolocator | [`citizen app/`](file:///c:/resqcore-disaster%20mangment%20platform/citizen%20app) | Android / iOS / Web | 1-Touch SOS, emergency report wizard, live GPS dispatch tracking |
| **Rescue Team Mobile App** | Flutter (Dart), Tactical Map, Background Telemetry | [`rescue team/RescueApp/`](file:///c:/resqcore-disaster%20mangment%20platform/rescue%20team/RescueApp) | Android / iOS / Web | Field operative tactical radar, incident management & team chat |

---

## ⚡ Quick Start (Local Development)

### Option A: One-Click Windows Launcher
Run [`start-platform.bat`](file:///c:/resqcore-disaster%20mangment%20platform/start-platform.bat) to launch both the Unified Backend (`:5000`) and Command Center (`:5173`) in independent console windows.

### Option B: Docker Compose (All-in-One Containerized)
```bash
docker compose up --build
```
- **Backend API**: `http://localhost:5000`
- **Command Center**: `http://localhost:5173`

### Option C: Manual Launch
1. **Launch Unified Backend**:
   ```bash
   cd backend
   node server.js
   ```
2. **Launch Command Center**:
   ```bash
   cd resqcore
   npm install
   npm run dev
   ```
3. **Launch Citizen Mobile App**:
   ```bash
   cd "citizen app"
   flutter run
   ```
4. **Launch Rescue Team App**:
   ```bash
   cd "rescue team/RescueApp"
   flutter run
   ```

---

## 📦 Production Deployment Guide

### 1. Unified Backend Deployment (`backend/`)

#### A. Deploy to Render / Railway / Fly.io / Heroku:
1. Point your service to the `backend/` folder.
2. Build Command: `npm install --production`
3. Start Command: `node server.js`
4. Set Environment Variables:
   - `PORT=5000` (or leave default to provider's `$PORT`)
   - `NODE_ENV=production`

#### B. Deploy to Linux VPS (Ubuntu / Debian / AWS EC2 / DigitalOcean):
```bash
# 1. Install Node.js 20 & PM2
sudo apt update && sudo apt install -y nodejs npm
sudo npm install -g pm2

# 2. Clone repository & install dependencies
cd "c:/resqcore-disaster mangment platform/backend" # or /var/www/resqcore/backend
npm install --production

# 3. Start daemon process with PM2
pm2 start server.js --name resqcore-backend
pm2 save
pm2 startup
```

---

### 2. Command Center Web App Deployment (`resqcore/`)

#### A. Build Static Assets:
```bash
cd resqcore
npm run build
```
The compiled, optimized production files will be in [`resqcore/dist/`](file:///c:/resqcore-disaster%20mangment%20platform/resqcore/dist).

#### B. Deploy to Vercel / Netlify / Cloudflare Pages / Firebase:
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Proxy Configuration**: Redirect `/api/*` to your production backend URL (e.g. `https://api.yourdomain.com/api/:splat`).

#### C. Deploy via Nginx on VPS:
Use the provided [`resqcore/nginx.conf`](file:///c:/resqcore-disaster%20mangment%20platform/resqcore/nginx.conf) which already includes caching, client routing (`try_files`), and unbuffered reverse-proxying for real-time SSE (`/api/stream`).

---

### 3. Mobile Apps Deployment (Citizen App & Rescue Team App)

#### A. Network Configuration for Production
In [`citizen app/lib/services/command_center_service.dart`](file:///c:/resqcore-disaster%20mangment%20platform/citizen%20app/lib/services/command_center_service.dart) and [`rescue team/RescueApp/lib/services/tactical_sync_service.dart`](file:///c:/resqcore-disaster%20mangment%20platform/rescue%20team/RescueApp/lib/services/tactical_sync_service.dart), add your public production backend domain or server IP to `candidateHosts`:
```dart
static const List<String> candidateHosts = [
  'https://api.yourdomain.com', // <-- Your production server
  'http://10.0.2.2:5000',       // Android emulator fallback
  'http://localhost:5000',      // Local fallback
];
```

#### B. Building Android Release APK & App Bundle
```bash
# Citizen App
cd "citizen app"
flutter build apk --release
# Output: citizen app/build/app/outputs/flutter-apk/app-release.apk

flutter build appbundle --release
# Output: citizen app/build/app/outputs/bundle/release/app-release.aab (for Google Play Store)

# Rescue Team App
cd "rescue team/RescueApp"
flutter build apk --release
# Output: rescue team/RescueApp/build/app/outputs/flutter-apk/app-release.apk

flutter build appbundle --release
# Output: rescue team/RescueApp/build/app/outputs/bundle/release/app-release.aab
```

#### C. Building iOS (macOS required)
```bash
cd "citizen app"
flutter build ipa --release
```

---

## 🔑 Configuration & API Keys

| Parameter | Location | Default / Instructions |
|-----------|----------|------------------------|
| **Google Maps API Key** | `resqcore/src/utils/googleMapsConfig.js`, `citizen app/lib/screens/live_map_screen.dart`, `rescue team/RescueApp/lib/widgets/tactical_map_canvas.dart` | Configured with tactical Google satellite and road tile access. Can also be overridden at runtime in the Command Center UI via the *Google API Key* modal. |
| **Backend Port** | `backend/server.js` | `5000` (can be overridden via `PORT` environment variable). |
| **Command Center Port** | `resqcore/vite.config.js` | `5173` |

---

## 🧪 Real-Time Platform Tri-Client Verification
To simulate an end-to-end disaster drill between Citizen SOS, Command Center Dispatch, and Rescue Field Operative Telemetry:
```bash
# Run one-click drill
run-drill.bat

# Or run via node
cd backend
node live-platform-test.js
```
