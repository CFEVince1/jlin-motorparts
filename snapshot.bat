@echo off
title JLIN Motorparts - Capture Clean Snapshot
color 0E

echo ===================================================
echo     JLIN Motorparts — Capture Clean Snapshot
echo ===================================================
echo.
echo Exporting clean baseline state to jlin_demo_clean.sql...
echo.

node "%~dp0scripts\snapshot.js"

echo.
pause
