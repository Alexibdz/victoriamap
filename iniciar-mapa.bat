@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org/
  pause
  exit /b 1
)

start "" http://127.0.0.1:5173/
npm run dev

if errorlevel 1 (
  echo.
  echo No se pudo iniciar el mapa. Si ya esta abierto, cerra el servidor anterior.
  pause
)
