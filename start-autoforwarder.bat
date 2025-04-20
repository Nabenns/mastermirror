@echo off
echo ======================================================
echo Discord Auto-Forwarder Launcher v0.1.0
echo (c) 2025 Benss | Discord: .naban
echo ======================================================
echo.

REM Cek apakah PM2 sudah terinstall
WHERE pm2 >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo PM2 belum terinstall. Menginstall PM2...
    call npm install -g pm2
    IF %ERRORLEVEL% NEQ 0 (
        echo Gagal menginstall PM2! Pastikan Node.js terinstall dengan benar.
        pause
        exit /b 1
    )
)

REM Hentikan proses sebelumnya jika ada
echo Menghentikan instance sebelumnya...
call pm2 delete discord-autoforwarder 2>nul

REM Mulai aplikasi dengan PM2
echo Memulai Discord Auto-Forwarder dengan PM2...
cd %~dp0
call pm2 start index.js --name discord-autoforwarder

echo.
echo ======================================================
echo Discord Auto-Forwarder berhasil dijalankan!
echo Untuk melihat log: pm2 logs discord-autoforwarder
echo Untuk menghentikan: pm2 stop discord-autoforwarder
echo.
echo Buka browser dan akses: http://localhost:3000
echo ======================================================

REM Buka browser secara otomatis
start http://localhost:3000

pause 