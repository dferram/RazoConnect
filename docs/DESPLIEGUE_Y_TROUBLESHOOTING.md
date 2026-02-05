# Guía de Despliegue y Troubleshooting

## Tabla de Contenidos

1. [Requisitos Previos](#requisitos-previos)
2. [Configuración del Entorno](#configuración-del-entorno)
3. [Despliegue en Azure](#despliegue-en-azure)
4. [Configuración de Base de Datos](#configuración-de-base-de-datos)
5. [Configuración de Dominios](#configuración-de-dominios)
6. [CI/CD con GitHub Actions](#cicd-con-github-actions)
7. [Problemas Comunes y Soluciones](#problemas-comunes-y-soluciones)
8. [Monitoreo y Logs](#monitoreo-y-logs)
9. [Mantenimiento](#mantenimiento)
10. [Rollback y Recuperación](#rollback-y-recuperación)

## Requisitos Previos

### Software Necesario

#### Desarrollo Local
- Node.js v18 o superior
- PostgreSQL v17 o superior
- Git
- Editor de código (VS Code recomendado)
- Cliente PostgreSQL (pgAdmin, DBeaver, o psql)

#### Producción
- Cuenta de Azure con suscripción activa
- Azure CLI instalado
- Cuenta de GitHub
- Cuenta de Cloudinary (para imágenes)
- Cuenta de proveedor de email (SMTP)

### Conocimientos Técnicos
- JavaScript/Node.js
- SQL y PostgreSQL
- Git y control de versiones
- Conceptos de CI/CD
- Configuración de DNS

## Configuración del Entorno

### 1. Clonar el Repositorio

```bash
git clone https://github.com/tu-usuario/RazoConnect.git
cd RazoConnect
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Configurar Variables de Entorno

Crear archivo `.env` en la raíz del proyecto:

```env
# Entorno
NODE_ENV=development

# Base de Datos
DB_HOST=localhost
DB_PORT=5432
DB_NAME=razoconnect
DB_USER=postgres
DB_PASSWORD=tu_password_seguro
DB_SSL=false

# Seguridad
JWT_SECRET=tu_jwt_secret_muy_seguro_minimo_32_caracteres
SESSION_SECRET=tu_session_secret_muy_seguro_minimo_32_caracteres

# Desarrollo Local (opcional)
FORCE_TENANT_ID=1

# Puerto del Servidor
PORT=3000

# Cloudinary (Imágenes)
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret

# Email (SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_password_de_aplicacion
EMAIL_FROM=noreply@tudominio.com

# MercadoPago (Pagos)
MERCADOPAGO_ACCESS_TOKEN=tu_access_token

# Frontend Base URL
FRONTEND_BASE_URL=http://localhost:3000

# Super Admin Key (para registro de admins)
SUPER_ADMIN_KEY=tu_clave_super_secreta
```

### 4. Configurar Base de Datos Local

#### Crear Base de Datos

```bash
# Conectar a PostgreSQL
psql -U postgres

# Crear base de datos
CREATE DATABASE razoconnect;

# Conectar a la base de datos
\c razoconnect

# Salir
\q
```

#### Restaurar Backup

Si tienes un archivo de backup (ej. `backup11.sql`):

```bash
psql -U postgres -d razoconnect -f backup/backup11.sql
```

#### Crear Tablas Manualmente

Si no tienes backup, ejecutar los scripts SQL de creación de tablas en orden:

1. Tablas globales (tenants, estados, developers)
2. Tablas de usuarios (administradores, clientes, agentesdeventas)
3. Tablas de productos (productos, producto_variantes, categorias)
4. Tablas de inventario
5. Tablas de pedidos y transacciones

### 5. Crear Tenant de Prueba

```sql
INSERT INTO tenants (nombre_cliente, dominio, tema, is_active)
VALUES ('Razo', 'localhost', 'razo', true);
```

### 6. Iniciar Servidor de Desarrollo

```bash
npm start
```

O con nodemon para auto-reload:

```bash
npm install -g nodemon
nodemon index.js
```

### 7. Verificar Funcionamiento

Abrir navegador en `http://localhost:3000`

Verificar endpoints:
- `http://localhost:3000/api` - Debe retornar mensaje de bienvenida
- `http://localhost:3000/api/health` - Debe retornar estado de BD

## Despliegue en Azure

### 1. Crear Recursos en Azure

#### Opción A: Portal de Azure

1. Acceder a [portal.azure.com](https://portal.azure.com)
2. Crear Resource Group:
   - Nombre: `RazoConnect-RG`
   - Región: `East US` o la más cercana

3. Crear Azure Database for PostgreSQL:
   - Nombre: `razoconnect-db`
   - Versión: PostgreSQL 17
   - Compute + Storage: Según necesidades (mínimo Basic)
   - Habilitar acceso desde Azure Services
   - Configurar firewall para permitir tu IP

4. Crear App Service:
   - Nombre: `razoconnect-api`
   - Runtime: Node 18 LTS
   - Sistema Operativo: Linux
   - Plan: B1 o superior
   - Región: Misma que la BD

#### Opción B: Azure CLI

```bash
# Login
az login

# Crear Resource Group
az group create --name RazoConnect-RG --location eastus

# Crear PostgreSQL Server
az postgres flexible-server create \
  --resource-group RazoConnect-RG \
  --name razoconnect-db \
  --location eastus \
  --admin-user adminuser \
  --admin-password TuPasswordSeguro123! \
  --sku-name Standard_B1ms \
  --version 17

# Crear App Service Plan
az appservice plan create \
  --name RazoConnect-Plan \
  --resource-group RazoConnect-RG \
  --sku B1 \
  --is-linux

# Crear Web App
az webapp create \
  --resource-group RazoConnect-RG \
  --plan RazoConnect-Plan \
  --name razoconnect-api \
  --runtime "NODE:18-lts"
```

### 2. Configurar Variables de Entorno en Azure

#### Portal de Azure

1. Ir a App Service > Configuration > Application settings
2. Agregar cada variable de entorno:

```
NODE_ENV=production
DB_HOST=razoconnect-db.postgres.database.azure.com
DB_PORT=5432
DB_NAME=razoconnect
DB_USER=adminuser
DB_PASSWORD=TuPasswordSeguro123!
DB_SSL=true
JWT_SECRET=tu_jwt_secret_produccion
SESSION_SECRET=tu_session_secret_produccion
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
EMAIL_HOST=...
EMAIL_PORT=...
EMAIL_USER=...
EMAIL_PASSWORD=...
MERCADOPAGO_ACCESS_TOKEN=...
FRONTEND_BASE_URL=https://razo.com.mx
SUPER_ADMIN_KEY=...
```

3. Guardar cambios (esto reiniciará la app)

#### Azure CLI

```bash
az webapp config appsettings set \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --settings \
    NODE_ENV=production \
    DB_HOST=razoconnect-db.postgres.database.azure.com \
    DB_PORT=5432 \
    DB_NAME=razoconnect \
    DB_USER=adminuser \
    DB_PASSWORD=TuPasswordSeguro123! \
    DB_SSL=true \
    JWT_SECRET=tu_jwt_secret_produccion
```

### 3. Configurar Base de Datos en Azure

#### Conectar a PostgreSQL en Azure

```bash
psql "host=razoconnect-db.postgres.database.azure.com port=5432 dbname=postgres user=adminuser password=TuPasswordSeguro123! sslmode=require"
```

#### Crear Base de Datos

```sql
CREATE DATABASE razoconnect;
\c razoconnect
```

#### Restaurar Backup

```bash
psql "host=razoconnect-db.postgres.database.azure.com port=5432 dbname=razoconnect user=adminuser password=TuPasswordSeguro123! sslmode=require" -f backup/backup11.sql
```

#### Configurar Firewall

En Azure Portal > PostgreSQL Server > Connection security:
- Agregar regla para tu IP
- Habilitar "Allow access to Azure services"

### 4. Desplegar Código

#### Opción A: GitHub Actions (Recomendado)

Ver sección [CI/CD con GitHub Actions](#cicd-con-github-actions)

#### Opción B: Despliegue Manual con Git

```bash
# Configurar remote de Azure
az webapp deployment source config-local-git \
  --name razoconnect-api \
  --resource-group RazoConnect-RG

# Agregar remote
git remote add azure https://razoconnect-api.scm.azurewebsites.net/razoconnect-api.git

# Desplegar
git push azure main
```

#### Opción C: Despliegue con ZIP

```bash
# Crear ZIP del proyecto (sin node_modules)
zip -r deploy.zip . -x "node_modules/*" -x ".git/*"

# Desplegar
az webapp deployment source config-zip \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --src deploy.zip
```

### 5. Verificar Despliegue

```bash
# Ver logs en tiempo real
az webapp log tail \
  --resource-group RazoConnect-RG \
  --name razoconnect-api

# Verificar estado
curl https://razoconnect-api.azurewebsites.net/api/health
```

## Configuración de Base de Datos

### Encoding y Charset

**PROBLEMA CRÍTICO**: Errores de encoding con acentos y caracteres especiales.

#### Solución: Configurar UTF-8 en PostgreSQL

```sql
-- Verificar encoding actual
SHOW server_encoding;
SHOW client_encoding;

-- Configurar encoding de la base de datos
ALTER DATABASE razoconnect SET client_encoding TO 'UTF8';

-- Configurar encoding de la sesión
SET client_encoding = 'UTF8';
```

#### En Conexión desde Node.js

```javascript
// db.js
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  // CRÍTICO: Forzar UTF-8
  client_encoding: 'UTF8'
});
```

#### Verificar Datos Existentes

Si ya tienes datos con encoding incorrecto:

```sql
-- Identificar registros con problemas
SELECT * FROM productos WHERE nombre LIKE '%�%';

-- Corregir manualmente o reimportar
UPDATE productos 
SET nombre = 'Descripción correcta'
WHERE productoid = 123;
```

### Índices para Performance

```sql
-- Índices en tenant_id (CRÍTICO para Multi-Tenant)
CREATE INDEX idx_productos_tenant ON productos(tenant_id);
CREATE INDEX idx_clientes_tenant ON clientes(tenant_id);
CREATE INDEX idx_pedidos_tenant ON pedidos(tenant_id);
CREATE INDEX idx_inventario_tenant ON inventario(tenant_id);

-- Índices en Foreign Keys
CREATE INDEX idx_pedidos_clienteid ON pedidos(clienteid);
CREATE INDEX idx_carrito_clienteid ON carrito_items(clienteid);
CREATE INDEX idx_clientes_agenteid ON clientes(agenteid);

-- Índices para búsquedas comunes
CREATE INDEX idx_productos_sku ON productos(sku);
CREATE INDEX idx_clientes_email ON clientes(email);
CREATE INDEX idx_pedidos_fecha ON pedidos(fecha);
```

### Backup y Restore

#### Crear Backup

```bash
# Backup completo
pg_dump -h razoconnect-db.postgres.database.azure.com \
        -U adminuser \
        -d razoconnect \
        -F c \
        -f backup_$(date +%Y%m%d).dump

# Backup en SQL plano
pg_dump -h razoconnect-db.postgres.database.azure.com \
        -U adminuser \
        -d razoconnect \
        -f backup_$(date +%Y%m%d).sql
```

#### Restaurar Backup

```bash
# Desde archivo .dump
pg_restore -h razoconnect-db.postgres.database.azure.com \
           -U adminuser \
           -d razoconnect \
           -c \
           backup_20240110.dump

# Desde archivo .sql
psql -h razoconnect-db.postgres.database.azure.com \
     -U adminuser \
     -d razoconnect \
     -f backup_20240110.sql
```

#### Automatizar Backups en Azure

1. Ir a Azure Portal > PostgreSQL Server
2. Configurar Automated Backups:
   - Retention: 7-35 días
   - Geo-redundant: Según necesidad

## Configuración de Dominios

### 1. Configurar Dominio en Azure

#### Agregar Custom Domain

```bash
# Verificar dominio disponible
az webapp show \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --query defaultHostName

# Agregar custom domain
az webapp config hostname add \
  --resource-group RazoConnect-RG \
  --webapp-name razoconnect-api \
  --hostname razo.com.mx
```

### 2. Configurar DNS

En tu proveedor de DNS (GoDaddy, Cloudflare, etc.):

#### Registro A (Recomendado)

```
Tipo: A
Nombre: @
Valor: [IP de Azure App Service]
TTL: 3600
```

#### Registro CNAME (Alternativa)

```
Tipo: CNAME
Nombre: www
Valor: razoconnect-api.azurewebsites.net
TTL: 3600
```

#### Registro TXT (Verificación)

```
Tipo: TXT
Nombre: asuid
Valor: [Custom Domain Verification ID de Azure]
TTL: 3600
```

### 3. Configurar SSL/TLS

#### Certificado Gratuito de Azure

```bash
az webapp config ssl bind \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --certificate-thumbprint auto \
  --ssl-type SNI
```

#### Forzar HTTPS

```bash
az webapp update \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --https-only true
```

### 4. Configurar Tenant en Base de Datos

```sql
-- Agregar tenant con dominio personalizado
INSERT INTO tenants (nombre_cliente, dominio, tema, is_active)
VALUES ('Razo', 'razo.com.mx', 'razo', true);

-- Verificar
SELECT * FROM tenants WHERE dominio = 'razo.com.mx';
```

### 5. Probar Configuración

```bash
# Verificar DNS
nslookup razo.com.mx

# Verificar SSL
curl -I https://razo.com.mx

# Verificar API
curl https://razo.com.mx/api/health
```

## CI/CD con GitHub Actions

### 1. Configurar GitHub Secrets

En GitHub Repository > Settings > Secrets and variables > Actions:

```
AZURE_WEBAPP_NAME=razoconnect-api
AZURE_WEBAPP_PUBLISH_PROFILE=[Contenido del perfil de publicación]
```

Para obtener el perfil de publicación:

```bash
az webapp deployment list-publishing-profiles \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --xml
```

### 2. Workflow de GitHub Actions

Archivo `.github/workflows/main_razoconnect-api.yml`:

```yaml
name: Build and deploy Node.js app to Azure Web App

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js version
        uses: actions/setup-node@v3
        with:
          node-version: '18.x'

      - name: npm install, build, and test
        run: |
          npm install
          npm run build --if-present

      - name: Zip artifact for deployment
        run: zip release.zip ./* -r

      - name: Upload artifact for deployment job
        uses: actions/upload-artifact@v3
        with:
          name: node-app
          path: release.zip

  deploy:
    runs-on: ubuntu-latest
    needs: build
    environment:
      name: 'Production'
      url: ${{ steps.deploy-to-webapp.outputs.webapp-url }}

    steps:
      - name: Download artifact from build job
        uses: actions/download-artifact@v3
        with:
          name: node-app

      - name: Unzip artifact for deployment
        run: unzip release.zip

      - name: 'Deploy to Azure Web App'
        id: deploy-to-webapp
        uses: azure/webapps-deploy@v2
        with:
          app-name: ${{ secrets.AZURE_WEBAPP_NAME }}
          slot-name: 'Production'
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: .
```

### 3. Flujo de Despliegue

```
1. Developer hace commit a branch main
   ↓
2. GitHub Actions detecta push
   ↓
3. Job "build" se ejecuta:
   - Checkout del código
   - Instala Node.js 18
   - Ejecuta npm install
   - Crea ZIP del proyecto
   - Sube artifact
   ↓
4. Job "deploy" se ejecuta:
   - Descarga artifact
   - Descomprime ZIP
   - Despliega a Azure usando publish profile
   ↓
5. Azure recibe el código:
   - Ejecuta npm install
   - Reinicia la aplicación
   - Aplica nuevas variables de entorno
   ↓
6. Aplicación disponible en producción
```

### 4. Verificar Despliegue

En GitHub:
- Actions tab > Ver workflow run
- Revisar logs de cada step

En Azure:
- App Service > Deployment Center > Logs
- Ver estado del despliegue

## Problemas Comunes y Soluciones

### 1. Error de Encoding (Acentos y Caracteres Especiales)

**Síntoma**:
```
Productos con nombres como "Descripción" aparecen como "Descripci�n"
```

**Causa**:
Mismatch entre encoding de Windows (Windows-1252) y PostgreSQL (UTF-8)

**Solución**:

```sql
-- En PostgreSQL
ALTER DATABASE razoconnect SET client_encoding TO 'UTF8';
SET client_encoding = 'UTF8';
```

```javascript
// En db.js
const pool = new Pool({
  // ... otras opciones
  client_encoding: 'UTF8'
});
```

**Prevención**:
- Siempre usar UTF-8 en editores de código
- Configurar VS Code: `"files.encoding": "utf8"`
- Validar encoding antes de importar datos

### 2. Sesión No Persiste / Usuario Deslogueado

**Síntoma**:
Usuario hace login pero es deslogueado inmediatamente o en la siguiente petición

**Causas Posibles**:

#### A. Cookie no se está enviando

**Solución**:
```javascript
// Verificar configuración de CORS
app.use(cors({
  origin: true,
  credentials: true  // CRÍTICO
}));

// Verificar configuración de cookie
cookie: {
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax',  // No usar 'strict' en producción
  domain: undefined  // Dejar que Express lo maneje
}
```

#### B. Tenant Mismatch

**Solución**:
```javascript
// Verificar que el token incluye tenant_id correcto
console.log('Token tenant_id:', decoded.tenant_id);
console.log('Request tenant_id:', req.tenant.tenant_id);

// Si no coinciden, el middleware validateUserTenant destruirá la sesión
```

#### C. Tabla de sesiones no existe

**Solución**:
```sql
-- Crear tabla de sesiones
CREATE TABLE session (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX idx_session_expire ON session (expire);
```

### 3. Error "Tenant no encontrado"

**Síntoma**:
Página redirige a `/tienda-no-encontrada`

**Causas**:

#### A. Dominio no registrado en BD

**Solución**:
```sql
-- Verificar tenants
SELECT * FROM tenants;

-- Agregar tenant faltante
INSERT INTO tenants (nombre_cliente, dominio, tema, is_active)
VALUES ('Razo', 'razo.com.mx', 'razo', true);
```

#### B. Problema con normalización de dominio

**Solución**:
```javascript
// Verificar logs del servidor
console.log('Hostname original:', req.hostname);
console.log('Dominio normalizado:', normalizedDomain);

// Asegurar que el dominio en BD no tiene www.
UPDATE tenants SET dominio = 'razo.com.mx' WHERE dominio = 'www.razo.com.mx';
```

### 4. Error "Cannot read property 'tenant_id' of undefined"

**Síntoma**:
```
TypeError: Cannot read property 'tenant_id' of undefined
```

**Causa**:
Controller intenta acceder a `req.tenant` pero el middleware tenantGuard no se ejecutó

**Solución**:

```javascript
// Verificar orden de middlewares en index.js
app.use(tenantGuard);  // DEBE estar ANTES de las rutas

// En controller, agregar validación defensiva
const obtenerProductos = async (req, res) => {
  if (!req.tenant) {
    return res.status(500).json({ error: 'Tenant no detectado' });
  }
  
  const { tenant_id } = req.tenant;
  // ... resto del código
};
```

### 5. Queries Lentas / Performance

**Síntoma**:
Páginas tardan mucho en cargar, timeouts en peticiones

**Diagnóstico**:

```sql
-- Habilitar pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Ver queries más lentas
SELECT 
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Ver tablas sin índices
SELECT 
  schemaname,
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public';
```

**Solución**:

```sql
-- Agregar índices faltantes
CREATE INDEX idx_productos_tenant ON productos(tenant_id);
CREATE INDEX idx_pedidos_fecha ON pedidos(fecha);

-- Analizar tablas
ANALYZE productos;
ANALYZE pedidos;

-- Vacuum para limpiar
VACUUM ANALYZE;
```

### 6. Aplicación No Inicia en Azure

**Síntoma**:
```
Application Error
An error occurred in the application and your page could not be served.
```

**Diagnóstico**:

```bash
# Ver logs en tiempo real
az webapp log tail \
  --resource-group RazoConnect-RG \
  --name razoconnect-api

# Descargar logs
az webapp log download \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --log-file logs.zip
```

**Causas Comunes**:

#### A. Variable de entorno faltante

**Solución**:
```bash
# Verificar variables
az webapp config appsettings list \
  --resource-group RazoConnect-RG \
  --name razoconnect-api

# Agregar variable faltante
az webapp config appsettings set \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --settings JWT_SECRET=tu_secret
```

#### B. Error de conexión a BD

**Solución**:
```bash
# Verificar firewall de PostgreSQL
# Agregar IP de Azure App Service en reglas de firewall

# Verificar string de conexión
# Debe incluir sslmode=require para Azure
```

#### C. Puerto incorrecto

**Solución**:
```javascript
// index.js - Usar variable de entorno PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
```

### 7. Imágenes No Cargan

**Síntoma**:
Imágenes de productos no se muestran, error 404

**Causas**:

#### A. URL de Cloudinary incorrecta

**Solución**:
```javascript
// Verificar configuración de Cloudinary
console.log('Cloudinary config:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY
});

// Verificar URL en BD
SELECT imagenurl FROM productos WHERE productoid = 123;
```

#### B. Problema de CORS

**Solución**:
```javascript
// Agregar Cloudinary a CORS
app.use(cors({
  origin: ['https://res.cloudinary.com', 'https://razo.com.mx'],
  credentials: true
}));
```

### 8. Error "JWT Secret Missing"

**Síntoma**:
```
Error: JWT_SECRET is required but not defined
```

**Causa**:
Variable de entorno JWT_SECRET no está configurada

**Solución**:

```bash
# Desarrollo local
echo "JWT_SECRET=tu_secret_muy_largo_minimo_32_caracteres" >> .env

# Azure
az webapp config appsettings set \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --settings JWT_SECRET=tu_secret_muy_largo_minimo_32_caracteres
```

## Monitoreo y Logs

### Logs en Azure

#### Ver Logs en Tiempo Real

```bash
az webapp log tail \
  --resource-group RazoConnect-RG \
  --name razoconnect-api
```

#### Habilitar Application Logging

```bash
az webapp log config \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --application-logging filesystem \
  --level information
```

#### Descargar Logs

```bash
az webapp log download \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --log-file logs_$(date +%Y%m%d).zip
```

### Monitoreo con Azure Monitor

1. Ir a Azure Portal > App Service > Monitoring
2. Configurar alertas para:
   - CPU > 80%
   - Memoria > 80%
   - Tiempo de respuesta > 5s
   - Errores HTTP 5xx

### Logs Estructurados en la Aplicación

```javascript
// utils/logger.js
const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      tenant_id: meta.tenant_id,
      user_id: meta.user_id,
      ...meta
    }));
  },
  
  error: (message, error, meta = {}) => {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...meta
    }));
  }
};

// Uso en controllers
logger.info('Pedido creado', {
  tenant_id: req.tenant.tenant_id,
  user_id: req.user.userId,
  pedido_id: pedido.pedidoid
});
```

## Mantenimiento

### Tareas Diarias Automatizadas

El sistema ejecuta un cron job diario (`cron/dailyMaintenance.js`):

```javascript
// Tareas que se ejecutan automáticamente
- Limpiar sesiones expiradas
- Verificar deudas vencidas
- Enviar alertas de stock bajo
- Generar reportes automáticos
- Limpiar archivos temporales
```

### Mantenimiento Manual Recomendado

#### Semanal

```sql
-- Limpiar sesiones antiguas
DELETE FROM session WHERE expire < NOW() - INTERVAL '7 days';

-- Vacuum para optimizar
VACUUM ANALYZE;

-- Verificar tamaño de tablas
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### Mensual

```bash
# Backup completo
pg_dump -h razoconnect-db.postgres.database.azure.com \
        -U adminuser \
        -d razoconnect \
        -F c \
        -f backup_monthly_$(date +%Y%m).dump

# Revisar logs de errores
az webapp log download \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --log-file logs_monthly.zip

# Revisar métricas de performance
az monitor metrics list \
  --resource razoconnect-api \
  --resource-group RazoConnect-RG \
  --metric-names CpuPercentage MemoryPercentage
```

### Actualización de Dependencias

```bash
# Verificar dependencias desactualizadas
npm outdated

# Actualizar dependencias menores
npm update

# Actualizar dependencias mayores (con precaución)
npm install package@latest

# Probar en desarrollo antes de desplegar
npm test
npm start
```

## Rollback y Recuperación

### Rollback de Código

#### Opción A: Revertir Commit

```bash
# Ver historial
git log --oneline

# Revertir a commit anterior
git revert <commit-hash>
git push origin main

# GitHub Actions desplegará automáticamente
```

#### Opción B: Rollback en Azure

```bash
# Ver despliegues anteriores
az webapp deployment list \
  --resource-group RazoConnect-RG \
  --name razoconnect-api

# Rollback a despliegue anterior
az webapp deployment slot swap \
  --resource-group RazoConnect-RG \
  --name razoconnect-api \
  --slot staging \
  --target-slot production
```

### Recuperación de Base de Datos

#### Restaurar desde Backup Automático de Azure

```bash
# Listar backups disponibles
az postgres flexible-server backup list \
  --resource-group RazoConnect-RG \
  --server-name razoconnect-db

# Restaurar desde backup
az postgres flexible-server restore \
  --resource-group RazoConnect-RG \
  --name razoconnect-db-restored \
  --source-server razoconnect-db \
  --restore-time "2024-01-10T10:00:00Z"
```

#### Restaurar desde Backup Manual

```bash
# Restaurar backup completo
pg_restore -h razoconnect-db.postgres.database.azure.com \
           -U adminuser \
           -d razoconnect \
           -c \
           backup_20240110.dump
```

### Plan de Recuperación ante Desastres

1. **Identificar el Problema**
   - Revisar logs
   - Identificar causa raíz
   - Determinar alcance del impacto

2. **Comunicar**
   - Notificar a stakeholders
   - Actualizar página de estado (si existe)

3. **Rollback Inmediato**
   - Revertir código a versión estable
   - Restaurar BD si es necesario

4. **Verificar Recuperación**
   - Probar funcionalidades críticas
   - Verificar integridad de datos

5. **Post-Mortem**
   - Documentar incidente
   - Identificar mejoras
   - Implementar prevenciones

## Conclusión

Esta guía cubre los aspectos críticos del despliegue y mantenimiento de RazoConnect. Puntos clave a recordar:

1. **Encoding UTF-8**: Configurar correctamente para evitar problemas con acentos
2. **Variables de Entorno**: Verificar que todas estén configuradas antes de desplegar
3. **Backups**: Mantener backups regulares de la base de datos
4. **Monitoreo**: Configurar alertas para detectar problemas temprano
5. **Logs**: Revisar logs regularmente para identificar patrones de error
6. **Testing**: Probar en desarrollo antes de desplegar a producción

Para soporte adicional, consultar:
- Documentación de Azure: [docs.microsoft.com/azure](https://docs.microsoft.com/azure)
- Documentación de PostgreSQL: [postgresql.org/docs](https://postgresql.org/docs)
- Documentación de Node.js: [nodejs.org/docs](https://nodejs.org/docs)
