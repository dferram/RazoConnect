/**
 * REPORTES ÓRDENES COMPRA CONTROLLER
 * 
 * Controlador especializado para reportes de órdenes de compra.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/reportesOrdenesCompraController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener órdenes de compra para reportes con estado de recepción
 * GET /api/admin/ordenes-compra/reportes
 */
async function getOrdenesCompraReportes(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const userId = req.user.id;
    const userRol = req.user.rol;

    // Filtro por admin si no es super admin
    let adminFilter = '';
    const queryParams = [tenant_id];

    if (userRol !== 'superadmin') {
      queryParams.push(userId);
      adminFilter = `AND oc.admin_creador_id = $${queryParams.length}`;
    }

    const result = await db.query(
      `SELECT 
         oc.ordencompraid,
         oc.proveedorid,
         oc.fechacreacion,
         oc.estatus,
         oc.admin_creador_id,
         p.nombreempresa AS proveedor_nombre,
         a.nombre AS admin_nombre,
         COUNT(DISTINCT doc.detalleoc_id) AS total_productos,
         COALESCE(SUM(doc.cantidadsolicitada * pv.piezasporpaquete), 0) AS piezas_solicitadas,
         COALESCE(SUM(doc.cantidadrecibida * pv.piezasporpaquete), 0) AS piezas_recibidas,
         MAX(li.fecha) AS ultima_recepcion,
         COUNT(DISTINCT li.logid) AS total_recepciones,
         CASE 
           WHEN COALESCE(SUM(doc.cantidadrecibida), 0) = 0 THEN 'Pendiente'
           WHEN COALESCE(SUM(doc.cantidadrecibida), 0) >= COALESCE(SUM(doc.cantidadsolicitada), 0) THEN 'Completa'
           ELSE 'Parcial'
         END AS estado_recepcion
       FROM ordenesdecompra oc
       INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
       LEFT JOIN administradores a ON oc.admin_creador_id = a.adminid
       LEFT JOIN detallesordencompra doc ON oc.ordencompraid = doc.ordencompraid
       LEFT JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
       LEFT JOIN log_inventario li ON li.orden_compra_id = oc.ordencompraid AND li.tipo_origen = 'ORDEN_COMPRA'
       WHERE oc.tenant_id = $1 ${adminFilter}
       GROUP BY oc.ordencompraid, oc.proveedorid, oc.fechacreacion, oc.estatus, oc.admin_creador_id, p.nombreempresa, a.nombre
       ORDER BY oc.fechacreacion DESC`,
      queryParams
    );

    return res.json({
      success: true,
      ordenes: result.rows
    });
  } catch (error) {
    logger.error('Error al obtener órdenes para reportes:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: 'Error al obtener órdenes de compra'
    });
  }
}

/**
 * Obtener detalle completo de una orden para reporte PDF
 * GET /api/admin/ordenes-compra/:id/reporte-detallado
 */
async function getOrdenCompraReporteDetallado(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const ordenId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(ordenId) || ordenId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de orden inválido'
      });
    }

    // Obtener información de la orden
    const ordenResult = await db.query(
      `SELECT 
         oc.ordencompraid,
         oc.proveedorid,
         oc.fechacreacion,
         oc.fechaentregaesperada,
         oc.estatus,
         oc.admin_creador_id,
         p.nombreempresa AS proveedor_nombre,
         a.nombre AS admin_nombre,
         CASE 
           WHEN COALESCE(SUM(doc.cantidadrecibida), 0) = 0 THEN 'Pendiente'
           WHEN COALESCE(SUM(doc.cantidadrecibida), 0) >= COALESCE(SUM(doc.cantidadsolicitada), 0) THEN 'Completa'
           ELSE 'Parcial'
         END AS estado_recepcion
       FROM ordenesdecompra oc
       INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
       LEFT JOIN administradores a ON oc.admin_creador_id = a.adminid
       LEFT JOIN detallesordencompra doc ON oc.ordencompraid = doc.ordencompraid
       WHERE oc.ordencompraid = $1 AND oc.tenant_id = $2
       GROUP BY oc.ordencompraid, oc.proveedorid, oc.fechacreacion, oc.fechaentregaesperada, oc.estatus, oc.admin_creador_id, p.nombreempresa, a.nombre`,
      [ordenId, tenant_id]
    );

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Orden de compra no encontrada'
      });
    }

    // Obtener detalles de productos con información completa
    const detallesResult = await db.query(
      `SELECT 
         doc.detalleoc_id AS detalleordencompraid,
         doc.varianteid,
         doc.cantidadsolicitada AS cantidad_solicitada,
         doc.cantidadrecibida AS cantidad_recibida,
         doc.piezasporpaquete AS piezas_por_paquete,
         doc.costounitario,
         doc.cerrado_por_merma,
         doc.fecha_cierre_merma,
         doc.motivo_discrepancia,
         doc.tipo_discrepancia,
         pv.sku,
         pv.dimensiones,
         pv.preciounitario,
         pv.color_nombre AS color,
         p.nombreproducto,
         c.nombre AS categoria,
         COALESCE(
           (SELECT pvi.url_imagen 
            FROM producto_variante_imagenes pvi 
            WHERE pvi.varianteid = pv.varianteid 
            ORDER BY pvi.orden 
            LIMIT 1),
           (SELECT pi.url_imagen 
            FROM producto_imagenes pi 
            WHERE pi.productoid = p.productoid 
            ORDER BY pi.orden 
            LIMIT 1)
         ) AS imagen_url
       FROM detallesordencompra doc
       INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
       INNER JOIN productos p ON pv.productoid = p.productoid
       LEFT JOIN categorias c ON p.categoriaid = c.categoriaid
       WHERE doc.ordencompraid = $1
       ORDER BY doc.cerrado_por_merma ASC, p.nombreproducto, pv.dimensiones`,
      [ordenId]
    );

    // Separar productos recibidos y faltantes
    const productosRecibidos = [];
    const productosFaltantes = [];

    detallesResult.rows.forEach(detalle => {
      const piezasPorPaquete = parseInt(detalle.piezas_por_paquete, 10) || 1;
      const costoUnitario = parseFloat(detalle.costounitario) || 0;
      const precioUnitario = parseFloat(detalle.preciounitario) || 0;

      if (detalle.cerrado_por_merma) {
        // Producto faltante (cerrado por merma)
        const cantidadFaltante = detalle.cantidad_solicitada - detalle.cantidad_recibida;
        const piezasFaltantes = cantidadFaltante * piezasPorPaquete;
        
        productosFaltantes.push({
          ...detalle,
          cantidadFaltante,
          piezasFaltantes,
          totalCosto: piezasFaltantes * costoUnitario,
          totalVenta: piezasFaltantes * precioUnitario
        });
      }

      // Siempre agregar productos recibidos (si se recibió algo)
      if (detalle.cantidad_recibida > 0) {
        const piezasRecibidas = detalle.cantidad_recibida * piezasPorPaquete;
        
        productosRecibidos.push({
          ...detalle,
          piezasRecibidas,
          totalCosto: piezasRecibidas * costoUnitario,
          totalVenta: piezasRecibidas * precioUnitario
        });
      }
    });

    // Obtener información de sesión (quien trabajó en la recepción)
    const sesionResult = await db.query(
      `SELECT 
         a.nombre AS responsable,
         a.email AS responsable_email,
         MAX(doc.fecha_cierre_merma) AS fecha_ultima_actualizacion
       FROM detallesordencompra doc
       INNER JOIN ordenesdecompra oc ON doc.ordencompraid = oc.ordencompraid
       LEFT JOIN administradores a ON oc.admin_creador_id = a.adminid
       WHERE doc.ordencompraid = $1
       GROUP BY a.nombre, a.email`,
      [ordenId]
    );

    // Calcular totales
    const totalPiezasRecibidas = productosRecibidos.reduce((sum, p) => sum + (p.piezasRecibidas || 0), 0);
    const totalPaquetesRecibidos = productosRecibidos.reduce((sum, p) => sum + (p.cantidad_recibida || 0), 0);
    const totalInversion = productosRecibidos.reduce((sum, p) => sum + (p.totalCosto || 0), 0);
    const totalVentaEsperada = productosRecibidos.reduce((sum, p) => sum + (p.totalVenta || 0), 0);

    const totalPiezasFaltantes = productosFaltantes.reduce((sum, p) => sum + (p.piezasFaltantes || 0), 0);
    const totalCostoFaltantes = productosFaltantes.reduce((sum, p) => sum + (p.totalCosto || 0), 0);

    return res.json({
      success: true,
      orden: {
        ...ordenResult.rows[0],
        detalles: detallesResult.rows,
        productosRecibidos,
        productosFaltantes,
        sesion: sesionResult.rows[0] || null,
        totales: {
          totalPiezas: totalPiezasRecibidas,
          totalPaquetes: totalPaquetesRecibidos,
          totalInversion,
          totalVentaEsperada,
          totalPiezasFaltantes,
          totalCostoFaltantes,
          margenEsperado: totalVentaEsperada - totalInversion
        }
      }
    });
  } catch (error) {
    logger.error('Error al obtener detalle de orden:', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: 'Error al obtener detalle de la orden'
    });
  }
}

module.exports = {
  getOrdenesCompraReportes,
  getOrdenCompraReporteDetallado
};
