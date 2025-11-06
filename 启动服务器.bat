@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cls
color 0A
echo.
echo ========================================
echo   内容收藏库 - 一键启动
echo   Content Collector - Quick Start
echo ========================================
echo.

REM 检查并停止占用3000端口的进程
echo [1/5] 检查端口占用...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    echo       停止旧进程: %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM 设置代理（Clash默认端口7897）
echo [2/5] 配置代理...
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
echo       代理: %HTTP_PROXY%

REM 切换到脚本所在目录
cd /d %~dp0

REM 等待
echo [3/5] 准备启动...
timeout /t 2 /nobreak >nul

REM 自动打开浏览器
echo [4/5] 打开浏览器...
start http://localhost:3000

echo [5/5] 启动服务器...
echo.
echo ========================================
echo   服务器已启动！
echo ========================================
echo.
echo   主页: http://localhost:3000
echo   采集页面: http://localhost:3000/add-auto.html
echo.
echo   使用说明:
echo   1. 在X(Twitter)上打开推文
echo   2. 点击书签工具（bookmarklet-final-with-video.js）
echo   3. 自动采集文字、图片、视频
echo   4. 填写表单并保存
echo   5. 运行: node scripts/generate-dataset.js
echo   6. 刷新网页查看效果
echo.
echo   关闭此窗口将停止服务器
echo ========================================
echo.

REM 前台运行服务器（关闭窗口会自动停止）
node server.js
