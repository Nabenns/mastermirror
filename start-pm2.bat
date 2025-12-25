@echo off
echo Starting Discord Auto-Forwarder with PM2...
echo.

REM Check if PM2 is installed
call pm2 -v >nul 2>&1
if %errorlevel% neq 0 (
    echo PM2 is not installed. Installing globally...
    call npm install -g pm2
)

echo Starting ecosystem...
call pm2 start ecosystem.config.js
echo.
echo Application is running! Opening monitor...
call pm2 monit
pause
