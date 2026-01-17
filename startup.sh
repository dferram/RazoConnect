#!/bin/bash

# =========================================
# Azure App Service Startup Script
# =========================================

echo "=========================================="
echo "Iniciando aplicación RazoConnect"
echo "=========================================="

# Directorio de trabajo
cd /home/site/wwwroot

# Verificar que package.json existe
if [ ! -f "package.json" ]; then
  echo "ERROR: package.json no encontrado en $(pwd)"
  exit 1
fi

echo "✓ package.json encontrado"

# SIEMPRE reinstalar dependencias para asegurar que estén actualizadas
echo "Instalando/Actualizando dependencias..."
npm install --production --omit=dev 2>&1 | tee /tmp/npm-install.log

# Verificar que la instalación fue exitosa
if [ $? -ne 0 ]; then
  echo "❌ ERROR: npm install falló"
  cat /tmp/npm-install.log
  exit 1
fi

# Verificar que dotenv está instalado
if [ ! -d "node_modules/dotenv" ]; then
  echo "❌ ERROR CRÍTICO: dotenv no se instaló correctamente"
  echo "Contenido de node_modules:"
  ls -la node_modules/ 2>/dev/null || echo "node_modules no existe"
  echo ""
  echo "Log de npm install:"
  cat /tmp/npm-install.log
  exit 1
fi

echo "✓ Todas las dependencias instaladas correctamente"
echo ""
echo "Información del sistema:"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Working directory: $(pwd)"
echo "Total modules instalados: $(ls -1 node_modules 2>/dev/null | wc -l)"
echo ""
echo "Iniciando servidor Node.js..."

# Iniciar la aplicación
exec node index.js
