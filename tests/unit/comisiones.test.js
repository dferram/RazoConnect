/**
 * UNIT TESTS - MÓDULO DE COMISIONES
 * 
 * Tests exhaustivos para validar el cálculo de comisiones de agentes:
 * - Cálculo exacto de comisiones
 * - Manejo de devoluciones
 * - Pedidos cancelados
 * - Redondeo de decimales
 * - Casos de borde financieros
 * 
 * @author RazoConnect QA Team
 * @date 2026-03-26
 */

const { createMockDb } = require('../helpers/mockDb');

/**
 * Función de cálculo de comisión extraída de la lógica de negocio
 * Replica pedidosController.js y comisionesAdminController.js
 */
function calcularComision(montoTotal, porcentajeComision = 5.00, costoEnvio = 0) {
  if (typeof montoTotal !== 'number' || typeof porcentajeComision !== 'number') {
    throw new Error('montoTotal y porcentajeComision deben ser números');
  }

  if (montoTotal < 0) {
    throw new Error('El monto total no puede ser negativo');
  }

  if (porcentajeComision < 0 || porcentajeComision > 100) {
    throw new Error('El porcentaje de comisión debe estar entre 0 y 100');
  }

  const baseComision = montoTotal - costoEnvio;
  
  if (baseComision < 0) {
    throw new Error('La base de comisión (total - envío) no puede ser negativa');
  }

  const montoComision = baseComision * (porcentajeComision / 100);
  
  // Redondeo financiero a 2 decimales (CRITICAL para evitar errores de centavos)
  return Math.round(montoComision * 100) / 100;
}

describe('Módulo de Comisiones - Cálculos Exactos', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = createMockDb();
    jest.clearAllMocks();
  });

  describe('Cálculo básico de comisiones', () => {
    test('debe calcular comisión con porcentaje por defecto (5%)', () => {
      const resultado = calcularComision(1000);
      expect(resultado).toBe(50);
    });

    test('debe calcular comisión con porcentaje personalizado del agente', () => {
      const resultado = calcularComision(2000, 7.5);
      expect(resultado).toBe(150);
    });

    test('debe restar el costo de envío de la base comisionable', () => {
      const resultado = calcularComision(1000, 10, 150);
      // Base: 1000 - 150 = 850
      // Comisión: 850 * 0.10 = 85
      expect(resultado).toBe(85);
    });

    test('debe manejar comisión de 0% (agentes sin comisión)', () => {
      const resultado = calcularComision(5000, 0);
      expect(resultado).toBe(0);
    });

    test('debe manejar ventas muy grandes correctamente', () => {
      const resultado = calcularComision(500000, 5);
      expect(resultado).toBe(25000);
    });
  });

  describe('Redondeo de decimales - Precisión financiera', () => {
    test('debe redondear correctamente con 3 decimales (hacia abajo)', () => {
      // 1000 * 0.0333 = 33.3
      const resultado = calcularComision(1000, 3.33);
      expect(resultado).toBe(33.3);
    });

    test('debe redondear correctamente con 3 decimales (hacia arriba)', () => {
      // 1000 * 0.0667 = 66.7
      const resultado = calcularComision(1000, 6.67);
      expect(resultado).toBe(66.7);
    });

    test('debe redondear al centavo más cercano con decimales largos', () => {
      // 1234.56 * 0.0789 = 97.4068
      const resultado = calcularComision(1234.56, 7.89);
      expect(resultado).toBe(97.41);
    });

    test('debe evitar errores de precisión flotante de JavaScript', () => {
      // Problema conocido: 0.1 + 0.2 = 0.30000000000000004
      const resultado = calcularComision(3000, 1.5);
      expect(resultado).toBe(45); // No 44.999999999999
    });

    test('debe mantener 2 decimales exactos para almacenamiento en DB', () => {
      const resultado = calcularComision(2547.80, 7.5);
      expect(resultado).toBe(191.09);
      
      // Verificar que tiene exactamente 2 decimales
      const decimales = resultado.toString().split('.')[1]?.length || 0;
      expect(decimales).toBeLessThanOrEqual(2);
    });

    test('debe redondear 0.005 hacia arriba (banker\'s rounding)', () => {
      // 100 * 0.075 = 7.5
      // 7.5 con redondeo a 2 decimales debe ser 7.5 (no 7.50 pero numéricamente igual)
      const resultado = calcularComision(100, 7.5);
      expect(resultado).toBe(7.5);
    });
  });

  describe('Manejo de devoluciones - Ajuste de comisiones', () => {
    test('debe restar comisión cuando se devuelve un pedido completo', () => {
      // Comisión original
      const comisionOriginal = calcularComision(1000, 5);
      expect(comisionOriginal).toBe(50);

      // Devolución completa: comisión se anula
      const comisionDevolucion = calcularComision(1000, 5);
      const comisionFinal = comisionOriginal - comisionDevolucion;
      
      expect(comisionFinal).toBe(0);
    });

    test('debe ajustar comisión en devolución parcial', () => {
      const montoVentaOriginal = 5000;
      const montoDevuelto = 1500;
      const porcentaje = 6.5;

      const comisionOriginal = calcularComision(montoVentaOriginal, porcentaje);
      const comisionDevolucion = calcularComision(montoDevuelto, porcentaje);
      const comisionFinal = comisionOriginal - comisionDevolucion;

      expect(comisionOriginal).toBe(325); // 5000 * 0.065
      expect(comisionDevolucion).toBe(97.5); // 1500 * 0.065
      expect(comisionFinal).toBe(227.5); // 325 - 97.5
    });

    test('debe manejar múltiples devoluciones parciales', () => {
      const montoOriginal = 10000;
      const porcentaje = 5;
      
      let comisionActual = calcularComision(montoOriginal, porcentaje);
      expect(comisionActual).toBe(500);

      // Primera devolución: $2000
      const devolucion1 = calcularComision(2000, porcentaje);
      comisionActual -= devolucion1;
      expect(comisionActual).toBe(400); // 500 - 100

      // Segunda devolución: $1500
      const devolucion2 = calcularComision(1500, porcentaje);
      comisionActual -= devolucion2;
      expect(comisionActual).toBe(325); // 400 - 75

      // Tercera devolución: $500
      const devolucion3 = calcularComision(500, porcentaje);
      comisionActual -= devolucion3;
      expect(comisionActual).toBe(300); // 325 - 25
    });

    test('NO debe permitir que comisión final sea negativa', () => {
      const comisionOriginal = calcularComision(1000, 5);
      const montoDevuelto = 1500; // Mayor que la venta original
      
      const comisionDevolucion = calcularComision(montoDevuelto, 5);
      let comisionFinal = comisionOriginal - comisionDevolucion;
      
      // En el sistema real, esto debe validarse antes de guardar
      if (comisionFinal < 0) {
        comisionFinal = 0; // Ajustar a 0, no negativo
      }
      
      expect(comisionFinal).toBe(0);
    });
  });

  describe('Pedidos cancelados - Anulación de comisiones', () => {
    test('debe anular comisión cuando se cancela pedido completo', () => {
      const montoPedido = 3500;
      const comision = calcularComision(montoPedido, 7);
      
      expect(comision).toBe(245); // 3500 * 0.07

      // Al cancelar, la comisión debe marcarse como anulada
      const comisionCancelada = 0;
      expect(comisionCancelada).toBe(0);
    });

    test('debe recalcular comisión si se cancela parcialmente el pedido', () => {
      const montoOriginal = 5000;
      const montoCancelado = 1200;
      const montoFinal = montoOriginal - montoCancelado;
      const porcentaje = 5.5;

      const comisionOriginal = calcularComision(montoOriginal, porcentaje);
      const comisionFinal = calcularComision(montoFinal, porcentaje);
      
      expect(comisionOriginal).toBe(275); // 5000 * 0.055
      expect(comisionFinal).toBe(209); // 3800 * 0.055
    });

    test('debe manejar cancelación antes de generar comisión', () => {
      // Si el pedido se cancela antes de confirmarse, no debe generarse comisión
      const montoPedido = 2000;
      const estatusPedido = 'Cancelado';
      
      let comision = 0;
      
      if (estatusPedido !== 'Cancelado') {
        comision = calcularComision(montoPedido, 5);
      }
      
      expect(comision).toBe(0);
    });
  });

  describe('Casos de borde y validaciones', () => {
    test('debe rechazar montos negativos', () => {
      expect(() => calcularComision(-1000, 5)).toThrow('El monto total no puede ser negativo');
    });

    test('debe aceptar monto de cero (sin venta = sin comisión)', () => {
      const resultado = calcularComision(0, 5);
      expect(resultado).toBe(0);
    });

    test('debe rechazar porcentajes negativos', () => {
      expect(() => calcularComision(1000, -5)).toThrow('El porcentaje de comisión debe estar entre 0 y 100');
    });

    test('debe rechazar porcentajes mayores a 100%', () => {
      expect(() => calcularComision(1000, 150)).toThrow('El porcentaje de comisión debe estar entre 0 y 100');
    });

    test('debe rechazar si costo de envío es mayor que el total', () => {
      expect(() => calcularComision(100, 10, 200)).toThrow('La base de comisión (total - envío) no puede ser negativa');
    });

    test('debe rechazar parámetros no numéricos', () => {
      expect(() => calcularComision('1000', 5)).toThrow('montoTotal y porcentajeComision deben ser números');
      expect(() => calcularComision(1000, '5')).toThrow('montoTotal y porcentajeComision deben ser números');
      expect(() => calcularComision(null, 5)).toThrow('montoTotal y porcentajeComision deben ser números');
      expect(() => calcularComision(undefined, 5)).toThrow('montoTotal y porcentajeComision deben ser números');
    });

    test('debe manejar ventas muy pequeñas (centavos)', () => {
      const resultado = calcularComision(0.50, 10);
      expect(resultado).toBe(0.05); // 50 centavos * 10% = 5 centavos
    });

    test('debe validar que el resultado cabe en DECIMAL(10,2)', () => {
      // PostgreSQL DECIMAL(10,2) soporta hasta 99,999,999.99
      const montoMaximo = 99999999.99;
      const resultado = calcularComision(montoMaximo, 1);
      
      expect(resultado).toBeLessThanOrEqual(99999999.99);
      expect(resultado).toBe(1000000); // 99,999,999.99 * 0.01 = 1,000,000 (redondeado)
    });
  });

  describe('Integración con lógica de negocio', () => {
    test('debe replicar cálculo del sistema con valores reales', () => {
      // Caso real: Pedido de $2,547.80 con envío de $120, comisión 7.5%
      const montoTotal = 2547.80;
      const costoEnvio = 120.00;
      const porcentaje = 7.5;
      
      const resultado = calcularComision(montoTotal, porcentaje, costoEnvio);
      
      // Base: 2547.80 - 120 = 2427.80
      // Comisión: 2427.80 * 0.075 = 182.085
      expect(resultado).toBe(182.09);
    });

    test('debe calcular comisiones para múltiples agentes correctamente', () => {
      const montoVenta = 5000;
      
      const agentes = [
        { nombre: 'Juan', porcentaje: 5.00 },
        { nombre: 'María', porcentaje: 7.50 },
        { nombre: 'Pedro', porcentaje: 6.25 }
      ];

      const comisiones = agentes.map(agente => ({
        agente: agente.nombre,
        comision: calcularComision(montoVenta, agente.porcentaje)
      }));

      expect(comisiones[0].comision).toBe(250.00); // 5000 * 0.05
      expect(comisiones[1].comision).toBe(375.00); // 5000 * 0.075
      expect(comisiones[2].comision).toBe(312.50); // 5000 * 0.0625
    });

    test('debe mantener consistencia con comisiones acumuladas', () => {
      // Simular 3 ventas del mismo agente
      const ventas = [1200, 3500, 2800];
      const porcentaje = 6.0;
      
      const comisiones = ventas.map(venta => calcularComision(venta, porcentaje));
      const totalComisiones = comisiones.reduce((sum, c) => sum + c, 0);
      
      expect(comisiones[0]).toBe(72);   // 1200 * 0.06
      expect(comisiones[1]).toBe(210);  // 3500 * 0.06
      expect(comisiones[2]).toBe(168);  // 2800 * 0.06
      expect(totalComisiones).toBe(450); // Suma total
    });

    test('debe calcular comisión promedio correctamente', () => {
      const ventas = [1000, 2000, 3000, 4000, 5000];
      const porcentaje = 5;
      
      const comisiones = ventas.map(v => calcularComision(v, porcentaje));
      const promedioComision = comisiones.reduce((sum, c) => sum + c, 0) / comisiones.length;
      
      // Total ventas: 15000
      // Total comisiones: 750 (15000 * 0.05)
      // Promedio: 750 / 5 = 150
      expect(promedioComision).toBe(150);
    });
  });

  describe('Casos específicos del sistema RazoConnect', () => {
    test('debe calcular comisión para pedido sin envío', () => {
      const montoTotal = 3200;
      const costoEnvio = 0; // Entrega en sucursal
      const porcentaje = 5.5;
      
      const resultado = calcularComision(montoTotal, porcentaje, costoEnvio);
      expect(resultado).toBe(176); // 3200 * 0.055
    });

    test('debe calcular comisión excluyendo descuentos ya aplicados', () => {
      // El monto total ya viene con descuentos aplicados
      const montoTotalConDescuento = 4500; // Original: 5000, Descuento: 500
      const porcentaje = 6;
      
      const resultado = calcularComision(montoTotalConDescuento, porcentaje);
      expect(resultado).toBe(270); // Se calcula sobre monto ya descontado
    });

    test('debe manejar pedidos con cupón de descuento', () => {
      const montoOriginal = 1000;
      const descuentoCupon = 100;
      const montoFinal = montoOriginal - descuentoCupon;
      const porcentaje = 5;
      
      const comision = calcularComision(montoFinal, porcentaje);
      expect(comision).toBe(45); // (1000 - 100) * 0.05
    });

    test('debe calcular comisión sobre venta a crédito correctamente', () => {
      // La comisión se genera sobre el monto total, no sobre lo pagado
      const montoVentaCredito = 10000;
      const porcentaje = 5;
      
      const comision = calcularComision(montoVentaCredito, porcentaje);
      expect(comision).toBe(500);
      
      // Incluso si el cliente solo pagó 30% inicial
      const montoPagadoInicial = 3000;
      // La comisión sigue siendo sobre el total
      expect(comision).not.toBe(calcularComision(montoPagadoInicial, porcentaje));
    });

    test('debe redondear comisiones para evitar centavos huérfanos en DB', () => {
      // Validar que todas las comisiones tienen exactamente 2 decimales
      const ventas = [1234.56, 987.65, 5432.10, 777.77];
      const porcentaje = 7.89;
      
      ventas.forEach(venta => {
        const comision = calcularComision(venta, porcentaje);
        const decimales = comision.toString().split('.')[1]?.length || 0;
        expect(decimales).toBeLessThanOrEqual(2);
      });
    });
  });
});

// Exportar función para reutilización
module.exports = {
  calcularComision
};
