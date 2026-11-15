@echo off
title ResQCore Build & Packaging Tool
echo ============================================================
echo   ResQCore - Production Build for All Apps
echo ============================================================
echo.

echo [1/3] Building Command Center Web App (React / Vite)...
cd /d "%~dp0\resqcore"
call npm run build
if %ERRORLEVEL% EQU 0 (
    echo [OK] Command Center built successfully: resqcore\dist\
) else (
    echo [FAIL] Command Center build failed!
)
echo.

echo [2/3] Checking Citizen Flutter App...
cd /d "%~dp0\citizen app"
where flutter >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Building Citizen App APK (Release)...
    call flutter build apk --release
    echo [OK] APK Output: citizen app\build\app\outputs\flutter-apk\app-release.apk
) else (
    echo [SKIP] Flutter CLI not detected in PATH.
)
echo.

echo [3/3] Checking Rescue Team Flutter App...
cd /d "%~dp0\rescue team\RescueApp"
where flutter >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Building Rescue Team App APK (Release)...
    call flutter build apk --release
    echo [OK] APK Output: rescue team\RescueApp\build\app\outputs\flutter-apk\app-release.apk
) else (
    echo [SKIP] Flutter CLI not detected in PATH.
)
echo.

echo ============================================================
echo Build script completed.
echo ============================================================
cd /d "%~dp0"
pause
