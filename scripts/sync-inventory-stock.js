/**
 * =====================================================
 * SCRIPT DE SINCRONIZACIÓN FORENSE DE INVENTARIO
 * =====================================================
 * 
 * Propósito: Recorrer TODAS las variantes de productos y sincronizar
 * el campo legacy producto_variantes.stock con la suma real de inventarios_admin.
 * 
 * Uso:
 *   node scripts/sync-inventory-stock.js
 * 
 * Este script debe ejecutarse:
 * 1. Después de aplicar el trigger de sincronización
 * 2. Cuando se detecten discrepancias en reportes
 * 3. Como parte del mantenimiento mensual
 * 
 * =====================================================
 */

const db = require('../db');

async function syncInventoryStock() {
  const client = await db.pool.connect();
  
  try {
    console.log('🔍 [SYNC] Iniciando auditoría forense de inventario...\n');
    
    await client.query('BEGIN');

    // PASO 1: Obtener todas las variantes con discrepancias
    const discrepanciasQuery = `
      SELECT 
        pv.varianteid,
        pv.sku,
        pv.stock AS stock_legacy,
        COALESCE(SUM(ia.cantidad), 0) AS stock_real,
        COALESCE(SUM(ia.cantidad), 0) - pv.stock AS diferencia,
        p.nombreproducto,
        p.productoid
      FROM producto_variantes pv
      INNER JOIN productos p ON p.productoid = pv.productoid
      LEFT JOIN inventarios_admin ia ON ia.variante_id = pv.varianteid
      GROUP BY pv.varianteid, pv.sku, pv.stock, p.nombreproducto, p.productoid
      HAVING COALESCE(SUM(ia.cantidad), 0) != pv.stock
      ORDER BY ABS(COALESCE(SUM(ia.cantidad), 0) - pv.stock) DESC
    `;

    const discrepancias = await client.query(discrepanciasQuery);
    
    console.log(`📊 [AUDIT] Variantes con discrepancias: ${discrepancias.rows.length}\n`);

    if (discrepancias.rows.length === 0) {
      console.log('✅ [SUCCESS] No se encontraron discrepancias. El inventario está sincronizado.\n');
      await client.query('COMMIT');
      return;
    }

    // Mostrar las 10 discrepancias más grandes
    console.log('🚨 [TOP 10] Discrepancias más críticas:\n');
    discrepancias.rows.slice(0, 10).forEach((row, idx) => {
      console.log(`${idx + 1}. SKU: ${row.sku} | Producto: ${row.nombreproducto}`);
      console.log(`   Stock Legacy: ${row.stock_legacy} | Stock Real: ${row.stock_real} | Diferencia: ${row.diferencia}`);
      console.log('');
    });

    // PASO 2: Sincronizar TODAS las variantes
    console.log('🔧 [SYNC] Sincronizando todas las variantes...\n');

    const syncQuery = `
      UPDATE producto_variantes pv
      SET stock = (
        SELECT COALESCE(SUM(ia.cantidad), 0)
        FROM inventarios_admin ia
        WHERE ia.variante_id = pv.varianteid
      )
      WHERE pv.varianteid IN (
        SELECT varianteid FROM producto_variantes
      )
    `;

    const syncResult = await client.query(syncQuery);
    
    console.log(`✅ [SYNC] Variantes actualizadas: ${syncResult.rowCount}\n`);

    // PASO 3: Verificar que ya no hay discrepancias
    const verificacionQuery = `
      SELECT COUNT(*) as total_discrepancias
      FROM producto_variantes pv
      LEFT JOIN (
        SELECT variante_id, SUM(cantidad) as total_stock
        FROM inventarios_admin
        GROUP BY variante_id
      ) ia ON ia.variante_id = pv.varianteid
      WHERE COALESCE(ia.total_stock, 0) != pv.stock
    `;

    const verificacion = await client.query(verificacionQuery);
    const totalDiscrepanciasRestantes = parseInt(verificacion.rows[0].total_discrepancias, 10);

    if (totalDiscrepanciasRestantes > 0) {
      console.log(`⚠️  [WARNING] Aún quedan ${totalDiscrepanciasRestantes} discrepancias. Revisar manualmente.\n`);
    } else {
      console.log('✅ [VERIFIED] Sincronización completa. Todas las variantes están correctas.\n');
    }

    // PASO 4: Generar reporte de productos con stock cero
    const productosStockCeroQuery = `
      SELECT 
        p.productoid,
        p.nombreproducto,
        COUNT(pv.varianteid) as total_variantes,
        SUM(COALESCE(ia.cantidad, 0)) as stock_total
      FROM productos p
      LEFT JOIN producto_variantes pv ON pv.productoid = p.productoid
      LEFT JOIN inventarios_admin ia ON ia.variante_id = pv.varianteid
      GROUP BY p.productoid, p.nombreproducto
      HAVING SUM(COALESCE(ia.cantidad, 0)) = 0
      ORDER BY p.nombreproducto
    `;

    const productosStockCero = await client.query(productosStockCeroQuery);

    console.log(`📦 [REPORT] Productos con stock CERO: ${productosStockCero.rows.length}\n`);
    
    if (productosStockCero.rows.length > 0) {
      console.log('Primeros 20 productos sin stock:\n');
      productosStockCero.rows.slice(0, 20).forEach((row, idx) => {
        console.log(`${idx + 1}. ID: ${row.productoid} | ${row.nombreproducto} | Variantes: ${row.total_variantes}`);
      });
      console.log('');
    }

    await client.query('COMMIT');

    console.log('🎉 [COMPLETE] Sincronización forense completada exitosamente.\n');
    console.log('📝 [NEXT STEPS]:');
    console.log('   1. Verificar que el filtro "Con Stock" en admin-inventario.html funcione correctamente');
    console.log('   2. Revisar productos con stock cero para determinar si deben desactivarse');
    console.log('   3. El trigger automático mantendrá la sincronización de ahora en adelante\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [ERROR] Error durante la sincronización:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Ejecutar el script
if (require.main === module) {
  syncInventoryStock()
    .then(() => {
      console.log('✅ Script finalizado.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script falló:', error);
      process.exit(1);
    });
}

module.exports = { syncInventoryStock };
