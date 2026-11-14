@echo off
chcp 65001 >nul
title Henan ICH Platform - Backend
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto NONODE

node "%~dp0..\launcher.js"
echo.
echo   [INFO] Server stopped. Press any key to close this window.
pause >nul
exit /b 0

:NONODE
echo.
echo   [ERROR] Node.js 20+ is required but was not found.
echo           Please install it from https://nodejs.org/ and run this file again.
echo.
pause >nul
exit /b 1
