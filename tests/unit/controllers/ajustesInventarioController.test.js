/**
 * Tests unitarios para ajustesInventarioController
 * Cubre: ajustarInventario — crítico para integridad de inventario
 */

const { ajustarInventario } = require('../../../controllers/ajustesInventarioController');
const db = require('../../../db');

const mockReq = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  tenant: { tenant_id: 1 },
  user: { id: 10, rol: 'superadmin', roles: ['superadmin'], tipo: 'admin', tenant_id: 1 },
  requestId: 'test-req-id',
  ...overrides
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('ajustesInventarioController', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    db.pool = { connect: jest.fn().mockResolvedValue(mockClient) };
  });

  describe('ajustarInventario', () => {
    const validBodyMerma = {
      varianteId: 1,
      tipoMovimiento: 'SALIDA',
      cantidad: 5,
      motivo: 'Producto dañado en almacén'
    };

    const validBodyAdicion = {
      varianteId: 1,
      tipoMovimiento: 'ENTRADA',
      cantidad: 10,
      motivo: 'Corrección de conteo físico'
    };

    it('debe retornar 403 si el usuario no es superadmin', async () => {
      const req = mockReq({ 
        body: validBodyMerma,
        user: { id: 10, rol: 'admin', roles: ['admin'], tipo: 'admin', tenant_id: 1 }
      });
      const res = mockRes();

      await ajustarInventario(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ 
          success: false,
          message: expect.stringMatching(/permisos|super-administrador/i)
        })
      );
    });

    it('debe retornar 400 si tipo de movimiento es inválido', async () => {
      const req = mockReq({
        body: { ...validBodyMerma, tipoMovimiento: 'INVALIDO' }
      });
      const res = mockRes();

      await ajustarInventario(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/tipoMovimiento|ENTRADA|SALIDA/i)
        })
      );
    });

    it('debe retornar 400 si la cantidad es cero', async () => {
      const req = mockReq({
        body: { ...validBodyMerma, cantidad: 0 }
      });
      const res = mockRes();

      await ajustarInventario(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/cantidad|cero/i)
        })
      );
    });

    it('debe retornar 400 si el motivo está vacío', async () => {
      const req = mockReq({ 
        body: { ...validBodyMerma, motivo: '' }
      });
      const res = mockRes();

      await ajustarInventario(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/motivo/i)
        })
      );
    });

    it('debe retornar 400 si la cantidad es inválida', async () => {
      const req = mockReq({ 
        body: { ...validBodyMerma, cantidad: 'invalid' }
      });
      const res = mockRes();

      await ajustarInventario(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/cantidad|inválida/i)
        })
      );
    });
  });
});
