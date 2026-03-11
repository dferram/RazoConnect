/**
 * INTEGRATION TESTS: Redis Smart Fallback System
 * 
 * Verifica que el sistema de fallback funcione correctamente
 * alternando entre mock y Redis real según NODE_ENV.
 */

const { describe, test, expect, beforeAll, afterAll, jest } = require('@jest/globals');

describe('Redis Smart Fallback System - Integration Tests', () => {
  const originalEnv = process.env.NODE_ENV;

  afterAll(() => {
    // Restaurar entorno original
    process.env.NODE_ENV = originalEnv;
  });

  describe('Modo Desarrollo (Mock)', () => {
    let redisModule;

    beforeAll(async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      redisModule = require('../../config/redisClient');
      await redisModule.initRedisClient();
    });

    afterAll(async () => {
      if (redisModule && redisModule.closeRedisConnection) {
        await redisModule.closeRedisConnection();
      }
    });

    test('debe usar mock en modo desarrollo', () => {
      expect(redisModule.isUsingMock()).toBe(true);
    });

    test('debe estar conectado', () => {
      expect(redisModule.isRedisConnected()).toBe(true);
    });

    test('debe retornar cliente válido', async () => {
      const client = await redisModule.getRedisClient();
      expect(client).toBeDefined();
      expect(client).not.toBeNull();
    });
  });

  describe('Funciones de Negocio - Refresh Tokens', () => {
    let redisModule;

    beforeAll(async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      redisModule = require('../../config/redisClient');
      await redisModule.initRedisClient();
    });

    afterAll(async () => {
      if (redisModule && redisModule.closeRedisConnection) {
        await redisModule.closeRedisConnection();
      }
    });

    test('debe guardar refresh token', async () => {
      const result = await redisModule.saveRefreshToken(
        123,
        'cliente',
        'test_refresh_token',
        3600
      );
      expect(result).toBe(true);
    });

    test('debe recuperar refresh token guardado', async () => {
      await redisModule.saveRefreshToken(
        456,
        'agente',
        'agente_token_xyz',
        3600
      );

      const token = await redisModule.getRefreshToken(456, 'agente');
      expect(token).toBe('agente_token_xyz');
    });

    test('debe verificar existencia de refresh token', async () => {
      await redisModule.saveRefreshToken(
        789,
        'admin',
        'admin_token_abc',
        3600
      );

      const exists = await redisModule.refreshTokenExists(789, 'admin');
      expect(exists).toBe(true);
    });

    test('debe eliminar refresh token', async () => {
      await redisModule.saveRefreshToken(
        999,
        'super_admin',
        'super_token',
        3600
      );

      const deleted = await redisModule.deleteRefreshToken(999, 'super_admin');
      expect(deleted).toBe(true);

      const token = await redisModule.getRefreshToken(999, 'super_admin');
      expect(token).toBeNull();
    });

    test('debe retornar null para token inexistente', async () => {
      const token = await redisModule.getRefreshToken(99999, 'cliente');
      expect(token).toBeNull();
    });

    test('debe retornar false para token inexistente en exists', async () => {
      const exists = await redisModule.refreshTokenExists(99999, 'cliente');
      expect(exists).toBe(false);
    });
  });

  describe('Funciones de Negocio - Blacklist de Tokens', () => {
    let redisModule;

    beforeAll(async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      redisModule = require('../../config/redisClient');
      await redisModule.initRedisClient();
    });

    afterAll(async () => {
      if (redisModule && redisModule.closeRedisConnection) {
        await redisModule.closeRedisConnection();
      }
    });

    test('debe agregar token a blacklist', async () => {
      const result = await redisModule.blacklistAccessToken('jti_123', 3600);
      expect(result).toBe(true);
    });

    test('debe verificar si token está en blacklist', async () => {
      await redisModule.blacklistAccessToken('jti_456', 3600);

      const isBlacklisted = await redisModule.isTokenBlacklisted('jti_456');
      expect(isBlacklisted).toBe(true);
    });

    test('debe retornar false para token no blacklisted', async () => {
      const isBlacklisted = await redisModule.isTokenBlacklisted('jti_nonexistent');
      expect(isBlacklisted).toBe(false);
    });

    test('debe respetar TTL en blacklist', async () => {
      await redisModule.blacklistAccessToken('jti_short', 1);

      // Verificar inmediatamente
      const immediate = await redisModule.isTokenBlacklisted('jti_short');
      expect(immediate).toBe(true);

      // Esperar expiración
      await new Promise(resolve => setTimeout(resolve, 1500));

      const afterExpiry = await redisModule.isTokenBlacklisted('jti_short');
      expect(afterExpiry).toBe(false);
    }, 10000);

    test('debe usar caché local para blacklist', async () => {
      const tokenId = 'jti_cached';
      
      // Primera llamada: guarda en Redis y caché local
      await redisModule.blacklistAccessToken(tokenId, 3600);
      await redisModule.isTokenBlacklisted(tokenId);

      // Segunda llamada: debe usar caché local (más rápido)
      const start = Date.now();
      const result = await redisModule.isTokenBlacklisted(tokenId);
      const duration = Date.now() - start;

      expect(result).toBe(true);
      expect(duration).toBeLessThan(10); // Debe ser casi instantáneo
    });
  });

  describe('Funciones de Negocio - Hybrid Cache', () => {
    let redisModule;

    beforeAll(async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      redisModule = require('../../config/redisClient');
      await redisModule.initRedisClient();
    });

    afterAll(async () => {
      if (redisModule && redisModule.closeRedisConnection) {
        await redisModule.closeRedisConnection();
      }
    });

    test('debe ejecutar fetchFunction si no hay caché', async () => {
      const fetchFunction = jest.fn(async () => ({ data: 'fresh_data' }));

      const result = await redisModule.getOrSetCache(
        'test:cache:1',
        fetchFunction,
        300
      );

      expect(result).toEqual({ data: 'fresh_data' });
      expect(fetchFunction).toHaveBeenCalledTimes(1);
    });

    test('debe usar caché en segunda llamada', async () => {
      const fetchFunction = jest.fn(async () => ({ data: 'cached_data' }));

      // Primera llamada
      await redisModule.getOrSetCache('test:cache:2', fetchFunction, 300);

      // Segunda llamada (debe usar caché)
      const result = await redisModule.getOrSetCache('test:cache:2', fetchFunction, 300);

      expect(result).toEqual({ data: 'cached_data' });
      expect(fetchFunction).toHaveBeenCalledTimes(1); // Solo una vez
    });

    test('debe invalidar caché correctamente', async () => {
      const fetchFunction = jest.fn(async () => ({ data: 'invalidated_data' }));

      // Guardar en caché
      await redisModule.getOrSetCache('test:cache:3', fetchFunction, 300);

      // Invalidar
      await redisModule.invalidateCache('test:cache:3');

      // Debe ejecutar fetchFunction nuevamente
      await redisModule.getOrSetCache('test:cache:3', fetchFunction, 300);

      expect(fetchFunction).toHaveBeenCalledTimes(2);
    });
  });

  describe('Estructura de Claves Redis', () => {
    let redisModule;

    beforeAll(async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      redisModule = require('../../config/redisClient');
      await redisModule.initRedisClient();
    });

    afterAll(async () => {
      if (redisModule && redisModule.closeRedisConnection) {
        await redisModule.closeRedisConnection();
      }
    });

    test('debe usar formato correcto para refresh tokens', async () => {
      const client = await redisModule.getRedisClient();
      
      await redisModule.saveRefreshToken(123, 'cliente', 'token_123', 3600);
      
      // Verificar que la clave sigue el formato esperado
      const token = await client.get('refresh_token:cliente:123');
      expect(token).toBe('token_123');
    });

    test('debe usar formato correcto para blacklist', async () => {
      const client = await redisModule.getRedisClient();
      
      await redisModule.blacklistAccessToken('jti_format_test', 3600);
      
      // Verificar formato de clave
      const exists = await client.exists('blacklist:jti_format_test');
      expect(exists).toBe(1);
    });

    test('debe separar tokens por rol', async () => {
      await redisModule.saveRefreshToken(100, 'cliente', 'cliente_token', 3600);
      await redisModule.saveRefreshToken(100, 'agente', 'agente_token', 3600);
      await redisModule.saveRefreshToken(100, 'admin', 'admin_token', 3600);

      const clienteToken = await redisModule.getRefreshToken(100, 'cliente');
      const agenteToken = await redisModule.getRefreshToken(100, 'agente');
      const adminToken = await redisModule.getRefreshToken(100, 'admin');

      expect(clienteToken).toBe('cliente_token');
      expect(agenteToken).toBe('agente_token');
      expect(adminToken).toBe('admin_token');
    });
  });

  describe('Manejo de Errores', () => {
    let redisModule;

    beforeAll(async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      redisModule = require('../../config/redisClient');
      await redisModule.initRedisClient();
    });

    afterAll(async () => {
      if (redisModule && redisModule.closeRedisConnection) {
        await redisModule.closeRedisConnection();
      }
    });

    test('debe manejar errores en saveRefreshToken', async () => {
      // Espiar console.error
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Simular error pasando parámetros inválidos
      const result = await redisModule.saveRefreshToken(null, null, null);

      expect(result).toBe(false);
      
      errorSpy.mockRestore();
    });

    test('debe manejar errores en getRefreshToken', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await redisModule.getRefreshToken(null, null);

      expect(result).toBeNull();
      
      errorSpy.mockRestore();
    });

    test('debe manejar errores en hybrid cache', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const fetchFunction = async () => {
        throw new Error('Fetch error');
      };

      // Debe ejecutar fetchFunction y propagar el error
      await expect(
        redisModule.getOrSetCache('test:error', fetchFunction, 300)
      ).rejects.toThrow('Fetch error');
      
      errorSpy.mockRestore();
    });
  });

  describe('Limpieza de Recursos', () => {
    test('debe cerrar conexión correctamente', async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const redisModule = require('../../config/redisClient');
      
      await redisModule.initRedisClient();
      expect(redisModule.isRedisConnected()).toBe(true);

      await redisModule.closeRedisConnection();
      expect(redisModule.isRedisConnected()).toBe(false);
    });

    test('debe limpiar caché local', async () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const redisModule = require('../../config/redisClient');
      
      await redisModule.initRedisClient();
      
      // Guardar en caché
      const fetchFunction = async () => ({ data: 'test' });
      await redisModule.getOrSetCache('test:flush', fetchFunction, 300);

      // Limpiar caché
      redisModule.flushLocalCache();

      // Debe ejecutar fetchFunction nuevamente
      await redisModule.getOrSetCache('test:flush', fetchFunction, 300);
      
      await redisModule.closeRedisConnection();
    });
  });
});
