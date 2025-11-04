@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cls
echo.
echo ========================================
echo   Content Collector - Start Server V3
echo ========================================
echo.

REM Kill existing process on port 3000
echo Checking for existing process on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    echo Stopping process: %%a
    taskkill /F /PID %%a >nul 2>&1
)

timeout /t 2 /nobreak >nul

echo.
echo Starting server on http://localhost:3000
echo.
echo If image download fails, configure VPN/proxy in .env file
echo See VPN-PROXY-CONFIG.md for details
echo.
cd /d %~dp0
node server-v3.js
pause
