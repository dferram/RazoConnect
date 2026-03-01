/**
 * Tests unitarios para ordenesCompraController
 * Cubre: crearOrdenCompra — el flujo más crítico del sistema de inventario
 */

const { crearOrdenCompra } = require('../../../controllers/ordenesCompraController');
const db = require('../../../db');

const mockReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  tenant: { tenant_id: 1 },
  user: { id: 10, rol: 'admin', tenant_id: 1 },
  requestId: 'test-req-id',
  ...overrides
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

jest.mock('../../../utils/transactionManager', () => ({
  executeTransaction: jest.fn(async (callback) => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    const mockLogger = {
      logOperation: jest.fn(),
      logError: jest.fn(),
    };
    return callback(mockClient, mockLogger);
  }),
  executeQuery: jest.fn(),
}));

const { executeTransaction } = require('../../../utils/transactionManager');

describe('ordenesCompraController', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    db.pool = { connect: jest.fn().mockResolvedValue(mockClient) };
  });

  describe('crearOrdenCompra', () => {
    const validBody = {
      proveedorId: 1,
      fechaEntregaEsperada: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
      productos: [
        { varianteId: 1, cantidadSolicitada: 10, costoUnitario: 50 }
      ]
    };

    it('debe retornar 500 si el proveedor no existe (error lanzado en transacción)', async () => {
      executeTransaction.mockImplementationOnce(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [] }), // Proveedor no encontrado
          release: jest.fn(),
        };
        const mockLogger = {
          logOperation: jest.fn(),
          logError: jest.fn(),
        };
        await callback(mockClient, mockLogger);
      });

      const req = mockReq({ body: validBody });
      const res = mockRes();

      await crearOrdenCompra(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('debe retornar 500 si una variante de producto no existe (error lanzado en transacción)', async () => {
      executeTransaction.mockImplementationOnce(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ proveedorid: 1 }] }) // Proveedor existe
            .mockResolvedValueOnce({ rows: [{ ordencompraid: 1 }] }) // Orden creada
            .mockResolvedValueOnce({ rows: [] }), // Variante no encontrada
          release: jest.fn(),
        };
        const mockLogger = {
          logOperation: jest.fn(),
          logError: jest.fn(),
        };
        await callback(mockClient, mockLogger);
      });

      const req = mockReq({ body: validBody });
      const res = mockRes();

      await crearOrdenCompra(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('debe retornar 500 si falla la consulta de proveedor', async () => {
      db.query.mockRejectedValueOnce(new Error('DB connection error'));

      const req = mockReq({ body: validBody });
      const res = mockRes();

      await crearOrdenCompra(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('debe manejar errores de validación de piezasPorPaquete', async () => {
      const reqWithInvalidPiezas = mockReq({
        body: {
          ...validBody,
          productos: [{ varianteId: 1, cantidadSolicitada: 10, piezasPorPaquete: -5 }]
        }
      });
      const res = mockRes();

      await crearOrdenCompra(reqWithInvalidPiezas, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/piezasPorPaquete/i)
        })
      );
    });
  });
});
