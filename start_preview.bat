@echo off
rem PREVIEW ONLY: uses in-memory sample data because Oracle is not installed. Use start_demo.bat for the real demo.
start "Rodhare Backend (PREVIEW - no DB)" /D "%~dp0backend" cmd /k "set ALLOW_MEMORY_FALLBACK=true&& npm run dev"
timeout /t 6 /nobreak >nul
start "Rodhare Frontend" /D "%~dp0frontend" cmd /k npm run dev
timeout /t 8 /nobreak >nul
start "" http://localhost:3000/courts
exit
