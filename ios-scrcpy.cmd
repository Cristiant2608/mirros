@echo off
setlocal
set "PYTHONUTF8=1"
set "PYTHONUNBUFFERED=1"
set "PYTHONPATH=%~dp0src;%PYTHONPATH%"
if not exist "%~dp0.venv\Scripts\python.exe" (
    echo [!] Ejecuta setup.ps1 primero para crear el entorno Python.
    exit /b 1
)
"%~dp0.venv\Scripts\python.exe" -m ios_scrcpy.cli %*
exit /b %errorlevel%
