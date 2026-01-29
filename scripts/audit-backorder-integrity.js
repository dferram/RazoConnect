/**
 * =====================================================
 * SCRIPT DE AUDITORÍA FORENSE DE BACKORDERS
 * =====================================================
 * 
 * Propósito: Detectar pedidos donde los detalles están marcados incorrectamente:
 * - esbackorder = FALSE cuando cantidadbackorder > 0
 * - esbackorder = TRUE cuando cantidadsurtida > 0
 * - Discrepancias entre flags y cantidades
 * 
 * Uso:
 *   node scripts/audit-backorder-integrity.js
 * 
 * =====================================================
 */

const db = require('../db');

async function auditBackorderIntegrity() {
  const client = await db.pool.connect();
  
  try {
    console.log('🔍 [AUDIT] Iniciando auditoría forense de backorders...\n');

    // CASO 1: Detalles marcados como NO backorder pero con cantidadbackorder > 0
    const caso1Query = `
      SELECT 
        dp.detalleid,
        dp.pedidoid,
        p.folio,
        dp.varianteid,
        pv.sku,
        pr.nombreproducto,
        dp.esbackorder,
        dp.cantidadpaquetes,
        dp.cantidadsurtida,
        dp.cantidadbackorder,
        p.estatus,
        p.fechacreacion
      FROM detallesdelpedido dp
      INNER JOIN pedidos p ON p.pedidoid = dp.pedidoid
      INNER JOIN producto_variantes pv ON pv.varianteid = dp.varianteid
      INNER JOIN productos pr ON pr.productoid = pv.productoid
      WHERE dp.esbackorder = FALSE 
        AND dp.cantidadbackorder > 0
      ORDER BY p.fechacreacion DESC
      LIMIT 50
    `;

    const caso1 = await client.query(caso1Query);
    
    console.log(`🚨 [CASO 1] Detalles marcados como SURTIDO pero con cantidadbackorder > 0: ${caso1.rows.length}\n`);
    
    if (caso1.rows.length > 0) {
      console.log('Primeros 10 casos:\n');
      caso1.rows.slice(0, 10).forEach((row, idx) => {
        console.log(`${idx + 1}. Pedido: ${row.folio} | SKU: ${row.sku}`);
        console.log(`   esBackorder: ${row.esbackorder} | cantidadSurtida: ${row.cantidadsurtida} | cantidadBackorder: ${row.cantidadbackorder}`);
        console.log(`   Producto: ${row.nombreproducto} | Estatus: ${row.estatus}`);
        console.log('');
      });
    }

    // CASO 2: Detalles marcados como backorder pero con cantidadsurtida > 0
    const caso2Query = `
      SELECT 
        dp.detalleid,
        dp.pedidoid,
        p.folio,
        dp.varianteid,
        pv.sku,
        pr.nombreproducto,
        dp.esbackorder,
        dp.cantidadpaquetes,
        dp.cantidadsurtida,
        dp.cantidadbackorder,
        p.estatus,
        p.fechacreacion
      FROM detallesdelpedido dp
      INNER JOIN pedidos p ON p.pedidoid = dp.pedidoid
      INNER JOIN producto_variantes pv ON pv.varianteid = dp.varianteid
      INNER JOIN productos pr ON pr.productoid = pv.productoid
      WHERE dp.esbackorder = TRUE 
        AND dp.cantidadsurtida > 0
      ORDER BY p.fechacreacion DESC
      LIMIT 50
    `;

    const caso2 = await client.query(caso2Query);
    
    console.log(`🚨 [CASO 2] Detalles marcados como BACKORDER pero con cantidadSurtida > 0: ${caso2.rows.length}\n`);
    
    if (caso2.rows.length > 0) {
      console.log('Primeros 10 casos:\n');
      caso2.rows.slice(0, 10).forEach((row, idx) => {
        console.log(`${idx + 1}. Pedido: ${row.folio} | SKU: ${row.sku}`);
        console.log(`   esBackorder: ${row.esbackorder} | cantidadSurtida: ${row.cantidadsurtida} | cantidadBackorder: ${row.cantidadbackorder}`);
        console.log(`   Producto: ${row.nombreproducto} | Estatus: ${row.estatus}`);
        console.log('');
      });
    }

    // CASO 3: Detalles donde cantidadpaquetes != (cantidadsurtida + cantidadbackorder)
    const caso3Query = `
      SELECT 
        dp.detalleid,
        dp.pedidoid,
        p.folio,
        dp.varianteid,
        pv.sku,
        pr.nombreproducto,
        dp.esbackorder,
        dp.cantidadpaquetes,
        dp.cantidadsurtida,
        dp.cantidadbackorder,
        (dp.cantidadsurtida + dp.cantidadbackorder) AS suma_calculada,
        (dp.cantidadpaquetes - (dp.cantidadsurtida + dp.cantidadbackorder)) AS diferencia,
        p.estatus,
        p.fechacreacion
      FROM detallesdelpedido dp
      INNER JOIN pedidos p ON p.pedidoid = dp.pedidoid
      INNER JOIN producto_variantes pv ON pv.varianteid = dp.varianteid
      INNER JOIN productos pr ON pr.productoid = pv.productoid
      WHERE dp.cantidadpaquetes != (dp.cantidadsurtida + dp.cantidadbackorder)
      ORDER BY ABS(dp.cantidadpaquetes - (dp.cantidadsurtida + dp.cantidadbackorder)) DESC
      LIMIT 50
    `;

    const caso3 = await client.query(caso3Query);
    
    console.log(`🚨 [CASO 3] Detalles con discrepancia matemática (cantidadPaquetes != surtida + backorder): ${caso3.rows.length}\n`);
    
    if (caso3.rows.length > 0) {
      console.log('Primeros 10 casos:\n');
      caso3.rows.slice(0, 10).forEach((row, idx) => {
        console.log(`${idx + 1}. Pedido: ${row.folio} | SKU: ${row.sku}`);
        console.log(`   cantidadPaquetes: ${row.cantidadpaquetes} | Surtida: ${row.cantidadsurtida} | Backorder: ${row.cantidadbackorder}`);
        console.log(`   Suma calculada: ${row.suma_calculada} | Diferencia: ${row.diferencia}`);
        console.log(`   Producto: ${row.nombreproducto} | Estatus: ${row.estatus}`);
        console.log('');
      });
    }

    // CASO 4: Pedidos con todos los detalles en backorder pero marcados como "Surtido"
    const caso4Query = `
      SELECT 
        p.pedidoid,
        p.folio,
        p.estatus,
        p.completamente_surtido,
        COUNT(dp.detalleid) AS total_detalles,
        SUM(CASE WHEN dp.esbackorder = TRUE THEN 1 ELSE 0 END) AS detalles_backorder,
        SUM(dp.cantidadsurtida) AS total_surtido,
        SUM(dp.cantidadbackorder) AS total_backorder,
        p.fechacreacion
      FROM pedidos p
      INNER JOIN detallesdelpedido dp ON dp.pedidoid = p.pedidoid
      GROUP BY p.pedidoid, p.folio, p.estatus, p.completamente_surtido, p.fechacreacion
      HAVING SUM(dp.cantidadsurtida) = 0 
        AND SUM(dp.cantidadbackorder) > 0
        AND p.completamente_surtido = TRUE
      ORDER BY p.fechacreacion DESC
      LIMIT 50
    `;

    const caso4 = await client.query(caso4Query);
    
    console.log(`🚨 [CASO 4] Pedidos TODO backorder pero marcados como completamente_surtido = TRUE: ${caso4.rows.length}\n`);
    
    if (caso4.rows.length > 0) {
      console.log('Primeros 10 casos:\n');
      caso4.rows.slice(0, 10).forEach((row, idx) => {
        console.log(`${idx + 1}. Pedido: ${row.folio} | Estatus: ${row.estatus}`);
        console.log(`   completamente_surtido: ${row.completamente_surtido} | Total detalles: ${row.total_detalles}`);
        console.log(`   Detalles backorder: ${row.detalles_backorder} | Total surtido: ${row.total_surtido} | Total backorder: ${row.total_backorder}`);
        console.log('');
      });
    }

    // RESUMEN GENERAL
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 [RESUMEN] Auditoría de Integridad de Backorders\n');
    console.log(`   Caso 1 (esBackorder=FALSE pero cantidadBackorder>0): ${caso1.rows.length}`);
    console.log(`   Caso 2 (esBackorder=TRUE pero cantidadSurtida>0): ${caso2.rows.length}`);
    console.log(`   Caso 3 (Discrepancia matemática): ${caso3.rows.length}`);
    console.log(`   Caso 4 (Pedidos TODO backorder marcados como surtidos): ${caso4.rows.length}\n`);

    const totalProblemas = caso1.rows.length + caso2.rows.length + caso3.rows.length + caso4.rows.length;

    if (totalProblemas === 0) {
      console.log('✅ [SUCCESS] No se encontraron problemas de integridad en backorders.\n');
    } else {
      console.log(`⚠️  [WARNING] Se encontraron ${totalProblemas} problemas de integridad.\n`);
      console.log('📝 [NEXT STEPS]:');
      console.log('   1. Revisar los casos listados arriba');
      console.log('   2. Determinar si son datos históricos o un bug activo');
      console.log('   3. Si el bug está activo, revisar pedidosController.js líneas 1010-1135');
      console.log('   4. Considerar crear script de corrección para datos históricos\n');
    }

    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ [ERROR] Error durante la auditoría:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Ejecutar el script
if (require.main === module) {
  auditBackorderIntegrity()
    .then(() => {
      console.log('✅ Script finalizado.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script falló:', error);
      process.exit(1);
    });
}

module.exports = { auditBackorderIntegrity };
