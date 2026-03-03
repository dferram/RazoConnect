/**
 * ════════════════════════════════════════════════════════════
 * TEST SUITE: Módulos Financieros con Roles Granulares
 * ════════════════════════════════════════════════════════════
 * 
 * Tests para verificar:
 * - Módulo Créditos (aprobar, rechazar, ver pendientes)
 * - Módulo Reportes (rentabilidad, valuación, aging)
 * - Módulo CXC (ver, registrar pagos, exportar)
 * - Módulo CXP (ver, registrar pagos, exportar)
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// ════════════════════════════════════════════════════════════
// MOCKS
// ════════════════════════════════════════════════════════════

jest.mock('../../db', () => ({
  query: jest.fn(),
}));

jest.mock('../../config/redisClient', () => ({
  isTokenBlacklisted: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../middlewares/tenantSessionGuard', () => {
  return jest.fn((req, res, next) => next());
});

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

// Mock de controladores
jest.mock('../../controllers/creditoController', () => ({
  obtenerSolicitudesPendientes: jest.fn((req, res) => res.json({ success: true })),
  analizarRiesgoCredito: jest.fn((req, res) => res.json({ success: true })),
  aprobarSolicitud: jest.fn((req, res) => res.json({ success: true })),
  rechazarSolicitud: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/reportesController', () => ({
  getReporteRentabilidad: jest.fn((req, res) => res.json({ success: true })),
  getValuacionInventario: jest.fn((req, res) => res.json({ success: true })),
  getAgingBackorders: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/cxcEnhancedController', () => ({
  registrarPagoManual: jest.fn((req, res) => res.json({ success: true })),
  getEstadoCuentaCliente: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/cxpAdminController', () => ({
  registrarPagoCuentaPorPagar: jest.fn((req, res) => res.json({ success: true })),
  getResumenEstadoCuentaProveedores: jest.fn((req, res) => res.json({ success: true })),
  getEstadoCuentaProveedorMovimientos: jest.fn((req, res) => res.json({ success: true })),
  getProductosRecibidosPorCxp: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../middlewares/rateLimiter', () => ({
  heavyOperationLimiter: jest.fn((req, res, next) => next()),
  authLimiter: jest.fn((req, res, next) => next()),
}));

jest.mock('../../middlewares/validate', () => jest.fn((req, res, next) => next()));

jest.mock('../../middlewares/uploadComprobante', () => ({
  single: jest.fn(() => (req, res, next) => next()),
}));

// Mock all admin controllers to prevent initialization errors
jest.mock('../../controllers/auth/adminAuthController', () => ({
  loginAdmin: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/authAdminController', () => ({
  loginAdmin: jest.fn((req, res) => res.json({ success: true })),
}));

const pool = require('../../db');

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

/**
 * Genera un token JWT válido para testing
 */
function generateTestToken(payload) {
  const secret = process.env.JWT_SECRET || 'test-secret-key';
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

/**
 * Mock de resultado de base de datos para administradores
 */
function mockAdminQuery(adminData) {
  pool.query.mockImplementation((query, params) => {
    if (query.includes('administradores')) {
      return Promise.resolve({
        rows: adminData ? [adminData] : [],
      });
    }
    if (query.includes('agentesdeventas')) {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  });
}

/**
 * Crea una app Express de prueba con las rutas importadas
 */
function createTestAppWithRoutes(routePath) {
  const app = express();
  app.use(express.json());
  
  // Importar las rutas reales
  const routes = require(`../../routes/${routePath}`);
  app.use('/api', routes);
  
  return app;
}

/**
 * Crea una app Express de prueba con middleware específico
 */
function createTestAppWithMiddleware(middleware, method = 'post', path = '/test') {
  const { authenticate } = require('../../middlewares/roleMiddleware');
  const app = express();
  app.use(express.json());
  
  // Ruta de prueba con el middleware específico
  app[method](path, authenticate, middleware, (req, res) => {
    res.json({ success: true });
  });
  
  return app;
}

// ════════════════════════════════════════════════════════════
// TEST SUITE 1: Módulo Créditos
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 1: Módulo Créditos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/creditos/aprobar', () => {
    test('✅ encargado_credito puede aprobar crédito', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'encargado_credito',
        tenant_id: 1,
        email: 'credito@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'encargado_credito',
        activo: true,
        email: 'credito@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('creditos');
      
      const response = await request(app)
        .post('/api/aprobar')
        .set('Authorization', `Bearer ${token}`)
        .send({ solicitud_id: 1 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ admin puede aprobar crédito', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'admin',
        tenant_id: 1,
        email: 'admin@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'admin',
        activo: true,
        email: 'admin@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('creditos');
      
      const response = await request(app)
        .post('/api/aprobar')
        .set('Authorization', `Bearer ${token}`)
        .send({ solicitud_id: 1 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ super_admin puede aprobar crédito', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'super_admin',
        tenant_id: 1,
        email: 'superadmin@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'super_admin',
        activo: true,
        email: 'superadmin@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('creditos');
      
      const response = await request(app)
        .post('/api/aprobar')
        .set('Authorization', `Bearer ${token}`)
        .send({ solicitud_id: 1 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ contador recibe 403 (puede ver pero no aprobar)', async () => {
      const token = generateTestToken({
        id: 4,
        rol: 'contador',
        tenant_id: 1,
        email: 'contador@test.com'
      });

      mockAdminQuery({
        adminid: 4,
        rol: 'contador',
        activo: true,
        email: 'contador@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('creditos');
      
      const response = await request(app)
        .post('/api/aprobar')
        .set('Authorization', `Bearer ${token}`)
        .send({ solicitud_id: 1 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ ejecutivo_cobranza recibe 403', async () => {
      const token = generateTestToken({
        id: 5,
        rol: 'ejecutivo_cobranza',
        tenant_id: 1,
        email: 'cobranza@test.com'
      });

      mockAdminQuery({
        adminid: 5,
        rol: 'ejecutivo_cobranza',
        activo: true,
        email: 'cobranza@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('creditos');
      
      const response = await request(app)
        .post('/api/aprobar')
        .set('Authorization', `Bearer ${token}`)
        .send({ solicitud_id: 1 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ almacenista recibe 403', async () => {
      const token = generateTestToken({
        id: 6,
        rol: 'almacenista',
        tenant_id: 1,
        email: 'almacenista@test.com'
      });

      mockAdminQuery({
        adminid: 6,
        rol: 'almacenista',
        activo: true,
        email: 'almacenista@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('creditos');
      
      const response = await request(app)
        .post('/api/aprobar')
        .set('Authorization', `Bearer ${token}`)
        .send({ solicitud_id: 1 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/creditos/pendientes', () => {
    test('✅ encargado_credito puede ver', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'encargado_credito',
        tenant_id: 1,
        email: 'credito@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'encargado_credito',
        activo: true,
        email: 'credito@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('creditos');
      
      const response = await request(app)
        .get('/api/pendientes')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ gerente_finanzas puede ver', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'gerente_finanzas',
        tenant_id: 1,
        email: 'gerente@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'gerente_finanzas',
        activo: true,
        email: 'gerente@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('creditos');
      
      const response = await request(app)
        .get('/api/pendientes')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ supervisor_ventas recibe 403', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'supervisor_ventas',
        tenant_id: 1,
        email: 'supervisor@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'supervisor_ventas',
        activo: true,
        email: 'supervisor@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('creditos');
      
      const response = await request(app)
        .get('/api/pendientes')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 2: Módulo Reportes
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 2: Módulo Reportes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/rentabilidad', () => {
    test('✅ gerente_finanzas puede ver', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'gerente_finanzas',
        tenant_id: 1,
        email: 'gerente@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'gerente_finanzas',
        activo: true,
        email: 'gerente@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('reportes');
      
      const response = await request(app)
        .get('/api/rentabilidad')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ contador puede ver', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'contador',
        tenant_id: 1,
        email: 'contador@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'contador',
        activo: true,
        email: 'contador@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('reportes');
      
      const response = await request(app)
        .get('/api/rentabilidad')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ auditor_interno puede ver', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'auditor_interno',
        tenant_id: 1,
        email: 'auditor@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'auditor_interno',
        activo: true,
        email: 'auditor@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('reportes');
      
      const response = await request(app)
        .get('/api/rentabilidad')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ ejecutivo_cobranza recibe 403', async () => {
      const token = generateTestToken({
        id: 4,
        rol: 'ejecutivo_cobranza',
        tenant_id: 1,
        email: 'cobranza@test.com'
      });

      mockAdminQuery({
        adminid: 4,
        rol: 'ejecutivo_cobranza',
        activo: true,
        email: 'cobranza@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('reportes');
      
      const response = await request(app)
        .get('/api/rentabilidad')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ almacenista recibe 403', async () => {
      const token = generateTestToken({
        id: 5,
        rol: 'almacenista',
        tenant_id: 1,
        email: 'almacenista@test.com'
      });

      mockAdminQuery({
        adminid: 5,
        rol: 'almacenista',
        activo: true,
        email: 'almacenista@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('reportes');
      
      const response = await request(app)
        .get('/api/rentabilidad')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ marketing recibe 403', async () => {
      const token = generateTestToken({
        id: 6,
        rol: 'marketing',
        tenant_id: 1,
        email: 'marketing@test.com'
      });

      mockAdminQuery({
        adminid: 6,
        rol: 'marketing',
        activo: true,
        email: 'marketing@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('reportes');
      
      const response = await request(app)
        .get('/api/rentabilidad')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 3: CXC (Cuentas por Cobrar)
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 3: CXC', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /cxc/registrar-pago-manual (middleware test)', () => {
    const { authorizeRole } = require('../../middlewares/roleMiddleware');
    const cxcMiddleware = authorizeRole(['super_admin', 'admin', 'gerente_finanzas', 'ejecutivo_cobranza']);

    test('✅ ejecutivo_cobranza puede registrar pago', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'ejecutivo_cobranza',
        tenant_id: 1,
        email: 'cobranza@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'ejecutivo_cobranza',
        activo: true,
        email: 'cobranza@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(cxcMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ cliente_id: 1, monto: 1000 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ gerente_finanzas puede registrar pago', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'gerente_finanzas',
        tenant_id: 1,
        email: 'gerente@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'gerente_finanzas',
        activo: true,
        email: 'gerente@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(cxcMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ cliente_id: 1, monto: 1000 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ contador NO puede registrar pago (solo ver)', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'contador',
        tenant_id: 1,
        email: 'contador@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'contador',
        activo: true,
        email: 'contador@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(cxcMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ cliente_id: 1, monto: 1000 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ soporte_cliente recibe 403', async () => {
      const token = generateTestToken({
        id: 4,
        rol: 'soporte_cliente',
        tenant_id: 1,
        email: 'soporte@test.com'
      });

      mockAdminQuery({
        adminid: 4,
        rol: 'soporte_cliente',
        activo: true,
        email: 'soporte@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(cxcMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ cliente_id: 1, monto: 1000 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 4: CXP (Cuentas por Pagar)
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 4: CXP', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /cuentas-por-pagar/:id/pagar (middleware test)', () => {
    const { authorizeRole } = require('../../middlewares/roleMiddleware');
    const cxpMiddleware = authorizeRole(['super_admin', 'admin', 'gerente_finanzas', 'contador']);

    test('✅ gerente_finanzas puede pagar', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'gerente_finanzas',
        tenant_id: 1,
        email: 'gerente@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'gerente_finanzas',
        activo: true,
        email: 'gerente@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(cxpMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ monto: 5000 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ contador puede pagar', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'contador',
        tenant_id: 1,
        email: 'contador@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'contador',
        activo: true,
        email: 'contador@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(cxpMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ monto: 5000 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ compras NO puede registrar pago (solo ver)', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'compras',
        tenant_id: 1,
        email: 'compras@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'compras',
        activo: true,
        email: 'compras@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(cxpMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ monto: 5000 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ recepcionista_compras recibe 403', async () => {
      const token = generateTestToken({
        id: 4,
        rol: 'recepcionista_compras',
        tenant_id: 1,
        email: 'recepcion@test.com'
      });

      mockAdminQuery({
        adminid: 4,
        rol: 'recepcionista_compras',
        activo: true,
        email: 'recepcion@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(cxpMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ monto: 5000 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});
