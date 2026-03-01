const validateUserTenant = require('../../../middlewares/validateUserTenant');

const mockReq = (user = null, tenant = null) => ({
  user,
  tenant,
  logout: jest.fn((callback) => callback()),
  session: {
    destroy: jest.fn((callback) => callback())
  },
  hostname: 'test.com',
  path: '/test'
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = () => jest.fn();

describe('validateUserTenant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();
  });

  it('debe llamar next() cuando usuario y tenant coinciden', () => {
    const req = mockReq(
      { tenant_id: 1, email: 'test@test.com' },
      { tenant_id: 1 }
    );
    const res = mockRes();
    const next = mockNext();

    validateUserTenant(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('debe llamar next() cuando no hay req.user (usuario no autenticado)', () => {
    const req = mockReq(null, { tenant_id: 1 });
    const res = mockRes();
    const next = mockNext();

    validateUserTenant(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('debe llamar next() cuando no hay req.tenant (sin tenant detectado)', () => {
    const req = mockReq({ tenant_id: 1, email: 'test@test.com' }, null);
    const res = mockRes();
    const next = mockNext();

    validateUserTenant(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('debe hacer logout y retornar 401 cuando hay tenant mismatch', () => {
    const req = mockReq(
      { tenant_id: 1, email: 'test@test.com' },
      { tenant_id: 2 }
    );
    const res = mockRes();
    const next = mockNext();

    validateUserTenant(req, res, next);

    expect(req.logout).toHaveBeenCalled();
    expect(req.session.destroy).toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith('razoconnect.sid');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Sesión invalidada',
      message: 'Tu sesión pertenece a otro sitio. Por favor inicia sesión nuevamente.',
      code: 'TENANT_MISMATCH'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('debe manejar el caso cuando no hay sesión pero hay mismatch', () => {
    const req = mockReq(
      { tenant_id: 1, email: 'test@test.com' },
      { tenant_id: 2 }
    );
    req.session = null;
    const res = mockRes();
    const next = mockNext();

    validateUserTenant(req, res, next);

    expect(req.logout).toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith('razoconnect.sid');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Sesión invalidada',
      message: 'Tu sesión pertenece a otro sitio. Por favor inicia sesión nuevamente.',
      code: 'TENANT_MISMATCH'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('debe loguear información de seguridad cuando detecta mismatch', () => {
    const req = mockReq(
      { tenant_id: 1, email: 'user@tenant1.com' },
      { tenant_id: 2 }
    );
    const res = mockRes();
    const next = mockNext();

    validateUserTenant(req, res, next);

    expect(console.log).toHaveBeenCalledWith('🚨 SECURITY ALERT: Tenant mismatch detected!');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('user@tenant1.com'));
  });

  it('debe manejar errores en logout sin romper el flujo', () => {
    const req = mockReq(
      { tenant_id: 1, email: 'test@test.com' },
      { tenant_id: 2 }
    );
    req.logout = jest.fn((callback) => callback(new Error('Logout error')));
    const res = mockRes();
    const next = mockNext();

    validateUserTenant(req, res, next);

    expect(console.error).toHaveBeenCalledWith('Error en logout:', expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('debe manejar errores en session.destroy sin romper el flujo', () => {
    const req = mockReq(
      { tenant_id: 1, email: 'test@test.com' },
      { tenant_id: 2 }
    );
    req.session.destroy = jest.fn((callback) => callback(new Error('Destroy error')));
    const res = mockRes();
    const next = mockNext();

    validateUserTenant(req, res, next);

    expect(console.error).toHaveBeenCalledWith('Error al destruir sesión:', expect.any(Error));
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
