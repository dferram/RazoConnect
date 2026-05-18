/**
 * @file controllers/almacen/surtidoController.js
 * @description Controlador para rol Inventarios - Transición a 'Surtido'
 * Solo ejecutable si el estado_producto actual es 'Con stock'
 */

const OrderStateEngine = require('../../services/OrderStateEngine');
const db = require('../../db');

/**
 * Marca un producto como 'Surtido'
 * Solo permitido para productos en estado 'Con stock'
 * 
 * @route POST /api/almacen/surtir
 * @access Rol: Inventarios
 */
async function surtirProducto(req, res) {
  const { detalleId, pedidoId } = req.body;
  const tenantId = req.user?.tenant_id;

  if (!detalleId || !pedidoId) {
    return res.status(400).json({
      error: 'detalleId y pedidoId son requeridos'
    });
  }

  if (!tenantId) {
    return res.status(401).json({
      error: 'Usuario no autenticado o sin tenant_id'
    });
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Obtener el estado actual del producto
    const detalleResult = await client.query(
      `SELECT estado_producto, piezastotales 
       FROM detallesdelpedido 
       WHERE detalleid = $1 AND tenant_id = $2`,
      [detalleId, tenantId]
    );

    if (detalleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: `Detalle ${detalleId} no encontrado`
      });
    }

    const { estado_producto, piezastotales } = detalleResult.rows[0];

    // 2. Validar que la transición sea permitida usando OrderStateEngine
    if (!OrderStateEngine.canTransitionToSurtido(estado_producto)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `No se puede marcar como 'Surtido'. Estado actual: '${estado_producto}'. Solo se permite desde 'Con stock'.`
      });
    }

    // 3. Marcar el producto como 'Surtido' y actualizar cantidadsurtida
    await client.query(
      `UPDATE detallesdelpedido 
       SET estado_producto = 'Surtido', cantidadsurtida = piezastotales 
       WHERE detalleid = $1 AND tenant_id = $2`,
      [detalleId, tenantId]
    );

    // 4. Traer todos los items del pedido actualizados
    const { rows: items } = await client.query(
      `SELECT estado_producto, piezastotales 
       FROM detallesdelpedido 
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenantId]
    );

    // 5. Recalcular el estado del pedido usando OrderStateEngine
    const nuevoEstadoPedido = OrderStateEngine.calculateOrderState(items);

    // 6. Actualizar el estado del pedido
    await client.query(
      `UPDATE pedidos 
       SET estatus = $1 
       WHERE pedidoid = $2 AND tenant_id = $3`,
      [nuevoEstadoPedido, pedidoId, tenantId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Producto marcado como Surtido',
      detalleId,
      estadoAnterior: estado_producto,
      estadoNuevo: 'Surtido',
      cantidadSurtida: piezastotales,
      estadoPedido: nuevoEstadoPedido
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[SurtidoController] Error:', error);
    res.status(500).json({
      error: 'Error al marcar producto como Surtido',
      details: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Marca múltiples productos como 'Surtido' en una sola transacción
 * 
 * @route POST /api/almacen/surtir-lote
 * @access Rol: Inventarios
 */
async function surtirProductosLote(req, res) {
  const { detalleIds, pedidoId } = req.body;
  const tenantId = req.user?.tenant_id;

  if (!detalleIds || !Array.isArray(detalleIds) || detalleIds.length === 0) {
    return res.status(400).json({
      error: 'detalleIds debe ser un array no vacío'
    });
  }

  if (!pedidoId) {
    return res.status(400).json({
      error: 'pedidoId es requerido'
    });
  }

  if (!tenantId) {
    return res.status(401).json({
      error: 'Usuario no autenticado o sin tenant_id'
    });
  }

  const client = await db.getClient();
  const resultados = [];

  try {
    await client.query('BEGIN');

    // Procesar cada detalle
    for (const detalleId of detalleIds) {
      // 1. Obtener el estado actual del producto
      const detalleResult = await client.query(
        `SELECT estado_producto, piezastotales 
         FROM detallesdelpedido 
         WHERE detalleid = $1 AND tenant_id = $2`,
        [detalleId, tenantId]
      );

      if (detalleResult.rows.length === 0) {
        resultados.push({
          detalleId,
          success: false,
          error: 'Detalle no encontrado'
        });
        continue;
      }

      const { estado_producto, piezastotales } = detalleResult.rows[0];

      // 2. Validar que la transición sea permitida
      if (!OrderStateEngine.canTransitionToSurtido(estado_producto)) {
        resultados.push({
          detalleId,
          success: false,
          error: `Estado actual '${estado_producto}' no permite transición a 'Surtido'`
        });
        continue;
      }

      // 3. Marcar el producto como 'Surtido'
      await client.query(
        `UPDATE detallesdelpedido 
         SET estado_producto = 'Surtido', cantidadsurtida = piezastotales 
         WHERE detalleid = $1 AND tenant_id = $2`,
        [detalleId, tenantId]
      );

      resultados.push({
        detalleId,
        success: true,
        estadoAnterior: estado_producto,
        estadoNuevo: 'Surtido',
        cantidadSurtida: piezastotales
      });
    }

    // 4. Recalcular el estado del pedido
    const { rows: items } = await client.query(
      `SELECT estado_producto, piezastotales 
       FROM detallesdelpedido 
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenantId]
    );

    const nuevoEstadoPedido = OrderStateEngine.calculateOrderState(items);

    // 5. Actualizar el estado del pedido
    await client.query(
      `UPDATE pedidos 
       SET estatus = $1 
       WHERE pedidoid = $2 AND tenant_id = $3`,
      [nuevoEstadoPedido, pedidoId, tenantId]
    );

    await client.query('COMMIT');

    const exitosos = resultados.filter(r => r.success).length;
    const fallidos = resultados.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Procesados ${resultados.length} productos: ${exitosos} exitosos, ${fallidos} fallidos`,
      estadoPedido: nuevoEstadoPedido,
      resultados
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[SurtidoController] Error en lote:', error);
    res.status(500).json({
      error: 'Error al marcar productos como Surtido',
      details: error.message
    });
  } finally {
    client.release();
  }
}

module.exports = {
  surtirProducto,
  surtirProductosLote
};
