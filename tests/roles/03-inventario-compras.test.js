/**
 * ════════════════════════════════════════════════════════════
 * TEST SUITE: Módulos Inventario, Compras y Almacén
 * ════════════════════════════════════════════════════════════
 * 
 * Tests para verificar:
 * - Módulo Inventario (sesiones, conteo, cierre)
 * - Módulo Compras (órdenes de compra, recepción)
 * - Módulo Productos (crear, editar, eliminar, imágenes)
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

// Mock de controladores de inventario
jest.mock('../../controllers/inventoryAuditController', () => ({
  crearSesion: jest.fn((req, res) => res.status(201).json({ success: true })),
  listarSesiones: jest.fn((req, res) => res.json({ success: true })),
  aplicarSesion: jest.fn((req, res) => res.json({ success: true })),
  registrarConteo: jest.fn((req, res) => res.json({ success: true })),
  asignarAgenteASesion: jest.fn((req, res) => res.json({ success: true })),
  getDashboardSesion: jest.fn((req, res) => res.json({ success: true })),
  buscarProductos: jest.fn((req, res) => res.json({ success: true })),
  getVariantePorSku: jest.fn((req, res) => res.json({ success: true })),
  obtenerAgentesDisponibles: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/inventarioController', () => ({
  obtenerSesionInventario: jest.fn((req, res) => res.json({ success: true })),
  exportarEntradasAlmacen: jest.fn((req, res) => res.json({ success: true })),
  getOrdenesPendientes: jest.fn((req, res) => res.json({ success: true })),
}));

// Mock de controladores de compras
jest.mock('../../controllers/comprasController', () => ({
  editarItemsOrdenCompra: jest.fn((req, res) => res.json({ success: true })),
  cancelarBackorderVinculado: jest.fn((req, res) => res.json({ success: true })),
  registrarAnomaliaEntrada: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/ordenesCompraController', () => ({
  getAllOrdenesCompra: jest.fn((req, res) => res.json({ success: true })),
  crearOrdenCompra: jest.fn((req, res) => res.status(201).json({ success: true })),
}));

jest.mock('../../controllers/recepcionInventarioController', () => ({
  recibirInventario: jest.fn((req, res) => res.json({ success: true })),
}));

// Mock de controladores de productos
jest.mock('../../controllers/productosAdminController', () => ({
  getAllProductos: jest.fn((req, res) => res.json({ success: true })),
  crearProducto: jest.fn((req, res) => res.status(201).json({ success: true })),
  actualizarProducto: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../controllers/imagenesProductoController', () => ({
  subirImagenProducto: jest.fn((req, res) => res.json({ success: true })),
}));

jest.mock('../../middlewares/rateLimiter', () => ({
  heavyOperationLimiter: jest.fn((req, res, next) => next()),
}));

jest.mock('../../middlewares/validate', () => jest.fn((req, res, next) => next()));

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

function createTestAppWithRoutes(routePath) {
  const app = express();
  app.use(express.json());
  
  const routes = require(`../../routes/${routePath}`);
  app.use('/api', routes);
  
  return app;
}

// ════════════════════════════════════════════════════════════
// TEST SUITE 1: Inventario — creación y cierre de sesiones
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 1: Inventario — creación y cierre de sesiones', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/inventario/sesiones (crear)', () => {
    test('✅ jefe_almacen puede crear sesión', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'jefe_almacen',
        tenant_id: 1,
        email: 'jefe@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'jefe_almacen',
        activo: true,
        email: 'jefe@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .post('/api/sesiones')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Inventario Marzo 2024' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('✅ gerente_operaciones puede crear sesión', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'gerente_operaciones',
        tenant_id: 1,
        email: 'gerente@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'gerente_operaciones',
        activo: true,
        email: 'gerente@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .post('/api/sesiones')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Inventario Marzo 2024' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('❌ almacenista recibe 403 (solo puede contar, no crear)', async () => {
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

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .post('/api/sesiones')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Inventario Marzo 2024' });

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

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .post('/api/sesiones')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Inventario Marzo 2024' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ contador recibe 403', async () => {
      const token = generateTestToken({
        id: 5,
        rol: 'contador',
        tenant_id: 1,
        email: 'contador@test.com'
      });

      mockAdminQuery({
        adminid: 5,
        rol: 'contador',
        activo: true,
        email: 'contador@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .post('/api/sesiones')
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Inventario Marzo 2024' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/inventario/sesiones/:id/aplicar (cerrar)', () => {
    test('✅ super_admin puede cerrar', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'super_admin',
        tenant_id: 1,
        email: 'superadmin@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'super_admin',
        activo: true,
        email: 'superadmin@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .post('/api/sesiones/1/aplicar')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ gerente_operaciones puede cerrar', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'gerente_operaciones',
        tenant_id: 1,
        email: 'gerente@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'gerente_operaciones',
        activo: true,
        email: 'gerente@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .post('/api/sesiones/1/aplicar')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ jefe_almacen recibe 403 (puede crear pero no cerrar — acción crítica)', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'jefe_almacen',
        tenant_id: 1,
        email: 'jefe@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'jefe_almacen',
        activo: true,
        email: 'jefe@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .post('/api/sesiones/1/aplicar')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ almacenista recibe 403', async () => {
      const token = generateTestToken({
        id: 4,
        rol: 'almacenista',
        tenant_id: 1,
        email: 'almacenista@test.com'
      });

      mockAdminQuery({
        adminid: 4,
        rol: 'almacenista',
        activo: true,
        email: 'almacenista@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .post('/api/sesiones/1/aplicar')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 2: Inventario — conteo y lectura
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 2: Inventario — conteo y lectura', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/inventario/registrar-conteo', () => {
    test('✅ almacenista puede registrar conteo', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'almacenista',
        tenant_id: 1,
        email: 'almacenista@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'almacenista',
        activo: true,
        email: 'almacenista@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .post('/api/registrar-conteo')
        .set('Authorization', `Bearer ${token}`)
        .send({ sesionId: 1, varianteId: 456, cantidad: 50 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ jefe_almacen puede registrar conteo', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'jefe_almacen',
        tenant_id: 1,
        email: 'jefe@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'jefe_almacen',
        activo: true,
        email: 'jefe@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .post('/api/registrar-conteo')
        .set('Authorization', `Bearer ${token}`)
        .send({ sesionId: 1, varianteId: 456, cantidad: 50 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    // NOTA: /registrar-conteo usa solo authenticate - la validación de roles
    // está en el controlador para permitir agentes asignados a sesiones específicas
  });

  describe('GET /api/inventario/sesiones', () => {
    test('✅ auditor_interno puede listar sesiones', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'auditor_interno',
        tenant_id: 1,
        email: 'auditor@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'auditor_interno',
        activo: true,
        email: 'auditor@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .get('/api/sesiones')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ almacenista puede listar sesiones', async () => {
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

      const app = createTestAppWithRoutes('inventario');
      
      const response = await request(app)
        .get('/api/sesiones')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    // NOTA: /sesiones usa solo authenticate - la validación de roles
    // está en el controlador para permitir agentes ver solo sus sesiones asignadas
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 3: Compras — órdenes
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 3: Compras — órdenes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/admin/ordenes-compra (middleware test)', () => {
    const { authorizeRole } = require('../../middlewares/roleMiddleware');
    const ocMiddleware = authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras']);

    test('✅ compras puede crear OC', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'compras',
        tenant_id: 1,
        email: 'compras@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'compras',
        activo: true,
        email: 'compras@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(ocMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ proveedorId: 1, items: [] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ gerente_operaciones puede crear OC', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'gerente_operaciones',
        tenant_id: 1,
        email: 'gerente@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'gerente_operaciones',
        activo: true,
        email: 'gerente@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(ocMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ proveedorId: 1, items: [] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ recepcionista_compras recibe 403 (solo recibe, no crea)', async () => {
      const token = generateTestToken({
        id: 3,
        rol: 'recepcionista_compras',
        tenant_id: 1,
        email: 'recepcion@test.com'
      });

      mockAdminQuery({
        adminid: 3,
        rol: 'recepcionista_compras',
        activo: true,
        email: 'recepcion@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(ocMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ proveedorId: 1, items: [] });

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

      const app = createTestAppWithMiddleware(ocMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ proveedorId: 1, items: [] });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ jefe_almacen recibe 403 (puede ver y recibir, no crear)', async () => {
      const token = generateTestToken({
        id: 5,
        rol: 'jefe_almacen',
        tenant_id: 1,
        email: 'jefe@test.com'
      });

      mockAdminQuery({
        adminid: 5,
        rol: 'jefe_almacen',
        activo: true,
        email: 'jefe@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(ocMiddleware);
      
      const response = await request(app)
        .post('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ proveedorId: 1, items: [] });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/orden-compra/registrar-anomalia', () => {
    test('✅ recepcionista_compras puede registrar anomalía', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'recepcionista_compras',
        tenant_id: 1,
        email: 'recepcion@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'recepcionista_compras',
        activo: true,
        email: 'recepcion@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('compras');
      
      const response = await request(app)
        .post('/api/orden-compra/registrar-anomalia')
        .set('Authorization', `Bearer ${token}`)
        .send({ ordenId: 1, tipo: 'merma', cantidad: 5, motivo: 'Producto dañado' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ jefe_almacen puede registrar anomalía', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'jefe_almacen',
        tenant_id: 1,
        email: 'jefe@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'jefe_almacen',
        activo: true,
        email: 'jefe@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('compras');
      
      const response = await request(app)
        .post('/api/orden-compra/registrar-anomalia')
        .set('Authorization', `Bearer ${token}`)
        .send({ ordenId: 1, tipo: 'merma', cantidad: 5, motivo: 'Producto dañado' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ compras NO puede registrar anomalía física', async () => {
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

      const app = createTestAppWithRoutes('compras');
      
      const response = await request(app)
        .post('/api/orden-compra/registrar-anomalia')
        .set('Authorization', `Bearer ${token}`)
        .send({ ordenId: 1, tipo: 'merma', cantidad: 5, motivo: 'Producto dañado' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('❌ almacenista recibe 403 (puede contar, no recibir OC formal)', async () => {
      const token = generateTestToken({
        id: 4,
        rol: 'almacenista',
        tenant_id: 1,
        email: 'almacenista@test.com'
      });

      mockAdminQuery({
        adminid: 4,
        rol: 'almacenista',
        activo: true,
        email: 'almacenista@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithRoutes('compras');
      
      const response = await request(app)
        .post('/api/orden-compra/registrar-anomalia')
        .set('Authorization', `Bearer ${token}`)
        .send({ ordenId: 1, tipo: 'merma', cantidad: 5, motivo: 'Producto dañado' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 4: Productos
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 4: Productos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('DELETE /api/admin/productos/:id (middleware test)', () => {
    const { authorizeRole } = require('../../middlewares/roleMiddleware');
    const deleteMiddleware = authorizeRole(['super_admin', 'admin', 'gerente_operaciones']);

    test('✅ admin puede eliminar', async () => {
      const token = generateTestToken({
        id: 1,
        rol: 'admin',
        tenant_id: 1,
        email: 'admin@test.com'
      });

      mockAdminQuery({
        adminid: 1,
        rol: 'admin',
        activo: true,
        email: 'admin@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(deleteMiddleware, 'delete');
      
      const response = await request(app)
        .delete('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ gerente_operaciones puede eliminar', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'gerente_operaciones',
        tenant_id: 1,
        email: 'gerente@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'gerente_operaciones',
        activo: true,
        email: 'gerente@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(deleteMiddleware, 'delete');
      
      const response = await request(app)
        .delete('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('❌ marketing recibe 403 (puede editar imágenes, no eliminar)', async () => {
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

      const app = createTestAppWithMiddleware(deleteMiddleware, 'delete');
      
      const response = await request(app)
        .delete('/test')
        .set('Authorization', `Bearer ${token}`);

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

      const app = createTestAppWithMiddleware(deleteMiddleware, 'delete');
      
      const response = await request(app)
        .delete('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/admin/productos/:id/imagenes (middleware test)', () => {
    const { authorizeRole } = require('../../middlewares/roleMiddleware');
    const imagenesMiddleware = authorizeRole(['super_admin', 'admin', 'gerente_operaciones', 'compras', 'marketing']);

    test('✅ marketing puede editar imágenes', async () => {
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

      const app = createTestAppWithMiddleware(imagenesMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ imagenes: [] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('✅ compras puede editar imágenes', async () => {
      const token = generateTestToken({
        id: 2,
        rol: 'compras',
        tenant_id: 1,
        email: 'compras@test.com'
      });

      mockAdminQuery({
        adminid: 2,
        rol: 'compras',
        activo: true,
        email: 'compras@test.com',
        tenant_id: 1
      });

      const app = createTestAppWithMiddleware(imagenesMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ imagenes: [] });

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

      const app = createTestAppWithMiddleware(imagenesMiddleware, 'put');
      
      const response = await request(app)
        .put('/test')
        .set('Authorization', `Bearer ${token}`)
        .send({ imagenes: [] });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});
