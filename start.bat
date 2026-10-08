@echo off
title JLIN Motorparts System Launcher
color 0A

echo ===================================================
echo     JLIN Motorparts Inventory & POS System
echo ===================================================
echo.
echo Starting Backend and Frontend servers...
echo.

:: Get root directory where this script is located
set "PROJECT_DIR=%~dp0"

:: 1. Start Backend API Server
start "JLIN Backend API (Port 5000)" cmd /k "cd /d "%PROJECT_DIR%backend" && echo Starting Backend Server... && node server.js"

:: 2. Start Frontend Application
start "JLIN Frontend UI (Port 5173)" cmd /k "cd /d "%PROJECT_DIR%frontend" && echo Starting Frontend Server... && npm run dev"

:: 3. Give servers a few seconds to spin up
echo Waiting for servers to initialize...
timeout /t 4 /nobreak >nul

:: 4. Automatically open browser
echo Opening browser at http://localhost:5173 ...
start http://localhost:5173

echo.
echo ===================================================
echo  System is running!
echo ===================================================
echo.
echo  Default Login Credentials:
echo    * Administrator:  admin / admin123
echo    * Staff/Cashier:  staff / staff123
echo.
echo  URLs:
echo    * Frontend: http://localhost:5173
echo    * Backend:  http://localhost:5000
echo.
echo  (Keep the opened terminal windows running)
echo ===================================================
echo.
pause
