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
         VALUES ($1, $2, $3, 'DEVOLUCIÓN', $4, $5, $6, $7, $8)`,
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

      // 4.4. Actualizar estado del detalle
      await client.query(
        `UPDATE detallesdelpedido
         SET estado_producto = 'Pendiente',
             cantidadsurtida = 0,
             cantidad_surtida_remisiones = 0
         WHERE detalleid = $1 AND tenant_id = $2`,
        [detalle.detalleid, tenant_id]
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
 * ORIGINAL FUNCTION (Preserved for reference, but use rechazarRemisionYReponerStock for new flow):
 * Rechazar pedido y regresar a almacén (finanzas)
 *
 * Nota: Esta función original permanece para compatibilidad hacia atrás
 * pero ya NO se usa con el nuevo flujo simplificado.
 * Usar: rechazarRemisionYReponerStock() en su lugar.
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

    // Si se proporcionaron detalleIds, regresar solo esos productos de Facturado a su estado original
    if (detalleIds && Array.isArray(detalleIds) && detalleIds.length > 0) {
      // Regresar productos específicos de Facturado a su estado original (Surtido o Bajo pedido)
      // ⚠️ CRÍTICO: Solo considerar stock del admin del cliente
      const regresarProductosQuery = `
        WITH stock_agregado AS (
          SELECT variante_id, tenant_id,
            COALESCE(SUM(cantidad), 0) as total_cantidad,
            COALESCE(SUM(cantidad_reservada), 0) as total_reservado
          FROM stock_admin
          WHERE admin_id = $4
          GROUP BY variante_id, tenant_id
        )
        UPDATE detallesdelpedido dp
        SET estado_producto = CASE
          WHEN (sa.total_cantidad - sa.total_reservado) >= dp.piezastotales THEN 'Surtido'
          WHEN (sa.total_cantidad - sa.total_reservado) > 0 THEN 'Surtido'
          ELSE 'Bajo pedido'
        END,
        cantidadsurtida = 0
        FROM stock_agregado sa
        WHERE dp.pedidoid = $1
          AND dp.detalleid = ANY($2::int[])
          AND dp.tenant_id = $3
          AND dp.cantidadsurtida > 0
          AND sa.variante_id = dp.varianteid
          AND sa.tenant_id = dp.tenant_id
        RETURNING dp.detalleid, dp.estado_producto
      `;

      const regresarResult = await client.query(regresarProductosQuery, [pedidoId, detalleIds, tenant_id, adminClienteId]);

      if (regresarResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'No se encontraron productos facturados para regresar'
        });
      }

      // Devolver stock a inventario del admin que lo surtió originalmente
      for (const producto of regresarResult.rows) {
        // Obtener el admin y cantidad que surtió este detalle
        const surtidoQuery = await client.query(
          `SELECT psd.admin_id, dp.varianteid, dp.piezastotales
           FROM pedido_surtido_detalle psd
           INNER JOIN detallesdelpedido dp ON psd.detalle_id = dp.detalleid
           WHERE psd.detalle_id = $1 AND psd.pedido_id = $2 AND psd.tenant_id = $3
           LIMIT 1`,
          [producto.detalleid, pedidoId, tenant_id]
        );

        if (surtidoQuery.rows.length > 0) {
          const { admin_id, varianteid, piezastotales } = surtidoQuery.rows[0];

          // Regresar stock al admin que lo surtió
          await client.query(
            `UPDATE stock_admin
             SET cantidad = cantidad + $1
             WHERE variante_id = $2 AND admin_id = $3 AND tenant_id = $4`,
            [piezastotales, varianteid, admin_id, tenant_id]
          );

          logger.info('Stock regresado al admin original:', {
            detalleId: producto.detalleid,
            varianteId: varianteid,
            adminId: admin_id,
            piezasRegresadas: piezastotales
          });
        }
      }

      await client.query('COMMIT');

      logger.info('Productos regresados de Facturado a estado original:', {
        pedidoId,
        productosRegresados: regresarResult.rowCount,
        detalleIds,
        userId,
        tenantId: tenant_id
      });

      return res.json({
        success: true,
        message: `${regresarResult.rowCount} producto(s) regresado(s) a su estado original`,
        data: {
          pedidoId,
          productosRegresados: regresarResult.rowCount,
          productos: regresarResult.rows
        }
      });
    }

    // Cambiar estado a "Revisión de almacén"
    const updateQuery = `
      UPDATE pedidos
      SET
        estatus = 'Revisión de almacén',
        observaciones_finanzas = $3,
        rechazado_por_finanzas = $4,
        fecha_rechazo_finanzas = NOW()
      WHERE pedidoid = $1 AND tenant_id = $2
      RETURNING *
    `;

    const updateResult = await client.query(updateQuery, [pedidoId, tenant_id, observaciones_finanzas, userId]);

    await client.query('COMMIT');

    logger.info('Pedido rechazado por finanzas y regresado a almacén:', {
      pedidoId,
      observaciones: observaciones_finanzas,
      userId,
      tenantId: tenant_id,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: 'Pedido regresado al almacén para corrección',
      data: {
        pedidoId: updateResult.rows[0].pedidoid,
        estatus: updateResult.rows[0].estatus,
        observaciones_finanzas
      }
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
