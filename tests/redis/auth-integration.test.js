/**
 * INTEGRATION TESTS: Sistema de Autenticación con Redis Smart Fallback
 * 
 * Verifica que el sistema de autenticación dual-token funcione
 * correctamente con el sistema de Smart Fallback de Redis.
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');

describe('Auth System - Redis Smart Fallback Integration', () => {
  const originalEnv = process.env.NODE_ENV;
  let redisModule;
  let jwtHelper;

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    jest.resetModules();
    
    redisModule = require('../../config/redisClient');
    jwtHelper = require('../../utils/jwtHelper');
    
    await redisModule.initRedisClient();
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalEnv;
    
    if (redisModule && redisModule.closeRedisConnection) {
      await redisModule.closeRedisConnection();
    }
  });

  describe('Generación de Tokens', () => {
    test('debe generar access token válido', () => {
      const payload = {
        id: 123,
        rol: 'cliente',
        tenant_id: 1,
        email: 'test@example.com'
      };

      const accessToken = jwtHelper.generateAccessToken(payload);
      
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(accessToken.split('.').length).toBe(3); // JWT tiene 3 partes
    });

    test('debe generar refresh token válido', () => {
      const payload = {
        id: 456,
        rol: 'agente',
        tenant_id: null,
        email: 'agente@example.com'
      };

      const refreshToken = jwtHelper.generateRefreshToken(payload);
      
      expect(refreshToken).toBeDefined();
      expect(typeof refreshToken).toBe('string');
      expect(refreshToken.split('.').length).toBe(3);
    });

    test('debe normalizar payload correctamente', () => {
      const rawPayload = {
        userId: 789,
        roles: ['admin'],
        tenantId: 2,
        email: 'admin@example.com'
      };

      const normalized = jwtHelper.normalizePayload(rawPayload);

      expect(normalized).toEqual({
        id: 789,
        rol: 'admin',
        tenant_id: 2,
        email: 'admin@example.com'
      });
    });
  });

  describe('Flujo Completo de Login', () => {
    test('debe guardar refresh token en Redis después de login', async () => {
      const userId = 100;
      const rol = 'cliente';
      const refreshToken = jwtHelper.generateRefreshToken({
        id: userId,
        rol,
        tenant_id: 1,
        email: 'cliente@test.com'
      });

      // Simular guardado de refresh token
      const saved = await redisModule.saveRefreshToken(
        userId,
        rol,
        refreshToken,
        30 * 24 * 60 * 60 // 30 días
      );

      expect(saved).toBe(true);

      // Verificar que se guardó
      const retrieved = await redisModule.getRefreshToken(userId, rol);
      expect(retrieved).toBe(refreshToken);
    });

    test('debe verificar existencia de sesión activa', async () => {
      const userId = 200;
      const rol = 'agente';
      const refreshToken = jwtHelper.generateRefreshToken({
        id: userId,
        rol,
        tenant_id: null,
        email: 'agente@test.com'
      });

      await redisModule.saveRefreshToken(userId, rol, refreshToken, 3600);

      const exists = await redisModule.refreshTokenExists(userId, rol);
      expect(exists).toBe(true);
    });
  });

  describe('Flujo de Logout', () => {
    test('debe eliminar refresh token al hacer logout', async () => {
      const userId = 300;
      const rol = 'admin';
      const refreshToken = jwtHelper.generateRefreshToken({
        id: userId,
        rol,
        tenant_id: 1,
        email: 'admin@test.com'
      });

      // Guardar token
      await redisModule.saveRefreshToken(userId, rol, refreshToken, 3600);

      // Hacer logout
      const deleted = await redisModule.deleteRefreshToken(userId, rol);
      expect(deleted).toBe(true);

      // Verificar que ya no existe
      const exists = await redisModule.refreshTokenExists(userId, rol);
      expect(exists).toBe(false);
    });

    test('debe agregar access token a blacklist al hacer logout', async () => {
      const payload = {
        id: 400,
        rol: 'cliente',
        tenant_id: 1,
        email: 'cliente@test.com',
        jti: 'unique_token_id_123'
      };

      const accessToken = jwtHelper.generateAccessToken(payload);

      // Agregar a blacklist
      const blacklisted = await redisModule.blacklistAccessToken(
        payload.jti,
        3600 // TTL del access token
      );

      expect(blacklisted).toBe(true);

      // Verificar que está en blacklist
      const isBlacklisted = await redisModule.isTokenBlacklisted(payload.jti);
      expect(isBlacklisted).toBe(true);
    });
  });

  describe('Flujo de Refresh Token', () => {
    test('debe renovar access token usando refresh token', async () => {
      const userId = 500;
      const rol = 'super_admin';
      
      // Generar refresh token inicial
      const refreshToken = jwtHelper.generateRefreshToken({
        id: userId,
        rol,
        tenant_id: 1,
        email: 'superadmin@test.com'
      });

      // Guardar en Redis
      await redisModule.saveRefreshToken(userId, rol, refreshToken, 3600);

      // Simular renovación: verificar que existe
      const exists = await redisModule.refreshTokenExists(userId, rol);
      expect(exists).toBe(true);

      // Generar nuevo access token
      const newAccessToken = jwtHelper.generateAccessToken({
        id: userId,
        rol,
        tenant_id: 1,
        email: 'superadmin@test.com'
      });

      expect(newAccessToken).toBeDefined();
    });

    test('debe rechazar refresh si token no existe en Redis', async () => {
      const userId = 600;
      const rol = 'cliente';

      const exists = await redisModule.refreshTokenExists(userId, rol);
      expect(exists).toBe(false);
    });
  });

  describe('Separación por Roles', () => {
    test('debe mantener tokens separados por rol', async () => {
      const userId = 700;

      // Guardar tokens para diferentes roles
      await redisModule.saveRefreshToken(userId, 'cliente', 'cliente_token', 3600);
      await redisModule.saveRefreshToken(userId, 'agente', 'agente_token', 3600);
      await redisModule.saveRefreshToken(userId, 'admin', 'admin_token', 3600);

      // Verificar que cada rol tiene su propio token
      const clienteToken = await redisModule.getRefreshToken(userId, 'cliente');
      const agenteToken = await redisModule.getRefreshToken(userId, 'agente');
      const adminToken = await redisModule.getRefreshToken(userId, 'admin');

      expect(clienteToken).toBe('cliente_token');
      expect(agenteToken).toBe('agente_token');
      expect(adminToken).toBe('admin_token');
    });

    test('debe eliminar solo el token del rol especificado', async () => {
      const userId = 800;

      await redisModule.saveRefreshToken(userId, 'cliente', 'cliente_token', 3600);
      await redisModule.saveRefreshToken(userId, 'admin', 'admin_token', 3600);

      // Eliminar solo token de cliente
      await redisModule.deleteRefreshToken(userId, 'cliente');

      // Verificar que cliente fue eliminado pero admin persiste
      const clienteExists = await redisModule.refreshTokenExists(userId, 'cliente');
      const adminExists = await redisModule.refreshTokenExists(userId, 'admin');

      expect(clienteExists).toBe(false);
      expect(adminExists).toBe(true);
    });
  });

  describe('Expiración de Tokens', () => {
    test('debe expirar refresh token después del TTL', async () => {
      const userId = 900;
      const rol = 'cliente';

      // Guardar con TTL corto
      await redisModule.saveRefreshToken(userId, rol, 'short_lived_token', 1);

      // Verificar inmediatamente
      const immediate = await redisModule.refreshTokenExists(userId, rol);
      expect(immediate).toBe(true);

      // Esperar expiración
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verificar que expiró
      const afterExpiry = await redisModule.refreshTokenExists(userId, rol);
      expect(afterExpiry).toBe(false);
    }, 10000);

    test('debe expirar access token en blacklist después del TTL', async () => {
      const tokenId = 'jti_expiring_123';

      // Agregar a blacklist con TTL corto
      await redisModule.blacklistAccessToken(tokenId, 1);

      // Verificar inmediatamente
      const immediate = await redisModule.isTokenBlacklisted(tokenId);
      expect(immediate).toBe(true);

      // Esperar expiración
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verificar que expiró
      const afterExpiry = await redisModule.isTokenBlacklisted(tokenId);
      expect(afterExpiry).toBe(false);
    }, 10000);
  });

  describe('Múltiples Sesiones Simultáneas', () => {
    test('debe soportar múltiples usuarios simultáneos', async () => {
      const users = [
        { id: 1001, rol: 'cliente', token: 'token_1001' },
        { id: 1002, rol: 'cliente', token: 'token_1002' },
        { id: 1003, rol: 'agente', token: 'token_1003' },
        { id: 1004, rol: 'admin', token: 'token_1004' }
      ];

      // Guardar todos los tokens
      await Promise.all(
        users.map(user => 
          redisModule.saveRefreshToken(user.id, user.rol, user.token, 3600)
        )
      );

      // Verificar que todos se guardaron correctamente
      const results = await Promise.all(
        users.map(user => 
          redisModule.getRefreshToken(user.id, user.rol)
        )
      );

      results.forEach((token, index) => {
        expect(token).toBe(users[index].token);
      });
    });
  });

  describe('Seguridad - Revocación Instantánea', () => {
    test('debe revocar sesión inmediatamente al eliminar refresh token', async () => {
      const userId = 2000;
      const rol = 'cliente';

      await redisModule.saveRefreshToken(userId, rol, 'revoke_test_token', 3600);

      // Verificar que existe
      let exists = await redisModule.refreshTokenExists(userId, rol);
      expect(exists).toBe(true);

      // Revocar
      await redisModule.deleteRefreshToken(userId, rol);

      // Verificar revocación instantánea
      exists = await redisModule.refreshTokenExists(userId, rol);
      expect(exists).toBe(false);
    });

    test('debe invalidar access token inmediatamente al agregarlo a blacklist', async () => {
      const tokenId = 'jti_revoke_test';

      // Agregar a blacklist
      await redisModule.blacklistAccessToken(tokenId, 3600);

      // Verificar invalidación instantánea
      const isBlacklisted = await redisModule.isTokenBlacklisted(tokenId);
      expect(isBlacklisted).toBe(true);
    });
  });

  describe('Compatibilidad con Modo Mock', () => {
    test('debe funcionar correctamente en modo desarrollo', () => {
      expect(redisModule.isUsingMock()).toBe(true);
      expect(redisModule.isRedisConnected()).toBe(true);
    });

    test('debe mantener funcionalidad completa en mock', async () => {
      const userId = 3000;
      const rol = 'admin';
      const token = 'mock_compatibility_token';

      // Todas las operaciones deben funcionar
      const saved = await redisModule.saveRefreshToken(userId, rol, token, 3600);
      expect(saved).toBe(true);

      const retrieved = await redisModule.getRefreshToken(userId, rol);
      expect(retrieved).toBe(token);

      const exists = await redisModule.refreshTokenExists(userId, rol);
      expect(exists).toBe(true);

      const deleted = await redisModule.deleteRefreshToken(userId, rol);
      expect(deleted).toBe(true);

      const afterDelete = await redisModule.getRefreshToken(userId, rol);
      expect(afterDelete).toBeNull();
    });
  });
});
