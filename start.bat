@echo off
REM Script para iniciar RazoConnect
REM Doble click en este archivo para iniciar el servidor

echo.
echo ========================================
echo   🚀 RazoConnect - Iniciando Servidor
echo ========================================
echo.

REM Verificar Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error: Node.js no esta instalado
    pause
    exit /b 1
)

REM Verificar dependencias
if not exist "node_modules" (
    echo 📦 Instalando dependencias...
    call npm install
)

echo ✨ Servidor iniciando en http://localhost:3000
echo 📋 Presiona Ctrl+C para detener el servidor
echo.

REM Iniciar servidor
call npm run dev

pause
