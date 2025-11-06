@echo off
chcp 65001 >nul
echo ========================================
echo    一键上传新内容到GitHub
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] 修复GitHub Pages路径...
node fix-paths-for-github.js
if errorlevel 1 (
    echo ❌ 路径修复失败
    pause
    exit /b 1
)
echo.

echo [2/4] 重新生成数据集...
call npm run generate
if errorlevel 1 (
    echo ❌ 数据集生成失败
    pause
    exit /b 1
)
echo.

echo [3/4] 添加并提交更改...
git add .

REM 检查是否有变更
git diff-index --quiet --cached HEAD
if errorlevel 1 (
    REM 有变更，执行提交
    git commit -m "更新内容"
    if errorlevel 1 (
        echo ❌ 提交失败
        pause
        exit /b 1
    )
) else (
    echo ⚠️ 没有新内容需要提交
    pause
    exit /b 0
)
echo.

echo [4/4] 推送到GitHub...
git push
if errorlevel 1 (
    echo ❌ 推送失败
    pause
    exit /b 1
)

echo.
echo ========================================
echo    ✅ 上传成功！
echo    等待1-2分钟后访问GitHub Pages查看
echo ========================================
echo.
pause
