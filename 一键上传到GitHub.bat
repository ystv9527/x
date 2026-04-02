@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

cd /d "%~dp0"

echo ========================================
echo    Upload new content to GitHub
echo ========================================
echo.

if defined GIT_PROXY (
    set "HTTP_PROXY=%GIT_PROXY%"
    set "HTTPS_PROXY=%GIT_PROXY%"
    echo [info] Proxy enabled via GIT_PROXY=%GIT_PROXY%
) else (
    echo [info] Proxy not overridden. Using current network settings.
)
echo.

for /f "usebackq delims=" %%i in (`git remote get-url origin 2^>nul`) do set "ORIGIN_URL=%%i"
if defined ORIGIN_URL (
    echo [info] origin: !ORIGIN_URL!
    echo.
)

if /i "%SKIP_BUILD%"=="1" (
    echo [1/4] Skipping build because SKIP_BUILD=1
) else (
    echo [1/4] Fix GitHub Pages paths...
    node fix-paths-for-github.js
    if errorlevel 1 (
        echo [error] Failed to fix GitHub Pages paths.
        pause
        exit /b 1
    )

    echo.
    echo [2/4] Rebuild data and sitemap...
    call npm run build
    if errorlevel 1 (
        echo [error] Build failed.
        pause
        exit /b 1
    )
)
echo.

echo [3/4] Stage and commit changes...
git add .
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Update content"
    if errorlevel 1 (
        echo [error] Commit failed.
        pause
        exit /b 1
    )
) else (
    echo [info] No staged changes to commit.
)
echo.

if /i "%SKIP_PUSH%"=="1" (
    echo [4/4] Skipping push because SKIP_PUSH=1
    echo.
    pause
    exit /b 0
)

echo [4/4] Push to GitHub...
echo [info] If push fails, the script will retry up to 5 times.
echo.

set "RETRY=0"
set "LAST_PUSH_LOG=%TEMP%\gitpromts-last-push.log"

:push_retry
git push >"%LAST_PUSH_LOG%" 2>&1
set "PUSH_EXIT=!errorlevel!"
type "%LAST_PUSH_LOG%"
if !PUSH_EXIT! equ 0 goto push_done

set /a RETRY+=1
if !RETRY! lss 5 (
    echo.
    echo [warn] Push failed. Retry !RETRY!/5 in 10 seconds...
    timeout /t 10 /nobreak >nul
    goto push_retry
)

call :print_push_guidance "%LAST_PUSH_LOG%"
pause
exit /b 1

:push_done
echo.
echo ========================================
echo    Upload succeeded
echo    Wait 1-2 minutes, then check GitHub Pages
echo ========================================
echo.
pause
exit /b 0

:print_push_guidance
set "LOG_FILE=%~1"
echo.
echo [error] Push failed 5 times.
echo.

findstr /C:"Permission to " "%LOG_FILE%" >nul
if not errorlevel 1 (
    echo Cause: the current GitHub account does not have write access to this repo.
    echo.
    echo Fix:
    echo 1. Remove the cached github.com credential from Windows Credential Manager.
    echo 2. Run git push again and sign in with an account that can write to the repo.
    echo 3. Or switch origin to SSH:
    echo    git remote set-url origin git@github.com:ystv9527/x.git
    echo.
    echo Repo: ystv9527/x
    goto :eof
)

findstr /C:"GH001" /C:"Large files detected" /C:"exceeds GitHub's file size limit" "%LOG_FILE%" >nul
if not errorlevel 1 (
    echo Cause: one or more tracked files are too large for GitHub.
    echo.
    echo Fix:
    echo 1. Remove the large file from the commit, or use Git LFS.
    echo 2. Push again after rewriting the commit if needed.
    goto :eof
)

findstr /C:"Failed to connect" /C:"Could not resolve host" /C:"Connection timed out" /C:"schannel" /C:"SSL" "%LOG_FILE%" >nul
if not errorlevel 1 (
    echo Cause: network, proxy, or TLS connection problem.
    echo.
    echo Fix:
    echo 1. Check whether your proxy is available.
    echo 2. If you need one, run this script with:
    echo    set GIT_PROXY=http://127.0.0.1:7897
    echo 3. Or switch origin to SSH.
    goto :eof
)

echo Cause: see the git error shown above.
echo.
echo Retry manually with:
echo    git push
goto :eof
