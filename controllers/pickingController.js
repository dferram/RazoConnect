/**
 * PICKING/SEPARACIÓN DE PRODUCTOS CONTROLLER
 * 
 * Gestiona el tracking de productos separados físicamente por inventarios.
 * Permite marcar productos como separados antes de enviar a finanzas.
 * 
 * @module controllers/pickingController
 * @author RazoConnect Team
 * @date 2026-03-18
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener estado de separación de un pedido
 * GET /api/pedidos/:id/picking
 */
const obtenerEstadoPicking = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const pedidoId = parseInt(req.params.id);

    // Obtener detalles del pedido con estado de separación
    const query = `
      SELECT 
        dp.detalleid,
        dp.varianteid,
        dp.cantidadpaquetes,
        dp.piezastotales,
        dp.preciounitario,
        dp.esbackorder,
        dp.cantidadsurtida,
        pv.sku,
        pv.dimensiones,
        pv.color_nombre,
        p.nombreproducto,
        t.cantidad as tamano_cantidad,
        t.descripcion as tamano_descripcion,
        ps.separacion_id,
        ps.cantidad_separada,
        ps.fecha_separacion,
        ps.observaciones as observaciones_separacion,
        COALESCE(ps.cantidad_separada, 0) as cantidad_ya_separada
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
      INNER JOIN productos p ON pv.productoid = p.productoid
      LEFT JOIN cat_tamanopaquetes t ON dp.tamanoid = t.tamanoid AND t.tenant_id = $2
      LEFT JOIN pedido_productos_separados ps ON dp.detalleid = ps.detalle_id
      WHERE dp.pedidoid = $1 AND dp.tenant_id = $2
      ORDER BY dp.detalleid
    `;

    const result = await db.query(query, [pedidoId, tenant_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron productos para este pedido'
      });
    }

    // Calcular estadísticas
    const totalProductos = result.rows.length;
    const productosSeparados = result.rows.filter(r => r.separacion_id !== null).length;
    const productosBackorder = result.rows.filter(r => r.esbackorder === true).length;
    const productosPendientes = totalProductos - productosSeparados - productosBackorder;
    
    // Calcular porcentaje evitando división por cero
    const productosNoBackorder = totalProductos - productosBackorder;
    const porcentajeCompletado = productosNoBackorder > 0 
      ? Math.round((productosSeparados / productosNoBackorder) * 100) 
      : 0;

    const productos = result.rows.map(row => ({
      detalleId: row.detalleid,
      varianteId: row.varianteid,
      sku: row.sku,
      nombreProducto: row.nombreproducto,
      variante: row.dimensiones || row.color_nombre || 'Estándar',
      colorNombre: row.color_nombre,
      cantidadPaquetes: parseInt(row.cantidadpaquetes),
      piezasTotales: parseInt(row.piezastotales),
      tamano: {
        cantidad: parseInt(row.tamano_cantidad || 1),
        descripcion: row.tamano_descripcion || 'Unidad'
      },
      esBackorder: row.esbackorder,
      separado: row.separacion_id !== null,
      cantidadSeparada: parseInt(row.cantidad_ya_separada || 0),
      fechaSeparacion: row.fecha_separacion,
      observaciones: row.observaciones_separacion
    }));

    res.json({
      success: true,
      data: {
        pedidoId,
        productos,
        estadisticas: {
          total: totalProductos,
          separados: productosSeparados,
          pendientes: productosPendientes,
          backorder: productosBackorder,
          porcentajeCompletado
        }
      }
    });

  } catch (error) {
    logger.error('Error al obtener estado de picking:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al obtener el estado de separación',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Marcar producto como separado
 * POST /api/pedidos/:id/picking/:detalleId
 */
const marcarProductoSeparado = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { tenant_id } = req.tenant;
    const separadoPorId = req.user?.id || req.user?.adminid;
    
    // Validar que separadoPorId existe
    if (!separadoPorId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado correctamente'
      });
    }
    
    const pedidoId = parseInt(req.params.id);
    const detalleId = parseInt(req.params.detalleId);
    const { cantidadSeparada, observaciones } = req.body;

    await client.query('BEGIN');

    // Verificar que el detalle existe y pertenece al pedido
    const detalleResult = await client.query(
      `SELECT dp.detalleid, dp.pedidoid, dp.varianteid, dp.cantidadpaquetes, dp.preciofinal, 
              dp.tamanoid, dp.descuento, dp.piezastotales, dp.esbackorder, dp.cantidadsurtida, 
              dp.cantidad_surtida_remisiones, dp.tenant_id, p.estatus
       FROM detallesdelpedido dp
       INNER JOIN pedidos p ON dp.pedidoid = p.pedidoid
       WHERE dp.detalleid = $1 AND dp.pedidoid = $2 AND dp.tenant_id = $3`,
      [detalleId, pedidoId, tenant_id]
    );

    if (detalleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado en este pedido'
      });
    }

    const detalle = detalleResult.rows[0];

    // Validar que el pedido esté en estado modificable
    const estadosValidos = ['nuevo', 'pendiente', 'confirmado', 'aprobado'];
    if (!estadosValidos.includes(detalle.estatus.toLowerCase())) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `No se puede separar productos de un pedido en estado "${detalle.estatus}"`
      });
    }

    // Validar cantidad
    const cantidadRequerida = parseInt(detalle.cantidadpaquetes);
    const cantidadASeparar = cantidadSeparada !== undefined 
      ? parseInt(cantidadSeparada) 
      : cantidadRequerida;

    if (cantidadASeparar > cantidadRequerida) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `No se puede separar más de lo solicitado (${cantidadRequerida} paquetes)`
      });
    }

    // Insertar o actualizar registro de separación
    const upsertQuery = `
      INSERT INTO pedido_productos_separados (
        pedido_id,
        detalle_id,
        separado_por,
        cantidad_separada,
        observaciones,
        tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (detalle_id) 
      DO UPDATE SET
        cantidad_separada = $4,
        fecha_separacion = NOW(),
        observaciones = $5
      RETURNING *
    `;

    const result = await client.query(upsertQuery, [
      pedidoId,
      detalleId,
      separadoPorId,
      cantidadASeparar,
      observaciones || null,
      tenant_id
    ]);

    await client.query('COMMIT');

    logger.info('Producto marcado como separado', {
      pedidoId,
      detalleId,
      cantidadSeparada: cantidadASeparar,
      separadoPorId,
      tenantId: tenant_id,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: 'Producto marcado como separado exitosamente',
      data: {
        separacionId: result.rows[0].separacion_id,
        detalleId,
        cantidadSeparada: result.rows[0].cantidad_separada,
        fechaSeparacion: result.rows[0].fecha_separacion
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al marcar producto como separado:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al marcar el producto como separado',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

/**
 * Desmarcar producto (quitar separación)
 * DELETE /api/pedidos/:id/picking/:detalleId
 */
const desmarcarProductoSeparado = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { tenant_id } = req.tenant;
    const pedidoId = parseInt(req.params.id);
    const detalleId = parseInt(req.params.detalleId);

    await client.query('BEGIN');

    // Verificar estado del pedido antes de permitir desmarcar
    const pedidoCheck = await client.query(
      `SELECT estatus FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenant_id]
    );

    if (pedidoCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const estadosNoModificables = ['surtido', 'enviado', 'entregado', 'cancelado', 'listo para surtir'];
    if (estadosNoModificables.includes(pedidoCheck.rows[0].estatus.toLowerCase())) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `No se puede desmarcar productos de un pedido en estado "${pedidoCheck.rows[0].estatus}"`
      });
    }

    const deleteResult = await client.query(
      `DELETE FROM pedido_productos_separados
       WHERE detalle_id = $1 AND pedido_id = $2 AND tenant_id = $3
       RETURNING *`,
      [detalleId, pedidoId, tenant_id]
    );

    if (deleteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'No se encontró registro de separación para este producto'
      });
    }

    await client.query('COMMIT');

    logger.info('Producto desmarcado (separación removida)', {
      pedidoId,
      detalleId,
      tenantId: tenant_id,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: 'Separación removida exitosamente',
      data: {
        detalleId
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al desmarcar producto:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al desmarcar el producto',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

/**
 * Marcar todos los productos como separados
 * POST /api/pedidos/:id/picking/marcar-todos
 */
const marcarTodosSeparados = async (req, res) => {
  const client = await db.pool.connect();
  
  try {
    const { tenant_id } = req.tenant;
    const separadoPorId = req.user?.id || req.user?.adminid;
    
    // Validar que separadoPorId existe
    if (!separadoPorId) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado correctamente'
      });
    }
    
    const pedidoId = parseInt(req.params.id);

    await client.query('BEGIN');

    // Verificar estado del pedido antes de permitir marcar todos
    const pedidoCheck = await client.query(
      `SELECT estatus FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenant_id]
    );

    if (pedidoCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const estadosValidos = ['nuevo', 'pendiente', 'confirmado', 'aprobado'];
    if (!estadosValidos.includes(pedidoCheck.rows[0].estatus.toLowerCase())) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `No se puede marcar productos de un pedido en estado "${pedidoCheck.rows[0].estatus}"`
      });
    }

    // Obtener todos los detalles del pedido que NO son backorder
    const detallesResult = await client.query(
      `SELECT dp.detalleid, dp.cantidadpaquetes
       FROM detallesdelpedido dp
       WHERE dp.pedidoid = $1 AND dp.tenant_id = $2 AND dp.esbackorder = false`,
      [pedidoId, tenant_id]
    );

    if (detallesResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'No hay productos para separar en este pedido'
      });
    }

    let productosActualizados = 0;

    for (const detalle of detallesResult.rows) {
      await client.query(
        `INSERT INTO pedido_productos_separados (
          pedido_id,
          detalle_id,
          separado_por,
          cantidad_separada,
          tenant_id
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (detalle_id) 
        DO UPDATE SET
          cantidad_separada = $4,
          fecha_separacion = NOW()`,
        [pedidoId, detalle.detalleid, separadoPorId, detalle.cantidadpaquetes, tenant_id]
      );
      productosActualizados++;
    }

    await client.query('COMMIT');

    logger.info('Todos los productos marcados como separados', {
      pedidoId,
      productosActualizados,
      separadoPorId,
      tenantId: tenant_id,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: `${productosActualizados} producto(s) marcado(s) como separado(s)`,
      data: {
        pedidoId,
        productosActualizados
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al marcar todos como separados:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al marcar todos los productos como separados',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

module.exports = {
  obtenerEstadoPicking,
  marcarProductoSeparado,
  desmarcarProductoSeparado,
  marcarTodosSeparados
};
