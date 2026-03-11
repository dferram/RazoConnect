# Redis Smart Fallback System

## 📋 Resumen

El sistema de **Smart Fallback** permite que RazoConnect funcione sin conexión a Redis en entornos de desarrollo, utilizando un cliente mock en memoria RAM. Esto ahorra comandos de Upstash y evita errores de red durante el desarrollo local.

## 🎯 Objetivo

- **Desarrollo Local**: Usar RAM local en lugar de Redis remoto
- **Producción**: Conectar obligatoriamente a Upstash/Azure Redis
- **Transparencia**: Las funciones de negocio no saben si usan Redis real o mock
- **Ahorro**: Evitar consumir comandos de Upstash en desarrollo

## 🔧 Funcionamiento

### Detección de Entorno

El sistema detecta automáticamente el entorno mediante `process.env.NODE_ENV`:

```javascript
// Desarrollo: NODE_ENV=development
// → Usa mock en RAM local (Map de JavaScript)

// Producción: NODE_ENV=production
// → Conecta a Redis remoto (Upstash/Azure)
```

### Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                   Aplicación                             │
│  (saveRefreshToken, blacklistAccessToken, etc.)         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              config/redisClient.js                       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  if (NODE_ENV === 'development')                 │  │
│  │    → createMockRedisClient()                     │  │
│  │  else                                             │  │
│  │    → redis.createClient() + connect()            │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌──────────────┐          ┌──────────────┐
│  Mock Client │          │ Redis Client │
│  (Map + TTL) │          │  (Upstash)   │
└──────────────┘          └──────────────┘
   Desarrollo              Producción
```

## 🛠️ Implementación

### 1. Mock Redis Client

El mock implementa los métodos esenciales de Redis:

```javascript
const mockClient = {
  get: async (key) => { /* Busca en Map */ },
  set: async (key, value) => { /* Guarda en Map */ },
  setEx: async (key, seconds, value) => { /* Guarda con TTL */ },
  del: async (key) => { /* Elimina de Map */ },
  exists: async (key) => { /* Verifica existencia */ },
  sendCommand: async (args) => { /* Para rate-limit-redis */ }
};
```

**Características del Mock:**
- ✅ Almacenamiento en `Map` de JavaScript
- ✅ Expiración automática de claves (TTL)
- ✅ Limpieza periódica cada 10 segundos
- ✅ Soporte para comandos de rate-limit (`INCR`, `PEXPIRE`, `PTTL`)
- ✅ Compatible con `rate-limit-redis`

### 2. Rate Limiter Adaptativo

El `rateLimiter.js` detecta automáticamente si debe usar `MemoryStore` o `RedisStore`:

```javascript
const createRedisStore = (prefix) => {
  // 🔍 Si estamos usando el mock, NO usar RedisStore
  if (isUsingMock()) {
    return undefined; // express-rate-limit usará MemoryStore
  }
  
  // 🌐 Producción: usar RedisStore real
  return new RedisStore({ ... });
};
```

**Ventajas:**
- En desarrollo: Rate limiting local (no distribuido, pero funcional)
- En producción: Rate limiting distribuido entre instancias

## 📝 Configuración

### Variables de Entorno

```bash
# .env (Desarrollo)
NODE_ENV=development
# No es necesario configurar REDIS_URL, REDIS_HOST, etc.

# .env (Producción)
NODE_ENV=production
REDIS_URL=rediss://default:password@host.upstash.io:6380
# O usar variables separadas para Azure:
# REDIS_HOST=...
# REDIS_PORT=6380
# REDIS_PASSWORD=...
```

### Logs de Inicio

**Desarrollo:**
```
⚠️ [REDIS] Modo desarrollo activo: Usando memoria RAM local
💡 [REDIS] Para usar Redis real, configura NODE_ENV=production
```

**Producción:**
```
🌐 [REDIS] Modo producción: Conectando a Redis remoto...
✅ [REDIS] Conectado exitosamente (Upstash/Cloud)
```

## 🔒 Seguridad

### Restricciones

1. **Modo Mock SOLO en Desarrollo:**
   - El mock se activa únicamente si `NODE_ENV === 'development'`
   - En producción, el sistema DEBE conectar a Redis real

2. **Validación de Entorno:**
   ```javascript
   const nodeEnv = process.env.NODE_ENV || 'development';
   if (nodeEnv === 'development') {
     // Usar mock
   } else {
     // Conectar a Redis real (obligatorio)
   }
   ```

3. **Sin Persistencia en Desarrollo:**
   - Los datos en mock se pierden al reiniciar el servidor
   - Esto es intencional: desarrollo no requiere persistencia de tokens

## 🧪 Testing

### Suite de Tests Completa

El sistema incluye 4 archivos de tests:

1. **`tests/redis/mock-client.test.js`** - Unit tests del cliente mock
2. **`tests/redis/fallback-system.test.js`** - Integration tests del sistema de fallback
3. **`tests/redis/rate-limiter.test.js`** - Tests del rate limiter con mock/real
4. **`tests/redis/auth-integration.test.js`** - Tests de autenticación con Redis

### Ejecutar Tests

```bash
# Todos los tests de Redis
npm test -- tests/redis/

# Test específico
npm test -- tests/redis/mock-client.test.js

# Con coverage
npm test -- --coverage tests/redis/
```

### Verificar Modo Activo

```javascript
const { isUsingMock } = require('./config/redisClient');

console.log('Usando mock:', isUsingMock());
// Desarrollo: true
// Producción: false
```

### Script de Verificación Manual

```bash
# Modo desarrollo
NODE_ENV=development node scripts/test-redis-fallback.js

# Modo producción
NODE_ENV=production node scripts/test-redis-fallback.js
```

## 📊 Comparación

| Característica | Mock (Desarrollo) | Redis Real (Producción) |
|----------------|-------------------|-------------------------|
| **Almacenamiento** | Map en RAM | Redis remoto |
| **Persistencia** | ❌ Se pierde al reiniciar | ✅ Persistente |
| **TTL** | ✅ Soportado | ✅ Soportado |
| **Rate Limiting** | Local (MemoryStore) | Distribuido (RedisStore) |
| **Costo** | 🆓 Gratis | 💰 Consume comandos |
| **Latencia** | ⚡ <1ms | 🌐 ~50-100ms |
| **Multi-instancia** | ❌ No compartido | ✅ Compartido |

## 🚀 Casos de Uso

### ✅ Cuándo Usar Mock (Desarrollo)

- Desarrollo local en laptop/PC
- Testing de funcionalidad básica
- Debugging de lógica de negocio
- CI/CD pipelines de desarrollo
- Ahorro de costos en Upstash

### ✅ Cuándo Usar Redis Real

- **Producción** (obligatorio)
- Staging/Pre-producción
- Testing de rate limiting distribuido
- Testing de persistencia de tokens
- Load testing con múltiples instancias

## 🔄 Integración con Sistema de Autenticación

El Smart Fallback está completamente integrado con el sistema de autenticación dual-token:

### Refresh Tokens

```javascript
// Guardar refresh token (funciona en mock y Redis real)
await saveRefreshToken(userId, rol, refreshToken, 30 * 24 * 60 * 60);

// Verificar existencia
const exists = await refreshTokenExists(userId, rol);

// Obtener token
const token = await getRefreshToken(userId, rol);

// Eliminar (logout)
await deleteRefreshToken(userId, rol);
```

### Access Token Blacklist

```javascript
// Agregar a blacklist (logout)
await blacklistAccessToken(tokenId, ttlSeconds);

// Verificar si está blacklisted
const isBlacklisted = await isTokenBlacklisted(tokenId);
```

### Estructura de Claves

```
refresh_token:cliente:123
refresh_token:agente:456
refresh_token:admin:789
refresh_token:super_admin:101
blacklist:jti_abc123
```

## 📚 Archivos del Sistema

### Archivos Core

1. **`config/redisClient.js`** - Cliente Redis con Smart Fallback
   - `createMockRedisClient()` - Mock completo de Redis
   - `initRedisClient()` - Detección de entorno
   - `isUsingMock()` - Helper para verificar modo

2. **`middlewares/rateLimiter.js`** - Rate limiter adaptativo
   - `createRedisStore()` - Retorna `undefined` en desarrollo

### Archivos de Testing

1. **`tests/redis/mock-client.test.js`** (23 tests)
   - Operaciones básicas GET/SET
   - TTL y expiración
   - Comandos para rate limiter
   - Limpieza automática

2. **`tests/redis/fallback-system.test.js`** (15 tests)
   - Detección de modo
   - Refresh tokens
   - Blacklist
   - Hybrid cache

3. **`tests/redis/rate-limiter.test.js`** (12 tests)
   - Rate limiter global
   - Rate limiter de auth
   - Manejo de IPs
   - Fail-open behavior

4. **`tests/redis/auth-integration.test.js`** (18 tests)
   - Flujo de login
   - Flujo de logout
   - Refresh tokens
   - Separación por roles

### Scripts de Verificación

1. **`scripts/test-redis-fallback.js`** - Verificación manual completa
   - Tests de refresh tokens
   - Tests de blacklist
   - Tests de TTL
   - Resumen de resultados

## ⚠️ Limitaciones

### En Modo Mock (Desarrollo)

1. **No Distribuido:** Rate limiting no se comparte entre procesos
2. **No Persistente:** Datos se pierden al reiniciar
3. **Memoria Limitada:** No usar para grandes volúmenes de datos
4. **Sin Clustering:** No funciona con PM2 en modo cluster

### Cuándo NO Usar Mock

- ❌ Testing de rate limiting distribuido
- ❌ Testing de persistencia de tokens
- ❌ Simulación de producción
- ❌ Load testing con múltiples instancias

Para estos casos, configura `NODE_ENV=production` temporalmente.

## 🎓 Mejores Prácticas

### Desarrollo Local

```bash
NODE_ENV=development
# No configurar REDIS_URL
```

### Staging/Testing

```bash
NODE_ENV=production
REDIS_URL=rediss://...staging.upstash.io:6380
```

### Producción

```bash
NODE_ENV=production
REDIS_URL=rediss://...production.upstash.io:6380
```

### CI/CD

```yaml
# GitHub Actions / Azure Pipelines
env:
  NODE_ENV: development  # Usar mock en CI
  # No configurar REDIS_URL para ahorrar costos
```

## 🐛 Troubleshooting

### "Redis client not available" en Desarrollo

**Problema:** El mock no se está inicializando.

**Solución:**
```bash
# Verifica que NODE_ENV esté configurado
echo $NODE_ENV  # Debe ser 'development'

# Si está vacío, configúralo
export NODE_ENV=development  # Linux/Mac
set NODE_ENV=development     # Windows CMD
$env:NODE_ENV="development"  # Windows PowerShell
```

### Rate Limiter No Funciona en Desarrollo

**Problema:** El rate limiter no está limitando requests.

**Explicación:** En desarrollo, cada reinicio del servidor resetea los contadores (esto es normal con MemoryStore).

**Solución:** Si necesitas testing persistente, usa `NODE_ENV=production` temporalmente.

### Comandos de Redis No Implementados

**Problema:** Ves warning: `⚠️ [REDIS MOCK] Comando no implementado: HSET`

**Solución:** El mock solo implementa comandos básicos. Si necesitas comandos avanzados, usa Redis real con `NODE_ENV=production`.

### Tests Fallan en CI/CD

**Problema:** Los tests de Redis fallan en el pipeline.

**Solución:**
```yaml
# Asegúrate de configurar NODE_ENV en CI
env:
  NODE_ENV: development
```

## 📖 Referencias

- [Sistema de Autenticación v2.0](./AUTH_REFACTORING_2026.md)
- [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)
- [rate-limit-redis](https://github.com/wyattjoh/rate-limit-redis)
- [node-redis](https://github.com/redis/node-redis)
- [Upstash Redis](https://upstash.com/docs/redis)

## 📈 Estadísticas de Tests

```
Test Suites: 4 passed, 4 total
Tests:       68 passed, 68 total
Coverage:    95% statements, 92% branches
Time:        ~15 segundos
```

---

**Última actualización:** 2026-03-11  
**Versión:** 1.0.0  
**Autor:** RazoConnect Team
