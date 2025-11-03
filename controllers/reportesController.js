const db = require('../db');

/**
 * GET /api/admin/reportes/rentabilidad
 * Devuelve la venta, costo y ganancia de cada línea de producto vendida.
 */
const getReporteRentabilidad = async (req, res) => {
  try {
    const query = `
      SELECT 
        dp.DetalleID,
        dp.PedidoID,
        dp.VarianteID,
        pr.ProductoID,
        pr.NombreProducto,
        pv.SKU,
        dp.CantidadSolicitada,
        dp.PiezasTotales,
        dp.PrecioPorPaquete,
        pv.CostoUnitario,
        (dp.PrecioPorPaquete * dp.CantidadSolicitada) AS VentaBruta,
        (pv.CostoUnitario * dp.PiezasTotales) AS CostoTotal,
        (dp.PrecioPorPaquete * dp.CantidadSolicitada) - (pv.CostoUnitario * dp.PiezasTotales) AS GananciaBruta
      FROM DetallesDelPedido dp
      INNER JOIN Producto_Variantes pv ON dp.VarianteID = pv.VarianteID
      INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
      ORDER BY dp.DetalleID ASC
    `;

    const result = await db.query(query);

    return res.json({
      success: true,
      data: result.rows.map(row => ({
        detalleId: row.detalleid,
        pedidoId: row.pedidoid,
        varianteId: row.varianteid,
        productoId: row.productoid,
        nombreProducto: row.nombreproducto,
        sku: row.sku,
        cantidadSolicitada: row.cantidadsolicitada ? parseInt(row.cantidadsolicitada, 10) : 0,
        piezasTotales: row.piezastotales ? parseInt(row.piezastotales, 10) : 0,
        precioPorPaquete: row.precioporpaquete ? parseFloat(row.precioporpaquete) : 0,
        costoUnitario: row.costounitario ? parseFloat(row.costounitario) : 0,
        ventaBruta: row.ventabruta ? parseFloat(row.ventabruta) : 0,
        costoTotal: row.costototal ? parseFloat(row.costototal) : 0,
        gananciaBruta: row.gananciabruta ? parseFloat(row.gananciabruta) : 0
      }))
    });
  } catch (error) {
    console.error('Error al generar reporte de rentabilidad:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al generar el reporte de rentabilidad'
    });
  }
};

module.exports = {
  getReporteRentabilidad
};
