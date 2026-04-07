const SmartStockService = require('../../../services/SmartStockService');
const db = require('../../../db');

jest.mock('../../../db', () => ({
  query: jest.fn(),
  pool: {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn()
    })
  }
}));

describe('SmartStockService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateAllocationStatus', () => {
    it('debe retornar estatus: "backorder" cuando varianteId es null', async () => {
      const result = await SmartStockService.calculateAllocationStatus({
        varianteId: null,
        cantidadRequerida: 10,
        orderDate: new Date(),
        adminId: 1,
        tenantId: 1,
        piezasPorPaquete: 1
      });

      expect(result.estatus).toBe('backorder');
      expect(result.cantidadSurtible).toBe(0);
      expect(result.cantidadBackorder).toBe(10);
    });

    it('debe retornar estatus: "backorder" cuando tenantId es null', async () => {
      const result = await SmartStockService.calculateAllocationStatus({
        varianteId: 1,
        cantidadRequerida: 10,
        orderDate: new Date(),
        adminId: 1,
        tenantId: null,
        piezasPorPaquete: 1
      });

      expect(result.estatus).toBe('backorder');
      expect(result.cantidadSurtible).toBe(0);
    });

    it('debe retornar estatus: "backorder" cuando orderDate es null', async () => {
      const result = await SmartStockService.calculateAllocationStatus({
        varianteId: 1,
        cantidadRequerida: 10,
        orderDate: null,
        adminId: 1,
        tenantId: 1,
        piezasPorPaquete: 1
      });

      expect(result.estatus).toBe('backorder');
      expect(result.cantidadSurtible).toBe(0);
    });

    it('debe retornar cantidadSurtible: 0 cuando no hay stock físico', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ stock: 0 }] }) // Stock físico
        .mockResolvedValueOnce({ rows: [{ total_piezas_anteriores: 0, num_pedidos_anteriores: 0 }] }) // Deuda previa
        .mockResolvedValueOnce({ rows: [{ reservada: 0 }] }); // Reservas

      const result = await SmartStockService.calculateAllocationStatus({
        varianteId: 1,
        cantidadRequerida: 10,
        orderDate: new Date(),
        adminId: 1,
        tenantId: 1,
        piezasPorPaquete: 1
      });

      expect(result.cantidadSurtible).toBe(0);
      expect(result.estatus).toBe('backorder');
      expect(result.stockFisico).toBe(0);
    });

    it('debe retornar cantidadSurtible === cantidadRequerida cuando hay suficiente stock y no hay deuda previa', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ stock: 100 }] }) // Stock físico
        .mockResolvedValueOnce({ rows: [{ total_piezas_anteriores: 0, num_pedidos_anteriores: 0 }] }) // Deuda previa
        .mockResolvedValueOnce({ rows: [{ reservada: 0 }] }); // Reservas

      const result = await SmartStockService.calculateAllocationStatus({
        varianteId: 1,
        cantidadRequerida: 10,
        orderDate: new Date(),
        adminId: 1,
        tenantId: 1,
        piezasPorPaquete: 1
      });

      expect(result.cantidadSurtible).toBe(10);
      expect(result.cantidadBackorder).toBe(0);
      expect(result.estatus).toBe('surtido');
    });

    it('debe retornar cantidadBackorder > 0 cuando el stock es menor a la cantidad requerida', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ stock: 5 }] }) // Stock físico
        .mockResolvedValueOnce({ rows: [{ total_piezas_anteriores: 0, num_pedidos_anteriores: 0 }] }) // Deuda previa
        .mockResolvedValueOnce({ rows: [{ reservada: 0 }] }); // Reservas

      const result = await SmartStockService.calculateAllocationStatus({
        varianteId: 1,
        cantidadRequerida: 10,
        orderDate: new Date(),
        adminId: 1,
        tenantId: 1,
        piezasPorPaquete: 1
      });

      expect(result.cantidadSurtible).toBe(5);
      expect(result.cantidadBackorder).toBe(5);
      expect(result.estatus).toBe('parcial');
    });

    it('debe considerar la deuda de pedidos anteriores en el cálculo FIFO', async () => {
      // Stock físico = 10, deuda previa = 8 piezas, se piden 5 piezas
      // Disponible real = 10 - 8 = 2 → surtible = 2, backorder = 3
      db.query
        .mockResolvedValueOnce({ rows: [{ stock: 10 }] }) // Stock físico
        .mockResolvedValueOnce({ rows: [{ total_piezas_anteriores: 8, num_pedidos_anteriores: 2 }] }) // Deuda previa
        .mockResolvedValueOnce({ rows: [{ reservada: 0 }] }); // Reservas

      const result = await SmartStockService.calculateAllocationStatus({
        varianteId: 1,
        cantidadRequerida: 5,
        orderDate: new Date(),
        adminId: 1,
        tenantId: 1,
        piezasPorPaquete: 1
      });

      expect(result.stockFisico).toBe(10);
      expect(result.deudaPrevia).toBe(8);
      expect(result.stockDisponible).toBe(2);
      expect(result.cantidadSurtible).toBe(2);
      expect(result.cantidadBackorder).toBe(3);
      expect(result.estatus).toBe('parcial');
    });
  });

  describe('allocateStockAutomatically', () => {
    it('debe retornar success: false cuando varianteId es undefined', async () => {
      const result = await SmartStockService.allocateStockAutomatically({
        varianteId: undefined,
        cantidadRequerida: 10,
        tenantId: 1
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Parámetros inválidos');
    });

    it('debe retornar success: false cuando cantidadRequerida es 0', async () => {
      const result = await SmartStockService.allocateStockAutomatically({
        varianteId: 1,
        cantidadRequerida: 0,
        tenantId: 1
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Parámetros inválidos');
    });

    it('debe retornar success: false cuando no hay admins con stock', async () => {
      // Primera llamada: No hay admins con stock en stock_admin
      db.query.mockResolvedValueOnce({ rows: [] });
      // Segunda llamada: Fallback a producto_variantes - tampoco hay stock
      db.query.mockResolvedValueOnce({ rows: [] });

      const result = await SmartStockService.allocateStockAutomatically({
        varianteId: 1,
        cantidadRequerida: 10,
        tenantId: 1
      });

      expect(result.success).toBe(false);
      expect(result.allocations).toHaveLength(0);
      expect(result.message).toContain('Sin stock disponible');
    });

    it('debe retornar success: true y totalAsignado === cantidadRequerida cuando hay un admin con stock suficiente', async () => {
      db.query.mockResolvedValueOnce({
        rows: [
          {
            admin_id: 1,
            stock_disponible: 100,
            admin_nombre: 'Admin Test'
          }
        ]
      });

      const result = await SmartStockService.allocateStockAutomatically({
        varianteId: 1,
        cantidadRequerida: 10,
        tenantId: 1
      });

      expect(result.success).toBe(true);
      expect(result.totalAsignado).toBe(10);
      expect(result.faltante).toBe(0);
      expect(result.allocations).toHaveLength(1);
      expect(result.allocations[0].adminId).toBe(1);
      expect(result.allocations[0].cantidad).toBe(10);
    });
  });
});
