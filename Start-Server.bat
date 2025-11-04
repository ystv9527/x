@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cls
echo.
echo ========================================
echo   Content Collector - Start Server
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
cd /d %~dp0
npm run server
pause
