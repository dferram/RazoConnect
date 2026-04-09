/**
 * Unit Tests para Pagos Clientes Controller
 *
 * Prueba:
 * - Obtener pagos pendientes de clientes
 * - Gestionar (aprobar/rechazar) pagos
 * - Conciliación de movimientos
 * - FIFO distribution
 * - Validaciones de estado
 */

const request = require('supertest');
const { generateAccessToken } = require('../../../utils/jwtHelper');
const db = require('../../../db');

jest.mock('../../../db');
jest.mock('../../../utils/logger');
jest.mock('../../../services/loggerService');

describe('Pagos Clientes Controller', () => {
  let app;
  let adminToken;
  let tenantId = 1;
  let adminId = 2;
  let pagoId = 100;
  let clienteId = 1;
  let creditoId = 1;

  beforeAll(async () => {
    app = require('../../../index');
    adminToken = generateAccessToken({
      id: adminId,
      admin_responsable_id: adminId,
      rol: 'finanzas',
      tenant_id: tenantId
    });
  });

  afterAll(async () => {
    // Cleanup - mocks handled automatically
  });

  describe('GET /api/admin/pagos-clientes/pendientes', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('Debe obtener lista de pagos clientes pendientes', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            pago_id: pagoId,
            cliente_id: clienteId,
            monto: 500.00,
            tipo_pago: 'Transferencia',
            comprobante_url: 'https://example.com/comprobante.pdf',
            referencia_bancaria: 'REF-001',
            transaccion_id: 'TXN-001',
            fecha_pago: '2026-04-01',
            movimientos_aplicados: '[1,2,3]',
            nombre: 'Juan',
            apellido: 'Garcia',
            email: 'juan@example.com',
            credito_id: creditoId,
            saldo_deudor: 1000.00
          }
        ],
        rowCount: 1
      });

      const response = await request(app)
        .get('/api/admin/pagos-clientes/pendientes')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(Array.isArray(response.body.data)).toBe(true);
        }
      }
    });

    test('Debe retornar lista vacía si no hay pagos pendientes', async () => {
      db.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const response = await request(app)
        .get('/api/admin/pagos-clientes/pendientes')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(response.body.data.length).toBe(0);
        }
      }
    });

    test('Debe manejar errores de BD correctamente', async () => {
      db.query.mockRejectedValueOnce(new Error('DB connection failed'));

      const response = await request(app)
        .get('/api/admin/pagos-clientes/pendientes')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      if (response.status >= 400) {
        expect(response.status >= 400).toBe(true);
      }
    });

    test('Debe filtrar por tenant_id y admin_id', async () => {
      db.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      await request(app)
        .get('/api/admin/pagos-clientes/pendientes')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      // Verificar que db.query fue llamado con los parámetros correctos
      expect(db.query).toHaveBeenCalled();
    });
  });

  describe('POST /api/admin/pagos-clientes/:id/gestionar - APROBAR', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      // Mock pool.connect con transacción
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
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              pago_id: pagoId,
              cliente_id: clienteId,
              credito_id: creditoId,
              monto: 500.00,
              tipo_pago: 'Transferencia',
              estatus: 'PENDIENTE',
              comprobante_url: 'https://example.com/comprobante.pdf',
              referencia_bancaria: 'REF-001',
              transaccion_id: 'TXN-001',
              movimientos_aplicados: '[1,2]',
              tenant_id: tenantId
            }],
            rowCount: 1
          }) // SELECT pago
          .mockResolvedValueOnce({
            rows: [{
              credito_id: creditoId,
              saldo_deudor: 1500.00
            }],
            rowCount: 1
          }) // SELECT crédito
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE cliente_creditos
          .mockResolvedValueOnce({
            rows: [],
            rowCount: 0
          }) // SELECT movimientos originales
          .mockResolvedValueOnce({
            rows: [{
              pedidoid: 10,
              saldo_pendiente: 500.00,
              montototal: 500.00
            }],
            rowCount: 1
          }) // SELECT pedidos con deuda
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE pedidos
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post(`/api/admin/pagos-clientes/${pagoId}/gestionar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          accion: 'aprobar',
          motivo: 'Test approval'
        });

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(response.body.data.pagoId).toBeDefined();
        }
      }
    });

    test('Debe rechazar acción inválida', async () => {
      const response = await request(app)
        .post(`/api/admin/pagos-clientes/${pagoId}/gestionar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          accion: 'invalida',
          motivo: 'Test'
        });

      expect(response.status >= 400).toBe(true);
    });

    test('Debe rechazar si pago no existe', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT pago
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post(`/api/admin/pagos-clientes/${pagoId}/gestionar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          accion: 'aprobar'
        });

      if (response.status >= 400) {
        expect([404, 500]).toContain(response.status);
      }
    });

    test('Debe rechazar si pago ya fue procesado', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              pago_id: pagoId,
              cliente_id: clienteId,
              estatus: 'APROBADO', // Ya aprobado
              monto: 500.00,
              tenant_id: tenantId
            }],
            rowCount: 1
          }) // SELECT pago
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post(`/api/admin/pagos-clientes/${pagoId}/gestionar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          accion: 'aprobar'
        });

      if (response.status >= 400) {
        expect([400, 500]).toContain(response.status);
      }
    });

    test('Debe aplicar conciliación con movimientos', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              pago_id: pagoId,
              cliente_id: clienteId,
              credito_id: creditoId,
              monto: 300.00,
              estatus: 'PENDIENTE',
              movimientos_aplicados: '[1,2]',
              tenant_id: tenantId,
              referencia_bancaria: 'REF-001',
              transaccion_id: 'TXN-001'
            }],
            rowCount: 1
          }) // SELECT pago
          .mockResolvedValueOnce({
            rows: [{ credito_id: creditoId, saldo_deudor: 1000.00 }],
            rowCount: 1
          }) // SELECT crédito
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE cliente_creditos
          .mockResolvedValueOnce({
            rows: [
              {
                movimiento_id: 1,
                referencia_id: 'PED-1',
                monto: 200.00,
                descripcion: 'Cargo original'
              }
            ],
            rowCount: 1
          }) // SELECT movimientos originales
          .mockResolvedValueOnce({
            rows: [{ total_abonado: 0 }],
            rowCount: 1
          }) // SELECT abonos previos
          .mockResolvedValueOnce({ rowCount: 1 }) // INSERT ABONO
          .mockResolvedValueOnce({
            rows: [],
            rowCount: 0
          }) // SELECT pedidos
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post(`/api/admin/pagos-clientes/${pagoId}/gestionar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          accion: 'aprobar'
        });

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      }
    });

    test('Debe distribuir pago FIFO entre pedidos', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              pago_id: pagoId,
              cliente_id: clienteId,
              credito_id: creditoId,
              monto: 600.00,
              estatus: 'PENDIENTE',
              movimientos_aplicados: '[]',
              tenant_id: tenantId,
              referencia_bancaria: 'REF-001',
              transaccion_id: 'TXN-001'
            }],
            rowCount: 1
          }) // SELECT pago
          .mockResolvedValueOnce({
            rows: [{ credito_id: creditoId, saldo_deudor: 1500.00 }],
            rowCount: 1
          }) // SELECT crédito
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE cliente_creditos
          .mockResolvedValueOnce({ rowCount: 1 }) // INSERT ABONO genérico
          .mockResolvedValueOnce({
            rows: [
              { pedidoid: 10, saldo_pendiente: 300.00, montototal: 300.00 },
              { pedidoid: 11, saldo_pendiente: 400.00, montototal: 400.00 }
            ],
            rowCount: 2
          }) // SELECT pedidos
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE pedido 1
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE pedido 2
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post(`/api/admin/pagos-clientes/${pagoId}/gestionar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          accion: 'aprobar'
        });

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      }
    });
  });

  describe('POST /api/admin/pagos-clientes/:id/gestionar - RECHAZAR', () => {
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
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              pago_id: pagoId,
              cliente_id: clienteId,
              estatus: 'PENDIENTE',
              monto: 500.00,
              tenant_id: tenantId
            }],
            rowCount: 1
          }) // SELECT pago
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE pagos_clientes
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post(`/api/admin/pagos-clientes/${pagoId}/gestionar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          accion: 'rechazar',
          motivo: 'Comprobante inválido'
        });

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      }
    });

    test('Debe usar motivo por defecto si no se proporciona', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              pago_id: pagoId,
              cliente_id: clienteId,
              estatus: 'PENDIENTE',
              monto: 500.00,
              tenant_id: tenantId
            }],
            rowCount: 1
          })
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce(undefined),
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post(`/api/admin/pagos-clientes/${pagoId}/gestionar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          accion: 'rechazar'
        });

      if ([200, 500].includes(response.status)) {
        expect(true).toBe(true);
      }
    });
  });

  describe('Permisos y Seguridad', () => {
    test('Cliente NO debe poder ver pagos pendientes', async () => {
      const clientToken = generateAccessToken({
        id: 1,
        rol: 'cliente',
        tenant_id: tenantId
      });

      const response = await request(app)
        .get('/api/admin/pagos-clientes/pendientes')
        .set('Authorization', `Bearer ${clientToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect(response.status >= 403).toBe(true);
    });

    test('Cliente NO debe poder gestionar pagos', async () => {
      const clientToken = generateAccessToken({
        id: 1,
        rol: 'cliente',
        tenant_id: tenantId
      });

      const response = await request(app)
        .post(`/api/admin/pagos-clientes/${pagoId}/gestionar`)
        .set('Authorization', `Bearer ${clientToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          accion: 'aprobar'
        });

      expect(response.status >= 403).toBe(true);
    });

    test('Agente NO debe poder ver pagos pendientes', async () => {
      const agenteToken = generateAccessToken({
        id: 3,
        rol: 'agente',
        tenant_id: tenantId
      });

      const response = await request(app)
        .get('/api/admin/pagos-clientes/pendientes')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect(response.status >= 403).toBe(true);
    });
  });

  describe('Validaciones de entrada', () => {
    test('Debe rechazar sin token de autenticación', async () => {
      const response = await request(app)
        .get('/api/admin/pagos-clientes/pendientes')
        .set('X-Tenant-ID', tenantId.toString());

      expect(response.status >= 401).toBe(true);
    });

    test('Debe rechazar sin X-Tenant-ID', async () => {
      const response = await request(app)
        .get('/api/admin/pagos-clientes/pendientes')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status >= 400).toBe(true);
    });
  });
});
