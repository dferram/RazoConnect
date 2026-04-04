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
    const cantidadPaquetes = Number(detalle.cantidadpaquetes || detalle.cantidad_pedida || 0);
    const cantidadSurtida = Number(detalle.cantidadsurtida || detalle.cantidad_surtida || 0);
    const esBackorder = Boolean(detalle.esbackorder || detalle.es_backorder);

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
  // APLICAR LÓGICA DE ESTADOS
  // ============================================================

  // 1. BAJO PEDIDO: Todos los items son backorder
  if (itemsBackorder === total && itemsConStock === 0) {
    return ESTADOS_PEDIDO.BAJO_PEDIDO;
  }

  // 2. COMPLETO: Todos los items tienen stock (no backorder)
  if (itemsConStock === total && itemsBackorder === 0) {
    return ESTADOS_PEDIDO.COMPLETO;
  }

  // 3. COMBINADO: Mix de backorder y stock
  if (itemsBackorder > 0 && itemsConStock > 0) {
    return ESTADOS_PEDIDO.COMBINADO;
  }

  // 4. SURTIDO COMPLETO: Todos fueron surtidos
  if (todosCompletosSurtidos && itemsConSurtida === total) {
    return ESTADOS_PEDIDO.SURTIDO_COMPLETO;
  }

  // 5. SURTIDO PARCIAL: Al menos algunos fueron surtidos
  if (itemsConSurtida > 0 && itemsConSurtida < total) {
    return ESTADOS_PEDIDO.SURTIDO_PARCIAL;
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
  getDetallesPedido,
  updatePedidoStatus,
  recalcularEstadoPedido
};
