const db = require("../db");

const obtenerSugerencias = async (req, res) => {
  try {
    const query = `
      WITH en_transito AS (
        SELECT
          doc.varianteid,
          SUM(GREATEST(doc.cantidadsolicitada - doc.cantidadrecibida, 0))::int AS entransito
        FROM detallesordencompra doc
        INNER JOIN ordenesdecompra oc
          ON oc.ordencompraid = doc.ordencompraid
        WHERE oc.estatus IN ('Pendiente', 'Parcial')
          AND COALESCE(oc.origenoc, 'manual') <> 'backorder'
        GROUP BY doc.varianteid
      )
      SELECT
        pv.varianteid,
        pv.sku,
        pv.stock,
        pv.stock_minimo,
        pv.productoid,
        pv.tipoproductoid,
        pv.activo AS variante_activa,
        p.nombreproducto,
        p.proveedorid_default,
        p.activo AS producto_activo,
        pr.proveedorid,
        pr.nombreempresa,
        COALESCE(et.entransito, 0) AS entransito,
        COALESCE(pre.cantidadempaque, 1) AS cantidadempaque
      FROM producto_variantes pv
      INNER JOIN productos p
        ON p.productoid = pv.productoid
      LEFT JOIN proveedores pr
        ON pr.proveedorid = p.proveedorid_default
      LEFT JOIN en_transito et
        ON et.varianteid = pv.varianteid
      LEFT JOIN proveedor_reglas_empaque pre
        ON pre.proveedorid = p.proveedorid_default
       AND pre.tipoproductoid = pv.tipoproductoid
      WHERE p.activo = TRUE
        AND pv.activo = TRUE
        AND COALESCE(pv.stock_minimo, 0) > 0
      ORDER BY pr.nombreempresa ASC NULLS LAST, pr.proveedorid ASC NULLS LAST, pv.varianteid ASC
    `;

    const result = await db.query(query);
    const rows = Array.isArray(result.rows) ? result.rows : [];

    const grouped = new Map();

    for (const row of rows) {
      const stockFisico = Number.parseInt(row.stock, 10);
      const stockMinimo = Number.parseInt(row.stock_minimo, 10);
      const enTransito = Number.parseInt(row.entransito, 10);

      const stockFisicoFinal = Number.isInteger(stockFisico) ? stockFisico : 0;
      const stockMinimoFinal = Number.isInteger(stockMinimo) ? stockMinimo : 0;
      const enTransitoFinal = Number.isInteger(enTransito) ? enTransito : 0;

      const existencia = stockFisicoFinal + enTransitoFinal;
      const deficit = stockMinimoFinal - existencia;

      if (!(deficit > 0)) {
        continue;
      }

      const cantidadEmpaqueRaw = Number.parseInt(row.cantidadempaque, 10);
      const cantidadEmpaque =
        Number.isInteger(cantidadEmpaqueRaw) && cantidadEmpaqueRaw > 0
          ? cantidadEmpaqueRaw
          : 1;

      const sugerenciaCompra =
        Math.ceil(deficit / cantidadEmpaque) * cantidadEmpaque;

      const proveedorId = row.proveedorid_default || row.proveedorid || null;
      const proveedorKey = proveedorId === null ? "SIN_PROVEEDOR" : String(proveedorId);

      const nombreEmpresa = (row.nombreempresa || "Sin proveedor").toString();
      const reglaEmpaque =
        cantidadEmpaque > 1 ? `Caja x ${cantidadEmpaque}` : "Unidad";

      if (!grouped.has(proveedorKey)) {
        grouped.set(proveedorKey, {
          proveedorId: proveedorId,
          nombreEmpresa,
          items: [],
        });
      }

      grouped.get(proveedorKey).items.push({
        sku: row.sku,
        nombre: row.nombreproducto,
        stockActual: stockFisicoFinal,
        stockMinimo: stockMinimoFinal,
        deficit,
        sugerenciaCompra,
        reglaEmpaque,
      });
    }

    const response = Array.from(grouped.values()).filter(
      (g) => Array.isArray(g.items) && g.items.length
    );

    return res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Error al obtener sugerencias de compra:", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

module.exports = {
  obtenerSugerencias,
};
