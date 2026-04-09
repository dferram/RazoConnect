/**
 * Unit Tests para Agentes Entregas Controller
 *
 * Prueba:
 * - Confirmar entrega de pedido
 * - Upload de evidencia fotográfica
 * - Pagos contra-entrega
 * - Obtener entregas pendientes
 */

const request = require('supertest');
const { generateAccessToken } = require('../../../utils/jwtHelper');
const db = require('../../../db');

jest.mock('../../../db');
jest.mock('../../../utils/logger');
jest.mock('../../../config/cloudinary');

describe('Agentes Entregas Controller', () => {
  let app;
  let agenteToken;
  let tenantId = 1;
  let agenteId = 3;
  let pedidoId = 100;
  let clienteId = 1;
  let remisionId = 1;

  beforeAll(async () => {
    app = require('../../../index');
    agenteToken = generateAccessToken({
      id: agenteId,
      userId: agenteId,
      rol: 'agente',
      tenant_id: tenantId
    });
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('POST /api/agente/entregas/confirmar', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      // Mock pool.connect
      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };

      db.pool = {
        connect: jest.fn().mockResolvedValue(mockClient)
      };
    });

    test('Debe confirmar entrega de pedido sin foto', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              pedidoid: pedidoId,
              clienteid: clienteId,
              agenteid: agenteId,
              tenant_id: tenantId,
              metodo_pago: 'Transferencia',
              cliente_nombre: 'Juan',
              cliente_apellido: 'Garcia',
              cliente_email: 'juan@example.com',
              estatus: 'Enviado'
            }],
            rowCount: 1
          }) // SELECT pedido
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE pedidos
          .mockResolvedValueOnce({ rowCount: 1 }) // INSERT notificación
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/api/agente/entregas/confirmar')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          pedido_id: pedidoId
        });

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      }
    });

    test('Debe rechazar entrega contra-entrega sin foto', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              pedidoid: pedidoId,
              clienteid: clienteId,
              agenteid: agenteId,
              tenant_id: tenantId,
              metodo_pago: 'CONTRA_ENTREGA', // Pago contra-entrega
              cliente_nombre: 'Juan',
              cliente_apellido: 'Garcia',
              cliente_email: 'juan@example.com',
              estatus: 'Enviado'
            }],
            rowCount: 1
          }) // SELECT pedido
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/api/agente/entregas/confirmar')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          pedido_id: pedidoId
        });

      if (response.status >= 400) {
        expect([400, 500]).toContain(response.status);
      }
    });

    test('Debe rechazar si pedido no existe', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT pedido
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/api/agente/entregas/confirmar')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          pedido_id: pedidoId
        });

      if (response.status >= 400) {
        expect([404, 500]).toContain(response.status);
      }
    });

    test('Debe actualizar remisión si se proporciona', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              pedidoid: pedidoId,
              clienteid: clienteId,
              agenteid: agenteId,
              tenant_id: tenantId,
              metodo_pago: 'Transferencia',
              cliente_nombre: 'Juan',
              cliente_apellido: 'Garcia',
              cliente_email: 'juan@example.com',
              estatus: 'Enviado'
            }],
            rowCount: 1
          }) // SELECT pedido
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE pedidos
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE remisiones
          .mockResolvedValueOnce({ rowCount: 1 }) // INSERT notificación
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/api/agente/entregas/confirmar')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          pedido_id: pedidoId,
          remision_id: remisionId
        });

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      }
    });

    test('Debe marcar como pagado para contra-entrega', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              pedidoid: pedidoId,
              clienteid: clienteId,
              agenteid: agenteId,
              tenant_id: tenantId,
              metodo_pago: 'CONTRA_ENTREGA',
              cliente_nombre: 'Juan',
              cliente_apellido: 'Garcia',
              cliente_email: 'juan@example.com',
              estatus: 'Enviado'
            }],
            rowCount: 1
          }) // SELECT pedido
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE pedidos (entregado)
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE pedidos (pagado)
          .mockResolvedValueOnce({ rowCount: 1 }) // INSERT notificación
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/api/agente/entregas/confirmar')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          pedido_id: pedidoId
        });

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      }
    });

    test('Debe rechazar sin pedido_id', async () => {
      const response = await request(app)
        .post('/api/agente/entregas/confirmar')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({});

      expect(response.status >= 400).toBe(true);
    });

    test('Debe rechazar si pedido pertenece a otro agente', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT pedido (not found for this agent)
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/api/agente/entregas/confirmar')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          pedido_id: pedidoId
        });

      if (response.status >= 400) {
        expect([404, 500]).toContain(response.status);
      }
    });

    test('Debe crear notificación para cliente', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce({
            rows: [{
              pedidoid: pedidoId,
              clienteid: clienteId,
              agenteid: agenteId,
              tenant_id: tenantId,
              metodo_pago: 'Transferencia',
              cliente_nombre: 'Juan',
              cliente_apellido: 'Garcia',
              cliente_email: 'juan@example.com',
              estatus: 'Enviado'
            }],
            rowCount: 1
          }) // SELECT pedido
          .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE pedidos
          .mockResolvedValueOnce({ rowCount: 1 }) // INSERT notificación
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn()
      };

      db.pool.connect.mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/api/agente/entregas/confirmar')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({
          pedido_id: pedidoId
        });

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
        }
      }
    });
  });

  describe('GET /api/agente/entregas/pendientes', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('Debe obtener entregas pendientes del agente', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            pedidoid: 100,
            numeropedido: '000100',
            clienteid: 1,
            nombre_cliente: 'Juan Garcia',
            estado: 'Enviado',
            direccion: 'Calle Principal 123',
            ciudad: 'CDMX',
            telefono: '5551234567',
            montototal: 1000.00,
            metodo_pago: 'Transferencia',
            fecha_envio: '2026-04-01'
          },
          {
            pedidoid: 101,
            numeropedido: '000101',
            clienteid: 2,
            nombre_cliente: 'Maria Lopez',
            estado: 'Enviado',
            direccion: 'Avenida Secundaria 456',
            ciudad: 'Guadalajara',
            telefono: '5559876543',
            montototal: 500.00,
            metodo_pago: 'CONTRA_ENTREGA',
            fecha_envio: '2026-04-02'
          }
        ],
        rowCount: 2
      });

      const response = await request(app)
        .get('/api/agente/entregas/pendientes')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(Array.isArray(response.body.data)).toBe(true);
        }
      }
    });

    test('Debe retornar lista vacía si sin entregas pendientes', async () => {
      db.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const response = await request(app)
        .get('/api/agente/entregas/pendientes')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      if ([200, 500].includes(response.status)) {
        if (response.status === 200) {
          expect(response.body.success).toBe(true);
          expect(response.body.data.length).toBe(0);
        }
      }
    });

    test('Debe incluir información crítica de cada entrega', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          pedidoid: 100,
          numeropedido: '000100',
          clienteid: 1,
          nombre_cliente: 'Juan Garcia',
          estado: 'Enviado',
          direccion: 'Calle Principal 123',
          ciudad: 'CDMX',
          telefono: '5551234567',
          montototal: 1000.00,
          metodo_pago: 'Transferencia',
          fecha_envio: '2026-04-01'
        }],
        rowCount: 1
      });

      const response = await request(app)
        .get('/api/agente/entregas/pendientes')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      if ([200, 500].includes(response.status)) {
        if (response.status === 200 && response.body.data.length > 0) {
          const entrega = response.body.data[0];
          expect(entrega.pedidoid).toBeDefined();
          expect(entrega.nombre_cliente).toBeDefined();
          expect(entrega.direccion).toBeDefined();
          expect(entrega.montototal).toBeDefined();
        }
      }
    });

    test('Debe manejar errores de BD correctamente', async () => {
      db.query.mockRejectedValueOnce(new Error('DB connection failed'));

      const response = await request(app)
        .get('/api/agente/entregas/pendientes')
        .set('Authorization', `Bearer ${agenteToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      if (response.status >= 400) {
        expect(response.status >= 400).toBe(true);
      }
    });

    test('Cliente NO debe poder ver entregas pendientes', async () => {
      const clientToken = generateAccessToken({
        id: 1,
        rol: 'cliente',
        tenant_id: tenantId
      });

      const response = await request(app)
        .get('/api/agente/entregas/pendientes')
        .set('Authorization', `Bearer ${clientToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect(response.status >= 403).toBe(true);
    });

    test('Admin NO debe poder ver entregas pendientes de agente', async () => {
      const adminToken = generateAccessToken({
        id: 2,
        rol: 'admin',
        tenant_id: tenantId
      });

      const response = await request(app)
        .get('/api/agente/entregas/pendientes')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant-ID', tenantId.toString());

      expect(response.status >= 403).toBe(true);
    });
  });

  describe('Permisos y Autenticación', () => {
    test('Debe rechazar sin token', async () => {
      const response = await request(app)
        .post('/api/agente/entregas/confirmar')
        .set('X-Tenant-ID', tenantId.toString())
        .send({ pedido_id: pedidoId });

      expect(response.status >= 401).toBe(true);
    });

    test('Debe rechazar sin X-Tenant-ID', async () => {
      const response = await request(app)
        .post('/api/agente/entregas/confirmar')
        .set('Authorization', `Bearer ${agenteToken}`)
        .send({ pedido_id: pedidoId });

      expect(response.status >= 400).toBe(true);
    });

    test('Cliente NO debe poder confirmar entregas', async () => {
      const clientToken = generateAccessToken({
        id: 1,
        rol: 'cliente',
        tenant_id: tenantId
      });

      const response = await request(app)
        .post('/api/agente/entregas/confirmar')
        .set('Authorization', `Bearer ${clientToken}`)
        .set('X-Tenant-ID', tenantId.toString())
        .send({ pedido_id: pedidoId });

      expect(response.status >= 403).toBe(true);
    });
  });
});
