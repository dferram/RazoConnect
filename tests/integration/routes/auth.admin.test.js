const request = require('supertest');
const express = require('express');
const authAdminRoutes = require('../../../routes/admin');
const db = require('../../../db');

// Crear app de Express para tests
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Mock de tenant middleware
  app.use((req, res, next) => {
    req.tenant = { tenant_id: 1, domain: 'test.com' };
    next();
  });
  
  app.use('/api/admin', authAdminRoutes);
  
  return app;
};

describe('Admin Auth Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/admin/login', () => {
    it('debe retornar 400 cuando falta el campo email', async () => {
      const response = await request(app)
        .post('/api/admin/login')
        .send({
          password: 'password123'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/email|requerido/i);
    });

    it('debe retornar 400 cuando falta el campo password', async () => {
      const response = await request(app)
        .post('/api/admin/login')
        .send({
          email: 'admin@test.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/password|contraseña|requerido/i);
    });

    it('debe retornar 400 cuando falta el tenant', async () => {
      const appWithoutTenant = express();
      appWithoutTenant.use(express.json());
      // NO agregar req.tenant
      appWithoutTenant.use('/api/admin', authAdminRoutes);

      const response = await request(appWithoutTenant)
        .post('/api/admin/login')
        .send({
          email: 'admin@test.com',
          password: 'password123'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('debe retornar 401 cuando el email no existe en la base de datos', async () => {
      // Mock para verificar columnas de agentes
      db.query.mockResolvedValueOnce({ rows: [{ column_name: 'esadmin' }, { column_name: 'adminrol' }] });
      // Mock para buscar admin - no encontrado
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/admin/login')
        .send({
          email: 'noexiste@test.com',
          password: 'password123'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/credenciales|inválidas|incorrectas/i);
    });

    it('debe retornar 401 cuando el password es incorrecto', async () => {
      const mockAdmin = {
        adminid: 1,
        email: 'admin@test.com',
        password: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', // hash of "correctpassword"
        nombre: 'Admin',
        apellido: 'Test',
        rol: 'admin',
        tenant_id: 1
      };

      // Mock para verificar columnas de agentes
      db.query.mockResolvedValueOnce({ rows: [{ column_name: 'esadmin' }, { column_name: 'adminrol' }] });
      // Mock para buscar admin
      db.query.mockResolvedValueOnce({ rows: [mockAdmin] });

      const response = await request(app)
        .post('/api/admin/login')
        .send({
          email: 'admin@test.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/credenciales|inválidas|incorrectas/i);
    });
  });
});
