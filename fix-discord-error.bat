@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo    Discord Auto-Forwarder Error Fix Utility
echo ===================================================
echo.
echo This utility will fix the "Cannot read properties of null (reading 'all')" error
echo in the discord.js-selfbot-v13 library.
echo.

echo === Checking for Node.js ===
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Node.js is not installed or not in PATH.
    echo Please install Node.js and try again.
    goto :end
)

echo === Applying direct fix to discord.js-selfbot-v13 ===
node patch-discord.js
if %ERRORLEVEL% neq 0 (
    echo Failed to apply the fix. 
    echo Please check the error message above.
    goto :end
)

echo.
echo === Fix completed successfully! ===
echo.

set /p restart=Do you want to start the Discord Auto-Forwarder now? (Y/N): 
if /i "!restart!"=="Y" (
    echo.
    echo Starting Discord Auto-Forwarder...
    echo.
    start cmd /k "node index.js"
    echo The application is now running in a new window.
) else (
    echo.
    echo You can start the application manually with:
    echo   node index.js
)

:end
echo.
echo Press any key to exit...
pause >nul
endlocal 