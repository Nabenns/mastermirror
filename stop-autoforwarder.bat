@echo off
echo ======================================================
echo Discord Auto-Forwarder Terminator v0.1.0
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

REM Hentikan dan hapus aplikasi dari PM2
echo Menghentikan Discord Auto-Forwarder...
call pm2 delete discord-autoforwarder

echo.
echo ======================================================
echo Discord Auto-Forwarder berhasil dihentikan!
echo ======================================================

pause 