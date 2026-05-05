/**
 * UNIT TESTS - PDF Stock Classification Logic
 * 
 * Tests the hasRealStock() helper function and classification filters
 * to ensure products are classified based on real-time stock availability
 * instead of the stale esbackorder flag.
 * 
 * @module tests/unit/pdfController-stock-classification
 */

describe('PDF Stock Classification - hasRealStock() Logic', () => {
  
  // Helper function extracted from pdfController.js
  const hasRealStock = (item) => {
    const requiredQuantity = parseInt(item.cantidad || 0) * parseInt(item.tamano_cantidad || 1);
    const actualStock = parseInt(item.stock_actual_variante || 0);
    return actualStock >= requiredQuantity;
  };

  describe('hasRealStock() - Basic Functionality', () => {
    
    test('returns true when stock is greater than required quantity', () => {
      const item = {
        cantidad: 10,
        tamano_cantidad: 1,
        stock_actual_variante: 100
      };
      
      expect(hasRealStock(item)).toBe(true);
    });

    test('returns true when stock exactly equals required quantity', () => {
      const item = {
        cantidad: 25,
        tamano_cantidad: 1,
        stock_actual_variante: 25
      };
      
      expect(hasRealStock(item)).toBe(true);
    });

    test('returns false when stock is less than required quantity', () => {
      const item = {
        cantidad: 100,
        tamano_cantidad: 1,
        stock_actual_variante: 30
      };
      
      expect(hasRealStock(item)).toBe(false);
    });

    test('returns false when stock is zero', () => {
      const item = {
        cantidad: 10,
        tamano_cantidad: 1,
        stock_actual_variante: 0
      };
      
      expect(hasRealStock(item)).toBe(false);
    });

    test('returns true when required quantity is zero (edge case)', () => {
      const item = {
        cantidad: 0,
        tamano_cantidad: 1,
        stock_actual_variante: 100
      };
      
      expect(hasRealStock(item)).toBe(true);
    });
  });

  describe('hasRealStock() - Package Size Calculations', () => {
    
    test('correctly calculates required quantity with package size > 1', () => {
      const item = {
        cantidad: 10,           // 10 packages
        tamano_cantidad: 5,     // 5 pieces per package
        stock_actual_variante: 50  // 50 pieces available
      };
      // Required: 10 * 5 = 50 pieces
      // Available: 50 pieces
      // Result: 50 >= 50 = true
      
      expect(hasRealStock(item)).toBe(true);
    });

    test('returns false when stock insufficient for package size', () => {
      const item = {
        cantidad: 10,           // 10 packages
        tamano_cantidad: 5,     // 5 pieces per package
        stock_actual_variante: 40  // Only 40 pieces available
      };
      // Required: 10 * 5 = 50 pieces
      // Available: 40 pieces
      // Result: 40 >= 50 = false
      
      expect(hasRealStock(item)).toBe(false);
    });

    test('handles large package sizes correctly', () => {
      const item = {
        cantidad: 5,            // 5 packages
        tamano_cantidad: 100,   // 100 pieces per package
        stock_actual_variante: 500  // 500 pieces available
      };
      // Required: 5 * 100 = 500 pieces
      // Available: 500 pieces
      // Result: 500 >= 500 = true
      
      expect(hasRealStock(item)).toBe(true);
    });
  });

  describe('hasRealStock() - Edge Cases and Null Handling', () => {
    
    test('handles null cantidad gracefully', () => {
      const item = {
        cantidad: null,
        tamano_cantidad: 1,
        stock_actual_variante: 100
      };
      
      expect(hasRealStock(item)).toBe(true); // 0 * 1 = 0, 100 >= 0
    });

    test('handles undefined cantidad gracefully', () => {
      const item = {
        tamano_cantidad: 1,
        stock_actual_variante: 100
      };
      
      expect(hasRealStock(item)).toBe(true); // 0 * 1 = 0, 100 >= 0
    });

    test('handles null tamano_cantidad gracefully (defaults to 1)', () => {
      const item = {
        cantidad: 10,
        tamano_cantidad: null,
        stock_actual_variante: 10
      };
      
      expect(hasRealStock(item)).toBe(true); // 10 * 1 = 10, 10 >= 10
    });

    test('handles undefined tamano_cantidad gracefully (defaults to 1)', () => {
      const item = {
        cantidad: 10,
        stock_actual_variante: 10
      };
      
      expect(hasRealStock(item)).toBe(true); // 10 * 1 = 10, 10 >= 10
    });

    test('handles null stock_actual_variante gracefully', () => {
      const item = {
        cantidad: 10,
        tamano_cantidad: 1,
        stock_actual_variante: null
      };
      
      expect(hasRealStock(item)).toBe(false); // 0 >= 10 = false
    });

    test('handles undefined stock_actual_variante gracefully', () => {
      const item = {
        cantidad: 10,
        tamano_cantidad: 1
      };
      
      expect(hasRealStock(item)).toBe(false); // 0 >= 10 = false
    });

    test('handles string numbers correctly', () => {
      const item = {
        cantidad: '10',
        tamano_cantidad: '2',
        stock_actual_variante: '20'
      };
      
      expect(hasRealStock(item)).toBe(true); // 10 * 2 = 20, 20 >= 20
    });

    test('handles negative values gracefully', () => {
      const item = {
        cantidad: -5,
        tamano_cantidad: 1,
        stock_actual_variante: 100
      };
      
      expect(hasRealStock(item)).toBe(true); // -5 * 1 = -5, 100 >= -5
    });
  });

  describe('Classification Logic - Stale esbackorder Flag Scenarios', () => {
    
    test('STALE FLAG: Product with esbackorder=true but sufficient stock should be classified as CON_STOCK', () => {
      const item = {
        detalleid: 1,
        cantidad: 10,
        tamano_cantidad: 1,
        stock_actual_variante: 100,
        esbackorder: true,  // STALE FLAG
        cantidadsurtida: 0,
        estado_producto: 'Pendiente'
      };
      
      const hasStock = hasRealStock(item);
      const expectedClassification = hasStock ? 'CON_STOCK' : 'BAJO_PEDIDO';
      
      expect(hasStock).toBe(true);
      expect(expectedClassification).toBe('CON_STOCK');
    });

    test('STALE FLAG: Product with esbackorder=true and exact stock match should be classified as CON_STOCK', () => {
      const item = {
        detalleid: 2,
        cantidad: 25,
        tamano_cantidad: 1,
        stock_actual_variante: 25,
        esbackorder: true,  // STALE FLAG
        cantidadsurtida: 0,
        estado_producto: 'Pendiente'
      };
      
      const hasStock = hasRealStock(item);
      const expectedClassification = hasStock ? 'CON_STOCK' : 'BAJO_PEDIDO';
      
      expect(hasStock).toBe(true);
      expect(expectedClassification).toBe('CON_STOCK');
    });

    test('CORRECT FLAG: Product with esbackorder=true and insufficient stock should remain BAJO_PEDIDO', () => {
      const item = {
        detalleid: 3,
        cantidad: 100,
        tamano_cantidad: 1,
        stock_actual_variante: 30,
        esbackorder: true,  // CORRECT FLAG
        cantidadsurtida: 0,
        estado_producto: 'Pendiente'
      };
      
      const hasStock = hasRealStock(item);
      const expectedClassification = hasStock ? 'CON_STOCK' : 'BAJO_PEDIDO';
      
      expect(hasStock).toBe(false);
      expect(expectedClassification).toBe('BAJO_PEDIDO');
    });

    test('Product with esbackorder=false and sufficient stock should be classified as CON_STOCK', () => {
      const item = {
        detalleid: 4,
        cantidad: 10,
        tamano_cantidad: 1,
        stock_actual_variante: 50,
        esbackorder: false,
        cantidadsurtida: 0,
        estado_producto: 'Pendiente'
      };
      
      const hasStock = hasRealStock(item);
      const expectedClassification = hasStock ? 'CON_STOCK' : 'BAJO_PEDIDO';
      
      expect(hasStock).toBe(true);
      expect(expectedClassification).toBe('CON_STOCK');
    });

    test('Product with esbackorder=false but insufficient stock should be classified as BAJO_PEDIDO', () => {
      const item = {
        detalleid: 5,
        cantidad: 100,
        tamano_cantidad: 1,
        stock_actual_variante: 50,
        esbackorder: false,
        cantidadsurtida: 0,
        estado_producto: 'Pendiente'
      };
      
      const hasStock = hasRealStock(item);
      const expectedClassification = hasStock ? 'CON_STOCK' : 'BAJO_PEDIDO';
      
      expect(hasStock).toBe(false);
      expect(expectedClassification).toBe('BAJO_PEDIDO');
    });
  });

  describe('Classification Logic - Priority Order Preservation', () => {
    
    test('FACTURADO: Product with estado_producto=facturado should be classified as FACTURADO regardless of stock', () => {
      const item = {
        detalleid: 6,
        cantidad: 10,
        tamano_cantidad: 1,
        stock_actual_variante: 0,  // No stock
        esbackorder: true,
        cantidadsurtida: 0,
        estado_producto: 'facturado'
      };
      
      const esFacturado = (item.estado_producto || '').toLowerCase().trim() === 'facturado';
      
      expect(esFacturado).toBe(true);
      // Facturado has highest priority - stock doesn't matter
    });

    test('SURTIDO: Product with cantidadsurtida > 0 should be classified as SURTIDO regardless of stock', () => {
      const item = {
        detalleid: 7,
        cantidad: 10,
        tamano_cantidad: 1,
        stock_actual_variante: 0,  // No stock
        esbackorder: true,
        cantidadsurtida: 5,  // Partially fulfilled
        estado_producto: 'Pendiente'
      };
      
      const esFacturado = (item.estado_producto || '').toLowerCase().trim() === 'facturado';
      const esSurtido = !esFacturado && parseInt(item.cantidadsurtida || 0) > 0;
      
      expect(esSurtido).toBe(true);
      // Surtido has second priority - stock doesn't matter
    });

    test('MARCADO: Product in selectedItemIds with stock should be classified as MARCADO', () => {
      const item = {
        detalleid: 8,
        cantidad: 10,
        tamano_cantidad: 1,
        stock_actual_variante: 50,
        esbackorder: true,  // STALE FLAG
        cantidadsurtida: 0,
        estado_producto: 'Pendiente'
      };
      
      const selectedItemIds = [8];
      const esFacturado = (item.estado_producto || '').toLowerCase().trim() === 'facturado';
      const esSurtido = !esFacturado && parseInt(item.cantidadsurtida || 0) > 0;
      const esMarcado = !esFacturado && !esSurtido && selectedItemIds.includes(item.detalleid) && hasRealStock(item);
      
      expect(esMarcado).toBe(true);
      // Marcado has third priority
    });

    test('MARCADO: Product in selectedItemIds WITHOUT stock should NOT be classified as MARCADO', () => {
      const item = {
        detalleid: 9,
        cantidad: 100,
        tamano_cantidad: 1,
        stock_actual_variante: 10,  // Insufficient
        esbackorder: true,
        cantidadsurtida: 0,
        estado_producto: 'Pendiente'
      };
      
      const selectedItemIds = [9];
      const esFacturado = (item.estado_producto || '').toLowerCase().trim() === 'facturado';
      const esSurtido = !esFacturado && parseInt(item.cantidadsurtida || 0) > 0;
      const esMarcado = !esFacturado && !esSurtido && selectedItemIds.includes(item.detalleid) && hasRealStock(item);
      
      expect(esMarcado).toBe(false);
      // Should fall through to BAJO_PEDIDO because hasRealStock = false
    });
  });

  describe('Real-World Scenarios', () => {
    
    test('Scenario 1: Order created with no stock, then stock arrives', () => {
      // Day 1: Order created, no stock
      const itemDay1 = {
        detalleid: 10,
        cantidad: 10,
        tamano_cantidad: 1,
        stock_actual_variante: 0,
        esbackorder: true,  // Set correctly at order creation
        cantidadsurtida: 0,
        estado_producto: 'Pendiente'
      };
      
      expect(hasRealStock(itemDay1)).toBe(false);
      
      // Day 5: Stock arrives (50 units), but esbackorder flag NOT updated
      const itemDay5 = {
        ...itemDay1,
        stock_actual_variante: 50,
        esbackorder: true  // STALE - not updated when stock arrived
      };
      
      expect(hasRealStock(itemDay5)).toBe(true);
      // With fix: classified as CON_STOCK (correct)
      // Without fix: would be classified as BAJO_PEDIDO (incorrect)
    });

    test('Scenario 2: Partial fulfillment - multiple items same variant', () => {
      const selectedItemIds = [];
      
      // Item 1: Already fulfilled
      const item1 = {
        detalleid: 11,
        cantidad: 20,
        tamano_cantidad: 1,
        stock_actual_variante: 50,
        esbackorder: false,
        cantidadsurtida: 20,  // Fulfilled
        estado_producto: 'Surtido'
      };
      
      // Item 2: Same variant, not fulfilled, stale flag
      const item2 = {
        detalleid: 12,
        cantidad: 30,
        tamano_cantidad: 1,
        stock_actual_variante: 50,
        esbackorder: true,  // STALE FLAG
        cantidadsurtida: 0,
        estado_producto: 'Pendiente'
      };
      
      // Item 1 classification
      const esFacturado1 = (item1.estado_producto || '').toLowerCase().trim() === 'facturado';
      const esSurtido1 = !esFacturado1 && parseInt(item1.cantidadsurtida || 0) > 0;
      expect(esSurtido1).toBe(true); // SURTIDO
      
      // Item 2 classification
      const esFacturado2 = (item2.estado_producto || '').toLowerCase().trim() === 'facturado';
      const esSurtido2 = !esFacturado2 && parseInt(item2.cantidadsurtida || 0) > 0;
      const esMarcado2 = !esFacturado2 && !esSurtido2 && selectedItemIds.includes(item2.detalleid) && hasRealStock(item2);
      const hasStock2 = hasRealStock(item2);
      
      expect(hasStock2).toBe(true);
      expect(esMarcado2).toBe(false); // Not marked
      // Should be classified as CON_STOCK (not BAJO_PEDIDO)
    });

    test('Scenario 3: Package size calculation with stale flag', () => {
      const item = {
        detalleid: 13,
        cantidad: 5,            // 5 packages
        tamano_cantidad: 10,    // 10 pieces per package
        stock_actual_variante: 50,  // 50 pieces available
        esbackorder: true,      // STALE FLAG
        cantidadsurtida: 0,
        estado_producto: 'Pendiente'
      };
      
      // Required: 5 * 10 = 50 pieces
      // Available: 50 pieces
      // Result: Should be CON_STOCK
      
      expect(hasRealStock(item)).toBe(true);
    });

    test('Scenario 4: Zero quantity edge case', () => {
      const item = {
        detalleid: 14,
        cantidad: 0,
        tamano_cantidad: 1,
        stock_actual_variante: 100,
        esbackorder: true,
        cantidadsurtida: 0,
        estado_producto: 'Pendiente'
      };
      
      // Required: 0 pieces
      // Available: 100 pieces
      // Result: Should be CON_STOCK (any stock >= 0)
      
      expect(hasRealStock(item)).toBe(true);
    });
  });

  describe('Comparison: Old Logic vs New Logic', () => {
    
    test('OLD LOGIC (buggy): Uses esbackorder flag directly', () => {
      const item = {
        cantidad: 10,
        tamano_cantidad: 1,
        stock_actual_variante: 100,
        esbackorder: true  // STALE
      };
      
      // Old logic (buggy)
      const oldClassification = item.esbackorder ? 'BAJO_PEDIDO' : 'CON_STOCK';
      
      expect(oldClassification).toBe('BAJO_PEDIDO'); // INCORRECT
    });

    test('NEW LOGIC (fixed): Uses real stock comparison', () => {
      const item = {
        cantidad: 10,
        tamano_cantidad: 1,
        stock_actual_variante: 100,
        esbackorder: true  // STALE (ignored)
      };
      
      // New logic (fixed)
      const newClassification = hasRealStock(item) ? 'CON_STOCK' : 'BAJO_PEDIDO';
      
      expect(newClassification).toBe('CON_STOCK'); // CORRECT
    });

    test('Both logics agree when flag is correct and stock is insufficient', () => {
      const item = {
        cantidad: 100,
        tamano_cantidad: 1,
        stock_actual_variante: 30,
        esbackorder: true  // CORRECT
      };
      
      // Old logic
      const oldClassification = item.esbackorder ? 'BAJO_PEDIDO' : 'CON_STOCK';
      
      // New logic
      const newClassification = hasRealStock(item) ? 'CON_STOCK' : 'BAJO_PEDIDO';
      
      expect(oldClassification).toBe('BAJO_PEDIDO');
      expect(newClassification).toBe('BAJO_PEDIDO');
      // Both agree when flag is correct
    });

    test('Both logics agree when flag is correct and stock is sufficient', () => {
      const item = {
        cantidad: 10,
        tamano_cantidad: 1,
        stock_actual_variante: 100,
        esbackorder: false  // CORRECT
      };
      
      // Old logic
      const oldClassification = item.esbackorder ? 'BAJO_PEDIDO' : 'CON_STOCK';
      
      // New logic
      const newClassification = hasRealStock(item) ? 'CON_STOCK' : 'BAJO_PEDIDO';
      
      expect(oldClassification).toBe('CON_STOCK');
      expect(newClassification).toBe('CON_STOCK');
      // Both agree when flag is correct
    });
  });
});
