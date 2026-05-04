/**
 * MARKING CONTROLLER - Marcar Productos como Surtidos
 *
 * Extraído de pedidosAdminController.js como parte del refactoring.
 * Responsabilidad: Validar stock con FIFO y marcar productos como surtidos
 *
 * @module controllers/inventarios/markingController
 * @author RazoConnect Team
 * @date 2026-04-10
 */

const db = require('../../db');
const logger = require('../../utils/logger');
const SmartStockService = require('../../services/SmartStockService');

/**
 * Validar stock con FIFO y marcar productos seleccionados como surtidos
 *
 * Lógica:
 * - Recibe detalleIds de productos a marcar
 * - Por cada producto, calcula si se puede surtir respetando pedidos anteriores (FIFO)
 * - Clasifica en: COMPLETOS (todo lo requerido), PARCIALES (algo), BACKORDER (nada)
 * - Actualiza detallesdelpedido con estado_producto = 'Surtido' y cantidadsurtida
 *
 * ⚠️ IMPORTANTE: Esta función NO hace BEGIN/COMMIT. El caller debe manejar la transacción.
 *
 * @param {Object} params
 * @param {number} params.pedidoId - ID del pedido
 * @param {Array} params.detalleIds - Array de detalle IDs a marcar
 * @param {Object} params.pedido - Objeto pedido con admin_asignado_id
 * @param {number} params.tenant_id - ID del tenant
 * @param {number} params.userId - ID del usuario
 * @param {number} params.adminIdUser - ID del admin responsable
 * @param {Object} params.client - Client de BD (para transacción - REQUERIDO)
 * @returns {Promise<Object>} { success, marcarResult, productosCompletos, productosParciales, error? }
 */
async function validarYMarcarProductos({
  pedidoId,
  detalleIds,
  pedido,
  tenant_id,
  userId,
  adminIdUser,
  client
}) {
  try {
    logger.info('Intentando marcar productos como surtidos:', {
      pedidoId,
      detalleIds,
      cantidadSeleccionados: detalleIds.length,
      tenantId: tenant_id
    });

    if (!client) {
      throw new Error('Client de BD es requerido para validarYMarcarProductos');
    }

    // STEP 1: Get detailed info about products and their stock
    // Single query to check what we need to mark
    const detalleProductosQuery = `
      SELECT
        dp.detalleid,
        dp.varianteid,
        dp.cantidadsurtida,
        dp.cantidadpaquetes,
        dp.piezastotales,
        dp.esbackorder,
        dp.estado_producto,
        pv.stock as stock_pv,
        p.nombreproducto,
        COALESCE(sa.cantidad, 0) as stock_sa,
        COALESCE(sa.cantidad_reservada, 0) as stock_reservado
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid AND pv.tenant_id = $3
      INNER JOIN productos p ON pv.productoid = p.productoid AND p.tenant_id = $3
      LEFT JOIN stock_admin sa ON sa.variante_id = dp.varianteid AND sa.tenant_id = $3 AND sa.admin_id = $4
      WHERE dp.pedidoid = $1
        AND dp.detalleid = ANY($2::int[])
        AND dp.tenant_id = $3
    `;

    const detalleProductos = await client.query(detalleProductosQuery, [pedidoId, detalleIds, tenant_id, adminIdUser]);

    // STEP 2: Clasificar productos en COMPLETOS, PARCIALES, o SIN STOCK
    // ✅ NUEVO: Usar FIFO (calculateAllocationStatus) para validar stock respetando deuda de pedidos anteriores
    // ⚠️ IMPORTANTE: cantidadsurtida se guarda en PIEZAS (no paquetes) para consistencia con finanzas
    const productosCompletos = [];
    const productosParciales = [];
    const productosAlcanza = []; // Para logging

    for (const p of detalleProductos.rows) {
      const piezasRequeridas = p.piezastotales;

      try {
        // FIFO: Calcular si se puede surtir este producto respetando pedidos anteriores
        const allocationStatus = await SmartStockService.calculateAllocationStatus({
          varianteId: p.varianteid,
          cantidadRequerida: piezasRequeridas,
          orderDate: pedido.fechapedido,
          adminId: pedido.admin_asignado_id,
          tenantId: tenant_id,
          pedidoId: pedidoId,
          piezasPorPaquete: 1,  // Ya trabajamos en piezas
          isAdminPanel: true  // Panel admin: NO restar cantidad_reservada
        });

        productosAlcanza.push({
          detalleid: p.detalleid,
          producto: p.nombreproducto,
          requeridas: piezasRequeridas,
          status: allocationStatus
        });

        // Clasificar basado en FIFO result
        if (allocationStatus.estatus === 'surtido' && allocationStatus.cantidadSurtible >= piezasRequeridas) {
          // ✅ COMPLETO: FIFO permite surtir TODO lo requerido
          productosCompletos.push(p);
        } else if (allocationStatus.cantidadSurtible > 0) {
          // ⚠️ PARCIAL: FIFO permite surtir ALGO pero no todo (respetando deuda previa)
          productosParciales.push({
            ...p,
            piezasParaSurtir: allocationStatus.cantidadSurtible,
            fifoInfo: {
              deudaPrevia: allocationStatus.deudaPrevia,
              stockFisico: allocationStatus.stockFisico,
              cantidadBackorder: allocationStatus.cantidadBackorder,
              numPedidosAnteriores: allocationStatus.numPedidosAnteriores
            }
          });
        }
        // estatus 'backorder' = 0 surtible → no se agrega a ninguna lista

      } catch (err) {
        logger.error('Error al calcular FIFO para producto:', {
          detalleId: p.detalleid,
          varianteId: p.varianteid,
          error: err.message
        });
        // En caso de error, asumir no surtible para ser conservador
      }
    }

    logger.info('🔄 FIFO Allocation Analysis:', {
      pedidoId,
      admin_asignado_id: pedido.admin_asignado_id,
      totalProductosSeleccionados: detalleProductos.rows.length,
      completosFIFO: productosCompletos.length,
      parcialesFIFO: productosParciales.length,
      detalles: productosAlcanza
    });

    if (productosCompletos.length === 0 && productosParciales.length === 0) {
      // Extraer información de deuda para mensaje informativo
      const deudaInfo = productosAlcanza
        .filter(p => p.status?.deudaPrevia > 0)
        .map(p => ({
          producto: p.producto,
          deudaPrevia: p.status.deudaPrevia,
          pedidosAnteriores: p.status.numPedidosAnteriores
        }));

      // Retornar los IDs que son FIFO-backorder para que el caller los actualice
      // a 'Bajo pedido' DESPUÉS del ROLLBACK (en una operación separada)
      const idsParaMarcarBajoPedido = detalleProductos.rows.map(p => p.detalleid);

      return {
        success: false,
        marcarResult: { rowCount: 0 },
        message: 'Ninguno de los productos seleccionados tiene stock disponible (validación FIFO)',
        razon: deudaInfo.length > 0
          ? 'Stock reservado para pedidos anteriores. El FIFO impide overselling.'
          : 'Stock insuficiente en inventario.',
        detalles_fifo: deudaInfo,
        idsParaMarcarBajoPedido,
        analisis: {
          totalSeleccionados: detalleProductos.rows.length,
          completosSin_Deuda: productosCompletos.length,
          parcialesCon_Reserva: productosParciales.length,
          mensaje_auxiliar: 'Revisa pedidos anteriores que aún no están entregados - tienen prioridad FIFO'
        }
      };
    }

    // STEP 3: Marcar productos con estado COMPLETO o PARCIAL
    let marcarResult = { rowCount: 0 };

    // SUBCASO 3A: Marcar COMPLETOS como 'Surtido' (cantidadsurtida = piezastotales en piezas)
    // ✅ PROTECCIÓN: Solo actualizar si cantidadsurtida = 0 (evita doble surtido)
    if (productosCompletos.length > 0) {
      const detalleIdsCompletos = productosCompletos.map(p => p.detalleid);

      const marcarCompletosQuery = `
        UPDATE detallesdelpedido
        SET cantidadsurtida = piezastotales,
            estado_producto = 'Surtido'
        WHERE pedidoid = $1
          AND detalleid = ANY($2::int[])
          AND tenant_id = $3
          AND cantidadsurtida = 0
        RETURNING detalleid, cantidadsurtida, cantidadpaquetes, estado_producto
      `;

      const resultCompletos = await client.query(marcarCompletosQuery, [pedidoId, detalleIdsCompletos, tenant_id]);
      marcarResult.rowCount += resultCompletos.rowCount;
    }

    // SUBCASO 3B: Marcar PARCIALES (cantidadsurtida = piezasParaSurtir en piezas)
    // ✅ IMPORTANTE: Guardar estado 'Surtido' para cualquier cantidad > 0
    // La diferencia entre completo vs parcial está en cantidadsurtida, NO en estado_producto
    // Si piezasParaSurtir > 0 (sea completo o parcial) → 'Surtido'
    // Si piezasParaSurtir = 0 → 'Bajo pedido' (no se marca)
    // ✅ PROTECCIÓN: Solo actualizar si cantidadsurtida = 0 (evita doble surtido)
    if (productosParciales.length > 0) {
      // Construir batch query para todos los PARCIALES
      let parcialesCaseStatement = '';
      const parcialesParams = [pedidoId, tenant_id];

      for (let i = 0; i < productosParciales.length; i++) {
        const parcial = productosParciales[i];
        const detailIdParam = parcialesParams.length + 1;
        const cantidadParam = parcialesParams.length + 2;

        parcialesParams.push(parcial.detalleid, parcial.piezasParaSurtir);

        parcialesCaseStatement += `
          WHEN detalleid = $${detailIdParam} THEN $${cantidadParam}
        `;
      }

      const marcarParcialesQuery = `
        UPDATE detallesdelpedido
        SET cantidadsurtida = CASE
          ${parcialesCaseStatement}
          ELSE cantidadsurtida
        END,
            estado_producto = 'Surtido'
        WHERE pedidoid = $1
          AND tenant_id = $2
          AND detalleid = ANY(ARRAY[${productosParciales.map((_, i) => `$${3 + i * 2}`).join(', ')}]::int[])
          AND cantidadsurtida = 0
        RETURNING detalleid, cantidadsurtida, cantidadpaquetes, estado_producto
      `;

      try {
        const resultParciales = await client.query(marcarParcialesQuery, parcialesParams);
        marcarResult.rowCount += resultParciales.rowCount;
      } catch (err) {
        logger.error('Error al marcar productos parciales (batch):', {
          error: err.message,
          pedidoId
        });
        // Si falla el batch, intentar uno a uno como fallback
        for (const parcial of productosParciales) {
          try {
            const estadoProducto = 'Surtido';
            await client.query(
              `UPDATE detallesdelpedido
               SET cantidadsurtida = $1,
                   estado_producto = $2
               WHERE pedidoid = $3
                 AND detalleid = $4
                 AND tenant_id = $5
                 AND cantidadsurtida = 0`,
              [parcial.piezasParaSurtir, estadoProducto, pedidoId, parcial.detalleid, tenant_id]
            );
            marcarResult.rowCount++;
          } catch (innerErr) {
            logger.warn('Error al marcar producto parcial (fallback individual):', {
              detalleId: parcial.detalleid,
              error: innerErr.message
            });
          }
        }
      }
    }

    logger.info('✅ Productos marcados (COMPLETOS + PARCIALES con FIFO):', {
      pedidoId,
      admin_asignado_id: pedido.admin_asignado_id,
      completos: productosCompletos.length,
      parciales: productosParciales.length,
      totalMarcados: marcarResult.rowCount,
      detalles: {
        completosConStock: productosCompletos.map(p => ({ detalleid: p.detalleid, piezastotales: p.piezastotales })),
        parcialesConStock: productosParciales.map(p => ({
          detalleid: p.detalleid,
          piezasParaSurtir: p.piezasParaSurtir,
          piezastotales: p.piezastotales,
          fifo_deudaPrevia: p.fifoInfo?.deudaPrevia,
          fifo_pedidosAnteriores: p.fifoInfo?.numPedidosAnteriores,
          fifo_cantidadBackorder: p.fifoInfo?.cantidadBackorder
        }))
      },
      tenantId: tenant_id
    });

    // STEP 4: Reclasificar items FIFO-backorder de 'Con stock' → 'Bajo pedido'
    // Son los items seleccionados que FIFO determinó con cantidadSurtible=0
    // Sin este paso el pedido queda atascado en 'Combinado' porque el cálculo
    // de estatus sigue viendo items 'Con stock' sin procesar.
    const idsCompletosSet = new Set(productosCompletos.map(p => p.detalleid));
    const idsParcialesSet = new Set(productosParciales.map(p => p.detalleid));
    const idsBackorder = detalleProductos.rows
      .filter(p => !idsCompletosSet.has(p.detalleid) && !idsParcialesSet.has(p.detalleid))
      .map(p => p.detalleid);

    if (idsBackorder.length > 0) {
      await client.query(
        `UPDATE detallesdelpedido
         SET estado_producto = 'Bajo pedido'
         WHERE pedidoid = $1
           AND detalleid = ANY($2::int[])
           AND tenant_id = $3
           AND cantidadsurtida = 0`,
        [pedidoId, idsBackorder, tenant_id]
      );
      logger.info('📦 Items reclasificados a Bajo pedido (FIFO sin stock disponible):', {
        pedidoId,
        count: idsBackorder.length,
        idsBackorder,
        tenantId: tenant_id
      });
    }

    return {
      success: true,
      marcarResult,
      productosCompletos,
      productosParciales,
      productosAlcanza
    };

  } catch (error) {
    logger.error('Error en validarYMarcarProductos:', {
      error: error.message,
      stack: error.stack,
      pedidoId
    });
    return {
      success: false,
      marcarResult: { rowCount: 0 },
      message: 'Error al validar y marcar productos',
      error: error.message
    };
  }
}

module.exports = {
  validarYMarcarProductos
};
