#!/bin/bash

# =========================================
# Azure App Service Startup Script
# =========================================

echo "=========================================="
echo "🚀 Iniciando aplicación RazoConnect"
echo "=========================================="

# Directorio de trabajo
cd /home/site/wwwroot

# Verificar que package.json existe
if [ ! -f "package.json" ]; then
  echo "❌ ERROR: package.json no encontrado en $(pwd)"
  exit 1
fi

echo "✅ package.json encontrado"

# Verificar si node_modules existe
if [ ! -d "node_modules" ]; then
  echo "⚠️  node_modules no encontrado. Instalando dependencias..."
  npm install --production --no-optional
else
  echo "✅ node_modules encontrado"
fi

# Verificar que dotenv está instalado
if [ ! -d "node_modules/dotenv" ]; then
  echo "❌ ERROR: dotenv no encontrado. Reinstalando dependencias..."
  rm -rf node_modules package-lock.json
  npm install --production --no-optional
fi

# Verificar nuevamente
if [ ! -d "node_modules/dotenv" ]; then
  echo "❌ ERROR CRÍTICO: No se pudo instalar dotenv"
  echo "Contenido de node_modules:"
  ls -la node_modules/ 2>/dev/null || echo "node_modules no existe"
  exit 1
fi

echo "✅ Todas las dependencias verificadas"
echo ""
echo "📊 Información del sistema:"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Working directory: $(pwd)"
echo "Total modules: $(ls -1 node_modules 2>/dev/null | wc -l)"
echo ""
echo "🚀 Iniciando servidor Node.js..."

# Iniciar la aplicación
exec node index.js
