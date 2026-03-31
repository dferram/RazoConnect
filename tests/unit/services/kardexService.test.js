const KardexService = require('../../../services/kardexService');
const db = require('../../../db');

const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

jest.mock('../../../db', () => ({
  pool: {
    connect: jest.fn()
  },
  query: jest.fn()
}));

describe('KardexService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.pool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockClear();
    mockClient.release.mockClear();
  });

  describe('registrarMovimiento', () => {
    it('debe lanzar un Error cuando tipo es "ENTRADA"', async () => {
      await expect(
        KardexService.registrarMovimiento({
          varianteId: 1,
          adminId: 1,
          tenantId: 1,
          tipo: 'ENTRADA',
          cantidad: 10,
          motivo: 'Test'
        })
      ).rejects.toThrow('Tipo de movimiento inválido: "ENTRADA"');
    });

    it('debe lanzar un Error cuando tipo es "SALIDA"', async () => {
      await expect(
        KardexService.registrarMovimiento({
          varianteId: 1,
          adminId: 1,
          tenantId: 1,
          tipo: 'SALIDA',
          cantidad: -10,
          motivo: 'Test'
        })
      ).rejects.toThrow('Tipo de movimiento inválido: "SALIDA"');
    });

    it('debe lanzar un Error cuando tipo es "AJUSTE"', async () => {
      await expect(
        KardexService.registrarMovimiento({
          varianteId: 1,
          adminId: 1,
          tenantId: 1,
          tipo: 'AJUSTE',
          cantidad: 5,
          motivo: 'Test'
        })
      ).rejects.toThrow('Tipo de movimiento inválido: "AJUSTE"');
    });

    it('debe aceptar tipo: "MERMA" sin lanzar error de validación', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ stock_actual: 100 }] }) // SELECT stock
        .mockResolvedValueOnce({ rows: [{ id: 1, tipo: 'MERMA', cantidad: -5 }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await KardexService.registrarMovimiento({
        varianteId: 1,
        adminId: 1,
        tenantId: 1,
        tipo: 'MERMA',
        cantidad: -5,
        motivo: 'Producto dañado'
      });

      expect(result).toBeDefined();
      expect(result.tipo).toBe('MERMA');
    });

    it('debe aceptar tipo: "ADICION" sin lanzar error de validación', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ stock_actual: 100 }] }) // SELECT stock
        .mockResolvedValueOnce({ rows: [{ id: 1, tipo: 'ADICION', cantidad: 10 }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await KardexService.registrarMovimiento({
        varianteId: 1,
        adminId: 1,
        tenantId: 1,
        tipo: 'ADICION',
        cantidad: 10,
        motivo: 'Ajuste de inventario'
      });

      expect(result).toBeDefined();
      expect(result.tipo).toBe('ADICION');
    });

    it('debe hacer ROLLBACK y relanzar el error si la query de INSERT falla', async () => {
      const errorMessage = 'Error de base de datos';
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ stock_actual: 100 }] }) // SELECT stock
        .mockRejectedValueOnce(new Error(errorMessage)); // INSERT falla

      await expect(
        KardexService.registrarMovimiento({
          varianteId: 1,
          adminId: 1,
          tenantId: 1,
          tipo: 'MERMA',
          cantidad: -5,
          motivo: 'Test'
        })
      ).rejects.toThrow(errorMessage);

      // Verificar que se llamó ROLLBACK
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('registrarMovimientosLote', () => {
    it('debe hacer ROLLBACK si uno de los movimientos del lote falla', async () => {
      const errorMessage = 'Error en segundo movimiento';
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ stock_actual: 100 }] }) // SELECT stock (mov 1)
        .mockResolvedValueOnce({ rows: [{ id: 1, tipo: 'MERMA' }] }) // INSERT (mov 1)
        .mockResolvedValueOnce({ rows: [{ stock_actual: 95 }] }) // SELECT stock (mov 2)
        .mockRejectedValueOnce(new Error(errorMessage)); // INSERT falla (mov 2)

      const movimientos = [
        {
          varianteId: 1,
          adminId: 1,
          tenantId: 1,
          tipo: 'MERMA',
          cantidad: -5,
          motivo: 'Movimiento 1'
        },
        {
          varianteId: 1,
          adminId: 1,
          tenantId: 1,
          tipo: 'ADICION',
          cantidad: 10,
          motivo: 'Movimiento 2'
        }
      ];

      await expect(
        KardexService.registrarMovimientosLote(movimientos)
      ).rejects.toThrow(errorMessage);

      // Verificar que se llamó ROLLBACK
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('debe retornar un array con los resultados cuando todos los movimientos son válidos', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ stock_actual: 100 }] }) // SELECT stock (mov 1)
        .mockResolvedValueOnce({ rows: [{ id: 1, tipo: 'MERMA', cantidad: -5 }] }) // INSERT (mov 1)
        .mockResolvedValueOnce({ rows: [{ stock_actual: 95 }] }) // SELECT stock (mov 2)
        .mockResolvedValueOnce({ rows: [{ id: 2, tipo: 'ADICION', cantidad: 10 }] }) // INSERT (mov 2)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const movimientos = [
        {
          varianteId: 1,
          adminId: 1,
          tenantId: 1,
          tipo: 'MERMA',
          cantidad: -5,
          motivo: 'Movimiento 1'
        },
        {
          varianteId: 1,
          adminId: 1,
          tenantId: 1,
          tipo: 'ADICION',
          cantidad: 10,
          motivo: 'Movimiento 2'
        }
      ];

      const result = await KardexService.registrarMovimientosLote(movimientos);

      expect(result).toHaveLength(2);
      expect(result[0].tipo).toBe('MERMA');
      expect(result[1].tipo).toBe('ADICION');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
