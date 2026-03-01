# Tests - RazoConnect

Este directorio contiene la suite completa de tests para el proyecto RazoConnect.

## Estructura

```
tests/
├── helpers/           # Funciones auxiliares reutilizables
├── integration/       # Tests de integración (rutas HTTP)
├── unit/             # Tests unitarios (funciones aisladas)
│   ├── middlewares/  # Tests de middlewares
│   └── utils/        # Tests de utilidades
├── setup.js          # Configuración global de mocks
└── README.md         # Este archivo
```

## Comandos Rápidos

```bash
# Ejecutar todos los tests
npm test

# Ejecutar tests en modo watch (útil durante desarrollo)
npm run test:watch

# Generar reporte de cobertura
npm run test:coverage

# Ejecutar un archivo específico
npm test -- tests/unit/utils/jwtHelper.test.js

# Ejecutar tests que coincidan con un patrón
npm test -- --testNamePattern="debe validar"
```

## Escribir Nuevos Tests

### Test Unitario Básico

```javascript
const { miFuncion } = require('../../utils/miFuncion');

describe('miFuncion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('debe retornar el resultado esperado', () => {
    const resultado = miFuncion('input');
    expect(resultado).toBe('output esperado');
  });

  it('debe lanzar error cuando el input es inválido', () => {
    expect(() => {
      miFuncion(null);
    }).toThrow('Error esperado');
  });
});
```

### Test de Middleware

```javascript
const miMiddleware = require('../../middlewares/miMiddleware');

const mockReq = (body = {}) => ({ body });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = () => jest.fn();

describe('miMiddleware', () => {
  it('debe llamar next() cuando todo es válido', () => {
    const req = mockReq({ campo: 'valor' });
    const res = mockRes();
    const next = mockNext();

    miMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
```

### Test de Integración con Supertest

```javascript
const request = require('supertest');
const express = require('express');
const misRoutes = require('../../routes/misRoutes');
const db = require('../../db');

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api', misRoutes);
  return app;
};

describe('Mis Routes', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  it('debe retornar 200 en GET /api/endpoint', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const response = await request(app)
      .get('/api/endpoint')
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
```

## 🔧 Helpers Disponibles

### mockAuth.js

```javascript
const { mockCliente, mockAdmin, tokenFor } = require('../helpers/mockAuth');

// Crear payload de cliente
const cliente = mockCliente({ userId: 1, email: 'test@test.com' });

// Crear payload de admin
const admin = mockAdmin({ userId: 10 });

// Generar token para tests
const token = tokenFor(cliente);
```

### mockDb.js

```javascript
const { createMockDb } = require('../helpers/mockDb');

const db = createMockDb();
db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
```

## Buenas Prácticas

### 1. Nombres Descriptivos en Español
```javascript
// ✅ Bien
it('debe retornar error cuando el email es inválido', () => {});

// ❌ Mal
it('should return error when email is invalid', () => {});
```

### 2. Usar beforeEach para Limpiar Mocks
```javascript
beforeEach(() => {
  jest.clearAllMocks();
});
```

### 3. Tests Independientes
Cada test debe poder ejecutarse de forma aislada sin depender de otros tests.

### 4. Mockear Dependencias Externas
```javascript
// En setup.js o al inicio del test
jest.mock('../db', () => ({
  query: jest.fn()
}));
```

### 5. Verificar Tanto el Caso Feliz como los Errores
```javascript
describe('validarEmail', () => {
  it('debe retornar true para email válido', () => {
    expect(validarEmail('test@test.com')).toBe(true);
  });

  it('debe retornar false para email inválido', () => {
    expect(validarEmail('invalid')).toBe(false);
  });
});
```

## Debugging Tests

### Ver Output Detallado
```bash
npm test -- --verbose
```

### Ejecutar Solo un Test
```javascript
it.only('debe ejecutar solo este test', () => {
  // ...
});
```

### Saltar un Test Temporalmente
```javascript
it.skip('este test se saltará', () => {
  // ...
});
```

### Ver Logs de Console
Los `console.log` dentro de los tests se mostrarán en la salida.

## Cobertura de Código

El reporte de cobertura se genera en `coverage/`:

```bash
npm run test:coverage

# Ver reporte HTML
open coverage/lcov-report/index.html  # macOS
start coverage/lcov-report/index.html # Windows
```

### Interpretar Métricas

- **Statements**: Porcentaje de líneas ejecutadas
- **Branches**: Porcentaje de ramas (if/else) cubiertas
- **Functions**: Porcentaje de funciones ejecutadas
- **Lines**: Similar a statements pero cuenta líneas físicas

**Meta recomendada:** >80% en todos los módulos críticos

## Problemas Comunes

### "Cannot find module"
Verifica que la ruta del `require()` sea correcta y use rutas relativas desde el archivo de test.

### "Jest did not exit one second after the test run"
Agrega `--detectOpenHandles` al comando (ya incluido en package.json).

### Mocks no funcionan
Asegúrate de que los mocks estén definidos ANTES de importar el módulo que los usa.

### Tests pasan localmente pero fallan en CI
Verifica que las variables de entorno estén configuradas en el entorno de CI.

## Seguridad en Tests

### NO incluir datos sensibles
```javascript
// ❌ Mal
const apiKey = 'sk_live_1234567890';

// ✅ Bien
const apiKey = 'test_key_mock';
```

### Usar variables de entorno de test
Definidas en `setup.js`:
```javascript
process.env.JWT_SECRET = 'test-secret-suficientemente-largo-32chars';
```

## Recursos Adicionales

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest GitHub](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Jest Cheat Sheet](https://github.com/sapegin/jest-cheat-sheet)

## Contribuir

Al agregar nuevas funcionalidades:

1. ✅ Escribe tests ANTES de implementar (TDD)
2. ✅ Asegúrate de que todos los tests pasen
3. ✅ Mantén la cobertura >80% en archivos modificados
4. ✅ Documenta casos edge en los tests

---

**¿Preguntas?** Consulta el archivo `TEST_RESULTS.md` en la raíz del proyecto para ver el estado actual de los tests.
