const { generateToken, verifyToken, generateAccessToken, verifyAccessToken } = require('../../../utils/jwtHelper');

describe('jwtHelper', () => {
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-suficientemente-largo-32chars';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-suficientemente-largo-32chars';
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('debe retornar un string con 3 partes separadas por "."', () => {
      const payload = { userId: 1, rol: 'cliente' };
      const token = generateToken(payload);
      
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('debe generar un token válido con payload completo', () => {
      const payload = { userId: 1, rol: 'cliente', tenant_id: 1 };
      const token = generateToken(payload);
      
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });
  });

  describe('verifyToken', () => {
    it('debe retornar el payload original con token válido', () => {
      const payload = { userId: 1, rol: 'cliente', tenant_id: 1 };
      const token = generateToken(payload);
      
      const decoded = verifyToken(token);
      
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.rol).toBe(payload.rol);
      expect(decoded.tenant_id).toBe(payload.tenant_id);
    });

    it('debe lanzar un Error con mensaje "Token inválido o expirado" cuando el token es inválido', () => {
      expect(() => {
        verifyToken('token-invalido');
      }).toThrow('Token inválido o expirado');
    });

    it('debe lanzar un Error cuando el token está expirado', () => {
      const payload = { userId: 1, rol: 'cliente' };
      const tokenExpirado = generateToken(payload, '0s');
      
      return new Promise((resolve) => {
        setTimeout(() => {
          expect(() => {
            verifyToken(tokenExpirado);
          }).toThrow('Token inválido o expirado');
          resolve();
        }, 100);
      });
    });
  });

  describe('generateAccessToken', () => {
    it('debe generar un token válido con payload normalizado', () => {
      const payload = { id: 1, rol: 'cliente', tenant_id: 1, email: 'test@test.com' };
      const token = generateAccessToken(payload);
      
      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3);
    });

    it('debe normalizar el payload correctamente', () => {
      const payload = { userId: 1, rol: 'cliente', tenant_id: 1, email: 'test@test.com' };
      const token = generateAccessToken(payload);
      const decoded = verifyAccessToken(token);
      
      expect(decoded.id).toBe(1);
      expect(decoded.rol).toBe('cliente');
      expect(decoded.tenant_id).toBe(1);
      expect(decoded.email).toBe('test@test.com');
    });
  });

  describe('verifyAccessToken', () => {
    it('debe verificar y decodificar un access token válido', () => {
      const payload = { id: 1, rol: 'admin', tenant_id: 1, email: 'admin@test.com' };
      const token = generateAccessToken(payload);
      
      const decoded = verifyAccessToken(token);
      
      expect(decoded.id).toBe(payload.id);
      expect(decoded.rol).toBe(payload.rol);
      expect(decoded.tenant_id).toBe(payload.tenant_id);
    });

    it('debe lanzar un Error cuando el access token es inválido', () => {
      expect(() => {
        verifyAccessToken('token-invalido-12345');
      }).toThrow('Access token inválido o expirado');
    });
  });
});
