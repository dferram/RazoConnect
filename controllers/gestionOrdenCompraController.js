/**
 * GESTIÓN ORDEN COMPRA CONTROLLER
 * 
 * Controlador especializado para gestión de productos en órdenes de compra.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/gestionOrdenCompraController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener variantes de productos por proveedor
 * GET /api/admin/productos/variantes-proveedor/:proveedorId
 */
const getVariantesProveedor = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const proveedorId = Number.parseInt(req.params.proveedorId, 10);

    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de proveedor inválido",
      });
    }

    const query = `
      SELECT 
        pv.varianteid,
        pv.sku,
        pv.dimensiones,
        pv.costounitario,
        pv.stock,
        pv.preciounitario,
        pv.piezasporpaquete,
        pv.color_nombre,
        pv.color_hex,
        pv.medidaid,
        m.nombremedida,
        p.productoid,
        p.nombreproducto,
        p.descripcion,
        p.categoriaid,
        p.reglaid,
        c.nombre AS categoria_nombre,
        pre.cantidadempaque,
        pi.url_imagen,
        pi.textoalternativo
      FROM producto_variantes pv
      INNER JOIN productos p ON p.productoid = pv.productoid
      LEFT JOIN categorias c ON c.categoriaid = p.categoriaid AND c.tenant_id = $1
      LEFT JOIN medidas m ON m.medidaid = pv.medidaid
      LEFT JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
      LEFT JOIN LATERAL (
        SELECT url_imagen, textoalternativo
        FROM producto_imagenes
        WHERE productoid = p.productoid
        ORDER BY orden ASC NULLS LAST, imagenid ASC
        LIMIT 1
      ) pi ON true
      WHERE p.proveedorid_default = $2
        AND p.tenant_id = $1
        AND pv.activo = true
      ORDER BY p.nombreproducto ASC, pv.sku ASC
    `;

    const result = await db.query(query, [tenant_id, proveedorId]);

    const variantes = result.rows.map(row => ({
      varianteid: row.varianteid,
      sku: row.sku,
      dimensiones: row.dimensiones,
      costounitario: parseFloat(row.costounitario || 0),
      stock: parseInt(row.stock || 0, 10),
      preciounitario: parseFloat(row.preciounitario || 0),
      piezasporpaquete: parseInt(row.piezasporpaquete || 1, 10),
      cantidadempaque: parseInt(row.cantidadempaque || 1, 10),
      color_nombre: row.color_nombre || null,
      color_hex: row.color_hex || null,
      medidaid: row.medidaid,
      nombremedida: row.nombremedida || null,
      productoid: row.productoid,
      nombreproducto: row.nombreproducto,
      descripcion: row.descripcion,
      categoriaid: row.categoriaid,
      categoria: row.categoria_nombre || 'Sin categoría',
      imagen: row.url_imagen || null,
      imagenAlt: row.textoalternativo || null,
    }));

    res.json({
      success: true,
      data: {
        variantes,
        total: variantes.length,
      },
    });
  } catch (error) {
    logger.error('Error al obtener variantes del proveedor:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener variantes del proveedor"
    });
  }
};

/**
 * Agregar producto a una orden de compra existente
 * POST /api/admin/ordenes-compra/:id/agregar-producto
 */
const agregarProductoAOrdenCompra = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const ordenCompraId = Number.parseInt(req.params.id, 10);
    const varianteId = Number.parseInt(req.body?.varianteId, 10);
    const cantidad = Number.parseInt(req.body?.cantidad, 10);

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden de compra inválido",
      });
    }

    if (!Number.isInteger(varianteId) || varianteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de variante inválido",
      });
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad debe ser mayor a 0",
      });
    }

    await client.query("BEGIN");

    const { tenant_id } = req.tenant;

    const ordenResult = await client.query(
      `SELECT oc.ordencompraid, oc.estatus, oc.proveedorid
       FROM ordenesdecompra oc
       WHERE oc.ordencompraid = $1 AND oc.tenant_id = $2
       FOR UPDATE`,
      [ordenCompraId, tenant_id]
    );

    if (!ordenResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenResult.rows[0];
    const estatus = (orden.estatus || "").toString().trim();

    if (!["Pendiente", "Parcial"].includes(estatus)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `No se pueden agregar productos a una orden en estatus '${estatus}'`,
      });
    }

    const varianteResult = await client.query(
      `SELECT pv.varianteid, pv.sku, pv.piezasporpaquete, pv.costounitario, pv.productoid,
              p.nombreproducto, p.proveedorid_default, p.reglaid
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       WHERE pv.varianteid = $1 AND p.tenant_id = $2`,
      [varianteId, tenant_id]
    );

    if (!varianteResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const variante = varianteResult.rows[0];

    if (Number.parseInt(variante.proveedorid_default, 10) !== Number.parseInt(orden.proveedorid, 10)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "El producto no pertenece al proveedor de esta orden",
      });
    }

    let cantidadEmpaque = 1;
    if (variante.reglaid) {
      const reglaResult = await client.query(
        `SELECT cantidadempaque 
         FROM proveedor_reglas_empaque 
         WHERE reglaid = $1`,
        [variante.reglaid]
      );
      
      if (reglaResult.rows.length > 0) {
        cantidadEmpaque = Number.parseInt(reglaResult.rows[0].cantidadempaque, 10) || 1;
      }
    }

    if (cantidad % cantidadEmpaque !== 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `La cantidad debe ser múltiplo de ${cantidadEmpaque} (regla de empaque del proveedor)`,
        data: {
          cantidadEmpaque,
          cantidadSolicitada: cantidad,
        },
      });
    }

    const detalleExistente = await client.query(
      `SELECT detalleoc_id, cantidadsolicitada
       FROM detallesordencompra
       WHERE ordencompraid = $1 AND varianteid = $2`,
      [ordenCompraId, varianteId]
    );

    const piezasPorPaquete = Number.parseInt(variante.piezasporpaquete, 10) || 1;
    const costoUnitario = Number.parseFloat(variante.costounitario) || 0;

    if (detalleExistente.rows.length > 0) {
      const cantidadActual = Number.parseInt(detalleExistente.rows[0].cantidadsolicitada, 10) || 0;
      const nuevaCantidad = cantidadActual + cantidad;

      await client.query(
        `UPDATE detallesordencompra
         SET cantidadsolicitada = $1
         WHERE detalleoc_id = $2`,
        [nuevaCantidad, detalleExistente.rows[0].detalleoc_id]
      );
    } else {
      await client.query(
        `INSERT INTO detallesordencompra (
          ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida,
          piezasrecibidas, piezasporpaquete, costounitario
        ) VALUES ($1, $2, $3, 0, 0, $4, $5)`,
        [ordenCompraId, varianteId, cantidad, piezasPorPaquete, costoUnitario]
      );
    }

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Producto agregado a la orden exitosamente",
      data: {
        ordenCompraId,
        varianteId,
        cantidad,
        nombreProducto: variante.nombreproducto,
        sku: variante.sku,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error agregando producto a orden de compra:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al agregar producto a la orden"
    });
  } finally {
    client.release();
  }
};

/**
 * Quitar producto de una orden de compra
 * DELETE /api/admin/ordenes-compra/:id/quitar-producto/:detalleId
 */
const quitarProductoDeOrdenCompra = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const ordenCompraId = Number.parseInt(req.params.id, 10);
    const detalleId = Number.parseInt(req.params.detalleId, 10);

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden de compra inválido",
      });
    }

    if (!Number.isInteger(detalleId) || detalleId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de detalle inválido",
      });
    }

    await client.query("BEGIN");

    const { tenant_id } = req.tenant;

    const ordenResult = await client.query(
      `SELECT oc.ordencompraid, oc.estatus
       FROM ordenesdecompra oc
       WHERE oc.ordencompraid = $1 AND oc.tenant_id = $2
       FOR UPDATE`,
      [ordenCompraId, tenant_id]
    );

    if (!ordenResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenResult.rows[0];
    const estatus = (orden.estatus || "").toString().trim();

    if (!["Pendiente", "Parcial"].includes(estatus)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `No se pueden quitar productos de una orden en estatus '${estatus}'`,
      });
    }

    const detalleResult = await client.query(
      `SELECT doc.detalleoc_id, doc.piezasrecibidas, pv.sku, pr.nombreproducto
       FROM detallesordencompra doc
       INNER JOIN producto_variantes pv ON pv.varianteid = doc.varianteid
       INNER JOIN productos pr ON pr.productoid = pv.productoid
       WHERE doc.detalleoc_id = $1 AND doc.ordencompraid = $2
       FOR UPDATE`,
      [detalleId, ordenCompraId]
    );

    if (!detalleResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Detalle no encontrado en esta orden",
      });
    }

    const detalle = detalleResult.rows[0];
    const piezasRecibidas = Number.parseInt(detalle.piezasrecibidas, 10) || 0;

    if (piezasRecibidas > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "No se puede quitar un producto que ya ha sido recibido parcial o totalmente",
      });
    }

    await client.query(
      `DELETE FROM detallesordencompra WHERE detalleoc_id = $1`,
      [detalleId]
    );

    const detallesRestantes = await client.query(
      `SELECT COUNT(*) as total FROM detallesordencompra WHERE ordencompraid = $1`,
      [ordenCompraId]
    );

    const totalDetalles = Number.parseInt(detallesRestantes.rows[0]?.total, 10) || 0;

    if (totalDetalles === 0) {
      await client.query(
        `UPDATE ordenesdecompra SET estatus = 'Cancelada' WHERE ordencompraid = $1`,
        [ordenCompraId]
      );
    }

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Producto quitado de la orden exitosamente",
      data: {
        detalleId,
        nombreProducto: detalle.nombreproducto,
        sku: detalle.sku,
        ordenCancelada: totalDetalles === 0,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error quitando producto de orden de compra:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al quitar producto de la orden"
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getVariantesProveedor,
  agregarProductoAOrdenCompra,
  quitarProductoDeOrdenCompra
};
