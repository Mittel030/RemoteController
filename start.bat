@echo off
title Touchpad Remote Controller
cd /d "%~dp0"

:: Check of Node.js geinstalleerd is
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo   Node.js is niet geinstalleerd!
  echo   Download het hier: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

:: Check of cloudflared geinstalleerd is
where cloudflared >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo   cloudflared is niet geinstalleerd!
  echo   Download: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  echo.
  pause
  exit /b 1
)

:: Installeer dependencies als dat nog niet is gebeurd
if not exist node_modules (
  echo   Dependencies installeren...
  npm install
  echo.
)

echo   Touchpad Remote Controller starten...
echo   Dashboard opent in je browser...
echo.
node local-server.js
if %errorlevel% neq 0 (
  echo.
  echo   Er ging iets mis. Bekijk de foutmelding hierboven.
  echo.
)
pause
