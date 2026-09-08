@echo off
setlocal
echo.
echo ====================================================
echo   Beacon Incident Management - SQL Backend Launcher
echo ====================================================
echo.

REM Determine Node.js runtime (local executable or system PATH)
set "NODE_CMD="
if exist "%~dp0node.exe" (
    set "NODE_CMD=%~dp0node.exe"
) else (
    where node >nul 2>&1
    if %errorlevel% equ 0 (
        set "NODE_CMD=node"
    )
)

if "%NODE_CMD%"=="" (
    echo [!] Node.js runtime not found in PATH or project root.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Runtime detected: %NODE_CMD%
"%NODE_CMD%" -v
echo.

REM Check for .env file
if not exist "%~dp0.env" (
    echo [i] Creating .env from template...
    copy "%~dp0.env.example" "%~dp0.env" >nul
    echo [OK] Created .env file.
)

REM Check dependencies
if not exist "%~dp0node_modules" (
    echo Installing project dependencies...
    if exist "%~dp0deno.exe" (
        "%~dp0deno.exe" install
    ) else (
        call npm install
    )
)

echo [OK] SQL Database (beacon.db) ready.
echo.
echo ====================================================
echo   Starting Beacon SQL Server...
echo   URL: http://localhost:3000
echo   SQL CLI: run "node query-db.js" in another terminal
echo ====================================================
echo.

start http://localhost:3000
"%NODE_CMD%" "%~dp0server.js"
