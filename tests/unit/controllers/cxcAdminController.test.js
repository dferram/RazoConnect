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
      clienteId: 1,
      monto: 500.00,
      metodoPago: 'efectivo',
      referencia: 'REF-001'
    };

    it('debe retornar 404 si el crédito/CXC no existe', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ body: validBody });
      const res = mockRes();

      await registrarAbonoCxC(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('debe retornar 400 si el monto excede el saldo pendiente', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          cxc_id: 1,
          monto_total: 1000,
          monto_pagado: 600,
          estatus: 'pendiente',
          tenant_id: 1
        }]
      });

      const req = mockReq({
        body: { ...validBody, monto: 500 }
      });
      const res = mockRes();

      await registrarAbonoCxC(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/excede|saldo|monto/i)
        })
      );
    });

    it('debe retornar 400 si el CXC ya está completamente pagado', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          cxc_id: 1,
          monto_total: 1000,
          monto_pagado: 1000,
          estatus: 'pagado',
          tenant_id: 1
        }]
      });

      const req = mockReq({ body: validBody });
      const res = mockRes();

      await registrarAbonoCxC(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debe retornar 500 si falla la consulta de base de datos', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));

      const req = mockReq({ body: validBody });
      const res = mockRes();

      await registrarAbonoCxC(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('debe retornar 403 si el CXC pertenece a otro tenant', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          cxc_id: 1,
          monto_total: 1000,
          monto_pagado: 0,
          estatus: 'pendiente',
          tenant_id: 99
        }]
      });

      const req = mockReq({ body: validBody });
      const res = mockRes();

      await registrarAbonoCxC(req, res);

      expect([403, 404]).toContain(res.status.mock.calls[0][0]);
    });
  });
});
