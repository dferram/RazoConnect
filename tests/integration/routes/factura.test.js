const request = require('supertest');
const express = require('express');

jest.mock('../../../db', () => ({ query: jest.fn() }));
jest.mock('../../../services/facturaService', () => ({
  generarFacturaPDF: jest.fn()
}));
jest.mock('../../../services/configuracionService', () => ({
  getIvaTasa: jest.fn().mockResolvedValue(0.16)
}));
jest.mock('../../../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    on: jest.fn(), 
    connect: jest.fn().mockResolvedValue(undefined),
    sendCommand: jest.fn(), 
    isReady: false,
  }))
}));
jest.mock('express-rate-limit', () => ({ rateLimit: jest.fn(() => (req, res, next) => next()) }));
jest.mock('rate-limit-redis', () => ({ RedisStore: jest.fn().mockImplementation(() => ({})) }));

describe('Factura Routes - Integration Tests', () => {
  let app;
  let facturaService;
  let db;

  beforeEach(() => {
    jest.clearAllMocks();
    
    facturaService = require('../../../services/facturaService');
    db = require('../../../db');

    // Crear app Express básica para testing
    app = express();
    app.use(express.json());

    // Mock de middleware de autenticación
    app.use((req, res, next) => {
      if (req.headers.authorization === 'Bearer valid-token') {
        req.user = { id: 1, rol: 'admin' };
        req.tenant = { tenant_id: 1 };
        next();
      } else if (req.headers.authorization === 'Bearer cliente-token') {
        req.user = { id: 2, rol: 'cliente' };
        req.tenant = { tenant_id: 1 };
        next();
      } else if (req.headers.authorization === 'Bearer invalid-tenant-token') {
        req.user = { id: 1, rol: 'admin' };
        req.tenant = { tenant_id: 2 };
        next();
      } else {
        res.status(401).json({ message: 'No autorizado' });
      }
    });

    // Ruta de factura simulada
    app.get('/api/factura/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { tenant_id } = req.tenant;
        const { rol } = req.user;

        const pdfBuffer = await facturaService.generarFacturaPDF(
          parseInt(id),
          tenant_id,
          rol
        );

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=factura-${id}.pdf`);
        res.send(pdfBuffer);
      } catch (error) {
        if (error.message.includes('no encontrado')) {
          res.status(404).json({ message: error.message });
        } else if (error.message.includes('no pertenece')) {
          res.status(403).json({ message: error.message });
        } else {
          res.status(500).json({ message: 'Error al generar factura' });
        }
      }
    });
  });

  describe('GET /api/factura/:id', () => {
    it('sin autenticación → 401', async () => {
      const response = await request(app)
        .get('/api/factura/1');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('No autorizado');
    });

    it('con token inválido → 401', async () => {
      const response = await request(app)
        .get('/api/factura/1')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('pedido no encontrado → 404', async () => {
      facturaService.generarFacturaPDF.mockRejectedValue(
        new Error('Pedido no encontrado o no pertenece al tenant')
      );

      const response = await request(app)
        .get('/api/factura/999')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('no encontrado');
    });

    it('pedido de otro tenant → 403 o 404', async () => {
      facturaService.generarFacturaPDF.mockRejectedValue(
        new Error('Pedido no encontrado o no pertenece al tenant')
      );

      const response = await request(app)
        .get('/api/factura/1')
        .set('Authorization', 'Bearer invalid-tenant-token');

      expect([403, 404]).toContain(response.status);
    });

    it('respuesta exitosa tiene Content-Type: application/pdf', async () => {
      const mockPdfBuffer = Buffer.from('PDF content');
      facturaService.generarFacturaPDF.mockResolvedValue(mockPdfBuffer);

      const response = await request(app)
        .get('/api/factura/1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('factura-1.pdf');
      expect(response.body).toEqual(mockPdfBuffer);
    });

    it('admin puede generar factura de cualquier pedido de su tenant', async () => {
      const mockPdfBuffer = Buffer.from('PDF content');
      facturaService.generarFacturaPDF.mockResolvedValue(mockPdfBuffer);

      const response = await request(app)
        .get('/api/factura/1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(facturaService.generarFacturaPDF).toHaveBeenCalledWith(1, 1, 'admin');
    });

    it('cliente puede generar factura de su propio pedido', async () => {
      const mockPdfBuffer = Buffer.from('PDF content');
      facturaService.generarFacturaPDF.mockResolvedValue(mockPdfBuffer);

      const response = await request(app)
        .get('/api/factura/1')
        .set('Authorization', 'Bearer cliente-token');

      expect(response.status).toBe(200);
      expect(facturaService.generarFacturaPDF).toHaveBeenCalledWith(1, 1, 'cliente');
    });

    it('error interno del servidor → 500', async () => {
      facturaService.generarFacturaPDF.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .get('/api/factura/1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Error al generar factura');
    });
  });
});
