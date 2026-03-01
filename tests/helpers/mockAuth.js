const { generateToken } = require('../../utils/jwtHelper');

const mockCliente = (overrides = {}) => ({
  userId: 1,
  rol: 'cliente',
  tenant_id: 1,
  email: 'test@test.com',
  ...overrides
});

const mockAdmin = (overrides = {}) => ({
  userId: 10,
  rol: 'admin',
  tenant_id: 1,
  ...overrides
});

const tokenFor = (payload) => generateToken(payload, '1h');

module.exports = { mockCliente, mockAdmin, tokenFor };
