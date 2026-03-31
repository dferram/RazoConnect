/**
 * Jest Setup File - Configuración global para tests
 * Establece variables de entorno y mocks para servicios externos
 */

// Configurar NODE_ENV = test por defecto
process.env.NODE_ENV = 'test';

// Variables de entorno esenciales para tests
process.env.JWT_SECRET = 'test-secret-suficientemente-largo-32chars-jest-setup';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-suficientemente-largo-32chars-jest-setup';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.SESSION_SECRET = 'test-session-secret-suficientemente-largo-jest-setup';
process.env.FRONTEND_BASE_URL = 'https://test-domain.com';
process.env.BCRYPT_ROUNDS = '10';

// Mock credentials para servicios externos (evita throws en config)
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-api-key';
process.env.CLOUDINARY_API_SECRET = 'test-api-secret';
process.env.MP_ACCESS_TOKEN = 'test-mp-token-for-ci';

// Database config para tests
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'test_razoconnect';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_SSL = 'false';

// SMTP config para tests
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test_password';
process.env.SMTP_FROM = 'test@example.com';

// Redis config para tests
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = '';

// Mock de console methods para reducir ruido en tests
const originalConsole = { ...console };
beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
});

afterAll(() => {
  // Restaurar console original
  Object.assign(console, originalConsole);
});

// Timeout global para tests lentos
jest.setTimeout(30000);
