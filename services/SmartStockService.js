const db = require("../db");

/**
 * =====================================================
 * SMART STOCK SERVICE - Inventario Distribuido por Admin
 * =====================================================
 * 
 * Este servicio encapsula la lógica de lectura/escritura de inventario
 * según el rol del usuario:
 * 
 * - SUPER ADMIN: Ve y modifica stock global (producto_variantes.cantidad)
 * - ADMIN: Ve y modifica solo su stock (stock_admin)
 * - AGENTE: Ve stock de su admin responsable (solo lectura)
 * - CLIENTE: Ve stock del admin asignado (solo lectura)
 * 
 * TRANSPARENCIA: Los controladores llaman a este servicio sin cambiar
 * la estructura JSON de respuesta. El frontend NO necesita cambios.
 */

/**
 * Determina el tipo de usuario y su admin_id responsable
 * @param {Object} params
 * @param {number} params.userId - ID del usuario actual
 * @param {string|string[]} params.userRole - Rol(es) del usuario
 * @param {number} params.tenantId - ID del tenant
 * @returns {Promise<Object>} { isSuperAdmin, isAdmin, adminId, clienteAdminId }
 */
async function determineUserContext({ userId, userRole, tenantId }) {
  const roles = Array.isArray(userRole) ? userRole : [userRole];
  
  const isSuperAdmin = roles.some(r => 
    r === 'superadmin' || 
    r === 'super-admin' || 
    r === 'developer'
  );
  
  const isAdmin = roles.includes('admin');
  const isAgente = roles.includes('agente');
  const isCliente = roles.includes('cliente');

  let adminId = null;
  let clienteAdminId = null;

  // CASO 1: Super Admin - No necesita admin_id (ve todo)
  if (isSuperAdmin) {
    return { 
      isSuperAdmin: true, 
      isAdmin: false, 
      isAgente: false,
      isCliente: false,
      adminId: null, 
      clienteAdminId: null 
    };
  }

  // CASO 2: Admin regular - Su propio ID es el admin_id
  if (isAdmin) {
    adminId = userId;
    return { 
      isSuperAdmin: false, 
      isAdmin: true, 
      isAgente: false,
      isCliente: false,
      adminId, 
      clienteAdminId: null 
    };
  }

  // CASO 3: Agente - Buscar su admin responsable
  if (isAgente) {
    try {
      const { rows } = await db.query(
        `SELECT admin_responsable_id 
         FROM agentesdeventas 
         WHERE agenteid = $1 AND tenant_id = $2 AND activo = true`,
        [userId, tenantId]
      );
      
      if (rows.length > 0 && rows[0].admin_responsable_id) {
        adminId = rows[0].admin_responsable_id;
      }
    } catch (error) {
      console.error('[SmartStockService] Error al obtener admin del agente:', error);
    }

    return { 
      isSuperAdmin: false, 
      isAdmin: false, 
      isAgente: true,
      isCliente: false,
      adminId, 
      clienteAdminId: null 
    };
  }

  // CASO 4: Cliente - Buscar su admin asignado
  if (isCliente) {
    try {
      const { rows } = await db.query(
        `SELECT admin_id 
         FROM clientes 
         WHERE clienteid = $1 AND tenant_id = $2`,
        [userId, tenantId]
      );
      
      if (rows.length > 0 && rows[0].admin_id) {
        clienteAdminId = rows[0].admin_id;
        adminId = clienteAdminId;
      }
    } catch (error) {
      console.error('[SmartStockService] Error al obtener admin del cliente:', error);
    }

    return { 
      isSuperAdmin: false, 
      isAdmin: false, 
      isAgente: false,
      isCliente: true,
      adminId, 
      clienteAdminId 
    };
  }

  // CASO DEFAULT: Usuario sin rol reconocido
  return { 
    isSuperAdmin: false, 
    isAdmin: false, 
    isAgente: false,
    isCliente: false,
    adminId: null, 
    clienteAdminId: null 
  };
}

/**
 * Obtiene el stock de una variante según el contexto del usuario
 * @param {Object} params
 * @param {number} params.varianteId - ID de la variante
 * @param {number} params.userId - ID del usuario actual
 * @param {string|string[]} params.userRole - Rol(es) del usuario
 * @param {number} params.tenantId - ID del tenant
 * @returns {Promise<number>} Cantidad de stock disponible
 */
async function getStock({ varianteId, userId, userRole, tenantId }) {
  if (!varianteId || !userId || !tenantId) {
    console.error('[SmartStockService] getStock: Parámetros inválidos', { varianteId, userId, tenantId });
    return 0;
  }

  const context = await determineUserContext({ userId, userRole, tenantId });

  // CASO A: Super Admin - Lee stock global
  if (context.isSuperAdmin) {
    try {
      const { rows } = await db.query(
        `SELECT COALESCE(stock, 0) as stock 
         FROM producto_variantes 
         WHERE varianteid = $1`,
        [varianteId]
      );
      
      const stock = rows.length > 0 ? parseInt(rows[0].stock, 10) : 0;
      console.log(`✅ [SmartStock] Super Admin - Variante ${varianteId}: ${stock} unidades (GLOBAL)`);
      return stock;
    } catch (error) {
      console.error('[SmartStockService] Error al leer stock global:', error);
      return 0;
    }
  }

  // CASO B: Admin/Agente/Cliente con admin asignado - Lee stock del admin
  if (context.adminId) {
    try {
      const { rows } = await db.query(
        `SELECT COALESCE(cantidad, 0) as stock 
         FROM stock_admin 
         WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3`,
        [varianteId, context.adminId, tenantId]
      );
      
      const stock = rows.length > 0 ? parseInt(rows[0].stock, 10) : 0;
      console.log(`✅ [SmartStock] Admin ${context.adminId} - Variante ${varianteId}: ${stock} unidades (LOCAL)`);
      return stock;
    } catch (error) {
      console.error('[SmartStockService] Error al leer stock de admin:', error);
      return 0;
    }
  }

  // CASO C: Cliente sin admin asignado (huérfano) - Fallback configurable
  if (context.isCliente && !context.adminId) {
    console.warn(`⚠️ [SmartStock] Cliente ${userId} sin admin asignado - Retornando 0`);
    // OPCIÓN 1: Retornar 0 (seguro, no puede comprar)
    return 0;
    
    // OPCIÓN 2: Retornar stock global (descomentar si se prefiere)
    // try {
    //   const { rows } = await db.query(
    //     `SELECT COALESCE(cantidad, 0) as stock 
    //      FROM producto_variantes 
    //      WHERE id = $1`,
    //     [varianteId]
    //   );
    //   return rows.length > 0 ? parseInt(rows[0].stock, 10) : 0;
    // } catch (error) {
    //   console.error('[SmartStockService] Error al leer stock global para cliente huérfano:', error);
    //   return 0;
    // }
  }

  // CASO DEFAULT: Sin contexto válido
  console.warn(`⚠️ [SmartStock] Usuario ${userId} sin contexto válido - Retornando 0`);
  return 0;
}

/**
 * Obtiene el stock de múltiples variantes en una sola consulta (optimizado)
 * @param {Object} params
 * @param {number[]} params.varianteIds - Array de IDs de variantes
 * @param {number} params.userId - ID del usuario actual
 * @param {string|string[]} params.userRole - Rol(es) del usuario
 * @param {number} params.tenantId - ID del tenant
 * @returns {Promise<Map<number, number>>} Map de varianteId -> stock
 */
async function getBulkStock({ varianteIds, userId, userRole, tenantId }) {
  if (!varianteIds || varianteIds.length === 0) {
    return new Map();
  }

  const context = await determineUserContext({ userId, userRole, tenantId });
  const stockMap = new Map();

  // CASO A: Super Admin - Lee stock global
  if (context.isSuperAdmin) {
    try {
      const { rows } = await db.query(
        `SELECT varianteid, COALESCE(stock, 0) as stock 
         FROM producto_variantes 
         WHERE varianteid = ANY($1::int[])`,
        [varianteIds]
      );
      
      rows.forEach(row => {
        stockMap.set(parseInt(row.varianteid, 10), parseInt(row.stock, 10));
      });
      
      console.log(`✅ [SmartStock] Super Admin - Bulk: ${rows.length} variantes (GLOBAL)`);
      return stockMap;
    } catch (error) {
      console.error('[SmartStockService] Error al leer stock global bulk:', error);
      return stockMap;
    }
  }

  // CASO B: Admin/Agente/Cliente con admin asignado - Lee stock del admin
  if (context.adminId) {
    try {
      const { rows } = await db.query(
        `SELECT variante_id, COALESCE(cantidad, 0) as stock 
         FROM stock_admin 
         WHERE variante_id = ANY($1::int[]) AND admin_id = $2 AND tenant_id = $3`,
        [varianteIds, context.adminId, tenantId]
      );
      
      rows.forEach(row => {
        stockMap.set(parseInt(row.variante_id, 10), parseInt(row.stock, 10));
      });
      
      // Rellenar con 0 las variantes que no tienen registro en stock_admin
      varianteIds.forEach(id => {
        if (!stockMap.has(id)) {
          stockMap.set(id, 0);
        }
      });
      
      console.log(`✅ [SmartStock] Admin ${context.adminId} - Bulk: ${rows.length} variantes (LOCAL)`);
      return stockMap;
    } catch (error) {
      console.error('[SmartStockService] Error al leer stock de admin bulk:', error);
      return stockMap;
    }
  }

  // CASO C: Sin contexto válido - Retornar 0 para todas
  varianteIds.forEach(id => stockMap.set(id, 0));
  return stockMap;
}

/**
 * Ajusta el stock de una variante (incremento o decremento)
 * @param {Object} params
 * @param {number} params.varianteId - ID de la variante
 * @param {number} params.cantidad - Cantidad a ajustar (positivo = incremento, negativo = decremento)
 * @param {number} params.userId - ID del usuario que realiza el ajuste
 * @param {string|string[]} params.userRole - Rol(es) del usuario
 * @param {number} params.tenantId - ID del tenant
 * @param {string} params.motivo - Motivo del ajuste (para auditoría)
 * @param {Object} params.client - Cliente de DB (opcional, para transacciones)
 * @returns {Promise<Object>} { success, newStock, message }
 */
async function adjustStock({ 
  varianteId, 
  cantidad, 
  userId, 
  userRole, 
  tenantId, 
  motivo = 'Ajuste manual',
  client = null 
}) {
  if (!varianteId || !userId || !tenantId || cantidad === 0) {
    return { 
      success: false, 
      newStock: 0, 
      message: 'Parámetros inválidos para ajuste de stock' 
    };
  }

  const dbClient = client || db;
  const context = await determineUserContext({ userId, userRole, tenantId });

  // CASO A: Super Admin - Modifica stock global
  if (context.isSuperAdmin) {
    try {
      const { rows } = await dbClient.query(
        `UPDATE producto_variantes 
         SET stock = GREATEST(stock + $1, 0)
         WHERE varianteid = $2
         RETURNING stock`,
        [cantidad, varianteId]
      );

      if (rows.length === 0) {
        return { 
          success: false, 
          newStock: 0, 
          message: 'Variante no encontrada' 
        };
      }

      const newStock = parseInt(rows[0].stock, 10);
      console.log(`✅ [SmartStock] Super Admin ajustó variante ${varianteId}: ${cantidad > 0 ? '+' : ''}${cantidad} → ${newStock} (GLOBAL)`);
      
      return { 
        success: true, 
        newStock, 
        message: `Stock global actualizado: ${newStock} unidades` 
      };
    } catch (error) {
      console.error('[SmartStockService] Error al ajustar stock global:', error);
      return { 
        success: false, 
        newStock: 0, 
        message: 'Error al actualizar stock global' 
      };
    }
  }

  // CASO B: Admin regular - Modifica su stock local
  if (context.isAdmin && context.adminId) {
    try {
      // Verificar si existe registro en stock_admin
      const { rows: existingRows } = await dbClient.query(
        `SELECT cantidad FROM stock_admin 
         WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3`,
        [varianteId, context.adminId, tenantId]
      );

      let newStock = 0;

      if (existingRows.length > 0) {
        // UPDATE existente
        const { rows } = await dbClient.query(
          `UPDATE stock_admin 
           SET cantidad = GREATEST(cantidad + $1, 0)
           WHERE variante_id = $2 AND admin_id = $3 AND tenant_id = $4
           RETURNING cantidad`,
          [cantidad, varianteId, context.adminId, tenantId]
        );
        newStock = parseInt(rows[0].cantidad, 10);
      } else {
        // INSERT nuevo registro (solo si es incremento)
        if (cantidad > 0) {
          const { rows } = await dbClient.query(
            `INSERT INTO stock_admin (admin_id, variante_id, tenant_id, cantidad)
             VALUES ($1, $2, $3, $4)
             RETURNING cantidad`,
            [context.adminId, varianteId, tenantId, cantidad]
          );
          newStock = parseInt(rows[0].cantidad, 10);
        } else {
          // No se puede decrementar si no existe registro
          return { 
            success: false, 
            newStock: 0, 
            message: 'No hay stock disponible para decrementar' 
          };
        }
      }

      console.log(`✅ [SmartStock] Admin ${context.adminId} ajustó variante ${varianteId}: ${cantidad > 0 ? '+' : ''}${cantidad} → ${newStock} (LOCAL)`);
      
      return { 
        success: true, 
        newStock, 
        message: `Stock local actualizado: ${newStock} unidades` 
      };
    } catch (error) {
      console.error('[SmartStockService] Error al ajustar stock de admin:', error);
      return { 
        success: false, 
        newStock: 0, 
        message: 'Error al actualizar stock local' 
      };
    }
  }

  // CASO C: Agente o Cliente - NO pueden modificar stock
  return { 
    success: false, 
    newStock: 0, 
    message: 'No tienes permisos para modificar el inventario' 
  };
}

/**
 * Valida si hay stock suficiente para una operación
 * @param {Object} params
 * @param {number} params.varianteId - ID de la variante
 * @param {number} params.cantidadRequerida - Cantidad que se necesita
 * @param {number} params.userId - ID del usuario actual
 * @param {string|string[]} params.userRole - Rol(es) del usuario
 * @param {number} params.tenantId - ID del tenant
 * @returns {Promise<Object>} { disponible, stockActual, faltante }
 */
async function validateStock({ varianteId, cantidadRequerida, userId, userRole, tenantId }) {
  const stockActual = await getStock({ varianteId, userId, userRole, tenantId });
  const disponible = stockActual >= cantidadRequerida;
  const faltante = disponible ? 0 : cantidadRequerida - stockActual;

  return { disponible, stockActual, faltante };
}

/**
 * Obtiene el stock global total de una variante (suma de todos los admins)
 * Solo para Super Admin o reportes de auditoría
 * @param {number} varianteId - ID de la variante
 * @param {number} tenantId - ID del tenant
 * @returns {Promise<Object>} { stockGlobal, stockPorAdmin[] }
 */
async function getGlobalStockBreakdown(varianteId, tenantId) {
  try {
    // Stock global de producto_variantes
    const { rows: globalRows } = await db.query(
      `SELECT COALESCE(stock, 0) as stock_global 
       FROM producto_variantes 
       WHERE varianteid = $1`,
      [varianteId]
    );

    const stockGlobal = globalRows.length > 0 ? parseInt(globalRows[0].stock_global, 10) : 0;

    // Stock distribuido por admin
    const { rows: adminRows } = await db.query(
      `SELECT 
         sa.admin_id,
         sa.cantidad,
         COALESCE(a.nombre || ' ' || a.apellido, 'Admin ID ' || sa.admin_id) as admin_nombre
       FROM stock_admin sa
       LEFT JOIN administradores a ON a.adminid = sa.admin_id
       WHERE sa.variante_id = $1 AND sa.tenant_id = $2
       ORDER BY sa.cantidad DESC`,
      [varianteId, tenantId]
    );

    const stockPorAdmin = adminRows.map(row => ({
      adminId: parseInt(row.admin_id, 10),
      adminNombre: row.admin_nombre,
      cantidad: parseInt(row.cantidad, 10)
    }));

    const stockDistribuido = stockPorAdmin.reduce((sum, item) => sum + item.cantidad, 0);

    return {
      stockGlobal,
      stockDistribuido,
      diferencia: stockGlobal - stockDistribuido,
      stockPorAdmin
    };
  } catch (error) {
    console.error('[SmartStockService] Error al obtener breakdown de stock:', error);
    return {
      stockGlobal: 0,
      stockDistribuido: 0,
      diferencia: 0,
      stockPorAdmin: []
    };
  }
}

/**
 * FIFO ALLOCATION LOGIC - Calcula el estatus de surtido basado en la antigüedad del pedido
 * 
 * Este método implementa una cola FIFO (First In, First Out) para asignar stock físico
 * a pedidos de manera cronológica, evitando race conditions donde múltiples pedidos
 * reclaman el mismo inventario.
 * 
 * @param {Object} params
 * @param {number} params.varianteId - ID de la variante de producto
 * @param {number} params.cantidadRequerida - Cantidad de paquetes solicitados en este pedido
 * @param {Date|string} params.orderDate - Fecha de creación del pedido (para determinar prioridad)
 * @param {number} params.adminId - ID del admin responsable del inventario
 * @param {number} params.tenantId - ID del tenant
 * @param {number} params.pedidoId - ID del pedido actual (opcional, para excluirlo de cálculos)
 * @param {number} params.piezasPorPaquete - Piezas por paquete (para convertir a unidades físicas)
 * @returns {Promise<Object>} { 
 *   estatus: 'surtido'|'parcial'|'backorder',
 *   stockDisponible: number,
 *   cantidadSurtible: number,
 *   cantidadBackorder: number,
 *   deudaPrevia: number,
 *   stockFisico: number
 * }
 */
async function calculateAllocationStatus({
  varianteId,
  cantidadRequerida,
  orderDate,
  adminId,
  tenantId,
  pedidoId = null,
  piezasPorPaquete = 1
}) {
  try {
    // VALIDACIÓN DE PARÁMETROS
    if (!varianteId || !tenantId || !orderDate) {
      console.error('[FIFO] Parámetros inválidos:', { varianteId, tenantId, orderDate });
      return {
        estatus: 'backorder',
        stockDisponible: 0,
        cantidadSurtible: 0,
        cantidadBackorder: cantidadRequerida || 0,
        deudaPrevia: 0,
        stockFisico: 0
      };
    }

    const cantidadReq = parseInt(cantidadRequerida, 10) || 0;
    const piezasPorPaq = parseInt(piezasPorPaquete, 10) || 1;

    // PASO 1: OBTENER STOCK FÍSICO
    // Determinar si usamos stock global (super admin) o stock local (admin específico)
    let stockFisico = 0;
    
    if (adminId) {
      // Stock local del admin
      const { rows: stockRows } = await db.query(
        `SELECT COALESCE(cantidad, 0) as stock 
         FROM stock_admin 
         WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3`,
        [varianteId, adminId, tenantId]
      );
      stockFisico = stockRows.length > 0 ? parseInt(stockRows[0].stock, 10) : 0;
    } else {
      // Stock global (para super admin o casos sin admin específico)
      const { rows: stockRows } = await db.query(
        `SELECT COALESCE(stock, 0) as stock 
         FROM producto_variantes 
         WHERE varianteid = $1`,
        [varianteId]
      );
      stockFisico = stockRows.length > 0 ? parseInt(stockRows[0].stock, 10) : 0;
    }

    console.log(`🔍 [FIFO] Variante ${varianteId} - Stock físico: ${stockFisico} piezas`);

    // PASO 2: OBTENER "DEUDA" DE PEDIDOS ANTERIORES
    // Consultar todos los pedidos activos MÁS ANTIGUOS que el actual
    // que solicitaron esta misma variante
    const queryParams = [varianteId, orderDate, tenantId];
    let adminFilter = '';
    
    if (adminId) {
      queryParams.push(adminId);
      adminFilter = `AND p.admin_responsable_id = $${queryParams.length}`;
    }

    // Excluir el pedido actual si se proporciona su ID
    let excludeCurrentOrder = '';
    if (pedidoId) {
      queryParams.push(pedidoId);
      excludeCurrentOrder = `AND p.pedidoid != $${queryParams.length}`;
    }

    const deudaQuery = `
      SELECT 
        COALESCE(SUM(d.cantidadpaquetes), 0) as total_paquetes_anteriores,
        COALESCE(SUM(d.piezastotales), 0) as total_piezas_anteriores,
        COUNT(DISTINCT p.pedidoid) as num_pedidos_anteriores
      FROM detallesdelpedido d
      INNER JOIN pedidos p ON p.pedidoid = d.pedidoid
      WHERE d.varianteid = $1
        AND p.fechapedido < $2
        AND p.tenant_id = $3
        AND p.estatus NOT IN ('Cancelado', 'Entregado')
        AND d.esbackorder = false
        ${adminFilter}
        ${excludeCurrentOrder}
    `;

    const { rows: deudaRows } = await db.query(queryParams.length > 3 ? deudaQuery : deudaQuery, queryParams);
    
    const deudaPreviaEnPiezas = parseInt(deudaRows[0]?.total_piezas_anteriores || 0, 10);
    const numPedidosAnteriores = parseInt(deudaRows[0]?.num_pedidos_anteriores || 0, 10);

    console.log(`📊 [FIFO] Deuda previa: ${deudaPreviaEnPiezas} piezas (${numPedidosAnteriores} pedidos anteriores)`);

    // PASO 3: CÁLCULO FIFO
    // Stock disponible para ESTE pedido = Stock físico - Deuda de pedidos anteriores
    const stockDisponibleParaEstePedido = Math.max(stockFisico - deudaPreviaEnPiezas, 0);
    
    // Convertir a paquetes
    const paquetesDisponibles = Math.floor(stockDisponibleParaEstePedido / piezasPorPaq);
    
    // Determinar cuánto se puede surtir
    const cantidadSurtible = Math.min(cantidadReq, paquetesDisponibles);
    const cantidadBackorder = Math.max(cantidadReq - cantidadSurtible, 0);

    // PASO 4: DETERMINAR ESTATUS
    let estatus;
    if (cantidadSurtible >= cantidadReq) {
      estatus = 'surtido';
    } else if (cantidadSurtible > 0) {
      estatus = 'parcial';
    } else {
      estatus = 'backorder';
    }

    console.log(`✅ [FIFO] Resultado: ${estatus.toUpperCase()} - Surtible: ${cantidadSurtible}/${cantidadReq} paquetes`);

    return {
      estatus,
      stockDisponible: stockDisponibleParaEstePedido,
      cantidadSurtible,
      cantidadBackorder,
      deudaPrevia: deudaPreviaEnPiezas,
      stockFisico,
      paquetesDisponibles,
      numPedidosAnteriores
    };

  } catch (error) {
    console.error('[FIFO] Error al calcular allocation status:', error);
    return {
      estatus: 'backorder',
      stockDisponible: 0,
      cantidadSurtible: 0,
      cantidadBackorder: cantidadRequerida || 0,
      deudaPrevia: 0,
      stockFisico: 0,
      error: error.message
    };
  }
}

module.exports = {
  determineUserContext,
  getStock,
  getBulkStock,
  adjustStock,
  validateStock,
  getGlobalStockBreakdown,
  calculateAllocationStatus
};
