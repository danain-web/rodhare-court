@echo off
setlocal
cd /d "%~dp0"
echo ==========================================================
echo  Barbie Sports Arena - RESET DEMO DATA
echo  Drops all tables and reloads seed data (schema, constraints,
echo  views, seed). All bookings, payments and uploaded slips
echo  will be deleted.
echo ==========================================================
set /p CONFIRM=Type Y then Enter to continue:
if /i not "%CONFIRM%"=="Y" (
  echo Cancelled.
  pause
  exit /b 0
)

rem ---- read DB settings from backend\.env ----
set DB_USER=rodhare
set DB_PASSWORD=rodhare123
set DB_CONNECT_STRING=localhost:1521/XEPDB1
for /f "usebackq eol=# tokens=1,* delims==" %%a in ("backend\.env") do (
  if /i "%%a"=="DB_USER" set DB_USER=%%b
  if /i "%%a"=="DB_PASSWORD" set DB_PASSWORD=%%b
  if /i "%%a"=="DB_CONNECT_STRING" set DB_CONNECT_STRING=%%b
)

where sqlplus >nul 2>nul
if errorlevel 1 (
  echo [ERROR] sqlplus not found. Run the 4 files in SQL Developer instead:
  echo         schema.sql - constraints.sql - views.sql - seed.sql
  pause
  exit /b 1
)

echo.
echo Connecting as %DB_USER% @ %DB_CONNECT_STRING% ...
set NLS_LANG=AMERICAN_AMERICA.AL32UTF8
pushd database
sqlplus -s -L %DB_USER%/%DB_PASSWORD%@%DB_CONNECT_STRING% @reset_all.sql
set RC=%ERRORLEVEL%
popd

if exist "backend\uploads" rmdir /s /q "backend\uploads"
echo Uploaded slips folder cleared.
echo.
if "%RC%"=="0" (
  echo DONE. Expected: Invalid objects 0, Users 5, Courts 6, Bookings 0, Audit triggers 20
  echo Refresh the web page ^(Ctrl+F5^) and log in again.
) else (
  echo [ERROR] sqlplus returned %RC%. Check that Oracle is running and backend\.env is correct.
)
pause
