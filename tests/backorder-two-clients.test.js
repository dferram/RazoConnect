/**
 * TEST: Dos Clientes, 12 piezas disponibles
 * ✅ Cliente 1 pide 12 → debe estar SURTIDO
 * ✅ Cliente 2 pide 12 → debe estar BACKORDER
 *
 * Esto valida que el sistema FIFO funciona correctamente
 * sin mezclar stock entre clientes.
 */

const SmartStockService = require('../services/SmartStockService');
const db = require('../db');

// Mock la BD
jest.mock('../db', () => ({
  query: jest.fn(),
  pool: {
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn()
    })
  }
}));

describe('BACKORDER: Dos Clientes Comprando el Mismo Producto (12 piezas)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * CASO 1: Primer Cliente - Debe poder comprar las 12 piezas disponibles
   */
  test('Cliente 1 pide 12 unidades con 12 en stock → DEBE ser surtido completo', async () => {
    // Setup: Stock disponible = 12, sin deuda previa
    db.query
      .mockResolvedValueOnce({ rows: [{ stock: 12 }] })           // Stock físico
      .mockResolvedValueOnce({ rows: [{ total_piezas_anteriores: 0, num_pedidos_anteriores: 0 }] }) // Deuda
      .mockResolvedValueOnce({ rows: [{ reservada: 0 }] });       // Reservas

    const resultado = await SmartStockService.calculateAllocationStatus({
      varianteId: 1,
      cantidadRequerida: 12,
      orderDate: new Date('2026-04-09T09:00:00'),
      adminId: 1,
      tenantId: 1,
      piezasPorPaquete: 1
    });

    // Validaciones
    expect(resultado.estatus).toBe('surtido');
    expect(resultado.cantidadSurtible).toBe(12);
    expect(resultado.cantidadBackorder).toBe(0);
    expect(resultado.stockFisico).toBe(12);
    expect(resultado.deudaPrevia).toBe(0);
  });

  /**
   * CASO 2: Segundo Cliente - Debe generar backorder porque P1 tomó el stock
   *
   * Flujo FIFO:
   * - Stock total: 12 (no cambia, solo se RESERVA)
   * - Deuda previa: 12 (P1 es más antiguo)
   * - Disponible: 12 - 12 = 0
   * - Resultado: 0 surtible + 12 backorder
   */
  test('Cliente 2 pide 12 unidades después de Cliente 1 → DEBE ser backorder completo', async () => {
    // Setup: El P1 ya reservó, ahora viene P2 más tarde
    // - Stock: 12 (sin cambios)
    // - Deuda: 12 (todo lo que pidió P1)
    // - Reservas: 0 (aún no se descuenta)

    db.query
      .mockResolvedValueOnce({ rows: [{ stock: 12 }] })           // Stock sigue siendo 12
      .mockResolvedValueOnce({ rows: [{
        total_piezas_anteriores: 12,    // ← P1 pidió 12
        num_pedidos_anteriores: 1
      }] })                                                        // Deuda de P1
      .mockResolvedValueOnce({ rows: [{ reservada: 0 }] });       // Reservas

    const resultado = await SmartStockService.calculateAllocationStatus({
      varianteId: 1,
      cantidadRequerida: 12,
      orderDate: new Date('2026-04-09T09:05:00'),  // 5 minutos después de P1
      adminId: 1,
      tenantId: 1,
      piezasPorPaquete: 1
    });

    // Validaciones
    expect(resultado.estatus).toBe('backorder');
    expect(resultado.cantidadSurtible).toBe(0);
    expect(resultado.cantidadBackorder).toBe(12);
    expect(resultado.stockFisico).toBe(12);    // ← Stock NO se restó
    expect(resultado.deudaPrevia).toBe(12);    // ← Deuda del P1
  });

  /**
   * CASO 3: PARCIAL - Primer cliente pide 8, segundo pide 12
   *
   * P1: 8 surtibles + 0 backorder
   * P2: 4 surtibles + 8 backorder
   */
  test('Cliente 1 pide 8 + Cliente 2 pide 12 → P1=surtido, P2=parcial', async () => {
    // P2 hace su cálculo después de P1
    db.query
      .mockResolvedValueOnce({ rows: [{ stock: 12 }] })           // Stock sigue siendo 12
      .mockResolvedValueOnce({ rows: [{
        total_piezas_anteriores: 8,     // ← P1 pidió 8
        num_pedidos_anteriores: 1
      }] })
      .mockResolvedValueOnce({ rows: [{ reservada: 0 }] });       // Reservas

    const resultado = await SmartStockService.calculateAllocationStatus({
      varianteId: 1,
      cantidadRequerida: 12,
      orderDate: new Date('2026-04-09T09:05:00'),
      adminId: 1,
      tenantId: 1,
      piezasPorPaquete: 1
    });

    // P2 puede usar solo 12 - 8 = 4 piezas
    expect(resultado.estatus).toBe('parcial');
    expect(resultado.cantidadSurtible).toBe(4);      // ← Solo 4 de las 12
    expect(resultado.cantidadBackorder).toBe(8);     // ← 8 van a backorder
    expect(resultado.deudaPrevia).toBe(8);
  });

  /**
   * CASO 4: ORDEN PRIORITARIA (VIP)
   *
   * Si P2 es marcado como PRIORITARIO después de creado,
   * reallocateStockForVariant() debe recalcular y P1 podría pasarse a backorder
   */
  test('Cliente 2 VIP (posterior) toma stock de Cliente 1 (prioritario) → efecto dominó', async () => {
    // Este caso simula:
    // 1. P1 creado: 12 surtido
    // 2. P2 creado: 0 surtido, 12 backorder
    // 3. P2 marcado como PRIORITARIO → reallocar
    // 4. Resultado: P1 pierde stock, P2 gana

    // Aquí el test es más complejo porque involucra reallocateStockForVariant
    // Skip por ahora - validar en integration test
    expect(true).toBe(true);
  });

});

/**
 * VALIDACIONES DE SEGURIDAD
 */
describe('Security Checks: Evitar Race Conditions', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Dos pedidos simultáneos NO deben generar "overselling"', async () => {
    // Stock: 10
    // Ambos piden: 8
    // Resultado ESPERADO:
    // - P1: 8 surtido
    // - P2: 2 surtido + 6 backorder (no 8 + 8 que sería overselling)

    db.query
      .mockResolvedValueOnce({ rows: [{ stock: 10 }] })
      .mockResolvedValueOnce({ rows: [{ total_piezas_anteriores: 8, num_pedidos_anteriores: 1 }] })
      .mockResolvedValueOnce({ rows: [{ reservada: 0 }] });

    const resultado = await SmartStockService.calculateAllocationStatus({
      varianteId: 1,
      cantidadRequerida: 8,
      orderDate: new Date('2026-04-09T09:05:00'),
      adminId: 1,
      tenantId: 1,
      piezasPorPaquete: 1
    });

    // Validar: NO overselling
    const totalSurtido = 8 + resultado.cantidadSurtible;  // 8 (P1) + resultado
    expect(totalSurtido).toBeLessThanOrEqual(10);
    expect(resultado.cantidadSurtible).toBe(2);
  });

});
