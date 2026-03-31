#!/bin/bash

# =============================================================================
# LIMPIEZA LOCAL - RazoConnect
# Elimina archivos temporales y libera espacio local
# =============================================================================

echo "🧹 Iniciando limpieza local de RazoConnect..."

# Eliminar archivos temporales y cache
echo "📁 Eliminando archivos temporales..."
rm -rf .cache
rm -rf tmp/
rm -rf temp/
rm -rf *.tmp
rm -rf *.temp

# Eliminar logs antiguos (mantener últimos 7 días)
echo "📋 Limpiando logs antiguos..."
find logs/ -name "*.log" -mtime +7 -delete 2>/dev/null || true

# Eliminar archivos de coverage (se generan fresh cada vez)
echo "📊 Eliminando archivos de coverage..."
rm -rf coverage/
rm -rf .nyc_output/

# Limpiar cache de npm
echo "📦 Limpiando cache de npm..."
npm cache clean --force

# Eliminar archivos de desarrollo que no deben estar en el repo
echo "🗑️ Eliminando archivos de desarrollo..."
rm -f .DS_Store
rm -f Thumbs.db
rm -f *.swp
rm -f *.swo
rm -f *.bak
rm -f *.orig
rm -f *.rej

# Limpiar directorios vacíos
echo "📂 Eliminando directorios vacíos..."
find . -type d -empty -delete 2>/dev/null || true

# Mostrar espacio liberado
echo ""
echo "✅ Limpieza completada!"
echo "📊 Espacio liberado:"
du -sh . 2>/dev/null || echo "No se pudo calcular el tamaño"

echo ""
echo "🎯 Para limpiar GitHub Actions artifacts:"
echo "   npm run cleanup:artifacts"
echo ""
echo "🔒 Para revisar seguridad:"
echo "   npm run security:audit"
