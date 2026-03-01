/**
 * ITEMS ORDEN COMPRA CONTROLLER
 * 
 * Controlador especializado para agregar/eliminar items de órdenes de compra.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/itemsOrdenCompraController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Agregar item a una orden de compra existente
 * POST /api/admin/ordenes-compra/:id/items
 */
const addItemToOrder = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const ordenCompraId = parseInt(req.params.id, 10);
    const { varianteId, cantidad, costoUnitario, piezasPorPaquete } = req.body;

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden inválido",
      });
    }

    if (!varianteId || !cantidad) {
      return res.status(400).json({
        success: false,
        message: "varianteId y cantidad son requeridos",
      });
    }

    const cantidadParsed = parseInt(cantidad, 10);
    if (!Number.isInteger(cantidadParsed) || cantidadParsed <= 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad debe ser un número entero positivo",
      });
    }

    const piezasParsed = parseInt(piezasPorPaquete || 1, 10);
    if (!Number.isInteger(piezasParsed) || piezasParsed <= 0) {
      return res.status(400).json({
        success: false,
        message: "piezasPorPaquete inválido",
      });
    }

    await client.query("BEGIN");

    const ordenCheck = await client.query(
      `SELECT OrdenCompraID, Estatus, usuario_creador_id 
       FROM OrdenesDeCompra 
       WHERE OrdenCompraID = $1`,
      [ordenCompraId]
    );

    if (ordenCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenCheck.rows[0];

    if (req.user.rol !== 'superadmin' && orden.usuario_creador_id !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para editar esta orden",
      });
    }

    if (!['Pendiente', 'Confirmada'].includes(orden.estatus)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `No se puede editar una orden en estatus ${orden.estatus}`,
      });
    }

    const varianteResult = await client.query(
      `SELECT pv.VarianteID, pv.ProductoID, pv.SKU, pv.Dimensiones, pv.CostoUnitario, pr.NombreProducto
       FROM Producto_Variantes pv
       INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
       WHERE pv.VarianteID = $1`,
      [varianteId]
    );

    if (varianteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const variante = varianteResult.rows[0];

    const costoFinal = (() => {
      if (costoUnitario !== undefined && costoUnitario !== null) {
        const parsed = parseFloat(costoUnitario);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
      }
      const fallback = parseFloat(variante.costounitario);
      if (Number.isFinite(fallback) && fallback >= 0) return fallback * piezasParsed;
      return 0;
    })();

    const existingItem = await client.query(
      `SELECT DetalleOC_ID, CantidadSolicitada, CostoUnitario
       FROM DetallesOrdenCompra
       WHERE OrdenCompraID = $1 AND VarianteID = $2`,
      [ordenCompraId, varianteId]
    );

    let detalleId;

    if (existingItem.rows.length > 0) {
      const nuevaCantidad = existingItem.rows[0].cantidadsolicitada + cantidadParsed;
      await client.query(
        `UPDATE DetallesOrdenCompra 
         SET CantidadSolicitada = $1
         WHERE DetalleOC_ID = $2`,
        [nuevaCantidad, existingItem.rows[0].detalleoc_id]
      );
      detalleId = existingItem.rows[0].detalleoc_id;
    } else {
      const insertResult = await client.query(
        `INSERT INTO DetallesOrdenCompra 
         (OrdenCompraID, VarianteID, CantidadSolicitada, CantidadRecibida, PiezasPorPaquete, CostoUnitario)
         VALUES ($1, $2, $3, 0, $4, $5)
         RETURNING DetalleOC_ID`,
        [ordenCompraId, varianteId, cantidadParsed, piezasParsed, costoFinal]
      );
      detalleId = insertResult.rows[0].detalleoc_id;
    }

    const totalResult = await client.query(
      `SELECT COALESCE(SUM(CantidadSolicitada * CostoUnitario), 0) as total
       FROM DetallesOrdenCompra
       WHERE OrdenCompraID = $1`,
      [ordenCompraId]
    );

    const nuevoTotal = parseFloat(totalResult.rows[0].total);

    await client.query(
      `UPDATE OrdenesDeCompra SET Total = $1 WHERE OrdenCompraID = $2 AND tenant_id = $3`,
      [nuevoTotal, ordenCompraId, req.tenant.tenant_id]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Item agregado exitosamente a la orden",
      data: {
        detalleId,
        nuevoTotal,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error al agregar item a orden:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al agregar item a la orden",
    });
  } finally {
    client.release();
  }
};

/**
 * Eliminar item de una orden de compra existente
 * DELETE /api/admin/ordenes-compra/:id/items/:detalleId
 */
const removeItemFromOrder = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const ordenCompraId = parseInt(req.params.id, 10);
    const detalleId = parseInt(req.params.detalleId, 10);

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden inválido",
      });
    }

    if (!Number.isInteger(detalleId) || detalleId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de detalle inválido",
      });
    }

    await client.query("BEGIN");

    const ordenCheck = await client.query(
      `SELECT OrdenCompraID, Estatus, usuario_creador_id
       FROM OrdenesDeCompra
       WHERE OrdenCompraID = $1`,
      [ordenCompraId]
    );

    if (ordenCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenCheck.rows[0];

    if (req.user.rol !== 'superadmin' && orden.usuario_creador_id !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para editar esta orden",
      });
    }

    if (!['Pendiente', 'Confirmada'].includes(orden.estatus)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `No se puede editar una orden en estatus ${orden.estatus}`,
      });
    }

    const deleteResult = await client.query(
      `DELETE FROM DetallesOrdenCompra 
       WHERE DetalleOC_ID = $1 AND OrdenCompraID = $2
       RETURNING DetalleOC_ID`,
      [detalleId, ordenCompraId]
    );

    if (deleteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Item no encontrado en esta orden",
      });
    }

    const totalResult = await client.query(
      `SELECT COALESCE(SUM(CantidadSolicitada * CostoUnitario), 0) as total
       FROM DetallesOrdenCompra
       WHERE OrdenCompraID = $1`,
      [ordenCompraId]
    );

    const nuevoTotal = parseFloat(totalResult.rows[0].total);

    await client.query(
      `UPDATE OrdenesDeCompra SET Total = $1 WHERE OrdenCompraID = $2 AND tenant_id = $3`,
      [nuevoTotal, ordenCompraId, req.tenant.tenant_id]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Item eliminado exitosamente de la orden",
      data: {
        nuevoTotal,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error al eliminar item de orden:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al eliminar item de la orden",
    });
  } finally {
    client.release();
  }
};

module.exports = {
  addItemToOrder,
  removeItemFromOrder
};
