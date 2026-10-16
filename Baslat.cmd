@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "TASK_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
where node >nul 2>nul
if not errorlevel 1 set "TASK_NODE=node"
"%TASK_NODE%" backend\local-admin-status.mjs
if errorlevel 1 powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Kurulum.ps1"
"%TASK_NODE%" backend\local-admin-status.mjs
if errorlevel 1 exit /b 1
"%TASK_NODE%" scripts\build-access.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
"%TASK_NODE%" backend\local.mjs
pause
