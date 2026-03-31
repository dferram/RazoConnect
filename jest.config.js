module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'utils/**/*.js',
    'middlewares/**/*.js',
    'controllers/**/*.js',
    '!**/node_modules/**'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js', '<rootDir>/tests/setup.js'],
  testTimeout: 10000
};
