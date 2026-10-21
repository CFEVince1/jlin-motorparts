@echo off
title JLIN Motorparts - Demo Database Reset
color 0B

echo ===================================================
echo     JLIN Motorparts — Instant Demo Database Reset
echo ===================================================
echo.
echo WARNING: This will reset the database to baseline demo state.
echo All non-baseline transactions and modifications will be cleared.
echo.
set /p CONFIRM="Type 'RESET' to confirm database reset (or press Enter to cancel): "
if /i not "%CONFIRM%"=="RESET" (
    echo.
    echo Reset cancelled by user.
    pause
    exit /b 0
)

echo.
echo Resetting database to clean defense demo state...
echo.

node "%~dp0scripts\reset_demo.js" %*

echo.
pause
