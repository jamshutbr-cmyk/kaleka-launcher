@echo off
chcp 65001 >nul
title Kaleka Launcher - Release Tool

echo.
echo  ========================================
echo    Kaleka Launcher - Release Tool
echo  ========================================
echo.

:: Get current version from package.json using PowerShell
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content package.json | ConvertFrom-Json).version"`) do set CURRENT_VERSION=%%V

echo  Current version: %CURRENT_VERSION%
echo.
set /p NEW_VERSION= New version (leave empty to keep %CURRENT_VERSION%): 

if "%NEW_VERSION%"=="" (
    set RELEASE_VERSION=%CURRENT_VERSION%
    echo  Version unchanged: %CURRENT_VERSION%
) else (
    powershell -NoProfile -Command "(Get-Content package.json) -replace '\"version\": \"%CURRENT_VERSION%\"', '\"version\": \"%NEW_VERSION%\"' | Set-Content package.json"
    set RELEASE_VERSION=%NEW_VERSION%
    echo  Version updated: %CURRENT_VERSION% -^> %NEW_VERSION%
)

echo.
set /p RELEASE_NOTES= Release notes (what changed): 
if "%RELEASE_NOTES%"=="" set RELEASE_NOTES=Bug fixes and improvements

echo.
echo  [1/4] Building project...
echo  ----------------------------------------
call npm run build:win
if errorlevel 1 (
    echo.
    echo  BUILD FAILED! Check errors above.
    pause
    exit /b 1
)

echo.
echo  [2/4] Committing changes...
echo  ----------------------------------------
git add .
git commit -m "Release v%RELEASE_VERSION%"
git push origin main

echo.
echo  [3/4] Creating GitHub Release v%RELEASE_VERSION%...
echo  ----------------------------------------

where gh >nul 2>&1
if errorlevel 1 (
    echo.
    echo  GitHub CLI (gh) not found!
    echo  Install from: https://cli.github.com
    echo.
    echo  Opening release folder...
    explorer release
    pause
    exit /b 1
)

gh release create "v%RELEASE_VERSION%" ^
    "release\Kaleka Launcher-Setup-%RELEASE_VERSION%.exe" ^
    "release\Kaleka Launcher-Setup-%RELEASE_VERSION%.exe.blockmap" ^
    "release\latest.yml" ^
    --title "Kaleka Launcher v%RELEASE_VERSION%" ^
    --notes "%RELEASE_NOTES%"

if errorlevel 1 (
    echo.
    echo  Release failed. Try: gh auth login
    pause
    exit /b 1
)

echo.
echo  [4/4] Done!
echo.
echo  ========================================
echo   Released: v%RELEASE_VERSION%
echo   https://github.com/jamshutbr-cmyk/kaleka-launcher/releases
echo  ========================================
echo.
pause
