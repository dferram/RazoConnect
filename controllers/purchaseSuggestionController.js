const db = require("../db");
const auditService = require("../services/auditService");

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

const autoGenerarOrdenes = async (req, res) => {
  const usuarioCreadorId = Number.parseInt(req?.user?.id ?? req?.user?.userId, 10);
  if (!Number.isInteger(usuarioCreadorId) || usuarioCreadorId <= 0) {
    return res.status(401).json({
      success: false,
      message: "Usuario no autenticado",
    });
  }

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
        pv.costounitario,
        pv.productoid,
        pv.tipoproductoid,
        p.nombreproducto,
        p.proveedorid_default,
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
      ORDER BY pr.nombreempresa ASC NULLS LAST, p.proveedorid_default ASC NULLS LAST, pv.varianteid ASC
    `;

    const result = await db.query(query);
    const rows = Array.isArray(result.rows) ? result.rows : [];

    const grupos = new Map();

    for (const row of rows) {
      const proveedorId = row.proveedorid_default ? Number.parseInt(row.proveedorid_default, 10) : null;
      if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
        continue;
      }

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

      const costoUnitarioRaw =
        row.costounitario !== undefined && row.costounitario !== null
          ? Number.parseFloat(row.costounitario)
          : NaN;
      const costoUnitario =
        Number.isFinite(costoUnitarioRaw) && costoUnitarioRaw > 0
          ? Number(costoUnitarioRaw.toFixed(2))
          : 0;

      const varianteId = Number.parseInt(row.varianteid, 10);
      if (!Number.isInteger(varianteId) || varianteId <= 0) {
        continue;
      }

      if (!grupos.has(proveedorId)) {
        grupos.set(proveedorId, {
          proveedorId,
          nombreEmpresa: (row.nombreempresa || "").toString(),
          items: [],
        });
      }

      grupos.get(proveedorId).items.push({
        varianteId,
        sku: row.sku,
        nombre: row.nombreproducto,
        cantidad: sugerenciaCompra,
        costoUnitario,
        deficit,
      });
    }

    let ordenesCreadas = 0;

    for (const grupo of grupos.values()) {
      if (!grupo?.proveedorId || !Array.isArray(grupo.items) || !grupo.items.length) {
        continue;
      }

      const total = Number(
        grupo.items
          .reduce((sum, it) => sum + (it.cantidad || 0) * (it.costoUnitario || 0), 0)
          .toFixed(2)
      );

      const client = await db.pool.connect();
      let ordenCompraId = null;

      try {
        await client.query("BEGIN");

        const insertOC = await client.query(
          `INSERT INTO ordenesdecompra
            (proveedorid, fechasolicitud, estatus, total, origenoc, usuario_creador_id)
           VALUES ($1, NOW(), 'Pendiente', $2, $3, $4)
           RETURNING ordencompraid`,
          [grupo.proveedorId, total, "sugerencia_stock", usuarioCreadorId]
        );

        ordenCompraId = insertOC.rows?.[0]?.ordencompraid ?? null;
        const ordenIdParsed = Number.parseInt(ordenCompraId, 10);
        if (!Number.isInteger(ordenIdParsed) || ordenIdParsed <= 0) {
          throw new Error("No se pudo crear la orden de compra");
        }

        for (const it of grupo.items) {
          await client.query(
            `INSERT INTO detallesordencompra
              (ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, costounitario)
             VALUES ($1, $2, $3, 0, $4)`,
            [ordenIdParsed, it.varianteId, it.cantidad, it.costoUnitario]
          );
        }

        await client.query("COMMIT");
        client.release();

        ordenesCreadas += 1;

        try {
          await auditService.registrarCambioPasivo(
            req,
            "ordenesdecompra",
            ordenIdParsed,
            "INSERT",
            null,
            {
              evento: "AUTO-GENERATE",
              origenoc: "sugerencia_stock",
              proveedorId: grupo.proveedorId,
              nombreEmpresa: grupo.nombreEmpresa,
              total,
              items: grupo.items,
            }
          );
        } catch (e) {
        }
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch (e) {
        }
        client.release();
        throw error;
      }
    }

    return res.json({
      success: true,
      message: `Se generaron ${ordenesCreadas} órdenes automáticamente.`,
      ordenesCreadas,
    });
  } catch (error) {
    console.error("Error al auto-generar órdenes de compra:", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

const generarOrdenCompra = async (req, res) => {
  const proveedorId = Number.parseInt(req?.body?.proveedorId, 10);
  const items = Array.isArray(req?.body?.items) ? req.body.items : [];

  if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
    return res.status(400).json({
      success: false,
      message: "proveedorId inválido",
    });
  }

  if (!items.length) {
    return res.status(400).json({
      success: false,
      message: "items es requerido",
    });
  }

  const usuarioCreadorId = Number.parseInt(req?.user?.id ?? req?.user?.userId, 10);
  if (!Number.isInteger(usuarioCreadorId) || usuarioCreadorId <= 0) {
    return res.status(401).json({
      success: false,
      message: "Usuario no autenticado",
    });
  }

  try {
    const proveedorRes = await db.query(
      "SELECT proveedorid, nombreempresa FROM proveedores WHERE proveedorid = $1 LIMIT 1",
      [proveedorId]
    );

    if (!proveedorRes.rows?.length) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const proveedorNombre = proveedorRes.rows[0].nombreempresa || null;

    const normalizadosPorVariante = new Map();
    let total = 0;

    for (const item of items) {
      const varianteId = Number.parseInt(item?.varianteId, 10);
      const cantidad = Number.parseInt(item?.cantidad, 10);
      const costoUnitarioRaw =
        item?.costoUnitario !== undefined && item?.costoUnitario !== null
          ? Number.parseFloat(item.costoUnitario)
          : NaN;

      if (!Number.isInteger(varianteId) || varianteId <= 0) {
        return res.status(400).json({
          success: false,
          message: "varianteId inválido en items",
        });
      }

      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        return res.status(400).json({
          success: false,
          message: "cantidad inválida en items",
        });
      }

      if (!Number.isFinite(costoUnitarioRaw) || costoUnitarioRaw < 0) {
        return res.status(400).json({
          success: false,
          message: "costoUnitario inválido en items",
        });
      }

      const costoUnitario = Number(costoUnitarioRaw.toFixed(2));

      const existente = normalizadosPorVariante.get(varianteId);
      if (existente) {
        if (existente.costoUnitario !== costoUnitario) {
          return res.status(400).json({
            success: false,
            message: "costoUnitario inconsistente para la misma variante",
          });
        }
        existente.cantidad += cantidad;
      } else {
        normalizadosPorVariante.set(varianteId, {
          varianteId,
          cantidad,
          costoUnitario,
        });
      }
    }

    const normalizados = Array.from(normalizadosPorVariante.values());

    for (const n of normalizados) {
      total += n.cantidad * n.costoUnitario;
    }

    total = Number(total.toFixed(2));
    if (!Number.isFinite(total) || total < 0) {
      return res.status(400).json({
        success: false,
        message: "total inválido",
      });
    }

    const variantesRes = await db.query(
      `SELECT pv.varianteid
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       WHERE pv.varianteid = ANY($1::int[])
         AND p.proveedorid_default = $2
         AND p.activo = TRUE
         AND pv.activo = TRUE`,
      [normalizados.map((n) => n.varianteId), proveedorId]
    );

    const idsValidos = new Set(
      (variantesRes.rows || []).map((r) => Number.parseInt(r.varianteid, 10))
    );

    if (idsValidos.size !== normalizados.length) {
      return res.status(400).json({
        success: false,
        message: "Una o más variantes no existen, no pertenecen al proveedor o no están activas",
      });
    }

    const client = await db.pool.connect();
    let ordenCompraId = null;

    try {
      await client.query("BEGIN");

      const insertOC = await client.query(
        `INSERT INTO ordenesdecompra
          (proveedorid, fechasolicitud, estatus, total, origenoc, usuario_creador_id)
         VALUES ($1, NOW(), 'Pendiente', $2, $3, $4)
         RETURNING ordencompraid`,
        [proveedorId, total, "sugerencia_stock", usuarioCreadorId]
      );

      ordenCompraId = insertOC.rows?.[0]?.ordencompraid ?? null;
      const ordenIdParsed = Number.parseInt(ordenCompraId, 10);
      if (!Number.isInteger(ordenIdParsed) || ordenIdParsed <= 0) {
        throw new Error("No se pudo crear la orden de compra");
      }

      for (const n of normalizados) {
        await client.query(
          `INSERT INTO detallesordencompra
            (ordencompraid, varianteid, cantidadsolicitada, cantidadrecibida, costounitario)
           VALUES ($1, $2, $3, 0, $4)`,
          [ordenIdParsed, n.varianteId, n.cantidad, n.costoUnitario]
        );
      }

      await client.query("COMMIT");
      client.release();

      try {
        await auditService.registrarCambioPasivo(
          req,
          "ordenesdecompra",
          ordenIdParsed,
          "INSERT",
          null,
          {
            mensaje: `Se creó la Orden de Compra #${ordenIdParsed} por sugerencia de stock`,
            origenoc: "sugerencia_stock",
            proveedorId,
            proveedorNombre,
            total,
            items: normalizados,
          }
        );
      } catch (e) {
      }

      return res.status(201).json({
        success: true,
        data: {
          ordenCompraId: ordenIdParsed,
        },
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (e) {
      }
      client.release();
      throw error;
    }
  } catch (error) {
    console.error("Error al generar orden de compra desde sugerencias:", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

module.exports = {
  obtenerSugerencias,
  generarOrdenCompra,
  autoGenerarOrdenes,
};
