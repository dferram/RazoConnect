// Mock de la base de datos
jest.mock('../db', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn()
  };

  return {
    query: jest.fn(),
    pool: {
      connect: jest.fn().mockResolvedValue(mockClient)
    },
    // Para que pool.connect() funcione directamente (bug en remisionesController)
    connect: jest.fn().mockResolvedValue(mockClient),
    getClient: jest.fn().mockResolvedValue(mockClient)
  };
});

// Mock de Redis
jest.mock('../config/redisClient', () => ({
  initRedisClient: jest.fn().mockResolvedValue(undefined),
  closeRedisConnection: jest.fn().mockResolvedValue(undefined),
  getRedisClient: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn()
  }))
}));

// Mock de rate limiter — ACTUALIZADO con todos los limiters del Sprint 13
jest.mock('../middlewares/rateLimiter', () => ({
  authLimiter: (req, res, next) => next(),
  registerLimiter: (req, res, next) => next(),
  passwordResetLimiter: (req, res, next) => next(),
  globalLimiter: (req, res, next) => next(),
  tenantRateLimiter: (req, res, next) => next(),
  heavyOperationLimiter: (req, res, next) => next(),
}));

// Mock de secrets validator
jest.mock('../utils/secretsValidator', () => ({
  runSecurityAudit: jest.fn()
}));

// Mock de cron jobs
jest.mock('../cron/dailyMaintenance', () => ({
  scheduleDailyMaintenance: jest.fn()
}));

// Mock de cron debtExpiration
jest.mock('../cron/debtExpirationService', () => ({
  scheduleDebtExpirationCheck: jest.fn()
}));

// Mock de servicios de email
jest.mock('../services/emailService', () => ({
  sendTemplatedEmail: jest.fn().mockResolvedValue(true),
  sendEmail: jest.fn().mockResolvedValue(true)
}));

// Mock de servicios de notificaciones
jest.mock('../services/notificacionesService', () => ({
  crearNotificacion: jest.fn().mockResolvedValue({ notificacionId: 1 })
}));

// Configurar variables de entorno para tests
process.env.JWT_SECRET = 'test-secret-suficientemente-largo-32chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-suficientemente-largo-32chars';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.SESSION_SECRET = 'test-session-secret-suficientemente-largo';
process.env.NODE_ENV = 'test';
process.env.FRONTEND_BASE_URL = 'https://tudominio.com';
process.env.BCRYPT_ROUNDS = '10';

// Cloudinary mock credentials (para evitar errores en tests)
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'test-cloud';
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || 'test-api-key';
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'test-api-secret';

// Mercado Pago mock credentials (para evitar errores en tests)
process.env.MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || 'test-mp-token-for-ci';
