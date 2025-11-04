const db = require('../db');

/**
 * GET /api/admin/reportes/rentabilidad
 * Devuelve la venta, costo y ganancia de cada línea de producto vendida.
 */
const getReporteRentabilidad = async (req, res) => {
  try {
    const { desde, hasta } = req.query;

    const filters = [];
    const params = [];

    if (desde && !Number.isNaN(Date.parse(desde))) {
      params.push(desde);
      filters.push(`p.FechaPedido >= $${params.length}`);
    }

    if (hasta && !Number.isNaN(Date.parse(hasta))) {
      params.push(hasta);
      filters.push(`p.FechaPedido <= $${params.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const query = `
      SELECT 
        dp.DetalleID,
        dp.PedidoID,
        dp.VarianteID,
        pr.ProductoID,
        pr.NombreProducto,
        pv.SKU,
        p.FechaPedido,
        p.CostoEnvio,
        dp.CantidadPaquetes,
        dp.PiezasTotales,
        dp.PrecioPorPaquete,
        pv.CostoUnitario,
        c.MontoComision,
        (dp.PrecioPorPaquete * dp.CantidadPaquetes) AS VentaBruta,
        (pv.CostoUnitario * dp.PiezasTotales) AS CostoTotal,
        (dp.PrecioPorPaquete * dp.CantidadPaquetes) - (pv.CostoUnitario * dp.PiezasTotales) AS GananciaBruta,
        ((dp.PrecioPorPaquete * dp.CantidadPaquetes) - (pv.CostoUnitario * dp.PiezasTotales)) - COALESCE(p.CostoEnvio, 0) - COALESCE(c.MontoComision, 0) AS GananciaNeta
      FROM DetallesDelPedido dp
      INNER JOIN Pedidos p ON dp.PedidoID = p.PedidoID
      INNER JOIN Producto_Variantes pv ON dp.VarianteID = pv.VarianteID
      INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
      LEFT JOIN Comisiones c ON dp.PedidoID = c.PedidoID
      ${whereClause}
      ORDER BY p.FechaPedido DESC, dp.DetalleID ASC
    `;

    const result = await db.query(query, params);

    return res.json({
      success: true,
      data: result.rows.map(row => ({
        detalleId: row.detalleid,
        pedidoId: row.pedidoid,
        varianteId: row.varianteid,
        productoId: row.productoid,
        nombreProducto: row.nombreproducto,
        sku: row.sku,
        fechaPedido: row.fechapedido,
        costoEnvio: row.costoenvio !== null ? parseFloat(row.costoenvio) : 0,
        comision: row.montocomision !== null ? parseFloat(row.montocomision) : 0,
        cantidadPaquetes: row.cantidadpaquetes ? parseInt(row.cantidadpaquetes, 10) : 0,
        piezasTotales: row.piezastotales ? parseInt(row.piezastotales, 10) : 0,
        precioPorPaquete: row.precioporpaquete ? parseFloat(row.precioporpaquete) : 0,
        costoUnitario: row.costounitario ? parseFloat(row.costounitario) : 0,
        ventaBruta: row.ventabruta ? parseFloat(row.ventabruta) : 0,
        costoTotal: row.costototal ? parseFloat(row.costototal) : 0,
        gananciaBruta: row.gananciabruta ? parseFloat(row.gananciabruta) : 0,
        gananciaNeta: row.ganancianeta ? parseFloat(row.ganancianeta) : 0
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

/**
 * GET /api/admin/reportes/valuacion-inventario
 * Devuelve el valor total del inventario disponible.
 */
const getValuacionInventario = async (req, res) => {
  try {
    const query = `
      SELECT COALESCE(SUM(Stock * (CostoUnitario * PiezasPorPaquete)), 0) AS valor_total
      FROM Producto_Variantes
      WHERE Stock > 0
    `;

    const result = await db.query(query);
    const valorTotal = result.rows.length ? parseFloat(result.rows[0].valor_total) : 0;

    return res.json({
      success: true,
      data: {
        valorTotal
      }
    });
  } catch (error) {
    console.error('Error al calcular la valuación de inventario:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al calcular la valuación de inventario'
    });
  }
};

const getAgingBackorders = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.PedidoID,
        p.FechaPedido,
        p.Estatus AS estatus_surtido,
        DATE_PART('day', CURRENT_TIMESTAMP - p.FechaPedido) AS dias_pendiente,
        c.Nombre || ' ' || c.Apellido AS cliente
      FROM Pedidos p
      INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
      WHERE p.Estatus IN ('Surtido Parcial', 'Pendiente')
      ORDER BY dias_pendiente DESC
    `;

    const result = await db.query(query);

    return res.json({
      success: true,
      data: result.rows.map(row => ({
        pedidoId: row.pedidoid,
        fechaPedido: row.fechapedido,
        estatusSurtido: row.estatus_surtido,
        diasPendiente: row.dias_pendiente !== null ? parseInt(row.dias_pendiente, 10) : 0,
        cliente: row.cliente
      }))
    });
  } catch (error) {
    console.error('Error al generar reporte de aging de backorders:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al generar el reporte de aging de backorders'
    });
  }
};

module.exports = {
  getReporteRentabilidad,
  getValuacionInventario,
  getAgingBackorders
};
