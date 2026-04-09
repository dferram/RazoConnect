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
 * - Si AL MENOS 1 facturado/surtido (pero no todos) → COMBINADO 🟠
 * - Si AL MENOS 1 = 'Surtido' (y ninguno Facturado) → LISTO_PARA_REMISIONAR 🔵
 *
 * PRIORIDAD 2: Estados de Disponibilidad (si NO hay productos surtidos/facturados)
 * - Si TODOS sin stock → BAJO_PEDIDO 🔴
 * - Si TODOS con stock → COMPLETO 🟡
 * - Si MIX backorder+stock → COMBINADO 🟠
 */
async function calcularEstadoPedidoCorrect(client, pedidoId) {
  try {
    // 🔧 FIX: Obtener admin_asignado_id del pedido PRIMERO
    const pedidoResult = await client.query(
      `SELECT admin_asignado_id FROM pedidos WHERE pedidoid = $1`,
      [pedidoId]
    );

    if (pedidoResult.rows.length === 0) {
      console.error(`[ESTADO] Pedido ${pedidoId} no encontrado`);
      return ESTADOS_PEDIDO.BAJO_PEDIDO;
    }

    const adminAsignadoId = pedidoResult.rows[0].admin_asignado_id;

    // ⚠️ CRÍTICO: Si admin_asignado_id es NULL, el cliente NO tiene admin asignado
    // Esto es un error administrativo grave - registrar y retornar error
    if (!adminAsignadoId) {
      console.error(`[ESTADO] ⚠️ GRAVE: Pedido ${pedidoId} sin admin_asignado_id. Cliente sin estado/admin válido.`);
      return ESTADOS_PEDIDO.BAJO_PEDIDO;
    }

    // 1. Obtener detalles CON stock actual en tiempo real
    // CRÍTICO: Filtrar stock_admin SOLO del admin asignado al pedido (NO NULL)
    const detallesResult = await client.query(`
      SELECT
        d.detalleid,
        d.varianteid,
        d.piezastotales,
        d.estado_producto,
        COALESCE(d.cantidadsurtida, 0) as cantidadsurtida,
        -- Stock disponible: SOLO del admin asignado al pedido
        COALESCE(SUM(sa.cantidad - sa.cantidad_reservada), 0) as stock_en_admin,
        COALESCE(pv.stock, 0) as stock_global,
        COALESCE(SUM(sa.cantidad - sa.cantidad_reservada), 0) as stock_disponible_actual,
        -- Flag original (para auditoría)
        d.esbackorder as esbackorder_original
      FROM detallesdelpedido d
      LEFT JOIN stock_admin sa ON d.varianteid = sa.variante_id
        AND d.tenant_id = sa.tenant_id
        AND sa.admin_id = $2
      LEFT JOIN producto_variantes pv ON d.varianteid = pv.varianteid AND d.tenant_id = pv.tenant_id
      WHERE d.pedidoid = $1
      GROUP BY d.detalleid, d.varianteid, d.piezastotales, d.estado_producto, d.cantidadsurtida, d.esbackorder, d.tenant_id, pv.stock
      ORDER BY d.detalleid
    `, [pedidoId, adminAsignadoId]);

    const detalles = detallesResult.rows;
    if (detalles.length === 0) {
      // ❌ Crítico: Pedido sin detalles - esto NO debería pasar
      console.error(`[ESTADO] Pedido ${pedidoId} sin detalles - retornando BAJO_PEDIDO como fallback`);
      return ESTADOS_PEDIDO.BAJO_PEDIDO;
    }

    const totalProductos = detalles.length;

    // ============================================================
    // PRIORIDAD TIENDA: Si NO hay productos Facturados
    // En la tienda, calcular SIEMPRE basado en esbackorder ORIGINAL
    // (determinado al momento de crear el pedido)
    // ============================================================
    const productosFacturadosCount = detalles.filter(d => d.estado_producto === 'Facturado').length;

    if (productosFacturadosCount === 0) {
      // 🛍️ TIENDA: Ningún producto facturado aún - usar esbackorder ORIGINAL
      let productosConStock = 0;
      let productosBackorder = 0;

      detalles.forEach(d => {
        // Usar esbackorder_original que fue asignado al crear el pedido
        if (d.esbackorder_original === true || d.esbackorder_original === 'true') {
          productosBackorder++;
        } else {
          productosConStock++;
        }
      });

      // Aplicar lógica de disponibilidad (TIENDA)
      if (productosBackorder === totalProductos && productosConStock === 0) {
        return ESTADOS_PEDIDO.BAJO_PEDIDO; // 🔴 Todos sin stock
      }
      if (productosConStock === totalProductos && productosBackorder === 0) {
        return ESTADOS_PEDIDO.COMPLETO; // 🟡 Todos con stock
      }
      if (productosBackorder > 0 && productosConStock > 0) {
        return ESTADOS_PEDIDO.COMBINADO; // 🟠 Mix de stock/backorder
      }
    }

    // ============================================================
    // PRIORIDAD CERO: Si TODOS tienen estado_producto = NULL
    // Significa que el pedido acaba de crearse y no ha sido procesado por Finanzas
    // En este caso, IGNORAR estado_producto y calcular SOLO basado en stock disponible
    // ============================================================
    const todosEstadoNulo = detalles.every(d => d.estado_producto === null);

    if (todosEstadoNulo) {
      // 🔄 Recién creado - calcular basado SOLO en stock disponible
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

      // Aplicar lógica de disponibilidad
      if (productosBackorderActual === totalProductos && productosConStockActual === 0) {
        return ESTADOS_PEDIDO.BAJO_PEDIDO; // 🔴 Todos sin stock
      }
      if (productosConStockActual === totalProductos && productosBackorderActual === 0) {
        return ESTADOS_PEDIDO.COMPLETO; // 🟡 Todos con stock
      }
      if (productosBackorderActual > 0 && productosConStockActual > 0) {
        return ESTADOS_PEDIDO.COMBINADO; // 🟠 Mix de stock/backorder
      }
    }

    // ============================================================
    // PRIORIDAD 1: Verificar si TODOS están facturados
    // ============================================================
    const productosFacturados = detalles.filter(d => d.estado_producto === 'Facturado').length;

    if (productosFacturados === totalProductos && productosFacturados > 0) {
      return ESTADOS_PEDIDO.SURTIDO_COMPLETO; // 🟢 - Ciclo completado
    }

    // ============================================================
    // PRIORIDAD 2: Si hay productos facturados pero NO todos
    // NUEVO FLUJO: Recalcular estado basado SOLO en NO FACTURADOS
    // ============================================================
    if (productosFacturados > 0 && productosFacturados < totalProductos) {
      // Filtrar solo los productos NO FACTURADOS para recalcular estado
      const productosNoFacturados = detalles.filter(d => d.estado_producto !== 'Facturado');
      const totalNoFacturados = productosNoFacturados.length;

      // Calcular stock disponible SOLO para no facturados
      let conStockActual = 0;
      let backorderActual = 0;

      productosNoFacturados.forEach(d => {
        const tieneStock = d.stock_disponible_actual >= d.piezastotales;
        if (tieneStock) {
          conStockActual++;
        } else {
          backorderActual++;
        }
      });

      // Retornar al estado original según stock de lo NO facturado
      if (backorderActual === totalNoFacturados && conStockActual === 0) {
        return ESTADOS_PEDIDO.BAJO_PEDIDO;      // 🔴 Todos sin stock
      }
      if (conStockActual === totalNoFacturados && backorderActual === 0) {
        return ESTADOS_PEDIDO.COMPLETO;          // 🟡 Todos con stock
      }
      if (backorderActual > 0 && conStockActual > 0) {
        return ESTADOS_PEDIDO.COMBINADO;         // 🟠 Mix de stock/backorder
      }
    }

    // ============================================================
    // PRIORIDAD 3: Hay surtidos pero NINGUNO facturado
    // ⚠️ CRÍTICO: SOLO si estado_producto no es NULL
    // Si es NULL, significa que aún no fue procesado por finanzas
    // ============================================================
    const productosSurtidos = detalles.filter(d =>
      d.estado_producto === 'Surtido' && d.estado_producto !== null
    ).length;

    if (productosSurtidos > 0 && productosFacturados === 0) {
      // ✅ Hay productos marcados como 'Surtido' por finanzas
      return ESTADOS_PEDIDO.LISTO_PARA_REMISIONAR; // 🔵 Waiting finanzas confirmation
    }

    // ============================================================
    // PRIORIDAD 4: Ningún producto surtido/facturado
    // Calcular estado de disponibilidad dinámico
    // ============================================================
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

    // ❌ Crítico: No debería llegar aquí - alguna condición falta
    console.error(`[ESTADO] Pedido ${pedidoId} sin condición coincidente - retornando BAJO_PEDIDO como fallback`, {
      totalProductos,
      productosConStockActual,
      productosBackorderActual,
      productosFacturados
    });
    return ESTADOS_PEDIDO.BAJO_PEDIDO;
  } catch (error) {
    console.error('❌ Error calculating order state:', error.message, { pedidoId });
    // Fallback seguro: BAJO_PEDIDO (conservador - asume sin stock)
    return ESTADOS_PEDIDO.BAJO_PEDIDO;
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
