/**
 * Tests unitarios para cxcAdminController
 * Cubre: registrarAbonoCxC — crítico para integridad financiera
 */

const { registrarAbonoCxC } = require('../../../controllers/cxcAdminController');
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

describe('cxcAdminController', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    db.pool = { connect: jest.fn().mockResolvedValue(mockClient) };
  });

  describe('registrarAbonoCxC', () => {
    const validBody = {
      creditoId: 1,
      monto: 500.00,
      metodoPago: 'efectivo',
      referencia: 'REF-001'
    };

    it('debe retornar 404 si el crédito no existe', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT credito
        .mockResolvedValueOnce({}); // ROLLBACK

      const req = mockReq({ body: validBody });
      const res = mockRes();

      await registrarAbonoCxC(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ 
          success: false,
          message: expect.stringMatching(/crédito|no encontrado/i)
        })
      );
    });

    it('debe retornar 400 si el monto excede el saldo deudor', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ // SELECT credito
          rows: [{
            credito_id: 1,
            cliente_id: 1,
            saldo_deudor: 400.00,
            limite_credito: 5000
          }]
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const req = mockReq({
        body: { ...validBody, monto: 500 }
      });
      const res = mockRes();

      await registrarAbonoCxC(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/excede|saldo|deudor/i)
        })
      );
    });

    it('debe retornar 400 si el monto es inválido (cero o negativo)', async () => {
      const req = mockReq({ 
        body: { ...validBody, monto: 0 }
      });
      const res = mockRes();

      await registrarAbonoCxC(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/monto|inválido/i)
        })
      );
    });

    it('debe retornar 400 si no se proporciona creditoId ni clienteId', async () => {
      const req = mockReq({ 
        body: { monto: 500, metodoPago: 'efectivo' }
      });
      const res = mockRes();

      await registrarAbonoCxC(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/creditoId|clienteId/i)
        })
      );
    });

    it('debe retornar 404 si el cliente no tiene crédito configurado', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT credito by clienteId
        .mockResolvedValueOnce({}); // ROLLBACK

      const req = mockReq({ 
        body: { clienteId: 999, monto: 500, metodoPago: 'efectivo' }
      });
      const res = mockRes();

      await registrarAbonoCxC(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/cliente|crédito|configurado/i)
        })
      );
    });
  });
});
