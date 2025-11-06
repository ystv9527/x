@echo off
setlocal enabledelayedexpansion
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
echo 💡 提示：如遇到网络问题，将自动重试 5 次
echo.

set retry=0
:push_retry
git push
if errorlevel 1 (
    set /a retry+=1
    if !retry! lss 5 (
        echo ⚠️ 推送失败，10秒后重试（!retry!/5）...
        echo    如果持续失败，可能需要配置代理或使用 SSH
        timeout /t 10 /nobreak >nul
        goto push_retry
    ) else (
        echo.
        echo ❌ 推送失败 5 次，可能原因：
        echo    1. 网络连接不稳定（GitHub 在国内访问较慢）
        echo    2. 需要配置 Git 代理
        echo    3. 文件过大（视频超过 50MB）
        echo.
        echo 💡 解决方案：
        echo    方案1：稍后手动运行 'git push'
        echo    方案2：配置代理 'git config --global http.proxy http://127.0.0.1:端口'
        echo    方案3：使用 SSH 而不是 HTTPS
        echo.
        echo 📝 当前代码已提交到本地，等网络恢复后可直接运行 'git push'
        echo.
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo    ✅ 上传成功！
echo    等待1-2分钟后访问GitHub Pages查看
echo ========================================
echo.
pause
