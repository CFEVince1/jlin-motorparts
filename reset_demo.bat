@echo off
title JLIN Motorparts - Demo Database Reset
color 0B

echo ===================================================
echo     JLIN Motorparts — Instant Demo Database Reset
echo ===================================================
echo.
echo Resetting database to clean defense demo state...
echo.

node "%~dp0scripts\reset_demo.js"

echo.
pause
