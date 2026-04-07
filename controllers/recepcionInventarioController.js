/**
 * RECEPCIÓN DE INVENTARIO CONTROLLER
 * 
 * Controlador especializado para la recepción de inventario de órdenes de compra.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * CARACTERÍSTICAS:
 * - Transacciones atómicas con rollback automático
 * - Actualización de múltiples tablas sincronizada
 * - Registro en Kardex automático
 * - Detección de discrepancias con alertas
 * - Asignación de stock al admin correcto (multi-tenant)
 * 
 * GARANTÍAS:
 * - Si falla actualización de stock → ROLLBACK (orden no se actualiza)
 * - Si falla registro en kardex → ROLLBACK (stock no se modifica)
 * - Si falla actualización de estatus → ROLLBACK (todo se revierte)
 * 
 * @module controllers/recepcionInventarioController
 * @author RazoConnect Team
 * @date 2026-02-26
 */

const db = require('../db');
const logger = require('../utils/logger');
const { executeTransaction, createValidator } = require('../utils/transactionManager');
const kardexService = require('../services/kardexService');
const auditService = require('../services/auditService');

/**
 * Helper: Crear/Actualizar cuenta por pagar para orden de compra
 */
async function upsertCuentaPorPagarForOC(client, ordenCompraId, usuarioId) {
  try {
    const result = await client.query(
      `INSERT INTO cuentas_por_pagar (orden_compra_id, usuario_id, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (orden_compra_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [ordenCompraId, usuarioId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.warn('⚠️ [CXP] Error al crear cuenta por pagar:', error.message);
    return null;
  }
}

/**
 * Helper: Notificar a super admins sobre discrepancias
 */
async function notifySuperAdmins(client, { titulo, mensaje, url, metadata, tenant_id }) {
  try {
    const superAdmins = await client.query(
      `SELECT adminid FROM administradores WHERE rol = 'superadmin' AND activo = true AND tenant_id = $1`,
      [tenant_id]
    );

    for (const admin of superAdmins.rows) {
      await client.query(
        `INSERT INTO notificaciones (admin_id, titulo, mensaje, url, metadata, created_at, tenant_id)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
        [admin.adminid, titulo, mensaje, url, JSON.stringify(metadata), tenant_id]
      );
    }
  } catch (error) {
    console.warn('⚠️ [NOTIF] Error al notificar super admins:', error.message);
  }
}

/**
 * Recibir inventario de una orden de compra con transacciones atómicas
 * 
 * @route POST /api/admin/ordenes-compra/recibir
 * @param {Object} req.body.ordenCompraId - ID de la orden de compra
 * @param {Array} req.body.productos - Array de productos recibidos
 * @param {Object} req.body.adminId - ID del admin (opcional)
 * @param {Array} req.body.discrepancias - Array de discrepancias detectadas
 */
const recibirInventario = async (req, res) => {
  try {
    const { ordenCompraId, productos, adminId, discrepancias } = req.body;
    const usuarioRecibeId = Number.parseInt(req?.user?.id ?? req?.user?.userId, 10);
    const userRole = req.user.rol;
    const userId = req.user.id;
    const { tenant_id } = req.tenant;

    // ========================================
    // PROCESAMIENTO DE DATOS
    // ========================================

    const discrepanciasArray = Array.isArray(discrepancias) ? discrepancias : [];
    const discrepanciasByDetalle = new Map(
      discrepanciasArray
        .map((d) => {
          const detalleId = Number.parseInt(d?.detalleId, 10);
          if (!Number.isInteger(detalleId) || detalleId <= 0) return null;
          return [detalleId, d];
        })
        .filter(Boolean)
    );

    // ========================================
    // TRANSACCIÓN ATÓMICA
    // ========================================

    const result = await executeTransaction(async (client, logger) => {
      logger.logOperation('INICIO_RECEPCION', { ordenCompraId, productosCount: productos.length });

      // Verificar que la orden existe y validar propiedad
      let ordenCheckQuery = "SELECT OrdenCompraID, Estatus, usuario_creador_id, admin_creador_id FROM OrdenesDeCompra WHERE OrdenCompraID = $1 AND tenant_id = $2";
      let ordenCheckParams = [ordenCompraId, tenant_id];

      // REGLA DE VISIBILIDAD: Admin solo puede recibir inventario de sus propias órdenes
      if (userRole === 'admin') {
        ordenCheckQuery += " AND admin_creador_id = $3";
        ordenCheckParams.push(userId);
      }

      const ordenCheck = await client.query(ordenCheckQuery, ordenCheckParams);

      if (ordenCheck.rows.length === 0) {
        throw new Error("Orden de compra no encontrada o no tienes permiso para recibir inventario de esta orden");
      }

      const estatusAnterior = (ordenCheck.rows[0].estatus || "").toString();
      const adminCreadorId = ordenCheck.rows[0].admin_creador_id;
      const productosActualizados = [];
      const alertasSeguridad = [];

      logger.logOperation('ORDEN_VERIFICADA', { ordenCompraId, estatusAnterior, adminCreadorId });

      // Procesar cada producto
      for (const producto of productos) {
        const cantidadRecibida = parseInt(producto.cantidadRecibidaAhora, 10);

        if (cantidadRecibida === 0) {
          continue;
        }

        // Obtener información del detalle
        const detalleQuery = `
          SELECT 
            doc.DetalleOC_ID,
            doc.VarianteID,
            doc.CantidadSolicitada,
            doc.CantidadRecibida,
            doc.PiezasPorPaquete,
            pv.ProductoID,
            pv.SKU,
            pv.Dimensiones,
            pv.MedidaID,
            pv.Stock AS StockVariante,
            pr.NombreProducto
          FROM DetallesOrdenCompra doc
          INNER JOIN Producto_Variantes pv ON doc.VarianteID = pv.VarianteID
          INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
          WHERE doc.DetalleOC_ID = $1 AND doc.OrdenCompraID = $2
        `;

        const detalleResult = await client.query(detalleQuery, [
          producto.detalleId,
          ordenCompraId,
        ]);

        if (detalleResult.rows.length === 0) {
          throw new Error(`Detalle ${producto.detalleId} no encontrado en esta orden`);
        }

        const detalle = detalleResult.rows[0];
        const nuevaCantidadRecibida = detalle.cantidadrecibida + cantidadRecibida;

        const pendienteEsperada = Number.parseInt(
          (detalle.cantidadsolicitada || 0) - (detalle.cantidadrecibida || 0),
          10
        );

        let piezasPorPaquete = Number.parseInt(detalle.piezasporpaquete, 10);
        if (!Number.isInteger(piezasPorPaquete) || piezasPorPaquete <= 0) {
          piezasPorPaquete = 1;
        }

        const cantidadAumentar = cantidadRecibida * piezasPorPaquete;

        // Validar que no se exceda la cantidad solicitada
        if (nuevaCantidadRecibida > detalle.cantidadsolicitada) {
          throw new Error(
            `No puede recibir más de lo solicitado para ${detalle.nombreproducto}. Solicitado: ${detalle.cantidadsolicitada}, Ya recibido: ${detalle.cantidadrecibida}`
          );
        }

        // Actualizar CantidadRecibida en DetallesOrdenCompra
        await client.query(
          `UPDATE DetallesOrdenCompra 
           SET CantidadRecibida = CantidadRecibida + $1 
           WHERE DetalleOC_ID = $2`,
          [cantidadRecibida, producto.detalleId]
        );

        logger.logOperation('DETALLE_ACTUALIZADO', { 
          detalleId: producto.detalleId, 
          cantidadRecibida 
        });

        // Actualizar Stock en la variante
        const nuevoStockVariante = (detalle.stockvariante || 0) + cantidadAumentar;
        await client.query(
          `UPDATE Producto_Variantes 
           SET Stock = COALESCE(Stock, 0) + $1 
           WHERE VarianteID = $2`,
          [cantidadAumentar, detalle.varianteid]
        );

        logger.logOperation('STOCK_ACTUALIZADO', { 
          sku: detalle.sku, 
          cantidadAumentada: cantidadAumentar,
          nuevoStock: nuevoStockVariante
        });

        // Registrar en stock_admin (UPSERT)
        const adminIdRegistro = adminCreadorId || usuarioRecibeId || adminId || null;

        if (adminIdRegistro) {
          await client.query(
            `INSERT INTO stock_admin (admin_id, variante_id, cantidad, tenant_id, updated_at, created_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT (admin_id, variante_id, tenant_id)
             DO UPDATE SET 
               cantidad = stock_admin.cantidad + $3,
               updated_at = CURRENT_TIMESTAMP`,
            [adminIdRegistro, detalle.varianteid, cantidadAumentar, tenant_id]
          );

          logger.logOperation('STOCK_ADMIN_ASIGNADO', { 
            adminId: adminIdRegistro, 
            varianteId: detalle.varianteid,
            cantidad: cantidadAumentar
          });

          // Registrar movimiento en Kardex
          try {
            await kardexService.registrarMovimiento({
              varianteId: detalle.varianteid,
              adminId: adminIdRegistro,
              tenantId: tenant_id,
              tipo: 'ADICION',
              cantidad: cantidadAumentar,
              motivo: `Recepción OC #${ordenCompraId}`,
              referenciaTipo: 'ORDEN_COMPRA',
              referenciaId: `OC-${ordenCompraId}`,
              observaciones: `Recepción de ${cantidadRecibida} paquete${cantidadRecibida === 1 ? '' : 's'} x ${piezasPorPaquete} piezas. SKU: ${detalle.sku}`,
              ipOrigen: req.ip || req.connection?.remoteAddress
            }, client);

            logger.logOperation('KARDEX_REGISTRADO', { sku: detalle.sku });
          } catch (kardexError) {
            logger.error('Error al registrar en Kardex', {
              error: kardexError.message,
              sku: detalle.sku,
              requestId: req.requestId,
              tenantId: req.tenant?.tenant_id
            });
            throw kardexError; // Propagar error para rollback
          }
        }

        // Registrar en Log_Inventario
        await client.query(
          `INSERT INTO Log_Inventario 
           (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID, tenant_id) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            detalle.varianteid,
            cantidadAumentar,
            nuevoStockVariante,
            `Recepción de OC #${ordenCompraId} (${cantidadRecibida} paquete${
              cantidadRecibida === 1 ? "" : "s"
            } x ${piezasPorPaquete} piezas)`,
            Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0
              ? usuarioRecibeId
              : adminId || null,
            tenant_id,
          ]
        );

        productosActualizados.push({
          productoId: detalle.productoid,
          varianteId: detalle.varianteid,
          nombreProducto: detalle.nombreproducto,
          sku: detalle.sku,
          medidaId: detalle.medidaid,
          dimensiones: detalle.dimensiones,
          cantidadRecibidaAhora: cantidadRecibida,
          piezasPorPaquete,
          cantidadAumentada: cantidadAumentar,
          cantidadRecibidaTotal: nuevaCantidadRecibida,
          cantidadSolicitada: detalle.cantidadsolicitada,
          stockVariante: nuevoStockVariante,
        });

        // Manejar discrepancias
        const discrepanciaInfo = discrepanciasByDetalle.get(producto.detalleId);
        if (
          discrepanciaInfo &&
          Number.isInteger(pendienteEsperada) &&
          pendienteEsperada >= 0 &&
          cantidadRecibida !== pendienteEsperada
        ) {
          const justificacion = (discrepanciaInfo?.justificacion || "").toString().trim();

          if (!justificacion) {
            throw new Error("Discrepancia detectada: la justificación es obligatoria para guardar con diferencia");
          }

          alertasSeguridad.push({
            ordenCompraId,
            detalleId: producto.detalleId,
            varianteId: detalle.varianteid,
            sku: detalle.sku,
            producto: detalle.nombreproducto,
            esperado: pendienteEsperada,
            recibido: cantidadRecibida,
            justificacion,
            evidenciaUrl: discrepanciaInfo?.evidenciaUrl || null,
            adminId: Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0
              ? usuarioRecibeId
              : adminId || null,
          });

          try {
            await client.query(
              `INSERT INTO alertas_seguridad
                (tipo, mensaje, metadata, creado_en)
               VALUES ($1, $2, $3, NOW())`,
              [
                "DISCREPANCIA_RECEPCION_OC",
                `Discrepancia de inventario detectada en OC #${ordenCompraId}`,
                JSON.stringify({
                  ordenCompraId,
                  detalleId: producto.detalleId,
                  varianteId: detalle.varianteid,
                  sku: detalle.sku,
                  esperado: pendienteEsperada,
                  recibido: cantidadRecibida,
                  justificacion,
                  evidenciaUrl: discrepanciaInfo?.evidenciaUrl || null,
                  adminId: Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0
                    ? usuarioRecibeId
                    : adminId || null,
                }),
              ]
            );
            logger.logOperation('ALERTA_DISCREPANCIA', { sku: detalle.sku });
          } catch (e) {
            console.warn('⚠️ [ALERTA] Error al registrar alerta de seguridad:', e.message);
          }
        }
      }

      // Actualizar estatus de la orden
      const estatusQuery = `
        SELECT 
          SUM(CantidadSolicitada) as TotalSolicitado,
          SUM(CantidadRecibida) as TotalRecibido
        FROM DetallesOrdenCompra
        WHERE OrdenCompraID = $1
      `;

      const estatusResult = await client.query(estatusQuery, [ordenCompraId]);
      const { totalsolicitado, totalrecibido } = estatusResult.rows[0];

      let nuevoEstatus;
      if (parseInt(totalrecibido) >= parseInt(totalsolicitado)) {
        nuevoEstatus = "Completada";
      } else if (parseInt(totalrecibido) > 0) {
        nuevoEstatus = "Parcial";
      } else {
        nuevoEstatus = "Pendiente";
      }

      await client.query(
        "UPDATE OrdenesDeCompra SET Estatus = $1 WHERE OrdenCompraID = $2 AND tenant_id = $3",
        [nuevoEstatus, ordenCompraId, tenant_id]
      );

      logger.logOperation('ESTATUS_ORDEN_ACTUALIZADO', { 
        estatusAnterior, 
        nuevoEstatus,
        totalSolicitado: parseInt(totalsolicitado),
        totalRecibido: parseInt(totalrecibido)
      });

      // Crear/Actualizar cuenta por pagar
      let cuentaPorPagar = null;
      if (["Parcial", "Completada"].includes(nuevoEstatus)) {
        const usuarioId = Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0 
          ? usuarioRecibeId 
          : null;
        cuentaPorPagar = await upsertCuentaPorPagarForOC(client, ordenCompraId, usuarioId);
        logger.logOperation('CXP_ACTUALIZADO', { ordenCompraId });
      }

      // Notificar discrepancias
      if (alertasSeguridad.length > 0) {
        const resumen = alertasSeguridad
          .map((a) => `${a.sku}: esperado ${a.esperado}, recibido ${a.recibido}`)
          .join(" | ");

        await notifySuperAdmins(client, {
          titulo: `⚠️ Discrepancia de Inventario Detectada en OC #${ordenCompraId}`,
          mensaje: `Se detectó discrepancia en recepción. ${resumen}`,
          url: `/admin-recibir-inventario.html?ordenId=${ordenCompraId}`,
          metadata: {
            ordenCompraId,
            nuevoEstatus,
            alertas: alertasSeguridad,
          },
          tenant_id,
        });
        logger.logOperation('NOTIFICACIONES_ENVIADAS', { alertasCount: alertasSeguridad.length });
      }

      return {
        success: true,
        ordenCompraId,
        nuevoEstatus,
        estatusAnterior,
        cuentaPorPagar,
        productosActualizados,
        alertasSeguridad,
        totalSolicitado: parseInt(totalsolicitado),
        totalRecibido: parseInt(totalrecibido),
      };

    }, {
      context: {
        userId: req.user.id,
        endpoint: 'POST /api/admin/ordenes-compra/recibir',
        ordenCompraId
      },
      timeout: 45000 // Mayor timeout por la complejidad
    });

    // ========================================
    // POST-TRANSACCIÓN: Auditoría
    // ========================================

    try {
      await auditService.registrarCambioPasivo(
        req,
        "ordenesdecompra",
        ordenCompraId,
        "UPDATE",
        { estatus: result.estatusAnterior },
        {
          estatus: result.nuevoEstatus,
          recibidoPor: Number.isInteger(usuarioRecibeId) ? usuarioRecibeId : null,
          productosActualizados: result.productosActualizados,
        }
      );
    } catch (e) {
      console.warn('⚠️ [AUDIT] Error al registrar auditoría:', e.message);
    }

    console.log(`✅ [RECEPCION] OC #${ordenCompraId} → ${result.nuevoEstatus} (${result.productosActualizados.length} productos)`);

    res.json({
      success: true,
      message: "Inventario recibido exitosamente",
      data: {
        ordenCompraId: result.ordenCompraId,
        nuevoEstatus: result.nuevoEstatus,
        cuentaPorPagar: result.cuentaPorPagar,
        productosActualizados: result.productosActualizados,
        alertasSeguridad: result.alertasSeguridad,
        totalSolicitado: result.totalSolicitado,
        totalRecibido: result.totalRecibido,
      },
    });

  } catch (error) {
    logger.error('❌ [RECEPCION] Error crítico:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al recibir el inventario"
    });
  }
};

module.exports = {
  recibirInventario
};
