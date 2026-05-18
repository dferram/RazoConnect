/**
 * Lógica centralizada para calcular estado de pedidos
 * Basado en estructura de 6 estados + 2 excepciones
 * @module utils/pedidoStatus
 * @date 2026-04-04
 * 
 * REFACTORIZADO: Ahora delega la lógica de negocio al OrderStateEngine (SRP)
 */

const { 
  ESTADOS_PEDIDO, 
  ESTADOS_PRINCIPALES,
  normalizarEstado 
} = require('./pedidoEstados');
const OrderStateEngine = require('../services/OrderStateEngine');

/**
 * Calcula el estado correcto de un pedido basado en:
 * 1. Estado de productos (estado_producto) - Marca de finanzas
 * 2. Estado de disponibilidad (esbackorder) - Stock disponible
 *
 * REFACTORIZADO: Ahora usa OrderStateEngine para la lógica de negocio pura.
 * Este método solo se encarga de:
 * - Obtener datos de la BD
 * - Transformar datos al formato esperado por OrderStateEngine
 * - Delegar cálculo de estado al motor puro
 * - Actualizar la BD con el resultado
 */
async function calcularEstadoPedidoCorrect(client, pedidoId) {
  try {
    // 🔧 Obtener admin_asignado_id del pedido
    const pedidoResult = await client.query(
      `SELECT admin_asignado_id FROM pedidos WHERE pedidoid = $1`,
      [pedidoId]
    );

    if (pedidoResult.rows.length === 0) {
      console.error(`[ESTADO] Pedido ${pedidoId} no encontrado`);
      return ESTADOS_PEDIDO.BAJO_PEDIDO;
    }

    const adminAsignadoId = pedidoResult.rows[0].admin_asignado_id;

    if (!adminAsignadoId) {
      console.error(`[ESTADO] ⚠️ GRAVE: Pedido ${pedidoId} sin admin_asignado_id.`);
      return ESTADOS_PEDIDO.BAJO_PEDIDO;
    }

    // 1. Obtener detalles CON stock actual en tiempo real
    const detallesResult = await client.query(`
      SELECT
        d.detalleid,
        d.varianteid,
        d.piezastotales,
        d.estado_producto,
        COALESCE(d.cantidadsurtida, 0) as cantidadsurtida,
        COALESCE(SUM(sa.cantidad), 0) as stock_disponible_actual,
        d.esbackorder as esbackorder_original
      FROM detallesdelpedido d
      LEFT JOIN stock_admin sa ON d.varianteid = sa.variante_id
        AND d.tenant_id = sa.tenant_id
        AND sa.admin_id = $2
      LEFT JOIN producto_variantes pv ON d.varianteid = pv.varianteid AND d.tenant_id = pv.tenant_id
      WHERE d.pedidoid = $1
      GROUP BY d.detalleid, d.varianteid, d.piezastotales, d.estado_producto, d.cantidadsurtida, d.esbackorder, d.tenant_id
      ORDER BY d.detalleid
    `, [pedidoId, adminAsignadoId]);

    const detalles = detallesResult.rows;
    if (detalles.length === 0) {
      console.error(`[ESTADO] Pedido ${pedidoId} sin detalles - retornando BAJO_PEDIDO como fallback`);
      return ESTADOS_PEDIDO.BAJO_PEDIDO;
    }

    // 2. Transformar datos al formato esperado por OrderStateEngine
    // Si estado_producto es NULL, evaluarlo dinámicamente basado en stock
    const items = detalles.map(d => {
      let estadoProducto = d.estado_producto;

      // Si el estado es NULL, calcularlo basado en stock disponible
      if (estadoProducto === null) {
        estadoProducto = OrderStateEngine.evaluateProductStockState(
          null,
          d.piezastotales,
          d.stock_disponible_actual
        );
      }

      return {
        estado_producto: estadoProducto,
        piezastotales: d.piezastotales
      };
    });

    // 3. ✨ DELEGAR al OrderStateEngine (lógica de negocio pura)
    const nuevoEstado = OrderStateEngine.calculateOrderState(items);

    // 4. Mapear el resultado del OrderStateEngine a los estados legacy
    return mapearEstadoEngineALegacy(nuevoEstado);

  } catch (error) {
    console.error('❌ Error calculating order state:', error.message, { pedidoId });
    return ESTADOS_PEDIDO.BAJO_PEDIDO;
  }
}

/**
 * Mapea los estados del OrderStateEngine a los estados legacy de ESTADOS_PEDIDO
 * 
 * @param {string} estadoEngine - Estado retornado por OrderStateEngine
 * @returns {string} Estado legacy compatible con ESTADOS_PEDIDO
 */
function mapearEstadoEngineALegacy(estadoEngine) {
  const mapeo = {
    'Bajo pedido': ESTADOS_PEDIDO.BAJO_PEDIDO,
    'Completo': ESTADOS_PEDIDO.COMPLETO,
    'Combinado': ESTADOS_PEDIDO.COMBINADO,
    'Listo para remisionar': ESTADOS_PEDIDO.LISTO_PARA_REMISIONAR,
    'Surtido completo': ESTADOS_PEDIDO.SURTIDO_COMPLETO
  };

  return mapeo[estadoEngine] || ESTADOS_PEDIDO.BAJO_PEDIDO;
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
 * 5. Si AL MENOS 1 surtido (pero no todos) → COMBINADO
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
    
    // BUG FIX: Convertir correctamente strings "true"/"false" a booleano
    let esBackorder = detalle.esbackorder || detalle.es_backorder || detalle.esBackorder;
    if (typeof esBackorder === 'string') {
      esBackorder = esBackorder.toLowerCase() === 'true';
    } else {
      esBackorder = Boolean(esBackorder);
    }

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
  
  // 1. SURTIDO COMPLETO: Todos fueron surtidos COMPLETAMENTE
  if (todosCompletosSurtidos && itemsConSurtida === total) {
    return ESTADOS_PEDIDO.SURTIDO_COMPLETO;
  }

  // 2. PARCIALMENTE SURTIDO: Al menos alguno tiene surtida (pero no TODOS están completamente surtidos)
  // Esto incluye:
  // - Algunos items completamente surtidos y otros no
  // - Todos los items tienen surtida parcial
  // - Mix de ambos
  // → Mapeado a COMBINADO
  if (itemsConSurtida > 0 && !todosCompletosSurtidos) {
    return ESTADOS_PEDIDO.COMBINADO;
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
 * Usa calcularEstadoPedidoCorrect que verifica stock ACTUAL en BD
 */
async function recalcularEstadoPedido(client, pedidoId, tenantId) {
  try {
    // Calcular estado usando lógica que consulta stock en tiempo real
    const nuevoEstado = await calcularEstadoPedidoCorrect(client, pedidoId);
    
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
