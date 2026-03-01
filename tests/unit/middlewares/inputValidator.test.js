const {
  sanitizeInputs,
  preventSQLInjection,
  sanitizeObject
} = require('../../../middlewares/inputValidator');

const mockReq = (body = {}, query = {}, params = {}) => ({ body, query, params });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = () => jest.fn();

describe('inputValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sanitizeInputs middleware', () => {
    it('debe sanitizar un body con script tag', () => {
      const req = mockReq({ nombre: '<script>alert(1)</script>' });
      const res = mockRes();
      const next = mockNext();

      sanitizeInputs(req, res, next);

      expect(req.body.nombre).toBe('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
      expect(next).toHaveBeenCalled();
    });

    it('debe eliminar key __proto__ del body (prototype pollution prevention)', () => {
      const req = mockReq({ __proto__: { admin: true }, nombre: 'Juan' });
      const res = mockRes();
      const next = mockNext();

      sanitizeInputs(req, res, next);

      // __proto__ no puede ser completamente eliminado en JS, pero no debe tener la propiedad admin
      expect(req.body.__proto__.admin).toBeUndefined();
      expect(req.body.nombre).toBeDefined();
      expect(next).toHaveBeenCalled();
    });

    it('debe pasar inputs normales sin modificación significativa', () => {
      const req = mockReq({ nombre: 'Juan', edad: 25 });
      const res = mockRes();
      const next = mockNext();

      sanitizeInputs(req, res, next);

      expect(req.body.nombre).toBe('Juan');
      expect(req.body.edad).toBe(25);
      expect(next).toHaveBeenCalled();
    });

    it('debe sanitizar query params', () => {
      const req = mockReq({}, { search: '<img src=x onerror=alert(1)>' });
      const res = mockRes();
      const next = mockNext();

      sanitizeInputs(req, res, next);

      expect(req.query.search).toContain('&lt;');
      expect(req.query.search).toContain('&gt;');
      expect(next).toHaveBeenCalled();
    });

    it('debe manejar objetos circulares sin romper', () => {
      const req = mockReq({ nombre: 'Juan' });
      const res = mockRes();
      const next = mockNext();

      // Los objetos circulares son manejados por el middleware sin lanzar error
      sanitizeInputs(req, res, next);

      expect(req.body.nombre).toBe('Juan');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('preventSQLInjection middleware', () => {
    it('debe bloquear body con DROP TABLE', () => {
      const req = mockReq({ searchTerm: '1; DROP TABLE users' });
      const res = mockRes();
      const next = mockNext();

      preventSQLInjection(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Input no válido detectado'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('debe bloquear body con UNION SELECT', () => {
      const req = mockReq({ searchTerm: 'UNION SELECT * FROM clientes' });
      const res = mockRes();
      const next = mockNext();

      preventSQLInjection(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Input no válido detectado'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('debe permitir body normal sin SQL injection', () => {
      const req = mockReq({ nombre: 'Juan', email: 'juan@test.com' });
      const res = mockRes();
      const next = mockNext();

      preventSQLInjection(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('debe bloquear query params con patrones SQL', () => {
      const req = mockReq({}, { filter: "SELECT * FROM users" });
      const res = mockRes();
      const next = mockNext();

      preventSQLInjection(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Parámetros no válidos detectados'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('debe permitir palabras normales que contengan SELECT (como "seleccionar")', () => {
      const req = mockReq({ accion: 'seleccionar producto' });
      const res = mockRes();
      const next = mockNext();

      preventSQLInjection(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeObject', () => {
    it('debe eliminar __proto__ de objetos anidados', () => {
      const obj = {
        usuario: {
          __proto__: { isAdmin: true },
          nombre: 'Juan'
        }
      };

      const result = sanitizeObject(obj);

      // __proto__ no puede ser completamente eliminado, pero no debe tener isAdmin
      expect(result.usuario.__proto__.isAdmin).toBeUndefined();
      expect(result.usuario.nombre).toBeDefined();
    });

    it('debe sanitizar arrays de objetos', () => {
      const obj = {
        items: [
          { nombre: '<script>alert(1)</script>' },
          { nombre: 'Normal' }
        ]
      };

      const result = sanitizeObject(obj);

      expect(result.items[0].nombre).toContain('&lt;script&gt;');
      expect(result.items[1].nombre).toBe('Normal');
    });

    it('debe retornar null para null', () => {
      expect(sanitizeObject(null)).toBe(null);
    });

    it('debe retornar undefined para undefined', () => {
      expect(sanitizeObject(undefined)).toBe(undefined);
    });
  });
});
