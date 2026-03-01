const request = require('supertest');
const express = require('express');
const cuponesRoutes = require('../../../routes/cupones');
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
  
  app.use('/api/cupones', cuponesRoutes);
  
  return app;
};

describe('Cupones Routes Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/cupones/validar', () => {
    it('debe retornar 200 con descuento calculado para cupón válido', async () => {
      const mockCupon = {
        cuponid: 1,
        codigo: 'DESCUENTO10',
        descripcion: '10% de descuento',
        tipo_descuento: 'PORCENTAJE',
        valor: 10,
        fecha_inicio: new Date('2020-01-01'),
        fecha_fin: new Date('2030-12-31'),
        uso_maximo: 100,
        usos_actuales: 5,
        activo: true,
        monto_minimo_compra: 100
      };

      db.query.mockResolvedValueOnce({ rows: [mockCupon] });

      const response = await request(app)
        .post('/api/cupones/validar')
        .send({
          codigo: 'DESCUENTO10',
          subtotal: 1000
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.montoDescuento).toBe(100);
      expect(response.body.data.nuevoTotal).toBe(900);
    });

    it('debe retornar 404 cuando el cupón no existe', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/cupones/validar')
        .send({
          codigo: 'NOEXISTE',
          subtotal: 1000
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('no existe');
    });

    it('debe retornar 400 cuando el cupón está expirado', async () => {
      const mockCupon = {
        cuponid: 1,
        codigo: 'EXPIRADO',
        tipo_descuento: 'PORCENTAJE',
        valor: 10,
        fecha_inicio: new Date('2020-01-01'),
        fecha_fin: new Date('2020-12-31'), // Fecha pasada
        activo: true,
        monto_minimo_compra: 0
      };

      db.query.mockResolvedValueOnce({ rows: [mockCupon] });

      const response = await request(app)
        .post('/api/cupones/validar')
        .send({
          codigo: 'EXPIRADO',
          subtotal: 1000
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('expiró');
    });

    it('debe retornar 400 cuando los usos están agotados', async () => {
      const mockCupon = {
        cuponid: 1,
        codigo: 'AGOTADO',
        tipo_descuento: 'PORCENTAJE',
        valor: 10,
        fecha_inicio: new Date('2020-01-01'),
        fecha_fin: new Date('2030-12-31'),
        uso_maximo: 10,
        usos_actuales: 10, // Agotado
        activo: true,
        monto_minimo_compra: 0
      };

      db.query.mockResolvedValueOnce({ rows: [mockCupon] });

      const response = await request(app)
        .post('/api/cupones/validar')
        .send({
          codigo: 'AGOTADO',
          subtotal: 1000
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('límite de usos');
    });

    it('debe retornar 400 cuando el subtotal es menor al mínimo', async () => {
      const mockCupon = {
        cuponid: 1,
        codigo: 'MINIMO500',
        tipo_descuento: 'PORCENTAJE',
        valor: 10,
        fecha_inicio: new Date('2020-01-01'),
        fecha_fin: new Date('2030-12-31'),
        activo: true,
        monto_minimo_compra: 500
      };

      db.query.mockResolvedValueOnce({ rows: [mockCupon] });

      const response = await request(app)
        .post('/api/cupones/validar')
        .send({
          codigo: 'MINIMO500',
          subtotal: 300
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('compra mínima');
    });

    it('debe calcular correctamente descuento de tipo PORCENTAJE', async () => {
      const mockCupon = {
        cuponid: 1,
        codigo: 'PORCENTAJE10',
        tipo_descuento: 'PORCENTAJE',
        valor: 10,
        fecha_inicio: new Date('2020-01-01'),
        fecha_fin: new Date('2030-12-31'),
        activo: true,
        monto_minimo_compra: 0
      };

      db.query.mockResolvedValueOnce({ rows: [mockCupon] });

      const response = await request(app)
        .post('/api/cupones/validar')
        .send({
          codigo: 'PORCENTAJE10',
          subtotal: 1000
        });

      expect(response.status).toBe(200);
      expect(response.body.data.montoDescuento).toBe(100);
      expect(response.body.data.nuevoTotal).toBe(900);
    });

    it('debe calcular correctamente descuento de tipo FIJO', async () => {
      const mockCupon = {
        cuponid: 1,
        codigo: 'FIJO50',
        tipo_descuento: 'FIJO',
        valor: 50,
        fecha_inicio: new Date('2020-01-01'),
        fecha_fin: new Date('2030-12-31'),
        activo: true,
        monto_minimo_compra: 0
      };

      db.query.mockResolvedValueOnce({ rows: [mockCupon] });

      const response = await request(app)
        .post('/api/cupones/validar')
        .send({
          codigo: 'FIJO50',
          subtotal: 500
        });

      expect(response.status).toBe(200);
      expect(response.body.data.montoDescuento).toBe(50);
      expect(response.body.data.nuevoTotal).toBe(450);
    });
  });

  describe('Cupones — Casos edge de seguridad', () => {
    it('debe retornar 400 cuando subtotal es negativo', async () => {
      const response = await request(app)
        .post('/api/cupones/validar')
        .send({
          codigo: 'DESCUENTO10',
          subtotal: -100
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('debe retornar 400 cuando subtotal es texto', async () => {
      const response = await request(app)
        .post('/api/cupones/validar')
        .send({
          codigo: 'DESCUENTO10',
          subtotal: 'abc'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('debe retornar 400 cuando codigo es un número en lugar de string', async () => {
      const response = await request(app)
        .post('/api/cupones/validar')
        .send({
          codigo: 12345,
          subtotal: 1000
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('debe retornar 400 cuando el body está vacío', async () => {
      const response = await request(app)
        .post('/api/cupones/validar')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('debe retornar 404 cuando el código es una inyección SQL', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/cupones/validar')
        .send({
          codigo: '\'; DROP TABLE cupones;--\'',
          subtotal: 1000
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('no existe');
    });
  });
});
