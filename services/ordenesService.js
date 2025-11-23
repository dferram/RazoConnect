const db = require("../db");

/**
 * Genera o actualiza una Orden de Compra en estatus "Pendiente" para surtir
 * la cantidad faltante de una variante específica.
 *
 * @param {object} client - Cliente de base de datos activo dentro de la transacción.
 * @param {number|string} varianteId - Identificador de la variante a surtir.
 * @param {number|string} cantidadFaltante - Cantidad de piezas faltantes que se deben solicitar.
 * @returns {Promise<object>} - Información de la orden de compra afectada.
 */
async function generarOrdenCompraAutomatica(
  client,
  varianteId,
  cantidadFaltante
) {
  const dbClient = client || (await db.pool.connect());
  const releaseClient = !client;

  try {
    const varianteIdNumero = parseInt(varianteId, 10);
    const cantidadSolicitada = parseInt(cantidadFaltante, 10);

    if (Number.isNaN(varianteIdNumero)) {
      throw new Error("Error: VarianteID inválido para backorder");
    }

    if (!Number.isInteger(cantidadSolicitada) || cantidadSolicitada <= 0) {
      throw new Error("Error: Cantidad faltante inválida para backorder");
    }

    const varianteResult = await dbClient.query(
      `SELECT 
         pv.VarianteID,
         pv.ProductoID,
         p.ProveedorID_Default AS proveedor_producto
       FROM Producto_Variantes pv
       INNER JOIN Productos p ON p.ProductoID = pv.ProductoID
       WHERE pv.VarianteID = $1`,
      [varianteIdNumero]
    );

    if (varianteResult.rows.length === 0) {
      throw new Error("Error: Variante no encontrada para backorder");
    }

    const { productoid: productoId, proveedor_producto: proveedorProducto } =
      varianteResult.rows[0];

    const proveedorId = proveedorProducto;

    if (!proveedorId) {
      throw new Error("Error: Producto sin proveedor para backorder");
    }

    const ordenPendienteResult = await dbClient.query(
      `SELECT OrdenCompraID
         FROM OrdenesDeCompra
        WHERE ProveedorID = $1 AND Estatus = 'Pendiente'
        ORDER BY FechaCreacion ASC
        LIMIT 1`,
      [proveedorId]
    );

    let ordenCompraId;
    let esOrdenNueva = false;

    if (ordenPendienteResult.rows.length > 0) {
      ordenCompraId = ordenPendienteResult.rows[0].ordencompraid;
    } else {
      esOrdenNueva = true;
      const nuevaOrdenResult = await dbClient.query(
        `INSERT INTO OrdenesDeCompra (ProveedorID, FechaEntregaEsperada, Estatus)
         VALUES ($1, NOW() + INTERVAL '14 days', 'Pendiente')
         RETURNING OrdenCompraID`,
        [proveedorId]
      );

      ordenCompraId = nuevaOrdenResult.rows[0].ordencompraid;
    }

    const detalleExistenteResult = await dbClient.query(
      `SELECT DetalleOC_ID, CantidadSolicitada
         FROM DetallesOrdenCompra
        WHERE OrdenCompraID = $1 AND VarianteID = $2
        LIMIT 1`,
      [ordenCompraId, varianteIdNumero]
    );

    let detalleOrden;

    if (detalleExistenteResult.rows.length > 0) {
      const detalle = detalleExistenteResult.rows[0];
      const detalleActualizado = await dbClient.query(
        `UPDATE DetallesOrdenCompra
            SET CantidadSolicitada = CantidadSolicitada + $1
          WHERE DetalleOC_ID = $2
          RETURNING DetalleOC_ID, CantidadSolicitada`,
        [cantidadSolicitada, detalle.detalleoc_id]
      );

      detalleOrden = detalleActualizado.rows[0];
    } else {
      const detalleInsertado = await dbClient.query(
        `INSERT INTO DetallesOrdenCompra (OrdenCompraID, VarianteID, CantidadSolicitada, CantidadRecibida)
         VALUES ($1, $2, $3, 0)
         RETURNING DetalleOC_ID, CantidadSolicitada`,
        [ordenCompraId, varianteIdNumero, cantidadSolicitada]
      );

      detalleOrden = detalleInsertado.rows[0];
    }

    if (releaseClient) {
      dbClient.release();
    }

    return {
      ordenCompraId,
      proveedorId,
      productoId,
      varianteId: varianteIdNumero,
      cantidadSolicitada,
      esOrdenNueva,
      detalle: detalleOrden,
    };
  } catch (error) {
    if (releaseClient) {
      dbClient.release();
    }
    throw error;
  }
}

module.exports = {
  generarOrdenCompraAutomatica,
};
