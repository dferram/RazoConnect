# 🐋 Docker Deployment Guide - RazoConnect

## 📋 Resumen de Mejoras de Seguridad

Esta guía documenta las optimizaciones de infraestructura implementadas para producción en Azure.

### ✅ Mejoras Implementadas

#### 1. **Dockerfile Multi-Stage con Seguridad Hardening**
- ✅ **Stage 1 (Dependencies)**: Build de dependencias aislado con `node:22-alpine`
- ✅ **Stage 2 (Production)**: Imagen de producción optimizada
- ✅ **Usuario no-root**: `nodejs:nodejs` (UID/GID 1001) para prevenir escalación de privilegios
- ✅ **dumb-init**: Manejo correcto de señales (SIGTERM/SIGINT) para graceful shutdown
- ✅ **HEALTHCHECK**: Verificación automática cada 30s usando endpoint `/health`
- ✅ **Permisos seguros**: Todos los archivos pertenecen al usuario `nodejs`

#### 2. **Health Endpoints para Azure**
- ✅ **`/health`**: Endpoint simple para Docker HEALTHCHECK (200 OK + timestamp)
- ✅ **`/api/health`**: Endpoint detallado con métricas de database, Redis, y pool de conexiones

#### 3. **Docker Compose Hardening**
- ✅ **Variables de entorno**: Eliminadas contraseñas hardcodeadas
- ✅ **Red interna cerrada**: Database NO expuesta externamente (puerto 5432 comentado)
- ✅ **Límites de recursos**: CPU y memoria limitados para prevenir consumo excesivo
- ✅ **Archivo `.env.docker`**: Template para configuración local

---

## 🚀 Inicio Rápido

### 1. Configurar Variables de Entorno

Copia el template y configura tus secretos:

```bash
cp .env.docker .env
```

**Edita `.env` y reemplaza los valores `CHANGE_ME_*`:**

```bash
# Generar secretos seguros (Linux/macOS):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Windows PowerShell:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Variables REQUERIDAS:**
- `DB_PASSWORD`: Contraseña segura para PostgreSQL
- `JWT_SECRET`: Secret de 32+ caracteres para tokens
- `JWT_REFRESH_SECRET`: Secret de 32+ caracteres para refresh tokens
- `SESSION_SECRET`: Secret de 64+ caracteres para sesiones
- `SUPER_ADMIN_KEY`: Clave maestra para operaciones administrativas

### 2. Levantar los Servicios

```bash
# Construir y levantar en modo detached
docker-compose up -d --build

# Ver logs en tiempo real
docker-compose logs -f app

# Verificar estado de salud
curl http://localhost:8080/health
curl http://localhost:8080/api/health
```

### 3. Verificar Funcionamiento

```bash
# Estado de contenedores
docker-compose ps

# Logs de la aplicación
docker-compose logs app

# Logs de la base de datos
docker-compose logs db

# Health check manual
docker exec razoconnect-app wget -qO- http://localhost:8080/health
```

---

## 🔒 Seguridad en Producción

### Red Interna Aislada

La base de datos **NO está expuesta** al exterior:

```yaml
# ❌ Puerto 5432 NO EXPUESTO (comentado en docker-compose.yml)
# ports:
#   - "5432:5432"

# ✅ Solo accesible vía red interna
networks:
  - razoconnect-network
```

**Beneficios:**
- Database solo accesible desde el contenedor `app`
- Previene acceso externo no autorizado
- Reduce superficie de ataque

### Límites de Recursos

Previene que un contenedor consuma todos los recursos del servidor:

```yaml
deploy:
  resources:
    limits:
      cpus: '1.5'      # Máximo 1.5 cores
      memory: 1G       # Máximo 1GB RAM
    reservations:
      cpus: '0.25'     # Mínimo 0.25 cores
      memory: 256M     # Mínimo 256MB RAM
```

### Usuario No-Root

El contenedor **NO corre como root**:

```dockerfile
# Crear usuario nodejs (UID 1001)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Cambiar a usuario no-root
USER nodejs

# Todos los archivos pertenecen a nodejs:nodejs
COPY --chown=nodejs:nodejs . .
```

---

## 🏥 Health Checks

### Endpoint Simple (`/health`)

**Usado por Docker HEALTHCHECK:**

```bash
$ curl http://localhost:8080/health
{
  "status": "ok",
  "timestamp": "2026-03-24T20:51:00.000Z"
}
```

### Endpoint Detallado (`/api/health`)

**Usado por Azure App Service monitoring:**

```bash
$ curl http://localhost:8080/api/health
{
  "status": "ok",
  "timestamp": "2026-03-24T20:51:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "version": "1.0.0",
  "services": {
    "database": "ok",
    "redis": "ok"
  },
  "pool": {
    "totalCount": 10,
    "idleCount": 8,
    "waitingCount": 0
  }
}
```

**Estados posibles:**
- `ok`: Todo funcionando correctamente
- `degraded`: Algunos servicios fallan pero la app funciona
- `error`: Servicio crítico caído

---

## 🛠️ Comandos Útiles

### Gestión de Contenedores

```bash
# Detener todos los servicios
docker-compose down

# Detener y eliminar volúmenes (⚠️ ELIMINA LA BASE DE DATOS)
docker-compose down -v

# Reiniciar un servicio específico
docker-compose restart app

# Reconstruir sin caché
docker-compose build --no-cache app
docker-compose up -d app
```

### Acceso a Contenedores

```bash
# Shell interactivo en el contenedor de la app
docker exec -it razoconnect-app sh

# Shell interactivo en PostgreSQL
docker exec -it razoconnect-db psql -U postgres -d razoconnect_dev

# Ejecutar comando en el contenedor
docker exec razoconnect-app node -v
```

### Logs y Debugging

```bash
# Ver últimas 100 líneas de logs
docker-compose logs --tail=100 app

# Seguir logs en tiempo real
docker-compose logs -f app db

# Ver métricas de recursos
docker stats razoconnect-app razoconnect-db

# Inspeccionar configuración
docker inspect razoconnect-app
```

### Backup de Base de Datos

```bash
# Crear backup
docker exec razoconnect-db pg_dump -U postgres -d razoconnect_dev > backup_$(date +%Y%m%d).sql

# Restaurar backup
cat backup_20260324.sql | docker exec -i razoconnect-db psql -U postgres -d razoconnect_dev
```

---

## 🌐 Despliegue en Azure

### Azure Container Registry (ACR)

```bash
# Login a Azure
az login

# Login a ACR
az acr login --name razoconnectregistry

# Tag de imagen
docker tag razoconnect:latest razoconnectregistry.azurecr.io/razoconnect:latest

# Push a ACR
docker push razoconnectregistry.azurecr.io/razoconnect:latest
```

### Azure App Service con Docker

```bash
# Crear App Service
az webapp create \
  --resource-group razoconnect-rg \
  --plan razoconnect-plan \
  --name razoconnect-api \
  --deployment-container-image-name razoconnectregistry.azurecr.io/razoconnect:latest

# Configurar health check
az webapp config set \
  --resource-group razoconnect-rg \
  --name razoconnect-api \
  --health-check-path /health

# Configurar variables de entorno
az webapp config appsettings set \
  --resource-group razoconnect-rg \
  --name razoconnect-api \
  --settings \
    NODE_ENV=production \
    DB_HOST=razoconnect.postgres.database.azure.com \
    DB_PASSWORD=@Microsoft.KeyVault(SecretUri=https://razoconnect-kv.vault.azure.net/secrets/db-password/)
```

### Azure Key Vault para Secretos

```bash
# Crear Key Vault
az keyvault create \
  --name razoconnect-kv \
  --resource-group razoconnect-rg \
  --location mexicocentral

# Almacenar secretos
az keyvault secret set --vault-name razoconnect-kv --name db-password --value "YourSecurePassword"
az keyvault secret set --vault-name razoconnect-kv --name jwt-secret --value "YourJWTSecret"
az keyvault secret set --vault-name razoconnect-kv --name session-secret --value "YourSessionSecret"

# Otorgar permisos a App Service
az webapp identity assign \
  --resource-group razoconnect-rg \
  --name razoconnect-api

# Configurar política de acceso
az keyvault set-policy \
  --name razoconnect-kv \
  --object-id <WEBAPP_PRINCIPAL_ID> \
  --secret-permissions get list
```

---

## 📊 Monitoreo y Alertas

### Azure Application Insights

```bash
# Habilitar Application Insights
az monitor app-insights component create \
  --app razoconnect-insights \
  --location mexicocentral \
  --resource-group razoconnect-rg

# Vincular con App Service
az webapp config appsettings set \
  --resource-group razoconnect-rg \
  --name razoconnect-api \
  --settings APPINSIGHTS_INSTRUMENTATIONKEY=<INSTRUMENTATION_KEY>
```

### Logs en Tiempo Real

```bash
# Azure CLI
az webapp log tail --resource-group razoconnect-rg --name razoconnect-api

# Azure Portal
# App Service > Monitoring > Log stream
```

---

## 🔧 Troubleshooting

### Container no inicia

```bash
# Ver logs completos
docker-compose logs app

# Verificar variables de entorno
docker exec razoconnect-app env | grep -E 'DB_|JWT_|SESSION'

# Verificar configuración
docker-compose config
```

### Database connection error

```bash
# Verificar que PostgreSQL esté corriendo
docker-compose ps db

# Verificar conectividad desde app
docker exec razoconnect-app ping -c 3 db

# Verificar credenciales
docker exec razoconnect-db psql -U postgres -d razoconnect_dev -c "SELECT version();"
```

### Health check failing

```bash
# Verificar endpoint manualmente
curl -v http://localhost:8080/health

# Ver logs del health check
docker inspect razoconnect-app | grep -A 10 Health

# Verificar que el servidor esté escuchando
docker exec razoconnect-app netstat -tuln | grep 8080
```

### Out of Memory

```bash
# Aumentar límite de memoria en docker-compose.yml
deploy:
  resources:
    limits:
      memory: 2G  # Aumentar de 1G a 2G

# Reiniciar servicios
docker-compose up -d
```

---

## 📚 Referencias

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
- [Azure App Service Documentation](https://docs.microsoft.com/en-us/azure/app-service/)
- [OWASP Docker Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)

---

## 🔐 Checklist de Seguridad para Producción

- [ ] Generar secretos únicos (JWT_SECRET, SESSION_SECRET, etc.)
- [ ] Configurar DB_PASSWORD fuerte (16+ caracteres, alfanumérico + símbolos)
- [ ] Almacenar secretos en Azure Key Vault (NO en .env)
- [ ] Verificar que puerto 5432 NO esté expuesto públicamente
- [ ] Configurar SSL/TLS para PostgreSQL (DB_SSL=true)
- [ ] Habilitar Application Insights para monitoreo
- [ ] Configurar alertas para health check failures
- [ ] Implementar backups automáticos de base de datos
- [ ] Configurar firewall rules en Azure para permitir solo IPs confiables
- [ ] Revisar y actualizar dependencias regularmente (`npm audit`)
- [ ] Configurar rate limiting en Azure Application Gateway
- [ ] Habilitar Azure DDoS Protection

---

**Última actualización:** 24 de marzo de 2026  
**Versión:** 1.0.0  
**Mantenedor:** RazoConnect DevOps Team
