@echo off
title ResQCore Unified Real-Time Backend
echo ============================================================
echo Starting ResQCore Unified Real-Time Backend (Port 5000)...
echo Connecting Command Center, Citizen App, and Rescue Team
echo ============================================================
cd /d "%~dp0\backend"
node server.js
pause
