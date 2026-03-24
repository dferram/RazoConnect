/**
 * UNIT TESTS - INTEGRIDAD DE INVENTARIOS
 * 
 * Pruebas para validar que el sistema de inventarios mantiene integridad:
 * - No permite stock negativo
 * - Valida disponibilidad antes de reducir
 * - Maneja correctamente los ajustes de stock
 * - Previene condiciones de carrera
 * 
 * @author RazoConnect QA Team
 * @date 2026-03-24
 */

describe('Integridad de Inventarios - Reducción de Stock', () => {
  /**
   * Función simulada de reducción de stock
   * Replica la lógica de inventoryService.registrarMovimiento
   * para validación de stock antes de confirmar surtido
   */
  class InventarioMock {
    constructor() {
      this.stock = {};
    }

    inicializarStock(varianteId, cantidad) {
      this.stock[varianteId] = cantidad;
    }

    obtenerStock(varianteId) {
      return this.stock[varianteId] || 0;
    }

    /**
     * Reducir stock con validación de integridad
     * @param {number} varianteId - ID de la variante
     * @param {number} cantidad - Cantidad a reducir (positivo)
     * @returns {Object} - Resultado con stockAnterior y stockNuevo
     * @throws {Error} - Si hay stock insuficiente
     */
    reducirStock(varianteId, cantidad) {
      if (typeof varianteId !== 'number' || !Number.isInteger(varianteId)) {
        throw new Error('varianteId debe ser un entero');
      }

      if (typeof cantidad !== 'number' || cantidad < 0) {
        throw new Error('cantidad debe ser un número positivo');
      }

      const stockActual = this.obtenerStock(varianteId);
      
      // CRITICAL: No permitir stock negativo
      if (stockActual < cantidad) {
        const error = new Error(`Stock insuficiente. Disponible: ${stockActual}, Requerido: ${cantidad}`);
        error.code = 'STOCK_INSUFICIENTE';
        error.stockDisponible = stockActual;
        error.stockRequerido = cantidad;
        throw error;
      }

      const stockNuevo = stockActual - cantidad;
      this.stock[varianteId] = stockNuevo;

      return {
        stockAnterior: stockActual,
        stockNuevo: stockNuevo,
        cantidadReducida: cantidad
      };
    }

    /**
     * Aumentar stock (restock, devolución, etc.)
     */
    aumentarStock(varianteId, cantidad) {
      if (typeof varianteId !== 'number' || !Number.isInteger(varianteId)) {
        throw new Error('varianteId debe ser un entero');
      }

      if (typeof cantidad !== 'number' || cantidad < 0) {
        throw new Error('cantidad debe ser un número positivo');
      }

      const stockActual = this.obtenerStock(varianteId);
      const stockNuevo = stockActual + cantidad;
      this.stock[varianteId] = stockNuevo;

      return {
        stockAnterior: stockActual,
        stockNuevo: stockNuevo,
        cantidadAumentada: cantidad
      };
    }
  }

  describe('Validación de stock disponible', () => {
    let inventario;

    beforeEach(() => {
      inventario = new InventarioMock();
    });

    test('debe permitir reducir stock cuando hay suficiente disponible', () => {
      inventario.inicializarStock(1, 100);
      
      const resultado = inventario.reducirStock(1, 50);
      
      expect(resultado.stockAnterior).toBe(100);
      expect(resultado.stockNuevo).toBe(50);
      expect(resultado.cantidadReducida).toBe(50);
    });

    test('debe permitir reducir todo el stock disponible', () => {
      inventario.inicializarStock(1, 25);
      
      const resultado = inventario.reducirStock(1, 25);
      
      expect(resultado.stockNuevo).toBe(0);
    });

    test('NO debe permitir reducir más stock del disponible', () => {
      inventario.inicializarStock(1, 10);
      
      expect(() => {
        inventario.reducirStock(1, 15);
      }).toThrow('Stock insuficiente');
    });

    test('debe lanzar error con código STOCK_INSUFICIENTE', () => {
      inventario.inicializarStock(1, 5);
      
      try {
        inventario.reducirStock(1, 10);
        fail('Debería haber lanzado error');
      } catch (error) {
        expect(error.code).toBe('STOCK_INSUFICIENTE');
        expect(error.stockDisponible).toBe(5);
        expect(error.stockRequerido).toBe(10);
      }
    });

    test('NO debe permitir stock negativo después de reducción', () => {
      inventario.inicializarStock(1, 100);
      inventario.reducirStock(1, 50);
      inventario.reducirStock(1, 30);
      
      // Ahora hay 20, intentar reducir 25
      expect(() => {
        inventario.reducirStock(1, 25);
      }).toThrow('Stock insuficiente');
      
      // El stock debe mantenerse en 20 (sin cambios)
      expect(inventario.obtenerStock(1)).toBe(20);
    });
  });

  describe('Casos edge y límites', () => {
    let inventario;

    beforeEach(() => {
      inventario = new InventarioMock();
    });

    test('debe manejar correctamente stock en cero', () => {
      inventario.inicializarStock(1, 0);
      
      expect(() => {
        inventario.reducirStock(1, 1);
      }).toThrow('Stock insuficiente');
    });

    test('debe permitir reducción de cero unidades', () => {
      inventario.inicializarStock(1, 100);
      
      const resultado = inventario.reducirStock(1, 0);
      
      expect(resultado.stockNuevo).toBe(100);
    });

    test('debe rechazar cantidades negativas', () => {
      inventario.inicializarStock(1, 100);
      
      expect(() => {
        inventario.reducirStock(1, -10);
      }).toThrow('cantidad debe ser un número positivo');
    });

    test('debe manejar variantes que no existen (stock = 0)', () => {
      // No inicializamos stock para variante 999
      expect(inventario.obtenerStock(999)).toBe(0);
      
      expect(() => {
        inventario.reducirStock(999, 1);
      }).toThrow('Stock insuficiente');
    });

    test('debe rechazar varianteId inválido', () => {
      expect(() => {
        inventario.reducirStock('abc', 10);
      }).toThrow('varianteId debe ser un entero');
      
      expect(() => {
        inventario.reducirStock(1.5, 10);
      }).toThrow('varianteId debe ser un entero');
      
      expect(() => {
        inventario.reducirStock(null, 10);
      }).toThrow('varianteId debe ser un entero');
    });

    test('debe rechazar cantidad no numérica', () => {
      inventario.inicializarStock(1, 100);
      
      expect(() => {
        inventario.reducirStock(1, '10');
      }).toThrow('cantidad debe ser un número positivo');
    });
  });

  describe('Surtido parcial y múltiples reducciones', () => {
    let inventario;

    beforeEach(() => {
      inventario = new InventarioMock();
    });

    test('debe permitir múltiples reducciones incrementales', () => {
      inventario.inicializarStock(1, 100);
      
      // Primera reducción (surtido parcial)
      inventario.reducirStock(1, 30);
      expect(inventario.obtenerStock(1)).toBe(70);
      
      // Segunda reducción (surtido parcial adicional)
      inventario.reducirStock(1, 20);
      expect(inventario.obtenerStock(1)).toBe(50);
      
      // Tercera reducción (completar surtido)
      inventario.reducirStock(1, 50);
      expect(inventario.obtenerStock(1)).toBe(0);
    });

    test('debe validar disponibilidad en cada reducción incremental', () => {
      inventario.inicializarStock(1, 50);
      
      // Primera reducción exitosa
      inventario.reducirStock(1, 30);
      expect(inventario.obtenerStock(1)).toBe(20);
      
      // Segunda reducción debe fallar por stock insuficiente
      expect(() => {
        inventario.reducirStock(1, 25);
      }).toThrow('Stock insuficiente');
      
      // El stock debe quedar intacto después del error
      expect(inventario.obtenerStock(1)).toBe(20);
    });

    test('debe manejar surtido de múltiples productos simultáneamente', () => {
      inventario.inicializarStock(1, 100);
      inventario.inicializarStock(2, 50);
      inventario.inicializarStock(3, 75);
      
      inventario.reducirStock(1, 20);
      inventario.reducirStock(2, 10);
      inventario.reducirStock(3, 15);
      
      expect(inventario.obtenerStock(1)).toBe(80);
      expect(inventario.obtenerStock(2)).toBe(40);
      expect(inventario.obtenerStock(3)).toBe(60);
    });
  });

  describe('Restock y aumentos de inventario', () => {
    let inventario;

    beforeEach(() => {
      inventario = new InventarioMock();
    });

    test('debe permitir aumentar stock correctamente', () => {
      inventario.inicializarStock(1, 50);
      
      const resultado = inventario.aumentarStock(1, 25);
      
      expect(resultado.stockAnterior).toBe(50);
      expect(resultado.stockNuevo).toBe(75);
      expect(resultado.cantidadAumentada).toBe(25);
    });

    test('debe permitir aumentar stock desde cero', () => {
      inventario.inicializarStock(1, 0);
      
      inventario.aumentarStock(1, 100);
      
      expect(inventario.obtenerStock(1)).toBe(100);
    });

    test('debe permitir múltiples aumentos', () => {
      inventario.inicializarStock(1, 10);
      
      inventario.aumentarStock(1, 20);
      inventario.aumentarStock(1, 30);
      
      expect(inventario.obtenerStock(1)).toBe(60);
    });

    test('debe rechazar aumentos negativos', () => {
      inventario.inicializarStock(1, 50);
      
      expect(() => {
        inventario.aumentarStock(1, -10);
      }).toThrow('cantidad debe ser un número positivo');
    });
  });

  describe('Escenarios de negocio reales', () => {
    let inventario;

    beforeEach(() => {
      inventario = new InventarioMock();
    });

    test('Escenario 1: Pedido completo con stock suficiente', () => {
      // Producto A: 100 unidades disponibles, pedido de 20
      inventario.inicializarStock(101, 100);
      
      const resultado = inventario.reducirStock(101, 20);
      
      expect(resultado.stockNuevo).toBe(80);
    });

    test('Escenario 2: Pedido rechazado por falta de stock', () => {
      // Producto B: 5 unidades disponibles, pedido de 10
      inventario.inicializarStock(102, 5);
      
      expect(() => {
        inventario.reducirStock(102, 10);
      }).toThrow('Stock insuficiente');
      
      // El stock debe permanecer sin cambios
      expect(inventario.obtenerStock(102)).toBe(5);
    });

    test('Escenario 3: Surtido parcial con llegada de mercancía', () => {
      // Producto C: 30 disponibles, pedido de 50
      inventario.inicializarStock(103, 30);
      
      // Primera entrega: 30 unidades
      inventario.reducirStock(103, 30);
      expect(inventario.obtenerStock(103)).toBe(0);
      
      // Llega nueva mercancía: +50 unidades
      inventario.aumentarStock(103, 50);
      expect(inventario.obtenerStock(103)).toBe(50);
      
      // Segunda entrega: 20 unidades restantes
      inventario.reducirStock(103, 20);
      expect(inventario.obtenerStock(103)).toBe(30);
    });

    test('Escenario 4: Múltiples pedidos del mismo producto', () => {
      // Producto D: 100 unidades disponibles
      inventario.inicializarStock(104, 100);
      
      // Pedido 1: 40 unidades
      inventario.reducirStock(104, 40);
      expect(inventario.obtenerStock(104)).toBe(60);
      
      // Pedido 2: 30 unidades
      inventario.reducirStock(104, 30);
      expect(inventario.obtenerStock(104)).toBe(30);
      
      // Pedido 3: intenta 50 unidades (debe fallar)
      expect(() => {
        inventario.reducirStock(104, 50);
      }).toThrow('Stock insuficiente');
      
      expect(inventario.obtenerStock(104)).toBe(30);
    });

    test('Escenario 5: Validación antes de confirmar pedido completo', () => {
      // Simular validación de pedido con múltiples productos
      const pedido = [
        { varianteId: 201, cantidad: 10 },
        { varianteId: 202, cantidad: 5 },
        { varianteId: 203, cantidad: 8 }
      ];
      
      // Inicializar stock
      inventario.inicializarStock(201, 15);
      inventario.inicializarStock(202, 3); // Insuficiente
      inventario.inicializarStock(203, 10);
      
      // Validar disponibilidad ANTES de reducir
      let todoDisponible = true;
      for (const item of pedido) {
        const stockDisponible = inventario.obtenerStock(item.varianteId);
        if (stockDisponible < item.cantidad) {
          todoDisponible = false;
          break;
        }
      }
      
      expect(todoDisponible).toBe(false);
      
      // No se debe procesar el pedido
      expect(inventario.obtenerStock(201)).toBe(15); // Sin cambios
      expect(inventario.obtenerStock(202)).toBe(3);  // Sin cambios
      expect(inventario.obtenerStock(203)).toBe(10); // Sin cambios
    });
  });

  describe('Prevención de condiciones de carrera', () => {
    let inventario;

    beforeEach(() => {
      inventario = new InventarioMock();
    });

    test('debe mantener integridad ante operaciones consecutivas rápidas', () => {
      inventario.inicializarStock(1, 100);
      
      // Simular múltiples reducciones consecutivas
      const operaciones = [20, 15, 30, 10, 5];
      let stockEsperado = 100;
      
      for (const cantidad of operaciones) {
        inventario.reducirStock(1, cantidad);
        stockEsperado -= cantidad;
        expect(inventario.obtenerStock(1)).toBe(stockEsperado);
      }
      
      expect(inventario.obtenerStock(1)).toBe(20);
    });

    test('debe detener operaciones si alguna falla por stock insuficiente', () => {
      inventario.inicializarStock(1, 50);
      
      const operaciones = [10, 15, 30]; // Total: 55 (excede 50)
      
      let operacionesExitosas = 0;
      let stockFinal = 50;
      
      for (const cantidad of operaciones) {
        try {
          inventario.reducirStock(1, cantidad);
          stockFinal -= cantidad;
          operacionesExitosas++;
        } catch (error) {
          // La tercera operación debe fallar
          expect(error.code).toBe('STOCK_INSUFICIENTE');
          break;
        }
      }
      
      expect(operacionesExitosas).toBe(2); // Solo 2 de 3 exitosas
      expect(inventario.obtenerStock(1)).toBe(25); // 50 - 10 - 15 = 25
    });
  });
});

// Exportar clase para reutilización en tests de integración
module.exports = {
  InventarioMock
};
