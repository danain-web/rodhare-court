@echo off
cd /d "%~dp0"

rem ---- first run on a new machine: create backend\.env from the example ----
if not exist "backend\.env" (
  echo backend\.env not found - creating it from backend\.env.example
  copy "backend\.env.example" "backend\.env" >nul
  echo Fill in DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend\.env ^(see USER_GUIDE.md^).
)

rem ---- first run: install dependencies ----
if not exist "backend\node_modules" (
  echo Installing backend dependencies ^(first run only^) ...
  pushd backend
  call npm install
  popd
)
if not exist "frontend\node_modules" (
  echo Installing frontend dependencies ^(first run only^) ...
  pushd frontend
  call npm install
  popd
)

echo Starting backend (port 5000) ...
start "Rodhare Backend" /D "%~dp0backend" cmd /k npm run dev
timeout /t 6 /nobreak >nul
echo Starting frontend (port 3000) ...
start "Rodhare Frontend" /D "%~dp0frontend" cmd /k npm run dev
timeout /t 8 /nobreak >nul
start "" http://localhost:3000/health
exit
