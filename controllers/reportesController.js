const db = require("../db");

/**
 * GET /api/admin/reportes/rentabilidad
 * Devuelve la venta, costo y ganancia de cada línea de producto vendida.
 */
const getReporteRentabilidad = async (req, res) => {
  try {
    const { desde, hasta, estadoID } = req.query;

    const filters = [];
    const params = [];
    let estadoJoinClause = "";

    if (desde && !Number.isNaN(Date.parse(desde))) {
      params.push(desde);
      filters.push(`p.FechaPedido >= $${params.length}`);
    }

    if (hasta && !Number.isNaN(Date.parse(hasta))) {
      params.push(hasta);
      filters.push(`p.FechaPedido <= $${params.length}`);
    }

    const estadoIdParsed =
      estadoID !== undefined && estadoID !== null
        ? parseInt(estadoID, 10)
        : NaN;
    if (!Number.isNaN(estadoIdParsed)) {
      params.push(estadoIdParsed);
      filters.push(`cd.EstadoID = $${params.length}`);
      estadoJoinClause = `
        INNER JOIN Cliente_Direcciones cd ON p.DireccionEnvioID = cd.DireccionID
      `;
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

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
        dp.TamanoID,
        row_to_json(t) AS TamanoInfo,
        dp.PiezasTotales,
        pv.PrecioUnitario AS PrecioUnitarioAplicado,
        pv.CostoUnitario,
        pv.PrecioUnitario AS PrecioUnitarioActual,
        c.MontoComision,
        (pv.PrecioUnitario * dp.PiezasTotales) AS VentaBruta,
        (pv.CostoUnitario * dp.PiezasTotales) AS CostoTotal,
        (pv.PrecioUnitario * dp.PiezasTotales) - (pv.CostoUnitario * dp.PiezasTotales) AS GananciaBruta,
        ((pv.PrecioUnitario * dp.PiezasTotales) - (pv.CostoUnitario * dp.PiezasTotales)) - COALESCE(p.CostoEnvio, 0) - COALESCE(c.MontoComision, 0) AS GananciaNeta
      FROM DetallesDelPedido dp
      INNER JOIN Pedidos p ON dp.PedidoID = p.PedidoID
      ${estadoJoinClause}
      INNER JOIN Producto_Variantes pv ON dp.VarianteID = pv.VarianteID
      INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
      LEFT JOIN Cat_TamanoPaquetes t ON t.TamanoID = dp.TamanoID
      LEFT JOIN Comisiones c ON dp.PedidoID = c.PedidoID
      ${whereClause}
      ORDER BY p.FechaPedido DESC, dp.DetalleID ASC
    `;

    const result = await db.query(query, params);

    return res.json({
      success: true,
      data: result.rows.map((row) => {
        const tamanoInfo = row.tamanoinfo || {};

        let tamanoValor = null;
        for (const key of valueCandidates) {
          if (Object.prototype.hasOwnProperty.call(tamanoInfo, key)) {
            const parsed = parseInt(tamanoInfo[key], 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              tamanoValor = parsed;
              break;
            }
          }

          const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
          if (Object.prototype.hasOwnProperty.call(tamanoInfo, capitalized)) {
            const parsed = parseInt(tamanoInfo[capitalized], 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              tamanoValor = parsed;
              break;
            }
          }
        }

        let tamanoEtiqueta = null;
        for (const key of labelCandidates) {
          if (
            Object.prototype.hasOwnProperty.call(tamanoInfo, key) &&
            tamanoInfo[key]
          ) {
            tamanoEtiqueta = String(tamanoInfo[key]).trim();
            if (tamanoEtiqueta) break;
          }

          const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
          if (
            Object.prototype.hasOwnProperty.call(tamanoInfo, capitalized) &&
            tamanoInfo[capitalized]
          ) {
            tamanoEtiqueta = String(tamanoInfo[capitalized]).trim();
            if (tamanoEtiqueta) break;
          }
        }

        const piezasTotales = row.piezastotales
          ? parseInt(row.piezastotales, 10)
          : 0;
        const cantidadDerivada =
          tamanoValor && tamanoValor > 0
            ? Math.round(piezasTotales / tamanoValor)
            : null;
        const presentacion = (() => {
          if (tamanoEtiqueta) {
            return tamanoEtiqueta;
          }
          if (tamanoValor === 1) {
            return "Pieza individual";
          }
          if (tamanoValor && tamanoValor > 1) {
            return `Pack de ${tamanoValor}`;
          }
          return "Presentación estándar";
        })();

        return {
          detalleId: row.detalleid,
          pedidoId: row.pedidoid,
          varianteId: row.varianteid,
          productoId: row.productoid,
          nombreProducto: row.nombreproducto,
          sku: row.sku,
          fechaPedido: row.fechapedido,
          costoEnvio: row.costoenvio !== null ? parseFloat(row.costoenvio) : 0,
          comision:
            row.montocomision !== null ? parseFloat(row.montocomision) : 0,
          cantidadPaquetes: cantidadDerivada !== null ? cantidadDerivada : 0,
          tamanoId: row.tamanoid !== null ? parseInt(row.tamanoid, 10) : null,
          tamanoValor,
          tamanoEtiqueta,
          presentacion,
          piezasTotales,
          precioUnitarioAplicado: row.preciounitarioaplicado
            ? parseFloat(row.preciounitarioaplicado)
            : 0,
          costoUnitario: row.costounitario ? parseFloat(row.costounitario) : 0,
          precioUnitarioActual: row.preciounitarioactual
            ? parseFloat(row.preciounitarioactual)
            : null,
          ventaBruta: row.ventabruta ? parseFloat(row.ventabruta) : 0,
          costoTotal: row.costototal ? parseFloat(row.costototal) : 0,
          gananciaBruta: row.gananciabruta ? parseFloat(row.gananciabruta) : 0,
          gananciaNeta: row.ganancianeta ? parseFloat(row.ganancianeta) : 0,
        };
      }),
    });
  } catch (error) {
    console.error("Error al generar reporte de rentabilidad:", error);
    return res.status(500).json({
      success: false,
      message: "Error al generar el reporte de rentabilidad",
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
      SELECT 
        COALESCE(SUM(Stock * CostoUnitario), 0) AS valor_costo,
        COALESCE(SUM(Stock * PrecioUnitario), 0) AS valor_venta
      FROM Producto_Variantes
      WHERE Stock > 0
    `;

    const result = await db.query(query);
    const row = result.rows[0] || {};
    const valorCosto =
      row.valor_costo !== undefined ? parseFloat(row.valor_costo) : 0;
    const valorVenta =
      row.valor_venta !== undefined ? parseFloat(row.valor_venta) : 0;

    return res.json({
      success: true,
      data: {
        valorTotal: valorVenta,
        valorVenta,
        valorCosto,
      },
    });
  } catch (error) {
    console.error("Error al calcular la valuación de inventario:", error);
    return res.status(500).json({
      success: false,
      message: "Error al calcular la valuación de inventario",
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
      data: result.rows.map((row) => ({
        pedidoId: row.pedidoid,
        fechaPedido: row.fechapedido,
        estatusSurtido: row.estatus_surtido,
        diasPendiente:
          row.dias_pendiente !== null ? parseInt(row.dias_pendiente, 10) : 0,
        cliente: row.cliente,
      })),
    });
  } catch (error) {
    console.error("Error al generar reporte de aging de backorders:", error);
    return res.status(500).json({
      success: false,
      message: "Error al generar el reporte de aging de backorders",
    });
  }
};

module.exports = {
  getReporteRentabilidad,
  getValuacionInventario,
  getAgingBackorders,
};
