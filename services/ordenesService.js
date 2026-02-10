const db = require("../db");

/**
 * Normaliza la cantidad solicitada al múltiplo más cercano de la regla de empaque del proveedor.
 * Implementa Smart Reordering: redondea hacia arriba para cumplir con las reglas de empaque.
 *
 * @param {object} client - Cliente de base de datos activo.
 * @param {number} productoID - ID del producto.
 * @param {number} cantidadSolicitada - Cantidad original solicitada (piezas o paquetes).
 * @returns {Promise<object>} - { cantidadNormalizada, reglaEmpaque, sobranteStock }
 */
async function normalizarCantidadPorReglaEmpaque(
  client,
  productoID,
  cantidadSolicitada
) {
  try {
    // PASO 1: Obtener la regla de empaque del producto
    const reglaResult = await client.query(
      `SELECT pre.cantidadempaque, pre.descripcion
       FROM productos p
       INNER JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
       WHERE p.productoid = $1`,
      [productoID]
    );

    // Si no hay regla de empaque, retornar cantidad original (sin normalizar)
    if (reglaResult.rows.length === 0) {
      console.warn(
        `⚠️ Producto ${productoID} no tiene regla de empaque definida. Se usará cantidad original.`
      );
      return {
        cantidadNormalizada: cantidadSolicitada,
        reglaEmpaque: null,
        sobranteStock: 0,
        descripcionRegla: "Sin regla de empaque",
      };
    }

    const reglaEmpaque = reglaResult.rows[0].cantidadempaque;
    const descripcionRegla = reglaResult.rows[0].descripcion;

    // PASO 2: Aplicar algoritmo de Smart Reordering
    // Fórmula: Math.ceil(cantidad_solicitada / regla_empaque) * regla_empaque
    const cantidadNormalizada =
      Math.ceil(cantidadSolicitada / reglaEmpaque) * reglaEmpaque;

    // PASO 3: Calcular sobrante de stock
    const sobranteStock = cantidadNormalizada - cantidadSolicitada;

    return {
      cantidadNormalizada,
      reglaEmpaque,
      sobranteStock,
      descripcionRegla,
    };
  } catch (error) {
    console.error("Error en normalizarCantidadPorReglaEmpaque:", error);
    throw error;
  }
}

/**
 * Genera o actualiza una Orden de Compra en estatus "Pendiente" para surtir
 * la cantidad faltante de una variante específica.
 *
 * @param {object} client - Cliente de base de datos activo dentro de la transacción.
 * @param {number|string} varianteId - Identificador de la variante a surtir.
 * @param {number|string} cantidadFaltante - Cantidad de piezas faltantes que se deben solicitar.
 * @param {number} tenantId - ID del tenant para aislamiento multi-tenant.
 * @param {number|null} adminCreadorId - ID del administrador que crea la orden (para ownership).
 * @returns {Promise<object>} - Información de la orden de compra afectada.
 */
async function generarOrdenCompraAutomatica(
  client,
  varianteId,
  cantidadFaltante,
  tenantId = 1,
  adminCreadorId = null
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
        WHERE ProveedorID = $1 AND Estatus = 'Pendiente' AND tenant_id = $2
        ORDER BY FechaCreacion ASC
        LIMIT 1`,
      [proveedorId, tenantId]
    );

    let ordenCompraId;
    let esOrdenNueva = false;

    if (ordenPendienteResult.rows.length > 0) {
      ordenCompraId = ordenPendienteResult.rows[0].ordencompraid;
    } else {
      esOrdenNueva = true;
      const nuevaOrdenResult = await dbClient.query(
        `INSERT INTO OrdenesDeCompra (ProveedorID, FechaEntregaEsperada, Estatus, OrigenOC, tenant_id, admin_creador_id)
         VALUES ($1, NOW() + INTERVAL '14 days', 'Pendiente', 'backorder', $2, $3)
         RETURNING OrdenCompraID`,
        [proveedorId, tenantId, adminCreadorId]
      );

      ordenCompraId = nuevaOrdenResult.rows[0].ordencompraid;
    }

    // SMART REORDERING: Normalizar cantidad según regla de empaque
    const normalizacionResult = await normalizarCantidadPorReglaEmpaque(
      dbClient,
      productoId,
      cantidadSolicitada
    );

    const cantidadNormalizada = normalizacionResult.cantidadNormalizada;

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
        [cantidadNormalizada, detalle.detalleoc_id]
      );

      detalleOrden = detalleActualizado.rows[0];
    } else {
      const detalleInsertado = await dbClient.query(
        `INSERT INTO DetallesOrdenCompra (OrdenCompraID, VarianteID, CantidadSolicitada, CantidadRecibida)
         VALUES ($1, $2, $3, 0)
         RETURNING DetalleOC_ID, CantidadSolicitada`,
        [ordenCompraId, varianteIdNumero, cantidadNormalizada]
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
      cantidadSolicitadaOriginal: cantidadSolicitada,
      cantidadNormalizada: cantidadNormalizada,
      reglaEmpaque: normalizacionResult.reglaEmpaque,
      sobranteStock: normalizacionResult.sobranteStock,
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
 * Genera una NUEVA Orden de Compra para surtir un backorder de un producto específico.
 * REGLA DE NEGOCIO: Cada backorder crea una orden independiente (Trazabilidad 1:1).
 * Esta función opera dentro de una transacción existente.
 *
 * @param {object} client - Cliente de base de datos activo dentro de la transacción.
 * @param {number} productoID - ID del producto.
 * @param {number} varianteID - ID de la variante del producto.
 * @param {number} cantidadFaltante - Cantidad de paquetes faltantes que se deben solicitar.
 * @param {number|null} tamanoID - ID del tamaño del paquete (puede ser NULL).
 * @param {number|null} usuarioCreadorId - ID del usuario que genera el backorder (puede ser NULL).
 * @param {number|null} pedidoOrigenId - ID del pedido de cliente que originó este backorder.
 * @param {number} tenantId - ID del tenant para aislamiento multi-tenant.
 * @param {number|null} adminCreadorId - ID del administrador que crea la orden (para ownership).
 * @returns {Promise<object>} - Información de la orden de compra generada.
 */
async function generarBackorderProveedor(
  client,
  productoID,
  varianteID,
  cantidadFaltante,
  tamanoID,
  usuarioCreadorId = null,
  pedidoOrigenId = null,
  tenantId = 1,
  adminCreadorId = null
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

    // PASO 2: BUSCAR ORDEN DE COMPRA ABIERTA PARA CONSOLIDACIÓN
    // REGLA DE NEGOCIO: Consolidar backorders del mismo proveedor en una orden existente
    // hasta que la mercancía llegue físicamente (estatus < 'RECIBIDA_ALMACEN')
    let ordenCompraID;
    let esOrdenNueva = false;

    const ordenAbiertalResult = await client.query(
      `SELECT ordencompraid 
       FROM ordenesdecompra 
       WHERE proveedorid = $1 
         AND estatus NOT IN ('RECIBIDA_ALMACEN', 'CANCELADA', 'COMPLETADA')
         AND tenant_id = $2
       ORDER BY fechacreacion ASC
       LIMIT 1`,
      [proveedorID, tenantId]
    );

    if (ordenAbiertalResult.rows.length > 0) {
      // Consolidar en orden existente
      ordenCompraID = ordenAbiertalResult.rows[0].ordencompraid;
      console.log(`🔄 [CONSOLIDACIÓN] Backorder consolidado en OC #${ordenCompraID} existente`);
    } else {
      // Crear nueva orden de compra
      esOrdenNueva = true;
      const nuevaOrdenResult = await client.query(
        `INSERT INTO OrdenesDeCompra (
          ProveedorID, 
          FechaEntregaEsperada, 
          Estatus, 
          OrigenOC, 
          usuario_creador_id,
          tenant_id,
          admin_creador_id
        )
        VALUES ($1, NOW() + INTERVAL '14 days', 'Pendiente', 'backorder', $2, $3, $4)
        RETURNING OrdenCompraID`,
        [proveedorID, usuarioCreadorId, tenantId, adminCreadorId]
      );
      ordenCompraID = nuevaOrdenResult.rows[0].ordencompraid;
      console.log(`✨ [NUEVA OC] Orden de compra #${ordenCompraID} creada para proveedor ${proveedorID}`);
    }

    // PASO 3: SMART REORDERING - Normalizar cantidad según regla de empaque
    const normalizacionResult = await normalizarCantidadPorReglaEmpaque(
      client,
      productoIdNumero,
      cantidadSolicitada
    );

    const cantidadNormalizada = normalizacionResult.cantidadNormalizada;

    // PASO 4: Agregar o actualizar producto en DetallesOrdenCompra
    // CRÍTICO: Siempre guardar pedido_original_id para trazabilidad
    const detalleExistenteResult = await client.query(
      `SELECT detalleoc_id, cantidadsolicitada
       FROM detallesordencompra
       WHERE ordencompraid = $1 
         AND varianteid = $2 
         AND pedido_original_id = $3
       LIMIT 1`,
      [ordenCompraID, varianteIdNumero, pedidoOrigenId]
    );

    let detalleOrdenID;
    let cantidadTotal;

    if (detalleExistenteResult.rows.length > 0) {
      // Actualizar cantidad en detalle existente del mismo pedido
      const detalleExistente = detalleExistenteResult.rows[0];
      const updateResult = await client.query(
        `UPDATE detallesordencompra
         SET cantidadsolicitada = cantidadsolicitada + $1
         WHERE detalleoc_id = $2
         RETURNING detalleoc_id, cantidadsolicitada`,
        [cantidadNormalizada, detalleExistente.detalleoc_id]
      );
      detalleOrdenID = updateResult.rows[0].detalleoc_id;
      cantidadTotal = updateResult.rows[0].cantidadsolicitada;
      console.log(`📦 [ACTUALIZADO] Detalle #${detalleOrdenID} actualizado (+${cantidadNormalizada} piezas)`);
    } else {
      // Insertar nuevo detalle con pedido_original_id
      const insertResult = await client.query(
        `INSERT INTO DetallesOrdenCompra 
         (OrdenCompraID, VarianteID, CantidadSolicitada, CantidadRecibida, pedido_original_id)
         VALUES ($1, $2, $3, 0, $4)
         RETURNING DetalleOC_ID, CantidadSolicitada`,
        [ordenCompraID, varianteIdNumero, cantidadNormalizada, pedidoOrigenId]
      );
      detalleOrdenID = insertResult.rows[0].detalleoc_id;
      cantidadTotal = insertResult.rows[0].cantidadsolicitada;
      console.log(`➕ [NUEVO DETALLE] Detalle #${detalleOrdenID} creado (Pedido #${pedidoOrigenId})`);
    }

    return {
      success: true,
      ordenCompraID,
      proveedorID,
      productoID: productoIdNumero,
      varianteID: varianteIdNumero,
      tamanoID: tamanoIdNumero,
      cantidadSolicitadaOriginal: cantidadSolicitada,
      cantidadNormalizada: cantidadNormalizada,
      cantidadTotal: cantidadTotal,
      reglaEmpaque: normalizacionResult.reglaEmpaque,
      sobranteStock: normalizacionResult.sobranteStock,
      detalleOrdenID,
      esOrdenNueva,
      mensaje: esOrdenNueva 
        ? `Orden de compra ${ordenCompraID} creada para proveedor ${proveedorID}${pedidoOrigenId ? ` (Pedido #${pedidoOrigenId})` : ''}` 
        : `Backorder consolidado en OC #${ordenCompraID} existente (Pedido #${pedidoOrigenId})`,
      consolidada: !esOrdenNueva,
      pedidoOrigenId,
    };
  } catch (error) {
    console.error("Error en generarBackorderProveedor:", error);
    throw error;
  }
}

/**
 * Genera Órdenes de Compra agrupadas por proveedor para múltiples productos en backorder.
 * REGLA DE NEGOCIO: Un pedido genera UNA orden por proveedor (agrupación por ProveedorID).
 * Esta función opera dentro de una transacción existente.
 *
 * @param {object} client - Cliente de base de datos activo dentro de la transacción.
 * @param {Array} productosBackorder - Array de productos con backorder [{productoID, varianteID, cantidadFaltante, tamanoID, proveedorID}]
 * @param {number|null} usuarioCreadorId - ID del usuario que genera el backorder (puede ser NULL).
 * @param {number|null} pedidoOrigenId - ID del pedido de cliente que originó estos backorders.
 * @param {number} tenantId - ID del tenant para aislamiento multi-tenant.
 * @param {number|null} adminCreadorId - ID del administrador que crea la orden (para ownership).
 * @returns {Promise<Array>} - Array de órdenes de compra generadas.
 */
async function generarBackordersAgrupados(
  client,
  productosBackorder,
  usuarioCreadorId = null,
  pedidoOrigenId = null,
  tenantId = 1,
  adminCreadorId = null
) {
  try {
    if (!Array.isArray(productosBackorder) || productosBackorder.length === 0) {
      return [];
    }

    // PASO 1: Agrupar productos por ProveedorID
    const productosPorProveedor = new Map();

    for (const item of productosBackorder) {
      const proveedorID = item.proveedorID;
      
      if (!proveedorID) {
        console.warn(`Producto ${item.productoID} no tiene proveedor asignado, se omite del backorder`);
        continue;
      }

      if (!productosPorProveedor.has(proveedorID)) {
        productosPorProveedor.set(proveedorID, []);
      }

      productosPorProveedor.get(proveedorID).push(item);
    }

    // PASO 2: Buscar o crear UNA orden de compra por cada proveedor
    const ordenesGeneradas = [];

    for (const [proveedorID, productos] of productosPorProveedor.entries()) {
      // Buscar orden abierta existente para consolidación
      let ordenCompraID;
      let esOrdenNueva = false;

      const ordenAbiertalResult = await client.query(
        `SELECT ordencompraid 
         FROM ordenesdecompra 
         WHERE proveedorid = $1 
           AND estatus NOT IN ('RECIBIDA_ALMACEN', 'CANCELADA', 'COMPLETADA')
           AND tenant_id = $2
         ORDER BY fechacreacion ASC
         LIMIT 1`,
        [proveedorID, tenantId]
      );

      if (ordenAbiertalResult.rows.length > 0) {
        // Consolidar en orden existente
        ordenCompraID = ordenAbiertalResult.rows[0].ordencompraid;
        console.log(`🔄 [CONSOLIDACIÓN AGRUPADA] Backorders consolidados en OC #${ordenCompraID} para proveedor ${proveedorID}`);
      } else {
        // Crear nueva orden de compra
        esOrdenNueva = true;
        const nuevaOrdenResult = await client.query(
          `INSERT INTO OrdenesDeCompra (
            ProveedorID, 
            FechaEntregaEsperada, 
            Estatus, 
            OrigenOC, 
            usuario_creador_id,
            tenant_id,
            admin_creador_id
          )
          VALUES ($1, NOW() + INTERVAL '14 days', 'Pendiente', 'backorder', $2, $3, $4)
          RETURNING OrdenCompraID`,
          [proveedorID, usuarioCreadorId, tenantId, adminCreadorId]
        );
        ordenCompraID = nuevaOrdenResult.rows[0].ordencompraid;
        console.log(`✨ [NUEVA OC AGRUPADA] Orden #${ordenCompraID} creada para proveedor ${proveedorID}`);
      }
      
      const detallesInsertados = [];

      // PASO 3: Insertar TODOS los productos de este proveedor en la orden
      for (const producto of productos) {
        const productoIdNumero = parseInt(producto.productoID, 10);
        const varianteIdNumero = parseInt(producto.varianteID, 10);
        const cantidadSolicitada = parseInt(producto.cantidadFaltante, 10);

        // Normalizar cantidad según regla de empaque
        const normalizacionResult = await normalizarCantidadPorReglaEmpaque(
          client,
          productoIdNumero,
          cantidadSolicitada
        );

        const cantidadNormalizada = normalizacionResult.cantidadNormalizada;

        // Verificar si ya existe un detalle para esta variante y pedido
        const detalleExistenteResult = await client.query(
          `SELECT detalleoc_id, cantidadsolicitada
           FROM detallesordencompra
           WHERE ordencompraid = $1 
             AND varianteid = $2 
             AND pedido_original_id = $3
           LIMIT 1`,
          [ordenCompraID, varianteIdNumero, pedidoOrigenId]
        );

        let insertResult;
        if (detalleExistenteResult.rows.length > 0) {
          // Actualizar cantidad en detalle existente
          const detalleExistente = detalleExistenteResult.rows[0];
          insertResult = await client.query(
            `UPDATE detallesordencompra
             SET cantidadsolicitada = cantidadsolicitada + $1
             WHERE detalleoc_id = $2
             RETURNING detalleoc_id, cantidadsolicitada`,
            [cantidadNormalizada, detalleExistente.detalleoc_id]
          );
        } else {
          // Insertar nuevo detalle con pedido_original_id
          insertResult = await client.query(
            `INSERT INTO DetallesOrdenCompra 
             (OrdenCompraID, VarianteID, CantidadSolicitada, CantidadRecibida, pedido_original_id)
             VALUES ($1, $2, $3, 0, $4)
             RETURNING DetalleOC_ID, CantidadSolicitada`,
            [ordenCompraID, varianteIdNumero, cantidadNormalizada, pedidoOrigenId]
          );
        }

        detallesInsertados.push({
          detalleOrdenID: insertResult.rows[0].detalleoc_id,
          varianteID: varianteIdNumero,
          productoID: productoIdNumero,
          cantidadSolicitada: cantidadSolicitada,
          cantidadNormalizada: cantidadNormalizada,
          reglaEmpaque: normalizacionResult.reglaEmpaque,
        });
      }

      ordenesGeneradas.push({
        success: true,
        ordenCompraID,
        proveedorID,
        pedidoOrigenId,
        totalProductos: productos.length,
        detalles: detallesInsertados,
        esOrdenNueva,
        consolidada: !esOrdenNueva,
        mensaje: esOrdenNueva
          ? `Orden de compra ${ordenCompraID} creada para proveedor ${proveedorID} con ${productos.length} producto(s) del Pedido #${pedidoOrigenId}`
          : `Backorders consolidados en OC #${ordenCompraID} existente: ${productos.length} producto(s) del Pedido #${pedidoOrigenId}`,
      });
    }

    return ordenesGeneradas;
  } catch (error) {
    console.error('Error en generarBackordersAgrupados:', error);
    throw error;
  }
}

module.exports = {
  generarOrdenCompraAutomatica,
  generarBackorderProveedor,
  generarBackordersAgrupados,
};
