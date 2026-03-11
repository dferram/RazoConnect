/**
 * Jest Configuration - Redis Smart Fallback Tests
 * 
 * Configuración específica para tests de Redis con cobertura optimizada.
 */

module.exports = {
  // Entorno de ejecución
  testEnvironment: 'node',

  // Patrón de archivos de test
  testMatch: [
    '**/tests/redis/**/*.test.js'
  ],

  // Archivos a incluir en coverage
  collectCoverageFrom: [
    'config/redisClient.js',
    'middlewares/rateLimiter.js',
    'utils/jwtHelper.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],

  // Umbrales de cobertura
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 90,
      statements: 90
    },
    './config/redisClient.js': {
      branches: 90,
      functions: 100,
      lines: 95,
      statements: 95
    }
  },

  // Reportes de cobertura
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'cobertura'
  ],

  // Directorio de cobertura
  coverageDirectory: 'coverage/redis',

  // Timeout por defecto (15 segundos)
  testTimeout: 15000,

  // Verbose output
  verbose: true,

  // Detectar memory leaks - Deshabilitado para tests de Redis
  detectLeaks: false,

  // Detectar archivos abiertos - Deshabilitado para tests de Redis
  detectOpenHandles: false,

  // Forzar salida después de tests
  forceExit: true,

  // Limpiar mocks automáticamente
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Setup global - NO usar el setup global que mockea redisClient
  setupFilesAfterEnv: ['./setup.js'],
  
  // Resetear mocks antes de cada test
  resetMocks: false,
  resetModules: false,

  // Transformaciones
  transform: {},

  // Ignorar transformaciones de node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(supertest)/)'
  ],

  // Variables de entorno para tests
  testEnvironmentOptions: {
    NODE_ENV: 'development'
  },

  // Máximo de workers (paralelización)
  maxWorkers: '50%',

  // Mostrar cada test individual
  displayName: {
    name: 'REDIS',
    color: 'cyan'
  }
};
