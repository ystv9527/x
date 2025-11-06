@echo off
chcp 65001 >nul
cls
echo ========================================
echo   测试视频下载功能
echo ========================================
echo.
echo 正在测试...
echo.

REM 设置代理
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897

REM 运行测试
node 测试视频下载.js

echo.
pause
