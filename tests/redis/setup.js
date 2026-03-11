/**
 * Jest Setup - Redis Smart Fallback Tests
 * 
 * Configuración global que se ejecuta antes de todos los tests.
 */

// IMPORTANTE: Desactivar el mock de redisClient del setup global
jest.unmock('../../config/redisClient');

// Configurar variables de entorno para tests
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_only_do_not_use_in_production';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_key_for_testing_only_do_not_use_in_production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';

// Timeout global para tests con TTL
jest.setTimeout(15000);

// Limpiar después de cada test
afterEach(() => {
  jest.clearAllTimers();
});
