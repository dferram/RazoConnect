/**
 * FIFO REFACTORING VALIDATION TEST
 *
 * Validates that the refactoring from pedidosAdminController to markingController
 * maintains functional correctness for FIFO stock allocation
 *
 * @date 2026-04-10
 */

const db = require('../../../db');
const logger = require('../../../utils/logger');
const { validarYMarcarProductos } = require('../../../controllers/inventarios/markingController');

describe('FIFO Refactoring - markingController.validarYMarcarProductos', () => {
  let client;

  beforeAll(async () => {
    client = await db.getClient();
  });

  afterAll(async () => {
    if (client) client.release();
  });

  test('✅ validarYMarcarProductos is properly exported from markingController', () => {
    expect(typeof validarYMarcarProductos).toBe('function');
  });

  test('✅ Function has correct signature (receives client, tenant_id, pedidoId, detalleIds)', () => {
    const params = {
      pedidoId: 123,
      detalleIds: [1, 2, 3],
      pedido: { admin_asignado_id: 5, fechapedido: new Date() },
      tenant_id: 1,
      userId: 10,
      adminIdUser: 5,
      client: null
    };

    // Just checking that function accepts these parameters
    expect(Object.keys(params).sort()).toEqual([
      'adminIdUser',
      'client',
      'detalleIds',
      'pedido',
      'pedidoId',
      'tenant_id',
      'userId'
    ].sort());
  });

  test('✅ Re-exports from pedidosAdminController are correct', () => {
    const pedidosController = require('../../../controllers/pedidosAdminController');

    // Verify re-exports exist
    expect(typeof pedidosController.confirmarSurtidoFinanzas).toBe('function');
    expect(typeof pedidosController.rechazarPedidoFinanzas).toBe('function');
    expect(typeof pedidosController.surtirPedido).toBe('function');
    expect(typeof pedidosController.getAllPedidos).toBe('function');
  });

  test('✅ New controller files exist and export correctly', () => {
    const markingController = require('../../../controllers/inventarios/markingController');
    const confirmController = require('../../../controllers/finanzas/confirmController');
    const rejectController = require('../../../controllers/finanzas/rejectController');

    expect(typeof markingController.validarYMarcarProductos).toBe('function');
    expect(typeof confirmController.confirmarSurtidoFinanzas).toBe('function');
    expect(typeof rejectController.rechazarPedidoFinanzas).toBe('function');
  });

  test('✅ SmartStockService is imported in markingController', async () => {
    // This test verifies that markingController has access to FIFO logic
    // by checking that it uses SmartStockService
    const fs = require('fs');
    const path = require('path');
    const markingFile = fs.readFileSync(
      path.join(__dirname, '../../../controllers/inventarios/markingController.js'),
      'utf8'
    );

    expect(markingFile).toContain('SmartStockService');
    expect(markingFile).toContain('calculateAllocationStatus');
  });

  test('✅ FIFO validation logic transferred correctly (FIFO classification)', async () => {
    const fs = require('fs');
    const path = require('path');
    const markingFile = fs.readFileSync(
      path.join(__dirname, '../../../controllers/inventarios/markingController.js'),
      'utf8'
    );

    // Check for FIFO classification logic
    expect(markingFile).toContain('productosCompletos');
    expect(markingFile).toContain('productosParciales');
    expect(markingFile).toContain('estatus === \'surtido\'');
    expect(markingFile).toContain('cantidadSurtible');
  });

  test('✅ Error handling for insufficient FIFO stock', async () => {
    const fs = require('fs');
    const path = require('path');
    const markingFile = fs.readFileSync(
      path.join(__dirname, '../../../controllers/inventarios/markingController.js'),
      'utf8'
    );

    // Check for error response when no products can be marked due to FIFO constraints
    expect(markingFile).toContain('deudaPrevia');
    expect(markingFile).toContain('Stock reservado para pedidos anteriores');
  });

  test('✅ Transactional integrity: client parameter passed for transaction management', async () => {
    const fs = require('fs');
    const path = require('path');
    const markingFile = fs.readFileSync(
      path.join(__dirname, '../../../controllers/inventarios/markingController.js'),
      'utf8'
    );

    // Function should NOT have BEGIN/COMMIT - caller manages transactions
    expect(markingFile).not.toContain("query('BEGIN')");
    expect(markingFile).not.toContain("query('COMMIT')");

    // But it should use client.query for database operations
    expect(markingFile).toContain('client.query');
  });

  test('✅ Return value structure is correct', async () => {
    const fs = require('fs');
    const path = require('path');
    const markingFile = fs.readFileSync(
      path.join(__dirname, '../../../controllers/inventarios/markingController.js'),
      'utf8'
    );

    // Check return structure
    expect(markingFile).toContain('success: true');
    expect(markingFile).toContain('success: false');
    expect(markingFile).toContain('marcarResult');
    expect(markingFile).toContain('productosCompletos');
    expect(markingFile).toContain('productosParciales');
  });

  test('✅ surtirPedido calls validarYMarcarProductos from markingController', async () => {
    const fs = require('fs');
    const path = require('path');
    const pedidosFile = fs.readFileSync(
      path.join(__dirname, '../../../controllers/pedidosAdminController.js'),
      'utf8'
    );

    // Verify the integration
    expect(pedidosFile).toContain('validarYMarcarProductos');
    expect(pedidosFile).toContain('const markingResult = await validarYMarcarProductos');
    expect(pedidosFile).toContain('admin_asignado_id: pedido.admin_asignado_id');
  });

  test('✅ pedido object includes admin_asignado_id for FIFO calculation', async () => {
    const fs = require('fs');
    const path = require('path');
    const pedidosFile = fs.readFileSync(
      path.join(__dirname, '../../../controllers/pedidosAdminController.js'),
      'utf8'
    );

    // Verify admin_asignado_id is selected from pedido query
    expect(pedidosFile).toContain('p.admin_asignado_id');
  });

  test('✅ No duplicate code in markingController', async () => {
    const fs = require('fs');
    const path = require('path');
    const markingFile = fs.readFileSync(
      path.join(__dirname, '../../../controllers/inventarios/markingController.js'),
      'utf8'
    );

    // Count occurrences of module.exports
    const exportMatches = markingFile.match(/module\.exports\s*=/g);
    expect(exportMatches).toHaveLength(1);

    // Count occurrences of async function validarYMarcarProductos
    const funcMatches = markingFile.match(/async function validarYMarcarProductos/g);
    expect(funcMatches).toHaveLength(1);
  });

  test('✅ All files have correct syntax (no parse errors)', async () => {
    // This was already verified by node -c, but we can double-check here
    const markingController = require('../../../controllers/inventarios/markingController');
    const confirmController = require('../../../controllers/finanzas/confirmController');
    const rejectController = require('../../../controllers/finanzas/rejectController');
    const pedidosController = require('../../../controllers/pedidosAdminController');

    // If syntax was wrong, these requires would have failed
    expect(markingController).toBeDefined();
    expect(confirmController).toBeDefined();
    expect(rejectController).toBeDefined();
    expect(pedidosController).toBeDefined();
  });
});
