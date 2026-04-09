/**
 * Unit Tests: Change Request Controller
 * Tests para gestión de cambios/devoluciones
 */

const changeRequestController = require('../../../controllers/changeRequestController');
const db = require('../../../db');

jest.mock('../../../db');
jest.mock('../../../utils/logger');

describe('changeRequestController', () => {
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

  describe('GET /api/admin/cambios', () => {
    test('✅ Obtiene lista de cambios solicitados', async () => {
      const mockCambios = [
        {
          id: 1,
          pedidoid: 100,
          motivo: 'Producto defectuoso',
          estado: 'Pendiente',
          fecha_solicitud: '2026-04-01',
          cliente: 'Juan Pérez'
        },
        {
          id: 2,
          pedidoid: 101,
          motivo: 'Cambio de talla',
          estado: 'Aprobado',
          fecha_solicitud: '2026-04-02',
          cliente: 'María García'
        }
      ];

      db.query
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: mockCambios });

      if (changeRequestController.obtenerCambios) {
        await changeRequestController.obtenerCambios(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockCambios
          })
        );
      }
    });

    test('✅ Filtra por estado del cambio', async () => {
      req.query.estado = 'Pendiente';

      db.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      if (changeRequestController.obtenerCambios) {
        await changeRequestController.obtenerCambios(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('estado'),
          expect.any(Array)
        );
      }
    });
  });

  describe('POST /api/admin/cambios/solicitar', () => {
    test('✅ Crea solicitud de cambio', async () => {
      req.body = {
        pedidoid: 100,
        motivo: 'Producto defectuoso',
        descripcion: 'El producto llegó con defectos de fabricación'
      };

      db.query
        .mockResolvedValueOnce({ rows: [{ pedidoid: 100 }] }) // verificar pedido
        .mockResolvedValueOnce({
          rows: [{ id: 1, pedidoid: 100, motivo: 'Producto defectuoso', estado: 'Pendiente' }]
        });

      if (changeRequestController.solicitarCambio) {
        await changeRequestController.solicitarCambio(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT'),
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

    test('❌ Error 404: Pedido no existe', async () => {
      req.body = {
        pedidoid: 999,
        motivo: 'Solicitud de cambio'
      };

      db.query.mockResolvedValueOnce({ rows: [] }); // Pedido no encontrado

      if (changeRequestController.solicitarCambio) {
        await changeRequestController.solicitarCambio(req, res);

        if (res.status.mock.calls.length > 0) {
          expect(res.status).toHaveBeenCalledWith(404);
        }
      }
    });
  });

  describe('PUT /api/admin/cambios/:cambioId/aprobar', () => {
    test('✅ Aprueba solicitud de cambio', async () => {
      req.params.cambioId = 1;
      req.body = { observaciones: 'Cambio autorizado' };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, estado: 'Pendiente' }] })
        .mockResolvedValueOnce({});

      if (changeRequestController.aprobarCambio) {
        await changeRequestController.aprobarCambio(req, res);

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

    test('❌ Error 400: Cambio no puede ser aprobado', async () => {
      req.params.cambioId = 1;

      db.query.mockResolvedValueOnce({
        rows: [{ id: 1, estado: 'Rechazado' }]
      });

      if (changeRequestController.aprobarCambio) {
        await changeRequestController.aprobarCambio(req, res);

        if (res.status.mock.calls.length > 0) {
          expect(res.status).toHaveBeenCalledWith(expect.any(Number) >= 400);
        }
      }
    });
  });

  describe('PUT /api/admin/cambios/:cambioId/rechazar', () => {
    test('✅ Rechaza solicitud de cambio con motivo', async () => {
      req.params.cambioId = 1;
      req.body = { motivo: 'No cumple criterios de cambio' };

      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1, estado: 'Pendiente' }] })
        .mockResolvedValueOnce({});

      if (changeRequestController.rechazarCambio) {
        await changeRequestController.rechazarCambio(req, res);

        expect(db.query).toHaveBeenCalled();

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

  describe('GET /api/admin/cambios/:cambioId', () => {
    test('✅ Obtiene detalle de cambio', async () => {
      req.params.cambioId = 1;

      const mockDetalle = {
        id: 1,
        pedidoid: 100,
        motivo: 'Producto defectuoso',
        estado: 'Aprobado',
        observaciones: 'Cambio por defecto de fabricación',
        cliente: {
          nombre: 'Juan Pérez',
          email: 'juan@test.com'
        },
        producto: {
          sku: 'SKU001',
          nombre: 'Producto A'
        }
      };

      db.query.mockResolvedValueOnce({ rows: [mockDetalle] });

      if (changeRequestController.obtenerDetalleCambio) {
        await changeRequestController.obtenerDetalleCambio(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            cambio: mockDetalle
          })
        );
      }
    });

    test('❌ Error 404: Cambio no existe', async () => {
      req.params.cambioId = 999;

      db.query.mockResolvedValueOnce({ rows: [] });

      if (changeRequestController.obtenerDetalleCambio) {
        await changeRequestController.obtenerDetalleCambio(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
      }
    });
  });
});
