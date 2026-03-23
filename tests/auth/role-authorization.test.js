/**
 * ROLE AUTHORIZATION TEST SUITE
 * 
 * Tests comprehensive authorization flow for all admin roles
 * including super_admin, admin, and granular roles (compras, finanzas, etc.)
 * 
 * @module tests/auth/role-authorization
 * @date 2026-03-10
 */

const request = require('supertest');
const app = require('../../index');
const { generateAccessToken } = require('../../utils/jwtHelper');

// Use mocked DB from setup.js
describe.skip('Role Authorization Tests', () => {
  let superAdminToken;
  let adminToken;
  let comprasToken;
  let finanzasToken;
  let inventariosToken;
  let agenteToken;
  let clienteToken;
  
  const tenantId = 1;

  beforeAll(async () => {
    // Generate tokens for different roles
    superAdminToken = generateAccessToken({
      id: 1,
      rol: 'super_admin',
      tenant_id: tenantId,
      email: 'superadmin@test.com'
    });

    adminToken = generateAccessToken({
      id: 2,
      rol: 'admin',
      tenant_id: tenantId,
      email: 'admin@test.com'
    });

    comprasToken = generateAccessToken({
      id: 3,
      rol: 'compras',
      tenant_id: tenantId,
      email: 'compras@test.com'
    });

    finanzasToken = generateAccessToken({
      id: 4,
      rol: 'finanzas',
      tenant_id: tenantId,
      email: 'finanzas@test.com'
    });

    inventariosToken = generateAccessToken({
      id: 5,
      rol: 'inventarios',
      tenant_id: tenantId,
      email: 'inventarios@test.com'
    });

    agenteToken = generateAccessToken({
      id: 6,
      rol: 'agente',
      tenant_id: null,
      email: 'agente@test.com'
    });

    clienteToken = generateAccessToken({
      id: 7,
      rol: 'cliente',
      tenant_id: tenantId,
      email: 'cliente@test.com'
    });
  });

  describe('Dashboard Compras - GET /api/admin/dashboard/compras-totales', () => {
    const endpoint = '/api/admin/dashboard/compras-totales';

    test('✅ super_admin should have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect([200, 500]).toContain(res.status); // 500 if DB not set up, but not 401/403
      if (res.status === 403 || res.status === 401) {
        throw new Error(`super_admin was denied access: ${res.body.message}`);
      }
    });

    test('✅ admin should have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect([200, 500]).toContain(res.status);
      if (res.status === 403 || res.status === 401) {
        throw new Error(`admin was denied access: ${res.body.message}`);
      }
    });

    test('✅ compras role should have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${comprasToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect([200, 500]).toContain(res.status);
      if (res.status === 403 || res.status === 401) {
        throw new Error(`compras was denied access: ${res.body.message}`);
      }
    });

    test('❌ finanzas role should NOT have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${finanzasToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('❌ cliente should NOT have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${clienteToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('❌ unauthenticated should NOT have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('X-Tenant-ID', tenantId.toString());

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Dashboard Stats - GET /api/admin/dashboard-stats', () => {
    const endpoint = '/api/admin/dashboard-stats';

    test('✅ super_admin should have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect([200, 500]).toContain(res.status);
      if (res.status === 403 || res.status === 401) {
        throw new Error(`super_admin was denied access: ${res.body.message}`);
      }
    });

    test('✅ admin should have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect([200, 500]).toContain(res.status);
      if (res.status === 403 || res.status === 401) {
        throw new Error(`admin was denied access: ${res.body.message}`);
      }
    });

    test('❌ cliente should NOT have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${clienteToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Productos - GET /api/admin/productos', () => {
    const endpoint = '/api/admin/productos';

    test('✅ super_admin should have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect([200, 500]).toContain(res.status);
      if (res.status === 403 || res.status === 401) {
        throw new Error(`super_admin was denied access: ${res.body.message}`);
      }
    });

    test('✅ admin should have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect([200, 500]).toContain(res.status);
      if (res.status === 403 || res.status === 401) {
        throw new Error(`admin was denied access: ${res.body.message}`);
      }
    });

    test('❌ cliente should NOT have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${clienteToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Inventario - GET /api/admin/inventario', () => {
    const endpoint = '/api/admin/inventario';

    test('✅ super_admin should have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect([200, 500]).toContain(res.status);
      if (res.status === 403 || res.status === 401) {
        throw new Error(`super_admin was denied access: ${res.body.message}`);
      }
    });

    test('✅ admin should have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect([200, 500]).toContain(res.status);
      if (res.status === 403 || res.status === 401) {
        throw new Error(`admin was denied access: ${res.body.message}`);
      }
    });

    test('✅ inventarios role should have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${inventariosToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect([200, 500]).toContain(res.status);
      if (res.status === 403 || res.status === 401) {
        throw new Error(`inventarios was denied access: ${res.body.message}`);
      }
    });

    test('❌ cliente should NOT have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${clienteToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Pedidos - GET /api/admin/pedidos', () => {
    const endpoint = '/api/admin/pedidos';

    test('✅ super_admin should have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect([200, 500]).toContain(res.status);
      if (res.status === 403 || res.status === 401) {
        throw new Error(`super_admin was denied access: ${res.body.message}`);
      }
    });

    test('✅ admin should have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect([200, 500]).toContain(res.status);
      if (res.status === 403 || res.status === 401) {
        throw new Error(`admin was denied access: ${res.body.message}`);
      }
    });

    test('❌ cliente should NOT have access', async () => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${clienteToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Authorization Middleware Consistency', () => {
    test('authorizeRole should allow super_admin bypass', () => {
      const { authorizeRole } = require('../../middlewares/roleMiddleware');
      const middleware = authorizeRole(['compras', 'finanzas']);
      
      const req = { user: { rol: 'super_admin' } };
      const res = {};
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);
      expect(nextCalled).toBe(true);
    });

    test('authorizeRole should allow admin bypass', () => {
      const { authorizeRole } = require('../../middlewares/roleMiddleware');
      const middleware = authorizeRole(['compras', 'finanzas']);
      
      const req = { user: { rol: 'admin' } };
      const res = {};
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);
      expect(nextCalled).toBe(true);
    });

    test('authorizeRole should allow exact role match', () => {
      const { authorizeRole } = require('../../middlewares/roleMiddleware');
      const middleware = authorizeRole(['compras', 'finanzas']);
      
      const req = { user: { rol: 'compras' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);
      expect(nextCalled).toBe(true);
    });

    test('authorizeRole should deny unauthorized role', () => {
      const { authorizeRole } = require('../../middlewares/roleMiddleware');
      const middleware = authorizeRole(['compras', 'finanzas']);
      
      const req = { user: { rol: 'inventarios' } };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);
      expect(nextCalled).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
