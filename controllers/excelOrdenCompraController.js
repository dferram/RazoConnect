/**
 * EXCEL ORDEN COMPRA CONTROLLER
 * 
 * Controlador para exportar detalles de órdenes de compra a Excel.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/excelOrdenCompraController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');

const getOrderDetailsForExcel = async (req, res) => {
  try {
    const ordenCompraId = parseInt(req.params.id, 10);

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden inválido",
      });
    }

    const ordenQuery = `
      SELECT 
        oc.OrdenCompraID,
        oc.ProveedorID,
        oc.FechaCreacion,
        oc.FechaEntregaEsperada,
        oc.Estatus,
        oc.Total,
        p.NombreEmpresa as ProveedorNombre,
        p.RFC as ProveedorRFC,
        p.Telefono as ProveedorTelefono,
        p.Email as ProveedorEmail
      FROM OrdenesDeCompra oc
      INNER JOIN Proveedores p ON oc.ProveedorID = p.ProveedorID
      WHERE oc.OrdenCompraID = $1
    `;

    const ordenResult = await db.query(ordenQuery, [ordenCompraId]);

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenResult.rows[0];

    if (req.user.rol !== 'superadmin' && orden.usuario_creador_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para acceder a esta orden",
      });
    }

    const detallesQuery = `
      SELECT 
        doc.DetalleOC_ID,
        doc.VarianteID,
        doc.CantidadSolicitada,
        doc.CantidadRecibida,
        doc.PiezasPorPaquete,
        doc.CostoUnitario,
        pv.SKU,
        pv.Dimensiones,
        pr.NombreProducto,
        pr.Descripcion as ProductoDescripcion,
        (doc.CantidadSolicitada * doc.PiezasPorPaquete) as TotalPiezas,
        (doc.CantidadSolicitada * doc.CostoUnitario) as Subtotal
      FROM DetallesOrdenCompra doc
      INNER JOIN Producto_Variantes pv ON doc.VarianteID = pv.VarianteID
      INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
      WHERE doc.OrdenCompraID = $1
      ORDER BY doc.DetalleOC_ID ASC
    `;

    const detallesResult = await db.query(detallesQuery, [ordenCompraId]);

    res.json({
      success: true,
      message: "Datos de orden obtenidos exitosamente",
      data: {
        orden: {
          ordenCompraId: orden.ordencompraid,
          proveedorId: orden.proveedorid,
          proveedorNombre: orden.proveedornombre,
          proveedorRFC: orden.proveedorrfc,
          proveedorTelefono: orden.proveedortelefono,
          proveedorEmail: orden.proveedoremail,
          fechaCreacion: orden.fechacreacion,
          fechaEntregaEsperada: orden.fechaentregaesperada,
          estatus: orden.estatus,
          total: parseFloat(orden.total || 0),
        },
        productos: detallesResult.rows.map(d => ({
          detalleOcId: d.detalleoc_id,
          varianteId: d.varianteid,
          sku: d.sku,
          nombreProducto: d.nombreproducto,
          descripcion: d.productodescripcion,
          dimensiones: d.dimensiones,
          cantidadSolicitada: d.cantidadsolicitada,
          cantidadRecibida: d.cantidadrecibida,
          piezasPorPaquete: d.piezasporpaquete,
          costoUnitario: parseFloat(d.costounitario || 0),
          totalPiezas: parseInt(d.totalpiezas || 0),
          subtotal: parseFloat(d.subtotal || 0),
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener detalles para Excel:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener detalles de la orden",
    });
  }
};

module.exports = {
  getOrderDetailsForExcel
};
