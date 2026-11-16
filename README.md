# ResQCore

ResQCore is a real-time disaster management and emergency response platform that connects citizens, rescue teams, and command-center operators in a single coordinated workflow.

It supports:
- Citizen SOS reporting and location sharing
- Live incident monitoring and triage
- Rescue team dispatch and status tracking
- Command-center dashboards with map-based visibility
- Realtime updates through backend event streaming

## Overview

ResQCore brings together three major interfaces:

- Command Center Web App: operational dashboard for dispatch and response coordination
- Citizen Mobile App: emergency reporting and status monitoring
- Rescue Team Mobile App: tactical field operations and incident updates

The platform is designed for disaster response scenarios where fast situational awareness and coordinated action matter.

## Architecture

The repository is organized into the following main components:

- `backend/` — Node.js + Express realtime backend with REST APIs and event streaming
- `resqcore/` — React + Vite command-center web application
- `citizen app/` — Flutter citizen mobile app
- `rescue team/` — Flutter rescue-team mobile app
- `docs/` — project documentation and architecture references

## Features

- 1-tap emergency reporting from citizens
- Real-time incident stream to command center and rescue personnel
- Live location tracking and map visualization
- Role-based workflow for command, field, and citizen users
- WebSocket and SSE-based event fan-out
- SQLite-backed persistence for operational state
- Docker and local development startup scripts

## Repository Structure

```text
resqcore/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── db.json
│   └── ...
├── resqcore/
│   ├── src/
│   ├── package.json
│   ├── vite.config.js
│   └── ...
├── citizen app/
│   ├── lib/
│   ├── pubspec.yaml
│   └── ...
├── rescue team/
│   ├── RescueApp/
│   └── ...
├── docs/
├── README.md
├── docker-compose.yml
├── DEPLOY.md
├── start-platform.bat
├── start-backend.bat
├── run-drill.bat
└── ...
```

## Prerequisites

Before running the platform locally, make sure you have:

- Node.js 18+ and npm
- Flutter SDK
- Docker (optional, for containerized setup)
- A browser for the command-center app

## Quick Start

### Option 1: Start with the bundled scripts

From the repository root:

```bash
./start-platform.bat
```

On Windows, this script starts the backend and command-center app together.

### Option 2: Run backend manually

```bash
cd backend
npm install
node server.js
```

The backend listens on:

- `http://localhost:5000`

### Option 3: Run the command-center web app manually

```bash
cd resqcore
npm install
npm run dev
```

The app runs on:

- `http://localhost:5173`

### Option 4: Run the mobile apps

Citizen app:

```bash
cd "citizen app"
flutter pub get
flutter run
```

Rescue team app:

```bash
cd "rescue team/RescueApp"
flutter pub get
flutter run
```

## Docker Setup

To run the project using Docker Compose:

```bash
docker compose up --build
```

This starts the core backend and frontend services using the included compose configuration.

## Environment and Configuration

Key configuration areas include:

- Backend port and runtime behavior in `backend/server.js`
- Frontend app configuration in `resqcore/`
- Google Maps and API-related settings in the respective app source files
- Mobile host configuration for local and production endpoints

## Deployment

For production deployment, see the project deployment notes in:

- `DEPLOY.md`

The repository also includes deployment and architecture reference documents for the overall platform design.

## Demo and Testing

The project includes scripts and tools for realistic workflow simulation:

```bash
run-drill.bat
```

You can also run backend simulation flows directly from the backend directory.

## Notes

This project is actively under development and is intended to showcase an end-to-end emergency response ecosystem spanning citizen reporting, field operations, and command-center coordination.

## Contributing

Contributions are welcome. If you want to improve the platform, add features, or improve documentation, open a pull request with a clear description of the changes.

## License

This repository currently does not declare a formal license in the root project metadata. If you intend to publish or distribute it publicly, consider adding an appropriate open-source license.
