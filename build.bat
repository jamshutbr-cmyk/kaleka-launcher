@echo off
echo Компиляция TypeScript...
call npx tsc -p tsconfig.main.json
if %errorlevel% neq 0 exit /b %errorlevel%

echo Сборка Vite...
call npx vite build src/renderer
if %errorlevel% neq 0 exit /b %errorlevel%

echo Сборка Electron приложения...
call npx electron-builder --win
if %errorlevel% neq 0 exit /b %errorlevel%

echo.
echo ========================================
echo Готово! Установщик в папке release/
echo ========================================
pause
