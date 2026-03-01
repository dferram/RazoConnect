const db = require("../db");
const logger = require('../utils/logger');

/**
 * GET /api/admin/reportes/rentabilidad
 * Devuelve la venta, costo y ganancia de cada línea de producto vendida.
 */
const getReporteRentabilidad = async (req, res) => {
  try {
    const { desde, hasta, estadoID } = req.query;

    // Definir candidatos de campos para extraer valores del JSON de tamaño
    const valueCandidates = [
      "valor",
      "cantidad",
      "piezas",
      "piezasporpaquete",
      "numeropiezas",
      "tamano",
      "cantidadpiezas",
    ];

    const labelCandidates = ["etiqueta", "descripcion", "nombre", "label"];

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
        (SELECT COALESCE(SUM(c.MontoComision), 0) FROM comisiones c WHERE c.pedidoid = p.pedidoid) AS MontoComisionPedido,
        (pv.PrecioUnitario * dp.PiezasTotales) AS VentaBruta,
        (pv.CostoUnitario * dp.PiezasTotales) AS CostoTotal,
        (pv.PrecioUnitario * dp.PiezasTotales) - (pv.CostoUnitario * dp.PiezasTotales) AS GananciaBruta
      FROM detallesdelpedido dp
      INNER JOIN pedidos p ON dp.pedidoid = p.pedidoid
      ${estadoJoinClause}
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
      INNER JOIN productos pr ON pv.productoid = pr.productoid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = dp.tamanoid
      ${whereClause}
      ORDER BY p.fechapedido DESC, dp.detalleid ASC
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
            row.montocomisionpedido !== null ? parseFloat(row.montocomisionpedido) : 0,
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
          gananciaNeta: row.gananciabruta ? parseFloat(row.gananciabruta) : 0,
        };
      }),
    });
  } catch (error) {
    logger.error('Error al generar reporte de rentabilidad:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
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
/**
 * GET /api/admin/reportes/valuacion-inventario
 * Devuelve el valor total del inventario disponible.
 * ✅ CORREGIDO: Ahora usa stock_admin para admin regular, stock global para Super Admin
 */
const getValuacionInventario = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const userId = req.user?.id;
    const userRol = req.user?.rol?.toLowerCase();
    const isSuperAdmin = userRol === 'superadmin' || userRol === 'super-admin' || userRol === 'super_admin' || userRol === 'developer';

    let result;

    if (isSuperAdmin) {
      // ✅ Super Admin: Ver valuación de inventario GLOBAL
      const query = `
        SELECT 
          COALESCE(SUM(pv.Stock * pv.CostoUnitario), 0) AS valor_costo,
          COALESCE(SUM(pv.Stock * pv.PrecioUnitario), 0) AS valor_venta
        FROM Producto_Variantes pv
        INNER JOIN Productos p ON pv.ProductoID = p.ProductoID
        WHERE pv.Stock > 0
        AND p.tenant_id = $1
      `;
      result = await db.query(query, [tenant_id]);
      console.log(`📊 [Valuación] Super Admin - Inventario GLOBAL`);
    } else {
      // ✅ Admin regular: Ver valuación de SU inventario (stock_admin)
      const query = `
        SELECT 
          COALESCE(SUM(sa.cantidad * pv.CostoUnitario), 0) AS valor_costo,
          COALESCE(SUM(sa.cantidad * pv.PrecioUnitario), 0) AS valor_venta
        FROM stock_admin sa
        INNER JOIN Producto_Variantes pv ON sa.variante_id = pv.VarianteID
        INNER JOIN Productos p ON pv.ProductoID = p.ProductoID
        WHERE sa.cantidad > 0
        AND sa.tenant_id = $1
        AND sa.admin_id = $2
      `;
      result = await db.query(query, [tenant_id, userId]);
      console.log(`📊 [Valuación] Admin ${userId} - Inventario LOCAL`);
    }

    const row = result.rows[0] || {};
    const valorCosto =
      row.valor_costo !== undefined ? parseFloat(row.valor_costo) : 0;
    const valorVenta =
      row.valor_venta !== undefined ? parseFloat(row.valor_venta) : 0;

    console.log(`📊 [Valuación] Resultado: Venta=$${valorVenta}, Costo=$${valorCosto}`);

    return res.json({
      success: true,
      data: {
        valorTotal: valorVenta,
        valorVenta,
        valorCosto,
        isSuperAdmin // ✅ Indicar al frontend si es Super Admin
      },
    });
  } catch (error) {
    logger.error('❌ Error al calcular la valuación de inventario:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
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
    logger.error('Error al generar reporte de aging de backorders:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
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
