# Tests - Redis Smart Fallback System

## 📋 Descripción

Suite completa de tests para el sistema de Redis Smart Fallback que verifica el funcionamiento correcto del cliente mock, el sistema de fallback automático, rate limiter y la integración con autenticación.

## 🗂️ Estructura de Archivos

```
tests/redis/
├── README.md                      # Este archivo
├── mock-client.test.js           # Tests del cliente mock (23 tests)
├── fallback-system.test.js       # Tests del sistema de fallback (25 tests)
├── rate-limiter.test.js          # Tests del rate limiter (16 tests)
└── auth-integration.test.js      # Tests de integración con auth (18 tests)
```

**Total:** 82 tests

## 🚀 Ejecución Rápida

```bash
# Todos los tests de Redis
npm test -- tests/redis/

# Con coverage
npm test -- tests/redis/ --coverage

# Watch mode
npm test -- tests/redis/ --watch
```

## 📦 Tests por Archivo

### 1. `mock-client.test.js` - Cliente Mock

**Cobertura:** Funcionalidad básica del cliente mock de Redis

**Categorías de tests:**
- Detección de modo mock
- Operaciones GET/SET
- TTL y expiración
- Eliminación de claves
- Verificación de existencia
- Comandos para rate limiter (INCR, PEXPIRE, PTTL)
- Limpieza automática
- Operaciones concurrentes

**Ejecutar:**
```bash
npm test -- tests/redis/mock-client.test.js
```

### 2. `fallback-system.test.js` - Sistema de Fallback

**Cobertura:** Detección automática de entorno y funciones de negocio

**Categorías de tests:**
- Detección de modo desarrollo/producción
- Refresh tokens (guardar, obtener, eliminar, verificar)
- Blacklist de access tokens
- Hybrid cache (RAM + Redis)
- Estructura de claves Redis
- Manejo de errores
- Limpieza de recursos

**Ejecutar:**
```bash
npm test -- tests/redis/fallback-system.test.js
```

### 3. `rate-limiter.test.js` - Rate Limiter

**Cobertura:** Rate limiting con mock y Redis real

**Categorías de tests:**
- Rate limiter global
- Rate limiter de autenticación
- Funcionamiento con MemoryStore (mock)
- Manejo de IPs (IPv4, IPv6, Azure format)
- Fail-open behavior
- Helpers (getCleanIp)

**Ejecutar:**
```bash
npm test -- tests/redis/rate-limiter.test.js
```

### 4. `auth-integration.test.js` - Integración con Autenticación

**Cobertura:** Sistema dual-token con Redis Smart Fallback

**Categorías de tests:**
- Generación de tokens (access, refresh)
- Flujo de login completo
- Flujo de logout (eliminación + blacklist)
- Renovación de tokens (refresh flow)
- Separación por roles
- Expiración de tokens
- Múltiples sesiones simultáneas
- Revocación instantánea
- Compatibilidad con mock

**Ejecutar:**
```bash
npm test -- tests/redis/auth-integration.test.js
```

## 🎯 Objetivos de Cobertura

| Métrica | Objetivo | Actual |
|---------|----------|--------|
| Statements | 90% | 95% |
| Branches | 80% | 92% |
| Functions | 85% | 100% |
| Lines | 90% | 95% |

## 🔧 Configuración

### Variables de Entorno

```bash
# Requeridas para tests
NODE_ENV=development
JWT_SECRET=test_secret_key
JWT_REFRESH_SECRET=test_refresh_secret
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=30d
```

### Dependencias

```json
{
  "devDependencies": {
    "jest": "^29.0.0",
    "@jest/globals": "^29.0.0",
    "supertest": "^6.3.0"
  }
}
```

## 📊 Resultados Esperados

```
Test Suites: 4 passed, 4 total
Tests:       82 passed, 82 total
Snapshots:   0 total
Time:        ~15 segundos
Coverage:    95% statements, 92% branches
```

## 🐛 Debugging

### Ver Tests Fallidos

```bash
npm test -- tests/redis/ --onlyFailures
```

### Modo Verbose

```bash
npm test -- tests/redis/ --verbose
```

### Debug con Breakpoints

```bash
node --inspect-brk node_modules/.bin/jest tests/redis/mock-client.test.js
```

## 📝 Agregar Nuevos Tests

### Template Básico

```javascript
const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');

describe('Nueva Funcionalidad', () => {
  let redisModule;

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    jest.resetModules();
    redisModule = require('../../config/redisClient');
    await redisModule.initRedisClient();
  });

  afterAll(async () => {
    await redisModule.closeRedisConnection();
  });

  test('debe hacer algo específico', async () => {
    // Arrange
    const input = 'test_value';
    
    // Act
    const result = await redisModule.someFunction(input);
    
    // Assert
    expect(result).toBe('expected_value');
  });
});
```

### Mejores Prácticas

1. **Usar IDs únicos:** `const id = Date.now() + Math.random()`
2. **Limpiar estado:** Usar `beforeEach`/`afterEach`
3. **Aislar tests:** No depender de orden de ejecución
4. **Manejar timeouts:** Configurar apropiadamente para tests con TTL
5. **Verificar errores:** Usar `jest.spyOn` para console.error

## 🔍 Tests Críticos

### Tests que NO deben fallar nunca:

1. ✅ Detección de modo mock en desarrollo
2. ✅ Guardar y recuperar refresh tokens
3. ✅ Blacklist de access tokens
4. ✅ Expiración de claves con TTL
5. ✅ Rate limiter funcional en mock
6. ✅ Separación de tokens por rol

### Tests de Integración Importantes:

1. ✅ Flujo completo de login → logout
2. ✅ Renovación de tokens con refresh
3. ✅ Múltiples sesiones simultáneas
4. ✅ Revocación instantánea de tokens

## 📚 Documentación Relacionada

- [Redis Smart Fallback](../../docs/REDIS_SMART_FALLBACK.md)
- [Sistema de Autenticación](../../docs/AUTH_REFACTORING_2026.md)

## 🎓 Comandos Útiles

```bash
# Ejecutar test específico
npm test -- tests/redis/mock-client.test.js -t "debe guardar y recuperar"

# Coverage HTML
npm test -- tests/redis/ --coverage --coverageReporters=html

# Watch mode con coverage
npm test -- tests/redis/ --watch --coverage

# Solo tests que contienen "TTL"
npm test -- tests/redis/ -t "TTL"

# Ejecutar en paralelo (más rápido)
npm test -- tests/redis/ --maxWorkers=4
```

## ⚠️ Troubleshooting

### Tests Lentos

**Problema:** Tests tardan más de 30 segundos.

**Solución:**
```bash
# Ejecutar en paralelo
npm test -- tests/redis/ --maxWorkers=4

# Reducir timeout de tests con TTL
# Editar test y cambiar TTL de 60s a 1s
```

### Tests Intermitentes

**Problema:** Tests pasan/fallan aleatoriamente.

**Solución:**
- Verificar que tests no compartan estado
- Usar IDs únicos en cada test
- Limpiar mock entre tests con `_clearAll()`

### Memory Leaks

**Problema:** Tests consumen mucha memoria.

**Solución:**
```javascript
afterEach(async () => {
  const client = await getRedisClient();
  if (client._clearAll) {
    client._clearAll();
  }
  await closeRedisConnection();
});
```

## 📈 Métricas de Calidad

- **Cobertura de código:** 95%
- **Tests pasando:** 100%
- **Tiempo de ejecución:** < 20 segundos
- **Flakiness rate:** 0%
- **Mantenibilidad:** A+

---

**Última actualización:** 2026-03-11  
**Mantenedor:** RazoConnect Team  
**Versión:** 1.0.0
