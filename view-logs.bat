@echo off
echo ======================================================
echo Discord Auto-Forwarder Log Viewer v0.1.0
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

REM Lihat log aplikasi
echo Menampilkan log Discord Auto-Forwarder...
echo Tekan Ctrl+C untuk keluar dari tampilan log
echo.
echo ======================================================
timeout /t 3
call pm2 logs discord-autoforwarder 