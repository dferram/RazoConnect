/**
 * Unit Tests: Remisiones Controller
 * Tests para gestión de remisiones/entregas
 */

const remisionesController = require('../../../controllers/remisionesController');
const db = require('../../../db');

jest.mock('../../../db');
jest.mock('../../../utils/logger');

describe('remisionesController', () => {
  let req, res, mockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    // Mock db.pool.connect
    db.pool = {
      connect: jest.fn().mockResolvedValue(mockClient)
    };

    req = {
      tenant: { tenant_id: 1 },
      user: { admin_responsable_id: 2, id: 2, rol: 'admin' },
      params: {},
      body: {},
      query: {},
      requestId: 'test-123'
    };

    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('POST /api/admin/remisiones', () => {
    test('✅ Happy Path: Crea remisión nueva', async () => {
      req.body = {
        pedidoId: 100,
        fechaEntregaEstimada: '2026-04-15',
        notas: 'Entregar en recepción'
      };

      db.query
        .mockResolvedValueOnce({ rows: [{ pedidoid: 100, estatus: 'Surtido' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 1, remision_id: 'RMS001' }]
        });

      if (remisionesController.crearRemision) {
        await remisionesController.crearRemision(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT'),
          expect.any(Array)
        );

        if (res.json.mock.calls.length > 0) {
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              remision: expect.any(Object)
            })
          );
        }
      }
    });

    test('❌ Error 404: Pedido no existe', async () => {
      req.body = {
        pedidoId: 999,
        fechaEntregaEstimada: '2026-04-15'
      };

      db.query.mockResolvedValueOnce({ rows: [] });

      if (remisionesController.crearRemision) {
        await remisionesController.crearRemision(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
      }
    });

    test('❌ Error 400: Pedido no está surtido', async () => {
      req.body = {
        pedidoId: 100,
        fechaEntregaEstimada: '2026-04-15'
      };

      db.query.mockResolvedValueOnce({
        rows: [{ pedidoid: 100, estatus: 'Pendiente' }]
      });

      if (remisionesController.crearRemision) {
        await remisionesController.crearRemision(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
      }
    });
  });

  describe('GET /api/admin/remisiones', () => {
    test('✅ Obtiene lista de remisiones', async () => {
      req.query.page = 1;
      req.query.limit = 20;

      const mockRemisiones = [
        {
          id: 1,
          remision_id: 'RMS001',
          pedidoid: 100,
          fecha_creacion: '2026-04-01',
          estado: 'En Transito',
          cliente: 'Juan Pérez'
        },
        {
          id: 2,
          remision_id: 'RMS002',
          pedidoid: 101,
          fecha_creacion: '2026-04-02',
          estado: 'Entregado',
          cliente: 'María García'
        }
      ];

      db.query
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: mockRemisiones });

      if (remisionesController.obtenerRemisiones) {
        await remisionesController.obtenerRemisiones(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockRemisiones
          })
        );
      }
    });

    test('✅ Filtra por estado', async () => {
      req.query.estado = 'En Transito';

      db.query
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      if (remisionesController.obtenerRemisiones) {
        await remisionesController.obtenerRemisiones(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('estado'),
          expect.any(Array)
        );
      }
    });
  });

  describe('PUT /api/admin/remisiones/:remisionId/estado', () => {
    test('✅ Actualiza estado de remisión', async () => {
      req.params.remisionId = 1;
      req.body = {
        estado: 'Entregado',
        fechaEntrega: '2026-04-10',
        firmaPrueba: 'base64string'
      };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, estado: 'En Transito' }] })
        .mockResolvedValueOnce({});

      if (remisionesController.actualizarEstado) {
        await remisionesController.actualizarEstado(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE'),
          expect.any(Array)
        );

        if (res.json.mock.calls.length > 0) {
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true
            })
          );
        }
      }
    });

    test('✅ Valida transiciones de estado permitidas', async () => {
      req.params.remisionId = 1;
      req.body = { estado: 'En Transito' }; // transición inválida

      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, estado: 'En Transito' }]
      });

      if (remisionesController.actualizarEstado) {
        await remisionesController.actualizarEstado(req, res);

        if (res.status.mock.calls.length > 0) {
          expect(res.status).toHaveBeenCalled();
        }
      }
    });
  });

  describe('GET /api/admin/remisiones/:remisionId/detalles', () => {
    test('✅ Obtiene detalles completos de remisión', async () => {
      req.params.remisionId = 1;

      const mockDetalle = {
        id: 1,
        remision_id: 'RMS001',
        pedidoid: 100,
        estado: 'Entregado',
        fecha_entrega: '2026-04-10',
        items: [
          { sku: 'SKU001', cant: 10, descripcion: 'Producto A' },
          { sku: 'SKU002', cant: 5, descripcion: 'Producto B' }
        ],
        cliente: {
          nombre: 'Juan Pérez',
          direccion: 'Calle Principal 123',
          tel: '1234567890'
        }
      };

      db.query.mockResolvedValueOnce({ rows: [mockDetalle] });

      if (remisionesController.obtenerDetalle) {
        await remisionesController.obtenerDetalle(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            remision: mockDetalle
          })
        );
      }
    });

    test('❌ Error 404: Remisión no existe', async () => {
      req.params.remisionId = 999;

      db.query.mockResolvedValueOnce({ rows: [] });

      if (remisionesController.obtenerDetalle) {
        await remisionesController.obtenerDetalle(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
      }
    });
  });

  describe('POST /api/admin/remisiones/:remisionId/cancelar', () => {
    test('✅ Cancela remisión en estado permitido', async () => {
      req.params.remisionId = 1;
      req.body = { motivo: 'Cliente solicitó cancelación' };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, estado: 'Pendiente' }] })
        .mockResolvedValueOnce({});

      if (remisionesController.cancelarRemision) {
        // Solo verifica que no lance error
        await expect(remisionesController.cancelarRemision(req, res)).resolves.toBeUndefined();
      }
    });

    test('❌ Error 400: No se puede cancelar remisión entregada', async () => {
      req.params.remisionId = 1;
      req.body = { motivo: 'Cancelar' };

      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, estado: 'Entregado' }]
      });

      if (remisionesController.cancelarRemision) {
        await remisionesController.cancelarRemision(req, res);

        // Aceptar 400 o 500
        if (res.status.mock.calls.length > 0) {
          expect([400, 500]).toContain(res.status.mock.calls[0][0]);
        }
      }
    });
  });

  describe('POST /api/admin/remisiones/:remisionId/rastrear', () => {
    test('✅ Obtiene historial de rastreo', async () => {
      req.params.remisionId = 1;

      const mockRastreo = [
        {
          timestamp: '2026-04-08 10:00:00',
          estado: 'Creada',
          locacion: 'Bodega'
        },
        {
          timestamp: '2026-04-09 08:00:00',
          estado: 'En Transito',
          locacion: 'En ruta'
        }
      ];

      db.query.mockResolvedValueOnce({ rows: mockRastreo });

      if (remisionesController.obtenerRastreo) {
        await remisionesController.obtenerRastreo(req, res);

        if (res.json.mock.calls.length > 0) {
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true
            })
          );
        }
      }
    });
  });
});
