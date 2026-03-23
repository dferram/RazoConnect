/**
 * INTEGRATION TESTS: Rate Limiter con Smart Fallback
 * 
 * Verifica que los comandos de Redis usados por rate-limit-redis
 * funcionen correctamente con el mock client.
 */

// Forzar modo desarrollo ANTES de cualquier import
process.env.NODE_ENV = 'development';

const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const redisModule = require('../../config/redisClient');

describe.skip('Rate Limiter - Redis Commands Integration', () => {
  const originalEnv = process.env.NODE_ENV;
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
    
    // Restaurar entorno
    process.env.NODE_ENV = originalEnv;
  });

  describe('Comandos INCR para Rate Limiting', () => {
    test('debe incrementar contador correctamente', async () => {
      const key = 'rl:192.168.1.1';
      
      const count1 = await mockClient.sendCommand(['INCR', key]);
      expect(count1).toBe(1);
      
      const count2 = await mockClient.sendCommand(['INCR', key]);
      expect(count2).toBe(2);
      
      const count3 = await mockClient.sendCommand(['INCR', key]);
      expect(count3).toBe(3);
    });

    test('debe mantener contadores separados por IP', async () => {
      const ip1 = 'rl:192.168.1.1';
      const ip2 = 'rl:192.168.1.2';
      
      await mockClient.sendCommand(['INCR', ip1]);
      await mockClient.sendCommand(['INCR', ip1]);
      
      await mockClient.sendCommand(['INCR', ip2]);
      
      const count1 = await mockClient.sendCommand(['INCR', ip1]);
      const count2 = await mockClient.sendCommand(['INCR', ip2]);
      
      expect(count1).toBe(3);
      expect(count2).toBe(2);
    });
  });

  describe('Comandos PEXPIRE para TTL', () => {
    test('debe establecer expiración en milisegundos', async () => {
      const key = 'rl:test';
      
      await mockClient.set(key, '5');
      const result = await mockClient.sendCommand(['PEXPIRE', key, 1000]);
      
      expect(result).toBe(1);
    });

    test('debe expirar clave después del TTL', async () => {
      const key = 'rl:expiring';
      
      await mockClient.set(key, '10');
      await mockClient.sendCommand(['PEXPIRE', key, 500]);
      
      // Verificar que existe
      const exists1 = await mockClient.exists(key);
      expect(exists1).toBe(1);
      
      // Esperar expiración
      await new Promise(resolve => setTimeout(resolve, 600));
      
      const exists2 = await mockClient.exists(key);
      expect(exists2).toBe(0);
    });
  });

  describe('Comandos PTTL para verificar tiempo restante', () => {
    test('debe retornar TTL en milisegundos', async () => {
      const key = 'rl:ttl-test';
      
      await mockClient.setEx(key, 60, 'value');
      const ttl = await mockClient.sendCommand(['PTTL', key]);
      
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60000);
    });

    test('debe retornar -2 para claves inexistentes', async () => {
      const ttl = await mockClient.sendCommand(['PTTL', 'nonexistent']);
      expect(ttl).toBe(-2);
    });

    test('debe decrementar TTL con el tiempo', async () => {
      const key = 'rl:decrement';
      
      await mockClient.setEx(key, 5, 'value');
      const ttl1 = await mockClient.sendCommand(['PTTL', key]);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const ttl2 = await mockClient.sendCommand(['PTTL', key]);
      
      expect(ttl2).toBeLessThan(ttl1);
    });
  });

  describe('Simulación de Rate Limiting', () => {
    test('debe simular ventana deslizante de rate limiting', async () => {
      const ip = '192.168.1.100';
      const key = `rl:${ip}`;
      const limit = 5;
      const windowMs = 1000;
      
      // Simular múltiples requests
      const requests = [];
      for (let i = 0; i < 7; i++) {
        const count = await mockClient.sendCommand(['INCR', key]);
        requests.push(count);
        
        if (i === 0) {
          // Establecer TTL en el primer request
          await mockClient.sendCommand(['PEXPIRE', key, windowMs]);
        }
      }
      
      // Verificar que los primeros 5 están dentro del límite
      expect(requests.slice(0, 5).every(c => c <= limit)).toBe(true);
      
      // Los últimos 2 exceden el límite
      expect(requests[5]).toBeGreaterThan(limit);
      expect(requests[6]).toBeGreaterThan(limit);
    });

    test('debe resetear contador después de expiración', async () => {
      const key = 'rl:reset-test';
      
      // Incrementar varias veces
      await mockClient.sendCommand(['INCR', key]);
      await mockClient.sendCommand(['INCR', key]);
      await mockClient.sendCommand(['INCR', key]);
      await mockClient.sendCommand(['PEXPIRE', key, 500]);
      
      const count1 = await mockClient.sendCommand(['INCR', key]);
      expect(count1).toBe(4);
      
      // Esperar expiración
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Verificar que la clave expiró
      const exists = await mockClient.exists(key);
      expect(exists).toBe(0);
      
      // Debe empezar de nuevo en 1
      const count2 = await mockClient.sendCommand(['INCR', key]);
      expect(count2).toBe(1);
    });
  });

  describe('Compatibilidad con MemoryStore', () => {
    test('debe funcionar en modo desarrollo', () => {
      expect(redisModule.isUsingMock()).toBe(true);
    });

    test('debe mantener estado en memoria', async () => {
      const key1 = 'rl:state1';
      const key2 = 'rl:state2';
      
      await mockClient.sendCommand(['INCR', key1]);
      await mockClient.sendCommand(['INCR', key2]);
      await mockClient.sendCommand(['INCR', key1]);
      
      const val1 = await mockClient.get(key1);
      const val2 = await mockClient.get(key2);
      
      expect(val1).toBe('2');
      expect(val2).toBe('1');
    });
  });
});
