/**
 * COMPRAS PENDIENTES CONTROLLER
 * 
 * Controlador especializado para gestión de órdenes de compra pendientes.
 * Incluye funciones para listar órdenes pendientes y obtener detalles para conteo ciego.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/comprasPendientesController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Conteo Ciego: Listar órdenes de compra pendientes/parciales
 * GET /api/admin/compras/pendientes
 */
const getComprasPendientes = async (req, res) => {
  try {
    const userRole = req.user.rol;
    const userId = req.user.id;

    let whereConditions = ["oc.estatus IN ('Pendiente', 'Parcial')"];
    let queryParams = [];
    let paramIndex = 1;

    // REGLA DE VISIBILIDAD: Admin solo ve sus órdenes, SuperAdmin ve todas
    if (userRole === 'admin') {
      queryParams.push(userId);
      whereConditions.push(`oc.usuario_creador_id = $${paramIndex}`);
      paramIndex++;
    }
    // Si es superadmin, ve todas las órdenes pendientes/parciales

    const whereClause = whereConditions.join(' AND ');

    const result = await db.query(
      `SELECT
         oc.ordencompraid,
         oc.proveedorid,
         oc.fechacreacion,
         oc.fechaentregaesperada,
         oc.estatus,
         p.nombreempresa AS proveedornombre,
         COUNT(doc.detalleoc_id) AS totalproductos
       FROM ordenesdecompra oc
       INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
       LEFT JOIN detallesordencompra doc ON oc.ordencompraid = doc.ordencompraid
       WHERE ${whereClause}
       GROUP BY oc.ordencompraid, oc.proveedorid, oc.fechacreacion, oc.fechaentregaesperada, oc.estatus, p.nombreempresa
       ORDER BY oc.fechacreacion DESC`,
      queryParams
    );

    return res.json({
      success: true,
      data: {
        ordenes: result.rows.map((row) => ({
          ordenCompraId: row.ordencompraid,
          proveedorId: row.proveedorid,
          proveedorNombre: row.proveedornombre,
          fechaCreacion: row.fechacreacion,
          fechaEntregaEsperada: row.fechaentregaesperada,
          estatus: row.estatus,
          totalProductos: Number.parseInt(row.totalproductos ?? 0, 10) || 0,
        })),
        total: result.rows.length,
      },
    });
  } catch (error) {
    logger.error('Error al obtener compras pendientes:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener órdenes de compra pendientes",
    });
  }
};

/**
 * Conteo Ciego: Detalle de OC sin cantidades esperadas
 * GET /api/admin/compras/:id/detalle-ciego
 */
const getCompraDetalleCiego = async (req, res) => {
  try {
    const ordenCompraId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden de compra inválido",
      });
    }

    const ordenResult = await db.query(
      `SELECT
         oc.ordencompraid,
         oc.proveedorid,
         oc.fechacreacion,
         oc.fechaentregaesperada,
         oc.estatus,
         p.nombreempresa AS proveedornombre
       FROM ordenesdecompra oc
       INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
       WHERE oc.ordencompraid = $1`,
      [ordenCompraId]
    );

    if (!ordenResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenResult.rows[0];

    const detallesResult = await db.query(
      `SELECT
         doc.detalleoc_id,
         doc.ordencompraid,
         doc.varianteid,
         pv.productoid,
         pv.sku,
         pr.nombreproducto,
         pi.url_imagen AS imagen
       FROM detallesordencompra doc
       INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
       INNER JOIN productos pr ON pv.productoid = pr.productoid
       LEFT JOIN producto_imagenes pi ON pi.productoid = pr.productoid AND pi.orden = 1
       WHERE doc.ordencompraid = $1
       ORDER BY pr.nombreproducto ASC`,
      [ordenCompraId]
    );

    return res.json({
      success: true,
      data: {
        orden: {
          ordenCompraId: orden.ordencompraid,
          proveedorId: orden.proveedorid,
          proveedorNombre: orden.proveedornombre,
          fechaCreacion: orden.fechacreacion,
          fechaEntregaEsperada: orden.fechaentregaesperada,
          estatus: orden.estatus,
        },
        items: detallesResult.rows.map((row) => ({
          detalleId: row.detalleoc_id,
          ordenCompraId: row.ordencompraid,
          varianteId: row.varianteid,
          productoId: row.productoid,
          sku: row.sku,
          nombreProducto: row.nombreproducto,
          imagen: row.imagen || null,
        })),
      },
    });
  } catch (error) {
    logger.error('Error al obtener detalle ciego de OC:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener detalle de la orden",
    });
  }
};

module.exports = {
  getComprasPendientes,
  getCompraDetalleCiego
};
