/**
 * Tests unitarios para transactionManager
 * Cubre: executeTransaction — crítico para integridad de datos financieros
 */

const { executeTransaction, executeQuery } = require('../../../utils/transactionManager');
const db = require('../../../db');

describe('transactionManager', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    db.pool.connect.mockResolvedValue(mockClient);
  });

  describe('executeTransaction', () => {
    it('debe ejecutar BEGIN, callback y COMMIT en orden correcto', async () => {
      const callbackResult = { data: 'resultado' };
      const callback = jest.fn().mockResolvedValue(callbackResult);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await executeTransaction(callback);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toBe(mockClient);
      expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
      expect(result).toEqual(callbackResult);
    });

    it('debe ejecutar ROLLBACK si el callback lanza error', async () => {
      const error = new Error('Error en la operación');
      const callback = jest.fn().mockRejectedValue(error);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await expect(executeTransaction(callback)).rejects.toThrow('Error en la operación');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('debe liberar el cliente después de éxito', async () => {
      const callback = jest.fn().mockResolvedValue({ ok: true });
      mockClient.query.mockResolvedValue({});

      await executeTransaction(callback);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('debe liberar el cliente después de error', async () => {
      const callback = jest.fn().mockRejectedValue(new Error('fallo'));
      mockClient.query.mockResolvedValue({});

      await expect(executeTransaction(callback)).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('debe propagar el error original sin modificarlo', async () => {
      const originalError = new Error('Error original de BD');
      originalError.code = 'P0001';
      
      const callback = jest.fn().mockRejectedValue(originalError);
      mockClient.query.mockResolvedValue({});

      try {
        await executeTransaction(callback);
        fail('Debería haber lanzado error');
      } catch (err) {
        expect(err.message).toBe('Error original de BD');
        expect(err.code).toBe('P0001');
      }
    });
  });

  describe('executeQuery', () => {
    it('debe ejecutar la query y retornar el resultado', async () => {
      const mockResult = { rows: [{ id: 1, nombre: 'Test' }] };
      mockClient.query.mockResolvedValueOnce(mockResult);

      const result = await executeQuery('SELECT * FROM test WHERE id = $1', [1]);

      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [1]);
      expect(result).toEqual(mockResult);
    });

    it('debe liberar el cliente después de ejecutar la query', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await executeQuery('SELECT 1');

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('debe liberar el cliente aunque la query falle', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Query failed'));

      await expect(executeQuery('SELECT invalid')).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
