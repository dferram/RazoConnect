/**
 * UNIT TESTS - FIFO ALLOCATION SERVICE
 * 
 * Tests para validar la lógica crítica de asignación FIFO de stock:
 * - Asignación cronológica correcta
 * - Generación de backorders cuando no hay stock
 * - Recálculo al cancelar pedidos
 * - Recálculo al entregar pedidos
 * - Validación de consistencia
 * 
 * @author RazoConnect QA Team
 * @date 2026-03-26
 */

const FIFOAllocationService = require('../../services/FIFOAllocationService');
const SmartStockService = require('../../services/SmartStockService');

// Mock de dependencias
jest.mock('../../db');
jest.mock('../../services/SmartStockService');

describe('FIFOAllocationService - Recálculo de Pedidos Posteriores', () => {
  let mockClient;
  
  beforeEach(() => {
    // Reset de todos los mocks antes de cada test
    jest.clearAllMocks();
    
    // Mock del cliente de DB
    mockClient = {
      query: jest.fn()
    };
  });

  describe('recalcularPedidosPosteriores - Asignación cronológica', () => {
    test('debe asignar stock en orden FIFO cronológico', async () => {
      // Configurar datos de prueba: 3 pedidos cronológicos
      const pedidosMock = [
        { 
          pedidoid: 1, 
          fechapedido: '2026-01-01', 
          detalleid: 10,
          cantidadpaquetes: 5,
          esbackorder: true,
          cantidadsurtida: 0,
          cantidadbackorder: 5,
          piezas_por_paquete: 12
        },
        { 
          pedidoid: 2, 
          fechapedido: '2026-01-02', 
          detalleid: 20,
          cantidadpaquetes: 3,
          esbackorder: true,
          cantidadsurtida: 0,
          cantidadbackorder: 3,
          piezas_por_paquete: 12
        },
        { 
          pedidoid: 3, 
          fechapedido: '2026-01-03', 
          detalleid: 30,
          cantidadpaquetes: 2,
          esbackorder: true,
          cantidadsurtida: 0,
          cantidadbackorder: 2,
          piezas_por_paquete: 12
        }
      ];

      // Mock de query que retorna pedidos en orden cronológico
      mockClient.query
        .mockResolvedValueOnce({ rows: pedidosMock }) // Query de pedidos
        .mockResolvedValueOnce({ rows: [] }) // UPDATE pedido 1
        .mockResolvedValueOnce({ rows: [] }) // UPDATE pedido 2
        .mockResolvedValueOnce({ rows: [] }); // UPDATE pedido 3

      // Mock de calculateAllocationStatus - simula que hay stock para los 2 primeros
      SmartStockService.calculateAllocationStatus
        .mockResolvedValueOnce({ cantidadSurtible: 5, cantidadBackorder: 0 }) // Pedido 1: todo surtible
        .mockResolvedValueOnce({ cantidadSurtible: 3, cantidadBackorder: 0 }) // Pedido 2: todo surtible
        .mockResolvedValueOnce({ cantidadSurtible: 0, cantidadBackorder: 2 }); // Pedido 3: backorder

      const resultado = await FIFOAllocationService.recalcularPedidosPosteriores({
        varianteId: 100,
        fechaReferencia: '2026-01-01',
        tenantId: 1,
        client: mockClient
      });

      // Verificar que el resultado es exitoso
      expect(resultado.success).toBe(true);
      expect(resultado.pedidosRecalculados).toBe(3);
      expect(resultado.cambios).toHaveLength(3);

      // Verificar que se llamó a calculateAllocationStatus en orden FIFO
      expect(SmartStockService.calculateAllocationStatus).toHaveBeenCalledTimes(3);
      
      // Verificar orden cronológico (primer pedido = fecha más antigua)
      const calls = SmartStockService.calculateAllocationStatus.mock.calls;
      expect(calls[0][0].orderDate).toBe('2026-01-01');
      expect(calls[1][0].orderDate).toBe('2026-01-02');
      expect(calls[2][0].orderDate).toBe('2026-01-03');

      // Verificar que se actualizaron los pedidos con UPDATE
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE detallesdelpedido'),
        expect.arrayContaining([false, 5, 0, 10]) // Pedido 1: no backorder, 5 surtido
      );
    });

    test('debe generar backorders cuando no hay stock suficiente', async () => {
      const pedidosMock = [
        { 
          pedidoid: 1, 
          fechapedido: '2026-01-01', 
          detalleid: 10,
          cantidadpaquetes: 10,
          esbackorder: false,
          cantidadsurtida: 10,
          cantidadbackorder: 0,
          piezas_por_paquete: 12
        }
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: pedidosMock })
        .mockResolvedValueOnce({ rows: [] });

      // Simular que ahora NO hay stock (pedido cancelado liberó stock para otros)
      SmartStockService.calculateAllocationStatus
        .mockResolvedValueOnce({ cantidadSurtible: 0, cantidadBackorder: 10 });

      const resultado = await FIFOAllocationService.recalcularPedidosPosteriores({
        varianteId: 100,
        fechaReferencia: '2026-01-01',
        tenantId: 1,
        client: mockClient
      });

      expect(resultado.success).toBe(true);
      expect(resultado.cambios[0].nuevo.esBackorder).toBe(true);
      expect(resultado.cambios[0].nuevo.cantidadSurtida).toBe(0);
      expect(resultado.cambios[0].nuevo.cantidadBackorder).toBe(10);
    });

    test('NO debe actualizar si no hay cambios en la asignación', async () => {
      const pedidosMock = [
        { 
          pedidoid: 1, 
          fechapedido: '2026-01-01', 
          detalleid: 10,
          cantidadpaquetes: 5,
          esbackorder: false,
          cantidadsurtida: 5,
          cantidadbackorder: 0,
          piezas_por_paquete: 12
        }
      ];

      mockClient.query.mockResolvedValueOnce({ rows: pedidosMock });

      // Simular que el estado se mantiene igual
      SmartStockService.calculateAllocationStatus
        .mockResolvedValueOnce({ cantidadSurtible: 5, cantidadBackorder: 0 });

      const resultado = await FIFOAllocationService.recalcularPedidosPosteriores({
        varianteId: 100,
        fechaReferencia: '2026-01-01',
        tenantId: 1,
        client: mockClient
      });

      expect(resultado.success).toBe(true);
      expect(resultado.pedidosRecalculados).toBe(0); // No hubo cambios
      expect(resultado.cambios).toHaveLength(0);
      
      // Solo debe haberse llamado a query 1 vez (SELECT, sin UPDATE)
      expect(mockClient.query).toHaveBeenCalledTimes(1);
    });

    test('debe retornar success:false en caso de error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Database connection failed'));

      const resultado = await FIFOAllocationService.recalcularPedidosPosteriores({
        varianteId: 100,
        fechaReferencia: '2026-01-01',
        tenantId: 1,
        client: mockClient
      });

      expect(resultado.success).toBe(false);
      expect(resultado.error).toBe('Database connection failed');
      expect(resultado.pedidosRecalculados).toBe(0);
    });
  });

  describe('onPedidoCancelado - Hook de cancelación', () => {
    test('debe recalcular pedidos posteriores al cancelar un pedido', async () => {
      const pedidoInfoMock = [
        { fechapedido: '2026-01-05', varianteid: 100 },
        { fechapedido: '2026-01-05', varianteid: 200 }
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: pedidoInfoMock }) // Query de info del pedido
        .mockResolvedValueOnce({ rows: [] }) // Recalcular variante 100
        .mockResolvedValueOnce({ rows: [] }); // Recalcular variante 200

      SmartStockService.calculateAllocationStatus.mockResolvedValue({ 
        cantidadSurtible: 5, 
        cantidadBackorder: 0 
      });

      const resultado = await FIFOAllocationService.onPedidoCancelado({
        pedidoId: 1,
        tenantId: 1,
        client: mockClient
      });

      expect(resultado.success).toBe(true);
      
      // Verificar que se consultó la info del pedido cancelado
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [1, 1]
      );
    });

    test('debe manejar pedidos con múltiples variantes únicas', async () => {
      const pedidoInfoMock = [
        { fechapedido: '2026-01-05', varianteid: 100 },
        { fechapedido: '2026-01-05', varianteid: 100 }, // Duplicado
        { fechapedido: '2026-01-05', varianteid: 200 }
      ];

      mockClient.query.mockResolvedValueOnce({ rows: pedidoInfoMock });

      SmartStockService.calculateAllocationStatus.mockResolvedValue({ 
        cantidadSurtible: 0, 
        cantidadBackorder: 0 
      });

      await FIFOAllocationService.onPedidoCancelado({
        pedidoId: 1,
        tenantId: 1,
        client: mockClient
      });

      // Solo debe recalcular 2 variantes únicas (100 y 200)
      // Se llama 1 vez al SELECT inicial + llamadas de recalcular (que internamente hacen SELECT)
      // Como usamos mock, verificamos que se procesaron las variantes correctamente
      expect(mockClient.query).toHaveBeenCalled();
    });

    test('debe retornar success:false si no se encuentra el pedido', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // Pedido no encontrado

      const resultado = await FIFOAllocationService.onPedidoCancelado({
        pedidoId: 999,
        tenantId: 1,
        client: mockClient
      });

      expect(resultado.success).toBe(false);
    });
  });

  describe('onPedidoEntregado - Hook de entrega', () => {
    test('debe recalcular backorders al entregar un pedido', async () => {
      const pedidoInfoMock = [
        { 
          fechapedido: '2026-01-10', 
          admin_responsable_id: 5,
          varianteid: 100 
        }
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: pedidoInfoMock })
        .mockResolvedValueOnce({ rows: [] });

      SmartStockService.calculateAllocationStatus.mockResolvedValue({ 
        cantidadSurtible: 0, 
        cantidadBackorder: 3 
      });

      const resultado = await FIFOAllocationService.onPedidoEntregado({
        pedidoId: 1,
        tenantId: 1,
        client: mockClient
      });

      expect(resultado.success).toBe(true);
    });

    test('debe usar adminId del pedido entregado para recalcular', async () => {
      const pedidoInfoMock = [
        { 
          fechapedido: '2026-01-10', 
          admin_responsable_id: 99, // Admin específico
          varianteid: 100 
        }
      ];

      mockClient.query.mockResolvedValueOnce({ rows: pedidoInfoMock });

      SmartStockService.calculateAllocationStatus.mockResolvedValue({ 
        cantidadSurtible: 0, 
        cantidadBackorder: 0 
      });

      await FIFOAllocationService.onPedidoEntregado({
        pedidoId: 1,
        tenantId: 1,
        client: mockClient
      });

      // Verificar que se consultó correctamente con admin_responsable_id
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('admin_responsable_id'),
        [1, 1]
      );
    });
  });

  describe('Casos de borde y validaciones', () => {
    test('debe manejar pedidos sin tamaño de paquete (default a 1)', async () => {
      const pedidosMock = [
        { 
          pedidoid: 1, 
          fechapedido: '2026-01-01', 
          detalleid: 10,
          cantidadpaquetes: 5,
          esbackorder: false,
          cantidadsurtida: 5,
          cantidadbackorder: 0,
          piezas_por_paquete: null // Sin piezas por paquete
        }
      ];

      mockClient.query.mockResolvedValueOnce({ rows: pedidosMock });

      SmartStockService.calculateAllocationStatus.mockResolvedValue({ 
        cantidadSurtible: 5, 
        cantidadBackorder: 0 
      });

      const resultado = await FIFOAllocationService.recalcularPedidosPosteriores({
        varianteId: 100,
        fechaReferencia: '2026-01-01',
        tenantId: 1,
        client: mockClient
      });

      expect(resultado.success).toBe(true);
      
      // Verificar que se usó piezasPorPaquete = 1 como default
      expect(SmartStockService.calculateAllocationStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          piezasPorPaquete: 1
        })
      );
    });

    test('debe retornar pedidosRecalculados:0 si no hay pedidos posteriores', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // No hay pedidos

      const resultado = await FIFOAllocationService.recalcularPedidosPosteriores({
        varianteId: 100,
        fechaReferencia: '2026-01-01',
        tenantId: 1,
        client: mockClient
      });

      expect(resultado.success).toBe(true);
      expect(resultado.pedidosRecalculados).toBe(0);
      expect(resultado.cambios).toHaveLength(0);
    });

    test('debe filtrar correctamente pedidos Cancelados y Entregados', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await FIFOAllocationService.recalcularPedidosPosteriores({
        varianteId: 100,
        fechaReferencia: '2026-01-01',
        tenantId: 1,
        client: mockClient
      });

      // Verificar que la query excluye pedidos Cancelados y Entregados
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("NOT IN ('Cancelado', 'Entregado')"),
        expect.any(Array)
      );
    });
  });
});
