/**
 * Tests unitarios para middlewares/rateLimiter.js
 * Verifica que los limiters estén correctamente exportados y sean funciones middleware válidas
 */

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    sendCommand: jest.fn(),
  }))
}));

jest.mock('express-rate-limit', () => ({
  rateLimit: jest.fn(() => (req, res, next) => next())
}));

jest.mock('rate-limit-redis', () => ({
  RedisStore: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('rateLimiter', () => {

  describe('exportaciones del módulo', () => {
    it('debe exportar globalLimiter', () => {
      const { globalLimiter } = require('../../../middlewares/rateLimiter');
      expect(globalLimiter).toBeDefined();
      expect(typeof globalLimiter).toBe('function');
    });

    it('debe exportar authLimiter', () => {
      const { authLimiter } = require('../../../middlewares/rateLimiter');
      expect(authLimiter).toBeDefined();
      expect(typeof authLimiter).toBe('function');
    });

    it('debe exportar tenantRateLimiter', () => {
      const { tenantRateLimiter } = require('../../../middlewares/rateLimiter');
      expect(tenantRateLimiter).toBeDefined();
      expect(typeof tenantRateLimiter).toBe('function');
    });

    it('debe exportar heavyOperationLimiter', () => {
      const { heavyOperationLimiter } = require('../../../middlewares/rateLimiter');
      expect(heavyOperationLimiter).toBeDefined();
      expect(typeof heavyOperationLimiter).toBe('function');
    });

    it('debe exportar registerLimiter', () => {
      const { registerLimiter } = require('../../../middlewares/rateLimiter');
      expect(registerLimiter).toBeDefined();
      expect(typeof registerLimiter).toBe('function');
    });

    it('debe exportar passwordResetLimiter', () => {
      const { passwordResetLimiter } = require('../../../middlewares/rateLimiter');
      expect(passwordResetLimiter).toBeDefined();
      expect(typeof passwordResetLimiter).toBe('function');
    });
  });

  describe('funcionalidad de middleware', () => {
    it('globalLimiter debe funcionar como middleware Express', () => {
      const { globalLimiter } = require('../../../middlewares/rateLimiter');
      const req = {};
      const res = {};
      const next = jest.fn();
      
      globalLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('authLimiter debe funcionar como middleware Express', () => {
      const { authLimiter } = require('../../../middlewares/rateLimiter');
      const req = {};
      const res = {};
      const next = jest.fn();
      
      authLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('tenantRateLimiter debe funcionar como middleware Express', () => {
      const { tenantRateLimiter } = require('../../../middlewares/rateLimiter');
      const req = {};
      const res = {};
      const next = jest.fn();
      
      tenantRateLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('heavyOperationLimiter debe funcionar como middleware Express', () => {
      const { heavyOperationLimiter } = require('../../../middlewares/rateLimiter');
      const req = {};
      const res = {};
      const next = jest.fn();
      
      heavyOperationLimiter(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

});
