@echo off
REM Clear Vite cache and restart dev server
echo Clearing Vite cache...

cd /d "e:\Athens 5.0\Athens 2.0\frontend"

REM Stop any running dev server (optional - user should do this manually)
echo Please stop the dev server (Ctrl+C) if it's running, then run this script.
pause

REM Remove node_modules/.vite cache
if exist "node_modules\.vite" (
    echo Removing node_modules\.vite...
    rmdir /s /q "node_modules\.vite"
    echo Cache cleared!
) else (
    echo No cache found at node_modules\.vite
)

echo.
echo Cache cleared. Now restart the dev server with: npm run dev
pause
