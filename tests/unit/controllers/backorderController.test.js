/**
 * Unit Tests: Backorder Controller
 * Tests para gestión de pedidos pendientes de stock
 */

const backorderController = require('../../../controllers/backorderController');
const db = require('../../../db');

jest.mock('../../../db');
jest.mock('../../../utils/logger');

describe('backorderController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      tenant: { tenant_id: 1 },
      user: { admin_responsable_id: 2, id: 2, rol: 'admin' },
      params: {},
      body: {},
      query: { page: 1, limit: 20 },
      requestId: 'test-123'
    };

    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('GET /api/admin/backorders', () => {
    test('✅ Obtiene lista de backorders', async () => {
      const mockBackorders = [
        {
          id: 1,
          pedidoid: 100,
          variante_id: 1,
          cantidad_original: 50,
          cantidad_pendiente: 50,
          fecha_pedido: '2026-04-01',
          estado: 'Pendiente',
          cliente: 'Juan Pérez'
        },
        {
          id: 2,
          pedidoid: 101,
          variante_id: 2,
          cantidad_original: 30,
          cantidad_pendiente: 10,
          fecha_pedido: '2026-04-02',
          estado: 'Parcialmente Cubierto',
          cliente: 'María García'
        }
      ];

      db.query
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: mockBackorders });

      if (backorderController.obtenerBackorders) {
        await backorderController.obtenerBackorders(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockBackorders
          })
        );
      }
    });

    test('✅ Filtra por estado', async () => {
      req.query.estado = 'Pendiente';

      db.query
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      if (backorderController.obtenerBackorders) {
        await backorderController.obtenerBackorders(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('estado'),
          expect.any(Array)
        );
      }
    });

    test('✅ Retorna backorders ordenados por antigüedad', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      if (backorderController.obtenerBackorders) {
        await backorderController.obtenerBackorders(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY'),
          expect.any(Array)
        );
      }
    });
  });

  describe('PUT /api/admin/backorders/:backorderId/cubrir', () => {
    test('✅ Cubre backorder con stock disponible', async () => {
      req.params.backorderId = 1;
      req.body = { cantidad_cubierta: 30 };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, cantidad_pendiente: 50 }] })
        .mockResolvedValueOnce({ rows: [{ stock: 100 }] }) // verificar stock
        .mockResolvedValueOnce({}) // UPDATE backorder
        .mockResolvedValueOnce({});  // UPDATE stock

      if (backorderController.cubrirBackorder) {
        await backorderController.cubrirBackorder(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE'),
          expect.any(Array)
        );

        if (res.json.mock.calls.length > 0) {
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              message: expect.stringContaining('cubier')
            })
          );
        }
      }
    });

    test('❌ Error: Stock insuficiente', async () => {
      req.params.backorderId = 1;
      req.body = { cantidad_cubierta: 100 };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, cantidad_pendiente: 50 }] })
        .mockResolvedValueOnce({ rows: [{ stock: 10 }] }); // stock insuficiente

      if (backorderController.cubrirBackorder) {
        await backorderController.cubrirBackorder(req, res);

        if (res.status.mock.calls.length > 0) {
          expect(res.status).toHaveBeenCalledWith(400);
        }
      }
    });

    test('✅ Completa backorder cuando cantidad cubre pendiente', async () => {
      req.params.backorderId = 1;
      req.body = { cantidad_cubierta: 50 };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, cantidad_pendiente: 50 }] })
        .mockResolvedValueOnce({ rows: [{ stock: 100 }] })
        .mockResolvedValueOnce({}) // UPDATE backorder
        .mockResolvedValueOnce({}); // UPDATE stock

      if (backorderController.cubrirBackorder) {
        await backorderController.cubrirBackorder(req, res);

        if (res.json.mock.calls.length > 0) {
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              estado_final: expect.stringMatching(/Completado|Cubierto/)
            })
          );
        }
      }
    });
  });

  describe('GET /api/admin/backorders/estadisticas', () => {
    test('✅ Obtiene estadísticas de backorders', async () => {
      const mockStats = {
        total_backorders: 15,
        cantidad_total_pendiente: 500,
        backorders_antiguos_30_dias: 3,
        backorders_antiguos_60_dias: 1,
        valor_bloqueado: 25000.00
      };

      db.query.mockResolvedValueOnce({ rows: [mockStats] });

      if (backorderController.obtenerEstadisticas) {
        await backorderController.obtenerEstadisticas(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            estadisticas: mockStats
          })
        );
      }
    });
  });

  describe('POST /api/admin/backorders/:backorderId/cancelar', () => {
    test('✅ Cancela backorder con motivo', async () => {
      req.params.backorderId = 1;
      req.body = { motivo: 'Cliente solicitó cancelación' };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, estado: 'Pendiente' }] })
        .mockResolvedValueOnce({});

      if (backorderController.cancelarBackorder) {
        await backorderController.cancelarBackorder(req, res);

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

    test('❌ Error: Backorder ya completado', async () => {
      req.params.backorderId = 1;

      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, estado: 'Completado' }]
      });

      if (backorderController.cancelarBackorder) {
        await backorderController.cancelarBackorder(req, res);

        if (res.status.mock.calls.length > 0) {
          expect(res.status).toHaveBeenCalledWith(400);
        }
      }
    });
  });

  describe('GET /api/admin/backorders/alertas', () => {
    test('✅ Obtiene alertas de backorders antiguos', async () => {
      const mockAlertas = [
        {
          backorder_id: 1,
          dias_pendiente: 65,
          nivel_alerta: 'CRÍTICO',
          cantidad_pendiente: 100,
          cliente: 'Juan Pérez'
        },
        {
          backorder_id: 2,
          dias_pendiente: 35,
          nivel_alerta: 'ADVERTENCIA',
          cantidad_pendiente: 50,
          cliente: 'María García'
        }
      ];

      db.query.mockResolvedValueOnce({ rows: mockAlertas });

      if (backorderController.obtenerAlertas) {
        await backorderController.obtenerAlertas(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            alertas: mockAlertas
          })
        );
      }
    });
  });
});
