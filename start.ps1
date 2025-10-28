# Script para iniciar RazoConnect
# Ejecuta: .\start.ps1

Write-Host "🚀 Iniciando servidor RazoConnect..." -ForegroundColor Cyan
Write-Host ""

# Verificar que Node.js esté instalado
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: Node.js no está instalado" -ForegroundColor Red
    exit 1
}

# Verificar que las dependencias estén instaladas
if (!(Test-Path "node_modules")) {
    Write-Host "📦 Instalando dependencias..." -ForegroundColor Yellow
    npm install
}

# Iniciar el servidor
Write-Host "✨ Servidor iniciando en http://localhost:3000" -ForegroundColor Green
Write-Host "📋 Presiona Ctrl+C para detener el servidor" -ForegroundColor Yellow
Write-Host ""

# Ejecutar con nodemon si está disponible, sino con node
if (Test-Path "node_modules\.bin\nodemon.ps1") {
    npm run dev
} else {
    npm start
}
