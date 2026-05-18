/**
 * @file controllers/finanzas/confirmacionController.js
 * @description Controlador para rol Finanzas - Transición a 'Facturado'
 * Genera CxC y reevalúa la máquina de estados ignorando el ítem recién cerrado
 */

const OrderStateEngine = require('../../services/OrderStateEngine');
const db = require('../../db');

/**
 * Confirma la facturación de un producto
 * Marca el producto como 'Facturado', genera CxC y recalcula el estado del pedido
 * 
 * @route POST /api/finanzas/confirmar-facturacion
 * @access Rol: Finanzas
 */
async function confirmarFacturacion(req, res) {
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

    // 1. Verificar que el detalle existe y obtener su estado actual
    const detalleResult = await client.query(
      `SELECT estado_producto, piezastotales, varianteid 
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

    const { estado_producto, piezastotales, varianteid } = detalleResult.rows[0];

    // 2. Validar que no esté ya facturado (operación idempotente)
    if (estado_producto === 'Facturado') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `El producto ya está marcado como 'Facturado'`,
        idempotent: true
      });
    }

    // 3. Marcar el item individual como facturado
    await client.query(
      `UPDATE detallesdelpedido 
       SET estado_producto = 'Facturado' 
       WHERE detalleid = $1 AND tenant_id = $2`,
      [detalleId, tenantId]
    );

    // 4. Generar CxC (Cuentas por Cobrar)
    // Nota: Esta es una implementación simplificada. 
    // En producción, esto debería llamar a un servicio CxC dedicado.
    try {
      await generarCxC(client, detalleId, pedidoId, tenantId, piezastotales, varianteid);
    } catch (cxcError) {
      console.error('[ConfirmacionController] Error generando CxC:', cxcError);
      // Si falla la generación de CxC, hacer rollback de todo
      await client.query('ROLLBACK');
      return res.status(500).json({
        error: 'Error al generar CxC',
        details: cxcError.message
      });
    }

    // 5. Traer todos los items del pedido actualizados
    const { rows: items } = await client.query(
      `SELECT estado_producto, piezastotales 
       FROM detallesdelpedido 
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenantId]
    );

    // 6. ✨ AQUI LA MAGIA: Pasar el estado crudo al motor puro
    // OrderStateEngine automáticamente ignorará los productos 'Facturado'
    const nuevoEstadoPedido = OrderStateEngine.calculateOrderState(items);

    // 7. Actualizar el pedido
    await client.query(
      `UPDATE pedidos 
       SET estatus = $1 
       WHERE pedidoid = $2 AND tenant_id = $3`,
      [nuevoEstadoPedido, pedidoId, tenantId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Facturación confirmada',
      detalleId,
      estadoAnterior: estado_producto,
      estadoNuevo: 'Facturado',
      estadoPedido: nuevoEstadoPedido,
      cxcGenerada: true
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ConfirmacionController] Error:', error);
    res.status(500).json({
      error: 'Error al confirmar facturación',
      details: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Confirma la facturación de múltiples productos en una sola transacción
 * 
 * @route POST /api/finanzas/confirmar-facturacion-lote
 * @access Rol: Finanzas
 */
async function confirmarFacturacionLote(req, res) {
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
      // 1. Verificar que el detalle existe
      const detalleResult = await client.query(
        `SELECT estado_producto, piezastotales, varianteid 
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

      const { estado_producto, piezastotales, varianteid } = detalleResult.rows[0];

      // 2. Validar que no esté ya facturado
      if (estado_producto === 'Facturado') {
        resultados.push({
          detalleId,
          success: false,
          error: 'Ya está facturado',
          idempotent: true
        });
        continue;
      }

      // 3. Marcar como facturado
      await client.query(
        `UPDATE detallesdelpedido 
         SET estado_producto = 'Facturado' 
         WHERE detalleid = $1 AND tenant_id = $2`,
        [detalleId, tenantId]
      );

      // 4. Generar CxC
      try {
        await generarCxC(client, detalleId, pedidoId, tenantId, piezastotales, varianteid);
        
        resultados.push({
          detalleId,
          success: true,
          estadoAnterior: estado_producto,
          estadoNuevo: 'Facturado',
          cxcGenerada: true
        });
      } catch (cxcError) {
        console.error(`[ConfirmacionController] Error generando CxC para detalle ${detalleId}:`, cxcError);
        resultados.push({
          detalleId,
          success: false,
          error: 'Error al generar CxC',
          details: cxcError.message
        });
      }
    }

    // 5. Recalcular el estado del pedido
    const { rows: items } = await client.query(
      `SELECT estado_producto, piezastotales 
       FROM detallesdelpedido 
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenantId]
    );

    const nuevoEstadoPedido = OrderStateEngine.calculateOrderState(items);

    // 6. Actualizar el estado del pedido
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
    console.error('[ConfirmacionController] Error en lote:', error);
    res.status(500).json({
      error: 'Error al confirmar facturación en lote',
      details: error.message
    });
  } finally {
    client.release();
  }
}

/**
 * Función auxiliar para generar CxC (Cuentas por Cobrar)
 * Esta es una implementación simplificada.
 * 
 * @param {Object} client - Cliente de base de datos
 * @param {number} detalleId - ID del detalle
 * @param {number} pedidoId - ID del pedido
 * @param {number} tenantId - ID del tenant
 * @param {number} cantidad - Cantidad de piezas
 * @param {number} varianteId - ID de la variante
 */
async function generarCxC(client, detalleId, pedidoId, tenantId, cantidad, varianteId) {
  // Implementación simplificada: registrar en una tabla de CxC
  // En producción, esto debería:
  // 1. Calcular el monto basado en precio de la variante
  // 2. Obtener información del cliente
  // 3. Crear registro en tabla cuentas_por_cobrar
  // 4. Generar número de factura
  // 5. Enviar notificación al cliente

  // Por ahora, solo registramos que se generó la CxC
  console.log(`[CxC] Generando CxC para detalle ${detalleId}, pedido ${pedidoId}, cantidad ${cantidad}`);

  // Ejemplo de inserción en tabla CxC (ajustar según tu esquema)
  // await client.query(`
  //   INSERT INTO cuentas_por_cobrar (pedido_id, detalle_id, variante_id, cantidad, tenant_id, fecha_generacion)
  //   VALUES ($1, $2, $3, $4, $5, NOW())
  // `, [pedidoId, detalleId, varianteId, cantidad, tenantId]);

  return true;
}

module.exports = {
  confirmarFacturacion,
  confirmarFacturacionLote
};
