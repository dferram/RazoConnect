/**
 * Tests unitarios para calcularTotalSurtido.js
 * @jest-environment node
 */

const { calcularTotalSurtido, calcularSubtotalSurtido } = require('../../../utils/calcularTotalSurtido');

describe('calcularTotalSurtido', () => {
  test('debe retornar 0 cuando no hay detalles', () => {
    expect(calcularTotalSurtido([])).toBe(0);
    expect(calcularTotalSurtido(null)).toBe(0);
    expect(calcularTotalSurtido(undefined)).toBe(0);
  });

  test('debe calcular total basado en cantidad_surtida y precio_unitario', () => {
    const detalles = [
      { cantidad_surtida: 10, precio_unitario: 5 },
      { cantidad_surtida: 5, precio_unitario: 10 },
      { cantidad_surtida: 2, precio_unitario: 20 }
    ];
    const total = calcularTotalSurtido(detalles);
    expect(total).toBe(140); // 50 + 50 + 40
  });

  test('debe ignorar productos no surtidos (cantidad_surtida = 0)', () => {
    const detalles = [
      { cantidad_surtida: 10, precio_unitario: 5 },
      { cantidad_surtida: 0, precio_unitario: 10 },
      { cantidad_surtida: 2, precio_unitario: 20 }
    ];
    const total = calcularTotalSurtido(detalles);
    expect(total).toBe(90); // 50 + 0 + 40
  });

  test('debe manejar nombres de campos alternativos', () => {
    const detalles = [
      { cantidadsurtida: 10, preciounitario: 5 },
      { cantidadsurtida: 5, precioporpaquete: 10 }
    ];
    const total = calcularTotalSurtido(detalles);
    expect(total).toBe(100); // 50 + 50
  });

  test('debe redondear a 2 decimales', () => {
    const detalles = [
      { cantidad_surtida: 3, precio_unitario: 3.333 }
    ];
    const total = calcularTotalSurtido(detalles);
    expect(total).toBe(10.00); // 9.999 redondeado
  });

  test('debe manejar valores null y undefined como 0', () => {
    const detalles = [
      { cantidad_surtida: null, precio_unitario: 5 },
      { cantidad_surtida: 10, precio_unitario: undefined }
    ];
    const total = calcularTotalSurtido(detalles);
    expect(total).toBe(0);
  });

  test('caso real: A(10,$5), B(5,$10), C(2,$20) con A y B parcialmente surtidos', () => {
    const detalles = [
      { cantidad_surtida: 10, precio_unitario: 5 },
      { cantidad_surtida: 2, precio_unitario: 10 },
      { cantidad_surtida: 0, precio_unitario: 20 }
    ];
    const total = calcularTotalSurtido(detalles);
    expect(total).toBe(70); // 50 + 20 + 0
  });

  test('caso real: todos surtidos completamente', () => {
    const detalles = [
      { cantidad_surtida: 10, precio_unitario: 5 },
      { cantidad_surtida: 5, precio_unitario: 10 },
      { cantidad_surtida: 2, precio_unitario: 20 }
    ];
    const total = calcularTotalSurtido(detalles);
    expect(total).toBe(140); // 50 + 50 + 40
  });
});

describe('calcularSubtotalSurtido', () => {
  test('debe calcular subtotal correctamente', () => {
    expect(calcularSubtotalSurtido(10, 5)).toBe(50);
    expect(calcularSubtotalSurtido(5, 10)).toBe(50);
    expect(calcularSubtotalSurtido(2, 20)).toBe(40);
  });

  test('debe retornar 0 cuando cantidad o precio son 0', () => {
    expect(calcularSubtotalSurtido(0, 5)).toBe(0);
    expect(calcularSubtotalSurtido(10, 0)).toBe(0);
  });

  test('debe redondear a 2 decimales', () => {
    expect(calcularSubtotalSurtido(3, 3.333)).toBe(10.00);
    expect(calcularSubtotalSurtido(7, 1.429)).toBe(10.00);
  });

  test('debe manejar valores null/undefined como 0', () => {
    expect(calcularSubtotalSurtido(null, 5)).toBe(0);
    expect(calcularSubtotalSurtido(10, undefined)).toBe(0);
  });
});
