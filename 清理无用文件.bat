@echo off
chcp 65001 >nul
cls
echo ========================================
echo   清理无用文件
echo ========================================
echo.
echo 即将删除以下无用文件:
echo.
echo [备份文件]
echo   - server-backup.js
echo   - server-v1-backup.js
echo   - server-v3.js
echo   - add-auto-backup.html
echo   - assets/app-backup.js
echo   - scripts/generate-dataset-backup.js
echo   - extension/content-backup.js
echo   - bookmarklet-final-backup.js
echo.
echo [旧版本 bookmarklet]
echo   - bookmarklet.js
echo   - bookmarklet-v2.js
echo   - bookmarklet-v4.js
echo   - bookmarklet-debug.js
echo   - bookmarklet-compact.js
echo   - bookmarklet-improved.js
echo   - bookmarklet-test.js
echo   - bookmarklet-fixed.js
echo   - bookmarklet-final.js (已被 bookmarklet-final-with-video.js 替代)
echo.
echo [旧版本 HTML]
echo   - add.html
echo   - add-v2.html
echo   - add-v3.html
echo   - quick-collect.html
echo   - test-bookmarklet.html
echo   - bookmarklet-generator.html
echo   - bookmarklet-one-click.html
echo.
echo [txt 临时文件]
echo   - bookmarklet-final-fixed.txt
echo   - bookmarklet-final-v2.txt
echo   - bookmarklet-fixed-v3.txt
echo   - bookmarklet-oneline.txt
echo   - console-command.txt
echo   - console-command-v2.txt
echo   - debug-images.txt
echo   - video-download-api.txt
echo.
echo [重复的 BAT 文件]
echo   - Start-Server.bat
echo   - Start-Server-With-Proxy.bat
echo   - 一键启动.bat
echo   - 一键启动-推荐.bat
echo   - temp.bat
echo.
echo ========================================
echo.
pause
echo.
echo 开始清理...

REM 删除备份文件
del /q server-backup.js 2>nul
del /q server-v1-backup.js 2>nul
del /q server-v3.js 2>nul
del /q add-auto-backup.html 2>nul
del /q assets\app-backup.js 2>nul
del /q scripts\generate-dataset-backup.js 2>nul
del /q extension\content-backup.js 2>nul
del /q bookmarklet-final-backup.js 2>nul

REM 删除旧版本 bookmarklet
del /q bookmarklet.js 2>nul
del /q bookmarklet-v2.js 2>nul
del /q bookmarklet-v4.js 2>nul
del /q bookmarklet-debug.js 2>nul
del /q bookmarklet-compact.js 2>nul
del /q bookmarklet-improved.js 2>nul
del /q bookmarklet-test.js 2>nul
del /q bookmarklet-fixed.js 2>nul
del /q bookmarklet-final.js 2>nul

REM 删除旧版本 HTML
del /q add.html 2>nul
del /q add-v2.html 2>nul
del /q add-v3.html 2>nul
del /q quick-collect.html 2>nul
del /q test-bookmarklet.html 2>nul
del /q bookmarklet-generator.html 2>nul
del /q bookmarklet-one-click.html 2>nul

REM 删除 txt 临时文件
del /q bookmarklet-final-fixed.txt 2>nul
del /q bookmarklet-final-v2.txt 2>nul
del /q bookmarklet-fixed-v3.txt 2>nul
del /q bookmarklet-oneline.txt 2>nul
del /q console-command.txt 2>nul
del /q console-command-v2.txt 2>nul
del /q debug-images.txt 2>nul
del /q video-download-api.txt 2>nul

REM 删除重复的 BAT 文件
del /q Start-Server.bat 2>nul
del /q Start-Server-With-Proxy.bat 2>nul
del /q 一键启动.bat 2>nul
del /q 一键启动-推荐.bat 2>nul
del /q temp.bat 2>nul

echo.
echo ========================================
echo   清理完成！
echo ========================================
echo.
echo 保留的关键文件:
echo   ✓ server.js (主服务器)
echo   ✓ add-auto.html (采集页面)
echo   ✓ index.html (主页)
echo   ✓ bookmarklet-final-with-video.js (书签工具-支持视频)
echo   ✓ 启动服务器.bat (启动脚本)
echo   ✓ extension/ (浏览器扩展)
echo   ✓ scripts/ (脚本目录)
echo   ✓ assets/ (前端资源)
echo   ✓ content/ (内容存储)
echo   ✓ data/ (数据文件)
echo   ✓ images/ (图片目录)
echo   ✓ videos/ (视频目录)
echo.
pause
