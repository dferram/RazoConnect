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
          tipoMovimiento: 'MERMA',
          cantidadCambio: 5,
          motivo: 'Producto dañado'
        });

      expect(response.status).toBe(401);
    });

    it('debe retornar 400 cuando varianteId está ausente (schema validation)', async () => {
      const response = await request(app)
        .post('/api/admin/inventario/ajuste')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tipoMovimiento: 'MERMA',
          cantidadCambio: 5,
          motivo: 'Sin variante'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.some(e => e.field === 'varianteId')).toBe(true);
    });

    it('debe retornar 400 cuando motivo está vacío (schema validation)', async () => {
      const response = await request(app)
        .post('/api/admin/inventario/ajuste')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          varianteId: 1,
          tipoMovimiento: 'MERMA',
          cantidadCambio: 5,
          motivo: ''
        });

      expect(response.status).toBe(400);
      expect(response.body.errors.some(e => e.field === 'motivo')).toBe(true);
    });

    it('debe retornar 400 cuando tipoMovimiento es inválido (schema validation)', async () => {
      const response = await request(app)
        .post('/api/admin/inventario/ajuste')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          varianteId: 1,
          tipoMovimiento: 'ROBO',
          cantidadCambio: 5,
          motivo: 'Tipo inválido'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/admin/ordenes-compra', () => {
    it('debe retornar 401 sin autenticación', async () => {
      const response = await request(app)
        .post('/api/admin/ordenes-compra')
        .send({ proveedorId: 1 });

      expect(response.status).toBe(401);
    });

    it('debe retornar 400 cuando proveedorId es negativo (schema validation)', async () => {
      const response = await request(app)
        .post('/api/admin/ordenes-compra')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          proveedorId: -1,
          fechaEntregaEsperada: '2027-01-01',
          productos: [{ varianteId: 1, cantidadSolicitada: 10 }]
        });

      expect(response.status).toBe(400);
      expect(response.body.errors.some(e => e.field === 'proveedorId')).toBe(true);
    });

    it('debe retornar 400 cuando productos está vacío (schema validation)', async () => {
      const response = await request(app)
        .post('/api/admin/ordenes-compra')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          proveedorId: 1,
          fechaEntregaEsperada: '2027-01-01',
          productos: []
        });

      expect(response.status).toBe(400);
      expect(response.body.errors.some(e => e.field === 'productos')).toBe(true);
    });

    it('debe retornar 400 cuando fecha está en el pasado (schema validation)', async () => {
      const response = await request(app)
        .post('/api/admin/ordenes-compra')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          proveedorId: 1,
          fechaEntregaEsperada: '2020-01-01',
          productos: [{ varianteId: 1, cantidadSolicitada: 10 }]
        });

      expect(response.status).toBe(400);
    });

    it('debe retornar 404 cuando el proveedor no existe en la BD', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/admin/ordenes-compra')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          proveedorId: 999,
          fechaEntregaEsperada: '2027-06-01',
          productos: [{ varianteId: 1, cantidadSolicitada: 10 }]
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/admin/registrar-abono', () => {
    it('debe retornar 400 cuando monto es cero (schema validation)', async () => {
      const response = await request(app)
        .post('/api/admin/registrar-abono')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clienteId: 1,
          monto: 0,
          metodoPago: 'efectivo'
        });

      expect(response.status).toBe(400);
      expect(response.body.errors.some(e => e.field === 'monto')).toBe(true);
    });

    it('debe retornar 400 cuando metodoPago es inválido (schema validation)', async () => {
      const response = await request(app)
        .post('/api/admin/registrar-abono')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          clienteId: 1,
          monto: 500,
          metodoPago: 'bitcoin'
        });

      expect(response.status).toBe(400);
    });
  });
});
