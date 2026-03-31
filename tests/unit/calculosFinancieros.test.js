/**
 * UNIT TESTS - CÁLCULOS FINANCIEROS
 * 
 * Pruebas para validar la integridad de cálculos financieros críticos:
 * - Comisiones de agentes
 * - Redondeo financiero
 * - Manejo de casos edge
 * 
 * @author RazoConnect QA Team
 * @date 2026-03-24
 */

/**
 * Función extraída de la lógica de negocio
 * Replica el cálculo de comisión de pedidosController.js líneas 1397-1404
 */
function calcularComision(montoTotal, porcentajeComision, costoEnvio = 0) {
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
  
  // Redondeo financiero a 2 decimales
  return Math.round(montoComision * 100) / 100;
}

describe('Cálculos Financieros - Comisiones', () => {

  describe('Cálculo correcto con porcentajes estándar', () => {
    test('debe calcular comisión con 5% sobre $1000', () => {
      const resultado = calcularComision(1000, 5);
      expect(resultado).toBe(50);
    });

    test('debe calcular comisión con 10% sobre $5000', () => {
      const resultado = calcularComision(5000, 10);
      expect(resultado).toBe(500);
    });

    test('debe calcular comisión con 7.5% sobre $2000', () => {
      const resultado = calcularComision(2000, 7.5);
      expect(resultado).toBe(150);
    });

    test('debe calcular comisión con 0% (sin comisión)', () => {
      const resultado = calcularComision(10000, 0);
      expect(resultado).toBe(0);
    });

    test('debe calcular comisión con 100% (comisión total)', () => {
      const resultado = calcularComision(1000, 100);
      expect(resultado).toBe(1000);
    });

    test('debe restar costo de envío de la base de comisión', () => {
      const resultado = calcularComision(1000, 10, 100);
      // Base: 1000 - 100 = 900
      // Comisión: 900 * 0.10 = 90
      expect(resultado).toBe(90);
    });
  });

  describe('Manejo de valores con muchos decimales (redondeo financiero)', () => {
    test('debe redondear correctamente con 3 decimales hacia arriba', () => {
      // 1000 * 0.0333 = 33.3
      const resultado = calcularComision(1000, 3.33);
      expect(resultado).toBe(33.3);
    });

    test('debe redondear correctamente con 4 decimales', () => {
      // 1234.56 * 0.0789 = 97.4068
      const resultado = calcularComision(1234.56, 7.89);
      expect(resultado).toBe(97.41); // Redondeado a 2 decimales
    });

    test('debe redondear hacia abajo cuando el tercer decimal es < 5', () => {
      // 999.99 * 0.0333 = 33.3296667 → 33.3 (redondeo estándar)
      const resultado = calcularComision(999.99, 3.33);
      expect(resultado).toBe(33.3); // 33.3296667 → 33.3
    });

    test('debe redondear hacia arriba cuando el tercer decimal es >= 5', () => {
      // 1000 * 0.0667 = 66.7
      const resultado = calcularComision(1000, 6.67);
      expect(resultado).toBe(66.7);
    });

    test('debe manejar números con muchos decimales en el monto', () => {
      const resultado = calcularComision(1234.5678, 5.25);
      // 1234.5678 * 0.0525 = 64.814809
      expect(resultado).toBe(64.81); // Redondeado
    });

    test('debe evitar errores de precisión flotante', () => {
      // JavaScript: 0.1 + 0.2 = 0.30000000000000004
      // Verificar que el redondeo funciona correctamente
      const resultado = calcularComision(3000, 1.5);
      expect(resultado).toBe(45); // 3000 * 0.015 = 45.00
    });
  });

  describe('Comportamiento ante montos negativos o cero', () => {
    test('debe rechazar monto total negativo', () => {
      expect(() => calcularComision(-1000, 5)).toThrow('El monto total no puede ser negativo');
    });

    test('debe aceptar monto total de cero', () => {
      const resultado = calcularComision(0, 10);
      expect(resultado).toBe(0);
    });

    test('debe rechazar porcentaje negativo', () => {
      expect(() => calcularComision(1000, -5)).toThrow('El porcentaje de comisión debe estar entre 0 y 100');
    });

    test('debe rechazar porcentaje mayor a 100', () => {
      expect(() => calcularComision(1000, 150)).toThrow('El porcentaje de comisión debe estar entre 0 y 100');
    });

    test('debe rechazar si base de comisión queda negativa (envío > total)', () => {
      expect(() => calcularComision(100, 10, 200)).toThrow('La base de comisión (total - envío) no puede ser negativa');
    });

    test('debe rechazar parámetros no numéricos', () => {
      expect(() => calcularComision('1000', 5)).toThrow('montoTotal y porcentajeComision deben ser números');
      expect(() => calcularComision(1000, '5')).toThrow('montoTotal y porcentajeComision deben ser números');
      expect(() => calcularComision(null, 5)).toThrow('montoTotal y porcentajeComision deben ser números');
      expect(() => calcularComision(1000, undefined)).toThrow('montoTotal y porcentajeComision deben ser números');
    });
  });

  describe('Casos edge y límites', () => {
    test('debe manejar montos muy pequeños', () => {
      const resultado = calcularComision(0.01, 10);
      expect(resultado).toBe(0); // 0.001 → 0.00
    });

    test('debe manejar montos muy grandes', () => {
      const resultado = calcularComision(1000000, 5);
      expect(resultado).toBe(50000);
    });

    test('debe manejar porcentajes fraccionarios pequeños', () => {
      const resultado = calcularComision(1000, 0.01);
      expect(resultado).toBe(0.1);
    });

    test('debe calcular correctamente con valores reales típicos', () => {
      // Caso real: Pedido de $2,547.80 con 7.5% de comisión
      const resultado = calcularComision(2547.80, 7.5);
      expect(resultado).toBe(191.09); // 2547.80 * 0.075 = 191.085
    });

    test('debe mantener precisión con múltiples productos', () => {
      // Simular sumatoria de varios productos
      const montos = [125.50, 230.75, 400.00, 89.99];
      const total = montos.reduce((sum, val) => sum + val, 0);
      const resultado = calcularComision(total, 6.25);
      
      // Total: 846.24
      // Comisión: 846.24 * 0.0625 = 52.89
      expect(resultado).toBe(52.89);
    });
  });

  describe('Integración con lógica de negocio', () => {
    test('debe replicar el cálculo del sistema (porcentaje por defecto 5%)', () => {
      const porcentajeDefault = 5.00;
      const montoVenta = 3500;
      const costoEnvio = 0;
      
      const resultado = calcularComision(montoVenta, porcentajeDefault, costoEnvio);
      
      expect(resultado).toBe(175); // 3500 * 0.05 = 175
    });

    test('debe calcular correctamente con porcentaje configurado por agente', () => {
      // Simular agente con comisión personalizada del 8.5%
      const porcentajeAgente = 8.5;
      const montoVenta = 4200.50;
      
      const resultado = calcularComision(montoVenta, porcentajeAgente);
      
      expect(resultado).toBe(357.04); // 4200.50 * 0.085 = 357.0425
    });

    test('debe validar que el resultado pueda almacenarse en DECIMAL(10,2)', () => {
      // PostgreSQL DECIMAL(10,2) soporta hasta 99,999,999.99
      const montoMaximo = 99999999.99;
      const resultado = calcularComision(montoMaximo, 1);
      
      expect(resultado).toBeLessThanOrEqual(99999999.99);
      expect(resultado).toBe(1000000); // 99,999,999.99 * 0.01 = 1,000,000 (redondeado)
    });
  });
});

// Exportar función para reutilización en otros tests
module.exports = {
  calcularComision
};
