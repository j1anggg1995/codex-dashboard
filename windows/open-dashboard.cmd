@echo off
setlocal

cd /d "%~dp0"
set "FILES_DIR=%cd%\codex看板 Files"
set "URL=http://127.0.0.1:4174/index.html"

if not exist "%FILES_DIR%\index.html" (
  echo Cannot find codex看板 Files\index.html. Please unzip the package completely.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Please install Node.js 18 or later from https://nodejs.org/
  pause
  exit /b 1
)

cd /d "%FILES_DIR%"
node scripts\start-local.mjs
start "" "%URL%"
exit /b 0
