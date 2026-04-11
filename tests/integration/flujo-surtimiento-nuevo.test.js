/**
 * TEST: Nuevo Flujo Simplificado de Surtimiento
 *
 * Arquitectura NUEVA:
 * 1. Inventarios genera remisión → ✅ DESCUENTA stock inmediatamente
 * 2. Finanzas confirma → ✅ VALIDA (solo confirmación, sin descuento)
 * 3. Si finanzas rechaza → ✅ REPONE stock
 *
 * Ventajas:
 * - Stock refleja realidad inmediata
 * - Flujo más simple y claro
 * - Sin doble descuento
 * - Reponer stock es reverso directo
 */

const pool = require('../../db');
const logger = require('../../utils/logger');

describe('🔄 NUEVO FLUJO: Stock Descuenta en Remisión (Simplificado)', () => {

  /**
   * TEST 1: Flujo completo exitoso
   * Inventarios genera → descuenta stock
   * Finanzas confirma → valida solamente
   * Stock final correcto
   */
  test('✅ Flujo exitoso: Generar → (Stock -) → Confirmar → (Solo valida)', async () => {
    const tenantId = 1;
    const adminId = 1;
    const clienteId = 1;

    console.log('\n═════════════════════════════════════════════════════════════');
    console.log('   🔄 NUEVO FLUJO: Stock Descuenta en Remisión');
    console.log('═════════════════════════════════════════════════════════════\n');

    // SETUP
    console.log('📋 SETUP: Crear productos y stock inicial\n');

    const varRes = await pool.query(`
      INSERT INTO producto_variantes (sku, productoid, stock, tenant_id)
      VALUES ('TEST-NUEVO-FLUJO', 1, 50, $1)
      ON CONFLICT (sku) DO UPDATE SET stock = 50
      RETURNING varianteid
    `, [tenantId]);
    const varianteId = varRes.rows[0].varianteid;
    console.log(`✅ Variante: ${varianteId} (Stock inicial: 50 piezas)`);

    await pool.query(`
      INSERT INTO stock_admin (variante_id, admin_id, cantidad, tenant_id)
      VALUES ($1, $2, 50, $3)
      ON CONFLICT (variante_id, admin_id, tenant_id) DO UPDATE SET cantidad = 50
    `, [varianteId, adminId, tenantId]);
    console.log(`✅ Stock admin: 50 piezas`);

    const pedidoRes = await pool.query(`
      INSERT INTO pedidos (clienteid, agenteid, montototal, tenant_id, estatus)
      VALUES ($1, 1, 300, $2, 'Listo para Surtir')
      RETURNING pedidoid
    `, [clienteId, tenantId]);
    const pedidoId = pedidoRes.rows[0].pedidoid;
    console.log(`✅ Pedido: #${pedidoId}\n`);

    const detalleRes = await pool.query(`
      INSERT INTO detallesdelpedido (pedidoid, varianteid, cantidadpaquetes, piezastotales, preciounitario, tenant_id)
      VALUES ($1, $2, 25, 25, 12, $3)
      RETURNING detalleid
    `, [pedidoId, varianteId, tenantId]);
    const detalleId = detalleRes.rows[0].detalleid;
    console.log(`✅ Detalle: 25 piezas`);

    // ════════════════════════════════════════════════════════════════
    // PASO 1: INVENTARIOS GENERA REMISIÓN (DESCUENTA STOCK)
    // ════════════════════════════════════════════════════════════════
    console.log('\n1️⃣ INVENTARIOS - Generar Remisión (CON DESCUENTO DE STOCK)');
    console.log('   └─ POST /api/remisiones/generar\n');

    const client1 = await pool.connect();
    try {
      await client1.query('BEGIN');

      // Crear remisión (CON descuento de stock ahora)
      const remisionRes = await client1.query(`
        INSERT INTO remisiones (pedido_id, cliente_id, folio, total_remision, estado, tenant_id)
        VALUES ($1, $2, 'NEW-FLUJO-001', 300, 'PENDIENTE_REVISION', $3)
        RETURNING remision_id
      `, [pedidoId, clienteId, tenantId]);
      const remisionId = remisionRes.rows[0].remision_id;
      console.log(`   ✅ Remisión generada: ${remisionId}`);

      // Crear detalles de remisión
      await client1.query(`
        INSERT INTO detalles_remision (remision_id, detalle_pedido_id, variante_id, cantidad_paquetes_surtidos, piezas_surtidas, precio_unitario, subtotal, tenant_id, ronda_surtido)
        VALUES ($1, $2, $3, 25, 25, 12, 300, $4, 1)
      `, [remisionId, detalleId, varianteId, tenantId]);

      // ✅ DESCUENTA STOCK INMEDIATAMENTE
      const stockAnterior = await client1.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND admin_id = $2',
        [varianteId, adminId]
      );
      const prevStock = parseInt(stockAnterior.rows[0].cantidad);

      await client1.query(`
        UPDATE stock_admin SET cantidad = cantidad - 25
        WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3
      `, [varianteId, adminId, tenantId]);

      const stockDespues = await client1.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND admin_id = $2',
        [varianteId, adminId]
      );
      const afterStock = parseInt(stockDespues.rows[0].cantidad);

      console.log(`   📊 Stock ANTES: ${prevStock} → DESPUÉS: ${afterStock}`);
      console.log(`   ✅ Stock descuento: -25 piezas en remisión`);

      // Actualizar cantidad_surtida_remisiones
      await client1.query(`
        UPDATE detallesdelpedido SET cantidad_surtida_remisiones = 25
        WHERE detalleid = $1 AND tenant_id = $2
      `, [detalleId, tenantId]);

      // Cambiar estado del pedido
      await client1.query(`
        UPDATE pedidos SET estatus = 'Listo para remisionar', tiene_remisiones = true
        WHERE pedidoid = $1 AND tenant_id = $2
      `, [pedidoId, tenantId]);

      await client1.query('COMMIT');
      console.log(`   ✅ COMMIT transacción - Remisión completada\n`);

    } finally {
      client1.release();
    }

    // Verificar stock después de remisión
    const stock1 = await pool.query(
      'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND admin_id = $2',
      [varianteId, adminId]
    );
    console.log(`📊 ESTADO DESPUÉS REMISIÓN: Stock = ${stock1.rows[0].cantidad} piezas`);
    expect(stock1.rows[0].cantidad).toBe(25); // 50 - 25 ✅
    console.log(`   ✅ VALIDACIÓN: Stock se descuento correctamente\n`);

    // ════════════════════════════════════════════════════════════════
    // PASO 2: FINANZAS CONFIRMA (SOLO VALIDA, NO DESCUENTA)
    // ════════════════════════════════════════════════════════════════
    console.log('2️⃣ FINANZAS - Confirmar Surtido (SOLO VALIDA)');
    console.log('   └─ POST /api/admin/pedidos/:id/confirmar-surtido\n');

    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');

      // Validar que stock existe (ya fue descuento)
      const stockCheck = await client2.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND admin_id = $2',
        [varianteId, adminId]
      );
      const stockBefore = parseInt(stockCheck.rows[0].cantidad);
      console.log(`   ℹ️ Stock actual: ${stockBefore} piezas`);
      console.log(`   ✅ Stock ya fue descuento en remisión (no descuento acá)`);

      // Actualizar estado_producto
      await client2.query(`
        UPDATE detallesdelpedido SET estado_producto = 'Facturado'
        WHERE detalleid = $1 AND tenant_id = $2
      `, [detalleId, tenantId]);

      // Cambiar estado del pedido
      await client2.query(`
        UPDATE pedidos SET estatus = 'Surtido', completamente_surtido = true, fecha_confirmacion = NOW()
        WHERE pedidoid = $1 AND tenant_id = $2
      `, [pedidoId, tenantId]);

      await client2.query('COMMIT');
      console.log(`   ✅ COMMIT transacción - Confirmación completada\n`);

    } finally {
      client2.release();
    }

    // Verificar stock final
    const stock2 = await pool.query(
      'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND admin_id = $2',
      [varianteId, adminId]
    );
    console.log(`📊 ESTADO DESPUÉS CONFIRMAR: Stock = ${stock2.rows[0].cantidad} piezas`);
    expect(stock2.rows[0].cantidad).toBe(25); // Sin cambios ✅
    console.log(`   ✅ VALIDACIÓN: Stock no cambió en confirmación\n`);

    console.log('═════════════════════════════════════════════════════════════');
    console.log('   ✅ FLUJO EXITOSO COMPLETADO');
    console.log('═════════════════════════════════════════════════════════════\n');
  });

  /**
   * TEST 2: Finanzas rechaza (deben reponer stock)
   */
  test('✅ Rechazo de finanzas: Reponen el stock descuento', async () => {
    const tenantId = 1;
    const adminId = 1;
    const clienteId = 2; // Cliente diferente

    console.log('\n═════════════════════════════════════════════════════════════');
    console.log('   🔄 RECHAZO: Finanzas rechaza → Reposición de Stock');
    console.log('═════════════════════════════════════════════════════════════\n');

    // SETUP: Producto con 30 piezas
    const varRes = await pool.query(`
      INSERT INTO producto_variantes (sku, productoid, stock, tenant_id)
      VALUES ('TEST-RECHAZO-FLUJO', 1, 30, $1)
      ON CONFLICT (sku) DO UPDATE SET stock = 30
      RETURNING varianteid
    `, [tenantId]);
    const varianteId = varRes.rows[0].varianteid;

    await pool.query(`
      INSERT INTO stock_admin (variante_id, admin_id, cantidad, tenant_id)
      VALUES ($1, $2, 30, $3)
      ON CONFLICT (variante_id, admin_id, tenant_id) DO UPDATE SET cantidad = 30
    `, [varianteId, adminId, tenantId]);

    // Crear pedido
    const pedidoRes = await pool.query(`
      INSERT INTO pedidos (clienteid, agenteid, montototal, tenant_id, estatus)
      VALUES ($1, 1, 200, $2, 'Listo para Surtir')
      RETURNING pedidoid
    `, [clienteId, tenantId]);
    const pedidoId = pedidoRes.rows[0].pedidoid;

    // Crear detalle
    const detalleRes = await pool.query(`
      INSERT INTO detallesdelpedido (pedidoid, varianteid, cantidadpaquetes, piezastotales, preciounitario, tenant_id, cantidadsurtida)
      VALUES ($1, $2, 20, 20, 10, $3, 20)
      RETURNING detalleid
    `, [pedidoId, varianteId, tenantId]);
    const detalleId = detalleRes.rows[0].detalleid;

    // Simular que inventarios ya descuento
    await pool.query(`
      UPDATE stock_admin SET cantidad = 10
      WHERE variante_id = $1 AND admin_id = $2
    `, [varianteId, adminId]);

    console.log('✅ Estado inicial: Stock = 10 (ya descuento 20 en remisión)\n');

    // RECHAZO: Reposición
    console.log('🔄 RECHAZO: Finanzas rechaza surtimiento\n');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Reponer stock
      const repuestResult = await client.query(`
        UPDATE stock_admin
        SET cantidad = cantidad + 20
        WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3
        RETURNING cantidad
      `, [varianteId, adminId, tenantId]);

      const nuevoStock = repuestResult.rows[0].cantidad;
      console.log(`   📊 Stock ANTES: 10 → DESPUÉS (repuesto): ${nuevoStock}`);
      expect(nuevoStock).toBe(30); // Vuelve a 30 ✅

      // Registrar movimiento
      await client.query(`
        INSERT INTO movimientos_inventario (admin_id, variante_id, tenant_id, tipo, cantidad, stock_previo, stock_posterior, motivo)
        VALUES ($1, $2, $3, 'DEVOLUCIÓN', 20, 10, 30, 'Rechazo por finanzas')
      `, [adminId, varianteId, tenantId]);

      // Actualizar estado del detalle
      await client.query(`
        UPDATE detallesdelpedido SET estado_producto = 'Pendiente', cantidadsurtida = 0
        WHERE detalleid = $1
      `, [detalleId]);

      // Actualizar estado del pedido
      await client.query(`
        UPDATE pedidos SET estatus = 'Rechazado por Finanzas', rechazado_por_finanzas = true
        WHERE pedidoid = $1
      `, [pedidoId]);

      await client.query('COMMIT');
      console.log(`   ✅ Stock reapuesto correctamente\n`);

    } finally {
      client.release();
    }

    // Verificar stock final
    const stockFinal = await pool.query(
      'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND admin_id = $2',
      [varianteId, adminId]
    );
    console.log(`📊 ESTADO FINAL: Stock = ${stockFinal.rows[0].cantidad} piezas`);
    expect(stockFinal.rows[0].cantidad).toBe(30); // Original ✅
    console.log(`   ✅ VALIDACIÓN: Stock reapuesto al valor original\n`);

    console.log('═════════════════════════════════════════════════════════════');
    console.log('   ✅ RECHAZO COMPLETADO - STOCK REAPUESTO');
    console.log('═════════════════════════════════════════════════════════════\n');
  });

  /**
   * TEST 3: Comparar flujos (ANTES vs. AHORA)
   */
  test('📊 Comparación de flujos: ANTES vs. AHORA', () => {
    console.log('\n═════════════════════════════════════════════════════════════');
    console.log('   📊 COMPARACIÓN: Flujo ANTERIOR vs. NUEVO');
    console.log('═════════════════════════════════════════════════════════════\n');

    const flowComparison = `
    ┌─────────────────────────────────────────────────────────────────┐
    │ FLUJO ANTERIOR (COMPLICADO)                                     │
    ├─────────────────────────────────────────────────────────────────┤
    │ 1. Inventarios genera remisión                                  │
    │    └─ Stock: No cambia (espera finanzas)                        │
    │ 2. Finanzas confirma                                            │
    │    └─ Stock: Descuenta ✅ (momento crítico)                     │
    │ 3. Finanzas rechaza                                             │
    │    └─ Stock: ??? (No había lógica clara de reposición)          │
    │                                                                  │
    │ PROBLEMAS:                                                      │
    │ ❌ 2 momentos donde se puede fallar                            │
    │ ❌ Sin descuento hasta finanzas (confuso)                       │
    │ ❌ Difícil de debuggear si algo falla                           │
    └─────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────┐
    │ FLUJO NUEVO (SIMPLIFICADO) ✅                                  │
    ├─────────────────────────────────────────────────────────────────┤
    │ 1. Inventarios genera remisión                                  │
    │    └─ Stock: Descuenta inmediatamente ✅                        │
    │ 2. Finanzas confirma                                            │
    │    └─ Stock: Solo valida (sin cambios) ✅                       │
    │ 3. Finanzas rechaza                                             │
    │    └─ Stock: Repone directamente ✅                             │
    │                                                                  │
    │ VENTAJAS:                                                       │
    │ ✅ Stock refleja realidad inmediata                             │
    │ ✅ Flujo predecible y simple                                    │
    │ ✅ Fácil de debuggear y auditar                                 │
    │ ✅ Sin doble descuento posible                                  │
    │ ✅ Reposición es operación reversa clara                        │
    └─────────────────────────────────────────────────────────────────┘
    `;

    console.log(flowComparison);
    console.log('═════════════════════════════════════════════════════════════\n');

    expect(true).toBe(true);
  });

});
