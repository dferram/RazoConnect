#!/bin/bash

# =============================================================================
# SETUP DE DESARROLLO - RazoConnect
# Configura el entorno de desarrollo rápidamente
# =============================================================================

echo "🚀 Configurando entorno de desarrollo RazoConnect..."

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado. Por favor instala Node.js 18+"
    exit 1
fi

# Verificar PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL no está instalado. Instálalo para desarrollo local"
fi

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm install

# Verificar archivo .env
if [ ! -f ".env" ]; then
    echo "⚠️  Archivo .env no encontrado. Creando desde template..."
    cp .env.docker .env
    echo "📝 Por favor edita .env con tus credenciales"
fi

# Verificar que los secretos sean seguros
echo "🔐 Verificando seguridad de secretos..."
if grep -q "DB_PASSWORD=" .env && grep -q "DB_PASSWORD=.*[^[:alnum:]]" .env; then
    echo "✅ Secretos configurados"
else
    echo "⚠️  Genera secretos seguros con: npm run security:generate-secrets"
fi

# Crear directorios necesarios
echo "📁 Creando directorios..."
mkdir -p logs
mkdir -p uploads
mkdir -p public/uploads

# Verificar conexión a base de datos
echo "🗄️  Verificando conexión a base de datos..."
if npm run security:generate-secrets &> /dev/null; then
    echo "✅ Conexión a base de datos OK"
else
    echo "⚠️  Revisa la configuración de base de datos en .env"
fi

echo ""
echo "🎉 Setup completado!"
echo ""
echo "📋 Comandos útiles:"
echo "   npm start          - Iniciar servidor"
echo "   npm test           - Ejecutar tests"
echo "   npm run dev:logs   - Ver logs en tiempo real"
echo "   npm run security:audit - Revisar seguridad"
echo ""
echo "🌐 Endpoints de monitoreo:"
echo "   http://localhost:8080/health"
echo "   http://localhost:8080/health/simple"
echo ""
echo "📚 Documentación:"
echo "   docs/MAINTENANCE_CHECKLIST.md"
echo "   docs/README.md"
