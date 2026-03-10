/**
 * UNIT TESTS FOR AUTHORIZATION MIDDLEWARE
 * 
 * Tests the authorizeRole middleware in isolation without DB dependencies
 * 
 * @module tests/auth/middleware-unit
 * @date 2026-03-10
 */

const { authorizeRole } = require('../../middlewares/authMiddleware');

describe('Authorization Middleware Unit Tests', () => {
  
  describe('authorizeRole - super_admin bypass', () => {
    test('super_admin should bypass all role restrictions', () => {
      const middleware = authorizeRole(['compras', 'finanzas']);
      
      const req = { user: { rol: 'super_admin' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('super_admin with uppercase should bypass (after normalization)', () => {
      const middleware = authorizeRole(['compras']);
      
      const req = { user: { rol: 'SUPER_ADMIN' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    test('super_admin should bypass even empty role list', () => {
      const middleware = authorizeRole([]);
      
      const req = { user: { rol: 'super_admin' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });
  });

  describe('authorizeRole - admin bypass', () => {
    test('admin should bypass all role restrictions', () => {
      const middleware = authorizeRole(['compras', 'finanzas']);
      
      const req = { user: { rol: 'admin' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('admin with uppercase should bypass (after normalization)', () => {
      const middleware = authorizeRole(['compras']);
      
      const req = { user: { rol: 'ADMIN' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });
  });

  describe('authorizeRole - exact role match', () => {
    test('compras role should access compras routes', () => {
      const middleware = authorizeRole(['compras', 'finanzas']);
      
      const req = { user: { rol: 'compras' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
      expect(res.status).not.toHaveBeenCalled();
    });

    test('finanzas role should access finanzas routes', () => {
      const middleware = authorizeRole(['finanzas', 'contador']);
      
      const req = { user: { rol: 'finanzas' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    test('inventarios role should access inventarios routes', () => {
      const middleware = authorizeRole(['inventarios', 'almacenista']);
      
      const req = { user: { rol: 'inventarios' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });
  });

  describe('authorizeRole - role denial', () => {
    test('finanzas should NOT access compras-only routes', () => {
      const middleware = authorizeRole(['compras']);
      
      const req = { user: { rol: 'finanzas' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('Acceso denegado')
        })
      );
    });

    test('cliente should NOT access admin routes', () => {
      const middleware = authorizeRole(['compras', 'finanzas', 'inventarios']);
      
      const req = { user: { rol: 'cliente' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('agente should NOT access admin-only routes', () => {
      const middleware = authorizeRole(['compras', 'finanzas']);
      
      const req = { user: { rol: 'agente' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('authorizeRole - wildcard support', () => {
    test('gerente_finanzas should match gerente_* wildcard', () => {
      const middleware = authorizeRole(['gerente_*']);
      
      const req = { user: { rol: 'gerente_finanzas' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    test('gerente_operaciones should match gerente_* wildcard', () => {
      const middleware = authorizeRole(['gerente_*']);
      
      const req = { user: { rol: 'gerente_operaciones' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });

    test('contador should NOT match gerente_* wildcard', () => {
      const middleware = authorizeRole(['gerente_*']);
      
      const req = { user: { rol: 'contador' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('authorizeRole - unauthenticated user', () => {
    test('should return 401 if req.user is missing', () => {
      const middleware = authorizeRole(['compras']);
      
      const req = {};
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(false);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'No autenticado'
        })
      );
    });
  });

  describe('authorizeRole - case sensitivity', () => {
    test('should normalize roles to lowercase', () => {
      const middleware = authorizeRole(['COMPRAS', 'Finanzas']);
      
      const req = { user: { rol: 'CoMpRaS' } };
      const res = { 
        status: jest.fn().mockReturnThis(), 
        json: jest.fn() 
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      expect(nextCalled).toBe(true);
    });
  });
});
