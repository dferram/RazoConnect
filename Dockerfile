# ============================================
# STAGE 1: Dependencies
# ============================================
FROM node:22-alpine AS dependencies

WORKDIR /app

# Copiar solo package files para aprovechar cache de Docker
COPY package*.json ./

# Instalar SOLO dependencias de producción
RUN npm ci --only=production && \
    npm cache clean --force

# ============================================
# STAGE 2: Production
# ============================================
FROM node:22-alpine AS production

# Metadata
LABEL maintainer="RazoConnect Team"
LABEL description="RazoConnect - Multi-tenant E-commerce Platform"
LABEL version="1.0.0"

# Instalar dumb-init para manejo correcto de señales (SIGTERM, SIGINT)
RUN apk add --no-cache dumb-init

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copiar dependencias de producción desde stage 1
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copiar código fuente (excluir archivos innecesarios con .dockerignore)
COPY --chown=nodejs:nodejs . .

# Crear directorios necesarios con permisos correctos
RUN mkdir -p logs uploads && \
    chown -R nodejs:nodejs logs uploads

# Cambiar a usuario no-root
USER nodejs

# Exponer puerto
EXPOSE 8080

# Variables de entorno por defecto
ENV NODE_ENV=production \
    PORT=8080

# Health check - verifica que el servidor responda correctamente
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Usar dumb-init para manejo correcto de señales (graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]

# Comando de inicio - usar node directamente en lugar de npm
CMD ["node", "index.js"]