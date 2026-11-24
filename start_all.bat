@echo off
title RLJIT Arcade Backend Launcher
echo ====================================================
echo Starting RLJIT Arcade Backend Services...
echo ====================================================

REM 1. Start PostgreSQL if not already running
echo [1/2] Checking PostgreSQL...
tasklist /FI "IMAGENAME eq postgres.exe" 2>NUL | find /I /N "postgres.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo PostgreSQL is already running.
) else (
    echo Starting portable PostgreSQL on port 5432...
    "C:\Users\shrey\pgsql\bin\pg_ctl.exe" -D "C:\Users\shrey\pgsql\data" -l "C:\Users\shrey\pgsql\logfile.txt" start
)

REM 2. Start Node.js Express Backend
echo [2/2] Starting RLJIT Arcade Express Server (port 5000)...
cd /d "C:\Users\shrey\Desktop\rljit_arcade\backend"
npm run dev

pause
