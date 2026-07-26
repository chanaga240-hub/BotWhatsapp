@echo off
:: Comprobar si hay permisos de Administrador
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"

:: Si no hay permisos, solicitar elevación
if '%errorlevel%' NEQ '0' (
    echo Solicitando permisos de Administrador...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    if exist "%temp%\getadmin.vbs" ( del "%temp%\getadmin.vbs" )
    pushd "%CD%"
    CD /D "%~dp0"

:: ---------------------------------------------------
:: A PARTIR DE AQUÍ ESTÁ EL CÓDIGO DE TU BOT
:: ---------------------------------------------------

echo Limpiando PM2 y procesos atascados...
taskkill /F /IM chrome.exe /T >nul 2>&1
call pm2 kill >nul 2>&1

echo Iniciando el Bot de WhatsApp...
cd C:\Users\USER\Desktop\BotWhatsapp
call pm2 start index.js --name "BotWhatsapp"

echo Abriendo el panel de control...
start http://localhost:3000