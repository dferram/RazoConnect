/**
 * Tests unitarios para pedidoStatus.js
 * @jest-environment node
 */

const { calcularEstadoPedido } = require('../../../utils/pedidoStatus');

describe('calcularEstadoPedido', () => {
  test('debe retornar "Pendiente" cuando no hay detalles', () => {
    expect(calcularEstadoPedido([])).toBe('Pendiente');
    expect(calcularEstadoPedido(null)).toBe('Pendiente');
    expect(calcularEstadoPedido(undefined)).toBe('Pendiente');
  });

  test('debe retornar "Pendiente" cuando ningún producto está surtido', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 0 },
      { cantidad_pedida: 5, cantidad_surtida: 0 },
      { cantidad_pedida: 2, cantidad_surtida: 0 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe('Pendiente');
  });

  test('debe retornar "Parcialmente Surtido" cuando algún producto está surtido pero no todos', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 10 },
      { cantidad_pedida: 5, cantidad_surtida: 0 },
      { cantidad_pedida: 2, cantidad_surtida: 0 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe('Parcialmente Surtido');
  });

  test('debe retornar "Parcialmente Surtido" cuando algún producto está parcialmente surtido', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 5 },
      { cantidad_pedida: 5, cantidad_surtida: 3 },
      { cantidad_pedida: 2, cantidad_surtida: 2 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe('Parcialmente Surtido');
  });

  test('debe retornar "Surtido" cuando todos los productos están completamente surtidos', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 10 },
      { cantidad_pedida: 5, cantidad_surtida: 5 },
      { cantidad_pedida: 2, cantidad_surtida: 2 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe('Surtido');
  });

  test('debe retornar "Surtido" cuando las cantidades surtidas exceden las pedidas', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 12 },
      { cantidad_pedida: 5, cantidad_surtida: 5 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe('Surtido');
  });

  test('debe manejar nombres de campos alternativos (cantidadpaquetes, cantidadsurtida)', () => {
    const detalles = [
      { cantidadpaquetes: 10, cantidadsurtida: 10 },
      { cantidadpaquetes: 5, cantidadsurtida: 5 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe('Surtido');
  });

  test('debe manejar valores null y undefined como 0', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: null },
      { cantidad_pedida: 5, cantidad_surtida: undefined }
    ];
    expect(calcularEstadoPedido(detalles)).toBe('Pendiente');
  });

  test('debe manejar cantidades como strings', () => {
    const detalles = [
      { cantidad_pedida: '10', cantidad_surtida: '10' },
      { cantidad_pedida: '5', cantidad_surtida: '5' }
    ];
    expect(calcularEstadoPedido(detalles)).toBe('Surtido');
  });

  test('caso real: pedido de prueba A=10, B=5, C=2 con A surtido', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 10 },
      { cantidad_pedida: 5, cantidad_surtida: 0 },
      { cantidad_pedida: 2, cantidad_surtida: 0 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe('Parcialmente Surtido');
  });

  test('caso real: pedido de prueba con todos surtidos', () => {
    const detalles = [
      { cantidad_pedida: 10, cantidad_surtida: 10 },
      { cantidad_pedida: 5, cantidad_surtida: 5 },
      { cantidad_pedida: 2, cantidad_surtida: 2 }
    ];
    expect(calcularEstadoPedido(detalles)).toBe('Surtido');
  });
});
