@echo off
title AntiGrav Cyber HUD Server
echo ==========================================================
echo Starting AntiGrav Cyber HUD Local Server...
echo ==========================================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\server.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Server stopped with error.
    pause
)
