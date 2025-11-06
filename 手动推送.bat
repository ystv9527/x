@echo off
chcp 65001 >nul
echo ========================================
echo    手动推送到GitHub
echo ========================================
echo.

cd /d "%~dp0"

echo 检查是否有未推送的提交...
git status
echo.

set /p confirm="确认推送到GitHub？(Y/N): "
if /i not "%confirm%"=="Y" (
    echo 取消推送
    pause
    exit /b 0
)

echo.
echo 推送中...
git push

if errorlevel 1 (
    echo.
    echo ❌ 推送失败
    echo 可能原因：网络问题或文件过大
    echo.
) else (
    echo.
    echo ✅ 推送成功！
    echo.
)

pause
