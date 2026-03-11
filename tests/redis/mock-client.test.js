/**
 * UNIT TESTS: Mock Redis Client
 * 
 * Verifica que el cliente mock de Redis funcione correctamente
 * simulando todos los métodos básicos de Redis.
 */

// Forzar modo desarrollo ANTES de cualquier import
process.env.NODE_ENV = 'development';

const { describe, test, expect, beforeAll, beforeEach, afterAll } = require('@jest/globals');
const redisModule = require('../../config/redisClient');

const originalEnv = process.env.NODE_ENV;

describe('Mock Redis Client - Unit Tests', () => {
  let mockClient;

  beforeAll(async () => {
    // Inicializar cliente mock
    await redisModule.initRedisClient();
    mockClient = await redisModule.getRedisClient();
  });

  beforeEach(() => {
    // Limpiar mock antes de cada test
    if (mockClient && mockClient._clearAll) {
      mockClient._clearAll();
    }
  });

  afterAll(async () => {
    // Limpiar interval del mock client
    if (mockClient && mockClient._cleanup) {
      mockClient._cleanup();
    }
    
    // Cerrar conexión
    if (redisModule && redisModule.closeRedisConnection) {
      await redisModule.closeRedisConnection();
    }
    
    // Restaurar entorno original
    process.env.NODE_ENV = originalEnv;
  });

  describe('Detección de Modo Mock', () => {
    test('debe detectar que está usando mock en desarrollo', () => {
      expect(redisModule.isUsingMock()).toBe(true);
    });

    test('debe retornar un cliente válido', () => {
      expect(mockClient).toBeDefined();
      expect(mockClient).not.toBeNull();
    });

    test('debe tener todos los métodos necesarios', () => {
      expect(typeof mockClient.get).toBe('function');
      expect(typeof mockClient.set).toBe('function');
      expect(typeof mockClient.setEx).toBe('function');
      expect(typeof mockClient.del).toBe('function');
      expect(typeof mockClient.exists).toBe('function');
      expect(typeof mockClient.sendCommand).toBe('function');
    });
  });

  describe('Operaciones Básicas - GET/SET', () => {
    test('debe guardar y recuperar un valor', async () => {
      const key = 'test:key1';
      const value = 'test_value';
      
      await mockClient.set(key, value);
      const result = await mockClient.get(key);
      
      expect(result).toBe(value);
    });

    test('debe retornar null para claves inexistentes', async () => {
      const result = await mockClient.get('nonexistent:key');
      expect(result).toBeNull();
    });

    test('debe sobrescribir valores existentes', async () => {
      const key = 'test:key2';
      
      await mockClient.set(key, 'value1');
      await mockClient.set(key, 'value2');
      
      const result = await mockClient.get(key);
      expect(result).toBe('value2');
    });
  });

  describe('Operaciones con TTL - SETEX', () => {
    test('debe guardar valor con expiración', async () => {
      const key = 'test:ttl1';
      const value = 'expiring_value';
      
      await mockClient.setEx(key, 60, value);
      const result = await mockClient.get(key);
      
      expect(result).toBe(value);
    });

    test('debe expirar claves después del TTL', async () => {
      const key = 'test:ttl2';
      const value = 'short_lived';
      
      // Guardar con TTL de 1 segundo
      await mockClient.setEx(key, 1, value);
      
      // Verificar que existe inmediatamente
      const immediate = await mockClient.get(key);
      expect(immediate).toBe(value);
      
      // Esperar 1.5 segundos
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Verificar que expiró
      const afterExpiry = await mockClient.get(key);
      expect(afterExpiry).toBeNull();
    }, 10000); // Timeout de 10 segundos para este test

    test('debe manejar TTL de 0 segundos', async () => {
      const key = 'test:ttl3';
      
      await mockClient.setEx(key, 0, 'instant_expire');
      
      // Esperar un momento
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await mockClient.get(key);
      expect(result).toBeNull();
    });
  });

  describe('Operaciones de Eliminación - DEL', () => {
    test('debe eliminar una clave existente', async () => {
      const key = 'test:del1';
      
      await mockClient.set(key, 'to_delete');
      const deleted = await mockClient.del(key);
      
      expect(deleted).toBe(1);
      
      const result = await mockClient.get(key);
      expect(result).toBeNull();
    });

    test('debe retornar 0 al eliminar clave inexistente', async () => {
      const deleted = await mockClient.del('nonexistent:key');
      expect(deleted).toBe(0);
    });

    test('debe eliminar TTL al eliminar clave', async () => {
      const key = 'test:del2';
      
      await mockClient.setEx(key, 60, 'value');
      await mockClient.del(key);
      
      const exists = await mockClient.exists(key);
      expect(exists).toBe(0);
    });
  });

  describe('Verificación de Existencia - EXISTS', () => {
    test('debe retornar 1 para claves existentes', async () => {
      const key = 'test:exists1';
      
      await mockClient.set(key, 'value');
      const exists = await mockClient.exists(key);
      
      expect(exists).toBe(1);
    });

    test('debe retornar 0 para claves inexistentes', async () => {
      const exists = await mockClient.exists('nonexistent:key');
      expect(exists).toBe(0);
    });

    test('debe retornar 0 para claves expiradas', async () => {
      const key = 'test:exists2';
      
      await mockClient.setEx(key, 1, 'expiring');
      
      // Esperar expiración
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const exists = await mockClient.exists(key);
      expect(exists).toBe(0);
    }, 10000);
  });

  describe('Comandos para Rate Limiter - SENDCOMMAND', () => {
    test('debe incrementar contador con INCR', async () => {
      const key = 'test:counter';
      
      const result1 = await mockClient.sendCommand(['INCR', key]);
      expect(result1).toBe(1);
      
      const result2 = await mockClient.sendCommand(['INCR', key]);
      expect(result2).toBe(2);
      
      const result3 = await mockClient.sendCommand(['INCR', key]);
      expect(result3).toBe(3);
    });

    test('debe establecer expiración con PEXPIRE', async () => {
      const key = 'test:pexpire';
      
      await mockClient.set(key, 'value');
      const result = await mockClient.sendCommand(['PEXPIRE', key, 1000]);
      
      expect(result).toBe(1);
    });

    test('debe obtener TTL restante con PTTL', async () => {
      const key = 'test:pttl';
      
      await mockClient.setEx(key, 60, 'value');
      const ttl = await mockClient.sendCommand(['PTTL', key]);
      
      // TTL debe ser positivo y menor o igual a 60000ms
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60000);
    });

    test('debe retornar -2 para claves inexistentes en PTTL', async () => {
      const ttl = await mockClient.sendCommand(['PTTL', 'nonexistent:key']);
      expect(ttl).toBe(-2);
    });

    test('debe manejar comandos no implementados', async () => {
      // Espiar console.warn
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = await mockClient.sendCommand(['HSET', 'hash', 'field', 'value']);
      
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Comando no implementado: hset')
      );
      
      warnSpy.mockRestore();
    });
  });

  describe('Limpieza Automática de Claves Expiradas', () => {
    test('debe limpiar claves expiradas automáticamente', async () => {
      const key1 = 'test:cleanup1';
      const key2 = 'test:cleanup2';
      
      // Guardar con TTL corto
      await mockClient.setEx(key1, 1, 'value1');
      await mockClient.setEx(key2, 1, 'value2');
      
      // Esperar expiración + tiempo de limpieza
      await new Promise(resolve => setTimeout(resolve, 12000));
      
      // Verificar que fueron limpiadas
      const exists1 = await mockClient.exists(key1);
      const exists2 = await mockClient.exists(key2);
      
      expect(exists1).toBe(0);
      expect(exists2).toBe(0);
    }, 15000);
  });

  describe('Múltiples Operaciones Concurrentes', () => {
    test('debe manejar múltiples operaciones simultáneas', async () => {
      const operations = [];
      
      for (let i = 0; i < 100; i++) {
        operations.push(
          mockClient.set(`test:concurrent:${i}`, `value${i}`)
        );
      }
      
      await Promise.all(operations);
      
      // Verificar que todas se guardaron
      const verifications = [];
      for (let i = 0; i < 100; i++) {
        verifications.push(
          mockClient.get(`test:concurrent:${i}`)
        );
      }
      
      const results = await Promise.all(verifications);
      
      results.forEach((result, index) => {
        expect(result).toBe(`value${index}`);
      });
    });
  });

  describe('Método de Limpieza - _clearAll', () => {
    test('debe limpiar todo el almacenamiento', async () => {
      // Guardar varias claves
      await mockClient.set('key1', 'value1');
      await mockClient.set('key2', 'value2');
      await mockClient.setEx('key3', 60, 'value3');
      
      // Limpiar todo
      if (mockClient._clearAll) {
        mockClient._clearAll();
      }
      
      // Verificar que todo fue limpiado
      const result1 = await mockClient.get('key1');
      const result2 = await mockClient.get('key2');
      const result3 = await mockClient.get('key3');
      
      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toBeNull();
    });
  });
});
