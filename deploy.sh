#!/bin/bash

# =========================================
# Azure App Service Deployment Script
# =========================================

set -e

echo "=========================================="
echo "🚀 Iniciando deployment en Azure"
echo "=========================================="

# Variables
DEPLOYMENT_SOURCE="${DEPLOYMENT_SOURCE:-$PWD}"
DEPLOYMENT_TARGET="${DEPLOYMENT_TARGET:-/home/site/wwwroot}"

echo "📂 Source: $DEPLOYMENT_SOURCE"
echo "📂 Target: $DEPLOYMENT_TARGET"

# 1. Copiar archivos al directorio de destino
echo ""
echo "📦 Copiando archivos..."
if [ -d "$DEPLOYMENT_TARGET" ]; then
  rm -rf "$DEPLOYMENT_TARGET"/*
fi
cp -r "$DEPLOYMENT_SOURCE"/* "$DEPLOYMENT_TARGET"/

# 2. Navegar al directorio de destino
cd "$DEPLOYMENT_TARGET"

# 3. Verificar que package.json existe
if [ ! -f "package.json" ]; then
  echo "❌ ERROR: package.json no encontrado"
  exit 1
fi

echo ""
echo "📋 package.json encontrado"
cat package.json

# 4. Limpiar node_modules si existe
if [ -d "node_modules" ]; then
  echo ""
  echo "🧹 Limpiando node_modules existente..."
  rm -rf node_modules
fi

# 5. Limpiar package-lock.json si existe
if [ -f "package-lock.json" ]; then
  echo "🧹 Limpiando package-lock.json..."
  rm -f package-lock.json
fi

# 6. Instalar dependencias
echo ""
echo "📥 Instalando dependencias con npm install..."
npm install --production --no-optional --loglevel=verbose

# 7. Verificar que dotenv se instaló
echo ""
echo "🔍 Verificando instalación de dotenv..."
if [ -d "node_modules/dotenv" ]; then
  echo "✅ dotenv instalado correctamente"
  ls -la node_modules/dotenv/
else
  echo "❌ ERROR: dotenv NO se instaló"
  echo "Contenido de node_modules:"
  ls -la node_modules/ | head -20
  exit 1
fi

# 8. Verificar módulos críticos
echo ""
echo "🔍 Verificando módulos críticos..."
CRITICAL_MODULES=("express" "pg" "bcrypt" "jsonwebtoken" "cors")
for module in "${CRITICAL_MODULES[@]}"; do
  if [ -d "node_modules/$module" ]; then
    echo "✅ $module instalado"
  else
    echo "❌ ERROR: $module NO instalado"
    exit 1
  fi
done

# 9. Mostrar estadísticas
echo ""
echo "📊 Estadísticas de instalación:"
echo "Total de módulos instalados: $(ls -1 node_modules | wc -l)"
echo "Tamaño de node_modules: $(du -sh node_modules)"

echo ""
echo "=========================================="
echo "✅ Deployment completado exitosamente"
echo "=========================================="
