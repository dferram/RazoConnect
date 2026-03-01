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
      tipoMovimiento: 'MERMA',
      cantidadCambio: 5,
      motivo: 'Producto dañado en almacén'
    };

    const validBodyAdicion = {
      varianteId: 1,
      tipoMovimiento: 'ADICION',
      cantidadCambio: 10,
      motivo: 'Corrección de conteo físico'
    };

    it('debe retornar 404 si la variante no existe', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ body: validBodyMerma });
      const res = mockRes();

      await ajustarInventario(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('debe retornar 400 si tipo de movimiento es inválido', async () => {
      const req = mockReq({
        body: { ...validBodyMerma, tipoMovimiento: 'INVALIDO' }
      });
      const res = mockRes();

      db.query.mockResolvedValueOnce({ rows: [{ varianteid: 1, stockactual: 100 }] });

      await ajustarInventario(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debe retornar 400 si MERMA supera el stock disponible', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{ varianteid: 1, stockactual: 3 }]
      });

      const req = mockReq({
        body: { ...validBodyMerma, cantidadCambio: 10 }
      });
      const res = mockRes();

      await ajustarInventario(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringMatching(/stock|insuficiente/i)
        })
      );
    });

    it('debe retornar 500 si falla la base de datos', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));

      const req = mockReq({ body: validBodyMerma });
      const res = mockRes();

      await ajustarInventario(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('debe llamar a la base de datos con los parámetros correctos para MERMA', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ varianteid: 1, stockactual: 100 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ stockactual: 95 }] })
        .mockResolvedValueOnce({ rows: [{ movimientoid: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ body: validBodyMerma });
      const res = mockRes();

      await ajustarInventario(req, res);

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.status).not.toHaveBeenCalledWith(500);
    });
  });
});
