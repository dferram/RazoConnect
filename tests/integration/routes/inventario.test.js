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

    it.todo('debe validar campos requeridos - Requiere mock de DB para authenticate middleware. El schema ajusteInventarioSchema está configurado en la ruta (línea 710 de routes/admin.js), pero el test necesita que authenticate pase primero, lo cual requiere mockear db.query para validar el usuario admin.');
  });

  describe('POST /api/admin/ordenes-compra', () => {
    it('debe retornar 401 sin autenticación', async () => {
      const response = await request(app)
        .post('/api/admin/ordenes-compra')
        .send({ proveedorId: 1 });

      expect(response.status).toBe(401);
    });

    it.todo('debe validar campos requeridos - Requiere mock de DB para authenticate middleware. El schema crearOrdenCompraSchema está configurado en la ruta (línea 1342 de routes/admin.js), pero el test necesita que authenticate pase primero, lo cual requiere mockear db.query para validar el usuario admin.');
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

    it.todo('debe retornar 400 cuando monto es cero - Requiere mock completo de authenticate middleware. El schema abonoSchema está configurado en la ruta (línea 977 de routes/admin.js), pero authenticate requiere múltiples queries de DB (validar admin en tabla administradores, verificar tenant_id, etc.) que no están mockeadas en este test.');

    it.todo('debe retornar 400 cuando no se proporciona creditoId ni clienteId - Requiere mock completo de authenticate middleware. El schema abonoSchema está configurado en la ruta (línea 977 de routes/admin.js), pero authenticate requiere múltiples queries de DB (validar admin en tabla administradores, verificar tenant_id, etc.) que no están mockeadas en este test.');
  });
});
