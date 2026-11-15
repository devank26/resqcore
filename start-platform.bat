@echo off
title ResQCore Platform Launcher
echo ============================================================
echo   ResQCore Disaster Management Platform - Full Stack Launcher
echo ============================================================
echo.
echo [1/2] Starting Unified Backend (Port 5000)...
start "ResQCore Backend [Port 5000]" cmd /k "cd /d "%~dp0\backend" && node server.js"

timeout /t 2 /nobreak > nul

echo [2/2] Starting Command Center Web App (Port 5173)...
start "ResQCore Command Center [Port 5173]" cmd /k "cd /d "%~dp0\resqcore" && npm run dev"

echo.
echo ============================================================
echo   Platform Services are running:
echo   - Backend Server:    http://localhost:5000
echo   - Command Center:    http://localhost:5173
echo ============================================================
echo.
pause
