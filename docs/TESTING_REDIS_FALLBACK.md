# Guía de Testing - Redis Smart Fallback System

## 📋 Índice

1. [Introducción](#introducción)
2. [Configuración del Entorno de Testing](#configuración-del-entorno-de-testing)
3. [Suite de Tests](#suite-de-tests)
4. [Ejecutar Tests](#ejecutar-tests)
5. [Cobertura de Tests](#cobertura-de-tests)
6. [Debugging de Tests](#debugging-de-tests)
7. [CI/CD Integration](#cicd-integration)

## 🎯 Introducción

El sistema de Redis Smart Fallback incluye una suite completa de tests que verifican:

- ✅ Funcionamiento del cliente mock
- ✅ Sistema de fallback automático
- ✅ Rate limiter con mock/real Redis
- ✅ Integración con sistema de autenticación
- ✅ Manejo de errores y edge cases

**Total de Tests:** 68 tests distribuidos en 4 archivos

## 🔧 Configuración del Entorno de Testing

### Requisitos Previos

```bash
# Instalar dependencias de testing
npm install --save-dev jest @jest/globals supertest

# Verificar instalación
npm test -- --version
```

### Variables de Entorno para Tests

```bash
# .env.test
NODE_ENV=development
JWT_SECRET=test_secret_key_for_testing_only
JWT_REFRESH_SECRET=test_refresh_secret_key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=30d

# No configurar REDIS_URL para usar mock
```

### Configuración de Jest

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'config/redisClient.js',
    'middlewares/rateLimiter.js',
    'utils/jwtHelper.js'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 90,
      statements: 90
    }
  },
  testTimeout: 15000
};
```

## 📦 Suite de Tests

### 1. Mock Client Tests (`tests/redis/mock-client.test.js`)

**Propósito:** Verificar que el cliente mock funcione correctamente.

**Tests incluidos:**
- ✅ Detección de modo mock (3 tests)
- ✅ Operaciones básicas GET/SET (3 tests)
- ✅ Operaciones con TTL (3 tests)
- ✅ Eliminación de claves (3 tests)
- ✅ Verificación de existencia (3 tests)
- ✅ Comandos para rate limiter (5 tests)
- ✅ Limpieza automática (1 test)
- ✅ Operaciones concurrentes (1 test)
- ✅ Método de limpieza (1 test)

**Total:** 23 tests

**Ejecutar:**
```bash
npm test -- tests/redis/mock-client.test.js
```

### 2. Fallback System Tests (`tests/redis/fallback-system.test.js`)

**Propósito:** Verificar el sistema de fallback automático.

**Tests incluidos:**
- ✅ Modo desarrollo (3 tests)
- ✅ Refresh tokens (6 tests)
- ✅ Blacklist de tokens (5 tests)
- ✅ Hybrid cache (3 tests)
- ✅ Estructura de claves (3 tests)
- ✅ Manejo de errores (3 tests)
- ✅ Limpieza de recursos (2 tests)

**Total:** 25 tests

**Ejecutar:**
```bash
npm test -- tests/redis/fallback-system.test.js
```

### 3. Rate Limiter Tests (`tests/redis/rate-limiter.test.js`)

**Propósito:** Verificar rate limiter con mock y Redis real.

**Tests incluidos:**
- ✅ Rate limiter global (3 tests)
- ✅ Rate limiter de autenticación (2 tests)
- ✅ Funcionamiento con mock (2 tests)
- ✅ Manejo de IPs (3 tests)
- ✅ Fail-open behavior (1 test)
- ✅ Helpers (5 tests)

**Total:** 16 tests

**Ejecutar:**
```bash
npm test -- tests/redis/rate-limiter.test.js
```

### 4. Auth Integration Tests (`tests/redis/auth-integration.test.js`)

**Propósito:** Verificar integración con sistema de autenticación.

**Tests incluidos:**
- ✅ Generación de tokens (3 tests)
- ✅ Flujo de login (2 tests)
- ✅ Flujo de logout (2 tests)
- ✅ Refresh tokens (2 tests)
- ✅ Separación por roles (2 tests)
- ✅ Expiración de tokens (2 tests)
- ✅ Múltiples sesiones (1 test)
- ✅ Revocación instantánea (2 tests)
- ✅ Compatibilidad con mock (2 tests)

**Total:** 18 tests

**Ejecutar:**
```bash
npm test -- tests/redis/auth-integration.test.js
```

## 🚀 Ejecutar Tests

### Todos los Tests de Redis

```bash
# Ejecutar toda la suite
npm test -- tests/redis/

# Con output detallado
npm test -- tests/redis/ --verbose

# Con coverage
npm test -- tests/redis/ --coverage
```

### Test Específico

```bash
# Un archivo completo
npm test -- tests/redis/mock-client.test.js

# Un describe block específico
npm test -- tests/redis/mock-client.test.js -t "Operaciones Básicas"

# Un test específico
npm test -- tests/redis/mock-client.test.js -t "debe guardar y recuperar un valor"
```

### Watch Mode (Desarrollo)

```bash
# Re-ejecutar tests al guardar cambios
npm test -- tests/redis/ --watch

# Solo tests fallidos
npm test -- tests/redis/ --watch --onlyFailures
```

### Modo Debug

```bash
# Con breakpoints
node --inspect-brk node_modules/.bin/jest tests/redis/mock-client.test.js

# Luego abrir chrome://inspect en Chrome
```

## 📊 Cobertura de Tests

### Generar Reporte de Cobertura

```bash
# Generar coverage completo
npm test -- tests/redis/ --coverage

# Coverage en formato HTML
npm test -- tests/redis/ --coverage --coverageReporters=html

# Abrir reporte
# Windows
start coverage/index.html

# Linux/Mac
open coverage/index.html
```

### Objetivos de Cobertura

| Archivo | Statements | Branches | Functions | Lines |
|---------|-----------|----------|-----------|-------|
| `config/redisClient.js` | 95% | 90% | 100% | 95% |
| `middlewares/rateLimiter.js` | 90% | 85% | 95% | 90% |
| `utils/jwtHelper.js` | 95% | 90% | 100% | 95% |

### Verificar Cobertura Mínima

```bash
# Fallar si no se alcanza el threshold
npm test -- tests/redis/ --coverage --coverageThreshold='{"global":{"branches":80,"functions":85,"lines":90,"statements":90}}'
```

## 🐛 Debugging de Tests

### Tests Fallidos

```bash
# Ver solo tests fallidos
npm test -- tests/redis/ --onlyFailures

# Ver stack trace completo
npm test -- tests/redis/ --verbose --no-coverage
```

### Logs de Debugging

```javascript
// Agregar en el test
console.log('Estado actual:', await redisModule.isUsingMock());
console.log('Cliente:', await redisModule.getRedisClient());
```

### Timeouts

```javascript
// Aumentar timeout para tests lentos
test('debe expirar después del TTL', async () => {
  // Test code...
}, 15000); // 15 segundos
```

### Limpiar Estado Entre Tests

```javascript
beforeEach(async () => {
  // Limpiar Redis mock
  const client = await redisModule.getRedisClient();
  if (client._clearAll) {
    client._clearAll();
  }
});
```

## 🔄 CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test-redis.yml
name: Redis Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run Redis tests
        env:
          NODE_ENV: development
          JWT_SECRET: ${{ secrets.JWT_SECRET_TEST }}
          JWT_REFRESH_SECRET: ${{ secrets.JWT_REFRESH_SECRET_TEST }}
        run: npm test -- tests/redis/ --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
          flags: redis
```

### Azure Pipelines

```yaml
# azure-pipelines.yml
trigger:
  branches:
    include:
      - main
      - develop

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '18.x'
    displayName: 'Install Node.js'

  - script: npm ci
    displayName: 'Install dependencies'

  - script: |
      export NODE_ENV=development
      npm test -- tests/redis/ --coverage --ci
    displayName: 'Run Redis tests'
    env:
      JWT_SECRET: $(JWT_SECRET_TEST)
      JWT_REFRESH_SECRET: $(JWT_REFRESH_SECRET_TEST)

  - task: PublishCodeCoverageResults@1
    inputs:
      codeCoverageTool: 'Cobertura'
      summaryFileLocation: '$(System.DefaultWorkingDirectory)/coverage/cobertura-coverage.xml'
```

### GitLab CI

```yaml
# .gitlab-ci.yml
test:redis:
  stage: test
  image: node:18
  variables:
    NODE_ENV: development
  before_script:
    - npm ci
  script:
    - npm test -- tests/redis/ --coverage --ci
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura-coverage.xml
```

## 📝 Mejores Prácticas

### 1. Aislar Tests

```javascript
// ✅ Bueno: Cada test es independiente
test('debe guardar token', async () => {
  const uniqueId = Date.now();
  await saveRefreshToken(uniqueId, 'cliente', 'token', 3600);
  // ...
});

// ❌ Malo: Tests dependen entre sí
let globalUserId;
test('debe guardar token', async () => {
  globalUserId = 123;
  // ...
});
```

### 2. Limpiar Estado

```javascript
afterEach(async () => {
  // Limpiar mock
  const client = await getRedisClient();
  if (client._clearAll) {
    client._clearAll();
  }
  
  // Cerrar conexiones
  await closeRedisConnection();
});
```

### 3. Usar Datos de Prueba Únicos

```javascript
// ✅ Bueno: IDs únicos
const userId = `test_${Date.now()}_${Math.random()}`;

// ❌ Malo: IDs hardcodeados
const userId = 123;
```

### 4. Manejar Timeouts

```javascript
// Para tests con TTL
test('debe expirar', async () => {
  await setEx('key', 1, 'value');
  await new Promise(r => setTimeout(r, 1500));
  // ...
}, 10000); // Timeout suficiente
```

### 5. Verificar Errores

```javascript
test('debe manejar errores', async () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation();
  
  // Código que genera error
  
  expect(errorSpy).toHaveBeenCalled();
  errorSpy.mockRestore();
});
```

## 🎯 Checklist de Testing

Antes de hacer commit, verifica:

- [ ] Todos los tests pasan
- [ ] Cobertura > 90%
- [ ] No hay warnings en consola
- [ ] Tests son independientes
- [ ] Estado se limpia entre tests
- [ ] Timeouts configurados apropiadamente
- [ ] Errores se manejan correctamente
- [ ] Documentación actualizada

## 📚 Recursos Adicionales

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Redis Smart Fallback Docs](./REDIS_SMART_FALLBACK.md)

---

**Última actualización:** 2026-03-11  
**Versión:** 1.0.0  
**Autor:** RazoConnect Team
