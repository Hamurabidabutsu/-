@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 24 or newer is required.
  echo Install Node.js from https://nodejs.org/ja/download and try again.
  pause
  exit /b 1
)
node "scripts\run-local-demo.mjs"
if errorlevel 1 pause
