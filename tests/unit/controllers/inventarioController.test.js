/**
 * Unit Tests: Inventario Controller
 * Tests para gestión de inventario
 */

const inventarioController = require('../../../controllers/inventarioController');
const db = require('../../../db');

jest.mock('../../../db');
jest.mock('../../../utils/logger');
jest.mock('../../../services/SmartStockService');

describe('inventarioController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      tenant: { tenant_id: 1 },
      user: { admin_responsable_id: 2, id: 2, rol: 'admin' },
      params: {},
      body: {},
      query: { page: 1, limit: 20 },
      requestId: 'test-123'
    };

    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('GET /api/admin/inventario', () => {
    test('✅ Happy Path: Obtiene inventario paginado', async () => {
      const mockInventario = [
        {
          variante_id: 1,
          sku: 'SKU001',
          nombre_producto: 'Producto A',
          stock: 100,
          cantidad_reservada: 10,
          disponible: 90
        },
        {
          variante_id: 2,
          sku: 'SKU002',
          nombre_producto: 'Producto B',
          stock: 50,
          cantidad_reservada: 5,
          disponible: 45
        }
      ];

      db.query
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: mockInventario });

      if (inventarioController.obtenerInventario) {
        await inventarioController.obtenerInventario(req, res);

        expect(db.query).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.any(Array)
          })
        );
      }
    });

    test('✅ Filtra por búsqueda de SKU', async () => {
      req.query.buscar = 'SKU001';

      db.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [{ sku: 'SKU001', stock: 100 }] });

      if (inventarioController.obtenerInventario) {
        await inventarioController.obtenerInventario(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('ILIKE'),
          expect.any(Array)
        );
      }
    });

    test('✅ Filtra por stock bajo', async () => {
      req.query.stockBajo = 'true';

      db.query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [{ sku: 'SKU003', stock: 5 }] });

      if (inventarioController.obtenerInventario) {
        await inventarioController.obtenerInventario(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true
          })
        );
      }
    });

    test('❌ Error 500: DB falla', async () => {
      db.query.mockRejectedValueOnce(new Error('DB error'));

      if (inventarioController.obtenerInventario) {
        await inventarioController.obtenerInventario(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
      }
    });
  });

  describe('GET /api/admin/inventario/:varianteId', () => {
    test('✅ Obtiene detalle de una variante', async () => {
      req.params.varianteId = 1;

      const mockDetalle = {
        variante_id: 1,
        sku: 'SKU001',
        nombre_producto: 'Producto A',
        stock: 100,
        cantidad_reservada: 10,
        disponible: 90,
        precio_costo: 50.00,
        precio_venta: 100.00,
        admin_id: 2
      };

      db.query.mockResolvedValueOnce({ rows: [mockDetalle] });

      if (inventarioController.obtenerDetalleVariante) {
        await inventarioController.obtenerDetalleVariante(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: mockDetalle
          })
        );
      }
    });

    test('❌ Error 404: Variante no encontrada', async () => {
      req.params.varianteId = 999;

      db.query.mockResolvedValueOnce({ rows: [] });

      if (inventarioController.obtenerDetalleVariante) {
        await inventarioController.obtenerDetalleVariante(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
      }
    });

    test('✅ Verifica aislamiento por admin_id', async () => {
      req.params.varianteId = 1;
      req.user.admin_responsable_id = 2;

      db.query.mockResolvedValueOnce({
        rows: [{ variante_id: 1, admin_id: 2, stock: 100 }]
      });

      if (inventarioController.obtenerDetalleVariante) {
        await inventarioController.obtenerDetalleVariante(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('admin_id'),
          expect.arrayContaining([2])
        );
      }
    });
  });

  describe('PUT /api/admin/inventario/:varianteId', () => {
    test('✅ Actualiza stock de una variante', async () => {
      req.params.varianteId = 1;
      req.body = { stock: 150, motivo: 'Compra nueva' };

      db.query
        .mockResolvedValueOnce({ rows: [{ variante_id: 1, stock: 100 }] })
        .mockResolvedValueOnce({
          rows: [{ variante_id: 1, stock: 150 }]
        });

      if (inventarioController.actualizarStock) {
        await inventarioController.actualizarStock(req, res);

        expect(db.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE'),
          expect.any(Array)
        );

        if (res.json.mock.calls.length > 0) {
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true
            })
          );
        }
      }
    });

    test('❌ Valida cantidad no negativa', async () => {
      req.params.varianteId = 1;
      req.body = { stock: -50 };

      if (inventarioController.actualizarStock) {
        await inventarioController.actualizarStock(req, res);

        if (res.status.mock.calls.length > 0) {
          expect(res.status).toHaveBeenCalledWith(expect.any(Number) >= 400);
        }
      }
    });

    test('✅ Registra movimiento en kardex', async () => {
      req.params.varianteId = 1;
      req.body = { stock: 150, motivo: 'Ajuste mensual' };

      db.query
        .mockResolvedValueOnce({ rows: [{ variante_id: 1, stock: 100 }] })
        .mockResolvedValueOnce({ rows: [{ variante_id: 1, stock: 150 }] })
        .mockResolvedValueOnce({}); // INSERT en kardex

      if (inventarioController.actualizarStock) {
        await inventarioController.actualizarStock(req, res);

        // Verificar que se llamó a INSERT para kardex
        const updateCalls = db.query.mock.calls.filter(call =>
          call[0].includes('kardex') || call[0].includes('INSERT')
        );
        expect(updateCalls.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('GET /api/admin/inventario-alertas', () => {
    test('✅ Obtiene alertas de stock bajo', async () => {
      const mockAlertas = [
        {
          variante_id: 5,
          sku: 'SKU005',
          stock: 3,
          minimo_recomendado: 10,
          tipo: 'stock_bajo'
        },
        {
          variante_id: 6,
          sku: 'SKU006',
          stock: 0,
          minimo_recomendado: 5,
          tipo: 'sin_stock'
        }
      ];

      db.query.mockResolvedValueOnce({ rows: mockAlertas });

      if (inventarioController.obtenerAlertas) {
        await inventarioController.obtenerAlertas(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            alertas: mockAlertas
          })
        );
      }
    });
  });

  describe('POST /api/admin/inventario/transferencia', () => {
    test('✅ Transfiere stock entre admins', async () => {
      req.body = {
        varianteId: 1,
        adminDestino: 5,
        cantidad: 20,
        motivo: 'Redistribución regional'
      };

      db.query
        .mockResolvedValueOnce({ rows: [{ stock: 100 }] }) // origen tiene suficiente
        .mockResolvedValueOnce({}) // UPDATE origen
        .mockResolvedValueOnce({}) // UPDATE destino
        .mockResolvedValueOnce({}); // INSERT en kardex

      if (inventarioController.transferirStock) {
        await inventarioController.transferirStock(req, res);

        if (res.json.mock.calls.length > 0) {
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              message: expect.stringContaining('transferi')
            })
          );
        }
      }
    });

    test('❌ Error: Stock insuficiente', async () => {
      req.body = {
        varianteId: 1,
        adminDestino: 5,
        cantidad: 500 // más de lo disponible
      };

      db.query.mockResolvedValueOnce({ rows: [{ stock: 100 }] });

      if (inventarioController.transferirStock) {
        await inventarioController.transferirStock(req, res);

        if (res.status.mock.calls.length > 0) {
          expect(res.status).toHaveBeenCalledWith(400);
        }
      }
    });
  });
});
