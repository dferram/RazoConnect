/**
 * ════════════════════════════════════════════════════════════
 * TEST SUITE: Fundación de Roles Granulares
 * ════════════════════════════════════════════════════════════
 * 
 * Tests para verificar:
 * - authorizeRole middleware
 * - authorizePermiso middleware
 * - Compatibilidad backward con funciones existentes
 * - permisosService (caché, permisos, roles)
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { 
  authenticate, 
  authorizeRole, 
  authorizePermiso 
} = require('../../middlewares/authMiddleware');
const permisosService = require('../../services/permisosService');

// ════════════════════════════════════════════════════════════
// MOCKS
// ════════════════════════════════════════════════════════════

// Mock de base de datos
jest.mock('../../db', () => ({
  query: jest.fn(),
}));

// Mock de Redis
jest.mock('../../config/redisClient', () => ({
  isTokenBlacklisted: jest.fn().mockResolvedValue(false),
}));

// Mock de tenantSessionGuard
jest.mock('../../middlewares/tenantSessionGuard', () => {
  return jest.fn((req, res, next) => next());
});

// Mock de logger
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
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
 * Crea una app Express de prueba con middleware de autenticación
 */
function createTestApp(middleware) {
  const app = express();
  app.use(express.json());
  
  // Ruta protegida de prueba
  app.get('/test', authenticate, middleware, (req, res) => {
    res.json({ success: true, user: req.user });
  });
  
  return app;
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
 * Mock de permisos en roles_permisos
 */
function mockPermisosQuery(permisos) {
  pool.query.mockImplementation((query, params) => {
    if (query.includes('roles_permisos')) {
      return Promise.resolve({
        rows: permisos ? [{ permisos }] : [],
      });
    }
    if (query.includes('administradores')) {
      return Promise.resolve({
        rows: [{
          adminid: 1,
          rol: 'gerente_finanzas',
          activo: true,
          email: 'gerente@test.com',
          tenant_id: 1
        }]
      });
    }
    return Promise.resolve({ rows: [] });
  });
}

// ════════════════════════════════════════════════════════════
// TEST SUITE 1: authorizeRole middleware
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 1: authorizeRole middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    permisosService.clearCache();
  });

  test('✅ super_admin pasa en cualquier ruta protegida con authorizeRole', async () => {
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

    const app = createTestApp(authorizeRole(['gerente_finanzas', 'contador']));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('✅ admin pasa en cualquier ruta protegida con authorizeRole', async () => {
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

    const app = createTestApp(authorizeRole(['gerente_finanzas', 'contador']));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('✅ gerente_finanzas pasa en ruta que acepta [gerente_finanzas, contador]', async () => {
    const token = generateTestToken({
      id: 3,
      rol: 'gerente_finanzas',
      tenant_id: 1,
      email: 'gerente@test.com'
    });

    mockAdminQuery({
      adminid: 3,
      rol: 'gerente_finanzas',
      activo: true,
      email: 'gerente@test.com',
      tenant_id: 1
    });

    const app = createTestApp(authorizeRole(['gerente_finanzas', 'contador']));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('❌ almacenista recibe 403 en ruta que acepta [gerente_finanzas, contador]', async () => {
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

    const app = createTestApp(authorizeRole(['gerente_finanzas', 'contador']));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('gerente_finanzas, contador');
  });

  test('❌ Sin token recibe 401', async () => {
    const app = createTestApp(authorizeRole(['gerente_finanzas']));
    
    const response = await request(app).get('/test');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test('✅ Wildcard gerente_* acepta gerente_finanzas', async () => {
    const token = generateTestToken({
      id: 5,
      rol: 'gerente_finanzas',
      tenant_id: 1,
      email: 'gerente@test.com'
    });

    mockAdminQuery({
      adminid: 5,
      rol: 'gerente_finanzas',
      activo: true,
      email: 'gerente@test.com',
      tenant_id: 1
    });

    const app = createTestApp(authorizeRole(['gerente_*']));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('✅ Wildcard gerente_* acepta gerente_operaciones', async () => {
    const token = generateTestToken({
      id: 6,
      rol: 'gerente_operaciones',
      tenant_id: 1,
      email: 'gerente_ops@test.com'
    });

    mockAdminQuery({
      adminid: 6,
      rol: 'gerente_operaciones',
      activo: true,
      email: 'gerente_ops@test.com',
      tenant_id: 1
    });

    const app = createTestApp(authorizeRole(['gerente_*']));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('❌ Wildcard gerente_* rechaza contador', async () => {
    const token = generateTestToken({
      id: 7,
      rol: 'contador',
      tenant_id: 1,
      email: 'contador@test.com'
    });

    mockAdminQuery({
      adminid: 7,
      rol: 'contador',
      activo: true,
      email: 'contador@test.com',
      tenant_id: 1
    });

    const app = createTestApp(authorizeRole(['gerente_*']));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 2: authorizePermiso middleware
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 2: authorizePermiso middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    permisosService.clearCache();
  });

  test('✅ gerente_finanzas tiene permiso finanzas:ver', async () => {
    const token = generateTestToken({
      id: 1,
      rol: 'gerente_finanzas',
      tenant_id: 1,
      email: 'gerente@test.com'
    });

    mockPermisosQuery({
      finanzas: ['*'],
      credito: ['*'],
      cobranza: ['*'],
      reportes: ['ver', 'exportar'],
      clientes: ['ver', 'ver_credito']
    });

    const app = createTestApp(authorizePermiso('finanzas', 'ver'));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('✅ gerente_finanzas tiene permiso finanzas:* (wildcard)', async () => {
    const token = generateTestToken({
      id: 1,
      rol: 'gerente_finanzas',
      tenant_id: 1,
      email: 'gerente@test.com'
    });

    mockPermisosQuery({
      finanzas: ['*'],
      credito: ['*'],
      cobranza: ['*']
    });

    const app = createTestApp(authorizePermiso('finanzas', 'editar'));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('❌ almacenista no tiene permiso finanzas:ver', async () => {
    const token = generateTestToken({
      id: 2,
      rol: 'almacenista',
      tenant_id: 1,
      email: 'almacenista@test.com'
    });

    mockPermisosQuery({
      inventario: ['ver', 'contar', 'ajuste_menor'],
      compras: ['recibir'],
      productos: ['ver']
    });

    const app = createTestApp(authorizePermiso('finanzas', 'ver'));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('finanzas:ver');
  });

  test('✅ auditor_interno tiene permiso inventario:auditar', async () => {
    const token = generateTestToken({
      id: 3,
      rol: 'auditor_interno',
      tenant_id: 1,
      email: 'auditor@test.com'
    });

    mockPermisosQuery({
      reportes: ['*'],
      inventario: ['ver', 'auditar'],
      finanzas: ['ver'],
      ventas: ['ver'],
      auditoria: ['*']
    });

    const app = createTestApp(authorizePermiso('inventario', 'auditar'));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('❌ ejecutivo_cobranza no tiene permiso inventario:auditar', async () => {
    const token = generateTestToken({
      id: 4,
      rol: 'ejecutivo_cobranza',
      tenant_id: 1,
      email: 'cobranza@test.com'
    });

    mockPermisosQuery({
      cobranza: ['*'],
      clientes: ['ver', 'ver_credito'],
      finanzas: ['ver_cxc']
    });

    const app = createTestApp(authorizePermiso('inventario', 'auditar'));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  test('✅ super_admin tiene cualquier permiso sin importar módulo/acción', async () => {
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

    const app = createTestApp(authorizePermiso('cualquier_modulo', 'cualquier_accion'));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 3: Compatibilidad backward
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 3: Compatibilidad backward', () => {
  const { authorize, authorizeAdmin, authorizeAdminOrAgente } = require('../../middlewares/authMiddleware');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('✅ authorize([admin]) sigue funcionando igual', async () => {
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

    const app = createTestApp(authorize(['admin']));
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('✅ authorizeAdmin() sigue aceptando admin y super_admin', async () => {
    const tokenAdmin = generateTestToken({
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

    const app = createTestApp(authorizeAdmin);
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('✅ authorizeAdminOrAgente() sigue aceptando agente', async () => {
    const token = generateTestToken({
      id: 1,
      rol: 'agente',
      email: 'agente@test.com'
    });

    pool.query.mockImplementation((query) => {
      if (query.includes('agentesdeventas')) {
        return Promise.resolve({
          rows: [{
            agenteid: 1,
            activo: true,
            email: 'agente@test.com',
            codigoagente: 'AG001'
          }]
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const app = createTestApp(authorizeAdminOrAgente);
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('✅ req.user.rol sigue siendo string (no romper)', async () => {
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

    const app = express();
    app.use(express.json());
    app.get('/test', authenticate, (req, res) => {
      res.json({ 
        success: true, 
        user: req.user 
      });
    });
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(typeof response.body.user.rol).toBe('string');
    expect(response.body.user.rol).toBe('gerente_finanzas');
  });
});

// ════════════════════════════════════════════════════════════
// TEST SUITE 4: permisosService
// ════════════════════════════════════════════════════════════

describe('TEST SUITE 4: permisosService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    permisosService.clearCache();
  });

  test('✅ getPermisosRol(gerente_finanzas) retorna objeto con módulos y acciones', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        permisos: {
          finanzas: ['*'],
          credito: ['*'],
          cobranza: ['*'],
          reportes: ['ver', 'exportar']
        }
      }]
    });

    const permisos = await permisosService.getPermisosRol('gerente_finanzas');

    expect(permisos).toBeDefined();
    expect(permisos.finanzas).toEqual(['*']);
    expect(permisos.credito).toEqual(['*']);
    expect(permisos.reportes).toContain('ver');
  });

  test('✅ tienePermiso(contador, finanzas, ver) → true', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        permisos: {
          finanzas: ['ver', 'exportar'],
          cobranza: ['ver'],
          reportes: ['ver', 'exportar']
        }
      }]
    });

    const resultado = await permisosService.tienePermiso('contador', 'finanzas', 'ver');

    expect(resultado).toBe(true);
  });

  test('✅ tienePermiso(contador, inventario, ajuste_menor) → false', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        permisos: {
          finanzas: ['ver', 'exportar'],
          cobranza: ['ver']
        }
      }]
    });

    const resultado = await permisosService.tienePermiso('contador', 'inventario', 'ajuste_menor');

    expect(resultado).toBe(false);
  });

  test('✅ tienePermiso(super_admin, cualquier_cosa, cualquier_accion) → true', async () => {
    const resultado = await permisosService.tienePermiso('super_admin', 'cualquier_modulo', 'cualquier_accion');

    expect(resultado).toBe(true);
    // No debe hacer query a BD para super_admin
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('✅ Cache: segunda llamada no hace query a BD', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        permisos: {
          finanzas: ['*']
        }
      }]
    });

    // Primera llamada - hace query
    await permisosService.getPermisosRol('gerente_finanzas');
    expect(pool.query).toHaveBeenCalledTimes(1);

    // Segunda llamada - usa caché
    await permisosService.getPermisosRol('gerente_finanzas');
    expect(pool.query).toHaveBeenCalledTimes(1); // No incrementa
  });
});
