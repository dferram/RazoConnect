const {
  isValidEmail,
  isValidPhone,
  validateClienteRegistro,
  cleanPhone
} = require('../../../utils/validator');

describe('validator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isValidEmail', () => {
    it('debe retornar true para email válido', () => {
      expect(isValidEmail('test@ejemplo.com')).toBe(true);
    });

    it('debe retornar false para email sin dominio', () => {
      expect(isValidEmail('test@')).toBe(false);
    });

    it('debe retornar false para string vacío', () => {
      expect(isValidEmail('')).toBe(false);
    });

    it('debe retornar false para email sin arroba', () => {
      expect(isValidEmail('sinArroba.com')).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('debe retornar true para 10 dígitos', () => {
      expect(isValidPhone('5512345678')).toBe(true);
    });

    it('debe retornar false para número muy corto', () => {
      expect(isValidPhone('123')).toBe(false);
    });

    it('debe retornar true para número con espacios (debe limpiar)', () => {
      expect(isValidPhone('55 1234 5678')).toBe(true);
    });

    it('debe retornar false para texto con letras', () => {
      expect(isValidPhone('abc123')).toBe(false);
    });
  });

  describe('cleanPhone', () => {
    it('debe limpiar espacios, guiones y paréntesis', () => {
      expect(cleanPhone('(55) 1234-5678')).toBe('5512345678');
    });

    it('debe retornar string vacío para null', () => {
      expect(cleanPhone(null)).toBe('');
    });

    it('debe retornar string vacío para undefined', () => {
      expect(cleanPhone(undefined)).toBe('');
    });
  });

  describe('validateClienteRegistro', () => {
    it('debe retornar valid: true para datos completos y válidos', () => {
      const data = {
        Nombre: 'Juan',
        Apellido: 'Pérez',
        Email: 'juan@test.com',
        Password: 'password123'
      };

      const result = validateClienteRegistro(data);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('debe retornar error cuando falta el nombre', () => {
      const data = {
        Nombre: '',
        Apellido: 'Pérez',
        Email: 'juan@test.com',
        Password: 'password123'
      };

      const result = validateClienteRegistro(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('El nombre es requerido');
    });

    it('debe retornar error cuando el email es inválido', () => {
      const data = {
        Nombre: 'Juan',
        Apellido: 'Pérez',
        Email: 'email-invalido',
        Password: 'password123'
      };

      const result = validateClienteRegistro(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('email'))).toBe(true);
    });

    it('debe retornar error cuando el password es menor a 6 caracteres', () => {
      const data = {
        Nombre: 'Juan',
        Apellido: 'Pérez',
        Email: 'juan@test.com',
        Password: '12345'
      };

      const result = validateClienteRegistro(data);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('La contraseña debe tener al menos 6 caracteres');
    });
  });
});
