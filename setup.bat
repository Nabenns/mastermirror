@echo off
setlocal enabledelayedexpansion

title Discord Auto-Forwarder Setup
echo ======================================================
echo Discord Auto-Forwarder Setup v0.1.0
echo (c) 2025 Benss | Discord: .naban
echo ======================================================
echo.

echo Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo Failed to install dependencies. Please check your internet connection.
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo.
echo Installing PM2 globally...
call npm install -g pm2
if %ERRORLEVEL% neq 0 (
    echo.
    echo Warning: Failed to install PM2 globally. You may need administrator rights.
    echo You can try running this script as administrator.
)

echo.
echo Creating data directory...
if not exist "data" mkdir data

echo.
echo Creating .env file...
if exist ".env" (
    echo .env file already exists. Skipping creation.
) else (
    echo PORT=3000 > .env
    echo DISCORD_TOKEN= >> .env
    echo LOG_LEVEL=INFO >> .env
    echo Created default .env file.
)

echo.
echo ======================================================
echo Setup complete! You can run the application using:
echo - autoforwarder.bat (all-in-one control panel)
echo ======================================================

echo.
echo Would you like to run the application now? (Y/N)
choice /c YN /m "Run application: "
IF %ERRORLEVEL% EQU 1 (
    call autoforwarder.bat
) ELSE (
    echo.
    echo You can run the application later by double-clicking autoforwarder.bat
    echo.
    echo Press any key to exit...
    pause >nul
)

endlocal 