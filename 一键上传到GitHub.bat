@echo off
chcp 65001 >nul
echo ========================================
echo    一键上传新内容到GitHub
echo ========================================
echo.

cd /d "%~dp0"

echo [1/6] 修复GitHub Pages路径...
node fix-paths-for-github.js
if %errorlevel% neq 0 (
    echo ❌ 路径修复失败，请检查Node.js是否已安装
    pause
    exit /b 1
)
echo.

echo [2/6] 重新生成数据集...
npm run generate
if %errorlevel% neq 0 (
    echo ❌ 数据集生成失败
    pause
    exit /b 1
)
echo.

echo [3/6] 检查Git状态...
git status
echo.

echo [4/6] 添加所有更改...
git add .
echo.

echo [5/6] 检查是否有变更...
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo ⚠️ 没有新内容需要提交
    echo.
    pause
    exit /b 0
)

echo [6/6] 提交更改...
set /p commit_msg="请输入提交说明（直接回车使用默认）: "
if "%commit_msg%"=="" set "commit_msg=更新内容"

git commit -m "%commit_msg%"
echo.

echo [7/7] 推送到GitHub...
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
