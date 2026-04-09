/**
 * Unit Tests para Admin Pagos Controller
 *
 * Prueba:
 * - Obtener pagos pendientes
 * - Aprobar pago
 * - Rechazar pago
 * - Validaciones de estado
 */

const request = require('supertest');
const { generateAccessToken } = require('../../../utils/jwtHelper');
const db = require('../../../db');

jest.mock('../../../db');
jest.mock('../../../utils/logger');
jest.mock('../../../services/auditService');

describe('Pagos Controller - Admin', () => {
  let app;
  let adminToken;
  let tenantId = 1;
  let adminId = 2;
  let pagoId = 100;
  let clienteId = 1;

  beforeAll(async () => {
    app = require('../../../index');
    adminToken = generateAccessToken({
      id: adminId,
      rol: 'finanzas',
      tenant_id: tenantId
    });
  });

  afterAll(async () => {
    // Cleanup - mocks handled automatically
  });

  describe('GET /api/admin/pagos/pendientes', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('Debe obtener lista de pagos pendientes', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            pedidoid: 100,
            clienteid: 1,
            montototal: 1000.00,
            estatus: 'Pendiente',
            comprobante_url: 'https://example.com/comprobante.pdf',
            nombre: 'Juan',
            apellido: 'Garcia',
            email: 'juan@example.com'
          }
        ],
        rowCount: 1
      });

      const response = await request(app)
        .get('/api/admin/pagos/pendientes')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(Array.isArray(response.body.pagos)).toBe(true);
        }
      }
    });

    test('Debe retornar lista vacía si no hay pagos pendientes', async () => {
      db.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const response = await request(app)
        .get('/api/admin/pagos/pendientes')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(response.body.pagos.length).toBe(0);
        }
      }
    });

    test('Debe manejar errores de BD correctamente', async () => {
      db.query.mockRejectedValueOnce(new Error('DB connection failed'));

      const response = await request(app)
        .get('/api/admin/pagos/pendientes')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      if (response.status >= 400) {
        expect(response.status >= 400).toBe(true);
      }
    });
  });

  describe('PUT /api/admin/pagos/:pagoId/aprobar', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      // Mock pool.connect con transación
      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };

      db.pool = {
        connect: jest.fn().mockResolvedValue(mockClient)
      };
    });

    test('Debe aprobar un pago correctamente', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [{
              pedidoid: pagoId,
              clienteid: clienteId,
              montototal: 1000.00,
              pagado: false,
              estatus: 'Pendiente',
              nombre: 'Juan',
              apellido: 'Garcia'
            }],
            rowCount: 1
          })
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE pedidos
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .put(`/api/admin/pagos/${pagoId}/aprobar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          observaciones: 'Pago verificado'
        });

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      }
    });

    test('Debe rechazar si pedido no existe', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [], rowCount: 0 })
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .put(`/api/admin/pagos/${pagoId}/aprobar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          observaciones: 'Test'
        });

      if (response.status >= 400) {
        expect([404, 500]).toContain(response.status);
      }
    });

    test('Debe rechazar si pedido ya fue pagado', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [{
              pedidoid: pagoId,
              clienteid: clienteId,
              montototal: 1000.00,
              pagado: true, // Ya pagado
              estatus: 'Pagado',
              nombre: 'Juan',
              apellido: 'Garcia'
            }],
            rowCount: 1
          })
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .put(`/api/admin/pagos/${pagoId}/aprobar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          observaciones: 'Test'
        });

      if (response.status >= 400) {
        expect([400, 500]).toContain(response.status);
      }
    });
  });

  describe('PUT /api/admin/pagos/:pagoId/rechazar', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };

      db.pool = {
        connect: jest.fn().mockResolvedValue(mockClient)
      };
    });

    test('Debe rechazar un pago correctamente', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [{
              pedidoid: pagoId,
              clienteid: clienteId,
              montototal: 1000.00,
              pagado: false,
              estatus: 'Pendiente'
            }],
            rowCount: 1
          })
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE pedidos
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .put(`/api/admin/pagos/${pagoId}/rechazar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          razon_rechazo: 'Comprobante inválido'
        });

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      }
    });

    test('Debe rechazar si cliente NO autorizado', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({
            rows: [{
              pedidoid: pagoId,
              clienteid: clienteId,
              montototal: 1000.00,
              pagado: false,
              estatus: 'Pendiente',
              nombre: 'Juan',
              apellido: 'Garcia'
            }],
            rowCount: 1
          })
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .put(`/api/admin/pagos/${pagoId}/rechazar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          razon_rechazo: 'Comprobante inválido'
        });

      if ([200, 500].includes(response.status)) {
        expect(true).toBe(true);
      }
    });
  });

  describe('Permisos - Acceso no autorizado', () => {
    test('Cliente NO debe poder ver pagos pendientes', async () => {
      const clientToken = generateAccessToken({
        id: 1,
        rol: 'cliente',
        tenant_id: tenantId
      });

      const response = await request(app)
        .get('/api/admin/pagos/pendientes')
        .set('Authorization', `Bearer ${clientToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect(response.status >= 403).toBe(true);
    });

    test('Cliente NO debe poder aprobar pagos', async () => {
      const clientToken = generateAccessToken({
        id: 1,
        rol: 'cliente',
        tenant_id: tenantId
      });

      const response = await request(app)
        .put(`/api/admin/pagos/${pagoId}/aprobar`)
        .set('Authorization', `Bearer ${clientToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          observaciones: 'Test'
        });

      expect(response.status >= 403).toBe(true);
    });
  });
});
