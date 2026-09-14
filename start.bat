@echo off
title maps2whatsapp
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening the download page - install it, then double-click start.bat again.
  start https://nodejs.org/en/download
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing... ^(about a minute^)
  call npm install --no-fund --no-audit
)
echo Starting maps2whatsapp. Your browser will open. Close this window to stop.
node server.js
pause
