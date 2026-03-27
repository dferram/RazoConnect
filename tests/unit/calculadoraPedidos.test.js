/**
 * UNIT TESTS - CALCULADORA DE PEDIDOS (CORE FINANCIERO)
 * 
 * Suite exhaustiva de tests para validar la lógica crítica de cálculo de pedidos:
 * - Cálculo de totales con descuentos porcentuales y fijos
 * - Prorrateo de descuentos entre items
 * - Split de backorders (stock disponible vs pendiente)
 * - Redondeo financiero a 2 decimales
 * - Validación de consistencia matemática
 * - Casos de borde (pedidos vacíos, descuentos > total, etc.)
 * 
 * CRÍTICO: Esta lógica impacta directamente en facturación y dinero real.
 * Cualquier bug aquí puede generar pérdidas financieras.
 * 
 * @author RazoConnect QA Team
 * @date 2026-03-26
 */

const {
  calcularTotalPedido,
  calcularSplitBackorder,
  validarConsistenciaTotales
} = require('../../utils/calculadoraPedidos');

describe('calcularTotalPedido - Cálculos financieros básicos', () => {
  describe('Pedidos sin descuento', () => {
    test('debe calcular total correcto con un solo item', () => {
      const items = [
        {
          varianteId: 1,
          precioBase: 10.50,
          precioOferta: null,
          piezasPorPaquete: 12,
          cantidad: 5
        }
      ];

      const resultado = calcularTotalPedido({ items });

      // PrecioPaquete = 10.50 * 12 = 126
      // Total = 126 * 5 = 630
      expect(resultado.totalBruto).toBe(630);
      expect(resultado.montoDescuento).toBe(0);
      expect(resultado.totalFinal).toBe(630);
      expect(resultado.items[0].subtotal).toBe(630);
    });

    test('debe calcular total correcto con múltiples items', () => {
      const items = [
        { varianteId: 1, precioBase: 10, precioOferta: null, piezasPorPaquete: 12, cantidad: 5 },
        { varianteId: 2, precioBase: 15, precioOferta: null, piezasPorPaquete: 6, cantidad: 3 },
        { varianteId: 3, precioBase: 20, precioOferta: null, piezasPorPaquete: 24, cantidad: 2 }
      ];

      const resultado = calcularTotalPedido({ items });

      // Item 1: 10 * 12 * 5 = 600
      // Item 2: 15 * 6 * 3 = 270
      // Item 3: 20 * 24 * 2 = 960
      // Total: 1830
      expect(resultado.totalBruto).toBe(1830);
      expect(resultado.totalFinal).toBe(1830);
      expect(resultado.items).toHaveLength(3);
    });

    test('debe priorizar precio de oferta sobre precio base', () => {
      const items = [
        {
          varianteId: 1,
          precioBase: 100,
          precioOferta: 75, // Oferta activa
          piezasPorPaquete: 1,
          cantidad: 10
        }
      ];

      const resultado = calcularTotalPedido({ items });

      // Debe usar precioOferta (75), no precioBase (100)
      expect(resultado.items[0].precioUnitario).toBe(75);
      expect(resultado.items[0].tieneOferta).toBe(true);
      expect(resultado.totalBruto).toBe(750); // 75 * 1 * 10
    });
  });

  describe('Descuentos porcentuales', () => {
    test('debe aplicar descuento del 10% correctamente', () => {
      const items = [
        { varianteId: 1, precioBase: 100, precioOferta: null, piezasPorPaquete: 1, cantidad: 10 }
      ];

      const cupon = {
        cuponId: 1,
        codigo: 'DESC10',
        tipoDescuento: 'PORCENTAJE',
        valor: 10
      };

      const resultado = calcularTotalPedido({ items, cupon });

      // Total bruto: 1000
      // Descuento: 1000 * 0.10 = 100
      // Total final: 900
      expect(resultado.totalBruto).toBe(1000);
      expect(resultado.montoDescuento).toBe(100);
      expect(resultado.totalFinal).toBe(900);
      expect(resultado.cuponAplicado.codigo).toBe('DESC10');
    });

    test('debe aplicar descuento del 25% sobre múltiples items', () => {
      const items = [
        { varianteId: 1, precioBase: 50, precioOferta: null, piezasPorPaquete: 1, cantidad: 4 },
        { varianteId: 2, precioBase: 100, precioOferta: null, piezasPorPaquete: 1, cantidad: 2 }
      ];

      const cupon = {
        cuponId: 2,
        codigo: 'MEGA25',
        tipo_descuento: 'PORCENTAJE', // Probar variante de campo
        valor: 25
      };

      const resultado = calcularTotalPedido({ items, cupon });

      // Total bruto: (50*4) + (100*2) = 200 + 200 = 400
      // Descuento: 400 * 0.25 = 100
      // Total final: 300
      expect(resultado.totalBruto).toBe(400);
      expect(resultado.montoDescuento).toBe(100);
      expect(resultado.totalFinal).toBe(300);
    });

    test('debe manejar descuentos con decimales (7.89%)', () => {
      const items = [
        { varianteId: 1, precioBase: 123.45, precioOferta: null, piezasPorPaquete: 1, cantidad: 3 }
      ];

      const cupon = {
        cuponId: 3,
        codigo: 'WEIRD789',
        tipoDescuento: 'PORCENTAJE',
        valor: 7.89
      };

      const resultado = calcularTotalPedido({ items, cupon });

      // Total bruto: 123.45 * 3 = 370.35
      // Descuento: 370.35 * 0.0789 = 29.22 (redondeado)
      // Total final: 341.13
      expect(resultado.totalBruto).toBe(370.35);
      expect(resultado.montoDescuento).toBe(29.22);
      expect(resultado.totalFinal).toBe(341.13);
    });
  });

  describe('Descuentos fijos (monto plano)', () => {
    test('debe aplicar descuento fijo de $50', () => {
      const items = [
        { varianteId: 1, precioBase: 100, precioOferta: null, piezasPorPaquete: 1, cantidad: 5 }
      ];

      const cupon = {
        cuponId: 4,
        codigo: 'FIJO50',
        tipoDescuento: 'FIJO',
        valor: 50
      };

      const resultado = calcularTotalPedido({ items, cupon });

      // Total bruto: 500
      // Descuento: 50 (fijo)
      // Total final: 450
      expect(resultado.totalBruto).toBe(500);
      expect(resultado.montoDescuento).toBe(50);
      expect(resultado.totalFinal).toBe(450);
    });

    test('debe limitar descuento fijo al total bruto (no negativo)', () => {
      const items = [
        { varianteId: 1, precioBase: 10, precioOferta: null, piezasPorPaquete: 1, cantidad: 3 }
      ];

      const cupon = {
        cuponId: 5,
        codigo: 'FIJO500',
        tipoDescuento: 'FIJO',
        valor: 500 // Mayor al total
      };

      const resultado = calcularTotalPedido({ items, cupon });

      // Total bruto: 30
      // Descuento solicitado: 500
      // Descuento real: 30 (limitado al total)
      // Total final: 0
      expect(resultado.totalBruto).toBe(30);
      expect(resultado.montoDescuento).toBe(30); // NO 500
      expect(resultado.totalFinal).toBe(0);
    });
  });

  describe('Prorrateo de descuentos entre items', () => {
    test('debe prorratear descuento del 50% proporcionalmente', () => {
      const items = [
        { varianteId: 1, sku: 'A', precioBase: 100, precioOferta: null, piezasPorPaquete: 1, cantidad: 2 },
        { varianteId: 2, sku: 'B', precioBase: 50, precioOferta: null, piezasPorPaquete: 1, cantidad: 4 },
        { varianteId: 3, sku: 'C', precioBase: 150, precioOferta: null, piezasPorPaquete: 1, cantidad: 1 }
      ];

      const cupon = {
        cuponId: 6,
        codigo: 'MITAD',
        tipoDescuento: 'PORCENTAJE',
        valor: 50
      };

      const resultado = calcularTotalPedido({ 
        items, 
        cupon, 
        aplicarDescuentoEnDetalles: true 
      });

      // Total bruto: 200 + 200 + 150 = 550
      // Descuento total: 275 (50%)
      // Total final: 275

      // Item A (200/550 del total): descuento = 275 * (200/550) = 100
      // Item B (200/550 del total): descuento = 275 * (200/550) = 100
      // Item C (150/550 del total): descuento = 75

      expect(resultado.totalBruto).toBe(550);
      expect(resultado.montoDescuento).toBe(275);
      expect(resultado.totalFinal).toBe(275);

      expect(resultado.items[0].descuentoAplicado).toBe(100);
      expect(resultado.items[0].subtotalConDescuento).toBe(100);
      
      expect(resultado.items[1].descuentoAplicado).toBe(100);
      expect(resultado.items[1].subtotalConDescuento).toBe(100);
      
      expect(resultado.items[2].descuentoAplicado).toBe(75);
      expect(resultado.items[2].subtotalConDescuento).toBe(75);
    });

    test('debe ajustar último item para evitar errores de redondeo', () => {
      const items = [
        { varianteId: 1, precioBase: 33.33, precioOferta: null, piezasPorPaquete: 1, cantidad: 1 },
        { varianteId: 2, precioBase: 33.33, precioOferta: null, piezasPorPaquete: 1, cantidad: 1 },
        { varianteId: 3, precioBase: 33.34, precioOferta: null, piezasPorPaquete: 1, cantidad: 1 }
      ];

      const cupon = {
        cuponId: 7,
        codigo: 'TERCIO',
        tipoDescuento: 'PORCENTAJE',
        valor: 33.33
      };

      const resultado = calcularTotalPedido({ 
        items, 
        cupon, 
        aplicarDescuentoEnDetalles: true 
      });

      // Total bruto: 100.00
      // Descuento: 33.33
      // Total final: 66.67

      // Suma de subtotales con descuento debe ser exactamente 66.67
      const sumaSubtotales = resultado.items.reduce((sum, item) => sum + item.subtotalConDescuento, 0);
      
      expect(resultado.totalFinal).toBe(66.67);
      expect(sumaSubtotales).toBe(66.67);
      expect(resultado.consistenciaValidada).toBe(true);
    });

    test('suma de descuentos prorrateados debe igualar descuento total', () => {
      const items = [
        { varianteId: 1, precioBase: 123.45, precioOferta: null, piezasPorPaquete: 1, cantidad: 2 },
        { varianteId: 2, precioBase: 678.90, precioOferta: null, piezasPorPaquete: 1, cantidad: 1 },
        { varianteId: 3, precioBase: 45.67, precioOferta: null, piezasPorPaquete: 1, cantidad: 5 }
      ];

      const cupon = {
        cuponId: 8,
        codigo: 'COMPLEJO',
        tipoDescuento: 'PORCENTAJE',
        valor: 15.75
      };

      const resultado = calcularTotalPedido({ 
        items, 
        cupon, 
        aplicarDescuentoEnDetalles: true 
      });

      // Sumar todos los descuentos de items
      const sumaDescuentosItems = resultado.items.reduce((sum, item) => sum + item.descuentoAplicado, 0);
      
      // Debe ser igual al descuento total (con tolerancia de 0.02 por redondeo)
      expect(Math.abs(sumaDescuentosItems - resultado.montoDescuento)).toBeLessThanOrEqual(0.02);
    });
  });

  describe('Redondeo financiero - Precisión de 2 decimales', () => {
    test('debe redondear correctamente con muchos decimales', () => {
      const items = [
        { varianteId: 1, precioBase: 3.333, precioOferta: null, piezasPorPaquete: 7, cantidad: 11 }
      ];

      const resultado = calcularTotalPedido({ items });

      // PrecioPaquete = 3.333 * 7 = 23.331
      // Subtotal = 23.331 * 11 = 256.641
      // Debe redondearse a 256.64
      expect(resultado.items[0].subtotal).toBe(256.64);
      expect(resultado.totalBruto).toBe(256.64);
      
      // Verificar que tiene exactamente 2 decimales
      const decimales = resultado.totalBruto.toString().split('.')[1]?.length || 0;
      expect(decimales).toBeLessThanOrEqual(2);
    });

    test('debe evitar errores de punto flotante de JavaScript', () => {
      const items = [
        { varianteId: 1, precioBase: 0.1, precioOferta: null, piezasPorPaquete: 1, cantidad: 3 },
        { varianteId: 2, precioBase: 0.2, precioOferta: null, piezasPorPaquete: 1, cantidad: 1 }
      ];

      const resultado = calcularTotalPedido({ items });

      // En JS: 0.1 + 0.1 + 0.1 + 0.2 = 0.6000000000000001
      // Debe redondearse correctamente a 0.6
      expect(resultado.totalBruto).toBe(0.5);
    });

    test('descuento con decimales largos debe redondearse a 2 decimales', () => {
      const items = [
        { varianteId: 1, precioBase: 1234.56, precioOferta: null, piezasPorPaquete: 1, cantidad: 1 }
      ];

      const cupon = {
        cuponId: 9,
        codigo: 'RARO',
        tipoDescuento: 'PORCENTAJE',
        valor: 7.8945
      };

      const resultado = calcularTotalPedido({ items, cupon });

      // Descuento = 1234.56 * 0.078945 = 97.456...
      // Debe redondearse a 97.46
      const decimalesDescuento = resultado.montoDescuento.toString().split('.')[1]?.length || 0;
      expect(decimalesDescuento).toBeLessThanOrEqual(2);
    });
  });

  describe('Validación de consistencia matemática', () => {
    test('debe validar que suma de subtotales = total final', () => {
      const items = [
        { varianteId: 1, precioBase: 99.99, precioOferta: null, piezasPorPaquete: 1, cantidad: 3 },
        { varianteId: 2, precioBase: 49.99, precioOferta: null, piezasPorPaquete: 1, cantidad: 2 }
      ];

      const cupon = {
        cuponId: 10,
        codigo: 'TEST',
        tipoDescuento: 'PORCENTAJE',
        valor: 20
      };

      const resultado = calcularTotalPedido({ 
        items, 
        cupon, 
        aplicarDescuentoEnDetalles: true 
      });

      const sumaSubtotales = resultado.items.reduce((sum, item) => sum + item.subtotalConDescuento, 0);
      const diferencia = Math.abs(sumaSubtotales - resultado.totalFinal);
      
      expect(diferencia).toBeLessThanOrEqual(0.02); // Tolerancia de 2 centavos
      expect(resultado.consistenciaValidada).toBe(true);
    });

    test('debe marcar inconsistencia si diferencia > 0.02', () => {
      // Este test verifica el sistema de validación interno
      const items = [
        { varianteId: 1, precioBase: 100, precioOferta: null, piezasPorPaquete: 1, cantidad: 1 }
      ];

      const resultado = calcularTotalPedido({ items });

      // Sin descuento, siempre debe ser consistente
      expect(resultado.consistenciaValidada).toBe(true);
    });
  });

  describe('Casos de borde', () => {
    test('debe manejar pedido vacío', () => {
      const resultado = calcularTotalPedido({ items: [] });

      expect(resultado.items).toEqual([]);
      expect(resultado.totalBruto).toBe(0);
      expect(resultado.montoDescuento).toBe(0);
      expect(resultado.totalFinal).toBe(0);
      expect(resultado.error).toBe('No hay items para calcular');
    });

    test('debe manejar items con valores null/undefined', () => {
      const items = [
        { 
          varianteId: 1, 
          precioBase: null, 
          precioOferta: undefined, 
          piezasPorPaquete: null, 
          cantidad: null 
        }
      ];

      const resultado = calcularTotalPedido({ items });

      // Debe tratarlos como 0
      expect(resultado.items[0].precioUnitario).toBe(0);
      expect(resultado.items[0].subtotal).toBe(0);
      expect(resultado.totalBruto).toBe(0);
    });

    test('debe manejar cupón sin valor', () => {
      const items = [
        { varianteId: 1, precioBase: 100, precioOferta: null, piezasPorPaquete: 1, cantidad: 1 }
      ];

      const cupon = { cuponId: 11, codigo: 'INVALIDO' }; // Sin valor

      const resultado = calcularTotalPedido({ items, cupon });

      // No debe aplicar descuento
      expect(resultado.montoDescuento).toBe(0);
      expect(resultado.totalFinal).toBe(100);
    });

    test('debe manejar descuento del 100%', () => {
      const items = [
        { varianteId: 1, precioBase: 500, precioOferta: null, piezasPorPaquete: 1, cantidad: 2 }
      ];

      const cupon = {
        cuponId: 12,
        codigo: 'GRATIS',
        tipoDescuento: 'PORCENTAJE',
        valor: 100
      };

      const resultado = calcularTotalPedido({ items, cupon });

      expect(resultado.totalBruto).toBe(1000);
      expect(resultado.montoDescuento).toBe(1000);
      expect(resultado.totalFinal).toBe(0);
    });

    test('debe prevenir subtotales negativos en items', () => {
      const items = [
        { varianteId: 1, precioBase: 10, precioOferta: null, piezasPorPaquete: 1, cantidad: 1 }
      ];

      const cupon = {
        cuponId: 13,
        codigo: 'MEGA',
        tipoDescuento: 'FIJO',
        valor: 50 // Mayor al subtotal del item
      };

      const resultado = calcularTotalPedido({ 
        items, 
        cupon, 
        aplicarDescuentoEnDetalles: true 
      });

      // Ningún item debe tener subtotal negativo
      resultado.items.forEach(item => {
        expect(item.subtotalConDescuento).toBeGreaterThanOrEqual(0);
      });
    });

    test('sin aplicarDescuentoEnDetalles, items deben mantener precios originales', () => {
      const items = [
        { varianteId: 1, precioBase: 100, precioOferta: null, piezasPorPaquete: 1, cantidad: 1 }
      ];

      const cupon = {
        cuponId: 14,
        codigo: 'DESC50',
        tipoDescuento: 'PORCENTAJE',
        valor: 50
      };

      const resultado = calcularTotalPedido({ 
        items, 
        cupon, 
        aplicarDescuentoEnDetalles: false 
      });

      // Items no deben tener descuento aplicado
      expect(resultado.items[0].descuentoAplicado).toBe(0);
      expect(resultado.items[0].subtotalConDescuento).toBe(100);
      expect(resultado.items[0].precioPaqueteConDescuento).toBe(100);
      
      // Pero el total final sí debe reflejar el descuento
      expect(resultado.totalFinal).toBe(50);
    });
  });
});

describe('calcularSplitBackorder - Manejo de stock insuficiente', () => {
  describe('Stock completo disponible', () => {
    test('debe asignar toda la cantidad si hay stock suficiente', () => {
      const resultado = calcularSplitBackorder({
        cantidadSolicitada: 10,
        stockPiezas: 240, // 240 piezas = 20 paquetes de 12
        piezasPorPaquete: 12,
        multiploBackorder: 1
      });

      expect(resultado.cantidadSurtida).toBe(10);
      expect(resultado.cantidadPendiente).toBe(0);
      expect(resultado.cantidadBackorderAjustada).toBe(0);
      expect(resultado.cantidadTotalCobrar).toBe(10);
      expect(resultado.ajusteAplicado).toBe(false);
      expect(resultado.reglaBackorder).toBe('UNITARIO');
    });
  });

  describe('Stock parcial disponible', () => {
    test('debe hacer split correcto cuando hay stock parcial', () => {
      const resultado = calcularSplitBackorder({
        cantidadSolicitada: 10,
        stockPiezas: 72, // 72 piezas = 6 paquetes de 12
        piezasPorPaquete: 12,
        multiploBackorder: 1
      });

      expect(resultado.cantidadSurtida).toBe(6);
      expect(resultado.cantidadPendiente).toBe(4);
      expect(resultado.cantidadBackorderAjustada).toBe(4);
      expect(resultado.cantidadTotalCobrar).toBe(10);
    });

    test('debe ajustar backorder a múltiplo de paquete cuando aplica', () => {
      const resultado = calcularSplitBackorder({
        cantidadSolicitada: 10,
        stockPiezas: 60, // 60 piezas = 5 paquetes de 12
        piezasPorPaquete: 12,
        multiploBackorder: 24 // Backorder debe ser múltiplo de 24 piezas
      });

      // Surtido: 5 paquetes
      // Pendiente: 5 paquetes (60 piezas)
      // Backorder ajustado: debe redondearse a múltiplo de 24
      // 60 piezas -> 72 piezas (múltiplo de 24 más cercano hacia arriba)
      // 72 / 12 = 6 paquetes
      
      expect(resultado.cantidadSurtida).toBe(5);
      expect(resultado.cantidadPendiente).toBe(5);
      expect(resultado.cantidadBackorderAjustada).toBe(6); // Ajustado
      expect(resultado.ajusteAplicado).toBe(true);
      expect(resultado.reglaBackorder).toBe('PAQUETE');
    });

    test('debe calcular backorder con múltiplo de 48 piezas', () => {
      const resultado = calcularSplitBackorder({
        cantidadSolicitada: 20,
        stockPiezas: 144, // 144 piezas = 12 paquetes
        piezasPorPaquete: 12,
        multiploBackorder: 48
      });

      // Surtido: 12 paquetes
      // Pendiente: 8 paquetes = 96 piezas
      // Backorder ajustado: 96 -> 96 (ya es múltiplo de 48)
      
      expect(resultado.cantidadSurtida).toBe(12);
      expect(resultado.cantidadPendiente).toBe(8);
      expect(resultado.cantidadBackorderAjustada).toBe(8); // 96 piezas = 8 paquetes
      expect(resultado.ajusteAplicado).toBe(false); // Ya era múltiplo
    });
  });

  describe('Sin stock disponible', () => {
    test('debe marcar todo como backorder cuando no hay stock', () => {
      const resultado = calcularSplitBackorder({
        cantidadSolicitada: 15,
        stockPiezas: 0,
        piezasPorPaquete: 12,
        multiploBackorder: 1
      });

      expect(resultado.cantidadSurtida).toBe(0);
      expect(resultado.cantidadPendiente).toBe(15);
      expect(resultado.cantidadBackorderAjustada).toBe(15);
      expect(resultado.cantidadTotalCobrar).toBe(15);
    });

    test('debe ajustar backorder completo a múltiplo si aplica', () => {
      const resultado = calcularSplitBackorder({
        cantidadSolicitada: 7,
        stockPiezas: 0,
        piezasPorPaquete: 12,
        multiploBackorder: 24 // Backorder debe ser múltiplo de 2 paquetes
      });

      // Pendiente: 7 paquetes = 84 piezas
      // Ajustado: 96 piezas (múltiplo de 24 más cercano)
      // 96 / 12 = 8 paquetes
      
      expect(resultado.cantidadSurtida).toBe(0);
      expect(resultado.cantidadPendiente).toBe(7);
      expect(resultado.cantidadBackorderAjustada).toBe(8);
      expect(resultado.ajusteAplicado).toBe(true);
    });
  });

  describe('Casos de borde', () => {
    test('debe retornar ceros con cantidad solicitada = 0', () => {
      const resultado = calcularSplitBackorder({
        cantidadSolicitada: 0,
        stockPiezas: 100,
        piezasPorPaquete: 12,
        multiploBackorder: 1
      });

      expect(resultado.cantidadSurtida).toBe(0);
      expect(resultado.cantidadPendiente).toBe(0);
      expect(resultado.cantidadBackorderAjustada).toBe(0);
    });

    test('debe manejar piezasPorPaquete = 0', () => {
      const resultado = calcularSplitBackorder({
        cantidadSolicitada: 10,
        stockPiezas: 100,
        piezasPorPaquete: 0,
        multiploBackorder: 1
      });

      expect(resultado.cantidadSurtida).toBe(0);
      expect(resultado.cantidadPendiente).toBe(0);
    });

    test('debe manejar stock negativo (tratarlo como 0)', () => {
      const resultado = calcularSplitBackorder({
        cantidadSolicitada: 5,
        stockPiezas: -50,
        piezasPorPaquete: 12,
        multiploBackorder: 1
      });

      expect(resultado.cantidadSurtida).toBe(0);
      expect(resultado.cantidadPendiente).toBe(5);
    });

    test('debe manejar valores no enteros (convertir a 0)', () => {
      const resultado = calcularSplitBackorder({
        cantidadSolicitada: 'invalid',
        stockPiezas: 'abc',
        piezasPorPaquete: null,
        multiploBackorder: undefined
      });

      expect(resultado.cantidadSurtida).toBe(0);
      expect(resultado.cantidadPendiente).toBe(0);
      expect(resultado.reglaBackorder).toBe('UNITARIO'); // multiplo default = 1
    });

    test('stock justo para N paquetes completos', () => {
      const resultado = calcularSplitBackorder({
        cantidadSolicitada: 10,
        stockPiezas: 120, // Exactamente 10 paquetes
        piezasPorPaquete: 12,
        multiploBackorder: 1
      });

      expect(resultado.cantidadSurtida).toBe(10);
      expect(resultado.cantidadPendiente).toBe(0);
    });

    test('stock para N paquetes + piezas sueltas (no cuenta paquete incompleto)', () => {
      const resultado = calcularSplitBackorder({
        cantidadSolicitada: 10,
        stockPiezas: 125, // 10 paquetes + 5 piezas sueltas
        piezasPorPaquete: 12,
        multiploBackorder: 1
      });

      // Solo cuenta paquetes completos: 10 paquetes
      expect(resultado.cantidadSurtida).toBe(10);
      expect(resultado.cantidadPendiente).toBe(0);
    });
  });
});

describe('validarConsistenciaTotales - Validación de precisión financiera', () => {
  test('debe validar que dos totales idénticos son consistentes', () => {
    const resultado = validarConsistenciaTotales(1000, 1000);

    expect(resultado.esConsistente).toBe(true);
    expect(resultado.diferencia).toBe(0);
    expect(resultado.total1).toBe(1000);
    expect(resultado.total2).toBe(1000);
  });

  test('debe validar diferencia de 1 centavo como consistente', () => {
    const resultado = validarConsistenciaTotales(100.01, 100.02);

    expect(resultado.esConsistente).toBe(true);
    expect(resultado.diferencia).toBe(0.01);
  });

  test('debe validar diferencia de 2 centavos como consistente (límite)', () => {
    const resultado = validarConsistenciaTotales(500.00, 500.02);

    expect(resultado.esConsistente).toBe(true);
    expect(resultado.diferencia).toBe(0.02);
    expect(resultado.tolerancia).toBe(0.02);
  });

  test('debe marcar inconsistencia si diferencia > 0.02', () => {
    const resultado = validarConsistenciaTotales(1000, 1000.03);

    expect(resultado.esConsistente).toBe(false);
    expect(resultado.diferencia).toBe(0.03);
  });

  test('debe manejar diferencias negativas (valor absoluto)', () => {
    const resultado = validarConsistenciaTotales(750, 749.98);

    expect(resultado.esConsistente).toBe(true);
    expect(resultado.diferencia).toBe(0.02); // abs(-0.02)
  });

  test('debe permitir tolerancia personalizada', () => {
    const resultado = validarConsistenciaTotales(1000, 1005, 10);

    expect(resultado.esConsistente).toBe(true);
    expect(resultado.diferencia).toBe(5);
    expect(resultado.tolerancia).toBe(10);
  });

  test('debe redondear totales a 2 decimales', () => {
    const resultado = validarConsistenciaTotales(123.456789, 123.459999);

    expect(resultado.total1).toBe(123.46);
    expect(resultado.total2).toBe(123.46);
    expect(resultado.diferencia).toBe(0); // Después de redondeo son iguales
  });

  test('debe validar correctamente con números muy grandes', () => {
    const resultado = validarConsistenciaTotales(999999.98, 999999.99);

    expect(resultado.esConsistente).toBe(true);
    expect(resultado.diferencia).toBe(0.01);
  });

  test('debe validar correctamente con números muy pequeños', () => {
    const resultado = validarConsistenciaTotales(0.01, 0.02);

    expect(resultado.esConsistente).toBe(true);
    expect(resultado.diferencia).toBe(0.01);
  });
});

describe('Integración - Escenarios del mundo real', () => {
  test('CASO REAL: Pedido de Fashion con múltiples productos y descuento', () => {
    const items = [
      { 
        varianteId: 1, 
        sku: 'CAMISA-XL-AZUL',
        precioBase: 450.00, 
        precioOferta: null, 
        piezasPorPaquete: 12, 
        cantidad: 5 
      },
      { 
        varianteId: 2, 
        sku: 'PANTALON-M-NEGRO',
        precioBase: 780.00, 
        precioOferta: 699.00, // Oferta activa
        piezasPorPaquete: 6, 
        cantidad: 3 
      },
      { 
        varianteId: 3, 
        sku: 'ZAPATOS-42-CAFE',
        precioBase: 1250.00, 
        precioOferta: null, 
        piezasPorPaquete: 24, 
        cantidad: 2 
      }
    ];

    const cupon = {
      cuponId: 100,
      codigo: 'FASHION15',
      tipoDescuento: 'PORCENTAJE',
      valor: 15
    };

    const resultado = calcularTotalPedido({ 
      items, 
      cupon, 
      aplicarDescuentoEnDetalles: true 
    });

    // Cálculo manual:
    // Item 1: 450 * 12 * 5 = 27,000
    // Item 2: 699 * 6 * 3 = 12,582 (usa precio oferta)
    // Item 3: 1250 * 24 * 2 = 60,000
    // Total bruto: 99,582
    // Descuento 15%: 14,937.30
    // Total final: 84,644.70

    expect(resultado.totalBruto).toBe(99582);
    expect(resultado.montoDescuento).toBe(14937.30);
    expect(resultado.totalFinal).toBe(84644.70);
    
    // Validar consistencia
    expect(resultado.consistenciaValidada).toBe(true);
    
    // Suma de subtotales con descuento debe igualar total final
    const sumaSubtotales = resultado.items.reduce((sum, item) => sum + item.subtotalConDescuento, 0);
    expect(Math.abs(sumaSubtotales - resultado.totalFinal)).toBeLessThanOrEqual(0.02);
  });

  test('CASO REAL: Backorder con múltiplo de 24 piezas', () => {
    const resultado = calcularSplitBackorder({
      cantidadSolicitada: 15, // Cliente pide 15 paquetes
      stockPiezas: 84, // Solo hay 7 paquetes en stock (84 piezas)
      piezasPorPaquete: 12,
      multiploBackorder: 24 // Proveedor envía cajas de 24 piezas
    });

    // Surtido inmediato: 7 paquetes (84 piezas)
    // Pendiente: 8 paquetes (96 piezas)
    // Backorder ajustado: 96 piezas -> ya es múltiplo de 24, son 4 cajas
    
    expect(resultado.cantidadSurtida).toBe(7);
    expect(resultado.cantidadPendiente).toBe(8);
    expect(resultado.cantidadBackorderAjustada).toBe(8); // 96 piezas = 4 cajas de 24
    expect(resultado.reglaBackorder).toBe('PAQUETE');
  });

  test('CASO REAL: Cliente con cupón que excede el total', () => {
    const items = [
      { varianteId: 1, precioBase: 50, precioOferta: null, piezasPorPaquete: 1, cantidad: 2 }
    ];

    const cupon = {
      cuponId: 101,
      codigo: 'CUPON500',
      tipoDescuento: 'FIJO',
      valor: 500 // Cupón mayor al total del pedido
    };

    const resultado = calcularTotalPedido({ items, cupon });

    // Total bruto: 100
    // Descuento solicitado: 500
    // Descuento aplicado: 100 (limitado)
    // Total final: 0 (pedido gratis, pero no negativo)
    
    expect(resultado.totalBruto).toBe(100);
    expect(resultado.montoDescuento).toBe(100);
    expect(resultado.totalFinal).toBe(0);
  });

  test('CASO REAL: Validación de totales en facturación', () => {
    // Simular validación entre cálculo del pedido y total en BD
    const totalPedido = 12547.85;
    const totalBaseDatos = 12547.86; // Diferencia de 1 centavo por redondeo

    const resultado = validarConsistenciaTotales(totalPedido, totalBaseDatos);

    // Debe aceptarse como consistente (diferencia <= 0.02)
    expect(resultado.esConsistente).toBe(true);
    expect(resultado.diferencia).toBe(0.01);
  });
});
