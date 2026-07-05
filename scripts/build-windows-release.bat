@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0build-windows-release.ps1"
endlocal
