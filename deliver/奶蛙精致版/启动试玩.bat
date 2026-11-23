@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Milk Frog Demo
"%~dp0_runtime\node.exe" "%~dp0server.cjs" %*
if errorlevel 1 pause
