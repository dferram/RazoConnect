/**
 * INTEGRATION TESTS: Rate Limiter con Smart Fallback
 * 
 * Verifica que el rate limiter funcione correctamente
 * tanto con mock (desarrollo) como con Redis real (producción).
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const request = require('supertest');

describe('Rate Limiter - Smart Fallback Integration', () => {
  const originalEnv = process.env.NODE_ENV;
  let app;
  let server;

  beforeAll(async () => {
    // Configurar modo desarrollo
    process.env.NODE_ENV = 'development';
    
    // Limpiar cache de módulos
    jest.resetModules();
    
    // Importar y configurar app
    const express = require('express');
    const { globalLimiter, authLimiter } = require('../../middlewares/rateLimiter');
    
    app = express();
    app.use(express.json());
    
    // Ruta de prueba con rate limiter global
    app.get('/api/test/global', globalLimiter, (req, res) => {
      res.json({ success: true, message: 'Request successful' });
    });
    
    // Ruta de prueba con rate limiter de auth
    app.post('/api/test/auth', authLimiter, (req, res) => {
      res.json({ success: true, message: 'Auth successful' });
    });
    
    // Iniciar servidor
    server = app.listen(0); // Puerto aleatorio
  });

  afterAll(async () => {
    // Restaurar entorno
    process.env.NODE_ENV = originalEnv;
    
    // Cerrar servidor
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    
    // Cerrar conexión Redis
    const { closeRedisConnection } = require('../../config/redisClient');
    await closeRedisConnection();
  });

  describe('Rate Limiter Global', () => {
    test('debe permitir requests dentro del límite', async () => {
      const response = await request(app)
        .get('/api/test/global')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('debe incluir headers de rate limit', async () => {
      const response = await request(app)
        .get('/api/test/global')
        .expect(200);

      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
      expect(response.headers).toHaveProperty('ratelimit-reset');
    });

    test('debe decrementar contador en cada request', async () => {
      const response1 = await request(app).get('/api/test/global');
      const remaining1 = parseInt(response1.headers['ratelimit-remaining']);

      const response2 = await request(app).get('/api/test/global');
      const remaining2 = parseInt(response2.headers['ratelimit-remaining']);

      expect(remaining2).toBeLessThan(remaining1);
    });
  });

  describe('Rate Limiter de Autenticación', () => {
    test('debe permitir requests de auth dentro del límite', async () => {
      const response = await request(app)
        .post('/api/test/auth')
        .send({ username: 'test', password: 'test' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('debe tener límite más estricto que global', async () => {
      const globalResponse = await request(app).get('/api/test/global');
      const authResponse = await request(app).post('/api/test/auth');

      const globalLimit = parseInt(globalResponse.headers['ratelimit-limit']);
      const authLimit = parseInt(authResponse.headers['ratelimit-limit']);

      expect(authLimit).toBeLessThan(globalLimit);
    });
  });

  describe('Funcionamiento con Mock Redis', () => {
    test('debe usar MemoryStore en desarrollo', async () => {
      const { isUsingMock } = require('../../config/redisClient');
      expect(isUsingMock()).toBe(true);
    });

    test('debe mantener contadores en memoria', async () => {
      // Hacer varias requests
      const responses = [];
      for (let i = 0; i < 5; i++) {
        const res = await request(app).get('/api/test/global');
        responses.push(res);
      }

      // Verificar que los contadores disminuyen
      const remainings = responses.map(r => 
        parseInt(r.headers['ratelimit-remaining'])
      );

      for (let i = 1; i < remainings.length; i++) {
        expect(remainings[i]).toBeLessThanOrEqual(remainings[i - 1]);
      }
    });
  });

  describe('Manejo de IPs', () => {
    test('debe extraer IP correctamente', async () => {
      const response = await request(app)
        .get('/api/test/global')
        .set('X-Forwarded-For', '192.168.1.1')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('debe manejar formato IPv4-mapped IPv6', async () => {
      const response = await request(app)
        .get('/api/test/global')
        .set('X-Forwarded-For', '::ffff:192.168.1.1')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('debe manejar formato IP:PUERTO de Azure', async () => {
      const response = await request(app)
        .get('/api/test/global')
        .set('X-Forwarded-For', '192.168.1.1:12345')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Comportamiento de Fail-Open', () => {
    test('debe permitir requests si Redis falla', async () => {
      // Simular fallo de Redis cerrando la conexión
      const { closeRedisConnection } = require('../../config/redisClient');
      await closeRedisConnection();

      // Request debe pasar (fail-open)
      const response = await request(app)
        .get('/api/test/global')
        .expect(200);

      expect(response.body.success).toBe(true);

      // Reinicializar Redis
      const { initRedisClient } = require('../../config/redisClient');
      await initRedisClient();
    });
  });
});

describe('Rate Limiter - Helpers', () => {
  const { _getCleanIp } = require('../../middlewares/rateLimiter');

  describe('getCleanIp', () => {
    test('debe extraer IP de formato IPv4 simple', () => {
      const req = { ip: '192.168.1.1' };
      const cleanIp = _getCleanIp(req);
      expect(cleanIp).toBe('192.168.1.1');
    });

    test('debe extraer IP de formato IPv4-mapped IPv6', () => {
      const req = { ip: '::ffff:192.168.1.1' };
      const cleanIp = _getCleanIp(req);
      expect(cleanIp).toBe('192.168.1.1');
    });

    test('debe extraer IP de formato IP:PUERTO', () => {
      const req = { ip: '192.168.1.1:12345' };
      const cleanIp = _getCleanIp(req);
      expect(cleanIp).toBe('192.168.1.1');
    });

    test('debe manejar IP desconocida', () => {
      const req = { ip: null, connection: {} };
      const cleanIp = _getCleanIp(req);
      expect(cleanIp).toBe('unknown');
    });

    test('debe usar connection.remoteAddress como fallback', () => {
      const req = { 
        ip: null, 
        connection: { remoteAddress: '10.0.0.1' } 
      };
      const cleanIp = _getCleanIp(req);
      expect(cleanIp).toBe('10.0.0.1');
    });
  });
});
