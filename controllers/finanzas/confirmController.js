/**
 * FINANZAS CONFIRM CONTROLLER - Confirmar Surtido
 *
 * Extraído de pedidosAdminController.js como parte del refactoring.
 * Responsabilidad: Confirmar surtido y reducir inventario (solo finanzas)
 *
 * @module controllers/finanzas/confirmController
 * @author RazoConnect Team
 * @date 2026-04-10
 */

const db = require('../../db');
const logger = require('../../utils/logger');

/**
 * Confirmar surtido y reducir inventario (finanzas)
 * Usado por finanzas para confirmar que el pedido está listo y reducir stock
 *
 * ⚠️ PROTECCIÓN DE LÓGICA FINANCIERA PARA SURTIDO PARCIAL:
 * - Solo reduce stock de productos que fueron marcados como surtidos (cantidadsurtida > 0)
 * - Si el pedido está en "Surtido Parcial", solo procesa los items completados
 * - El resto de items quedan pendientes para futuras entregas
 * - La CXC se genera posteriormente en remisionesController basada en lo realmente entregado
 *
 * POST /api/admin/pedidos/:id/confirmar-surtido
 */
const confirmarSurtidoFinanzas = async (req, res) => {
  const client = await db.getClient();

  try {
    const { id: pedidoId } = req.params;
    const { detalleIds } = req.body; // Array de IDs de productos seleccionados por finanzas
    const { tenant_id } = req.tenant;
    const userId = req.user?.id || req.user?.adminid;

    await client.query('BEGIN');

    // Obtener pedido y verificar que está listo para surtir
    const pedidoQuery = `
      SELECT p.pedidoid, p.clienteid, p.agenteid, p.direccionenvioid, p.fechapedido, p.montototal, p.estatus,
             p.costoenvio, p.es_credito, p.fecha_vencimiento, p.pagado, p.transaccion_id, p.comprobante_url,
             p.metodo_pago, p.cupon_id, p.monto_descuento, p.saldo_pendiente, p.url_evidencia_entrega,
             p.fecha_entrega_real, p.tenant_id, p.estatus_deuda, p.dias_atraso, p.tiene_remisiones,
             p.completamente_surtido, p.monto_surtido, p.monto_backorder, p.es_prioritario, p.es_historico,
             p.fecha_confirmacion, p.observaciones_finanzas, p.rechazado_por_finanzas, p.fecha_rechazo_finanzas,
        (SELECT COUNT(*) FROM detallesdelpedido WHERE pedidoid = p.pedidoid AND esbackorder = false) as productos_con_stock
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

    // Validar que el pedido está en estado correcto
    if (!['listo para surtir', 'parcialmente surtido', 'parcialmente_surtido', 'surtido parcial', 'listo para remisionar'].includes(estatusActual)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `No se puede confirmar. El pedido debe estar en estado "Listo para Surtir", "Surtido Parcial" o "Listo para remisionar". Estado actual: ${pedido.estatus}`
      });
    }

    // VALIDACIÓN: Verificar que se proporcionaron detalleIds
    if (!detalleIds || !Array.isArray(detalleIds) || detalleIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Debes seleccionar al menos un producto para confirmar.'
      });
    }

    // PROTECCIÓN PARA SURTIDO PARCIAL: Obtener productos que están SURTIDOS (marcados por inventarios)
    // Y que fueron seleccionados por finanzas para confirmar
    // IMPORTANTE: También obtener el admin_id que realizó el surtido (de pedido_surtido_detalle)
    const productosQuery = `
      SELECT
        dp.detalleid,
        dp.varianteid,
        dp.piezastotales,
        dp.cantidadsurtida,
        dp.esbackorder,
        dp.estado_producto,
        pv.sku,
        pr.nombreproducto,
        psd.admin_id as admin_surtidor
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
      INNER JOIN productos pr ON pv.productoid = pr.productoid
      LEFT JOIN pedido_surtido_detalle psd ON dp.detalleid = psd.detalle_id AND dp.pedidoid = psd.pedido_id
      WHERE dp.pedidoid = $1
        AND dp.detalleid = ANY($2::int[])
        AND dp.cantidadsurtida > 0
        AND dp.tenant_id = $3
    `;

    const productosResult = await client.query(productosQuery, [pedidoId, detalleIds, tenant_id]);

    if (productosResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No hay productos surtidos para confirmar. Inventarios debe marcar productos primero.'
      });
    }

    let productosConfirmados = 0;

    logger.info('ℹ️ [FINANZAS] Iniciando confirmación de surtido (stock ya descontado en surtirPedido):', {
      pedidoId,
      userId,
      tenant_id,
      userRole: ['finanzas', 'admin'],
      productosConStock: productosResult.rows.length
    });

    // ✅ NUEVO: Solo VALIDAR que el stock fue descuento en remisiones (NO descontar aquí)
    // El stock ya fue descuento cuando inventarios generó la remisión
    for (const item of productosResult.rows) {
      const varianteId = parseInt(item.varianteid);
      const piezasSurtidas = parseInt(item.cantidadsurtida || 0);
      const adminSurtidor = parseInt(item.admin_surtidor || 0);

      if (!adminSurtidor) {
        logger.warn('⚠️ No se encontró admin_surtidor para detalle:', {
          detalleId: item.detalleid,
          varianteId
        });
        continue;
      }

      logger.info('ℹ️ [FINANZAS] Validando producto (stock ya descuento):', {
        varianteId,
        piezasSurtidas,
        adminSurtidor,
        sku: item.sku,
        nombre: item.nombreproducto
      });

      try {
        // ✅ VALIDAR QUE EL STOCK EXISTE (confirma que inventarios lo descuento)
        const getStockQuery = `
          SELECT cantidad
          FROM stock_admin
          WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3
        `;
        const stockResult = await client.query(getStockQuery, [
          varianteId,
          adminSurtidor,
          tenant_id
        ]);

        if (stockResult.rows.length === 0) {
          throw new Error(
            `Stock no encontrado para variante ${varianteId}. Inventarios debe haber generado la remisión.`
          );
        }

        const stockActual = parseInt(stockResult.rows[0].cantidad || 0, 10);

        logger.info('✅ [FINANZAS] Stock validado (descuento anterior confirmado):', {
          varianteId,
          adminSurtidor,
          stockActual,
          piezasSurtidas
        });

        // ✅ NO DESCONTAR AQUÍ - ya fue descuento en remisiones
        productosConfirmados++;
      } catch (validationError) {
        await client.query('ROLLBACK');

        const nombre = (item.nombreproducto || 'Producto').toString().trim();
        const sku = (item.sku || '').toString().trim();
        const ref = sku ? `${nombre} (${sku})` : nombre;

        logger.error('❌ Error en validación de stock:', {
          error: validationError.message,
          varianteId,
          adminSurtidor,
          detalleId: item.detalleid
        });

        return res.status(400).json({
          success: false,
          message: `Error validando stock para ${ref}: ${validationError.message}`,
          sugerencia: 'Verifica que inventarios generó la remisión correctamente'
        });
      }
    }

    // ✅ ACTUALIZAR estado_producto A "Facturado" DESPUÉS DE CONFIRMAR STOCK EN FINANZAS
    for (const detalleId of detalleIds) {
      try {
        await client.query(
          `UPDATE detallesdelpedido
           SET estado_producto = 'Facturado'
           WHERE detalleid = $1 AND pedidoid = $2 AND tenant_id = $3`,
          [detalleId, pedidoId, tenant_id]
        );
      } catch (updateError) {
        logger.warn('⚠️ No se pudo actualizar estado_producto:', {
          detalleId,
          error: updateError.message
        });
      }
    }

    // Verificar estado de TODOS los productos del pedido
    // ⚠️ CRÍTICO: Solo considerar stock del admin del cliente, NO suma de todos
    const estadosQuery = `
      SELECT
        dp.detalleid,
        dp.varianteid,
        dp.piezastotales,
        dp.estado_producto,
        COALESCE(SUM(sa.cantidad), 0) as stock_total,
        COALESCE(SUM(sa.cantidad_reservada), 0) as stock_reservado,
        COALESCE(SUM(sa.cantidad), 0) as stock_disponible
      FROM detallesdelpedido dp
      LEFT JOIN stock_admin sa ON sa.variante_id = dp.varianteid AND sa.tenant_id = dp.tenant_id AND sa.admin_id = $3
      WHERE dp.pedidoid = $1
        AND dp.tenant_id = $2
      GROUP BY dp.detalleid, dp.varianteid, dp.piezastotales, dp.estado_producto
      ORDER BY dp.detalleid
    `;
    const estadosResult = await client.query(estadosQuery, [pedidoId, tenant_id, adminClienteId]);

    // Determinar nuevo estado del pedido
    // ✅ NUEVA LÓGICA: Calcular estado dinámicamente
    // Nota: 'Parcialmente Surtido' se calcula en lectura, no se guarda
    let nuevoEstatusPedido = 'Facturado'; // por defecto cuando finanzas confirma
    let completamenteSurtido = false;

    if (estadosResult.rows.length > 0) {
      // Contar productos por estado (guardado en BD)
      const facturados = estadosResult.rows.filter(p => p.estado_producto === 'Facturado').length;
      const surtidos = estadosResult.rows.filter(p => p.estado_producto === 'Surtido').length;
      const bajosPedido = estadosResult.rows.filter(p => p.estado_producto === 'Bajo pedido').length;
      const conStock = estadosResult.rows.filter(p => p.estado_producto === 'Con stock').length;
      const pendientes = estadosResult.rows.filter(p => p.estado_producto === 'Pendiente').length;
      const totalProductos = estadosResult.rows.length;

      logger.info('📊 [ESTADO] Analizando estado de productos después de confirmar', {
        pedidoId,
        facturados,
        surtidos,
        bajosPedido,
        conStock,
        pendientes,
        totalProductos,
        tenantId: tenant_id,
        detalles: estadosResult.rows.map(r => ({
          detalleid: r.detalleid,
          estado_producto: r.estado_producto,
          cantidadsurtida: r.cantidadsurtida,
          cantidadpaquetes: r.cantidadpaquetes
        }))
      });

      // ✅ LÓGICA DE ESTADO DEL PEDIDO en FINANZAS
      // PRIORIDAD: Si hay productos "Surtido", mantener "Listo para remisionar"
      if (surtidos > 0) {
        // 🔵 HAY PRODUCTOS SURTIDOS ESPERANDO CONFIRMACIÓN → Mantener "Listo para remisionar"
        nuevoEstatusPedido = 'Listo para remisionar';
        completamenteSurtido = false;
        logger.info('🔵 Estado: Listo para remisionar (hay productos surtidos pendientes de confirmación)', {
          pedidoId,
          surtidos,
          facturados,
          bajosPedido,
          conStock
        });
      } else if (facturados === totalProductos && facturados > 0) {
        // ✅ TODOS FACTURADOS (completamente surtidos y confirmados por finanzas)
        nuevoEstatusPedido = 'Surtido';
        completamenteSurtido = true;
        logger.info('✅ Estado: Surtido (TODOS los productos confirmados por finanzas)', { pedidoId });
      } else if (facturados > 0 && (bajosPedido > 0 || conStock > 0)) {
        // ⚠️ COMBINADO: Hay algunos facturados pero otros en bajo pedido o con stock
        nuevoEstatusPedido = 'Combinado';
        completamenteSurtido = false;
        logger.info('🟠 Estado: Combinado (algunos confirmados, otros con stock/bajo pedido)', {
          pedidoId,
          facturados,
          bajosPedido,
          conStock
        });
      } else if (conStock === totalProductos && facturados === 0) {
        // 🟢 CON STOCK: Todos con stock pero no surtidos
        nuevoEstatusPedido = 'Con stock';
        completamenteSurtido = false;
        logger.info('🟢 Estado: Con stock (disponible pero no procesado)', { pedidoId });
      } else if (bajosPedido === totalProductos && facturados === 0) {
        // 🔴 BAJO PEDIDO: Todos sin stock
        nuevoEstatusPedido = 'Bajo pedido';
        completamenteSurtido = false;
        logger.info('🔴 Estado: Bajo pedido (sin stock disponible)', { pedidoId });
      } else {
        // Fallback: estado indeterminado → Combinado
        nuevoEstatusPedido = 'Combinado';
        completamenteSurtido = false;
        logger.warn('⚠️ Estado: Combinado (estado indeterminado - mezcla confusa)', {
          pedidoId,
          facturados,
          surtidos,
          bajosPedido,
          conStock
        });
      }
    }

    // Actualizar pedido con el nuevo estado
    const updateQuery = `
      UPDATE pedidos
      SET
        estatus = $3,
        completamente_surtido = $4,
        fecha_confirmacion = NOW()
      WHERE pedidoid = $1 AND tenant_id = $2
      RETURNING pedidoid, estatus, completamente_surtido
    `;

    const updateResult = await client.query(updateQuery, [pedidoId, tenant_id, nuevoEstatusPedido, completamenteSurtido]);

    if (!updateResult.rows || updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      logger.error('❌ [ERROR] El UPDATE del estado del pedido no retornó filas', {
        pedidoId,
        nuevoEstatusPedido,
        tenantId: tenant_id
      });
      return res.status(500).json({
        success: false,
        message: 'Error: No se pudo actualizar el estado del pedido'
      });
    }

    await client.query('COMMIT');

    // Obtener datos actualizados del pedido y productos después de la confirmación
    const pedidoActualizadoQuery = `
      SELECT p.pedidoid, p.estatus, p.completamente_surtido
      FROM pedidos p
      WHERE p.pedidoid = $1 AND p.tenant_id = $2
    `;
    const pedidoActualizadoResult = await client.query(pedidoActualizadoQuery, [pedidoId, tenant_id]);

    const productosActualizadosQuery = `
      SELECT
        dp.detalleid,
        dp.cantidadsurtida,
        dp.cantidadpaquetes,
        dp.piezastotales,
        dp.estado_producto
      FROM detallesdelpedido dp
      WHERE dp.pedidoid = $1 AND dp.tenant_id = $2
    `;
    const productosActualizadosResult = await client.query(productosActualizadosQuery, [pedidoId, tenant_id]);

    // Initialize missing variables
    const totalProductosSurtidos = productosActualizadosResult.rows.length;
    const todoConfirmado = completamenteSurtido;

    logger.info('✅ Pedido confirmado por Finanzas - Estado actualizado:', {
      pedidoId,
      productosConfirmados,
      totalProductosSurtidos,
      nuevoEstatusPedido,
      todoConfirmado,
      completamenteSurtido,
      tenantId: tenant_id,
      userId,
      requestId: req.requestId
    });

    res.json({
      success: true,
      message: `✅ ${productosConfirmados} producto(s) confirmado(s) exitosamente. Pedido actualizado a estado: "${nuevoEstatusPedido}".`,
      data: {
        pedidoId,
        estatusPedido: nuevoEstatusPedido,
        productosConfirmados,
        totalProductosSurtidos,
        completamenteSurtido,
        pedidoActualizado: pedidoActualizadoResult.rows[0] || {},
        productosActualizados: productosActualizadosResult.rows || []
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error al confirmar surtido:', {
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al confirmar el surtido',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

module.exports = {
  confirmarSurtidoFinanzas
};
