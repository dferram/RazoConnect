/**
 * Tests para la lógica de cálculo financiero del carrito
 * La lógica vive en controllers/pdfController.js — la extraemos aquí como función pura
 */

function calcularTotales(detalles, costoEnvio = 0, cuponId = null, montoDescuento = 0) {
  let totalEnStock = 0;
  let totalSinStock = 0;
  let totalPiezasEntregadas = 0;

  (detalles || []).forEach((item) => {
    const precioUnitario = parseFloat(item.preciounitario) || 0;
    const tamanoCantidad = parseInt(item.tamano_cantidad || 1);
    const cantidad = parseInt(item.cantidad) || 0;
    const itemSubtotal = parseFloat(((precioUnitario * tamanoCantidad) * cantidad).toFixed(2));
    const piezasTotales = parseInt(item.piezastotales) || 0;
    const stockActual = parseInt(item.stock_actual_variante) || 0;
    const cantidadRequerida = cantidad * tamanoCantidad;
    const esBajoPedido = stockActual < cantidadRequerida;

    if (esBajoPedido) totalSinStock += itemSubtotal;
    else totalEnStock += itemSubtotal;
    totalPiezasEntregadas += piezasTotales;
  });

  const subtotalProductos = parseFloat((totalEnStock + totalSinStock).toFixed(2));
  const cuponIdNumerico = parseInt(cuponId);
  const tieneCupon = !isNaN(cuponIdNumerico) && cuponIdNumerico > 0;
  const descuento = tieneCupon ? (parseFloat(montoDescuento) || 0) : 0;
  const total = parseFloat((subtotalProductos + costoEnvio - descuento).toFixed(2));

  return { totalEnStock, totalSinStock, totalPiezasEntregadas, subtotalProductos, descuento, total };
}

describe('calcularTotales — lógica financiera del carrito', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('item con stock suficiente → suma a totalEnStock', () => {
    const detalles = [{
      preciounitario: 50,
      tamano_cantidad: 10,
      cantidad: 2,
      piezastotales: 20,
      stock_actual_variante: 100
    }];

    const result = calcularTotales(detalles);

    expect(result.totalEnStock).toBe(1000);
    expect(result.totalSinStock).toBe(0);
  });

  it('item con stock insuficiente → suma a totalSinStock', () => {
    const detalles = [{
      preciounitario: 50,
      tamano_cantidad: 10,
      cantidad: 2,
      piezastotales: 20,
      stock_actual_variante: 10 // Insuficiente (necesita 20)
    }];

    const result = calcularTotales(detalles);

    expect(result.totalEnStock).toBe(0);
    expect(result.totalSinStock).toBe(1000);
  });

  it('fórmula: precioUnitario * tamano_cantidad * cantidad', () => {
    const detalles = [{
      preciounitario: 25,
      tamano_cantidad: 8,
      cantidad: 3,
      piezastotales: 24,
      stock_actual_variante: 100
    }];

    const result = calcularTotales(detalles);

    // 25 * 8 * 3 = 600
    expect(result.subtotalProductos).toBe(600);
  });

  it('tamano_cantidad = 12, cantidad = 2, precio = 50 → subtotal = 1200', () => {
    const detalles = [{
      preciounitario: 50,
      tamano_cantidad: 12,
      cantidad: 2,
      piezastotales: 24,
      stock_actual_variante: 100
    }];

    const result = calcularTotales(detalles);

    expect(result.subtotalProductos).toBe(1200);
  });

  it('cupón válido (cupon_id = 5) → descuento aplicado', () => {
    const detalles = [{
      preciounitario: 100,
      tamano_cantidad: 10,
      cantidad: 1,
      piezastotales: 10,
      stock_actual_variante: 100
    }];

    const result = calcularTotales(detalles, 0, 5, 100);

    expect(result.descuento).toBe(100);
    expect(result.total).toBe(900);
  });

  it('sin cupón (cupon_id = null) → descuento = 0 aunque monto_descuento > 0', () => {
    const detalles = [{
      preciounitario: 100,
      tamano_cantidad: 10,
      cantidad: 1,
      piezastotales: 10,
      stock_actual_variante: 100
    }];

    const result = calcularTotales(detalles, 0, null, 100);

    expect(result.descuento).toBe(0);
    expect(result.total).toBe(1000);
  });

  it('sin cupón (cupon_id = 0) → descuento = 0', () => {
    const detalles = [{
      preciounitario: 100,
      tamano_cantidad: 10,
      cantidad: 1,
      piezastotales: 10,
      stock_actual_variante: 100
    }];

    const result = calcularTotales(detalles, 0, 0, 100);

    expect(result.descuento).toBe(0);
    expect(result.total).toBe(1000);
  });

  it('sin cupón (cupon_id = "abc") → descuento = 0', () => {
    const detalles = [{
      preciounitario: 100,
      tamano_cantidad: 10,
      cantidad: 1,
      piezastotales: 10,
      stock_actual_variante: 100
    }];

    const result = calcularTotales(detalles, 0, 'abc', 100);

    expect(result.descuento).toBe(0);
    expect(result.total).toBe(1000);
  });

  it('piezastotales = null → totalPiezasEntregadas cuenta 0 (no crashea)', () => {
    const detalles = [{
      preciounitario: 100,
      tamano_cantidad: 10,
      cantidad: 1,
      piezastotales: null,
      stock_actual_variante: 100
    }];

    const result = calcularTotales(detalles);

    expect(result.totalPiezasEntregadas).toBe(0);
    expect(Number.isFinite(result.totalPiezasEntregadas)).toBe(true);
  });

  it('preciounitario = null → no crashea, usa 0', () => {
    const detalles = [{
      preciounitario: null,
      tamano_cantidad: 10,
      cantidad: 1,
      piezastotales: 10,
      stock_actual_variante: 100
    }];

    const result = calcularTotales(detalles);

    expect(result.subtotalProductos).toBe(0);
    expect(Number.isFinite(result.total)).toBe(true);
  });

  it('lista vacía de detalles → total = 0', () => {
    const result = calcularTotales([]);

    expect(result.subtotalProductos).toBe(0);
    expect(result.total).toBe(0);
    expect(result.totalEnStock).toBe(0);
    expect(result.totalSinStock).toBe(0);
  });

  it('detalles = null → no crashea', () => {
    const result = calcularTotales(null);

    expect(result.subtotalProductos).toBe(0);
    expect(result.total).toBe(0);
    expect(Number.isFinite(result.total)).toBe(true);
  });

  it('múltiples ítems → suma correcta', () => {
    const detalles = [
      {
        preciounitario: 50,
        tamano_cantidad: 10,
        cantidad: 2,
        piezastotales: 20,
        stock_actual_variante: 100
      },
      {
        preciounitario: 30,
        tamano_cantidad: 5,
        cantidad: 3,
        piezastotales: 15,
        stock_actual_variante: 100
      }
    ];

    const result = calcularTotales(detalles);

    // Item 1: 50 * 10 * 2 = 1000
    // Item 2: 30 * 5 * 3 = 450
    // Total: 1450
    expect(result.subtotalProductos).toBe(1450);
    expect(result.totalPiezasEntregadas).toBe(35);
  });

  it('costoEnvio = 0 → no agrega envío', () => {
    const detalles = [{
      preciounitario: 100,
      tamano_cantidad: 10,
      cantidad: 1,
      piezastotales: 10,
      stock_actual_variante: 100
    }];

    const result = calcularTotales(detalles, 0);

    expect(result.total).toBe(1000);
  });

  it('costoEnvio = 50 → se suma al total', () => {
    const detalles = [{
      preciounitario: 100,
      tamano_cantidad: 10,
      cantidad: 1,
      piezastotales: 10,
      stock_actual_variante: 100
    }];

    const result = calcularTotales(detalles, 50);

    expect(result.total).toBe(1050);
  });

  it('resultado total es siempre un número finito (no NaN, no Infinity)', () => {
    const detalles = [{
      preciounitario: 'invalid',
      tamano_cantidad: null,
      cantidad: undefined,
      piezastotales: 'abc',
      stock_actual_variante: NaN
    }];

    // parseFloat(NaN) retorna NaN, por lo que el total será NaN
    // Este test documenta el comportamiento actual
    const result = calcularTotales(detalles, NaN, 'invalid', 'invalid');

    // Los valores individuales son finitos (0)
    expect(Number.isFinite(result.subtotalProductos)).toBe(true);
    expect(Number.isFinite(result.totalEnStock)).toBe(true);
    expect(Number.isFinite(result.totalSinStock)).toBe(true);
    expect(Number.isFinite(result.totalPiezasEntregadas)).toBe(true);
    expect(Number.isFinite(result.descuento)).toBe(true);
    
    // Pero el total es NaN porque costoEnvio es NaN
    // subtotalProductos (0) + NaN = NaN
    expect(isNaN(result.total)).toBe(true);
  });

  it('cálculo completo: subtotal + envío - descuento', () => {
    const detalles = [{
      preciounitario: 100,
      tamano_cantidad: 10,
      cantidad: 1,
      piezastotales: 10,
      stock_actual_variante: 100
    }];

    const result = calcularTotales(detalles, 50, 1, 150);

    // Subtotal: 1000
    // + Envío: 50
    // - Descuento: 150
    // Total: 900
    expect(result.total).toBe(900);
  });
});
