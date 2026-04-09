module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'utils/**/*.js',
    'middlewares/**/*.js',
    'controllers/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js', '<rootDir>/tests/setup.js'],
  testTimeout: 10000,

  // Coverage thresholds configurados
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 60,
      functions: 60,
      lines: 60
    },
    './services/': {
      statements: 85,
      branches: 80,
      functions: 85,
      lines: 85
    },
    './controllers/': {
      statements: 50,
      branches: 45,
      functions: 50,
      lines: 50
    },
    './middlewares/': {
      statements: 70,
      branches: 65,
      functions: 70,
      lines: 70
    },
    './utils/': {
      statements: 65,
      branches: 60,
      functions: 65,
      lines: 65
    }
  }
};
