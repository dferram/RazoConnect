const { validateLogin } = require('../../../utils/validator');
const bcrypt = require('bcryptjs');

describe('Auth Routes Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Validación de Login', () => {
    it('debe validar correctamente credenciales con email y password', () => {
      const result = validateLogin({
        Email: 'test@test.com',
        Password: 'password123'
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('debe retornar error cuando falta el email', () => {
      const result = validateLogin({
        Email: '',
        Password: 'password123'
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('debe retornar error cuando falta el password', () => {
      const result = validateLogin({
        Email: 'test@test.com',
        Password: ''
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Bcrypt Password Hashing', () => {
    it('debe hashear y verificar contraseñas correctamente', async () => {
      const password = 'password123';
      const hash = await bcrypt.hash(password, 10);
      
      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });

    it('debe rechazar contraseñas incorrectas', async () => {
      const password = 'password123';
      const wrongPassword = 'wrongpassword';
      const hash = await bcrypt.hash(password, 10);
      
      const isValid = await bcrypt.compare(wrongPassword, hash);
      expect(isValid).toBe(false);
    });
  });
});
