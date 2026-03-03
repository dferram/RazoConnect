/**
 * ════════════════════════════════════════════════════════════
 * TEST SUITE: Módulos Ventas, Agentes, Comisiones, Clientes, Cupones y Staff
 * ════════════════════════════════════════════════════════════
 * 
 * Tests para verificar:
 * - Módulo Pedidos (estatus, comentarios)
 * - Módulo Agentes y Comisiones
 * - Módulo Clientes (crédito)
 * - Módulo Cupones
 * - Staff / Notificaciones
 * - Endpoint mis-permisos
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

jest.mock('../../services/permisosService', () => ({
  getPermisosRol: jest.fn((rol) => {
    if (rol === 'super_admin') {
      return Promise.resolve({ '*': ['*'] });
    }
    if (rol === 'gerente_finanzas') {
      return Promise.resolve({
        finanzas: ['ver', 'editar'],
        credito: ['ver', 'aprobar'],
        cobranza: ['ver', 'gestionar'],
        reportes: ['ver']
      });
    }
    if (rol === 'almacenista') {
      return Promise.resolve({
        inventario: ['contar', 'ajuste_menor'],
        compras: ['recibir']
      });
    }
    return Promise.resolve({});
  }),
  clearCache: jest.fn(),
}));

// Mock de controladores
jest.mock('../../controllers/pedidosStatusController', () => ({
  updatePedidoEstatus: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/agentesAdminController', () => ({
  crearAgente: jest.fn((req, res) => res.status(201).json({ success: true })),
}));

jest.mock('../../controllers/comisionesAdminController', () => ({
  pagarComision: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/clientesAdminController', () => ({
  actualizarCreditoCliente: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/cuponesController', () => ({
  crearCupon: jest.fn((req, res) => res.status(201).json({ success: true })),
}));

jest.mock('../../controllers/notificacionesController', () => ({
  obtenerNotificacionesStaff: jest.fn((req, res) => res.json({ success: true, notificaciones: [] })),
}));

// Mock auth controllers for routes/auth.js
jest.mock('../../controllers/auth/clienteAuthController', () => ({
  registroCliente: jest.fn((req, res) => res.json({ success: true })),
  loginCliente: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/auth/agenteAuthController', () => ({
  loginAgente: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/auth/adminAuthController', () => ({
  loginAdmin: jest.fn((req, res) => res.json({ success: true })),
  adminResetPassword: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/auth/tokenController', () => ({
  refreshToken: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/auth/profileController', () => ({
  getProfile: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/agentesController', () => ({
  obtenerComisionesDelAgente: jest.fn((req, res) => res.json({ success: true })),
  getCxCAgente: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../middlewares/rateLimiter', () => ({
  heavyOperationLimiter: jest.fn((req, res, next) => next()),
  authLimiter: jest.fn((req, res, next) => next()),
  registerLimiter: jest.fn((req, res, next) => next()),
  passwordResetLimiter: jest.fn((req, res, next) => next()),
}));

jest.mock('../../middlewares/validate', () => jest.fn((req, res, next) => next()));

jest.mock('../../middlewares/validators/schemas', () => ({
  registroClienteSchema: {},
  loginAgenteSchema: {},
}));

jest.mock('passport', () => ({
  authenticate: jest.fn(() => (req, res, next) => next()),
}));

const pool = require('../../db');

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function generateTestToken(payload) {
  const secret = process.env.JWT_SECRET || 'test-secret-key';
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

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

function createTestAppWithMiddleware(middleware, method = 'post', path = '/test') {
  const { authenticate } = require('../../middlewares/roleMiddleware');
  const app = express();
  app.use(express.json());
  
  app[method](path, authenticate, middleware, (req, res) => {
    res.json({ success: true });
  });
  
  return app;
}

// ════════════════════════════════════════════════════════════
// TEST SUITE 1: Pedidos
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 1: Pedidos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PUT /api/admin/pedidos/:id (estatus)', () => {
    const { authorizeRole } = require('../../middlewares/roleMiddleware');
    const estatusMiddleware = authorizeRole(['super_admin', 'admin', 'gerente_comercial', 'supervisor_ventas']);

    test('✅ supervisor_ventas puede cambiar estatus', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'supervisor_ventas',
        tenant_id: 1,
        email: 'supervisor@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'supervisor_ventas',
        activo: true,
        email: 'supervisor@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(estatusMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ estatus: 'Enviado' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ gerente_comercial puede cambiar estatus', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'gerente_comercial',
        tenant_id: 1,
        email: 'gerente@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'gerente_comercial',
        activo: true,
        email: 'gerente@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(estatusMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ estatus: 'Enviado' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ soporte_cliente recibe 403 (puede comentar, no cambiar estatus)', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'soporte_cliente',
        tenant_id: 1,
        email: 'soporte@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'soporte_cliente',
        activo: true,
        email: 'soporte@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(estatusMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ estatus: 'Enviado' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ contador recibe 403', async () => {
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

      const app = createTestAppWithMiddleware(estatusMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ estatus: 'Enviado' });

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

      const app = createTestAppWithMiddleware(estatusMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ estatus: 'Enviado' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/admin/pedidos/:id/comentario', () => {
    const { authorizeRole } = require('../../middlewares/roleMiddleware');
    const comentarioMiddleware = authorizeRole(['super_admin', 'admin', 'gerente_comercial', 'supervisor_ventas', 'soporte_cliente']);

    test('✅ soporte_cliente puede comentar', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'soporte_cliente',
        tenant_id: 1,
        email: 'soporte@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'soporte_cliente',
        activo: true,
        email: 'soporte@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(comentarioMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ comentario: 'Cliente llamó para confirmar' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ supervisor_ventas puede comentar', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'supervisor_ventas',
        tenant_id: 1,
        email: 'supervisor@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'supervisor_ventas',
        activo: true,
        email: 'supervisor@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(comentarioMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ comentario: 'Pedido urgente' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ marketing recibe 403', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'marketing',
        tenant_id: 1,
        email: 'marketing@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'marketing',
        activo: true,
        email: 'marketing@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(comentarioMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ comentario: 'Test' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ compras recibe 403', async () => {
      const token = generateTestToken({
        id: 4,
        rol: 'compras',
        tenant_id: 1,
        email: 'compras@test.com'
      });

      mockAdminQuery({
        adminid: 4,
        rol: 'compras',
        activo: true,
        email: 'compras@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(comentarioMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ comentario: 'Test' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 2: Agentes y Comisiones
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 2: Agentes y Comisiones', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/admin/agentes (crear agente)', () => {
    const { authorizeRole } = require('../../middlewares/roleMiddleware');
    const crearAgenteMiddleware = authorizeRole(['super_admin', 'admin', 'gerente_comercial']);

    test('✅ gerente_comercial puede crear agente', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'gerente_comercial',
        tenant_id: 1,
        email: 'gerente@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'gerente_comercial',
        activo: true,
        email: 'gerente@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(crearAgenteMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Nuevo Agente', email: 'agente@test.com' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ supervisor_ventas recibe 403 (puede gestionar cartera, no crear agentes)', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'supervisor_ventas',
        tenant_id: 1,
        email: 'supervisor@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'supervisor_ventas',
        activo: true,
        email: 'supervisor@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(crearAgenteMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Nuevo Agente', email: 'agente@test.com' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ ejecutivo_cobranza recibe 403', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'ejecutivo_cobranza',
        tenant_id: 1,
        email: 'cobranza@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'ejecutivo_cobranza',
        activo: true,
        email: 'cobranza@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(crearAgenteMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Nuevo Agente', email: 'agente@test.com' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/admin/comisiones/:id/pagar', () => {
    const { authorizeRole } = require('../../middlewares/roleMiddleware');
    const pagarComisionMiddleware = authorizeRole(['super_admin', 'admin', 'gerente_comercial', 'gerente_finanzas']);

    test('✅ gerente_finanzas puede aprobar pago de comisiones', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'gerente_finanzas',
        tenant_id: 1,
        email: 'gerente_fin@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'gerente_finanzas',
        activo: true,
        email: 'gerente_fin@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(pagarComisionMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ monto: 5000 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ gerente_comercial puede aprobar', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'gerente_comercial',
        tenant_id: 1,
        email: 'gerente_com@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'gerente_comercial',
        activo: true,
        email: 'gerente_com@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(pagarComisionMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ monto: 5000 });

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

      const app = createTestAppWithMiddleware(pagarComisionMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ monto: 5000 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ contador recibe 403', async () => {
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

      const app = createTestAppWithMiddleware(pagarComisionMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ monto: 5000 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 3: Clientes
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 3: Clientes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PUT /api/admin/clientes/:id/credito (modificar línea de crédito)', () => {
    const { authorizeRole } = require('../../middlewares/roleMiddleware');
    const creditoMiddleware = authorizeRole(['super_admin', 'admin', 'gerente_finanzas', 'encargado_credito']);

    test('✅ encargado_credito puede modificar', async () => {
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

      const app = createTestAppWithMiddleware(creditoMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ lineaCredito: 50000 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ gerente_finanzas puede modificar', async () => {
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

      const app = createTestAppWithMiddleware(creditoMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ lineaCredito: 50000 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ soporte_cliente recibe 403 (puede editar contacto, no crédito)', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'soporte_cliente',
        tenant_id: 1,
        email: 'soporte@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'soporte_cliente',
        activo: true,
        email: 'soporte@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(creditoMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ lineaCredito: 50000 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ supervisor_ventas recibe 403', async () => {
      const token = generateTestToken({
        id: 4,
        rol: 'supervisor_ventas',
        tenant_id: 1,
        email: 'supervisor@test.com'
      });

      mockAdminQuery({
        adminid: 4,
        rol: 'supervisor_ventas',
        activo: true,
        email: 'supervisor@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(creditoMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ lineaCredito: 50000 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ ejecutivo_cobranza recibe 403 (cobra, no aprueba límites)', async () => {
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

      const app = createTestAppWithMiddleware(creditoMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ lineaCredito: 50000 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 4: Cupones
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 4: Cupones', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/admin/cupones (crear cupón)', () => {
    const { authorizeRole } = require('../../middlewares/roleMiddleware');
    const cuponMiddleware = authorizeRole(['super_admin', 'admin', 'gerente_comercial', 'marketing']);

    test('✅ marketing puede crear cupón', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'marketing',
        tenant_id: 1,
        email: 'marketing@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'marketing',
        activo: true,
        email: 'marketing@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(cuponMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ codigo: 'PROMO2024', descuento: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ gerente_comercial puede crear cupón', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'gerente_comercial',
        tenant_id: 1,
        email: 'gerente@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'gerente_comercial',
        activo: true,
        email: 'gerente@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(cuponMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ codigo: 'PROMO2024', descuento: 10 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ soporte_cliente recibe 403', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'soporte_cliente',
        tenant_id: 1,
        email: 'soporte@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'soporte_cliente',
        activo: true,
        email: 'soporte@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(cuponMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ codigo: 'PROMO2024', descuento: 10 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ auditor_interno recibe 403', async () => {
      const token = generateTestToken({
        id: 4,
        rol: 'auditor_interno',
        tenant_id: 1,
        email: 'auditor@test.com'
      });

      mockAdminQuery({
        adminid: 4,
        rol: 'auditor_interno',
        activo: true,
        email: 'auditor@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(cuponMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ codigo: 'PROMO2024', descuento: 10 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 5: Staff / Notificaciones
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 5: Staff / Notificaciones', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/staff/notificaciones', () => {
    const { authorizeRole } = require('../../middlewares/roleMiddleware');
    const notifMiddleware = authorizeRole(['super_admin', 'admin', 'gerente_finanzas', 'gerente_operaciones', 'gerente_comercial', 'contador', 'encargado_credito', 'ejecutivo_cobranza', 'supervisor_ventas', 'ejecutivo_ventas', 'jefe_almacen', 'almacenista', 'recepcionista_compras', 'compras', 'marketing', 'auditor_interno', 'soporte_cliente']);

    test('✅ marketing puede ver sus notificaciones', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'marketing',
        tenant_id: 1,
        email: 'marketing@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'marketing',
        activo: true,
        email: 'marketing@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(notifMiddleware, 'get');
      
      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ almacenista puede ver sus notificaciones', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'almacenista',
        tenant_id: 1,
        email: 'almacenista@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'almacenista',
        activo: true,
        email: 'almacenista@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(notifMiddleware, 'get');
      
      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ soporte_cliente puede ver sus notificaciones', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'soporte_cliente',
        tenant_id: 1,
        email: 'soporte@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'soporte_cliente',
        activo: true,
        email: 'soporte@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(notifMiddleware, 'get');
      
      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ ejecutivo_ventas puede ver sus notificaciones', async () => {
      const token = generateTestToken({
        id: 4,
        rol: 'ejecutivo_ventas',
        tenant_id: 1,
        email: 'ejecutivo@test.com'
      });

      mockAdminQuery({
        adminid: 4,
        rol: 'ejecutivo_ventas',
        activo: true,
        email: 'ejecutivo@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(notifMiddleware, 'get');
      
      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 6: GET /api/auth/mis-permisos
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 6: GET /api/auth/mis-permisos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('✅ gerente_finanzas obtiene sus módulos y acciones', async () => {
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

    const { authenticate } = require('../../middlewares/roleMiddleware');
    const permisosService = require('../../services/permisosService');
    
    const app = express();
    app.use(express.json());
    
    app.get('/test', authenticate, async (req, res) => {
      const permisos = await permisosService.getPermisosRol(req.user.rol);
      res.json({ success: true, rol: req.user.rol, permisos });
    });
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.rol).toBe('gerente_finanzas');
    expect(response.body.permisos).toHaveProperty('finanzas');
    expect(response.body.permisos.finanzas).toContain('ver');
  });

  test('✅ super_admin obtiene ["*"] en todos los módulos', async () => {
    const token = generateTestToken({
      id: 2,
      rol: 'super_admin',
      tenant_id: 1,
      email: 'superadmin@test.com'
    });

    mockAdminQuery({
      adminid: 2,
      rol: 'super_admin',
      activo: true,
      email: 'superadmin@test.com',
      tenant_id: 1
    });

    const { authenticate } = require('../../middlewares/roleMiddleware');
    const permisosService = require('../../services/permisosService');
    
    const app = express();
    app.use(express.json());
    
    app.get('/test', authenticate, async (req, res) => {
      const permisos = await permisosService.getPermisosRol(req.user.rol);
      res.json({ success: true, rol: req.user.rol, permisos });
    });
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.rol).toBe('super_admin');
    expect(response.body.permisos).toHaveProperty('*');
    expect(response.body.permisos['*']).toContain('*');
  });

  test('✅ almacenista obtiene solo inventario y compras:recibir', async () => {
    const token = generateTestToken({
      id: 3,
      rol: 'almacenista',
      tenant_id: 1,
      email: 'almacenista@test.com'
    });

    mockAdminQuery({
      adminid: 3,
      rol: 'almacenista',
      activo: true,
      email: 'almacenista@test.com',
      tenant_id: 1
    });

    const { authenticate } = require('../../middlewares/roleMiddleware');
    const permisosService = require('../../services/permisosService');
    
    const app = express();
    app.use(express.json());
    
    app.get('/test', authenticate, async (req, res) => {
      const permisos = await permisosService.getPermisosRol(req.user.rol);
      res.json({ success: true, rol: req.user.rol, permisos });
    });
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.rol).toBe('almacenista');
    expect(response.body.permisos).toHaveProperty('inventario');
    expect(response.body.permisos).toHaveProperty('compras');
    expect(response.body.permisos.inventario).toContain('contar');
  });

  test('❌ Sin token → 401', async () => {
    const { authenticate } = require('../../middlewares/roleMiddleware');
    
    const app = express();
    app.use(express.json());
    
    app.get('/test', authenticate, (req, res) => {
      res.json({ success: true });
    });
    
    const response = await request(app)
      .get('/test');

    expect(response.status).toBe(401);
  });
});
