const pagosController = require('../../../controllers/admin/pagosController');
const db = require('../../../db');
const { registrarCambio } = require('../../../services/auditService');

jest.mock('../../../db');
jest.mock('../../../services/auditService', () => ({
  registrarCambio: jest.fn().mockResolvedValue(undefined)
}));

describe('pagosController', () => {
  let req, res, mockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    db.pool.connect.mockResolvedValue(mockClient);

    req = {
      tenant: { tenant_id: 1 },
      user: { admin_responsable_id: 2, id: 2 },
      params: {},
      body: {},
      requestId: 'test-req-123'
    };

    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getPagosPendientes', () => {
    test('✅ Happy Path: Retorna lista de pagos pendientes', async () => {
      const mockPagos = [
        {
          pedidoid: 100,
          clienteid: 1,
          montototal: 1500.00,
          nombre: 'Juan',
          apellido: 'Pérez',
          email: 'juan@example.com'
        }
      ];

      db.query.mockResolvedValueOnce({ rows: mockPagos });

      await pagosController.getPagosPendientes(req, res);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE p.pagado = false'),
        [1]
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        pagos: mockPagos
      });
    });

    test('✅ Empty list si no hay pagos pendientes', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await pagosController.getPagosPendientes(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        pagos: []
      });
    });

    test('❌ Error 500: DB query falla', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));

      await pagosController.getPagosPendientes(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error al obtener pagos pendientes'
      });
    });
  });

  describe('aprobarPago', () => {
    const mockPedido = {
      pedidoid: 100,
      clienteid: 1,
      montototal: 1500.00,
      estatus: 'Pendiente Pago',
      pagado: false,
      nombre: 'Juan',
      apellido: 'Pérez'
    };

    test('✅ Happy Path: Aprueba pago correctamente', async () => {
      req.params.pagoId = 100;

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPedido] }) // SELECT
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}) // INSERT notificación
        .mockResolvedValueOnce({}); // COMMIT

      await pagosController.aprobarPago(req, res);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(registrarCambio).toHaveBeenCalledWith(
        'pedidos',
        100,
        'UPDATE',
        expect.any(Object),
        expect.objectContaining({
          accion: 'APROBAR_PAGO_TRANSFERENCIA'
        }),
        2
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('Pago aprobado')
      });
    });

    test('❌ Error 404: Pedido no encontrado', async () => {
      req.params.pagoId = 999;

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // SELECT sin resultados

      await pagosController.aprobarPago(req, res);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Pedido no encontrado'
      });
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('❌ Error 400: Pedido ya fue pagado', async () => {
      req.params.pagoId = 100;
      const paidPedido = { ...mockPedido, pagado: true };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [paidPedido] }); // SELECT con pagado=true

      await pagosController.aprobarPago(req, res);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Este pedido ya fue marcado como pagado'
      });
    });

    test('❌ Error 500: Transaction falla', async () => {
      req.params.pagoId = 100;

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPedido] }) // SELECT ok
        .mockRejectedValueOnce(new Error('Database error')); // UPDATE falla

      await pagosController.aprobarPago(req, res);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error al aprobar pago'
      });
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('rechazarPago', () => {
    const mockPedido = {
      pedidoid: 100,
      clienteid: 1,
      montototal: 1500.00,
      estatus: 'Pendiente Pago',
      pagado: false,
      nombre: 'Juan',
      apellido: 'Pérez'
    };

    test('✅ Happy Path: Rechaza pago con motivo', async () => {
      req.params.pagoId = 100;
      req.body.motivo = 'Comprobante inválido';

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPedido] }) // SELECT
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}) // INSERT notificación
        .mockResolvedValueOnce({}); // COMMIT

      await pagosController.rechazarPago(req, res);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(registrarCambio).toHaveBeenCalledWith(
        'pedidos',
        100,
        'UPDATE',
        expect.any(Object),
        expect.objectContaining({
          accion: 'RECHAZAR_PAGO_TRANSFERENCIA',
          motivo: 'Comprobante inválido'
        }),
        2
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: expect.stringContaining('Pago rechazado')
      });
    });

    test('❌ Error 404: Pedido no encontrado', async () => {
      req.params.pagoId = 999;

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // SELECT sin resultados

      await pagosController.rechazarPago(req, res);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Pedido no encontrado'
      });
    });

    test('❌ Error 400: Pedido ya fue pagado', async () => {
      req.params.pagoId = 100;
      const paidPedido = { ...mockPedido, pagado: true };

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [paidPedido] }); // SELECT con pagado=true

      await pagosController.rechazarPago(req, res);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Este pedido ya fue marcado como pagado'
      });
    });

    test('❌ Error 500: Transaction falla', async () => {
      req.params.pagoId = 100;
      req.body.motivo = 'Prueba error';

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockPedido] }) // SELECT ok
        .mockRejectedValueOnce(new Error('Connection lost')); // UPDATE falla

      await pagosController.rechazarPago(req, res);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error al rechazar pago'
      });
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
