/**
 * Tests unitarios para pedidoStatus.js
 * @jest-environment node
 */

const { calcularEstadoPedido } = require('../../../utils/pedidoStatus');
const { ESTADOS_PEDIDO } = require('../../../utils/pedidoEstados');

describe('calcularEstadoPedido', () => {
  test('debe retornar "Pendiente" cuando no hay detalles', () => {
    expect(calcularEstadoPedido([])).toBe(ESTADOS_PEDIDO.PENDIENTE);
    expect(calcularEstadoPedido(null)).toBe(ESTADOS_PEDIDO.PENDIENTE);
    expect(calcularEstadoPedido(undefined)).toBe(ESTADOS_PEDIDO.PENDIENTE);
  });

  test('debe retornar "Pendiente" cuando ningún producto está surtido', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 0, esbackorder: false },
      { cantidad_pedida: 5, cantidad_surtida: 0, esbackorder: false },
      { cantidad_pedida: 2, cantidad_surtida: 0, esbackorder: false }
    ];
    // Si no hay surtidos y todos tienen stock → COMPLETO
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.COMPLETO);
  });

  test('debe retornar "Surtido Parcial" cuando algún producto está surtido pero no todos', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 10 },
      { cantidad_pedida: 5, cantidad_surtida: 0 },
      { cantidad_pedida: 2, cantidad_surtida: 0 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.SURTIDO_PARCIAL);
  });

  test('debe retornar "Surtido Parcial" cuando algún producto está parcialmente surtido', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 5, esbackorder: false },
      { cantidad_pedida: 5, cantidad_surtida: 3, esbackorder: false },
      { cantidad_pedida: 2, cantidad_surtida: 2, esbackorder: false }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.SURTIDO_PARCIAL);
  });

  test('debe retornar "Surtido Completo" cuando todos los productos están completamente surtidos', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 10 },
      { cantidad_pedida: 5, cantidad_surtida: 5 },
      { cantidad_pedida: 2, cantidad_surtida: 2 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.SURTIDO_COMPLETO);
  });

  test('debe retornar "Surtido Completo" cuando las cantidades surtidas exceden las pedidas', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 12 },
      { cantidad_pedida: 5, cantidad_surtida: 5 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.SURTIDO_COMPLETO);
  });

  test('debe manejar nombres de campos alternativos (cantidadpaquetes, cantidadsurtida)', () => {
    const detalles = [
      { cantidadpaquetes: 10, cantidadsurtida: 10 },
      { cantidadpaquetes: 5, cantidadsurtida: 5 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.SURTIDO_COMPLETO);
  });

  test('debe manejar valores null y undefined como 0', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: null, esbackorder: false },
      { cantidad_pedida: 5, cantidad_surtida: undefined, esbackorder: false }
    ];
    // Sin surtidos y todos tienen stock → COMPLETO
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.COMPLETO);
  });

  test('debe manejar cantidades como strings', () => {
    const detalles = [
      { cantidad_pedida: '10', cantidad_surtida: '10' },
      { cantidad_pedida: '5', cantidad_surtida: '5' }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.SURTIDO_COMPLETO);
  });

  test('caso real: pedido de prueba A=10, B=5, C=2 con A surtido', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 10 },
      { cantidad_pedida: 5, cantidad_surtida: 0 },
      { cantidad_pedida: 2, cantidad_surtida: 0 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.SURTIDO_PARCIAL);
  });

  test('caso real: pedido de prueba con todos surtidos', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 10 },
      { cantidad_pedida: 5, cantidad_surtida: 5 },
      { cantidad_pedida: 2, cantidad_surtida: 2 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.SURTIDO_COMPLETO);
  });

  // ============================================================
  // TESTS PARA ESTADO "BAJO PEDIDO" (Bug Fix - Abril 2026)
  // ============================================================
  // Verifica que un pedido sea "Bajo pedido" SOLO si TODOS los productos son backorder

  test('BAJO PEDIDO: debe retornar "Bajo pedido" cuando TODOS los productos son backorder (sin ninguno con stock)', () => {
    const detalles = [
      { cantidadpaquetes: 10, cantidadsurtida: 0, esbackorder: true },
      { cantidadpaquetes: 5, cantidadsurtida: 0, esbackorder: true },
      { cantidadpaquetes: 2, cantidadsurtida: 0, esbackorder: true }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.BAJO_PEDIDO);
  });

  test('BAJO PEDIDO: NO debe retornar "Bajo Pedido" si algún producto tiene stock (COMBINADO)', () => {
    const detalles = [
      { cantidadpaquetes: 10, cantidadsurtida: 0, esbackorder: true },
      { cantidadpaquetes: 5, cantidadsurtida: 0, esbackorder: false }, // ← Tiene stock
      { cantidadpaquetes: 2, cantidadsurtida: 0, esbackorder: true }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.COMBINADO);
  });

  test('STOCKS: debe retornar "Completo" cuando TODOS los productos tienen stock (ninguno es backorder)', () => {
    const detalles = [
      { cantidadpaquetes: 10, cantidadsurtida: 0, esbackorder: false },
      { cantidadpaquetes: 5, cantidadsurtida: 0, esbackorder: false },
      { cantidadpaquetes: 2, cantidadsurtida: 0, esbackorder: false }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.COMPLETO);
  });

  test('COMBINADO: debe retornar "Combinado" con mix de backorder y stock', () => {
    const detalles = [
      { cantidadpaquetes: 10, cantidadsurtida: 0, esbackorder: true },
      { cantidadpaquetes: 5, cantidadsurtida: 0, esbackorder: false },
      { cantidadpaquetes: 3, cantidadsurtida: 0, esbackorder: true }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.COMBINADO);
  });

  test('UNDER/NORMAL: Bajo Pedido con parcialmente surtido debería ser "Surtido Parcial" (surtimiento tiene prioridad)', () => {
    const detalles = [
      { cantidadpaquetes: 10, cantidadsurtida: 2, esbackorder: true }, // Parcialmente surtido backorder
      { cantidadpaquetes: 5, cantidadsurtida: 0, esbackorder: true }
    ];
    // Con surtidos parciales, debería ser "Surtido Parcial", no "Bajo Pedido"
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.SURTIDO_PARCIAL);
  });

  test('EDGE CASE: Un solo producto en backorder → Bajo Pedido', () => {
    const detalles = [
      { cantidadpaquetes: 10, cantidadsurtida: 0, esbackorder: true }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.BAJO_PEDIDO);
  });

  test('EDGE CASE: Un solo producto con stock → Completo', () => {
    const detalles = [
      { cantidadpaquetes: 10, cantidadsurtida: 0, esbackorder: false }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.COMPLETO);
  });

  test('VALIDAR: esbackorder puede venir como string "true" o booleano true', () => {
    const detalles = [
      { cantidadpaquetes: 10, cantidadsurtida: 0, esbackorder: 'true' },
      { cantidadpaquetes: 5, cantidadsurtida: 0, esbackorder: true }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.BAJO_PEDIDO);
  });

  test('VALIDAR: esbackorder false como string "false" o booleano false', () => {
    const detalles = [
      { cantidadpaquetes: 10, cantidadsurtida: 0, esbackorder: 'false' },
      { cantidadpaquetes: 5, cantidadsurtida: 0, esbackorder: false }
    ];
    expect(calcularEstadoPedido(detalles)).toBe(ESTADOS_PEDIDO.COMPLETO);
  });
});
