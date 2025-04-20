@echo off
setlocal enabledelayedexpansion

title Discord Auto-Forwarder Control Panel
color 0B
mode con: cols=80 lines=30

:menu
cls
echo ======================================================================
echo                  DISCORD AUTO-FORWARDER CONTROL PANEL
echo                  (c) 2025 Benss | Discord: .naban
echo ======================================================================
echo.
echo  Current status:
call :check_status
echo.
echo  [1] Start Discord Auto-Forwarder
echo  [2] Stop Discord Auto-Forwarder
echo  [3] Setup Configuration (.env)
echo  [4] Setup ngrok
echo  [5] Start ngrok tunnel
echo  [6] Push to GitHub
echo  [7] Exit
echo.
echo ======================================================================
echo.

set /p choice="Select an option (1-7): "

if "%choice%"=="1" goto start_autoforwarder
if "%choice%"=="2" goto stop_autoforwarder
if "%choice%"=="3" goto setup_env
if "%choice%"=="4" goto setup_ngrok
if "%choice%"=="5" goto start_ngrok
if "%choice%"=="6" goto github_push
if "%choice%"=="7" goto exit_app

echo.
echo Invalid choice. Please try again.
timeout /t 2 >nul
goto menu

:check_status
set "pid_found=false"
set "port_found=false"

REM Try to find the default port in .env file
set "PORT=3000"
if exist ".env" (
    for /f "tokens=1,* delims==" %%a in (.env) do (
        if "%%a"=="PORT" (
            set "PORT=%%b"
            set "PORT=!PORT: =!"
        )
    )
)

REM Check if node is running the index.js file
for /f "tokens=1,5" %%a in ('tasklist /fi "imagename eq node.exe" /fo table /nh 2^>nul') do (
    if "%%a"=="node.exe" (
        for /f "tokens=2 delims=," %%c in ('tasklist /fi "PID eq %%b" /v /fo csv 2^>nul ^| findstr /i "index.js"') do (
            set "pid_found=true"
        )
    )
)

REM Check if port is in use
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":!PORT!" 2^>nul') do (
    set "port_found=true"
)

if "%pid_found%"=="true" (
    echo   [32m● RUNNING[0m - Discord Auto-Forwarder is active
) else (
    if "%port_found%"=="true" (
        echo   [33m● PORT IN USE[0m - Port !PORT! is used by another application
    ) else (
        echo   [31m● STOPPED[0m - Discord Auto-Forwarder is not running
    )
)

exit /b

:start_autoforwarder
cls
echo ======================================================================
echo               STARTING DISCORD AUTO-FORWARDER
echo ======================================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [31mNode.js is not installed. Please install Node.js to run this application.[0m
    echo Visit https://nodejs.org to download and install Node.js.
    echo.
    pause
    goto menu
)

REM Check if .env file exists
if not exist .env (
    echo [31mNo .env file found. Please set up the configuration first.[0m
    echo.
    set /p answer="Do you want to run the setup now? (y/n): "
    if /i "!answer!"=="y" (
        call :setup_env
    ) else (
        pause
        goto menu
    )
)

REM Check if the port is already in use
set PORT=3000
for /f "tokens=1" %%i in ('findstr /B "PORT" .env') do (
    set PORT_VAR=%%i
    for /f "tokens=2 delims==" %%j in ("!PORT_VAR!") do (
        set PORT=%%j
    )
)

netstat -ano | find "LISTENING" | find ":%PORT%" >nul
if %ERRORLEVEL% equ 0 (
    echo [33mWarning: Port %PORT% is already in use.[0m
    echo This could mean the Auto-Forwarder is already running,
    echo or another application is using this port.
    echo.
    set /p answer="Do you want to force stop any process using port %PORT%? (y/n): "
    if /i "!answer!"=="y" (
        for /f "tokens=5" %%p in ('netstat -ano ^| find "LISTENING" ^| find ":%PORT%"') do (
            taskkill /F /PID %%p >nul 2>nul
            if !ERRORLEVEL! equ 0 (
                echo [32mProcess stopped successfully.[0m
            ) else (
                echo [31mFailed to stop process. You might need to run this script as administrator.[0m
                pause
                goto menu
            )
        )
    ) else (
        echo Operation cancelled by user.
        pause
        goto menu
    )
)

REM Check if node_modules directory exists
if not exist node_modules (
    echo [33mNode modules not found. Installing dependencies...[0m
    call npm install
    if !ERRORLEVEL! neq 0 (
        echo [31mFailed to install dependencies. Please check your internet connection and try again.[0m
        pause
        goto menu
    )
    echo [32mDependencies installed successfully.[0m
)

echo [32mStarting Discord Auto-Forwarder...[0m
echo [33mLog files will be saved in the logs directory.[0m
echo.
echo [36mPress Ctrl+C to stop the application.[0m
echo [36mThe application will continue running in the background.[0m
echo.

REM Start the application in a new window
start cmd /c "node index.js"
echo [32mDiscord Auto-Forwarder has been started![0m
echo.
pause
goto menu

:stop_autoforwarder
cls
echo ======================================================================
echo               STOPPING DISCORD AUTO-FORWARDER
echo ======================================================================
echo.

REM Try to find the default port in .env file
set "PORT=3000"
if exist ".env" (
    for /f "tokens=1,* delims==" %%a in (.env) do (
        if "%%a"=="PORT" (
            set "PORT=%%b"
            set "PORT=!PORT: =!"
        )
    )
)

REM Check for running application
set /a found=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":!PORT!" 2^>nul') do (
    set /a found+=1
    set pid=%%a
)

if %found% equ 0 (
    echo [33mDiscord Auto-Forwarder is not running.[0m
    echo.
    pause
    goto menu
)

echo Found Discord Auto-Forwarder running with PID: %pid%
echo Stopping process...

REM Attempt to kill the process
taskkill /F /PID %pid% >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [32mDiscord Auto-Forwarder stopped successfully.[0m
) else (
    echo [31mFailed to stop Discord Auto-Forwarder. Try closing it manually.[0m
)

timeout /t 1 >nul

REM Verify process is stopped
set /a still_running=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":!PORT!" 2^>nul') do (
    set /a still_running+=1
)

if %still_running% neq 0 (
    echo [31mWARNING: Port !PORT! is still in use. Application may not be fully stopped.[0m
) else (
    echo [32mPort !PORT! is now free.[0m
)

echo.
pause
goto menu

:setup_env
cls
echo ======================================================================
echo               DISCORD AUTO-FORWARDER SETUP WIZARD
echo ======================================================================
echo.

REM Check if .env file exists
if exist .env (
    echo [33mAn existing .env file was found.[0m
    set /p answer="Do you want to recreate it? (y/n): "
    if /i "!answer!" neq "y" (
        echo Setup cancelled. Your existing .env file was preserved.
        pause
        goto menu
    )
)

echo Creating new .env file...
echo # Discord Auto-Forwarder Configuration > .env
echo # Created on %date% at %time% >> .env
echo. >> .env

REM Get Discord token
:discord_token
echo.
echo [36mPlease enter your Discord user token.[0m
echo [33mNote: This is required for the application to function.[0m
set /p token="Discord token: "

if "!token!"=="" (
    echo [31mThe Discord token cannot be empty.[0m
    goto discord_token
)

echo DISCORD_TOKEN=!token! >> .env
echo [32mDiscord token saved![0m

REM Get port (with default)
echo.
echo [36mPlease enter the port for the web interface.[0m
echo [33mPress Enter to use the default port (3000).[0m
set /p port="Port [3000]: "

if "!port!"=="" (
    set port=3000
)

echo PORT=!port! >> .env
echo [32mPort saved as !port!![0m

REM Get log level (with default)
echo.
echo [36mPlease select the log level:[0m
echo [33m1 = DEBUG (most verbose)[0m
echo [33m2 = INFO (recommended)[0m
echo [33m3 = WARN (less verbose)[0m
echo [33m4 = ERROR (least verbose)[0m
set /p log_level="Log level [2]: "

if "!log_level!"=="" (
    set log_level=2
)

if "!log_level!"=="1" (
    echo LOG_LEVEL=DEBUG >> .env
    echo [32mLog level set to DEBUG![0m
) else if "!log_level!"=="2" (
    echo LOG_LEVEL=INFO >> .env
    echo [32mLog level set to INFO![0m
) else if "!log_level!"=="3" (
    echo LOG_LEVEL=WARN >> .env
    echo [32mLog level set to WARN![0m
) else if "!log_level!"=="4" (
    echo LOG_LEVEL=ERROR >> .env
    echo [32mLog level set to ERROR![0m
) else (
    echo LOG_LEVEL=INFO >> .env
    echo [33mInvalid option. Log level set to INFO (default).[0m
)

REM Create logs directory if it doesn't exist
if not exist logs (
    mkdir logs
    echo Created logs directory.
)

echo.
echo [32m✓ Setup complete! The application has been configured.[0m
echo [32m  You can now start the Discord Auto-Forwarder.[0m
echo.

pause
goto menu

:setup_ngrok
cls
echo ======================================================================
echo               DISCORD AUTO-FORWARDER - NGROK SETUP
echo ======================================================================
echo.
echo This script will help you set up ngrok for remote access.
echo.

:: Check if ngrok is already installed
where ngrok >nul 2>nul
if %errorlevel% equ 0 (
    echo Ngrok is already installed on your system.
) else (
    echo Ngrok is not installed. Downloading ngrok...
    
    :: Determine system architecture
    reg Query "HKLM\Hardware\Description\System\CentralProcessor\0" | find /i "x86" > NUL && set ARCH=32 || set ARCH=64
    
    :: Create downloads directory if it doesn't exist
    if not exist "downloads" mkdir downloads
    
    :: Download ngrok based on architecture
    if !ARCH! == 32 (
        echo Downloading 32-bit version of ngrok...
        powershell -Command "Invoke-WebRequest -Uri 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-386.zip' -OutFile 'downloads\ngrok.zip'"
    ) else (
        echo Downloading 64-bit version of ngrok...
        powershell -Command "Invoke-WebRequest -Uri 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip' -OutFile 'downloads\ngrok.zip'"
    )
    
    :: Check if download was successful
    if not exist "downloads\ngrok.zip" (
        echo Failed to download ngrok. Please check your internet connection and try again.
        pause
        goto menu
    )
    
    echo Extracting ngrok...
    powershell -Command "Expand-Archive -Force -Path 'downloads\ngrok.zip' -DestinationPath '.'"
    
    :: Check if extraction was successful
    if not exist "ngrok.exe" (
        echo Failed to extract ngrok. Please try downloading it manually from https://ngrok.com/download
        pause
        goto menu
    )
    
    echo Ngrok has been downloaded and extracted successfully.
)

:: Check if ngrok is already authenticated
ngrok config check >nul 2>nul
if %errorlevel% equ 0 (
    echo Ngrok is already authenticated.
) else (
    echo.
    echo To use ngrok, you need to authenticate with your authtoken.
    echo If you don't have an ngrok account, please create one at https://ngrok.com/signup
    echo.
    set /p AUTHTOKEN="Enter your ngrok authtoken: "
    
    if "!AUTHTOKEN!" == "" (
        echo No authtoken provided. Authentication skipped.
    ) else (
        echo Authenticating ngrok...
        ngrok config add-authtoken !AUTHTOKEN!
        
        if %errorlevel% equ 0 (
            echo Ngrok authentication successful!
        ) else (
            echo Ngrok authentication failed. Please check your authtoken and try again.
        )
    )
)

echo.
echo Ngrok setup complete!
echo You can now start an ngrok tunnel to your Discord Auto-Forwarder.
echo.

pause
goto menu

:start_ngrok
cls
echo ======================================================================
echo               DISCORD AUTO-FORWARDER - NGROK TUNNEL
echo ======================================================================
echo.
echo This will start an ngrok tunnel to your Discord Auto-Forwarder.
echo.

:: Check if ngrok is installed
where ngrok >nul 2>nul
if %errorlevel% neq 0 (
    echo Ngrok is not installed. Please set up ngrok first.
    pause
    goto menu
)

:: Check if .env file exists to read port
set "PORT=3000"
if exist ".env" (
    echo Reading port from .env file...
    for /f "tokens=1,* delims==" %%a in (.env) do (
        if "%%a"=="PORT" (
            set "PORT=%%b"
            echo Found PORT=!PORT! in .env file.
        )
    )
) else (
    echo No .env file found. Using default port 3000.
)

:: Remove whitespace from PORT variable
set "PORT=!PORT: =!"

echo Starting ngrok tunnel on port !PORT!...
echo.
echo Your Discord Auto-Forwarder will be accessible at the URL shown below.
echo The tunnel will start in a new window. Close that window to stop the tunnel.
echo.

:: Start ngrok tunnel in a new window
start cmd /c "ngrok http !PORT!"

echo Ngrok tunnel started in a new window.
echo.
pause
goto menu

:github_push
cls
echo ======================================================================
echo               DISCORD AUTO-FORWARDER - GITHUB PUSH
echo ======================================================================
echo.
echo This will help you push your changes to GitHub.
echo.

:: Check if git is installed
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo Git is not installed. Please install Git to use this feature.
    echo Visit https://git-scm.com/ to download and install Git.
    echo.
    pause
    goto menu
)

:: Check if the directory is a git repository
if not exist ".git" (
    echo This directory is not a Git repository.
    echo.
    set /p initrepo="Would you like to initialize it as a Git repository? (y/n): "
    if /i "!initrepo!"=="y" (
        git init
        echo Repository initialized.
        echo.
    ) else (
        echo Operation cancelled.
        echo.
        pause
        goto menu
    )
)

:: Check git status
echo Checking git status...
git status
echo.

:: Add files to staging
set /p addall="Add all changes to staging? (y/n): "
if /i "!addall!"=="y" (
    git add .
) else (
    echo.
    echo Please specify which files to add (leave blank to skip):
    set /p files="Files to add (space-separated): "
    if not "!files!"=="" (
        git add !files!
    )
)

:: Commit changes
echo.
echo Please enter a commit message:
set /p commitmsg="Commit message: "

if "!commitmsg!"=="" (
    echo No commit message provided. Using default message.
    echo.
    git commit -m "[Cursor] Update Discord Auto-Forwarder"
) else (
    git commit -m "[Cursor] !commitmsg!"
)

:: Check remote repository
git remote -v > nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo No remote repository configured.
    set /p remoterepo="Please enter the GitHub repository URL: "
    
    if "!remoterepo!"=="" (
        echo No repository URL provided. Skipping push.
    ) else (
        git remote add origin !remoterepo!
        echo Remote repository added.
    )
)

:: Push to remote repository
echo.
set /p branchname="Enter branch name to push to (default is main): "
if "!branchname!"=="" set branchname=main

echo.
echo Pushing to !branchname! branch...
git push -u origin !branchname!

if %errorlevel% equ 0 (
    echo.
    echo Successfully pushed changes to GitHub.
) else (
    echo.
    echo Failed to push changes. Please check your repository settings and try again.
)

echo.
pause
goto menu

:exit_app
cls
echo ======================================================================
echo                           GOODBYE!
echo ======================================================================
echo.
echo Thank you for using Discord Auto-Forwarder!
echo.
endlocal
exit /b 0 