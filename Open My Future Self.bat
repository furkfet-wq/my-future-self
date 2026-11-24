@echo off
title My Future Self
rem Starts the app and opens it in your browser. Keep this window open while you use the app.
cd /d "%~dp0"
if not exist node_modules (
  echo First run: installing, please wait...
  call npm install
)
rem open the browser a few seconds after the app starts
start "" cmd /c "timeout /t 4 >nul & start http://localhost:5173"
rem if the app is already running, this stops here and the browser just opens the running one
call npm run dev -- --strictPort
pause
