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
        `INSERT INTO OrdenesDeCompra (ProveedorID, FechaEntregaEsperada, Estatus, OrigenOC)
         VALUES ($1, NOW() + INTERVAL '14 days', 'Pendiente', 'backorder')
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

/**
 * Genera o actualiza una Orden de Compra para surtir un backorder de un producto específico.
 * Esta función opera dentro de una transacción existente.
 *
 * @param {object} client - Cliente de base de datos activo dentro de la transacción.
 * @param {number} productoID - ID del producto.
 * @param {number} varianteID - ID de la variante del producto.
 * @param {number} cantidadFaltante - Cantidad de paquetes faltantes que se deben solicitar.
 * @param {number|null} tamanoID - ID del tamaño del paquete (puede ser NULL).
 * @returns {Promise<object>} - Información de la orden de compra generada/actualizada.
 */
async function generarBackorderProveedor(
  client,
  productoID,
  varianteID,
  cantidadFaltante,
  tamanoID
) {
  try {
    // Validar parámetros
    const productoIdNumero = parseInt(productoID, 10);
    const varianteIdNumero = parseInt(varianteID, 10);
    const cantidadSolicitada = parseInt(cantidadFaltante, 10);
    const tamanoIdNumero = tamanoID ? parseInt(tamanoID, 10) : null;

    if (Number.isNaN(productoIdNumero) || Number.isNaN(varianteIdNumero)) {
      throw new Error("ProductoID o VarianteID inválidos para backorder");
    }

    if (!Number.isInteger(cantidadSolicitada) || cantidadSolicitada <= 0) {
      throw new Error("Cantidad faltante debe ser un número positivo");
    }

    // PASO 1: Identificar Proveedor
    const productoResult = await client.query(
      `SELECT proveedorid_default
       FROM productos
       WHERE productoid = $1`,
      [productoIdNumero]
    );

    let proveedorID = null;
    if (productoResult.rows.length > 0) {
      proveedorID = productoResult.rows[0].proveedorid_default;
    }

    // Fallback: si no hay proveedor por producto, intentar resolver por variante -> producto
    if (!proveedorID) {
      const varianteProveedorResult = await client.query(
        `SELECT p.proveedorid_default
         FROM producto_variantes pv
         INNER JOIN productos p ON p.productoid = pv.productoid
         WHERE pv.varianteid = $1
         LIMIT 1`,
        [varianteIdNumero]
      );

      if (varianteProveedorResult.rows.length > 0) {
        proveedorID = varianteProveedorResult.rows[0].proveedorid_default;
      }
    }

    if (!proveedorID) {
      throw new Error(
        `El producto ${productoIdNumero} no tiene un proveedor asignado. No se puede generar orden de compra.`
      );
    }

    // PASO 2: Buscar Orden Abierta (Pendiente)
    const ordenPendienteResult = await client.query(
      `SELECT OrdenCompraID
       FROM OrdenesDeCompra
       WHERE ProveedorID = $1 AND Estatus = 'Pendiente'
       ORDER BY FechaCreacion ASC
       LIMIT 1`,
      [proveedorID]
    );

    let ordenCompraID;
    let esOrdenNueva = false;

    // PASO 3: Crear o Reutilizar Orden
    if (ordenPendienteResult.rows.length === 0) {
      // NO existe orden pendiente -> Crear nueva
      const nuevaOrdenResult = await client.query(
        `INSERT INTO OrdenesDeCompra (ProveedorID, FechaEntregaEsperada, Estatus, OrigenOC)
         VALUES ($1, NOW() + INTERVAL '14 days', 'Pendiente', 'backorder')
         RETURNING OrdenCompraID`,
        [proveedorID]
      );
      ordenCompraID = nuevaOrdenResult.rows[0].ordencompraid;
      esOrdenNueva = true;
    } else {
      // SÍ existe orden pendiente -> Reutilizar
      ordenCompraID = ordenPendienteResult.rows[0].ordencompraid;
    }

    // PASO 4: Agregar/Actualizar Producto en DetallesOrdenCompra
    const detalleExistenteResult = await client.query(
      `SELECT DetalleOC_ID, CantidadSolicitada
       FROM DetallesOrdenCompra
       WHERE OrdenCompraID = $1 AND VarianteID = $2`,
      [ordenCompraID, varianteIdNumero]
    );

    let detalleOrdenID;
    let cantidadTotal;

    if (detalleExistenteResult.rows.length > 0) {
      // Ya existe el producto -> UPDATE (incrementar cantidad)
      const detalleExistente = detalleExistenteResult.rows[0];
      const updateResult = await client.query(
        `UPDATE DetallesOrdenCompra
         SET CantidadSolicitada = CantidadSolicitada + $1
         WHERE DetalleOC_ID = $2
         RETURNING DetalleOC_ID, CantidadSolicitada`,
        [cantidadSolicitada, detalleExistente.detalleoc_id]
      );
      detalleOrdenID = updateResult.rows[0].detalleoc_id;
      cantidadTotal = updateResult.rows[0].cantidadsolicitada;
    } else {
      // No existe el producto -> INSERT (nuevo detalle)
      const insertResult = await client.query(
        `INSERT INTO DetallesOrdenCompra 
         (OrdenCompraID, VarianteID, CantidadSolicitada, CantidadRecibida)
         VALUES ($1, $2, $3, 0)
         RETURNING DetalleOC_ID, CantidadSolicitada`,
        [ordenCompraID, varianteIdNumero, cantidadSolicitada]
      );
      detalleOrdenID = insertResult.rows[0].detalleoc_id;
      cantidadTotal = insertResult.rows[0].cantidadsolicitada;
    }

    return {
      success: true,
      ordenCompraID,
      proveedorID,
      productoID: productoIdNumero,
      varianteID: varianteIdNumero,
      tamanoID: tamanoIdNumero,
      cantidadSolicitada: cantidadSolicitada,
      cantidadTotal: cantidadTotal,
      detalleOrdenID,
      esOrdenNueva,
      mensaje: esOrdenNueva
        ? `Orden de compra ${ordenCompraID} creada para proveedor ${proveedorID}`
        : `Orden de compra ${ordenCompraID} actualizada`,
    };
  } catch (error) {
    console.error("Error en generarBackorderProveedor:", error);
    throw error;
  }
}

module.exports = {
  generarOrdenCompraAutomatica,
  generarBackorderProveedor,
};
