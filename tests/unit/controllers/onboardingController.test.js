const { crearTenant, listarTenants, obtenerTenant } = require('../../../controllers/onboardingController');
const db = require('../../../db');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockReq = (overrides = {}) => ({
  body: {},
  params: {},
  session: { developerUsername: 'testdev' },
  requestId: 'test-request-id',
  ...overrides
});

describe('onboardingController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('crearTenant', () => {
    const validBody = {
      nombre_cliente: 'Distribuidora Test',
      dominio: 'test.razoconnect.com',
      admin_nombre: 'Juan',
      admin_apellido: 'Pérez',
      admin_email: 'juan@test.com',
      admin_password: 'Password123!'
    };

    it('debe retornar 400 si faltan campos requeridos', async () => {
      const req = mockReq({ body: { nombre_cliente: 'Solo esto' } });
      const res = mockRes();

      const mockClient = {
        query: jest.fn(),
        release: jest.fn()
      };
      db.pool.connect.mockResolvedValue(mockClient);

      await crearTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.success).toBe(false);
      expect(responseBody.message).toContain('Campos requeridos');
    });

    it('debe retornar 400 si el email tiene formato inválido', async () => {
      const req = mockReq({ body: { ...validBody, admin_email: 'no-es-un-email' } });
      const res = mockRes();

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      db.pool.connect.mockResolvedValue(mockClient);

      await crearTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toContain('email');
    });

    it('debe retornar 400 si la contraseña tiene menos de 8 caracteres', async () => {
      const req = mockReq({ body: { ...validBody, admin_password: 'corta' } });
      const res = mockRes();

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      db.pool.connect.mockResolvedValue(mockClient);

      await crearTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debe retornar 400 si el dominio contiene caracteres inválidos', async () => {
      const req = mockReq({ body: { ...validBody, dominio: 'test@invalid!.com' } });
      const res = mockRes();

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      db.pool.connect.mockResolvedValue(mockClient);

      await crearTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].message).toContain('dominio');
    });

    it('debe retornar 409 si el dominio ya existe', async () => {
      const req = mockReq({ body: validBody });
      const res = mockRes();

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({ rows: [{ tenant_id: 1 }] })
          .mockResolvedValueOnce(undefined),
        release: jest.fn()
      };
      db.pool.connect.mockResolvedValue(mockClient);

      await crearTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0].message).toContain('dominio');
    });

    it('debe retornar 409 si el email ya existe', async () => {
      const req = mockReq({ body: validBody });
      const res = mockRes();

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ adminid: 1 }] })
          .mockResolvedValueOnce(undefined),
        release: jest.fn()
      };
      db.pool.connect.mockResolvedValue(mockClient);

      await crearTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0].message).toContain('email');
    });

    it('debe retornar 201 y el tenant creado cuando todo es válido', async () => {
      const req = mockReq({ body: validBody });
      const res = mockRes();

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ 
            tenant_id: 99,
            nombre_cliente: 'Distribuidora Test',
            dominio: 'test.razoconnect.com',
            is_active: true,
            created_at: new Date()
          }]})
          .mockResolvedValueOnce({ rows: [{ 
            adminid: 10,
            nombre: 'Juan',
            apellido: 'Pérez',
            email: 'juan@test.com',
            rol: 'super_admin'
          }]})
          .mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      db.pool.connect.mockResolvedValue(mockClient);

      await crearTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.tenant.tenantId).toBe(99);
      expect(responseBody.data.adminCreado.email).toBe('juan@test.com');
      expect(responseBody.data.siguientesPasos).toHaveLength(4);
    });

    it('debe hacer ROLLBACK y retornar 500 si hay error de base de datos', async () => {
      const req = mockReq({ body: validBody });
      const res = mockRes();

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('DB connection failed')),
        release: jest.fn()
      };
      db.pool.connect.mockResolvedValue(mockClient);

      await crearTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].success).toBe(false);
    });

    it('debe convertir dominio a minúsculas', async () => {
      const req = mockReq({ body: { ...validBody, dominio: 'TEST.RazoConnect.COM' } });
      const res = mockRes();

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ 
            tenant_id: 99,
            nombre_cliente: 'Distribuidora Test',
            dominio: 'test.razoconnect.com',
            is_active: true,
            created_at: new Date()
          }]})
          .mockResolvedValueOnce({ rows: [{ 
            adminid: 10,
            nombre: 'Juan',
            apellido: 'Pérez',
            email: 'juan@test.com',
            rol: 'super_admin'
          }]})
          .mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      db.pool.connect.mockResolvedValue(mockClient);

      await crearTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.data.tenant.dominio).toBe('test.razoconnect.com');
    });
  });

  describe('listarTenants', () => {
    it('debe retornar la lista de tenants con estadísticas', async () => {
      const mockRows = [
        { tenant_id: 1, nombre_cliente: 'Razo', dominio: 'razo.com', is_active: true, created_at: new Date(), total_admins: '2', total_clientes: '15' },
        { tenant_id: 2, nombre_cliente: 'Test Corp', dominio: 'test.com', is_active: false, created_at: new Date(), total_admins: '1', total_clientes: '0' }
      ];
      db.query.mockResolvedValueOnce({ rows: mockRows });

      const req = mockReq();
      const res = mockRes();

      await listarTenants(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({ tenantId: 1, stats: { totalAdmins: 2, totalClientes: 15 } })
          ])
        })
      );
    });

    it('debe retornar 500 si falla la consulta', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));
      const req = mockReq();
      const res = mockRes();

      await listarTenants(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('debe retornar array vacío si no hay tenants', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const req = mockReq();
      const res = mockRes();

      await listarTenants(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: []
        })
      );
    });
  });

  describe('obtenerTenant', () => {
    it('debe retornar 400 si el ID no es válido', async () => {
      const req = mockReq({ params: { id: 'abc' } });
      const res = mockRes();

      await obtenerTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debe retornar 400 si el ID es negativo', async () => {
      const req = mockReq({ params: { id: '-5' } });
      const res = mockRes();

      await obtenerTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debe retornar 404 si el tenant no existe', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });
      const req = mockReq({ params: { id: '999' } });
      const res = mockRes();

      await obtenerTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('debe retornar el tenant con sus admins', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ tenant_id: 1, nombre_cliente: 'Razo', dominio: 'razo.com', is_active: true, created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [{ adminid: 1, nombre: 'Admin', apellido: 'Uno', email: 'admin@razo.com', rol: 'super_admin', activo: true }] });

      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();

      await obtenerTenant(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            tenantId: 1,
            administradores: expect.arrayContaining([
              expect.objectContaining({ email: 'admin@razo.com' })
            ])
          })
        })
      );
    });

    it('debe retornar tenant sin admins si no tiene', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ tenant_id: 1, nombre_cliente: 'Razo', dominio: 'razo.com', is_active: true, created_at: new Date() }] })
        .mockResolvedValueOnce({ rows: [] });

      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();

      await obtenerTenant(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            tenantId: 1,
            administradores: []
          })
        })
      );
    });

    it('debe retornar 500 si hay error de base de datos', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();

      await obtenerTenant(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
