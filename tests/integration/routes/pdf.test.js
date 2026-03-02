const request = require('supertest');
const express = require('express');

jest.mock('../../../db', () => ({ query: jest.fn() }));
jest.mock('../../../controllers/pdfController', () => ({
  generarPDFPedido: jest.fn()
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

describe('PDF Routes - Integration Tests', () => {
  let app;
  let pdfController;
  let db;

  beforeEach(() => {
    jest.clearAllMocks();
    
    pdfController = require('../../../controllers/pdfController');
    db = require('../../../db');

    // Crear app Express básica para testing
    app = express();
    app.use(express.json());

    // Mock de middleware de autenticación
    app.use((req, res, next) => {
      if (req.headers.authorization === 'Bearer admin-token') {
        req.user = { id: 1, rol: 'admin' };
        req.tenant = { tenant_id: 1 };
        next();
      } else if (req.headers.authorization === 'Bearer cliente-token') {
        req.user = { id: 2, rol: 'cliente', clienteId: 2 };
        req.tenant = { tenant_id: 1 };
        next();
      } else if (req.headers.authorization === 'Bearer otro-cliente-token') {
        req.user = { id: 3, rol: 'cliente', clienteId: 3 };
        req.tenant = { tenant_id: 1 };
        next();
      } else if (req.headers.authorization === 'Bearer otro-tenant-token') {
        req.user = { id: 1, rol: 'admin' };
        req.tenant = { tenant_id: 2 };
        next();
      } else {
        res.status(401).json({ message: 'No autorizado' });
      }
    });

    // Ruta de PDF simulada
    app.get('/api/pdf/pedido/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { tenant_id } = req.tenant;
        const { rol, clienteId } = req.user;

        // Verificar que el pedido existe y pertenece al tenant
        const pedidoQuery = await db.query(
          'SELECT pedidoid, clienteid FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2',
          [id, tenant_id]
        );

        if (pedidoQuery.rows.length === 0) {
          return res.status(404).json({ message: 'Pedido no encontrado' });
        }

        const pedido = pedidoQuery.rows[0];

        // Si es cliente, verificar que sea su pedido
        if (rol === 'cliente' && pedido.clienteid !== clienteId) {
          return res.status(403).json({ message: 'No tienes permiso para ver este pedido' });
        }

        const pdfBuffer = await pdfController.generarPDFPedido(parseInt(id));

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=pedido-${id}.pdf`);
        res.send(pdfBuffer);
      } catch (error) {
        res.status(500).json({ message: 'Error al generar PDF' });
      }
    });
  });

  describe('GET /api/pdf/pedido/:id', () => {
    it('sin autenticación → 401', async () => {
      const response = await request(app)
        .get('/api/pdf/pedido/1');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('No autorizado');
    });

    it('con token inválido → 401', async () => {
      const response = await request(app)
        .get('/api/pdf/pedido/1')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('con rol admin y pedido existente → 200', async () => {
      db.query.mockResolvedValue({
        rows: [{ pedidoid: 1, clienteid: 2 }]
      });

      const mockPdfBuffer = Buffer.from('PDF content');
      pdfController.generarPDFPedido.mockResolvedValue(mockPdfBuffer);

      const response = await request(app)
        .get('/api/pdf/pedido/1')
        .set('Authorization', 'Bearer admin-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('pedido-1.pdf');
    });

    it('con rol cliente propietario → 200', async () => {
      db.query.mockResolvedValue({
        rows: [{ pedidoid: 1, clienteid: 2 }]
      });

      const mockPdfBuffer = Buffer.from('PDF content');
      pdfController.generarPDFPedido.mockResolvedValue(mockPdfBuffer);

      const response = await request(app)
        .get('/api/pdf/pedido/1')
        .set('Authorization', 'Bearer cliente-token');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('con rol cliente de otro pedido → 403', async () => {
      db.query.mockResolvedValue({
        rows: [{ pedidoid: 1, clienteid: 2 }] // Pedido pertenece a cliente 2
      });

      const response = await request(app)
        .get('/api/pdf/pedido/1')
        .set('Authorization', 'Bearer otro-cliente-token'); // Cliente 3

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('No tienes permiso');
    });

    it('pedido inexistente → 404', async () => {
      db.query.mockResolvedValue({
        rows: []
      });

      const response = await request(app)
        .get('/api/pdf/pedido/999')
        .set('Authorization', 'Bearer admin-token');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Pedido no encontrado');
    });

    it('pedido de otro tenant → 404', async () => {
      db.query.mockResolvedValue({
        rows: [] // No encuentra el pedido porque tenant_id no coincide
      });

      const response = await request(app)
        .get('/api/pdf/pedido/1')
        .set('Authorization', 'Bearer otro-tenant-token');

      expect(response.status).toBe(404);
    });

    it('error al generar PDF → 500', async () => {
      db.query.mockResolvedValue({
        rows: [{ pedidoid: 1, clienteid: 2 }]
      });

      pdfController.generarPDFPedido.mockRejectedValue(
        new Error('PDF generation failed')
      );

      const response = await request(app)
        .get('/api/pdf/pedido/1')
        .set('Authorization', 'Bearer admin-token');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Error al generar PDF');
    });

    it('verifica que se llama a generarPDFPedido con el ID correcto', async () => {
      db.query.mockResolvedValue({
        rows: [{ pedidoid: 5, clienteid: 2 }]
      });

      const mockPdfBuffer = Buffer.from('PDF content');
      pdfController.generarPDFPedido.mockResolvedValue(mockPdfBuffer);

      await request(app)
        .get('/api/pdf/pedido/5')
        .set('Authorization', 'Bearer admin-token');

      expect(pdfController.generarPDFPedido).toHaveBeenCalledWith(5);
    });
  });
});
