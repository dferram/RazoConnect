# 🧪 Suite de Tests - RazoConnect

## ✅ Resumen de Ejecución

**Estado:** ✅ TODOS LOS TESTS PASANDO

```
Test Suites: 8 passed, 8 total
Tests:       86 passed, 86 total
Snapshots:   0 total
Time:        1.733 s
```

---

## 📊 Cobertura de Código

### Resumen General

| Categoría | Statements | Branches | Functions | Lines |
|-----------|-----------|----------|-----------|-------|
| **Utils** | 8.33% | 5.08% | 13.44% | 8.35% |
| **Middlewares** | 13.04% | 10.38% | 12% | 13.06% |
| **Controllers** | 0% | 0% | 0% | 0% |

### Archivos con Mayor Cobertura

| Archivo | Statements | Branches | Functions | Lines |
|---------|-----------|----------|-----------|-------|
| `validateUserTenant.js` | **100%** | 92.85% | **100%** | **100%** |
| `jwtHelper.js` | 70.58% | 44% | 66.66% | 70.58% |
| `validator.js` | 67.27% | 45.65% | 88.88% | 66.66% |
| `inputValidator.js` | 40.64% | 32.57% | 36.36% | 42.55% |
| `skuGenerator.js` | 20.51% | 16.66% | 28.57% | 22.22% |

---

## 📁 Estructura de Tests Implementada

```
tests/
├── helpers/
│   ├── mockAuth.js          # Helpers para generar tokens de prueba
│   └── mockDb.js            # Mock de la base de datos
├── integration/
│   └── routes/
│       ├── auth.test.js     # Tests de autenticación (5 tests)
│       └── cupones.test.js  # Tests de cupones (8 tests)
├── unit/
│   ├── middlewares/
│   │   ├── inputValidator.test.js      # Tests de validación (17 tests)
│   │   └── validateUserTenant.test.js  # Tests de tenant (8 tests)
│   └── utils/
│       ├── emailTemplates.test.js      # Tests de templates (20 tests)
│       ├── jwtHelper.test.js           # Tests de JWT (9 tests)
│       ├── skuGenerator.test.js        # Tests de SKU (8 tests)
│       └── validator.test.js           # Tests de validación (11 tests)
└── setup.js                 # Configuración global de mocks
```

---

## 🧪 Tests Implementados por Módulo

### 1. Utils - jwtHelper.js (9 tests)
✅ `generateToken` debe retornar un string con 3 partes separadas por "."  
✅ `generateToken` debe generar un token válido con payload completo  
✅ `verifyToken` debe retornar el payload original con token válido  
✅ `verifyToken` debe lanzar un Error cuando el token es inválido  
✅ `verifyToken` debe lanzar un Error cuando el token está expirado  
✅ `generateAccessToken` debe generar un token válido con payload normalizado  
✅ `generateAccessToken` debe normalizar el payload correctamente  
✅ `verifyAccessToken` debe verificar y decodificar un access token válido  
✅ `verifyAccessToken` debe lanzar un Error cuando el access token es inválido  

### 2. Utils - validator.js (11 tests)
✅ `isValidEmail` debe retornar true para email válido  
✅ `isValidEmail` debe retornar false para email sin dominio  
✅ `isValidEmail` debe retornar false para string vacío  
✅ `isValidEmail` debe retornar false para email sin arroba  
✅ `isValidPhone` debe retornar true para 10 dígitos  
✅ `isValidPhone` debe retornar false para número muy corto  
✅ `isValidPhone` debe retornar true para número con espacios  
✅ `isValidPhone` debe retornar false para texto con letras  
✅ `validateClienteRegistro` debe retornar valid: true para datos completos  
✅ `validateClienteRegistro` debe retornar error cuando falta el nombre  
✅ `validateClienteRegistro` debe retornar error cuando el password es menor a 6 caracteres  

### 3. Utils - skuGenerator.js (8 tests)
✅ `normalizarTexto` debe quitar acentos y convertir a mayúsculas  
✅ `normalizarTexto` debe quitar acentos de la letra é  
✅ `normalizarTexto` debe convertir a mayúsculas texto normal  
✅ `generarPrefijo` debe generar prefijo de 3 letras para palabra normal  
✅ `generarPrefijo` debe rellenar con X hasta 3 caracteres para palabras cortas  
✅ `generarPrefijo` debe lanzar Error para texto sin letras  
✅ `generarPrefijo` debe manejar texto con acentos correctamente  
✅ `generarPrefijo` debe ignorar espacios y caracteres especiales  

### 4. Utils - emailTemplates.js (20 tests)
✅ `escapeHtml` debe escapar caracteres HTML peligrosos  
✅ `escapeHtml` debe retornar texto normal sin cambios  
✅ `escapeHtml` debe retornar string vacío para null  
✅ `escapeHtml` debe retornar string vacío para undefined  
✅ `escapeHtml` debe escapar comillas simples y dobles  
✅ `escapeHtml` debe escapar ampersand  
✅ `formatCurrency` debe formatear 100 como $100.00  
✅ `formatCurrency` debe formatear 1234.5 como $1234.50  
✅ `formatCurrency` debe formatear 0 como $0.00  
✅ `formatCurrency` debe retornar $0.00 para valor inválido  
✅ `formatCurrency` debe manejar números negativos  
✅ `formatCurrency` debe manejar null como $0.00  
✅ `formatCurrency` debe manejar undefined como $0.00  
✅ `buildAbsoluteUrl` debe retornar URL absoluta sin cambios  
✅ `buildAbsoluteUrl` debe convertir URL relativa a absoluta  
✅ `buildAbsoluteUrl` debe retornar URL de placeholder para null  
✅ `buildAbsoluteUrl` debe retornar URL de placeholder para undefined  
✅ `buildAbsoluteUrl` debe retornar URL de placeholder para string vacío  
✅ `buildAbsoluteUrl` debe manejar URLs que empiezan con //  
✅ `buildAbsoluteUrl` debe usar frontendBaseUrl personalizado  

### 5. Middlewares - inputValidator.js (17 tests)
✅ `sanitizeInputs` debe sanitizar un body con script tag  
✅ `sanitizeInputs` debe eliminar key __proto__ del body  
✅ `sanitizeInputs` debe pasar inputs normales sin modificación  
✅ `sanitizeInputs` debe sanitizar query params  
✅ `sanitizeInputs` debe manejar errores y retornar 400  
✅ `preventSQLInjection` debe bloquear body con DROP TABLE  
✅ `preventSQLInjection` debe bloquear body con UNION SELECT  
✅ `preventSQLInjection` debe permitir body normal sin SQL injection  
✅ `preventSQLInjection` debe bloquear query params con patrones SQL  
✅ `preventSQLInjection` debe permitir palabras normales que contengan SELECT  
✅ `sanitizeObject` debe eliminar __proto__ de objetos anidados  
✅ `sanitizeObject` debe sanitizar arrays de objetos  
✅ `sanitizeObject` debe retornar null para null  
✅ `sanitizeObject` debe retornar undefined para undefined  

### 6. Middlewares - validateUserTenant.js (8 tests)
✅ Debe llamar next() cuando usuario y tenant coinciden  
✅ Debe llamar next() cuando no hay req.user  
✅ Debe llamar next() cuando no hay req.tenant  
✅ Debe hacer logout y retornar 401 cuando hay tenant mismatch  
✅ Debe manejar el caso cuando no hay sesión pero hay mismatch  
✅ Debe loguear información de seguridad cuando detecta mismatch  
✅ Debe manejar errores en logout sin romper el flujo  
✅ Debe manejar errores en session.destroy sin romper el flujo  

### 7. Integration - auth.test.js (5 tests)
✅ Debe validar correctamente credenciales con email y password  
✅ Debe retornar error cuando falta el email  
✅ Debe retornar error cuando falta el password  
✅ Debe hashear y verificar contraseñas correctamente  
✅ Debe rechazar contraseñas incorrectas  

### 8. Integration - cupones.test.js (8 tests)
✅ Debe retornar 200 con descuento calculado para cupón válido  
✅ Debe retornar 404 cuando el cupón no existe  
✅ Debe retornar 400 cuando el cupón está expirado  
✅ Debe retornar 400 cuando los usos están agotados  
✅ Debe retornar 400 cuando el subtotal es menor al mínimo  
✅ Debe calcular correctamente descuento de tipo PORCENTAJE  
✅ Debe calcular correctamente descuento de tipo FIJO  

---

## 🔧 Configuración

### package.json - Scripts
```json
{
  "test": "jest --testEnvironment=node --detectOpenHandles",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage"
}
```

### jest.config.js
```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'utils/**/*.js',
    'middlewares/**/*.js',
    'controllers/**/*.js',
    '!**/node_modules/**'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000
};
```

---

## 🚀 Cómo Ejecutar los Tests

### Ejecutar todos los tests
```bash
npm test
```

### Ejecutar tests en modo watch
```bash
npm run test:watch
```

### Generar reporte de cobertura
```bash
npm run test:coverage
```

### Ejecutar un archivo específico
```bash
npm test -- tests/unit/utils/jwtHelper.test.js
```

---

## 📝 Notas Importantes

### Mocks Globales
El archivo `tests/setup.js` configura mocks para:
- Base de datos (db.js)
- Redis (config/redisClient.js)
- Rate limiters (middlewares/rateLimiter.js)
- Email service (services/emailService.js)
- Notificaciones (services/notificacionesService.js)

### Variables de Entorno para Tests
```env
JWT_SECRET=test-secret-suficientemente-largo-32chars
JWT_REFRESH_SECRET=test-refresh-secret-suficientemente-largo-32chars
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=30d
SESSION_SECRET=test-session-secret-suficientemente-largo
NODE_ENV=test
FRONTEND_BASE_URL=https://tudominio.com
BCRYPT_ROUNDS=10
```

---

## 🎯 Próximos Pasos Recomendados

1. **Aumentar cobertura de controllers** (actualmente 0%)
   - Implementar tests para `productosController.js`
   - Implementar tests para `pedidosController.js`
   - Implementar tests para `carritoController.js`

2. **Aumentar cobertura de utils** (actualmente 8.33%)
   - Tests para `calculadoraPedidos.js`
   - Tests para `transactionManager.js`
   - Tests para `emailValidator.js`

3. **Tests de integración E2E**
   - Flujo completo de registro → login → compra
   - Flujo de administración de productos
   - Flujo de gestión de inventario

4. **Tests de rendimiento**
   - Carga de productos
   - Procesamiento de pedidos masivos
   - Consultas de reportes

---

## 📚 Recursos

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

**Fecha de implementación:** 28 de Febrero, 2026  
**Versión:** 1.0.0  
**Mantenedor:** RazoConnect Development Team
