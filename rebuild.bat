@echo off
chcp 65001 > nul
echo.
echo 🔄 正在重新生成所有页面...
echo.

cd /d E:\gitpromts
call npm run build

if %errorlevel% equ 0 (
    echo.
    echo ✅ 页面已刷新！
    echo 💡 请在浏览器中硬刷新（Ctrl+F5）查看最新内容
) else (
    echo.
    echo ❌ 生成失败，请检查错误信息
)

echo.
echo 按任意键关闭...
pause > nul
