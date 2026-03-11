# 🐳 Docker Setup - RazoConnect

## 📋 Requisitos Previos

- Docker Desktop instalado y corriendo
- Docker Compose v2.0 o superior
- Al menos 2GB de RAM disponible para los contenedores

## Comandos de Uso

### 1. Levantar el Entorno Completo (Primera Vez)

```bash
# Construir imágenes y levantar servicios
docker-compose up --build -d

# Ver logs en tiempo real
docker-compose logs -f
```

**¿Qué hace este comando?**
- Construye la imagen de la aplicación usando el `Dockerfile`
- Descarga la imagen de PostgreSQL 17 Alpine
- Crea la red `razoconnect_network`
- Crea el volumen persistente `razoconnect_postgres_data`
- Levanta primero la base de datos y espera a que esté saludable
- Luego levanta la aplicación y la conecta a la DB
- Ejecuta el script `database/backup.sql` automáticamente en la DB

### 2. Verificar que Todo Está Corriendo

```bash
# Ver estado de los contenedores
docker-compose ps

# Deberías ver algo como:
# NAME                STATUS              PORTS
# razoconnect-app     Up (healthy)        0.0.0.0:8080->8080/tcp
# razoconnect-db      Up (healthy)        0.0.0.0:5432->5432/tcp
```

### 3. Verificar Conexión App ↔ DB

```bash
# Ver logs de la aplicación
docker-compose logs app

# Busca líneas como:
# Conexión a PostgreSQL exitosa
# Servidor corriendo en puerto 8080
```

**Prueba desde el navegador:**
```
http://localhost:8080/health
```

Deberías recibir:
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "memory_fallback"
}
```

### 4. Acceder a la Base de Datos Directamente

```bash
# Conectar a PostgreSQL desde el contenedor
docker-compose exec db psql -U postgres -d razoconnect_dev

# Comandos útiles dentro de psql:
\dt              # Listar todas las tablas
\d productos     # Ver estructura de tabla productos
SELECT COUNT(*) FROM productos;  # Contar productos
\q               # Salir
```

### 5. Ver Logs de Servicios Específicos

```bash
# Solo logs de la app
docker-compose logs -f app

# Solo logs de la DB
docker-compose logs -f db

# Últimas 100 líneas
docker-compose logs --tail=100 app
```

### 6. Reiniciar Servicios

```bash
# Reiniciar solo la app (útil después de cambios de código)
docker-compose restart app

# Reiniciar todo
docker-compose restart

# Reconstruir la app después de cambios en package.json
docker-compose up --build -d app
```

### 7. Detener el Entorno

```bash
# Detener sin borrar contenedores
docker-compose stop

# Detener y eliminar contenedores (los datos persisten en el volumen)
docker-compose down

# PELIGRO: Detener y eliminar TODO incluyendo volúmenes (borra la DB)
docker-compose down -v
```

### 8. Limpiar y Empezar de Cero

```bash
# Detener todo, borrar contenedores, redes e imágenes
docker-compose down --rmi all

# Borrar también el volumen de datos (DB se pierde)
docker-compose down -v --rmi all

# Reconstruir desde cero
docker-compose up --build -d
```

## Troubleshooting

### Problema: La app no puede conectar a la DB

**Solución:**
```bash
# Verificar que la DB esté healthy
docker-compose ps

# Si db está "unhealthy", ver logs
docker-compose logs db

# Reiniciar la DB
docker-compose restart db

# Esperar 30 segundos y verificar
docker-compose ps
```

### Problema: Puerto 8080 ya está en uso

**Solución:**
Edita `docker-compose.yml` y cambia el mapeo de puertos:
```yaml
ports:
  - "3000:8080"  # Ahora accedes en localhost:3000
```

### Problema: Cambios en el código no se reflejan

**Solución:**
```bash
# Reconstruir la imagen
docker-compose up --build -d app

# O si prefieres, detener y reconstruir todo
docker-compose down
docker-compose up --build -d
```

### Problema: Error "no space left on device"

**Solución:**
```bash
# Limpiar imágenes y contenedores no usados
docker system prune -a

# Limpiar volúmenes no usados
docker volume prune
```

## Monitoreo de Recursos

```bash
# Ver uso de CPU y RAM en tiempo real
docker stats

# Ver tamaño de imágenes
docker images

# Ver tamaño de volúmenes
docker system df -v
```

## Variables de Entorno Importantes

### Para Desarrollo Local (Ya configuradas en docker-compose.yml)

- `NODE_ENV=development` → Activa Smart Fallback de Redis (usa memoria local)
- `DB_HOST=db` → Nombre del servicio de PostgreSQL
- `JWT_SECRET` y `JWT_REFRESH_SECRET` → Valores de desarrollo (CAMBIAR EN PRODUCCIÓN)

### Para Usar Redis de Upstash (Opcional)

Crea un archivo `.env` en la raíz:
```env
REDIS_HOST=tu-instancia.upstash.io
REDIS_PORT=6380
REDIS_PASSWORD=tu_password_aqui
```

Y ejecuta:
```bash
docker-compose --env-file .env up -d
```

## Flujo de Trabajo Recomendado

1. **Inicio del día:**
   ```bash
   docker-compose up -d
   ```

2. **Durante desarrollo:**
   - Edita código normalmente
   - Reconstruye solo cuando cambies `package.json`:
     ```bash
     docker-compose up --build -d app
     ```

3. **Ver logs si algo falla:**
   ```bash
   docker-compose logs -f app
   ```

4. **Final del día:**
   ```bash
   docker-compose stop
   ```

## Estructura de Volúmenes

- **postgres_data:** Datos de PostgreSQL (persiste entre reinicios)
- **./uploads:** Archivos subidos localmente (si no usas Cloudinary)

## Acceso a Servicios

- **Aplicación:** http://localhost:8080
- **PostgreSQL:** localhost:5432
  - Usuario: `postgres`
  - Password: `your_secure_password_here` (cambiar en docker-compose.yml)
  - Base de datos: `razoconnect_dev`

## Notas Importantes

1. **Redis en Desarrollo:** El sistema usa memoria local automáticamente cuando `NODE_ENV=development`. No necesitas Upstash para desarrollo local.

2. **Datos Persistentes:** La base de datos persiste en el volumen `postgres_data`. Solo se borra si ejecutas `docker-compose down -v`.

3. **Inicialización Automática:** El script `database/backup.sql` se ejecuta automáticamente la primera vez que se crea la base de datos.

4. **Healthchecks:** Ambos servicios tienen healthchecks configurados. La app no inicia hasta que la DB esté lista.

5. **Networking:** Los contenedores se comunican a través de la red `razoconnect_network`. La app usa el nombre del servicio `db` como hostname.

## Actualizar a Producción

Cuando estés listo para producción:

1. Cambia las contraseñas en `docker-compose.yml`
2. Configura `NODE_ENV=production`
3. Usa Redis real (no memory fallback)
4. Configura variables de Cloudinary y Email
5. Usa un reverse proxy (Nginx) delante de la app
