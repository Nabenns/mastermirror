@echo off
echo Starting Discord Auto-Forwarder with Docker...
echo.

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Docker is not running or not installed.
    echo Please start Docker Desktop and try again.
    pause
    exit /b
)

echo Building and starting containers...
docker-compose up -d --build

echo.
echo Application started successfully!
echo Dashboard: http://localhost:3000
echo.
echo Streaming logs (Press Ctrl+C to stop viewing logs, app will continue running)...
echo.
docker-compose logs -f
pause
