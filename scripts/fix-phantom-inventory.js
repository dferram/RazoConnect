/**
 * SCRIPT DE SANEAMIENTO: Corrección de Inventario Fantasma
 * 
 * PROBLEMA: Pedidos marcados como "Surtido" cuando el stock real es 0
 * SOLUCIÓN: Recalcular disponibilidad basándose en producto_variantes.stock
 * 
 * EJECUCIÓN: node scripts/fix-phantom-inventory.js
 */

const db = require('../db');

async function fixPhantomInventory() {
  const client = await db.pool.connect();
  
  try {
    console.log('🔧 [INICIO] Script de Saneamiento de Inventario Fantasma');
    console.log('═══════════════════════════════════════════════════════\n');

    await client.query('BEGIN');

    // PASO 1: Identificar pedidos afectados
    console.log('📋 PASO 1: Identificando pedidos con estatus Pendiente/Aprobado/Parcialmente Surtido...');
    
    const pedidosAfectados = await client.query(`
      SELECT DISTINCT p.pedidoid, p.estatus, p.montototal, p.clienteid
      FROM pedidos p
      WHERE p.estatus IN ('Pendiente', 'Aprobado', 'Parcialmente Surtido', 'Confirmado')
        AND p.fechapedido >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY p.pedidoid DESC
    `);

    console.log(`   ✅ Encontrados ${pedidosAfectados.rows.length} pedidos para revisar\n`);

    let pedidosCorregidos = 0;
    let detallesCorregidos = 0;

    // PASO 2: Procesar cada pedido
    for (const pedido of pedidosAfectados.rows) {
      console.log(`\n🔍 Analizando Pedido #${pedido.pedidoid} (Estatus: ${pedido.estatus})`);

      // Obtener detalles del pedido con stock actual
      const detalles = await client.query(`
        SELECT 
          dp.detalleid,
          dp.varianteid,
          dp.cantidadpaquetes,
          dp.esbackorder,
          dp.cantidadsurtida,
          dp.cantidadbackorder,
          dp.piezastotales,
          dp.precioporpaquete,
          pv.productoid,
          pv.stock AS stock_actual,
          pv.sku,
          p.nombreproducto,
          t.cantidad AS piezas_por_paquete
        FROM detallesdelpedido dp
        INNER JOIN producto_variantes pv ON pv.varianteid = dp.varianteid
        INNER JOIN productos p ON p.productoid = pv.productoid
        LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = dp.tamanoid
        WHERE dp.pedidoid = $1
          AND pv.piezasporpaquete = 1
        ORDER BY dp.detalleid
      `, [pedido.pedidoid]);

      let pedidoNecesitaCorreccion = false;
      let totalBackorderMonto = 0;
      let totalSurtidoMonto = 0;

      for (const detalle of detalles.rows) {
        const stockActual = parseInt(detalle.stock_actual) || 0;
        const piezasPorPaquete = parseInt(detalle.piezas_por_paquete) || 1;
        const cantidadSolicitada = parseInt(detalle.cantidadpaquetes) || 0;
        const piezasSolicitadas = cantidadSolicitada * piezasPorPaquete;
        const precioPorPaquete = parseFloat(detalle.precioporpaquete) || 0;

        // VALIDACIÓN CRÍTICA: Si stock es 0 pero está marcado como surtido
        const esBackorderActual = detalle.esbackorder === true;
        const debeSerBackorder = stockActual === 0 || stockActual < piezasSolicitadas;

        if (!esBackorderActual && debeSerBackorder) {
          console.log(`   ⚠️  DISCREPANCIA DETECTADA:`);
          console.log(`      - Detalle ID: ${detalle.detalleid}`);
          console.log(`      - Producto: ${detalle.nombreproducto} (SKU: ${detalle.sku})`);
          console.log(`      - Stock actual: ${stockActual} piezas`);
          console.log(`      - Piezas solicitadas: ${piezasSolicitadas}`);
          console.log(`      - Estado actual: ${esBackorderActual ? 'BACKORDER' : 'SURTIDO'}`);
          console.log(`      - Estado correcto: BACKORDER`);

          // Calcular cantidades correctas
          const paquetesSurtibles = Math.floor(stockActual / piezasPorPaquete);
          const cantidadSurtida = Math.max(0, Math.min(cantidadSolicitada, paquetesSurtibles));
          const cantidadBackorder = cantidadSolicitada - cantidadSurtida;

          console.log(`      - CORRECCIÓN: ${cantidadSurtida} surtido + ${cantidadBackorder} backorder`);

          // Actualizar el detalle
          await client.query(`
            UPDATE detallesdelpedido
            SET 
              esbackorder = TRUE,
              cantidadsurtida = $1,
              cantidadbackorder = $2
            WHERE detalleid = $3
          `, [cantidadSurtida, cantidadBackorder, detalle.detalleid]);

          detallesCorregidos++;
          pedidoNecesitaCorreccion = true;
        }

        // Calcular montos para actualizar pedido
        const cantidadSurtidaFinal = esBackorderActual ? 0 : (debeSerBackorder ? 0 : cantidadSolicitada);
        const cantidadBackorderFinal = esBackorderActual ? cantidadSolicitada : (debeSerBackorder ? cantidadSolicitada : 0);

        totalSurtidoMonto += cantidadSurtidaFinal * precioPorPaquete;
        totalBackorderMonto += cantidadBackorderFinal * precioPorPaquete;
      }

      // PASO 3: Actualizar campos de monto del pedido
      if (pedidoNecesitaCorreccion) {
        const montoTotal = parseFloat(pedido.montototal) || 0;
        const nuevoMontoSurtido = parseFloat(totalSurtidoMonto.toFixed(2));
        const nuevoMontoBackorder = parseFloat(totalBackorderMonto.toFixed(2));

        console.log(`   📊 Actualizando montos del pedido:`);
        console.log(`      - Monto total: $${montoTotal.toFixed(2)}`);
        console.log(`      - Monto surtido: $${nuevoMontoSurtido.toFixed(2)}`);
        console.log(`      - Monto backorder: $${nuevoMontoBackorder.toFixed(2)}`);

        await client.query(`
          UPDATE pedidos
          SET 
            monto_surtido = $1,
            monto_backorder = $2,
            completamente_surtido = CASE 
              WHEN $2 <= 0.01 THEN TRUE 
              ELSE FALSE 
            END
          WHERE pedidoid = $3
        `, [nuevoMontoSurtido, nuevoMontoBackorder, pedido.pedidoid]);

        pedidosCorregidos++;
        console.log(`   ✅ Pedido #${pedido.pedidoid} corregido exitosamente`);
      } else {
        console.log(`   ✓ Pedido #${pedido.pedidoid} no requiere corrección`);
      }
    }

    await client.query('COMMIT');

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ [COMPLETADO] Script de Saneamiento Finalizado');
    console.log(`   📊 Estadísticas:`);
    console.log(`      - Pedidos revisados: ${pedidosAfectados.rows.length}`);
    console.log(`      - Pedidos corregidos: ${pedidosCorregidos}`);
    console.log(`      - Detalles corregidos: ${detallesCorregidos}`);
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ [ERROR] Error durante el saneamiento:', error);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

// Ejecutar script
if (require.main === module) {
  fixPhantomInventory()
    .then(() => {
      console.log('✅ Script ejecutado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error fatal:', error.message);
      process.exit(1);
    });
}

module.exports = { fixPhantomInventory };
