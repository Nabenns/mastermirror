@echo off
echo ======================================================
echo Discord Auto-Forwarder Setup v0.1.0
echo (c) 2025 Benss | Discord: .naban
echo ======================================================
echo.

echo Menginstal dependency...
call npm install

echo.
echo Menginstal PM2 secara global...
call npm install -g pm2

echo.
echo Membuat direktori data...
if not exist "data" mkdir data

echo.
echo Membuat file .env...
echo PORT=3000 > .env

echo.
echo ======================================================
echo Setup selesai! Anda dapat menjalankan aplikasi dengan:
echo - start-autoforwarder.bat untuk menjalankan
echo - stop-autoforwarder.bat untuk menghentikan
echo - restart-autoforwarder.bat untuk me-restart
echo - view-logs.bat untuk melihat log
echo ======================================================

echo.
echo Apakah Anda ingin menjalankan aplikasi sekarang? (Y/N)
choice /c YN /m "Jalankan aplikasi: "
IF %ERRORLEVEL% EQU 1 call start-autoforwarder.bat

pause 