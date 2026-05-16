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
const { calcularEstadoPedidoCorrect } = require('../../utils/pedidoStatus');
// const EstadosPedidoService = require('../../services/EstadosPedidoService'); // DESACTIVADO TEMPORALMENTE

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

    // === Monto a confirmar: solo productos en estado 'Surtido' (idempotencia) ===
    let montoConfirmado = 0;
    if (pedido.es_credito) {
      const { rows: [precioRow] } = await client.query(
        `SELECT COALESCE(SUM(dp.preciounitario * dp.cantidadsurtida), 0) AS monto_confirmado
         FROM detallesdelpedido dp
         WHERE dp.pedidoid = $1
           AND dp.detalleid = ANY($2::int[])
           AND dp.estado_producto = 'Surtido'
           AND dp.cantidadsurtida > 0
           AND dp.tenant_id = $3`,
        [pedidoId, detalleIds, tenant_id]
      );
      montoConfirmado = parseFloat(precioRow?.monto_confirmado || 0);
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

    // Actualizar estado del pedido usando cálculo directo
    const nuevoEstatusPedido = await calcularEstadoPedidoCorrect(client, pedidoId);

    // Determinar si está completamente surtido
    const estadosQuery = `
      SELECT COUNT(*) as total,
             SUM(CASE WHEN LOWER(estado_producto) = 'facturado' THEN 1 ELSE 0 END) as facturados
      FROM detallesdelpedido
      WHERE pedidoid = $1 AND tenant_id = $2
    `;
    const estadosResult = await client.query(estadosQuery, [pedidoId, tenant_id]);
    const completamenteSurtido = estadosResult.rows[0].total === estadosResult.rows[0].facturados && estadosResult.rows[0].total > 0;

    // Actualizar pedido con nuevo estado
    await client.query(
      `UPDATE pedidos 
       SET estatus = $1, 
           completamente_surtido = $2, 
           fecha_confirmacion = NOW() 
       WHERE pedidoid = $3 AND tenant_id = $4`,
      [nuevoEstatusPedido, completamenteSurtido, pedidoId, tenant_id]
    );

    logger.info('✅ Estado del pedido actualizado por finanzas', {
      pedidoId,
      nuevoEstatusPedido,
      completamenteSurtido,
      tenantId: tenant_id
    });

    // === CXC GENERATION: Cargo para pedidos a crédito ===
    if (pedido.es_credito && montoConfirmado > 0) {
      const { rows: [creditoInfo] } = await client.query(
        `SELECT credito_id, saldo_deudor
         FROM cliente_creditos
         WHERE cliente_id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [pedido.clienteid, tenant_id]
      );

      if (creditoInfo) {
        const saldoActual = parseFloat(creditoInfo.saldo_deudor || 0);

        await client.query(
          `INSERT INTO credito_movimientos
             (credito_id, tipo_movimiento, monto, referencia_id, descripcion,
              saldo_despues_movimiento, tenant_id, pedido_id, admin_id)
           VALUES ($1, 'AJUSTE', $2, $3, $4, $5, $6, $7, $8)`,
          [
            creditoInfo.credito_id,
            (-montoConfirmado).toFixed(2),
            `PED-${pedidoId}`,
            `Lib. reserva parcial - Pedido #${pedidoId} (${productosConfirmados} prods. facturados)`,
            (saldoActual - montoConfirmado).toFixed(2),
            tenant_id, pedidoId, userId
          ]
        );

        await client.query(
          `INSERT INTO credito_movimientos
             (credito_id, tipo_movimiento, monto, referencia_id, descripcion,
              saldo_despues_movimiento, tenant_id, pedido_id, admin_id)
           VALUES ($1, 'CARGO', $2, $3, $4, $5, $6, $7, $8)`,
          [
            creditoInfo.credito_id,
            montoConfirmado.toFixed(2),
            `PED-${pedidoId}`,
            `Cargo confirmado finanzas - Pedido #${pedidoId} (${productosConfirmados} prods.)`,
            saldoActual.toFixed(2),
            tenant_id, pedidoId, userId
          ]
        );

        await client.query(
          `INSERT INTO cuentas_por_cobrar
             (pedido_id, cliente_id, remision_id, tipo_movimiento, monto, descripcion, tenant_id, admin_id)
           VALUES ($1, $2, NULL, 'CARGO', $3, $4, $5, $6)`,
          [
            pedidoId,
            pedido.clienteid,
            montoConfirmado.toFixed(2),
            `Facturado por finanzas - Pedido #${pedidoId}`,
            tenant_id, userId
          ]
        );

        logger.info('✅ [CXC] Cargo generado por confirmación de finanzas', {
          pedidoId, clienteId: pedido.clienteid,
          montoConfirmado, productosConfirmados, tenantId: tenant_id
        });
      }
    }
    // === FIN CXC GENERATION ===

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
