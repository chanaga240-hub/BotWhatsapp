@echo off
title Bot Pokemon WhatsApp - Instalacion
cd /d "%~dp0"

echo.
echo ========================================
echo   INSTALACION - Bot Pokemon WhatsApp
echo ========================================
echo.
echo Carpeta: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js no esta instalado.
    echo.
    echo Descargalo desde: https://nodejs.org
    echo Instala la version LTS y vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
)

echo Node.js detectado:
node -v
npm -v
echo.
echo Instalando dependencias... (puede tardar varios minutos)
echo.

call npm install

if errorlevel 1 (
    echo.
    echo [ERROR] La instalacion fallo. Revisa los mensajes de arriba.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Instalacion completada con exito.
echo.
echo   Ahora ejecuta: iniciar.bat
echo   O abre PowerShell aqui y escribe: npm start
echo ========================================
echo.
pause
