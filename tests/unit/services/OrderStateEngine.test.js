/**
 * @file tests/unit/services/OrderStateEngine.test.js
 * @description Tests unitarios para OrderStateEngine (lógica pura sin BD)
 */

const OrderStateEngine = require('../../../services/OrderStateEngine');

describe('OrderStateEngine', () => {
  describe('calculateOrderState', () => {
    test('debe retornar "Bajo pedido" cuando el array está vacío', () => {
      expect(OrderStateEngine.calculateOrderState([])).toBe('Bajo pedido');
      expect(OrderStateEngine.calculateOrderState(null)).toBe('Bajo pedido');
    });

    test('debe retornar "Surtido completo" cuando todos los productos están facturados', () => {
      const items = [
        { estado_producto: 'Facturado' },
        { estado_producto: 'Facturado' },
        { estado_producto: 'Facturado' }
      ];
      expect(OrderStateEngine.calculateOrderState(items)).toBe('Surtido completo');
    });

    test('debe retornar "Listo para remisionar" cuando hay al menos un producto surtido (sin facturados)', () => {
      const items = [
        { estado_producto: 'Surtido' },
        { estado_producto: 'Con stock' },
        { estado_producto: 'Bajo pedido' }
      ];
      expect(OrderStateEngine.calculateOrderState(items)).toBe('Listo para remisionar');
    });

    test('debe retornar "Completo" cuando todos los productos activos tienen stock', () => {
      const items = [
        { estado_producto: 'Con stock' },
        { estado_producto: 'Con stock' },
        { estado_producto: 'Con stock' }
      ];
      expect(OrderStateEngine.calculateOrderState(items)).toBe('Completo');
    });

    test('debe retornar "Bajo pedido" cuando todos los productos activos están sin stock', () => {
      const items = [
        { estado_producto: 'Bajo pedido' },
        { estado_producto: 'Bajo pedido' },
        { estado_producto: 'Bajo pedido' }
      ];
      expect(OrderStateEngine.calculateOrderState(items)).toBe('Bajo pedido');
    });

    test('debe retornar "Combinado" cuando hay mezcla de productos con y sin stock', () => {
      const items = [
        { estado_producto: 'Con stock' },
        { estado_producto: 'Bajo pedido' },
        { estado_producto: 'Con stock' }
      ];
      expect(OrderStateEngine.calculateOrderState(items)).toBe('Combinado');
    });

    test('debe ignorar productos facturados al calcular el estado', () => {
      const items = [
        { estado_producto: 'Facturado' },
        { estado_producto: 'Con stock' },
        { estado_producto: 'Con stock' }
      ];
      // Los facturados se ignoran, quedan 2 'Con stock' → 'Completo'
      expect(OrderStateEngine.calculateOrderState(items)).toBe('Completo');
    });

    test('debe retornar "Completo" cuando hay facturados y el resto tiene stock', () => {
      const items = [
        { estado_producto: 'Facturado' },
        { estado_producto: 'Facturado' },
        { estado_producto: 'Con stock' },
        { estado_producto: 'Con stock' }
      ];
      expect(OrderStateEngine.calculateOrderState(items)).toBe('Completo');
    });

    test('debe retornar "Bajo pedido" cuando hay facturados y el resto sin stock', () => {
      const items = [
        { estado_producto: 'Facturado' },
        { estado_producto: 'Bajo pedido' },
        { estado_producto: 'Bajo pedido' }
      ];
      expect(OrderStateEngine.calculateOrderState(items)).toBe('Bajo pedido');
    });

    test('debe retornar "Combinado" cuando hay facturados y el resto tiene mezcla', () => {
      const items = [
        { estado_producto: 'Facturado' },
        { estado_producto: 'Con stock' },
        { estado_producto: 'Bajo pedido' }
      ];
      expect(OrderStateEngine.calculateOrderState(items)).toBe('Combinado');
    });

    test('debe retornar "Listo para remisionar" cuando hay surtidos y facturados', () => {
      const items = [
        { estado_producto: 'Facturado' },
        { estado_producto: 'Surtido' },
        { estado_producto: 'Con stock' }
      ];
      // Facturados se ignoran, queda al menos 1 'Surtido' → 'Listo para remisionar'
      expect(OrderStateEngine.calculateOrderState(items)).toBe('Listo para remisionar');
    });
  });

  describe('canTransitionToSurtido', () => {
    test('debe retornar true solo para estado "Con stock"', () => {
      expect(OrderStateEngine.canTransitionToSurtido('Con stock')).toBe(true);
    });

    test('debe retornar false para estado "Bajo pedido"', () => {
      expect(OrderStateEngine.canTransitionToSurtido('Bajo pedido')).toBe(false);
    });

    test('debe retornar false para estado "Surtido"', () => {
      expect(OrderStateEngine.canTransitionToSurtido('Surtido')).toBe(false);
    });

    test('debe retornar false para estado "Facturado"', () => {
      expect(OrderStateEngine.canTransitionToSurtido('Facturado')).toBe(false);
    });

    test('debe retornar false para estado null', () => {
      expect(OrderStateEngine.canTransitionToSurtido(null)).toBe(false);
    });
  });

  describe('evaluateProductStockState', () => {
    test('debe retornar "Con stock" cuando hay stock suficiente', () => {
      expect(OrderStateEngine.evaluateProductStockState(null, 10, 15)).toBe('Con stock');
      expect(OrderStateEngine.evaluateProductStockState(null, 10, 10)).toBe('Con stock');
    });

    test('debe retornar "Bajo pedido" cuando no hay stock suficiente', () => {
      expect(OrderStateEngine.evaluateProductStockState(null, 10, 5)).toBe('Bajo pedido');
      expect(OrderStateEngine.evaluateProductStockState(null, 10, 0)).toBe('Bajo pedido');
    });

    test('debe mantener estado "Surtido" sin importar el stock', () => {
      expect(OrderStateEngine.evaluateProductStockState('Surtido', 10, 0)).toBe('Surtido');
      expect(OrderStateEngine.evaluateProductStockState('Surtido', 10, 100)).toBe('Surtido');
    });

    test('debe mantener estado "Facturado" sin importar el stock', () => {
      expect(OrderStateEngine.evaluateProductStockState('Facturado', 10, 0)).toBe('Facturado');
      expect(OrderStateEngine.evaluateProductStockState('Facturado', 10, 100)).toBe('Facturado');
    });

    test('debe reevaluar estado "Con stock" basado en stock actual', () => {
      expect(OrderStateEngine.evaluateProductStockState('Con stock', 10, 5)).toBe('Bajo pedido');
      expect(OrderStateEngine.evaluateProductStockState('Con stock', 10, 15)).toBe('Con stock');
    });

    test('debe reevaluar estado "Bajo pedido" basado en stock actual', () => {
      expect(OrderStateEngine.evaluateProductStockState('Bajo pedido', 10, 15)).toBe('Con stock');
      expect(OrderStateEngine.evaluateProductStockState('Bajo pedido', 10, 5)).toBe('Bajo pedido');
    });
  });

  describe('Invariantes y propiedades', () => {
    test('PROPIEDAD: Filtrar facturados nunca aumenta la severidad del estado', () => {
      // Estados ordenados por severidad (menor a mayor):
      // 'Surtido completo' < 'Listo para remisionar' < 'Completo' < 'Combinado' < 'Bajo pedido'
      
      const itemsSinFacturados = [
        { estado_producto: 'Con stock' },
        { estado_producto: 'Con stock' }
      ];
      
      const itemsConFacturados = [
        { estado_producto: 'Facturado' },
        { estado_producto: 'Con stock' },
        { estado_producto: 'Con stock' }
      ];

      const estadoSin = OrderStateEngine.calculateOrderState(itemsSinFacturados);
      const estadoCon = OrderStateEngine.calculateOrderState(itemsConFacturados);

      // Ambos deberían ser 'Completo' (los facturados se ignoran)
      expect(estadoSin).toBe('Completo');
      expect(estadoCon).toBe('Completo');
    });

    test('PROPIEDAD: Un pedido con todos los items en el mismo estado retorna un estado consistente', () => {
      const todosConStock = [
        { estado_producto: 'Con stock' },
        { estado_producto: 'Con stock' },
        { estado_producto: 'Con stock' }
      ];
      expect(OrderStateEngine.calculateOrderState(todosConStock)).toBe('Completo');

      const todosBajoPedido = [
        { estado_producto: 'Bajo pedido' },
        { estado_producto: 'Bajo pedido' },
        { estado_producto: 'Bajo pedido' }
      ];
      expect(OrderStateEngine.calculateOrderState(todosBajoPedido)).toBe('Bajo pedido');

      const todosFacturados = [
        { estado_producto: 'Facturado' },
        { estado_producto: 'Facturado' },
        { estado_producto: 'Facturado' }
      ];
      expect(OrderStateEngine.calculateOrderState(todosFacturados)).toBe('Surtido completo');
    });

    test('PROPIEDAD: Agregar un item "Surtido" siempre resulta en "Listo para remisionar" (si no todos son facturados)', () => {
      const itemsBase = [
        { estado_producto: 'Con stock' },
        { estado_producto: 'Bajo pedido' }
      ];
      expect(OrderStateEngine.calculateOrderState(itemsBase)).toBe('Combinado');

      const itemsConSurtido = [
        { estado_producto: 'Surtido' },
        { estado_producto: 'Con stock' },
        { estado_producto: 'Bajo pedido' }
      ];
      expect(OrderStateEngine.calculateOrderState(itemsConSurtido)).toBe('Listo para remisionar');
    });
  });
});
