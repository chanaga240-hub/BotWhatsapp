@echo off
title Bot Pokemon WhatsApp
cd /d "%~dp0"

echo.
echo ========================================
echo   Bot Pokemon WhatsApp
echo ========================================
echo Carpeta: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no esta instalado.
    echo Descargalo desde: https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo No hay dependencias instaladas.
    echo Ejecuta primero: instalar.bat
    echo.
    pause
    exit /b 1
)

echo Iniciando servidor...
echo.
echo   Panel web: http://localhost:3000
echo.
echo   Abre esa direccion en tu navegador.
echo   NO cierres esta ventana mientras uses el bot.
echo   Para detener: Ctrl+C o cierra esta ventana.
echo.
echo ========================================
echo.

call npm start

echo.
pause
