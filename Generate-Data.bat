@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cls
echo.
echo ========================================
echo   Content Collector - Generate Data
echo ========================================
echo.
echo Generating JSON dataset from Markdown...
echo.
cd /d %~dp0
npm run generate
echo.
echo Done! Data generated successfully.
echo.
pause
