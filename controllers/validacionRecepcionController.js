/**
 * VALIDACIÓN RECEPCIÓN CONTROLLER
 * 
 * Controlador especializado para validación de recepción de órdenes de compra (Conteo Ciego).
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/validacionRecepcionController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const inventoryService = require('../services/inventoryService');

/**
 * Conteo Ciego: Validar recepción y aplicar inventario si coincide
 * POST /api/admin/compras/:id/validar-recepcion
 * Body: { conteos: [{ varianteId, cantidadContada }] }
 */
const validarRecepcionCompra = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const ordenCompraId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden de compra inválido",
      });
    }

    const conteos = Array.isArray(req.body?.conteos) ? req.body.conteos : [];
    if (!conteos.length) {
      return res.status(400).json({
        success: false,
        message: "Debes enviar conteos",
      });
    }

    // Normalizar conteos en Map (varianteId -> cantidadContada)
    const conteosMap = new Map();
    for (const c of conteos) {
      const varianteId = Number.parseInt(c?.varianteId, 10);
      const cantidadContada = Number.parseInt(c?.cantidadContada, 10);
      if (!Number.isInteger(varianteId) || varianteId <= 0) {
        return res.status(400).json({
          success: false,
          message: "conteos contiene varianteId inválido",
        });
      }
      if (!Number.isInteger(cantidadContada) || cantidadContada < 0) {
        return res.status(400).json({
          success: false,
          message: "conteos contiene cantidadContada inválida",
        });
      }
      conteosMap.set(varianteId, cantidadContada);
    }

    await client.query("BEGIN");

    const { tenant_id } = req.tenant;
    const ordenLock = await client.query(
      "SELECT OrdenCompraID, Estatus FROM OrdenesDeCompra WHERE OrdenCompraID = $1 AND tenant_id = $2 FOR UPDATE",
      [ordenCompraId, tenant_id]
    );

    if (!ordenLock.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const estatus = (ordenLock.rows[0].estatus || "").toString().trim();
    if (!['Pendiente', 'Parcial'].includes(estatus)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `La orden no se puede recepcionar en estatus '${estatus || "(vacío)"}'`,
      });
    }

    const detalles = await client.query(
      `SELECT
         doc.detalleoc_id,
         doc.varianteid,
         doc.cantidadsolicitada,
         doc.cantidadrecibida,
         doc.piezasporpaquete,
         pv.sku,
         pr.nombreproducto
       FROM detallesordencompra doc
       INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
       INNER JOIN productos pr ON pv.productoid = pr.productoid
       WHERE doc.ordencompraid = $1
       FOR UPDATE`,
      [ordenCompraId]
    );

    if (!detalles.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "La orden no tiene productos",
      });
    }

    // Validación de discrepancias (no tocar inventario si algo no coincide)
    for (const row of detalles.rows) {
      const varianteId = Number.parseInt(row.varianteid, 10);
      const solicitado = Number.parseInt(row.cantidadsolicitada, 10) || 0;
      const recibido = Number.parseInt(row.cantidadrecibida, 10) || 0;
      const pendiente = Math.max(solicitado - recibido, 0);

      if (pendiente === 0) {
        continue;
      }

      if (!conteosMap.has(varianteId)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: `Discrepancia en ${row.nombreproducto}: Esperado ${pendiente}, Contado 0`,
          data: {
            varianteId,
            sku: row.sku,
            producto: row.nombreproducto,
            esperado: pendiente,
            contado: 0,
          },
        });
      }

      const contado = conteosMap.get(varianteId);
      if (contado !== pendiente) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: `Discrepancia en ${row.nombreproducto}: Esperado ${pendiente}, Contado ${contado}`,
          data: {
            varianteId,
            sku: row.sku,
            producto: row.nombreproducto,
            esperado: pendiente,
            contado,
          },
        });
      }
    }

    // Si todo coincide, aplicamos recepción completa de lo pendiente
    const movimientos = [];

    for (const row of detalles.rows) {
      const solicitado = Number.parseInt(row.cantidadsolicitada, 10) || 0;
      const recibido = Number.parseInt(row.cantidadrecibida, 10) || 0;
      const pendiente = Math.max(solicitado - recibido, 0);
      if (pendiente === 0) continue;

      const piezasPorPaqueteParsed = Number.parseInt(row.piezasporpaquete, 10);
      const piezasPorPaquete =
        Number.isInteger(piezasPorPaqueteParsed) && piezasPorPaqueteParsed > 0
          ? piezasPorPaqueteParsed
          : 1;

      const cantidadAumentar = pendiente * piezasPorPaquete;
      const motivo = `Recepción Blindada OC #${ordenCompraId} (${pendiente} paquete${pendiente === 1 ? "" : "s"} x ${piezasPorPaquete} piezas)`;

      await inventoryService.registrarMovimiento(client, {
        varianteId: row.varianteid,
        cantidadDelta: cantidadAumentar,
        motivo,
        usuarioId: req.user.id,
        esExcepcion: false,
      });

      await client.query(
        `UPDATE DetallesOrdenCompra
         SET CantidadRecibida = CantidadRecibida + $1
         WHERE DetalleOC_ID = $2 AND OrdenCompraID = $3`,
        [pendiente, row.detalleoc_id, ordenCompraId]
      );

      movimientos.push({
        detalleId: row.detalleoc_id,
        varianteId: row.varianteid,
        sku: row.sku,
        producto: row.nombreproducto,
        cantidadContada: pendiente,
        piezasPorPaquete,
        unidadesAgregadas: cantidadAumentar,
      });
    }

    await client.query(
      "UPDATE OrdenesDeCompra SET Estatus = 'Completada' WHERE OrdenCompraID = $1 AND tenant_id = $2",
      [ordenCompraId, tenant_id]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Recepción perfecta (Conteo Ciego): inventario actualizado",
      data: {
        ordenCompraId,
        movimientos,
        estatus: "Completada",
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error en validarRecepcionCompra:", error);
    const status = error && Number.isInteger(error.status) ? error.status : 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Error al validar recepción",
      error: error.message,
      code: error.code,
    });
  } finally {
    client.release();
  }
};

module.exports = {
  validarRecepcionCompra
};
