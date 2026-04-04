/**
 * Lógica centralizada para calcular estado de pedidos
 * Basado en estructura de 6 estados + 2 excepciones
 * @module utils/pedidoStatus
 * @date 2026-04-04
 */

const { 
  ESTADOS_PEDIDO, 
  ESTADOS_PRINCIPALES,
  normalizarEstado 
} = require('./pedidoEstados');

/**
 * Calcula el estado correcto de un pedido basado en:
 * 1. Confirmaciones de remisiones (finanzas, almacén)
 * 2. Disponibilidad de stock de los productos
 * 
 * PRIORIDAD 1: Estados de Surtimiento (basados en remisiones confirmadas)
 * - Si hay remisión confirmada por FINANZAS:
 *   • Si TODAS las remisiones → SURTIDO_COMPLETO
 *   • Si ALGUNAS → SURTIDO_PARCIAL
 * - Si hay remisión confirmada por ALMACÉN pero NO finanzas → LISTO_PARA_REMISIONAR
 * 
 * PRIORIDAD 2: Estados de Disponibilidad (si NO hay remisiones)
 * - Si TODOS backorder → BAJO_PEDIDO
 * - Si TODOS stock → COMPLETO
 * - Si MIX backorder+stock → COMBINADO
 * 
 * @param {Object} params - { client (DB client), pedidoId (number) }
 * @returns {Promise<string>} - Estado normalizado
 */
async function calcularEstadoPedidoCorrect(client, pedidoId) {
  try {
    // 1. Obtener todos los detalles del pedido
    const detallesResult = await client.query(`
      SELECT 
        d.detalleid,
        d.esbackorder,
        d.cantidadpaquetes
      FROM detallesdelpedido d
      WHERE d.pedidoid = $1
    `, [pedidoId]);

    const detalles = detallesResult.rows;

    if (detalles.length === 0) {
      return ESTADOS_PEDIDO.PENDIENTE;
    }

    // 2. Obtener remisiones confirmadas
    const remisionesResult = await client.query(`
      SELECT 
        COUNT(DISTINCT r.remision_id) as total_remisiones,
        COUNT(DISTINCT CASE WHEN r.confirmado_por_almacen IS NOT NULL THEN r.remision_id END) as con_almacen,
        COUNT(DISTINCT CASE WHEN r.confirmado_por_finanzas IS NOT NULL THEN r.remision_id END) as con_finanzas,
        COUNT(DISTINCT CASE WHEN r.confirmado_por_finanzas IS NOT NULL THEN r.remision_id END) as remisiones_finanzas_confirmadas
      FROM remisiones r
      WHERE r.pedido_id = $1
    `, [pedidoId]);

    const remisiones = remisionesResult.rows[0] || {
      total_remisiones: 0,
      con_almacen: 0,
      con_finanzas: 0,
      remisiones_finanzas_confirmadas: 0
    };

    // ============================================================
    // PRIORIDAD 1: Verificar Estados de Surtimiento
    // ============================================================
    
    // Si hay remisiones confirmadas por finanzas
    if (remisiones.con_finanzas > 0) {
      // Si TODAS las remisiones están confirmadas por finanzas
      if (remisiones.con_finanzas === remisiones.total_remisiones) {
        return ESTADOS_PEDIDO.SURTIDO_COMPLETO;
      } else {
        // Si solo ALGUNAS remisiones están confirmadas
        return ESTADOS_PEDIDO.SURTIDO_PARCIAL;
      }
    }

    // Si hay remisiones confirmadas por almacén pero NO por finanzas
    if (remisiones.con_almacen > 0 && remisiones.con_finanzas === 0) {
      return ESTADOS_PEDIDO.LISTO_PARA_REMISIONAR;
    }

    // ============================================================
    // PRIORIDAD 2: Verificar Estados de Disponibilidad
    // (Solo si NO hay remisiones confirmadas)
    // ============================================================
    
    const totalProductos = detalles.length;
    const productosBackorder = detalles.filter(d => d.esbackorder === true).length;
    const productosConStock = detalles.filter(d => d.esbackorder === false).length;

    // Si TODOS los productos son backorder
    if (productosBackorder === totalProductos) {
      return ESTADOS_PEDIDO.BAJO_PEDIDO;
    }

    // Si TODOS los productos tienen stock
    if (productosConStock === totalProductos) {
      return ESTADOS_PEDIDO.COMPLETO;
    }

    // Si hay MIX de backorder y stock
    if (productosBackorder > 0 && productosConStock > 0) {
      return ESTADOS_PEDIDO.COMBINADO;
    }

    // Fallback
    return ESTADOS_PEDIDO.PENDIENTE;
  } catch (error) {
    console.error('Error calculating order state:', error.message);
    return ESTADOS_PEDIDO.PENDIENTE;
  }
}

/**
 * DEPRECATED: Esta función se reemplaza por calcularEstadoPedidoCorrect que usa la BD
 * Calcula el estado correcto de un pedido basado en sus detalles
 * 
 * LÓGICA:
 * 1. Si TODOS backorder → BAJO_PEDIDO
 * 2. Si TODOS stock → COMPLETO  
 * 3. Si MIX backorder+stock → COMBINADO
 * 4. Si TODOS surtidos → SURTIDO_COMPLETO
 * 5. Si AL MENOS 1 surtido → SURTIDO_PARCIAL
 * 6. Default → PENDIENTE
 * 
 * @param {Array} detalles - Array de {cantidadpaquetes, cantidadsurtida, esbackorder}
 * @returns {string} - Estado normalizado
 * @deprecated Use calcularEstadoPedidoCorrect instead
 */
function calcularEstadoPedido(detalles = []) {
  if (!detalles || detalles.length === 0) {
    return ESTADOS_PEDIDO.PENDIENTE;
  }

  const total = detalles.length;
  
  // Contadores
  let itemsBackorder = 0;
  let itemsConStock = 0;
  let itemsConSurtida = 0;
  let todosCompletosSurtidos = true;

  for (const detalle of detalles) {
    // Soportar múltiples variantes de nombres de propiedades (DB, objeto local, etc.)
    const cantidadPaquetes = Number(
      detalle.cantidadpaquetes || 
      detalle.cantidad_pedida || 
      detalle.cantidad || 
      0
    );
    const cantidadSurtida = Number(
      detalle.cantidadsurtida || 
      detalle.cantidad_surtida || 
      detalle.cantidadSurtida || 
      0
    );
    const esBackorder = Boolean(detalle.esbackorder || detalle.es_backorder || detalle.esBackorder);

    // Clasificar item
    if (esBackorder) {
      itemsBackorder++;
    } else {
      itemsConStock++;
    }

    // Contar surtidos
    if (cantidadSurtida > 0) {
      itemsConSurtida++;
    }

    // Verificar si está completamente surtido
    if (cantidadSurtida < cantidadPaquetes) {
      todosCompletosSurtidos = false;
    }
  }

  // ============================================================
  // APLICAR LÓGICA DE ESTADOS - PRIORIDAD CORRECTA
  // ============================================================
  
  // PRIORIDAD 1: Estados de surtimiento (si hay cantidades surtidas, ese es el estado principal)
  // -------------------------------------------------------------------------
  
  // 1. SURTIDO COMPLETO: Todos fueron surtidos
  if (todosCompletosSurtidos && itemsConSurtida === total) {
    return ESTADOS_PEDIDO.SURTIDO_COMPLETO;
  }

  // 2. SURTIDO PARCIAL: Al menos algunos fueron surtidos (pero no todos)
  if (itemsConSurtida > 0 && itemsConSurtida < total) {
    return ESTADOS_PEDIDO.SURTIDO_PARCIAL;
  }

  // PRIORIDAD 2: Estados de disponibilidad (si NO hay surtidos, verificar stock)
  // -------------------------------------------------------------------------
  
  // 3. BAJO PEDIDO: Todos los items son backorder (sin stock disponible)
  if (itemsBackorder === total && itemsConStock === 0) {
    return ESTADOS_PEDIDO.BAJO_PEDIDO;
  }

  // 4. COMPLETO: Todos los items tienen stock disponible (no backorder)
  if (itemsConStock === total && itemsBackorder === 0) {
    return ESTADOS_PEDIDO.COMPLETO;
  }

  // 5. COMBINADO: Mix de backorder y stock disponible
  if (itemsBackorder > 0 && itemsConStock > 0) {
    return ESTADOS_PEDIDO.COMBINADO;
  }

  // 6. Default fallback
  return ESTADOS_PEDIDO.PENDIENTE;
}

/**
 * Obtiene detalles de un pedido de la BD
 */
async function getDetallesPedido(client, pedidoId, tenantId) {
  const result = await client.query(
    `SELECT 
      detalleid,
      cantidadpaquetes,
      COALESCE(cantidadsurtida, 0) as cantidadsurtida,
      COALESCE(esbackorder, false) as esbackorder
    FROM detallesdelpedido
    WHERE pedidoid = $1 AND tenant_id = $2
    ORDER BY detalleid`,
    [pedidoId, tenantId]
  );
  
  return result.rows;
}

/**
 * Actualiza el estado de un pedido en la BD
 */
async function updatePedidoStatus(client, pedidoId, nuevoEstado, tenantId) {
  const estadoNormalizado = normalizarEstado(nuevoEstado);
  
  const result = await client.query(
    `UPDATE pedidos 
     SET estatus = $1
     WHERE pedidoid = $2 AND tenant_id = $3
     RETURNING pedidoid, estatus`,
    [estadoNormalizado, pedidoId, tenantId]
  );
  
  return result.rows[0];
}

/**
 * Recalcula y actualiza el estado de un pedido
 * (Función auxiliar para consistency)
 */
async function recalcularEstadoPedido(client, pedidoId, tenantId) {
  try {
    // Obtener detalles
    const detalles = await getDetallesPedido(client, pedidoId, tenantId);
    
    // Calcular estado
    const nuevoEstado = calcularEstadoPedido(detalles);
    
    // Actualizar
    const resultado = await updatePedidoStatus(client, pedidoId, nuevoEstado, tenantId);
    
    return {
      success: true,
      pedidoId,
      estadoAnterior: null,
      estadoNuevo: nuevoEstado,
      actualizado: resultado
    };
  } catch (error) {
    console.error(`[ERROR] Recalcular estado pedido ${pedidoId}:`, error);
    throw error;
  }
}

module.exports = {
  ESTADOS_PEDIDO,
  calcularEstadoPedido,
  calcularEstadoPedidoCorrect,
  getDetallesPedido,
  updatePedidoStatus,
  recalcularEstadoPedido
};
