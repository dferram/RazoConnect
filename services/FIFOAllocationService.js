const db = require("../db");
const SmartStockService = require("./SmartStockService");

/**
 * =====================================================
 * FIFO ALLOCATION SERVICE - GESTIÓN AVANZADA
 * =====================================================
 * 
 * Este servicio maneja casos especiales de la lógica FIFO:
 * - Recálculo cuando se cancelan pedidos
 * - Recálculo cuando se entregan pedidos
 * - Liberación de stock para pedidos siguientes
 * - Validación de consistencia
 */

/**
 * Recalcula la asignación FIFO de pedidos posteriores cuando se libera stock
 * 
 * Casos de uso:
 * 1. Pedido cancelado → libera stock → recalcular pedidos posteriores
 * 2. Pedido entregado → libera stock → recalcular backorders posteriores
 * 3. Stock ajustado manualmente → recalcular todos los pedidos activos
 * 
 * @param {Object} params
 * @param {number} params.varianteId - ID de la variante afectada
 * @param {Date} params.fechaReferencia - Fecha desde la cual recalcular (pedidos posteriores)
 * @param {number} params.tenantId - ID del tenant
 * @param {number} params.adminId - ID del admin (opcional)
 * @param {Object} params.client - Cliente de DB para transacciones
 * @returns {Promise<Object>}
 */
async function recalcularPedidosPosteriores({
  varianteId,
  fechaReferencia,
  tenantId,
  adminId = null,
  client = null
}) {
  const dbClient = client || db;
  
  try {
    console.log(`\n🔄 [FIFO RECALC] Recalculando pedidos posteriores a ${fechaReferencia}`);
    console.log(`   Variante: ${varianteId}, Tenant: ${tenantId}, Admin: ${adminId || 'GLOBAL'}`);
    
    // Obtener todos los pedidos activos POSTERIORES a la fecha de referencia
    const queryParams = [varianteId, fechaReferencia, tenantId];
    
    const pedidosQuery = `
      SELECT DISTINCT
        p.pedidoid,
        p.fechapedido,
        d.detalleid,
        d.cantidadpaquetes,
        d.esbackorder,
        d.cantidadsurtida,
        d.cantidadbackorder,
        d.tamanoid,
        t.cantidad as piezas_por_paquete
      FROM pedidos p
      INNER JOIN detallesdelpedido d ON d.pedidoid = p.pedidoid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = d.tamanoid
      WHERE d.varianteid = $1
        AND p.fechapedido >= $2
        AND p.tenant_id = $3
        AND p.estatus NOT IN ('Cancelado', 'Entregado')
      ORDER BY p.fechapedido ASC
    `;
    
    const { rows: pedidos } = await dbClient.query(pedidosQuery, queryParams);
    
    if (pedidos.length === 0) {
      console.log(`   ℹ️ No hay pedidos posteriores para recalcular`);
      return {
        success: true,
        pedidosRecalculados: 0,
        cambios: []
      };
    }
    
    console.log(`   📊 Encontrados ${pedidos.length} detalles de pedidos para recalcular`);
    
    let pedidosActualizados = 0;
    const cambios = [];
    
    // Recalcular cada pedido usando FIFO
    for (const pedido of pedidos) {
      const piezasPorPaquete = parseInt(pedido.piezas_por_paquete, 10) || 1;
      const cantidadRequerida = parseInt(pedido.cantidadpaquetes, 10);
      
      // Calcular allocation status con FIFO
      const fifoResult = await SmartStockService.calculateAllocationStatus({
        varianteId: varianteId,
        cantidadRequerida: cantidadRequerida,
        orderDate: pedido.fechapedido,
        adminId: adminId,
        tenantId: tenantId,
        pedidoId: pedido.pedidoid,
        piezasPorPaquete: piezasPorPaquete
      });
      
      const nuevoEsBackorder = fifoResult.cantidadSurtible === 0;
      const nuevaCantidadSurtida = fifoResult.cantidadSurtible;
      const nuevaCantidadBackorder = fifoResult.cantidadBackorder;
      
      // Verificar si hay cambios
      const estadoAnterior = {
        esBackorder: pedido.esbackorder,
        cantidadSurtida: parseInt(pedido.cantidadsurtida, 10),
        cantidadBackorder: parseInt(pedido.cantidadbackorder, 10)
      };
      
      const huboCambio = 
        estadoAnterior.esBackorder !== nuevoEsBackorder ||
        estadoAnterior.cantidadSurtida !== nuevaCantidadSurtida ||
        estadoAnterior.cantidadBackorder !== nuevaCantidadBackorder;
      
      if (huboCambio) {
        // Actualizar el detalle
        await dbClient.query(
          `UPDATE detallesdelpedido
           SET esbackorder = $1,
               cantidadsurtida = $2,
               cantidadbackorder = $3
           WHERE detalleid = $4`,
          [nuevoEsBackorder, nuevaCantidadSurtida, nuevaCantidadBackorder, pedido.detalleid]
        );
        
        pedidosActualizados++;
        cambios.push({
          pedidoId: pedido.pedidoid,
          detalleId: pedido.detalleid,
          anterior: estadoAnterior,
          nuevo: {
            esBackorder: nuevoEsBackorder,
            cantidadSurtida: nuevaCantidadSurtida,
            cantidadBackorder: nuevaCantidadBackorder
          }
        });
        
        console.log(`   ✅ Pedido #${pedido.pedidoid} actualizado: ${estadoAnterior.cantidadSurtida}→${nuevaCantidadSurtida} surtido, ${estadoAnterior.cantidadBackorder}→${nuevaCantidadBackorder} backorder`);
      }
    }
    
    console.log(`   ✅ Recálculo completado: ${pedidosActualizados} detalles actualizados`);
    
    return {
      success: true,
      pedidosRecalculados: pedidosActualizados,
      cambios: cambios
    };
    
  } catch (error) {
    console.error('❌ [FIFO RECALC] Error al recalcular pedidos posteriores:', error);
    return {
      success: false,
      pedidosRecalculados: 0,
      cambios: [],
      error: error.message
    };
  }
}

/**
 * Hook para ejecutar después de cancelar un pedido
 * Recalcula los pedidos posteriores que ahora podrían tener stock disponible
 * 
 * @param {Object} params
 * @param {number} params.pedidoId - ID del pedido cancelado
 * @param {number} params.tenantId - ID del tenant
 * @param {Object} params.client - Cliente de DB para transacciones
 */
async function onPedidoCancelado({ pedidoId, tenantId, client }) {
  try {
    console.log(`\n🔄 [FIFO] Hook: Pedido #${pedidoId} cancelado - Recalculando pedidos posteriores`);
    
    // Obtener la fecha del pedido cancelado y sus variantes
    const { rows: pedidoInfo } = await client.query(
      `SELECT 
        p.fechapedido,
        d.varianteid
      FROM pedidos p
      INNER JOIN detallesdelpedido d ON d.pedidoid = p.pedidoid
      WHERE p.pedidoid = $1 AND p.tenant_id = $2`,
      [pedidoId, tenantId]
    );
    
    if (pedidoInfo.length === 0) {
      console.log(`   ⚠️ No se encontró información del pedido ${pedidoId}`);
      return { success: false };
    }
    
    const fechaPedido = pedidoInfo[0].fechapedido;
    const adminId = null;
    
    // Obtener variantes únicas del pedido
    const variantesUnicas = [...new Set(pedidoInfo.map(p => p.varianteid))];
    
    console.log(`   📦 Recalculando ${variantesUnicas.length} variantes afectadas`);
    
    // Recalcular cada variante
    for (const varianteId of variantesUnicas) {
      await recalcularPedidosPosteriores({
        varianteId,
        fechaReferencia: fechaPedido,
        tenantId,
        adminId,
        client
      });
    }
    
    console.log(`   ✅ Recálculo post-cancelación completado`);
    return { success: true };
    
  } catch (error) {
    console.error('❌ [FIFO] Error en hook de cancelación:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Hook para ejecutar después de entregar un pedido
 * Recalcula los backorders posteriores que ahora podrían surtirse
 * 
 * @param {Object} params
 * @param {number} params.pedidoId - ID del pedido entregado
 * @param {number} params.tenantId - ID del tenant
 * @param {Object} params.client - Cliente de DB para transacciones
 */
async function onPedidoEntregado({ pedidoId, tenantId, client }) {
  try {
    console.log(`\n🔄 [FIFO] Hook: Pedido #${pedidoId} entregado - Recalculando backorders posteriores`);
    
    // Obtener la fecha del pedido entregado y sus variantes
    const { rows: pedidoInfo } = await client.query(
      `SELECT 
        p.fechapedido,
        p.admin_responsable_id,
        d.varianteid
      FROM pedidos p
      INNER JOIN detallesdelpedido d ON d.pedidoid = p.pedidoid
      WHERE p.pedidoid = $1 AND p.tenant_id = $2`,
      [pedidoId, tenantId]
    );
    
    if (pedidoInfo.length === 0) {
      console.log(`   ⚠️ No se encontró información del pedido ${pedidoId}`);
      return { success: false };
    }
    
    const fechaPedido = pedidoInfo[0].fechapedido;
    const adminId = pedidoInfo[0].admin_responsable_id;
    
    // Obtener variantes únicas del pedido
    const variantesUnicas = [...new Set(pedidoInfo.map(p => p.varianteid))];
    
    console.log(`   📦 Recalculando ${variantesUnicas.length} variantes afectadas`);
    
    // Recalcular cada variante
    for (const varianteId of variantesUnicas) {
      await recalcularPedidosPosteriores({
        varianteId,
        fechaReferencia: fechaPedido,
        tenantId,
        adminId,
        client
      });
    }
    
    console.log(`   ✅ Recálculo post-entrega completado`);
    return { success: true };
    
  } catch (error) {
    console.error('❌ [FIFO] Error en hook de entrega:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Valida la consistencia de la asignación FIFO
 * Detecta si hay pedidos con asignaciones incorrectas
 * 
 * @param {Object} params
 * @param {number} params.tenantId - ID del tenant
 * @param {number} params.varianteId - ID de variante específica (opcional)
 * @returns {Promise<Object>}
 */
async function validarConsistenciaFIFO({ tenantId, varianteId = null }) {
  try {
    console.log(`\n🔍 [FIFO VALIDATION] Validando consistencia FIFO`);
    
    let varianteFilter = '';
    const queryParams = [tenantId];
    
    if (varianteId) {
      queryParams.push(varianteId);
      varianteFilter = `AND d.varianteid = $${queryParams.length}`;
    }
    
    // Detectar pedidos donde la suma de surtidos excede el stock
    const inconsistenciasQuery = `
      WITH pedidos_activos AS (
        SELECT 
          d.varianteid,
          p.pedidoid,
          p.fechapedido,
          d.cantidadsurtida,
          d.piezastotales,
          pv.sku,
          pr.nombreproducto
        FROM pedidos p
        INNER JOIN detallesdelpedido d ON d.pedidoid = p.pedidoid
        INNER JOIN producto_variantes pv ON pv.varianteid = d.varianteid
        INNER JOIN productos pr ON pr.productoid = pv.productoid
        WHERE p.tenant_id = $1
          AND p.estatus NOT IN ('Cancelado', 'Entregado')
          AND d.esbackorder = false
          ${varianteFilter}
      ),
      stock_actual AS (
        SELECT 
          variante_id,
          SUM(cantidad) as stock_total
        FROM stock_admin
        WHERE tenant_id = $1
        GROUP BY variante_id
      )
      SELECT 
        pa.varianteid,
        pa.sku,
        pa.nombreproducto,
        COALESCE(sa.stock_total, 0) as stock_disponible,
        SUM(pa.cantidadsurtida) as total_surtido,
        COUNT(DISTINCT pa.pedidoid) as num_pedidos,
        ARRAY_AGG(pa.pedidoid ORDER BY pa.fechapedido) as pedidos_ids
      FROM pedidos_activos pa
      LEFT JOIN stock_actual sa ON sa.variante_id = pa.varianteid
      GROUP BY pa.varianteid, pa.sku, pa.nombreproducto, sa.stock_total
      HAVING SUM(pa.cantidadsurtida) > COALESCE(sa.stock_total, 0)
    `;
    
    const { rows: inconsistencias } = await db.query(inconsistenciasQuery, queryParams);
    
    if (inconsistencias.length > 0) {
      console.log(`   ⚠️ Encontradas ${inconsistencias.length} inconsistencias FIFO`);
      
      for (const inc of inconsistencias) {
        console.log(`   ❌ ${inc.nombreproducto} (${inc.sku}): ${inc.total_surtido} surtido > ${inc.stock_disponible} disponible`);
      }
      
      return {
        valido: false,
        inconsistencias: inconsistencias.map(inc => ({
          varianteId: inc.varianteid,
          sku: inc.sku,
          producto: inc.nombreproducto,
          stockDisponible: parseInt(inc.stock_disponible, 10),
          totalSurtido: parseInt(inc.total_surtido, 10),
          exceso: parseInt(inc.total_surtido, 10) - parseInt(inc.stock_disponible, 10),
          numPedidos: parseInt(inc.num_pedidos, 10),
          pedidosIds: inc.pedidos_ids
        }))
      };
    }
    
    console.log(`   ✅ Validación FIFO exitosa - No se encontraron inconsistencias`);
    
    return {
      valido: true,
      inconsistencias: []
    };
    
  } catch (error) {
    console.error('❌ [FIFO VALIDATION] Error al validar consistencia:', error);
    return {
      valido: false,
      inconsistencias: [],
      error: error.message
    };
  }
}

module.exports = {
  recalcularPedidosPosteriores,
  onPedidoCancelado,
  onPedidoEntregado,
  validarConsistenciaFIFO
};
