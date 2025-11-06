@echo off
chcp 65001 >nul
echo ========================================
echo    一键上传新内容到GitHub
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] 检查Git状态...
git status
echo.

echo [2/4] 添加所有更改...
git add .
echo.

echo [3/4] 提交更改...
set /p commit_msg="请输入提交说明（直接回车使用默认）: "
if "%commit_msg%"=="" set commit_msg=更新内容 %date% %time%

git commit -m "%commit_msg%"
echo.

echo [4/4] 推送到GitHub...
git push
echo.

if %errorlevel% equ 0 (
    echo ========================================
    echo    ✅ 上传成功！
    echo    等待1-2分钟后访问GitHub Pages查看
    echo ========================================
) else (
    echo ========================================
    echo    ❌ 上传失败，请检查网络或Git配置
    echo ========================================
)

echo.
pause
