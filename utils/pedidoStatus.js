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
 * 1. Estado de productos (estado_producto) - Marca de finanzas
 * 2. Estado de disponibilidad (esbackorder) - Stock disponible
 * 
 * PRIORIDAD 1: Estados de Surtimiento (basados en estado_producto)
 * - Si TODOS los productos = 'Facturado' → SURTIDO_COMPLETO 🟢
 * - Si AL MENOS 1 = 'Facturado' → SURTIDO_PARCIAL 🟠
 * - Si AL MENOS 1 = 'Surtido' (y ninguno Facturado) → LISTO_PARA_REMISIONAR 🔵
 * 
 * PRIORIDAD 2: Estados de Disponibilidad (si NO hay productos surtidos/facturados)
 * - Si TODOS sin stock → BAJO_PEDIDO 🔴
 * - Si TODOS con stock → COMPLETO 🟡
 * - Si MIX backorder+stock → COMBINADO 🟠
 */
async function calcularEstadoPedidoCorrect(client, pedidoId) {
  try {
    // 1. Obtener detalles CON stock actual en tiempo real
    // CRÍTICO: Verificar stock ACTUAL en stock_admin, NO usar esbackorder fijo
    const detallesResult = await client.query(`
      SELECT 
        d.detalleid,
        d.varianteid,
        d.piezastotales,
        d.estado_producto,
        COALESCE(d.cantidadsurtida, 0) as cantidadsurtida,
        -- Stock ACTUAL disponible (sin reservar)
        COALESCE(sa.cantidad - sa.cantidad_reservada, 0) as stock_disponible_actual,
        -- Flag original (para auditoría)
        d.esbackorder as esbackorder_original
      FROM detallesdelpedido d
      LEFT JOIN stock_admin sa ON d.varianteid = sa.variante_id
      WHERE d.pedidoid = $1
      ORDER BY d.detalleid
    `, [pedidoId]);

    const detalles = detallesResult.rows;
    if (detalles.length === 0) {
      return ESTADOS_PEDIDO.PENDIENTE;
    }

    const totalProductos = detalles.length;
    
    // ============================================================
    // PRIORIDAD 1: Estados de Surtimiento (acciones de almacén/finanzas)
    // ============================================================
    // Estos SÍ son fijos y se basan en acciones reales realizadas
    
    const productosFacturados = detalles.filter(d => d.estado_producto === 'Facturado').length;
    const productosSurtidos = detalles.filter(d => d.estado_producto === 'Surtido').length;
    
    if (productosFacturados === totalProductos && productosFacturados > 0) {
      return ESTADOS_PEDIDO.SURTIDO_COMPLETO; // 🟢
    }
    if (productosFacturados > 0 && productosFacturados < totalProductos) {
      return ESTADOS_PEDIDO.SURTIDO_PARCIAL; // 🟠
    }
    if (productosSurtidos > 0 && productosFacturados === 0) {
      return ESTADOS_PEDIDO.LISTO_PARA_REMISIONAR; // 🔵
    }

    // ============================================================
    // PRIORIDAD 2: Estados de Disponibilidad (DINÁMICOS, basados en stock ACTUAL)
    // ============================================================
    // Estos verifican stock disponible en tiempo real, NO el flag fijo
    // Esto permite que un producto que empezó como "Bajo pedido"
    // cambie a "Con stock" si después llega inventario
    
    let productosConStockActual = 0;
    let productosBackorderActual = 0;
    
    detalles.forEach(d => {
      const tieneStockDisponible = d.stock_disponible_actual >= d.piezastotales;
      if (tieneStockDisponible) {
        productosConStockActual++;
      } else {
        productosBackorderActual++;
      }
    });
    
    // 🔴 BAJO PEDIDO: Todos sin stock disponible
    if (productosBackorderActual === totalProductos && productosConStockActual === 0) {
      return ESTADOS_PEDIDO.BAJO_PEDIDO;
    }
    
    // 🟡 COMPLETO: Todos con stock disponible
    if (productosConStockActual === totalProductos && productosBackorderActual === 0) {
      return ESTADOS_PEDIDO.COMPLETO;
    }
    
    // 🟠 COMBINADO: Mix de stock y backorder
    if (productosBackorderActual > 0 && productosConStockActual > 0) {
      return ESTADOS_PEDIDO.COMBINADO;
    }

    return ESTADOS_PEDIDO.PENDIENTE;
  } catch (error) {
    console.error('Error calculating order state:', error.message);
    return ESTADOS_PEDIDO.PENDIENTE;
  }
}}

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
