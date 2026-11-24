@echo off
title RLJIT Arcade Backend Shutdown
echo ====================================================
echo Stopping RLJIT Arcade Backend Services...
echo ====================================================

echo Stopping PostgreSQL...
"C:\Users\shrey\pgsql\bin\pg_ctl.exe" -D "C:\Users\shrey\pgsql\data" stop

echo Done! All services stopped.
pause
