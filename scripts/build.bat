@echo off
REM Build script for Hallucinate App on Windows
REM This script builds the application for Windows

setlocal enabledelayedexpansion

echo === Hallucinate App Build Script for Windows ===
echo.

REM Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js 18.x or 20.x
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [INFO] Node.js version: %NODE_VERSION%

REM Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed. Please install npm
    exit /b 1
)
for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo [INFO] npm version: %NPM_VERSION%

REM Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Python is not installed. Some features may not work.
) else (
    for /f "tokens=*" %%i in ('python --version') do set PYTHON_VERSION=%%i
    echo [INFO] Python version: !PYTHON_VERSION!
)

echo.
echo [INFO] Installing dependencies...
if exist package-lock.json (
    call npm ci
) else (
    call npm install
)
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    exit /b 1
)

echo.
echo [INFO] Cleaning previous builds...
if exist out rmdir /s /q out

echo.
echo [INFO] Packaging application...
call npm run package
if %errorlevel% neq 0 (
    echo [ERROR] Failed to package application
    exit /b 1
)

echo.
echo [INFO] Creating Windows installer...
call npm run make -- --platform=win32
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create installer
    exit /b 1
)

echo.
echo [INFO] Build artifacts:
if exist out\make (
    dir /s /b out\make\*.exe out\make\*.nupkg 2>nul
) else (
    echo [WARNING] No build artifacts found in out\make\
)

echo.
echo === Build completed successfully! ===
echo Build artifacts are in the out\ directory

endlocal
