@echo off
echo ======================================================
echo Discord Auto-Forwarder Restarter v0.1.0
echo (c) 2025 Benss | Discord: .naban
echo ======================================================
echo.

REM Cek apakah PM2 sudah terinstall
WHERE pm2 >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo PM2 belum terinstall!
    pause
    exit /b 1
)

REM Restart aplikasi dengan PM2
echo Merestart Discord Auto-Forwarder...
call pm2 restart discord-autoforwarder

echo.
echo ======================================================
echo Discord Auto-Forwarder berhasil direstart!
echo Untuk melihat log: pm2 logs discord-autoforwarder
echo ======================================================

pause 