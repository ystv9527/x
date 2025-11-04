@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cls
echo.
echo ========================================
echo   Content Collector - Start Server
echo ========================================
echo.
echo Starting server on http://localhost:3000
echo.
cd /d %~dp0
npm run server
pause
