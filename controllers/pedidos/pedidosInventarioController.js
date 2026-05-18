/**
 * PEDIDOS INVENTARIO CONTROLLER
 * 
 * Responsabilidad: Gestión de pedidos para inventarios
 * - Marcar productos como Surtido (Con stock → Surtido)
 * - Marcar productos como Bajo pedido
 * - Validación FIFO de stock
 * 
 * @module controllers/pedidos/pedidosInventarioController
 * @author RazoConnect Team
 * @date 2026-05-12
 */

const db = require('../../db');
const logger = require('../../utils/logger');
const { validarYMarcarProductos } = require('../inventarios/markingController');
const { calcularEstadoPedidoCorrect } = require('../../utils/pedidoStatus');
const SmartStockService = require('../../services/SmartStockService');
// const EstadosPedidoService = require('../../services/EstadosPedidoService'); // DESACTIVADO TEMPORALMENTE

/**
 * GET /api/inventarios/pedidos
 * Listar pedidos activos para inventarios
 */
exports.listarPedidosInventarios = async (req, res) => {
  try {
    const { tenant_id, userId, userRole } = req;

    // Validar que sea inventarios
    if (userRole !== 'inventarios') {
      return res.status(403).json({
        success: false,
        message: 'Solo inventarios pueden acceder a esta ruta'
      });
    }

    // Obtener pedidos activos (excluyendo Surtido completo, Entregado, Cancelado)
    const query = `
      SELECT 
        p.pedidoid,
        p.numero_pedido_cliente,
        p.fechapedido,
        p.estatus,
        p.total,
        p.es_credito,
        p.admin_asignado_id,
        p.es_prioritario,
        a.nombre as admin_nombre,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido,
        COUNT(dp.detalleid) as total_productos,
        SUM(CASE WHEN LOWER(dp.estado_producto) = 'surtido' THEN 1 ELSE 0 END) as productos_surtidos,
        SUM(CASE WHEN LOWER(COALESCE(dp.estado_producto, '')) = 'con stock' THEN 1 ELSE 0 END) as productos_con_stock,
        SUM(CASE WHEN LOWER(COALESCE(dp.estado_producto, 'bajo pedido')) = 'bajo pedido' THEN 1 ELSE 0 END) as productos_bajo_pedido
      FROM pedidos p
      INNER JOIN clientes c ON p.clienteid = c.clienteid AND c.tenant_id = p.tenant_id
      LEFT JOIN detallesdelpedido dp ON p.pedidoid = dp.pedidoid AND dp.tenant_id = p.tenant_id
      LEFT JOIN administradores a ON p.admin_asignado_id = a.adminid AND a.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1
        AND p.estatus NOT IN ('Cancelado', 'Entregado', 'Surtido completo')
      GROUP BY p.pedidoid, p.numero_pedido_cliente, p.fechapedido, p.estatus, 
               p.total, p.es_credito, p.admin_asignado_id, p.es_prioritario,
               a.nombre, c.nombre, c.apellido
      ORDER BY 
        p.es_prioritario DESC,
        p.fechapedido ASC
      LIMIT 200
    `;

    const result = await db.query(query, [tenant_id]);

    logger.info('✅ [INVENTARIOS] Pedidos activos listados', {
      userId,
      totalPedidos: result.rows.length,
      tenantId: tenant_id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    logger.error('Error al listar pedidos para inventarios:', {
      error: error.message,
      stack: error.stack,
      userId: req.userId,
      tenantId: req.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener pedidos'
    });
  }
};

/**
 * POST /api/inventarios/pedidos/:id/surtir
 * Marcar productos seleccionados como Surtido
 * Transición: Con stock → Surtido
 */
exports.surtirProductos = async (req, res) => {
  const client = await db.connect();
  
  try {
    const { tenant_id, userId, userRole } = req;
    const { id: pedidoId } = req.params;
    const { detalleIds } = req.body; // Array de IDs de productos a surtir

    // Validar que sea inventarios
    if (userRole !== 'inventarios') {
      return res.status(403).json({
        success: false,
        message: 'Solo inventarios pueden surtir productos'
      });
    }

    // Validar detalleIds
    if (!detalleIds || !Array.isArray(detalleIds) || detalleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debes seleccionar al menos un producto para surtir'
      });
    }

    await client.query('BEGIN');

    // Obtener información del pedido
    const pedidoQuery = `
      SELECT 
        p.pedidoid,
        p.clienteid,
        p.admin_asignado_id,
        p.fechapedido,
        p.estatus,
        p.es_credito,
        p.tenant_id
      FROM pedidos p
      WHERE p.pedidoid = $1
        AND p.tenant_id = $2
        AND p.estatus NOT IN ('Cancelado', 'Entregado', 'Surtido completo')
    `;

    const pedidoResult = await client.query(pedidoQuery, [pedidoId, tenant_id]);

    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado o no puede ser surtido'
      });
    }

    const pedido = pedidoResult.rows[0];

    // Determinar admin_id para stock
    const adminIdUser = pedido.admin_asignado_id || userId;

    logger.info('🔍 [SURTIR PEDIDO] Iniciando proceso', {
      pedidoId,
      detalleIds,
      adminIdUser,
      userId,
      tenantId: tenant_id
    });

    // Delegar a markingController para validar FIFO y marcar
    const markingResult = await validarYMarcarProductos({
      pedidoId,
      detalleIds,
      pedido,
      tenant_id,
      userId,
      adminIdUser,
      client
    });

    if (!markingResult.success) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        success: false,
        message: markingResult.message,
        razon: markingResult.razon,
        detalles_fifo: markingResult.detalles_fifo
      });
    }

    const marcarResult = markingResult.marcarResult;

    if (marcarResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No se pudo marcar ningún producto. Verifica que tengan stock suficiente.'
      });
    }

    logger.info('✅ Productos marcados como surtidos', {
      pedidoId,
      productosActualizados: marcarResult.rowCount,
      detalleIds,
      tenantId: tenant_id
    });

    // Obtener detalles marcados para descontar stock
    const detallesMarcadosQuery = `
      SELECT 
        dp.detalleid,
        dp.varianteid,
        dp.cantidadsurtida,
        dp.piezastotales,
        pv.sku,
        pr.nombreproducto
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid AND pv.tenant_id = $2
      INNER JOIN productos pr ON pv.productoid = pr.productoid AND pr.tenant_id = $2
      WHERE dp.pedidoid = $1 
        AND dp.tenant_id = $2
        AND dp.detalleid = ANY($3::int[])
        AND dp.cantidadsurtida > 0
    `;
    
    const detallesMarcadosResult = await client.query(detallesMarcadosQuery, [pedidoId, tenant_id, detalleIds]);

    // Descontar stock para cada producto marcado
    for (const detalle of detallesMarcadosResult.rows) {
      const piezasSurtidas = parseInt(detalle.cantidadsurtida || 0, 10);

      if (piezasSurtidas <= 0) {
        logger.warn('⚠️ Producto sin cantidad surtida, saltando', {
          detalleId: detalle.detalleid,
          cantidadsurtida: detalle.cantidadsurtida
        });
        continue;
      }

      // Obtener stock actual
      const stockActualResult = await client.query(
        `SELECT cantidad FROM stock_admin
         WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3`,
        [detalle.varianteid, adminIdUser, tenant_id]
      );

      if (stockActualResult.rows.length === 0) {
        await client.query('ROLLBACK');
        logger.error('❌ [SURTIR] No existe registro stock_admin', {
          detalleId: detalle.detalleid,
          varianteId: detalle.varianteid,
          adminId: adminIdUser,
          pedidoId,
          tenantId: tenant_id
        });
        return res.status(409).json({
          success: false,
          message: `El admin asignado no tiene inventario registrado para el producto SKU: ${detalle.sku}. Recibe el inventario primero.`
        });
      }

      const stockPrevio = parseInt(stockActualResult.rows[0].cantidad || 0, 10);
      const stockPosterior = stockPrevio - piezasSurtidas;

      // Descontar stock
      await client.query(
        `UPDATE stock_admin
         SET cantidad = $1,
             cantidad_reservada = GREATEST(0, cantidad_reservada - $5)
         WHERE variante_id = $2 AND admin_id = $3 AND tenant_id = $4`,
        [stockPosterior, detalle.varianteid, adminIdUser, tenant_id, piezasSurtidas]
      );

      logger.info('✅ Stock descontado al surtir', {
        pedidoId,
        detalleId: detalle.detalleid,
        varianteId: detalle.varianteid,
        adminId: adminIdUser,
        piezasSurtidas,
        stockPrevio,
        stockPosterior,
        timestamp: new Date().toISOString()
      });

      // Registrar movimiento de inventario
      await client.query(
        `INSERT INTO movimientos_inventario
         (admin_id, variante_id, tenant_id, tipo, cantidad, stock_previo, stock_posterior, motivo, observaciones)
         VALUES ($1, $2, $3, 'MERMA', $4, $5, $6, 'Surtido de pedido', $7)`,
        [
          adminIdUser, detalle.varianteid, tenant_id,
          piezasSurtidas, stockPrevio, stockPosterior,
          `Pedido #${pedidoId}: surtido por inventarios`
        ]
      );

      // Registrar en pedido_surtido_detalle
      await client.query(
        `INSERT INTO pedido_surtido_detalle
         (pedido_id, detalle_pedido_id, variante_id, cantidad_piezas_surtidas, admin_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [pedidoId, detalle.detalleid, detalle.varianteid, piezasSurtidas, adminIdUser, tenant_id]
      );
    }

    // Actualizar estado del pedido usando cálculo directo (sin actualización automática de productos)
    const nuevoEstatus = await calcularEstadoPedidoCorrect(client, pedidoId);
    
    await client.query(
      `UPDATE pedidos SET estatus = $1 WHERE pedidoid = $2 AND tenant_id = $3`,
      [nuevoEstatus, pedidoId, tenant_id]
    );

    await client.query('COMMIT');

    // Propagar FIFO asíncrono (no crítico)
    try {
      for (const detalle of detallesMarcadosResult.rows) {
        await SmartStockService.reallocateStockForVariant(
          detalle.varianteid,
          adminIdUser,
          tenant_id
        );
      }
    } catch (fifoError) {
      logger.warn('[Surtir] Error en propagación FIFO post-surtido (no crítico)', {
        error: fifoError.message,
        pedidoId,
        tenantId: tenant_id,
        timestamp: new Date().toISOString()
      });
    }

    logger.info('✅ Pedido surtido exitosamente', {
      pedidoId,
      estatus: nuevoEstatus,
      productosActualizados: marcarResult.rowCount,
      userId,
      tenantId: tenant_id,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `${marcarResult.rowCount} producto(s) marcado(s) como surtido. Stock descontado.`,
      data: {
        pedidoId,
        estatus: nuevoEstatus,
        productosActualizados: marcarResult.rowCount
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al surtir pedido:', {
      error: error.message,
      stack: error.stack,
      pedidoId: req.params.id,
      userId: req.userId,
      tenantId: req.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al surtir el pedido'
    });
  } finally {
    client.release();
  }
};

/**
 * POST /api/inventarios/pedidos/:id/marcar-backorder
 * Marcar productos como Bajo pedido (sin stock)
 */
exports.marcarBajoPedido = async (req, res) => {
  try {
    const { tenant_id, userId, userRole } = req;
    const { id: pedidoId } = req.params;
    const { detalleIds } = req.body;

    // Validar que sea inventarios
    if (userRole !== 'inventarios') {
      return res.status(403).json({
        success: false,
        message: 'Solo inventarios pueden marcar productos como bajo pedido'
      });
    }

    if (!detalleIds || !Array.isArray(detalleIds) || detalleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debes seleccionar al menos un producto'
      });
    }

    const updateQuery = `
      UPDATE detallesdelpedido
      SET estado_producto = 'Bajo pedido',
          esbackorder = true
      WHERE pedidoid = $1
        AND detalleid = ANY($2::int[])
        AND tenant_id = $3
        AND cantidadsurtida = 0
        AND (estado_producto IS NULL OR LOWER(estado_producto) NOT IN ('surtido', 'facturado'))
      RETURNING detalleid
    `;

    const result = await db.query(updateQuery, [pedidoId, detalleIds, tenant_id]);

    if (result.rowCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se pudo marcar ningún producto. Verifica que no estén surtidos o facturados.'
      });
    }

    // Actualizar estado del pedido usando cálculo directo
    const nuevoEstatus = await calcularEstadoPedidoCorrect(db, pedidoId);
    
    await db.query(
      `UPDATE pedidos SET estatus = $1 WHERE pedidoid = $2 AND tenant_id = $3`,
      [nuevoEstatus, pedidoId, tenant_id]
    );

    logger.info('✅ Productos marcados como bajo pedido', {
      pedidoId,
      productosActualizados: result.rowCount,
      detalleIds,
      userId,
      tenantId: tenant_id
    });

    res.json({
      success: true,
      message: `${result.rowCount} producto(s) marcado(s) como bajo pedido`,
      data: {
        pedidoId,
        estatus: nuevoEstatus,
        productosActualizados: result.rowCount
      }
    });

  } catch (error) {
    logger.error('Error al marcar productos como bajo pedido:', {
      error: error.message,
      pedidoId: req.params.id,
      userId: req.userId,
      tenantId: req.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al marcar productos como bajo pedido'
    });
  }
};
