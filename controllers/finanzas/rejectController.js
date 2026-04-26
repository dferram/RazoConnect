/**
 * FINANZAS REJECT CONTROLLER - Rechazar Pedido
 *
 * Extraído de pedidosAdminController.js como parte del refactoring.
 * Responsabilidad: Rechazar pedido y regresarlo al almacén
 *
 * @module controllers/finanzas/rejectController
 * @author RazoConnect Team
 * @date 2026-04-10
 */

const db = require('../../db');
const logger = require('../../utils/logger');

/**
 * Rechazar remisión y REPONER stock (nuevo flujo: surtimiento descuenta inmediatamente)
 *
 * ✅ NUEVO: Cuando finanzas rechaza un surtimiento, se retorna el stock
 * (porque el descuento ya ocurrió en remisionesController)
 *
 * POST /api/admin/pedidos/:id/rechazar-finanzas (con reponer_stock=true)
 */
const rechazarRemisionYReponerStock = async (req, res) => {
  const client = await db.getClient();

  try {
    const { id: pedidoId } = req.params;
    const { detalleIds, observaciones_finanzas } = req.body;
    const { tenant_id } = req.tenant;
    const userId = req.user?.id || req.user?.adminid;

    if (!observaciones_finanzas || observaciones_finanzas.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Se requieren observaciones para rechazar el pedido'
      });
    }

    if (!detalleIds || !Array.isArray(detalleIds) || detalleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Especifica qué productos devolver (detalleIds)'
      });
    }

    await client.query('BEGIN');

    // 1. Obtener información del pedido
    const pedidoQuery = `
      SELECT p.pedidoid, p.clienteid, p.estatus
      FROM pedidos p
      WHERE p.pedidoid = $1 AND p.tenant_id = $2
      FOR UPDATE
    `;

    const pedidoResult = await client.query(pedidoQuery, [pedidoId, tenant_id]);

    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoResult.rows[0];

    // 2. Obtener admin del cliente
    const estadosHelper = require('../../utils/estadosHelper');
    const adminClienteId = await estadosHelper.getAdminByClienteEstado(pedido.clienteid, tenant_id);

    // 3. Obtener detalles de los productos a rechazar
    const detallesQuery = `
      SELECT dp.detalleid, dp.varianteid, dp.cantidadsurtida, dp.piezastotales, pv.sku, p.nombreproducto
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
      INNER JOIN productos p ON pv.productoid = p.productoid
      WHERE dp.pedidoid = $1
        AND dp.detalleid = ANY($2::int[])
        AND dp.tenant_id = $3
    `;

    const detallesResult = await client.query(detallesQuery, [pedidoId, detalleIds, tenant_id]);

    if (detallesResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No se encontraron detalles a rechazar'
      });
    }

    let productosRepuestos = 0;

    // 4. REPONER stock para cada producto rechazado
    for (const detalle of detallesResult.rows) {
      const varianteId = detalle.varianteid;
      const piezasAReponer = detalle.cantidadsurtida; // Todas las piezas surtidas

      logger.info('🔄 [RECHAZO] Reponiendo stock (fue descuento al generar remisión):', {
        varianteId,
        adminId: adminClienteId,
        piezasAReponer,
        sku: detalle.sku,
        producto: detalle.nombreproducto
      });

      // 4.1. Obtener stock actual
      const stockActualResult = await client.query(
        `SELECT cantidad FROM stock_admin
         WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3`,
        [varianteId, adminClienteId, tenant_id]
      );

      if (stockActualResult.rows.length === 0) {
        throw new Error(
          `No se encontró stock para reponer: variante ${varianteId}, admin ${adminClienteId}`
        );
      }

      const stockAnterior = parseInt(stockActualResult.rows[0].cantidad || 0, 10);

      // 4.2. Reponer el stock
      const repuestaResult = await client.query(
        `UPDATE stock_admin
         SET cantidad = cantidad + $1
         WHERE variante_id = $2 AND admin_id = $3 AND tenant_id = $4
         RETURNING cantidad`,
        [piezasAReponer, varianteId, adminClienteId, tenant_id]
      );

      const nuevoStock = repuestaResult.rows[0].cantidad;

      // 4.3. Registrar movimiento de devolución
      await client.query(
        `INSERT INTO movimientos_inventario
         (admin_id, variante_id, tenant_id, tipo, cantidad, stock_previo, stock_posterior, motivo, observaciones)
         VALUES ($1, $2, $3, 'ADICION', $4, $5, $6, $7, $8)`,
        [
          adminClienteId,
          varianteId,
          tenant_id,
          piezasAReponer,
          stockAnterior,
          nuevoStock,
          'Rechazo de remisión por finanzas',
          `Pedido #${pedidoId}: ${observaciones_finanzas}`
        ]
      );

      // 4.4. Actualizar estado del detalle basado en stock actual (ya repuesto)
      await client.query(
        `UPDATE detallesdelpedido dp
         SET estado_producto = CASE
               WHEN COALESCE(sa.cantidad, 0) >= dp.piezastotales THEN 'Con stock'
               ELSE 'Bajo pedido'
             END,
             cantidadsurtida = 0,
             cantidad_surtida_remisiones = 0
         FROM (
           SELECT variante_id, SUM(cantidad) AS cantidad
           FROM stock_admin
           WHERE admin_id = $3 AND tenant_id = $2
           GROUP BY variante_id
         ) sa
         WHERE dp.detalleid = $1 AND dp.tenant_id = $2
           AND sa.variante_id = dp.varianteid`,
        [detalle.detalleid, tenant_id, adminClienteId]
      );

      productosRepuestos++;

      logger.info('✅ Stock reapuesto:', {
        varianteId,
        piezasAReponer,
        stockAnterior,
        nuevoStock
      });
    }

    // 5. Actualizar estado del pedido
    await client.query(
      `UPDATE pedidos
       SET estatus = 'Rechazado por Finanzas',
           rechazado_por_finanzas = true,
           fecha_rechazo_finanzas = NOW(),
           observaciones_finanzas = $1
       WHERE pedidoid = $2 AND tenant_id = $3`,
      [observaciones_finanzas, pedidoId, tenant_id]
    );

    await client.query('COMMIT');

    logger.info('✅ Remisión rechazada y stock reapuesto:', {
      pedidoId,
      productosRepuestos,
      userId,
      tenant_id
    });

    return res.json({
      success: true,
      message: `✅ ${productosRepuestos} producto(s) rechazado(s) y stock reapuesto correctamente`,
      data: {
        pedidoId,
        productosRepuestos,
        nuevoEstatus: 'Rechazado por Finanzas'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ Error al rechazar y reponer stock:', {
      error: error.message,
      stack: error.stack,
      pedidoId: req.params.id,
      tenant_id: req.tenant?.tenant_id
    });

    return res.status(500).json({
      success: false,
      message: `Error al rechazar remisión: ${error.message}`
    });
  } finally {
    client.release();
  }
};

/**
 * Rechazar pedido y devolver stock al almacén (finanzas)
 * Ruta principal: POST /api/admin/pedidos/:id/rechazar-finanzas
 *
 * Requiere detalleIds para identificar los productos surtidos a revertir.
 * Devuelve el stock descontado en surtirPedido al admin original.
 * Cambia el pedido a "Revisión de almacén".
 */
const rechazarPedidoFinanzas = async (req, res) => {
  const client = await db.getClient();

  try {
    const { id: pedidoId } = req.params;
    const { detalleIds, observaciones_finanzas } = req.body; // detalleIds para regresar productos específicos
    const { tenant_id } = req.tenant;
    const userId = req.user?.id || req.user?.adminid;

    if (!observaciones_finanzas || observaciones_finanzas.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Se requieren observaciones para rechazar el pedido'
      });
    }

    await client.query('BEGIN');

    // Obtener pedido
    const pedidoQuery = `
      SELECT p.pedidoid, p.clienteid, p.agenteid, p.direccionenvioid, p.fechapedido, p.montototal, p.estatus,
             p.costoenvio, p.es_credito, p.fecha_vencimiento, p.pagado, p.transaccion_id, p.comprobante_url,
             p.metodo_pago, p.cupon_id, p.monto_descuento, p.saldo_pendiente, p.url_evidencia_entrega,
             p.fecha_entrega_real, p.tenant_id, p.estatus_deuda, p.dias_atraso, p.tiene_remisiones,
             p.completamente_surtido, p.monto_surtido, p.monto_backorder, p.es_prioritario, p.es_historico,
             p.fecha_confirmacion, p.observaciones_finanzas, p.rechazado_por_finanzas, p.fecha_rechazo_finanzas
      FROM pedidos p
      WHERE p.pedidoid = $1 AND p.tenant_id = $2
    `;

    const pedidoResult = await client.query(pedidoQuery, [pedidoId, tenant_id]);

    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Pedido no encontrado'
      });
    }

    const pedido = pedidoResult.rows[0];
    const estatusActual = (pedido.estatus || '').toLowerCase().trim();

    // ⚠️ CRÍTICO: Obtener admin del cliente para filtrar stock correctamente
    const estadosHelper = require('../../utils/estadosHelper');
    const adminClienteId = await estadosHelper.getAdminByClienteEstado(pedido.clienteid, tenant_id);

    // Validar que el pedido está listo para remisionar
    const estadosValidos = ['listo para remisionar'];
    if (!estadosValidos.includes(estatusActual)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `No se puede rechazar. El pedido debe estar en estado "Listo para remisionar". Estado actual: ${pedido.estatus}`
      });
    }

    // Si se proporcionaron detalleIds, regresar esos productos surtidos a su estado original
    if (detalleIds && Array.isArray(detalleIds) && detalleIds.length > 0) {

      // 1. Obtener los detalles a rechazar con la cantidad REAL surtida (antes de modificar nada)
      const productosARechazarResult = await client.query(
        `SELECT dp.detalleid, dp.varianteid, dp.cantidadsurtida, dp.piezastotales,
                psd.admin_id AS admin_surtidor, psd.cantidad AS cantidad_psd
         FROM detallesdelpedido dp
         LEFT JOIN pedido_surtido_detalle psd
           ON psd.detalle_id = dp.detalleid AND psd.pedido_id = $1
         WHERE dp.pedidoid = $1
           AND dp.detalleid = ANY($2::int[])
           AND dp.tenant_id = $3
           AND dp.cantidadsurtida > 0`,
        [pedidoId, detalleIds, tenant_id]
      );

      if (productosARechazarResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'No se encontraron productos surtidos para rechazar'
        });
      }

      // 2. Devolver stock al admin que surtió (usando cantidad real de psd, no piezastotales)
      for (const producto of productosARechazarResult.rows) {
        const adminSurtidor = producto.admin_surtidor;
        const piezasADevolver = parseInt(producto.cantidad_psd || producto.cantidadsurtida || 0, 10);

        if (!adminSurtidor || piezasADevolver <= 0) {
          logger.warn('⚠️ No se puede devolver stock, datos faltantes:', {
            detalleId: producto.detalleid,
            adminSurtidor,
            piezasADevolver
          });
          continue;
        }

        await client.query(
          `UPDATE stock_admin
           SET cantidad = cantidad + $1
           WHERE variante_id = $2 AND admin_id = $3 AND tenant_id = $4`,
          [piezasADevolver, producto.varianteid, adminSurtidor, tenant_id]
        );

        logger.info('✅ Stock devuelto al admin surtidor:', {
          detalleId: producto.detalleid,
          varianteId: producto.varianteid,
          adminId: adminSurtidor,
          piezasDevueltas: piezasADevolver
        });
      }

      // 3. Actualizar estado_producto basado en el NUEVO stock (ya devuelto) y poner cantidadsurtida=0
      await client.query(
        `UPDATE detallesdelpedido dp
         SET estado_producto = CASE
               WHEN COALESCE(sa.cantidad, 0) >= dp.piezastotales THEN 'Con stock'
               ELSE 'Bajo pedido'
             END,
             cantidadsurtida = 0
         FROM (
           SELECT variante_id, SUM(cantidad) AS cantidad
           FROM stock_admin
           WHERE admin_id = $4 AND tenant_id = $3
           GROUP BY variante_id
         ) sa
         WHERE dp.pedidoid = $1
           AND dp.detalleid = ANY($2::int[])
           AND dp.tenant_id = $3
           AND sa.variante_id = dp.varianteid`,
        [pedidoId, detalleIds, tenant_id, adminClienteId]
      );

      // 4. Marcar pedido en Revisión de almacén
      await client.query(
        `UPDATE pedidos
         SET estatus = 'Revisión de almacén',
             observaciones_finanzas = $3,
             rechazado_por_finanzas = true,
             fecha_rechazo_finanzas = NOW()
         WHERE pedidoid = $1 AND tenant_id = $2`,
        [pedidoId, tenant_id, observaciones_finanzas]
      );

      await client.query('COMMIT');

      logger.info('✅ Productos rechazados y stock devuelto:', {
        pedidoId,
        productosRechazados: productosARechazarResult.rows.length,
        detalleIds,
        userId,
        tenantId: tenant_id
      });

      return res.json({
        success: true,
        message: `${productosARechazarResult.rows.length} producto(s) rechazado(s) y stock devuelto. Pedido en Revisión de almacén.`,
        data: {
          pedidoId,
          productosRechazados: productosARechazarResult.rows.length,
          nuevoEstatus: 'Revisión de almacén'
        }
      });
    }

    // Sin detalleIds: no es posible devolver el stock correctamente
    await client.query('ROLLBACK');
    return res.status(400).json({
      success: false,
      message: 'Debes especificar qué productos rechazar (detalleIds) para poder devolver el stock correctamente.'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al rechazar pedido por finanzas:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al rechazar el pedido',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

module.exports = {
  rechazarPedidoFinanzas,
  rechazarRemisionYReponerStock  // ✅ NUEVO: Reposición de stock cuando finanzas rechaza
};
