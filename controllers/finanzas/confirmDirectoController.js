/**
 * CONFIRMAR DIRECTO CONTROLLER - Admin Único Workflow
 *
 * Flujo simplificado para sistemas con UN SOLO ADMIN (sin roles empresariales)
 * Combina en UNO: Marcar → Descuento → Facturación
 *
 * @module controllers/finanzas/confirmDirectoController
 * @author RazoConnect Team
 * @date 2026-04-13
 */

const db = require('../../db');
const logger = require('../../utils/logger');
const SmartStockService = require('../../services/SmartStockService');

/**
 * Confirmar producto directamente (Marcar + Descuento + Facturación en UN PASO)
 *
 * SOLO PARA ADMIN ÚNICO (sin roles empresariales)
 *
 * Flujo:
 * 1. Valida FIFO
 * 2. Marca como 'Surtido'
 * 3. Descuenta stock INMEDIATAMENTE
 * 4. Cambia a 'Facturado'
 *
 * POST /api/admin/pedidos/:id/confirmar-directo
 * Body: { detalleIds: [1, 2, 3] }
 */
const confirmarDirecto = async (req, res) => {
  const client = await db.getClient();

  try {
    const { id: pedidoId } = req.params;
    const { detalleIds } = req.body;
    const { tenant_id } = req.tenant;
    const userId = req.user?.id || req.user?.adminid;

    // VALIDACIÓN
    if (!detalleIds || !Array.isArray(detalleIds) || detalleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debes seleccionar al menos un producto para confirmar.'
      });
    }

    await client.query('BEGIN');

    // STEP 1: Obtener información del pedido
    const pedidoQuery = `
      SELECT p.pedidoid, p.clienteid, p.admin_asignado_id, p.fechapedido, p.estatus
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
    const estadosHelper = require('../../utils/estadosHelper');
    const adminClienteId = await estadosHelper.getAdminByClienteEstado(pedido.clienteid, tenant_id);

    // STEP 2: Obtener detalles de productos seleccionados
    const detallesQuery = `
      SELECT
        dp.detalleid,
        dp.varianteid,
        dp.piezastotales,
        dp.cantidadsurtida,
        dp.estado_producto,
        pv.sku,
        pr.nombreproducto
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
      INNER JOIN productos pr ON pv.productoid = pr.productoid
      WHERE dp.pedidoid = $1
        AND dp.detalleid = ANY($2::int[])
        AND dp.tenant_id = $3
    `;

    const detallesResult = await client.query(detallesQuery, [pedidoId, detalleIds, tenant_id]);

    if (detallesResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No se encontraron productos para confirmar'
      });
    }

    // STEP 3: Validar FIFO y clasificar productos
    const productosCompletos = [];
    const productosParciales = [];

    for (const p of detallesResult.rows) {
      const piezasRequeridas = p.piezastotales;

      try {
        const allocationStatus = await SmartStockService.calculateAllocationStatus({
          varianteId: p.varianteid,
          cantidadRequerida: piezasRequeridas,
          orderDate: pedido.fechapedido,
          adminId: pedido.admin_asignado_id,
          tenantId: tenant_id,
          pedidoId: pedidoId,
          piezasPorPaquete: 1
        });

        if (allocationStatus.estatus === 'surtido' && allocationStatus.cantidadSurtible >= piezasRequeridas) {
          productosCompletos.push(p);
        } else if (allocationStatus.cantidadSurtible > 0) {
          productosParciales.push({
            ...p,
            piezasParaSurtir: allocationStatus.cantidadSurtible
          });
        }
      } catch (err) {
        logger.error('Error al calcular FIFO:', {
          detalleId: p.detalleid,
          varianteId: p.varianteid,
          error: err.message
        });
      }
    }

    if (productosCompletos.length === 0 && productosParciales.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Ninguno de los productos tiene stock disponible (validación FIFO)'
      });
    }

    let productosConfirmados = 0;

    logger.info('🟢 [DIRECTO] STEP 3: Marcando + Descendiendo + Facturando productos...', {
      pedidoId,
      admin_cliente: adminClienteId,
      completos: productosCompletos.length,
      parciales: productosParciales.length
    });

    // STEP 4: MARCAR como Surtido (completos)
    if (productosCompletos.length > 0) {
      const detalleIdsCompletos = productosCompletos.map(p => p.detalleid);

      await client.query(
        `UPDATE detallesdelpedido
         SET cantidadsurtida = piezastotales,
             estado_producto = 'Surtido'
         WHERE pedidoid = $1
           AND detalleid = ANY($2::int[])
           AND tenant_id = $3
           AND cantidadsurtida = 0`,
        [pedidoId, detalleIdsCompletos, tenant_id]
      );
    }

    // STEP 5: MARCAR como Surtido (parciales)
    if (productosParciales.length > 0) {
      for (const parcial of productosParciales) {
        await client.query(
          `UPDATE detallesdelpedido
           SET cantidadsurtida = $1,
               estado_producto = 'Surtido'
           WHERE pedidoid = $2
             AND detalleid = $3
             AND tenant_id = $4
             AND cantidadsurtida = 0`,
          [parcial.piezasParaSurtir, pedidoId, parcial.detalleid, tenant_id]
        );
      }
    }

    // STEP 6: DESCONTAR STOCK para todos los productos marcados
    const productosMarcados = [...productosCompletos, ...productosParciales];

    for (const producto of productosMarcados) {
      const piezasDescontar = producto.piezasParaSurtir || producto.piezastotales;

      try {
        // Obtener stock actual
        const stockActualResult = await client.query(
          `SELECT cantidad FROM stock_admin
           WHERE variante_id = $1 AND admin_id = $2 AND tenant_id = $3`,
          [producto.varianteid, adminClienteId, tenant_id]
        );

        if (stockActualResult.rows.length === 0) {
          throw new Error(
            `Stock no encontrado para variante ${producto.varianteid}`
          );
        }

        const stockPrevio = parseInt(stockActualResult.rows[0].cantidad || 0, 10);

        // Validar que hay stock
        if (stockPrevio < piezasDescontar) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Stock insuficiente para ${producto.nombreproducto}. Disponible: ${stockPrevio}, Requerido: ${piezasDescontar}`
          });
        }

        // Descontar
        const updateStockResult = await client.query(
          `UPDATE stock_admin
           SET cantidad = cantidad - $1
           WHERE variante_id = $2 AND admin_id = $3 AND tenant_id = $4
           RETURNING cantidad`,
          [piezasDescontar, producto.varianteid, adminClienteId, tenant_id]
        );

        const nuevoStock = updateStockResult.rows[0].cantidad;

        // Registrar movimiento
        await client.query(
          `INSERT INTO movimientos_inventario
           (admin_id, variante_id, tenant_id, tipo, cantidad, stock_previo, stock_posterior, motivo, observaciones)
           VALUES ($1, $2, $3, 'SURTIMIENTO', $4, $5, $6, $7, $8)`,
          [
            adminClienteId,
            producto.varianteid,
            tenant_id,
            piezasDescontar,
            stockPrevio,
            nuevoStock,
            'Confirmación Directa - Admin Único',
            `Pedido #${pedidoId} - Confirmar Directo`
          ]
        );

        logger.info('✅ Stock descuento (directo):', {
          sku: producto.sku,
          producto: producto.nombreproducto,
          piezasDescontar,
          stockPrevio,
          nuevoStock
        });

        productosConfirmados++;
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('❌ Error al descontar stock:', {
          error: err.message,
          varianteid: producto.varianteid
        });
        return res.status(400).json({
          success: false,
          message: `Error al descontar stock: ${err.message}`
        });
      }
    }

    // STEP 7: CAMBIAR ESTADO A FACTURADO (para todos confirmados)
    const productosAFacturar = productosMarcados.map(p => p.detalleid);

    await client.query(
      `UPDATE detallesdelpedido
       SET estado_producto = 'Facturado'
       WHERE pedidoid = $1
         AND detalleid = ANY($2::int[])
         AND tenant_id = $3`,
      [pedidoId, productosAFacturar, tenant_id]
    );

    // STEP 8: Actualizar estado del PEDIDO
    const estadosResult = await client.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN estado_producto = 'Facturado' THEN 1 ELSE 0 END) as facturados
       FROM detallesdelpedido
       WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenant_id]
    );

    const { total, facturados } = estadosResult.rows[0];
    let nuevoEstatusPedido = 'Surtido';

    if (parseInt(facturados) < parseInt(total)) {
      nuevoEstatusPedido = 'Combinado'; // Algunos facturados, otros no
    }

    await client.query(
      `UPDATE pedidos
       SET estatus = $1,
           completamente_surtido = $2,
           fecha_confirmacion = NOW()
       WHERE pedidoid = $3 AND tenant_id = $4`,
      [nuevoEstatusPedido, parseInt(facturados) === parseInt(total), pedidoId, tenant_id]
    );

    await client.query('COMMIT');

    logger.info('✅ Confirmación Directa completada:', {
      pedidoId,
      productosConfirmados,
      nuevoEstatusPedido,
      userId,
      tenant_id
    });

    res.json({
      success: true,
      message: `✅ ${productosConfirmados} producto(s) confirmado(s) directamente. Estado: "${nuevoEstatusPedido}". Stock descuento + Facturado.`,
      data: {
        pedidoId,
        productosConfirmados,
        nuevoEstatusPedido,
        metodo: 'Confirmar Directo (Admin Único)'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ Error en Confirmar Directo:', {
      error: error.message,
      stack: error.stack,
      pedidoId: req.params.id,
      tenant_id: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: 'Error al confirmar directamente',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

module.exports = {
  confirmarDirecto
};
