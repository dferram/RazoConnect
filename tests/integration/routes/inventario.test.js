/**
 * Tests de integración para rutas de inventario
 * Verifica el flujo HTTP completo con supertest
 */

const request = require('supertest');
const express = require('express');
const adminRoutes = require('../../../routes/admin');
const db = require('../../../db');
const { generateToken } = require('../../../utils/jwtHelper');

const createAdminToken = () => generateToken({
  id: 10,
  userId: 10,
  rol: 'admin',
  tenant_id: 1,
  email: 'admin@test.com',
  tipo: 'admin'
}, '1h');

const createTestApp = () => {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    req.tenant = { tenant_id: 1, domain: 'test.razoconnect.com' };
    next();
  });

  app.use('/api/admin', adminRoutes);
  return app;
};

describe('Inventario — Integration Tests', () => {
  let app;
  let adminToken;

  beforeAll(() => {
    app = createTestApp();
    adminToken = createAdminToken();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/admin/inventario/ajuste', () => {
    it('debe retornar 401 sin token de autenticación', async () => {
      const response = await request(app)
        .post('/api/admin/inventario/ajuste')
        .send({
          varianteId: 1,
          tipoMovimiento: 'ENTRADA',
          cantidad: 5,
          motivo: 'Producto dañado'
        });

      expect(response.status).toBe(401);
    });

    it.skip('debe validar campos requeridos (requiere schema middleware)', async () => {
      // TODO: Verificar si el schema middleware está configurado en la ruta
      const response = await request(app)
        .post('/api/admin/inventario/ajuste')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tipoMovimiento: 'ENTRADA',
          cantidad: 5
        });

      expect([400, 403]).toContain(response.status);
    });
  });

  describe('POST /api/admin/ordenes-compra', () => {
    it('debe retornar 401 sin autenticación', async () => {
      const response = await request(app)
        .post('/api/admin/ordenes-compra')
        .send({ proveedorId: 1 });

      expect(response.status).toBe(401);
    });

    it.skip('debe validar campos requeridos (requiere schema middleware)', async () => {
      // TODO: Verificar configuración de schema middleware
      const response = await request(app)
        .post('/api/admin/ordenes-compra')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          proveedorId: 1
        });

      expect([400, 500]).toContain(response.status);
    });
  });

  describe('POST /api/admin/registrar-abono', () => {
    it('debe retornar 401 sin autenticación', async () => {
      const response = await request(app)
        .post('/api/admin/registrar-abono')
        .send({
          creditoId: 1,
          monto: 500,
          metodoPago: 'efectivo'
        });

      expect(response.status).toBe(401);
    });

    it.skip('debe retornar 400 cuando monto es cero (requiere JWT mock completo)', async () => {
      // TODO: Configurar mock completo de JWT con tenant_id y user.tipo
      const response = await request(app)
        .post('/api/admin/registrar-abono')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          creditoId: 1,
          monto: 0,
          metodoPago: 'efectivo'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it.skip('debe retornar 400 cuando no se proporciona creditoId ni clienteId (requiere JWT mock completo)', async () => {
      // TODO: Configurar mock completo de JWT con tenant_id y user.tipo
      const response = await request(app)
        .post('/api/admin/registrar-abono')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          monto: 500,
          metodoPago: 'efectivo'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
