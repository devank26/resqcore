@echo off
title ResQCore Real-Time Platform Tri-Client Drill
echo ============================================================
echo Running ResQCore Live Real-Time Tri-Client Drill...
echo Simulating Citizen App, Command Center, and Rescue Team
echo ============================================================
cd /d "%~dp0\backend"
node live-platform-test.js
pause
