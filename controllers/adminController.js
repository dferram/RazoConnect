const db = require("../db");
const {
  solicitarCambio,
  aprobarSolicitudes,
} = require("../services/ChangeRequestService");
const { enviarEmail } = require("../services/emailService");
const { generarHtmlConfirmacion } = require("../utils/emailTemplates");
const {
  crearNotificacion: crearNotificacionServicio,
} = require("../services/notificacionesService");
const { checkStockBajo } = require("../utils/stockAlerts");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { generateCodigoAgente } = require("../utils/agentCode");
const { registrarLog } = require("../services/loggerService");
const inventoryService = require("../services/inventoryService");
const auditService = require("../services/auditService");
const fs = require("fs");

let agenteAdminColumnsCache = null;

async function notifySuperAdmins(client, payload) {
  try {
    const superAdminsResult = await client.query(
      `SELECT adminid
       FROM administradores
       WHERE LOWER(rol) IN ('superadmin', 'super-admin')`
    );

    const ids = (superAdminsResult.rows || [])
      .map((r) => Number.parseInt(r.adminid, 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (!ids.length) return;

    const titulo = payload?.titulo || "⚠️ Discrepancia de Inventario Detectada";
    const mensaje = payload?.mensaje || "Se detectó una discrepancia en recepción.";
    const url = payload?.url || null;
    const metadata = payload?.metadata ? JSON.stringify(payload.metadata) : null;
    const tipo = (() => {
      const t = (payload?.tipo || "").toString().trim().toLowerCase();
      const allowed = ["pedido", "oferta", "temporada", "backorder", "sistema", "producto"];
      if (allowed.includes(t)) return t;
      return "sistema";
    })();
    const prioridad = (() => {
      const p = (payload?.prioridad || "").toString().trim().toLowerCase();
      if (p === "media") return "normal";
      const allowed = ["baja", "normal", "alta", "urgente"];
      if (allowed.includes(p)) return p;
      return "alta";
    })();

    for (const adminId of ids) {
      try {
        await client.query(
          `INSERT INTO notificaciones
            (clienteid, administrador_id, agente_id, tipo, titulo, mensaje, url, prioridad, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [null, adminId, null, tipo, titulo, mensaje, url, prioridad, metadata]
        );
      } catch (e) {
        // No bloquear recepción si la notificación no se puede guardar
      }
    }
  } catch (error) {
    // Silencioso: no bloquear recepción
  }
}

const subirEvidenciaRecepcionOC = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionó ningún archivo de evidencia",
      });
    }

    const url = `/uploads/${req.file.filename}`;
    return res.status(200).json({
      success: true,
      message: "Evidencia subida exitosamente",
      data: { url },
    });
  } catch (error) {
    console.error("Error al subir evidencia de recepción:", error);
    return res.status(500).json({
      success: false,
      message: "Error al subir la evidencia",
    });
  }
};

const getCuentasPorPagar = async (req, res) => {
  try {
    const estatus = (req.query.estatus || "").toString().trim().toUpperCase();
    const modo = (req.query.modo || "").toString().trim().toLowerCase();
    const proveedorId = Number.parseInt(req.query.proveedorId, 10);

    const isHistorico = modo === "historico";

    const where = [];
    const params = [];
    let i = 1;

    if (estatus) {
      where.push("cxp.estatus = $" + i);
      params.push(estatus);
      i += 1;
    } else {
      const allowedEstatus = isHistorico
        ? ["PAGADO", "CANCELADO"]
        : ["PENDIENTE", "PARCIAL", "VENCIDO"];
      where.push(`cxp.estatus = ANY($${i}::public.estatus_cxp_enum[])`);
      params.push(allowedEstatus);
      i += 1;
    }

    if (Number.isInteger(proveedorId) && proveedorId > 0) {
      where.push("cxp.proveedor_id = $" + i);
      params.push(proveedorId);
      i += 1;
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const orderBySql = "ORDER BY cxp.cxp_id DESC";

    const result = await db.query(
      `SELECT
         cxp.cxp_id,
         cxp.proveedor_id,
         cxp.orden_compra_id,
         cxp.fecha_emision,
         cxp.fecha_vencimiento,
         pagos.fecha_pagado,
         cxp.monto_total,
         cxp.monto_pagado,
         cxp.estatus,
         cxp.referencia_factura,
         cxp.comprobante_pago,
         cxp.notas,
         p.nombreempresa AS proveedor_nombre,
         COALESCE(oc.estatus, NULL) AS estatus_oc
       FROM cuentas_por_pagar cxp
       INNER JOIN proveedores p ON p.proveedorid = cxp.proveedor_id
       LEFT JOIN (
         SELECT cxp_id, MAX(fecha_pago) AS fecha_pagado
         FROM pagos_cxp
         GROUP BY cxp_id
       ) pagos ON pagos.cxp_id = cxp.cxp_id
       LEFT JOIN ordenesdecompra oc ON oc.ordencompraid = cxp.orden_compra_id
       ${whereSql}
       ${orderBySql}`,
      params
    );

    return res.json({
      success: true,
      data: {
        cuentas: (result.rows || []).map((row) => {
          const montoTotal = Number.parseFloat(row.monto_total ?? 0) || 0;
          const montoPagado = Number.parseFloat(row.monto_pagado ?? 0) || 0;
          return {
            cxpId: row.cxp_id,
            proveedorId: row.proveedor_id,
            proveedorNombre: row.proveedor_nombre,
            ordenCompraId: row.orden_compra_id,
            estatusOC: row.estatus_oc,
            fechaEmision: row.fecha_emision,
            fechaVencimiento: row.fecha_vencimiento,
            fechaPagado: row.fecha_pagado || null,
            montoTotal,
            montoPagado,
            restante: Math.max(montoTotal - montoPagado, 0),
            estatus: row.estatus,
            referenciaFactura: row.referencia_factura || null,
            comprobantePago: row.comprobante_pago || null,
            notas: row.notas || null,
          };
        }),
      },
    });
  } catch (error) {
    console.error("Error al obtener cuentas por pagar:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener cuentas por pagar",
    });
  }
};

const registrarPagoCuentaPorPagar = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const cxpId = Number.parseInt(req.params.id, 10);
    const monto = Number.parseFloat(req.body?.monto);
    const referencia = (req.body?.referencia || "").toString().trim();
    const nota = (req.body?.nota || "").toString().trim();

    if (!Number.isInteger(cxpId) || cxpId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de cuenta por pagar inválido",
      });
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({
        success: false,
        message: "Monto inválido",
      });
    }

    const montoCentavos = Math.round(monto * 100);
    if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
      return res.status(400).json({
        success: false,
        message: "Monto inválido",
      });
    }

    const montoNormalizado = Number.parseFloat((montoCentavos / 100).toFixed(2));

    const usuarioId = Number.parseInt(req?.user?.id ?? req?.user?.userId, 10);
    const usuarioFinal = Number.isInteger(usuarioId) && usuarioId > 0 ? usuarioId : null;

    const comprobanteUrl = req.file ? `/uploads/${req.file.filename}` : null;

    await client.query("BEGIN");

    const locked = await client.query(
      `SELECT
         cxp_id,
         proveedor_id,
         orden_compra_id,
         monto_total,
         monto_pagado,
         estatus,
         referencia_factura,
         comprobante_pago,
         notas
       FROM cuentas_por_pagar
       WHERE cxp_id = $1
       FOR UPDATE`,
      [cxpId]
    );

    if (!locked.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Cuenta por pagar no encontrada",
      });
    }

    const row = locked.rows[0];
    const montoTotal = Number.parseFloat(row.monto_total ?? 0) || 0;
    const montoPagadoActual = Number.parseFloat(row.monto_pagado ?? 0) || 0;

    const montoTotalCentavos = Math.round(montoTotal * 100);
    const montoPagadoActualCentavos = Math.round(montoPagadoActual * 100);
    const restanteCentavos = Math.max(montoTotalCentavos - montoPagadoActualCentavos, 0);

    if (montoCentavos > restanteCentavos) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "No puedes pagar más que el restante",
      });
    }

    const nuevoPagadoCentavos = montoPagadoActualCentavos + montoCentavos;
    const nuevoPagado = Number.parseFloat((nuevoPagadoCentavos / 100).toFixed(2));

    const estatusNuevo = (() => {
      if (nuevoPagadoCentavos >= montoTotalCentavos) return "PAGADO";
      if (nuevoPagadoCentavos > 0) return "PARCIAL";
      return "PENDIENTE";
    })();

    const nuevaReferencia = referencia || row.referencia_factura || null;
    const nuevoComprobante = comprobanteUrl || row.comprobante_pago || null;

    const notasPrevias = (row.notas || "").toString().trim();
    const notaNueva = nota;
    const notasFinal = (() => {
      if (!notaNueva) return notasPrevias || null;
      if (!notasPrevias) return notaNueva;
      return `${notasPrevias}\n${notaNueva}`;
    })();

    const updateRes = await client.query(
      `UPDATE cuentas_por_pagar
       SET monto_pagado = $1,
           estatus = $2,
           referencia_factura = $3,
           comprobante_pago = $4,
           notas = $5,
           usuario_creador_id = COALESCE(usuario_creador_id, $6)
       WHERE cxp_id = $7
       RETURNING cxp_id, proveedor_id, orden_compra_id, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, estatus, referencia_factura, comprobante_pago, notas`,
      [
        nuevoPagado,
        estatusNuevo,
        nuevaReferencia,
        nuevoComprobante,
        notasFinal,
        usuarioFinal,
        cxpId,
      ]
    );

    try {
      await client.query(
        `INSERT INTO pagos_cxp
          (cxp_id, monto, metodo_pago, referencia_bancaria, comprobante_url, nota, usuario_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          cxpId,
          montoNormalizado,
          null,
          referencia || null,
          comprobanteUrl,
          nota || null,
          usuarioFinal,
        ]
      );
    } catch (e) {
      // ignore
    }

    await client.query("COMMIT");

    const updated = updateRes.rows[0];
    const total = Number.parseFloat(updated.monto_total ?? 0) || 0;
    const pagado = Number.parseFloat(updated.monto_pagado ?? 0) || 0;

    return res.json({
      success: true,
      message: "Pago registrado correctamente",
      data: {
        cuenta: {
          cxpId: updated.cxp_id,
          proveedorId: updated.proveedor_id,
          ordenCompraId: updated.orden_compra_id,
          fechaEmision: updated.fecha_emision,
          fechaVencimiento: updated.fecha_vencimiento,
          montoTotal: total,
          montoPagado: pagado,
          restante: Math.max(total - pagado, 0),
          estatus: updated.estatus,
          referenciaFactura: updated.referencia_factura || null,
          comprobantePago: updated.comprobante_pago || null,
          notas: updated.notas || null,
        },
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error al registrar pago CxP:", error);
    return res.status(500).json({
      success: false,
      message: "Error al registrar pago",
    });
  } finally {
    client.release();
  }
};

const getResumenEstadoCuentaProveedores = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         proveedorid,
         nombreempresa,
         deuda_total_historica,
         saldo_pendiente_pago,
         facturas_vivas
       FROM v_resumen_bancario_proveedores
       ORDER BY saldo_pendiente_pago DESC, nombreempresa ASC`
    );

    return res.json({
      success: true,
      data: {
        proveedores: (result.rows || []).map((row) => ({
          proveedorId: row.proveedorid,
          proveedorNombre: row.nombreempresa,
          deudaTotalHistorica: Number.parseFloat(row.deuda_total_historica ?? 0) || 0,
          saldoPendiente: Number.parseFloat(row.saldo_pendiente_pago ?? 0) || 0,
          facturasVivas: Number.parseInt(row.facturas_vivas ?? 0, 10) || 0,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener resumen estado de cuenta proveedores:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener estado de cuenta",
    });
  }
};

const getEstadoCuentaProveedorMovimientos = async (req, res) => {
  try {
    const proveedorId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "proveedorId inválido",
      });
    }

    const provResult = await db.query(
      `SELECT proveedorid, nombreempresa
       FROM proveedores
       WHERE proveedorid = $1`,
      [proveedorId]
    );

    if (!provResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const proveedor = provResult.rows[0];

    const cuentasResult = await db.query(
      `SELECT
         cxp_id,
         proveedor_id,
         orden_compra_id,
         fecha_emision,
         fecha_vencimiento,
         monto_total,
         monto_pagado,
         estatus,
         referencia_factura,
         comprobante_pago,
         notas
       FROM cuentas_por_pagar
       WHERE proveedor_id = $1
       ORDER BY fecha_emision DESC`,
      [proveedorId]
    );

    const resumenResult = await db.query(
      `SELECT
         COALESCE(SUM(monto_total), 0) AS total,
         COALESCE(SUM(monto_pagado), 0) AS pagado
       FROM cuentas_por_pagar
       WHERE proveedor_id = $1`,
      [proveedorId]
    );

    const total = Number.parseFloat(resumenResult.rows[0]?.total ?? 0) || 0;
    const pagado = Number.parseFloat(resumenResult.rows[0]?.pagado ?? 0) || 0;
    const saldo = Math.max(total - pagado, 0);

    const movResult = await db.query(
      `SELECT * FROM (
        SELECT
          'cargo'::text AS tipo,
          cxp.cxp_id,
          cxp.orden_compra_id,
          cxp.fecha_emision AS fecha,
          cxp.monto_total AS monto,
          cxp.monto_pagado,
          cxp.estatus::text AS estatus,
          cxp.referencia_factura AS referencia,
          cxp.comprobante_pago AS comprobante_url,
          NULL::int AS pago_id
        FROM cuentas_por_pagar cxp
        WHERE cxp.proveedor_id = $1

        UNION ALL

        SELECT
          'abono'::text AS tipo,
          cxp.cxp_id,
          cxp.orden_compra_id,
          pc.fecha_pago AS fecha,
          pc.monto AS monto,
          NULL::numeric AS monto_pagado,
          'PAGO'::text AS estatus,
          pc.referencia_bancaria AS referencia,
          pc.comprobante_url AS comprobante_url,
          pc.pago_id
        FROM pagos_cxp pc
        INNER JOIN cuentas_por_pagar cxp ON cxp.cxp_id = pc.cxp_id
        WHERE cxp.proveedor_id = $1
      ) t
      ORDER BY fecha DESC`,
      [proveedorId]
    );

    const cuentas = (cuentasResult.rows || []).map((row) => {
      const montoTotal = Number.parseFloat(row.monto_total ?? 0) || 0;
      const montoPagado = Number.parseFloat(row.monto_pagado ?? 0) || 0;
      return {
        cxpId: row.cxp_id,
        proveedorId: row.proveedor_id,
        ordenCompraId: row.orden_compra_id,
        fechaEmision: row.fecha_emision,
        fechaVencimiento: row.fecha_vencimiento,
        montoTotal,
        montoPagado,
        restante: Math.max(montoTotal - montoPagado, 0),
        estatus: row.estatus,
        referenciaFactura: row.referencia_factura || null,
        comprobantePago: row.comprobante_pago || null,
        notas: row.notas || null,
      };
    });

    const movimientos = (movResult.rows || []).map((row) => ({
      tipo: row.tipo,
      cxpId: row.cxp_id,
      pagoId: row.pago_id,
      ordenCompraId: row.orden_compra_id,
      fecha: row.fecha,
      monto: Number.parseFloat(row.monto ?? 0) || 0,
      estatus: row.estatus || null,
      referencia: row.referencia || null,
      comprobanteUrl: row.comprobante_url || null,
    }));

    return res.json({
      success: true,
      data: {
        proveedor: {
          proveedorId: proveedor.proveedorid,
          proveedorNombre: proveedor.nombreempresa,
        },
        resumen: {
          total,
          pagado,
          saldo,
        },
        cuentas,
        movimientos,
      },
    });
  } catch (error) {
    console.error("Error al obtener movimientos proveedor:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener movimientos",
    });
  }
};

const getProductosRecibidosPorCxp = async (req, res) => {
  try {
    const cxpId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(cxpId) || cxpId <= 0) {
      return res.status(400).json({
        success: false,
        message: "cxpId inválido",
      });
    }

    const result = await db.query(
      `SELECT
         pr.nombreproducto,
         pv.sku,
         pv.dimensiones,
         pv.piezasporpaquete,
         SUM(li.cantidadcambiado)::int AS piezas,
         (SUM(li.cantidadcambiado)::numeric / NULLIF(COALESCE(pv.piezasporpaquete, 1), 0)) AS paquetes,
         MIN(li.fecha) AS fecha_inicio,
         MAX(li.fecha) AS fecha_fin
       FROM log_inventario li
       INNER JOIN producto_variantes pv ON pv.varianteid = li.varianteid
       INNER JOIN productos pr ON pr.productoid = pv.productoid
       WHERE li.cxp_id = $1
         AND COALESCE(li.cantidadcambiado, 0) > 0
       GROUP BY pr.nombreproducto, pv.sku, pv.dimensiones, pv.piezasporpaquete
       ORDER BY pr.nombreproducto ASC`,
      [cxpId]
    );

    let rows = Array.isArray(result.rows) ? result.rows : [];

    if (rows.length === 0) {
      const ordenRes = await db.query(
        `SELECT orden_compra_id
         FROM cuentas_por_pagar
         WHERE cxp_id = $1
         LIMIT 1`,
        [cxpId]
      );

      const ordenCompraId = Number.parseInt(ordenRes.rows?.[0]?.orden_compra_id ?? 0, 10);

      if (Number.isInteger(ordenCompraId) && ordenCompraId > 0) {
        const fallbackRes = await db.query(
          `SELECT
             pr.nombreproducto AS nombre_producto,
             doc.cantidadsolicitada AS cantidad,
             doc.costounitario AS precio,
             pr.nombreproducto AS nombreproducto,
             pv.sku AS sku,
             pv.dimensiones AS dimensiones,
             COALESCE(doc.piezasporpaquete, pv.piezasporpaquete, 1) AS piezasporpaquete,
             (doc.cantidadsolicitada * COALESCE(doc.piezasporpaquete, pv.piezasporpaquete, 1))::int AS piezas,
             (doc.cantidadsolicitada)::numeric AS paquetes,
             NULL::timestamp AS fecha_inicio,
             NULL::timestamp AS fecha_fin
           FROM detallesordencompra doc
           INNER JOIN producto_variantes pv ON pv.varianteid = doc.varianteid
           INNER JOIN productos pr ON pr.productoid = pv.productoid
           WHERE doc.ordencompraid = $1
           ORDER BY pr.nombreproducto ASC, pv.sku ASC`,
          [ordenCompraId]
        );

        rows = Array.isArray(fallbackRes.rows) ? fallbackRes.rows : [];
      }
    }

    return res.json({
      success: true,
      data: {
        productos: rows.map((row) => ({
          // Campos requeridos
          nombreproducto: row.nombreproducto,
          sku: row.sku,
          piezas: Number.parseInt(row.piezas ?? 0, 10) || 0,
          paquetes: Number.parseFloat(row.paquetes ?? 0) || 0,

          // Claves para compatibilidad con fallback de OC
          nombre_producto: row.nombre_producto ?? row.nombreproducto,
          cantidad: Number.parseInt(row.cantidad ?? 0, 10) || 0,
          precio: Number.parseFloat(row.precio ?? 0) || 0,

          // Compatibilidad con frontend existente
          nombreProducto: row.nombreproducto,
          dimensiones: row.dimensiones || null,
          piezasPorPaquete: row.piezasporpaquete ?? 1,
          fechaInicio: row.fecha_inicio || null,
          fechaFin: row.fecha_fin || null,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener productos recibidos por CxP:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener productos recibidos",
    });
  }
};

const recepcionMasivaOrdenCompra = async (req, res) => {
  const client = await db.pool.connect();

  const assignCxpEtiqueta = async (cxpId, nombreLike) => {
    if (!Number.isInteger(cxpId) || cxpId <= 0) return;
    const query = `
      SELECT etiqueta_id
      FROM cat_cxp_etiquetas
      WHERE activo = true AND nombre ILIKE $1
      ORDER BY etiqueta_id ASC
      LIMIT 1
    `;

    const etiquetaRes = await client.query(query, [nombreLike]);
    if (!etiquetaRes.rows.length) return;

    const etiquetaId = Number.parseInt(etiquetaRes.rows[0].etiqueta_id, 10);
    if (!Number.isInteger(etiquetaId) || etiquetaId <= 0) return;

    await client.query(
      `INSERT INTO cxp_etiquetas_asignadas (cxp_id, etiqueta_id)
       VALUES ($1, $2)
       ON CONFLICT (cxp_id, etiqueta_id) DO NOTHING`,
      [cxpId, etiquetaId]
    );
  };

  try {
    const ordenCompraId = Number.parseInt(req.body?.ordenCompraId, 10);
    const referenciaProveedor = (req.body?.referenciaProveedor || "").toString().trim();
    const itemsRaw = req.body?.items;
    const usuarioRecibeId = Number.parseInt(req?.user?.id ?? req?.user?.userId, 10);

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ordenCompraId inválido",
      });
    }

    if (!referenciaProveedor) {
      return res.status(400).json({
        success: false,
        message: "referenciaProveedor es requerida",
      });
    }

    let items = [];
    try {
      items = typeof itemsRaw === "string" ? JSON.parse(itemsRaw) : itemsRaw;
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: "items inválido (JSON)",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "items debe ser un arreglo con al menos 1 elemento",
      });
    }

    await client.query("BEGIN");

    const ordenLock = await client.query(
      `SELECT oc.ordencompraid, oc.estatus, oc.proveedorid, COALESCE(p.diascredito, 0) AS diascredito
       FROM ordenesdecompra oc
       INNER JOIN proveedores p ON p.proveedorid = oc.proveedorid
       WHERE oc.ordencompraid = $1
       FOR UPDATE`,
      [ordenCompraId]
    );

    if (!ordenLock.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const estatusActual = (ordenLock.rows[0].estatus || "").toString().trim();
    if (!["Pendiente", "Parcial"].includes(estatusActual)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `La orden no se puede recepcionar en estatus '${estatusActual || "(vacío)"}'`,
      });
    }

    const proveedorId = Number.parseInt(ordenLock.rows[0].proveedorid, 10);
    const diasCredito = Number.parseInt(ordenLock.rows[0].diascredito, 10);
    const diasCreditoFinal = Number.isInteger(diasCredito) && diasCredito > 0 ? diasCredito : 0;
    const vencResult = await client.query(
      "SELECT (CURRENT_DATE + ($1::int * INTERVAL '1 day'))::date AS fecha_vencimiento",
      [diasCreditoFinal]
    );
    const fechaVencimiento = vencResult.rows[0]?.fecha_vencimiento || null;

    const comprobanteUrl = req.file?.filename
      ? `/uploads/comprobantes/${req.file.filename}`
      : null;

    let montoTotalCentavos = 0;
    const productosActualizados = [];

    for (const raw of items) {
      const detalleId = Number.parseInt(raw?.detalleId, 10);
      const varianteIdReq = raw?.varianteId;
      const cantidadIngresada = Number.parseInt(raw?.cantidad, 10);

      if (!Number.isInteger(detalleId) || detalleId <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "detalleId inválido en items",
        });
      }
      if (!Number.isInteger(cantidadIngresada) || cantidadIngresada <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "cantidad inválida en items",
        });
      }

      const detalleResult = await client.query(
        `SELECT
           doc.detalleoc_id,
           doc.ordencompraid,
           doc.varianteid,
           doc.cantidadsolicitada,
           doc.piezasrecibidas,
           doc.piezasporpaquete,
           doc.costounitario,
           pv.sku,
           pv.stock AS stockvariante,
           pv.costounitario AS variante_costounitario,
           pv.piezasporpaquete AS variante_piezasporpaquete,
           pr.nombreproducto
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
          message: `Detalle ${detalleId} no encontrado en esta orden`,
        });
      }

      const detalle = detalleResult.rows[0];
      const varianteId = Number.parseInt(detalle.varianteid, 10);
      if (
        varianteIdReq !== undefined &&
        varianteIdReq !== null &&
        varianteIdReq !== "" &&
        Number.isInteger(Number.parseInt(varianteIdReq, 10)) &&
        Number.parseInt(varianteIdReq, 10) !== varianteId
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: `La variante no corresponde al detalle ${detalleId}`,
        });
      }

      const solicitado = Number.parseInt(detalle.cantidadsolicitada, 10) || 0;
      const piezasPorPaqueteParsed = Number.parseInt(detalle.piezasporpaquete, 10);
      const piezasPorPaqueteAltParsed = Number.parseInt(detalle.variante_piezasporpaquete, 10);
      const piezasPorPaquete = (() => {
        if (Number.isInteger(piezasPorPaqueteParsed) && piezasPorPaqueteParsed > 0) {
          return piezasPorPaqueteParsed;
        }
        if (Number.isInteger(piezasPorPaqueteAltParsed) && piezasPorPaqueteAltParsed > 0) {
          return piezasPorPaqueteAltParsed;
        }
        return 1;
      })();
      const solicitadoPzas = solicitado * piezasPorPaquete;
      const recibidoPzsActual = Number.parseInt(detalle.piezasrecibidas, 10) || 0;
      const nuevoRecibidoPzas = recibidoPzsActual + cantidadIngresada;
      if (nuevoRecibidoPzas > solicitadoPzas) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: `No puede recibir más de lo solicitado para ${detalle.nombreproducto}. Solicitado: ${solicitadoPzas}, Ya recibido: ${recibidoPzsActual}`,
        });
      }

      const costoPaquete = Number.parseFloat(detalle.costounitario ?? 0) || 0;
      const costoVariante = Number.parseFloat(detalle.variante_costounitario ?? 0) || 0;
      const costoUnitario = (() => {
        if (Number.isFinite(costoPaquete) && costoPaquete > 0) return costoPaquete;
        if (Number.isFinite(costoVariante) && costoVariante > 0) return costoVariante;
        return 0;
      })();

      // Costos son UNITARIOS por pieza: subtotal = piezas * costo_unitario
      // Se acumula en centavos para evitar errores de coma flotante.
      const costoUnitarioCentavos = Math.round((Number.parseFloat(costoUnitario) || 0) * 100);
      const subtotalCentavos = Math.round((cantidadIngresada || 0) * costoUnitarioCentavos);
      montoTotalCentavos += subtotalCentavos;

      await client.query(
        `UPDATE detallesordencompra
         SET piezasrecibidas = COALESCE(piezasrecibidas, 0) + $1,
             piezasporpaquete = COALESCE(NULLIF(piezasporpaquete, 0), $4),
             cantidadrecibida = FLOOR(
               (COALESCE(piezasrecibidas, 0) + $1)
               / COALESCE(NULLIF(COALESCE(NULLIF(piezasporpaquete, 0), $4), 0), 1)
             )::int
         WHERE detalleoc_id = $2 AND ordencompraid = $3`,
        [cantidadIngresada, detalleId, ordenCompraId, piezasPorPaquete]
      );

      const stockAnterior = Number.parseInt(detalle.stockvariante, 10) || 0;
      const stockUpdate = await client.query(
        `UPDATE producto_variantes
         SET stock = COALESCE(stock, 0) + $1
         WHERE varianteid = $2
         RETURNING stock`,
        [cantidadIngresada, varianteId]
      );
      const nuevoStock = Number.parseInt(stockUpdate.rows[0]?.stock, 10);
      const nuevoStockSafe = Number.isInteger(nuevoStock)
        ? nuevoStock
        : stockAnterior + cantidadIngresada;

      productosActualizados.push({
        detalleId,
        varianteId,
        sku: detalle.sku,
        nombreProducto: detalle.nombreproducto,
        cantidadRecibidaAhora: cantidadIngresada,
        cantidadRecibidaTotal: nuevoRecibidoPzas,
        cantidadSolicitada: solicitadoPzas,
        cantidadPendiente: Math.max(solicitadoPzas - nuevoRecibidoPzas, 0),
        stockVariante: nuevoStockSafe,
      });
    }

    const montoFinal = Number.isFinite(montoTotalCentavos)
      ? Number.parseFloat((montoTotalCentavos / 100).toFixed(2))
      : 0;

    const totalOrdenResult = await client.query(
      `SELECT COALESCE(
          SUM(
            (doc.cantidadsolicitada * COALESCE(NULLIF(doc.piezasporpaquete, 0), NULLIF(pv.piezasporpaquete, 0), 1))
            * COALESCE(NULLIF(doc.costounitario, 0), pv.costounitario)
          ),
          0
        ) AS total_orden
       FROM detallesordencompra doc
       INNER JOIN producto_variantes pv ON pv.varianteid = doc.varianteid
       WHERE doc.ordencompraid = $1`,
      [ordenCompraId]
    );

    const montoOriginalOrden =
      Number.parseFloat(totalOrdenResult.rows[0]?.total_orden ?? 0) || 0;

    await client.query("UPDATE ordenesdecompra SET total = $1 WHERE ordencompraid = $2", [
      montoOriginalOrden,
      ordenCompraId,
    ]);

    const cxpInsert = await client.query(
      `INSERT INTO cuentas_por_pagar
        (proveedor_id, orden_compra_id, fecha_vencimiento, monto_total, monto_pagado, estatus, referencia_factura, comprobante_pago, usuario_creador_id, monto_original)
       VALUES ($1, $2, $3, $4, 0.00, 'PENDIENTE', $5, $6, $7, $8)
       RETURNING cxp_id`,
      [
        proveedorId,
        ordenCompraId,
        fechaVencimiento,
        montoFinal,
        referenciaProveedor,
        comprobanteUrl,
        Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0 ? usuarioRecibeId : null,
        montoFinal,
      ]
    );

    const cxpId = Number.parseInt(cxpInsert.rows[0]?.cxp_id, 10);

    try {
      await assignCxpEtiqueta(cxpId, "%Mercanc%");
    } catch (e) {
      // ignore
    }
    try {
      await assignCxpEtiqueta(cxpId, "%Crédit%");
    } catch (e) {
      // ignore
    }
    try {
      await assignCxpEtiqueta(cxpId, "%Credit%");
    } catch (e) {
      // ignore
    }

    for (const producto of productosActualizados) {
      await client.query(
        `INSERT INTO log_inventario
         (varianteid, cantidadcambiado, nuevostock, motivo, usuarioid, es_excepcion, cxp_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          producto.varianteId,
          producto.cantidadRecibidaAhora,
          producto.stockVariante,
          `Recepción OC #${ordenCompraId} (Lote: ${referenciaProveedor})`,
          Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0 ? usuarioRecibeId : null,
          false,
          Number.isInteger(cxpId) && cxpId > 0 ? cxpId : null,
        ]
      );
    }

    const faltantesResult = await client.query(
      `SELECT COUNT(*)::int AS faltantes
       FROM detallesordencompra doc
       INNER JOIN producto_variantes pv ON pv.varianteid = doc.varianteid
       WHERE doc.ordencompraid = $1
         AND COALESCE(doc.piezasrecibidas, 0)
           < (doc.cantidadsolicitada * COALESCE(NULLIF(doc.piezasporpaquete, 0), NULLIF(pv.piezasporpaquete, 0), 1))`,
      [ordenCompraId]
    );
    const faltantes = Number.parseInt(faltantesResult.rows[0]?.faltantes, 10) || 0;
    const nuevoEstatusOC = faltantes === 0 ? "Completada" : "Parcial";
    await client.query("UPDATE ordenesdecompra SET estatus = $1 WHERE ordencompraid = $2", [
      nuevoEstatusOC,
      ordenCompraId,
    ]);

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Recepción masiva procesada correctamente",
      data: {
        ordenCompraId,
        cxpId: Number.isInteger(cxpId) ? cxpId : null,
        estatusOC: nuevoEstatusOC,
        montoTotal: montoFinal,
        referenciaProveedor,
        comprobanteUrl,
        productosActualizados,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error en recepción masiva:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Error al procesar la recepción masiva",
    });
  } finally {
    client.release();
  }
};

const upsertCuentaPorPagarForOC = async (client, ordenCompraId, usuarioId) => {
  const ordenResult = await client.query(
    `SELECT oc.proveedorid, COALESCE(p.diascredito, 0) AS diascredito
     FROM ordenesdecompra oc
     INNER JOIN proveedores p ON p.proveedorid = oc.proveedorid
     WHERE oc.ordencompraid = $1`,
    [ordenCompraId]
  );

  if (!ordenResult.rows.length) {
    return null;
  }

  const proveedorId = Number.parseInt(ordenResult.rows[0].proveedorid, 10);
  const diasCredito = Number.parseInt(ordenResult.rows[0].diascredito, 10);
  const diasCreditoFinal = Number.isInteger(diasCredito) && diasCredito > 0 ? diasCredito : 0;

  const montoResult = await client.query(
    `SELECT COALESCE(
        SUM(
          COALESCE(
            NULLIF(doc.piezasrecibidas, 0),
            (doc.cantidadrecibida * COALESCE(NULLIF(doc.piezasporpaquete, 0), NULLIF(pv.piezasporpaquete, 0), 1))
          )
          * COALESCE(NULLIF(doc.costounitario, 0), pv.costounitario)
        ),
        0
      ) AS monto_total
     FROM detallesordencompra doc
     INNER JOIN producto_variantes pv ON pv.varianteid = doc.varianteid
     WHERE doc.ordencompraid = $1`,
    [ordenCompraId]
  );

  const totalOrdenResult = await client.query(
    `SELECT COALESCE(
        SUM(
          (doc.cantidadsolicitada * COALESCE(NULLIF(doc.piezasporpaquete, 0), NULLIF(pv.piezasporpaquete, 0), 1))
          * COALESCE(NULLIF(doc.costounitario, 0), pv.costounitario)
        ),
        0
      ) AS total_orden
     FROM detallesordencompra doc
     INNER JOIN producto_variantes pv ON pv.varianteid = doc.varianteid
     WHERE doc.ordencompraid = $1`,
    [ordenCompraId]
  );

  const totalOrden = Number.parseFloat(totalOrdenResult.rows[0]?.total_orden ?? 0) || 0;
  await client.query("UPDATE OrdenesDeCompra SET Total = $1 WHERE OrdenCompraID = $2", [
    totalOrden,
    ordenCompraId,
  ]);

  const montoTotal = Number.parseFloat(montoResult.rows[0]?.monto_total ?? 0) || 0;

  const vencResult = await client.query(
    "SELECT (CURRENT_DATE + ($1::int * INTERVAL '1 day'))::date AS fecha_vencimiento",
    [diasCreditoFinal]
  );
  const fechaVencimiento = vencResult.rows[0]?.fecha_vencimiento || null;

  const existing = await client.query(
    `SELECT cxp_id, monto_pagado
     FROM cuentas_por_pagar
     WHERE orden_compra_id = $1
     LIMIT 1
     FOR UPDATE`,
    [ordenCompraId]
  );

  if (!existing.rows.length) {
    const estatus = montoTotal > 0 ? "PENDIENTE" : "PENDIENTE";
    const insertRes = await client.query(
      `INSERT INTO cuentas_por_pagar
        (proveedor_id, orden_compra_id, fecha_vencimiento, monto_total, estatus, usuario_creador_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING cxp_id, proveedor_id, orden_compra_id, fecha_vencimiento, monto_total, monto_pagado, estatus`,
      [proveedorId, ordenCompraId, fechaVencimiento, montoTotal, estatus, usuarioId]
    );

    return insertRes.rows[0] || null;
  }

  const cxpId = Number.parseInt(existing.rows[0].cxp_id, 10);
  const montoPagado = Number.parseFloat(existing.rows[0].monto_pagado ?? 0) || 0;

  const estatus = (() => {
    if (montoTotal > 0 && montoPagado >= montoTotal) return "PAGADO";
    if (montoPagado > 0) return "PARCIAL";
    return "PENDIENTE";
  })();

  const updateRes = await client.query(
    `UPDATE cuentas_por_pagar
     SET proveedor_id = $1,
         fecha_vencimiento = $2,
         monto_total = $3,
         estatus = $4
     WHERE cxp_id = $5
     RETURNING cxp_id, proveedor_id, orden_compra_id, fecha_vencimiento, monto_total, monto_pagado, estatus`,
    [proveedorId, fechaVencimiento, montoTotal, estatus, cxpId]
  );

  return updateRes.rows[0] || null;
};

const getRecepcionOrdenCompra = async (req, res) => {
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
         p.nombreempresa AS proveedornombre,
         p.contactonombre AS proveedorcontacto
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
         doc.cantidadsolicitada,
         doc.cantidadrecibida,
         doc.piezasrecibidas,
         doc.piezasporpaquete,
         doc.costounitario,
         pv.productoid,
         pv.sku,
         pv.dimensiones,
         pv.medidaid,
         pv.tipoproductoid,
         pv.piezasporpaquete AS variante_piezasporpaquete,
         COALESCE(pv.stock, 0) AS stockvariante,
         pr.nombreproducto,
         pi.url_imagen AS imagen,
         pre.cantidadempaque AS regla_cantidadempaque
       FROM detallesordencompra doc
       INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
       INNER JOIN productos pr ON pv.productoid = pr.productoid
       LEFT JOIN producto_imagenes pi ON pi.productoid = pr.productoid AND pi.orden = 1
       LEFT JOIN proveedor_reglas_empaque pre
         ON pre.proveedorid = $2
        AND pre.tipoproductoid = pv.tipoproductoid
       WHERE doc.ordencompraid = $1
       ORDER BY pr.nombreproducto ASC`,
      [ordenCompraId, orden.proveedorid]
    );

    const items = detallesResult.rows.map((row) => {
      const piezasPorPaqueteParsed = Number.parseInt(
        row.piezasporpaquete ?? row.variante_piezasporpaquete ?? row.regla_cantidadempaque,
        10
      );
      const piezasPorPaquete =
        Number.isInteger(piezasPorPaqueteParsed) && piezasPorPaqueteParsed > 0
          ? piezasPorPaqueteParsed
          : 1;

      const solicitadoPzas =
        (Number.parseInt(row.cantidadsolicitada, 10) || 0) * piezasPorPaquete;
      const recibidoPzas = (() => {
        const piezasRecibidasRaw = row.piezasrecibidas;
        const piezasRecibidas = Number.parseInt(piezasRecibidasRaw, 10);
        if (Number.isInteger(piezasRecibidas) && piezasRecibidas >= 0) return piezasRecibidas;
        const recibidoPaq = Number.parseInt(row.cantidadrecibida, 10) || 0;
        return recibidoPaq * piezasPorPaquete;
      })();

      return {
        detalleId: row.detalleoc_id,
        ordenCompraId: row.ordencompraid,
        varianteId: row.varianteid,
        productoId: row.productoid,
        sku: row.sku,
        nombreProducto: row.nombreproducto,
        dimensiones: row.dimensiones,
        medidaId: row.medidaid,
        tipoProductoId: row.tipoproductoid,
        imagen: row.imagen || null,
        cantidadSolicitada: solicitadoPzas,
        cantidadRecibida: recibidoPzas,
        cantidadPendiente: Math.max(solicitadoPzas - recibidoPzas, 0),
        piezasPorPaquete,
        costounitario: row.costounitario !== null ? Number.parseFloat(row.costounitario) : 0,
        stockVariante: Number.parseInt(row.stockvariante, 10) || 0,
        reglas_empaque: {
          cantidadEmpaque:
            row.regla_cantidadempaque !== null && row.regla_cantidadempaque !== undefined
              ? Number.parseInt(row.regla_cantidadempaque, 10) || null
              : null,
        },
      };
    });

    return res.json({
      success: true,
      data: {
        orden: {
          ordenCompraId: orden.ordencompraid,
          proveedorId: orden.proveedorid,
          proveedorNombre: orden.proveedornombre,
          proveedorContacto: orden.proveedorcontacto,
          fechaCreacion: orden.fechacreacion,
          fechaEntregaEsperada: orden.fechaentregaesperada,
          estatus: orden.estatus,
        },
        items,
      },
    });
  } catch (error) {
    console.error("Error al obtener recepción de OC:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener información de recepción",
    });
  }
};

function normalizeReglasEmpaqueInput(raw) {
  const list = Array.isArray(raw) ? raw : [];

  const map = new Map();
  for (const item of list) {
    const tipoIdRaw =
      item?.tipoProductoId ?? item?.TipoProductoID ?? item?.tipoproductoid ?? item?.tipoproductoId;
    const piezasRaw =
      item?.piezasPorPaquete ?? item?.cantidadEmpaque ?? item?.cantidadempaque ?? item?.piezas;

    const tipoId = Number.parseInt(tipoIdRaw, 10);
    const piezas = Number.parseInt(piezasRaw, 10);
    if (!Number.isInteger(tipoId) || tipoId <= 0) continue;
    if (!Number.isInteger(piezas) || piezas <= 0) continue;

    map.set(tipoId, piezas);
  }

  return Array.from(map.entries()).map(([tipoProductoId, piezasPorPaquete]) => ({
    tipoProductoId,
    piezasPorPaquete,
  }));
}

async function getReglasEmpaqueProveedorSnapshot(client, proveedorId) {
  let reglasResult;
  try {
    reglasResult = await client.query(
      `SELECT reglaid, tipoproductoid, cantidadempaque
       FROM proveedor_reglas_empaque
       WHERE proveedorid = $1`,
      [proveedorId]
    );
  } catch (dbError) {
    if (dbError && dbError.code === "42703") {
      reglasResult = await client.query(
        `SELECT reglaid, tipoproductoid, piezasporpaquete AS cantidadempaque
         FROM proveedor_reglas_empaque
         WHERE proveedorid = $1`,
        [proveedorId]
      );
    } else {
      throw dbError;
    }
  }

  const map = new Map();
  for (const row of reglasResult.rows || []) {
    const tipoId = Number.parseInt(row.tipoproductoid, 10);
    const cantidad = Number.parseInt(row.cantidadempaque, 10);
    const reglaid = Number.parseInt(row.reglaid, 10);
    if (!Number.isInteger(tipoId) || tipoId <= 0) continue;
    if (!Number.isInteger(cantidad) || cantidad <= 0) continue;
    map.set(tipoId, {
      reglaid: Number.isInteger(reglaid) && reglaid > 0 ? reglaid : null,
      cantidad,
    });
  }

  return map;
}

async function upsertReglaEmpaque(client, proveedorId, tipoProductoId, cantidadEmpaque) {
  try {
    const res = await client.query(
      `INSERT INTO proveedor_reglas_empaque (proveedorid, tipoproductoid, cantidadempaque)
       VALUES ($1, $2, $3)
       ON CONFLICT (proveedorid, tipoproductoid)
       DO UPDATE SET cantidadempaque = EXCLUDED.cantidadempaque
       RETURNING reglaid`,
      [proveedorId, tipoProductoId, cantidadEmpaque]
    );
    return res.rows?.[0]?.reglaid ?? null;
  } catch (dbError) {
    if (dbError && dbError.code === "42703") {
      const res = await client.query(
        `INSERT INTO proveedor_reglas_empaque (proveedorid, tipoproductoid, piezasporpaquete)
         VALUES ($1, $2, $3)
         ON CONFLICT (proveedorid, tipoproductoid)
         DO UPDATE SET piezasporpaquete = EXCLUDED.piezasporpaquete
         RETURNING reglaid`,
        [proveedorId, tipoProductoId, cantidadEmpaque]
      );
      return res.rows?.[0]?.reglaid ?? null;
    }
    throw dbError;
  }
}

async function registrarAuditoriaReglasEmpaque(client, req, eventos) {
  const solicitanteId = Number.parseInt(req?.user?.id ?? req?.user?.userId, 10);
  if (!Number.isInteger(solicitanteId) || solicitanteId <= 0) return;

  for (const ev of eventos) {
    try {
      await client.query(
        `INSERT INTO control_cambios (
           entidad,
           entidad_id,
           tipo_cambio,
           datos_anteriores,
           datos_nuevos,
           usuario_solicitante_id,
           estado,
           fecha_resolucion,
           usuario_resolutor_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'APROBADO', NOW(), $6)`,
        [
          "proveedor_reglas_empaque",
          ev.entidadId ?? null,
          ev.tipoCambio,
          ev.datosAnteriores ? JSON.stringify(ev.datosAnteriores) : null,
          JSON.stringify(ev.datosNuevos || {}),
          solicitanteId,
        ]
      );
    } catch (e) {
      // no bloquear
    }
  }
}

const getTiposProductoAdmin = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tp.tipoproductoid, tp.nombre, tp.descripcion
       FROM tipoproducto tp
       WHERE tp.activo = TRUE
       ORDER BY tp.nombre ASC`
    );

    const tipos = (result.rows || []).map((row) => ({
      tipoProductoId: row.tipoproductoid,
      nombre: row.nombre,
      descripcion: row.descripcion,
    }));

    return res.status(200).json({
      success: true,
      message: "Tipos de producto obtenidos exitosamente",
      data: {
        tipos,
        total: tipos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener tipos de producto (admin):", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener los tipos de producto",
      error: error.message,
    });
  }
};

const crearTipoProductoAdmin = async (req, res) => {
  try {
    const nombreRaw = req.body?.nombre ?? req.body?.Nombre ?? req.body?.tipoProducto;
    const descripcionRaw = req.body?.descripcion ?? req.body?.Descripcion ?? null;

    const nombre = String(nombreRaw || "").trim();
    const descripcion =
      descripcionRaw === undefined || descripcionRaw === null
        ? null
        : String(descripcionRaw).trim() || null;

    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: "El nombre del tipo de producto es requerido",
      });
    }

    const insertRes = await db.query(
      `INSERT INTO tipoproducto (nombre, descripcion, activo)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (nombre)
       DO UPDATE SET activo = TRUE,
                    descripcion = COALESCE(EXCLUDED.descripcion, tipoproducto.descripcion)
       RETURNING tipoproductoid, nombre, descripcion`,
      [nombre, descripcion]
    );

    const row = insertRes.rows?.[0];
    return res.status(201).json({
      success: true,
      message: "Tipo de producto creado correctamente",
      data: {
        tipoProductoId: row?.tipoproductoid,
        nombre: row?.nombre,
        descripcion: row?.descripcion ?? null,
      },
    });
  } catch (error) {
    console.error("Error al crear tipo de producto (admin):", error);
    return res.status(500).json({
      success: false,
      message: "Error al crear el tipo de producto",
      error: error.message,
    });
  }
};

const buscarProductosCompra = async (req, res) => {
  try {
    const qRaw = (req.query.q || "").toString().trim();
    const allRaw = (req.query.all || "").toString().trim().toLowerCase();
    const all = allRaw === "1" || allRaw === "true";

    const filtrarProveedorRaw = (req.query.filtrarProveedor || "")
      .toString()
      .trim()
      .toLowerCase();
    const filtrarProveedor =
      filtrarProveedorRaw === "1" || filtrarProveedorRaw === "true";

    const proveedorId = Number.parseInt(req.query.proveedorId, 10);
    const categoriaId = Number.parseInt(req.query.categoriaId, 10);
    const medidaId = Number.parseInt(req.query.medidaId, 10);
    const medidaRaw = (req.query.medida || "").toString().trim();

    const hasProveedor = Number.isInteger(proveedorId) && proveedorId > 0;
    const hasProveedorFiltro = filtrarProveedor && hasProveedor;
    const hasCategoria = Number.isInteger(categoriaId) && categoriaId > 0;
    const hasMedidaId = Number.isInteger(medidaId) && medidaId > 0;
    const hasMedidaStr = !!medidaRaw;

    const hasQ = !!qRaw && qRaw.length >= 2;

    if (
      !all &&
      !hasQ &&
      !hasProveedorFiltro &&
      !hasCategoria &&
      !hasMedidaId &&
      !hasMedidaStr
    ) {
      return res.json({
        success: true,
        data: {
          resultados: [],
        },
      });
    }

    const q = hasQ ? `%${qRaw}%` : null;

    const reglasProveedorId = hasProveedor ? proveedorId : null;
    const whereParts = [
      "COALESCE(pv.activo, TRUE) = TRUE",
      "COALESCE(p.activo, TRUE) = TRUE",
    ];
    const params = [reglasProveedorId];
    let i = 2;

    if (q) {
      whereParts.push(
        "(pv.sku ILIKE $" +
          i +
          " OR p.nombreproducto ILIKE $" +
          i +
          " OR COALESCE(pv.color_nombre, '') ILIKE $" +
          i +
          ")"
      );
      params.push(q);
      i += 1;
    }

    if (hasProveedorFiltro) {
      whereParts.push("p.proveedorid_default = $1");
    }

    if (hasCategoria) {
      whereParts.push("p.categoriaid = $" + i);
      params.push(categoriaId);
      i += 1;
    }

    if (hasMedidaId) {
      whereParts.push("pv.medidaid = $" + i);
      params.push(medidaId);
      i += 1;
    } else if (hasMedidaStr) {
      whereParts.push("TRIM(COALESCE(pv.dimensiones, '')) = $" + i);
      params.push(medidaRaw);
      i += 1;
    }

    const limit = all ? 5000 : 50;

    const result = await db.query(
      `SELECT
         pv.varianteid,
         pv.sku,
         pv.productoid,
         p.nombreproducto,
         p.sku_maestro,
         p.proveedorid_default,
         p.categoriaid,
         COALESCE(regla.cantidadempaque, 1) AS regla_empaque,
         COALESCE(regla.cantidadempaque, 1) AS cantidad_empaque,
         pv.dimensiones,
         m.nombremedida,
         pv.color_nombre,
         pv.costounitario,
         pv.stock,
         COALESCE(pv.url_imagen_variante, img_variante.url_imagen, img_producto.url_imagen) AS url_imagen_variante,
         pv.piezasporpaquete
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       LEFT JOIN medidas m ON m.medidaid = pv.medidaid
       LEFT JOIN LATERAL (
         SELECT pre.cantidadempaque
         FROM proveedor_reglas_empaque pre
         WHERE pre.proveedorid = $1
           AND pre.tipoproductoid = COALESCE(pv.tipoproductoid, p.tipoproductoid)
         ORDER BY pre.reglaid ASC
         LIMIT 1
       ) regla ON true
       LEFT JOIN LATERAL (
         SELECT pvi.url_imagen
         FROM producto_variante_imagenes pvi
         WHERE pvi.varianteid = pv.varianteid
         ORDER BY pvi.orden ASC NULLS LAST, pvi.imagenid ASC
         LIMIT 1
       ) img_variante ON true
       LEFT JOIN LATERAL (
         SELECT pi.url_imagen
         FROM producto_imagenes pi
         WHERE pi.productoid = pv.productoid
         ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
         LIMIT 1
       ) img_producto ON true
       WHERE ${whereParts.join(" AND ")}
       ORDER BY p.nombreproducto ASC, pv.varianteid ASC
       LIMIT ${limit}`,
      params
    );

    const resultados = (result.rows || []).map((row) => {
      const nombreProducto = (row.nombreproducto || "").toString().trim();
      const medidaLabel =
        (row.dimensiones && row.dimensiones.toString().trim()) ||
        (row.nombremedida && row.nombremedida.toString().trim()) ||
        "";
      const color = (row.color_nombre || "").toString().trim();
      const partes = [nombreProducto];
      if (medidaLabel) partes.push(medidaLabel);
      if (color) partes.push(color);

      return {
        varianteid: row.varianteid,
        sku: row.sku,
        productoid: row.productoid ?? null,
        proveedorid: row.proveedorid_default ?? null,
        categoriaid: row.categoriaid ?? null,
        nombreproducto: row.nombreproducto ?? null,
        sku_maestro: row.sku_maestro ?? null,
        regla_empaque: Number.isInteger(row.regla_empaque)
          ? row.regla_empaque
          : Number.parseInt(row.regla_empaque, 10) || 1,
        cantidad_empaque: Number.isInteger(row.cantidad_empaque)
          ? row.cantidad_empaque
          : Number.parseInt(row.cantidad_empaque, 10) || 1,
        nombre_completo: partes.join(" "),
        medidas: medidaLabel || null,
        costounitario: row.costounitario ? Number.parseFloat(row.costounitario) : 0,
        url_imagen_variante: row.url_imagen_variante || null,
        stock: row.stock ?? 0,
        piezasporpaquete: row.piezasporpaquete ?? 1,
      };
    });

    return res.json({
      success: true,
      data: {
        resultados,
      },
    });
  } catch (error) {
    console.error("Error al buscar productos para compra:", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

const confirmarPedido = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const pedidoId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    await client.query("BEGIN");

    const pedidoResult = await client.query(
      "SELECT PedidoID, Estatus FROM Pedidos WHERE PedidoID = $1 FOR UPDATE",
      [pedidoId]
    );

    if (!pedidoResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const estatusActual = (pedidoResult.rows[0].estatus || "").toString().trim();
    if (estatusActual !== "Pendiente") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `No se puede confirmar un pedido con estatus '${estatusActual || "(vacío)"}'`,
      });
    }

    const itemsResult = await client.query(
      `SELECT
         dp.DetalleID,
         dp.VarianteID,
         dp.PiezasTotales,
         pr.NombreProducto,
         pv.SKU
       FROM DetallesDelPedido dp
       INNER JOIN Producto_Variantes pv ON pv.VarianteID = dp.VarianteID
       INNER JOIN Productos pr ON pr.ProductoID = pv.ProductoID
       WHERE dp.PedidoID = $1`,
      [pedidoId]
    );

    if (!itemsResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "No se puede confirmar: el pedido no tiene productos",
      });
    }

    const motivo = `Venta Pedido #${pedidoId}`;

    for (const item of itemsResult.rows) {
      const varianteId = Number.parseInt(item.varianteid, 10);
      const piezasTotales = Number.parseInt(item.piezastotales, 10);

      if (!Number.isInteger(varianteId) || varianteId <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "No se pudo confirmar: item inválido (varianteId)",
        });
      }

      if (!Number.isInteger(piezasTotales) || piezasTotales <= 0) {
        continue;
      }

      try {
        await inventoryService.registrarMovimiento(client, {
          varianteId,
          cantidadDelta: -1 * piezasTotales,
          motivo,
          usuarioId: req.user.id,
          esExcepcion: false,
        });
      } catch (invError) {
        await client.query("ROLLBACK");

        const nombre = (item.nombreproducto || "Producto").toString().trim();
        const sku = (item.sku || "").toString().trim();
        const ref = sku ? `${nombre} (${sku})` : nombre;

        if (invError && invError.code === "STOCK_INSUFICIENTE") {
          return res.status(400).json({
            success: false,
            message: `No se pudo confirmar: Stock insuficiente para el producto ${ref}`,
            error: invError.message,
            code: invError.code,
          });
        }

        return res.status(500).json({
          success: false,
          message: `No se pudo confirmar: Error al descontar inventario para ${ref}`,
          error: invError.message,
          code: invError.code,
        });
      }
    }

    await client.query(
      "UPDATE Pedidos SET Estatus = 'Confirmado' WHERE PedidoID = $1",
      [pedidoId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Pedido confirmado exitosamente",
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }

    console.error("Error confirmando pedido:", error);
    return res.status(500).json({
      success: false,
      message: "Error al confirmar el pedido",
      error: error.message,
      code: error.code,
    });
  } finally {
    client.release();
  }
};

/**
 * Recepción de mercancía inteligente (entrada por bultos/cajas)
 * POST /api/admin/recepcion
 * Body: { varianteId, cantidadBultos, proveedorId (opcional), esExcepcion, comentarios }
 */
const recepcionarMercancia = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { varianteId, cantidadBultos, proveedorId, esExcepcion, comentarios } =
      req.body;

    const parsedVarianteId = Number.parseInt(varianteId, 10);
    if (!Number.isInteger(parsedVarianteId) || parsedVarianteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "varianteId inválido",
      });
    }

    const parsedBultos = Number.parseInt(cantidadBultos, 10);
    if (!Number.isInteger(parsedBultos) || parsedBultos <= 0) {
      return res.status(400).json({
        success: false,
        message: "cantidadBultos inválida",
      });
    }

    const comentariosTrim = (comentarios || "").toString().trim();
    const flagExcepcion = Boolean(esExcepcion);
    if (flagExcepcion && !comentariosTrim) {
      return res.status(400).json({
        success: false,
        message: "Si marcas excepción, debes indicar el detalle del problema",
      });
    }

    await client.query("BEGIN");

    // 1) Resolver proveedor + tipoProducto (y traer SKU)
    const varianteInfo = await client.query(
      `SELECT
         pv.varianteid,
         pv.sku,
         pv.productoid,
         COALESCE(pv.tipoproductoid, p.tipoproductoid) AS tipoproductoid,
         p.proveedorid_default
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       WHERE pv.varianteid = $1`,
      [parsedVarianteId]
    );

    if (!varianteInfo.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const row = varianteInfo.rows[0];

    const tipoProductoId =
      row.tipoproductoid !== null && row.tipoproductoid !== undefined
        ? Number.parseInt(row.tipoproductoid, 10)
        : null;

    const proveedorIdResolvedRaw =
      proveedorId !== undefined && proveedorId !== null && proveedorId !== ""
        ? proveedorId
        : row.proveedorid_default;
    const proveedorIdResolved =
      proveedorIdResolvedRaw !== null && proveedorIdResolvedRaw !== undefined
        ? Number.parseInt(proveedorIdResolvedRaw, 10)
        : null;

    // 2) Buscar regla de empaque por proveedor + tipoProducto
    let piezasPorPaquete = 1;
    let tipoEmpaque = "bultos";

    if (
      Number.isInteger(proveedorIdResolved) &&
      proveedorIdResolved > 0 &&
      Number.isInteger(tipoProductoId) &&
      tipoProductoId > 0
    ) {
      try {
        const regla = await client.query(
          `SELECT cantidadempaque
           FROM proveedor_reglas_empaque
           WHERE proveedorid = $1
             AND tipoproductoid = $2
           LIMIT 1`,
          [proveedorIdResolved, tipoProductoId]
        );

        if (regla.rows.length) {
          const factor = Number.parseInt(regla.rows[0].cantidadempaque, 10);
          if (Number.isInteger(factor) && factor > 0) {
            piezasPorPaquete = factor;
          }
        }
      } catch (dbError) {
        // Compatibilidad: si la columna se llama piezasporpaquete (o falta la tabla), no debe romper la recepción.
        if (dbError && dbError.code === "42703") {
          try {
            const regla = await client.query(
              `SELECT piezasporpaquete AS cantidadempaque
               FROM proveedor_reglas_empaque
               WHERE proveedorid = $1
                 AND tipoproductoid = $2
               LIMIT 1`,
              [proveedorIdResolved, tipoProductoId]
            );

            if (regla.rows.length) {
              const factor = Number.parseInt(regla.rows[0].cantidadempaque, 10);
              if (Number.isInteger(factor) && factor > 0) {
                piezasPorPaquete = factor;
              }
            }
          } catch (e) {
            // ignore
          }
        }
      }

      // 3) (Opcional) Fallback a catálogo si no hay regla
      if (!Number.isInteger(piezasPorPaquete) || piezasPorPaquete <= 0) {
        piezasPorPaquete = 1;
      }

      if (piezasPorPaquete === 1) {
        try {
          const cat = await client.query(
            `SELECT valor
             FROM cat_tamanopaquetes
             WHERE tipoproductoid = $1
             ORDER BY valor DESC
             LIMIT 1`,
            [tipoProductoId]
          );

          if (cat.rows.length) {
            const factor = Number.parseInt(cat.rows[0].valor, 10);
            if (Number.isInteger(factor) && factor > 0) {
              piezasPorPaquete = factor;
            }
          }
        } catch (e) {
          // ignore
        }
      }

      // Determinar etiqueta de empaque (mejor esfuerzo)
      try {
        const tipoEmpaqueResult = await client.query(
          `SELECT nombre
           FROM tipoproducto
           WHERE tipoproductoid = $1
           LIMIT 1`,
          [tipoProductoId]
        );
        if (tipoEmpaqueResult.rows.length) {
          const label = (tipoEmpaqueResult.rows[0].nombre || "").toString().trim();
          if (label) tipoEmpaque = label;
        }
      } catch (e) {
        // ignore
      }
    }

    const totalUnidades = parsedBultos * piezasPorPaquete;
    if (!Number.isInteger(totalUnidades) || totalUnidades <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Total de unidades inválido",
      });
    }

    const desglose = `Se recibieron ${parsedBultos} ${tipoEmpaque} de ${piezasPorPaquete} pzas (Total: ${totalUnidades})`;
    const motivo = `Recepción Compra - ${desglose}${comentariosTrim ? ` - ${comentariosTrim}` : ""}`;

    const { stockAnterior, stockNuevo } = await inventoryService.registrarMovimiento(
      client,
      {
        varianteId: parsedVarianteId,
        cantidadDelta: totalUnidades,
        motivo,
        usuarioId: req.user.id,
        esExcepcion: flagExcepcion,
      }
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: desglose,
      stockAnterior,
      nuevoStock: stockNuevo,
      data: {
        varianteId: parsedVarianteId,
        sku: row.sku,
        piezasPorPaquete,
        cantidadBultos: parsedBultos,
        totalUnidades,
        proveedorId: Number.isInteger(proveedorIdResolved) ? proveedorIdResolved : null,
        tipoProductoId: Number.isInteger(tipoProductoId) ? tipoProductoId : null,
        tipoEmpaque,
        esExcepcion: flagExcepcion,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error en recepcionarMercancia:", error);
    const status = error && Number.isInteger(error.status) ? error.status : 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Error en el servidor",
      error: error.message,
      code: error.code,
    });
  } finally {
    client.release();
  }
};

/**
 * Movimientos (Kardex) global con filtros
 * GET /api/admin/movimientos
 * Query params: varianteId, search, tipo (ENTRADA|SALIDA), fechaInicio, fechaFin
 */
const getMovimientosInventario = async (req, res) => {
  try {
    const where = [];
    const values = [];

    const varianteIdRaw = req.query.varianteId;
    if (varianteIdRaw !== undefined && varianteIdRaw !== null && varianteIdRaw !== "") {
      const varianteId = Number.parseInt(varianteIdRaw, 10);
      if (!Number.isInteger(varianteId) || varianteId <= 0) {
        return res.status(400).json({
          success: false,
          message: "varianteId inválido",
        });
      }
      values.push(varianteId);
      where.push(`li.varianteid = $${values.length}`);
    }

    const tipoRaw = (req.query.tipo || "").toString().trim().toUpperCase();
    if (tipoRaw === "ENTRADA") {
      where.push("li.cantidadcambiado > 0");
    } else if (tipoRaw === "SALIDA") {
      where.push("li.cantidadcambiado < 0");
    } else if (tipoRaw) {
      return res.status(400).json({
        success: false,
        message: "tipo inválido (usa ENTRADA o SALIDA)",
      });
    }

    const searchRaw = (req.query.search || "").toString().trim();
    if (searchRaw) {
      values.push(`%${searchRaw}%`);
      const p = `$${values.length}`;
      where.push(
        `(
          pv.sku ILIKE ${p} OR
          COALESCE(p.nombreproducto, '') ILIKE ${p} OR
          COALESCE(li.motivo, '') ILIKE ${p} OR
          COALESCE(pv.dimensiones, '') ILIKE ${p}
        )`
      );
    }

    const fechaInicioRaw = (req.query.fechaInicio || "").toString().trim();
    if (fechaInicioRaw) {
      values.push(fechaInicioRaw);
      where.push(`li.fecha >= $${values.length}::timestamp`);
    }

    const fechaFinRaw = (req.query.fechaFin || "").toString().trim();
    if (fechaFinRaw) {
      values.push(fechaFinRaw);
      where.push(`li.fecha <= $${values.length}::timestamp`);
    }

    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 50)
      : 50;
    values.push(limit);
    const limitParam = `$${values.length}`;

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    let rows = [];

    try {
      const r = await db.query(
        `SELECT
           li.logid,
           li.fecha,
           li.varianteid,
           li.cantidadcambiado,
           ABS(li.cantidadcambiado) AS cantidad,
           li.motivo,
           li.nuevostock,
           li.usuarioid,
           li.es_excepcion,
           pv.sku,
           pv.dimensiones,
           p.productoid,
           p.nombreproducto,
           COALESCE(
             NULLIF(TRIM(a.nombre), ''),
             NULLIF(TRIM(av.nombre || ' ' || av.apellido), ''),
             NULL
           ) AS usuario
         FROM log_inventario li
         INNER JOIN producto_variantes pv ON pv.varianteid = li.varianteid
         INNER JOIN productos p ON p.productoid = pv.productoid
         LEFT JOIN administradores a ON a.adminid = li.usuarioid
         LEFT JOIN agentesdeventas av ON av.agenteid = li.usuarioid
         ${whereSql}
         ORDER BY li.fecha DESC
         LIMIT ${limitParam}`,
        values
      );
      rows = r.rows || [];
    } catch (error) {
      // Si la columna es_excepcion aún no existe, hacer fallback sin romper.
      if (error && error.code === "42703") {
        const r = await db.query(
          `SELECT
             li.logid,
             li.fecha,
             li.varianteid,
             li.cantidadcambiado,
             ABS(li.cantidadcambiado) AS cantidad,
             li.motivo,
             li.nuevostock,
             li.usuarioid,
             pv.sku,
             pv.dimensiones,
             p.productoid,
             p.nombreproducto,
             COALESCE(
               NULLIF(TRIM(a.nombre), ''),
               NULLIF(TRIM(av.nombre || ' ' || av.apellido), ''),
               NULL
             ) AS usuario
           FROM log_inventario li
           INNER JOIN producto_variantes pv ON pv.varianteid = li.varianteid
           INNER JOIN productos p ON p.productoid = pv.productoid
           LEFT JOIN administradores a ON a.adminid = li.usuarioid
           LEFT JOIN agentesdeventas av ON av.agenteid = li.usuarioid
           ${whereSql}
           ORDER BY li.fecha DESC
           LIMIT ${limitParam}`,
          values
        );
        rows = r.rows || [];
      } else {
        throw error;
      }
    }

    const movimientos = (rows || []).map((r) => {
      const cantidadCambiado = Number.parseInt(r.cantidadcambiado, 10) || 0;
      const tipoMovimiento = cantidadCambiado >= 0 ? "ENTRADA" : "SALIDA";
      return {
        logId: r.logid,
        fecha: r.fecha,
        varianteId: r.varianteid,
        productoId: r.productoid,
        productoNombre: r.nombreproducto,
        sku: r.sku,
        dimensiones: r.dimensiones,
        tipoMovimiento,
        cantidad: Number.parseInt(r.cantidad, 10) || 0,
        motivo: r.motivo || "",
        nuevoStock: Number.parseInt(r.nuevostock, 10) || 0,
        usuarioId: r.usuarioid ?? null,
        usuario: r.usuario || null,
        esExcepcion: r.es_excepcion === true,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        movimientos,
        total: movimientos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener movimientos de inventario:", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

/**
 * Historial (Kardex) de movimientos por variante
 * GET /api/admin/inventario/:varianteId/historial
 */
const getHistorialInventarioVariante = async (req, res) => {
  try {
    const varianteId = Number.parseInt(req.params.varianteId, 10);
    if (!Number.isInteger(varianteId) || varianteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "varianteId inválido",
      });
    }

    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 50)
      : 50;

    const { rows } = await db.query(
      `SELECT
         li.fecha,
         li.cantidadcambiado,
         ABS(li.cantidadcambiado) AS cantidad,
         li.motivo,
         li.nuevostock,
         li.usuarioid,
         COALESCE(
           NULLIF(TRIM(a.nombre), ''),
           NULLIF(TRIM(av.nombre || ' ' || av.apellido), ''),
           NULL
         ) AS usuario
       FROM log_inventario li
       LEFT JOIN administradores a ON a.adminid = li.usuarioid
       LEFT JOIN agentesdeventas av ON av.agenteid = li.usuarioid
       WHERE li.varianteid = $1
       ORDER BY li.fecha DESC
       LIMIT $2`,
      [varianteId, limit]
    );

    const movimientos = (rows || []).map((r) => {
      const cantidadCambiado = Number.parseInt(r.cantidadcambiado, 10) || 0;
      const tipoMovimiento = cantidadCambiado >= 0 ? "ENTRADA" : "SALIDA";
      return {
        fecha: r.fecha,
        tipoMovimiento,
        cantidad: Number.parseInt(r.cantidad, 10) || 0,
        motivo: r.motivo || "",
        nuevoStock: Number.parseInt(r.nuevostock, 10) || 0,
        usuarioId: r.usuarioid ?? null,
        usuario: r.usuario || null,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        varianteId,
        movimientos,
        total: movimientos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener historial de inventario:", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

const PEDIDO_ESTATUS_EMAIL_TEMPLATES = {
  Confirmado: {
    asunto: (pedidoId) => `¡Tu pedido #${pedidoId} ha sido confirmado!`,
    html: (nombre, pedidoId) => `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <h2 style="color:#16a34a;">¡Tu pedido está confirmado!</h2>
        <p>Hola ${nombre}, hemos confirmado tu pago y estamos preparando tu pedido.</p>
        <p>Pedido: <strong>#${pedidoId}</strong></p>
        <p style="margin-top: 1.5rem;">Equipo RazoConnect</p>
      </div>
    `,
  },
  Enviado: {
    asunto: (pedidoId) => `¡Tu pedido #${pedidoId} va en camino!`,
    html: (nombre, pedidoId) => `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <h2 style="color:#0ea5e9;">¡Tu pedido está en camino!</h2>
        <p>Hola ${nombre}, buenas noticias: tu pedido ha salido de nuestro almacén.</p>
        <p>Pedido: <strong>#${pedidoId}</strong></p>
        <p style="margin-top: 1.5rem;">Equipo RazoConnect</p>
      </div>
    `,
  },
  Cancelado: {
    asunto: (pedidoId) => `Actualización sobre tu pedido #${pedidoId}`,
    html: (nombre, pedidoId) => `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <h2 style="color:#dc2626;">Actualización de tu pedido</h2>
        <p>Hola ${nombre}, tu pedido ha sido cancelado. Si crees que es un error, contáctanos.</p>
        <p>Pedido: <strong>#${pedidoId}</strong></p>
        <p style="margin-top: 1.5rem;">Equipo RazoConnect</p>
      </div>
    `,
  },
};

const getProveedorById = async (req, res) => {
  try {
    const proveedorId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProveedorID inválido",
      });
    }

    const result = await db.query(
      `SELECT *
       FROM Proveedores
       WHERE ProveedorID = $1`,
      [proveedorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    return res.json({
      success: true,
      data: {
        proveedor: result.rows[0],
      },
    });
  } catch (error) {
    console.error("Error al obtener proveedor:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener el proveedor",
    });
  }
};

/**
 * Obtener variantes pendientes (INSERT) desde control_cambios
 * GET /api/admin/productos/:id/variantes-pendientes
 */
const getVariantesPendientesProducto = async (req, res) => {
  try {
    const productoId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(productoId) || productoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProductoID inválido",
      });
    }

    const result = await db.query(
      `SELECT id, datos_nuevos, fecha_solicitud
       FROM control_cambios
       WHERE estado = 'PENDIENTE'
         AND LOWER(entidad) = 'producto_variantes'
         AND COALESCE(
           (datos_nuevos::jsonb)->>'productoid',
           (datos_nuevos::jsonb)->>'ProductoID',
           (datos_nuevos::jsonb)->>'productoId'
         ) = $1
       ORDER BY fecha_solicitud DESC`,
      [String(productoId)]
    );

    const pendientes = (result.rows || [])
      .map((row) => {
        let datos = row.datos_nuevos;
        if (!datos || typeof datos !== "object") {
          try {
            datos = JSON.parse(row.datos_nuevos);
          } catch (e) {
            return null;
          }
        }

        const sku = datos.sku ?? datos.SKU ?? null;
        const dimensiones = datos.dimensiones ?? datos.Dimensiones ?? null;
        const costoUnitarioRaw = datos.costounitario ?? datos.CostoUnitario;
        const precioUnitarioRaw = datos.preciounitario ?? datos.PrecioUnitario;
        const precioOfertaRaw =
          datos.precioofertaunitario ?? datos.PrecioOfertaUnitario;
        const stockRaw = datos.stock ?? datos.Stock;
        const piezasPorPaqueteRaw =
          datos.piezasporpaquete ?? datos.PiezasPorPaquete;
        const tipoProductoIdRaw = datos.tipoproductoid ?? datos.TipoProductoID;
        const medidaIdRaw = datos.medidaid ?? datos.MedidaID;

        const costoUnitario =
          costoUnitarioRaw !== undefined && costoUnitarioRaw !== null
            ? Number.parseFloat(costoUnitarioRaw)
            : null;
        const precioUnitario =
          precioUnitarioRaw !== undefined && precioUnitarioRaw !== null
            ? Number.parseFloat(precioUnitarioRaw)
            : null;
        const precioOfertaUnitario =
          precioOfertaRaw !== undefined && precioOfertaRaw !== null
            ? Number.parseFloat(precioOfertaRaw)
            : null;
        const stock =
          stockRaw !== undefined && stockRaw !== null
            ? Number.parseInt(stockRaw, 10)
            : 0;
        const piezasPorPaquete =
          piezasPorPaqueteRaw !== undefined && piezasPorPaqueteRaw !== null
            ? Number.parseInt(piezasPorPaqueteRaw, 10)
            : null;
        const tipoProductoId =
          tipoProductoIdRaw !== undefined && tipoProductoIdRaw !== null
            ? Number.parseInt(tipoProductoIdRaw, 10)
            : null;
        const medidaId =
          medidaIdRaw !== undefined && medidaIdRaw !== null
            ? Number.parseInt(medidaIdRaw, 10)
            : null;

        const activo =
          datos.activo !== undefined && datos.activo !== null
            ? Boolean(datos.activo)
            : true;

        return {
          varianteId: null,
          productoId,
          sku,
          dimensiones,
          costoUnitario: Number.isFinite(costoUnitario) ? costoUnitario : null,
          precioUnitario: Number.isFinite(precioUnitario) ? precioUnitario : null,
          precioOfertaUnitario: Number.isFinite(precioOfertaUnitario)
            ? precioOfertaUnitario
            : null,
          stock: Number.isInteger(stock) && stock > 0 ? stock : 0,
          piezasPorPaquete:
            Number.isInteger(piezasPorPaquete) && piezasPorPaquete > 0
              ? piezasPorPaquete
              : null,
          tipoProductoId:
            Number.isInteger(tipoProductoId) && tipoProductoId > 0
              ? tipoProductoId
              : null,
          medidaId: Number.isInteger(medidaId) && medidaId > 0 ? medidaId : null,
          activo,
          isPending: true,
          controlCambioId: row.id,
          fechaSolicitud: row.fecha_solicitud,
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      message: "Variantes pendientes obtenidas exitosamente",
      data: {
        productoId,
        variantes: pendientes,
        total: pendientes.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener variantes pendientes del producto:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener variantes pendientes",
      error: error.message,
    });
  }
};

const getSolicitudesPendientesProveedor = async (req, res) => {
  try {
    const proveedorId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProveedorID inválido",
      });
    }

    const proveedorResult = await db.query(
      `SELECT proveedorid
       FROM proveedores
       WHERE proveedorid = $1`,
      [proveedorId]
    );
    if (!proveedorResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const { rows } = await db.query(
      `SELECT
         id,
         entidad,
         entidad_id,
         tipo_cambio,
         datos_nuevos,
         fecha_solicitud
       FROM control_cambios
       WHERE estado = 'PENDIENTE'
         AND LOWER(entidad) = 'proveedor_reglas_empaque'
         AND COALESCE(
           (datos_nuevos::jsonb)->>'proveedorId',
           (datos_nuevos::jsonb)->>'proveedorid'
         ) = $1
       ORDER BY fecha_solicitud DESC`,
      [String(proveedorId)]
    );

    const solicitudes = (rows || []).map((r) => ({
      id: r.id,
      entidad: r.entidad,
      entidadId: r.entidad_id ?? null,
      tipoCambio: r.tipo_cambio,
      datosNuevos: r.datos_nuevos,
      fechaSolicitud: r.fecha_solicitud,
    }));

    return res.status(200).json({
      success: true,
      message: "Solicitudes pendientes obtenidas exitosamente",
      data: {
        solicitudes,
      },
    });
  } catch (error) {
    console.error("Error al obtener solicitudes pendientes del proveedor:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener solicitudes pendientes",
      error: error.message,
    });
  }
};

const getAgenteAdminColumnsInfo = async () => {
  if (agenteAdminColumnsCache) {
    return agenteAdminColumnsCache;
  }

  try {
    const columnsResult = await db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'agentesdeventas'
         AND column_name IN ('esadmin', 'adminrol')`
    );

    const found = columnsResult.rows.map((row) => row.column_name);
    agenteAdminColumnsCache = {
      esAdmin: found.includes("esadmin"),
      adminRol: found.includes("adminrol"),
    };

    if (!agenteAdminColumnsCache.esAdmin || !agenteAdminColumnsCache.adminRol) {
      console.warn(
        "⚠️  Columnas opcionales para admin de agentes no detectadas en AgentesDeVentas.",
        agenteAdminColumnsCache
      );
    }
  } catch (error) {
    console.error("Error verificando columnas de agentes admin:", error);
    agenteAdminColumnsCache = {
      esAdmin: false,
      adminRol: false,
    };
  }

  return agenteAdminColumnsCache;
};

/**
 * Login de administrador
 * POST /api/admin/login
 */
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validar campos requeridos
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email y contraseña son requeridos",
      });
    }

    // Buscar administrador por email
    const result = await db.query(
      "SELECT * FROM Administradores WHERE Email = $1 AND Activo = TRUE",
      [email]
    );

    let cuenta = null;

    if (result.rows.length > 0) {
      const admin = result.rows[0];
      cuenta = {
        id: admin.adminid,
        email: admin.email,
        nombre: admin.nombre,
        apellido: admin.apellido || "",
        rol: admin.rol,
        passwordHash: admin.passwordhash,
        adminSource: "admin",
        roles: Array.from(new Set(["admin", admin.rol].filter(Boolean))),
      };
    } else {
      const { esAdmin: hasEsAdminColumn, adminRol: hasAdminRolColumn } =
        await getAgenteAdminColumnsInfo();

      let agenteQueryText = `
        SELECT
          AgenteID,
          Nombre,
          Apellido,
          Email,
          PasswordHash,
          CodigoAgente,
          Activo
        FROM AgentesDeVentas
        WHERE Email = $1 AND Activo = TRUE
      `;

      if (hasEsAdminColumn && hasAdminRolColumn) {
        agenteQueryText = `
          SELECT
            AgenteID,
            Nombre,
            Apellido,
            Email,
            PasswordHash,
            CodigoAgente,
            Activo,
            EsAdmin,
            AdminRol
          FROM AgentesDeVentas
          WHERE Email = $1 AND Activo = TRUE
        `;
      } else if (hasEsAdminColumn) {
        agenteQueryText = `
          SELECT
            AgenteID,
            Nombre,
            Apellido,
            Email,
            PasswordHash,
            CodigoAgente,
            Activo,
            EsAdmin
          FROM AgentesDeVentas
          WHERE Email = $1 AND Activo = TRUE
        `;
      } else if (hasAdminRolColumn) {
        agenteQueryText = `
          SELECT
            AgenteID,
            Nombre,
            Apellido,
            Email,
            PasswordHash,
            CodigoAgente,
            Activo,
            AdminRol
          FROM AgentesDeVentas
          WHERE Email = $1 AND Activo = TRUE
        `;
      }

      const agenteResult = await db.query(agenteQueryText, [email]);

      if (agenteResult.rows.length > 0) {
        const agente = agenteResult.rows[0];
        const esAdmin = hasEsAdminColumn ? Boolean(agente.esadmin) : false;

        if (esAdmin) {
          const adminRol = hasAdminRolColumn
            ? agente.adminrol || "admin"
            : "admin";
          cuenta = {
            id: agente.agenteid,
            email: agente.email,
            nombre: agente.nombre,
            apellido: agente.apellido || "",
            rol: adminRol,
            passwordHash: agente.passwordhash,
            adminSource: "agent",
            codigoAgente: agente.codigoagente,
            roles: Array.from(new Set(["admin", adminRol, "agente"])),
          };
        }
      }
    }

    if (!cuenta) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, cuenta.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    const tokenPayload = {
      id: cuenta.id,
      email: cuenta.email,
      rol: cuenta.rol,
      tipo: "admin",
      roles: cuenta.roles,
      adminSource: cuenta.adminSource,
    };

    if (cuenta.adminSource === "agent") {
      tokenPayload.agenteId = cuenta.id;
      if (cuenta.codigoAgente) {
        tokenPayload.codigoAgente = cuenta.codigoAgente;
      }
    }

    // Generar token JWT
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: "8h" } // Token válido por 8 horas
    );

    const nombreCompleto =
      [cuenta.nombre, cuenta.apellido].filter(Boolean).join(" ").trim() ||
      cuenta.nombre;

    // Preparar datos de respuesta
    res.json({
      success: true,
      message: "Login exitoso",
      data: {
        token,
        admin: {
          adminId: cuenta.id,
          nombre: nombreCompleto,
          email: cuenta.email,
          rol: cuenta.rol,
          origen: cuenta.adminSource,
        },
      },
    });

    // Registrar log de LOGIN de admin (no bloquear el flujo principal)
    try {
      req.user = {
        id: cuenta.id,
        email: cuenta.email,
        nombre: cuenta.nombre,
        apellido: cuenta.apellido,
        rol: cuenta.rol,
        roles: cuenta.roles,
        adminSource: cuenta.adminSource,
      };

      registrarLog(req, "LOGIN", "Admin", cuenta.id, {
        email: cuenta.email,
        origen: cuenta.adminSource,
      }).catch((err) => {
        console.error("Error guardando log de LOGIN admin:", err);
      });
    } catch (logError) {
      console.error("Error interno al preparar log de LOGIN admin:", logError);
    }
  } catch (error) {
    console.error("Error en login de admin:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

const getReglasEmpaqueProveedor = async (req, res) => {
  try {
    const proveedorId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProveedorID inválido",
      });
    }

    const proveedorResult = await db.query(
      `SELECT proveedorid
       FROM proveedores
       WHERE proveedorid = $1`,
      [proveedorId]
    );

    if (!proveedorResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    let reglasResult;
    try {
      reglasResult = await db.query(
        `SELECT tipoproductoid, cantidadempaque
         FROM proveedor_reglas_empaque
         WHERE proveedorid = $1`,
        [proveedorId]
      );
    } catch (dbError) {
      if (dbError && dbError.code === "42703") {
        reglasResult = await db.query(
          `SELECT tipoproductoid, piezasporpaquete AS cantidadempaque
           FROM proveedor_reglas_empaque
           WHERE proveedorid = $1`,
          [proveedorId]
        );
      } else {
        throw dbError;
      }
    }

    const reglas = (reglasResult?.rows || []).reduce((acc, row) => {
      const tipoId = row.tipoproductoid;
      const cantidad = row.cantidadempaque;
      if (tipoId !== null && tipoId !== undefined && cantidad !== null && cantidad !== undefined) {
        const tipoKey = String(tipoId);
        const cantidadInt = Number.parseInt(cantidad, 10);
        if (Number.isInteger(cantidadInt) && cantidadInt > 0) {
          acc[tipoKey] = cantidadInt;
        }
      }
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      message: "Reglas de empaque obtenidas exitosamente",
      data: {
        reglas,
      },
    });
  } catch (error) {
    console.error("Error al obtener reglas de empaque del proveedor:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener reglas de empaque",
      error: error.message,
    });
  }
};

const saveReglaEmpaque = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const proveedorIdRaw =
      req.params.id ?? req.body.proveedorId ?? req.body.proveedorid ?? req.body.ProveedorID;
    const proveedorId = Number.parseInt(proveedorIdRaw, 10);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProveedorID inválido",
      });
    }

    const tipoProductoIdRaw =
      req.body.tipoproductoid ?? req.body.TipoProductoID ?? req.body.tipoProductoId;
    const tipoProductoNombreRaw =
      req.body.tipoProductoNombre ?? req.body.tipoProducto ?? req.body.TipoProducto;

    const tipoProductoIdParsed = Number.parseInt(tipoProductoIdRaw, 10);
    let tipoProductoId =
      Number.isInteger(tipoProductoIdParsed) && tipoProductoIdParsed > 0
        ? tipoProductoIdParsed
        : null;

    const tipoProductoNombre = (() => {
      if (tipoProductoNombreRaw === undefined || tipoProductoNombreRaw === null) {
        return null;
      }
      const txt = String(tipoProductoNombreRaw).trim();
      return txt.length ? txt : null;
    })();

    if (!tipoProductoId && !tipoProductoNombre) {
      return res.status(400).json({
        success: false,
        message: "TipoProductoID inválido",
      });
    }

    const cantidadEmpaque = Number.parseInt(
      req.body.cantidadempaque ?? req.body.cantidadEmpaque ?? req.body.piezasPorPaquete,
      10
    );
    if (!Number.isInteger(cantidadEmpaque) || cantidadEmpaque <= 0) {
      return res.status(400).json({
        success: false,
        message: "cantidadEmpaque inválida",
      });
    }

    await client.query("BEGIN");

    const proveedorResult = await client.query(
      `SELECT proveedorid, nombreempresa
       FROM proveedores
       WHERE proveedorid = $1`,
      [proveedorId]
    );
    if (!proveedorResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const proveedorNombre = proveedorResult.rows[0]?.nombreempresa || "Proveedor";

    if (!tipoProductoId && tipoProductoNombre) {
      const creado = await client.query(
        `INSERT INTO tipoproducto (nombre, descripcion, activo)
         VALUES ($1, NULL, TRUE)
         ON CONFLICT (nombre)
         DO UPDATE SET activo = TRUE
         RETURNING tipoproductoid`,
        [tipoProductoNombre]
      );
      const nuevoId = Number.parseInt(creado.rows[0]?.tipoproductoid, 10);
      if (!Number.isInteger(nuevoId) || nuevoId <= 0) {
        return res.status(500).json({
          success: false,
          message: "No se pudo crear el tipo de producto",
        });
      }
      tipoProductoId = nuevoId;
    }

    const tipoResult = await client.query(
      `SELECT tipoproductoid, nombre
       FROM tipoproducto
       WHERE tipoproductoid = $1`,
      [tipoProductoId]
    );
    if (!tipoResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Tipo de producto no encontrado",
      });
    }

    const tipoProductoNombreFinal = tipoResult.rows[0]?.nombre || "Tipo";

    let reglaExistenteResult;
    try {
      reglaExistenteResult = await client.query(
        `SELECT reglaid, cantidadempaque
         FROM proveedor_reglas_empaque
         WHERE proveedorid = $1
           AND tipoproductoid = $2
         LIMIT 1
         FOR UPDATE`,
        [proveedorId, tipoProductoId]
      );
    } catch (dbError) {
      if (dbError && dbError.code === "42703") {
        reglaExistenteResult = await client.query(
          `SELECT reglaid, piezasporpaquete AS cantidadempaque
           FROM proveedor_reglas_empaque
           WHERE proveedorid = $1
             AND tipoproductoid = $2
           LIMIT 1
           FOR UPDATE`,
          [proveedorId, tipoProductoId]
        );
      } else {
        throw dbError;
      }
    }

    const reglaExistente = reglaExistenteResult.rows[0] || null;
    const tipoCambio = reglaExistente ? "UPDATE" : "INSERT";

    const datosAnteriores = reglaExistente
      ? {
          proveedorid: proveedorId,
          tipoproductoid: tipoProductoId,
          cantidadempaque: Number.parseInt(reglaExistente.cantidadempaque, 10) || 1,
        }
      : null;

    const datosNuevos = {
      proveedorid: proveedorId,
      tipoproductoid: tipoProductoId,
      cantidadempaque: cantidadEmpaque,
    };

    let reglaid;
    if (reglaExistente) {
      reglaid = reglaExistente.reglaid;
      try {
        await client.query(
          `UPDATE proveedor_reglas_empaque
           SET cantidadempaque = $3
           WHERE reglaid = $1 AND proveedorid = $2`,
          [reglaid, proveedorId, cantidadEmpaque]
        );
      } catch (dbError) {
        if (dbError && dbError.code === "42703") {
          await client.query(
            `UPDATE proveedor_reglas_empaque
             SET piezasporpaquete = $3
             WHERE reglaid = $1 AND proveedorid = $2`,
            [reglaid, proveedorId, cantidadEmpaque]
          );
        } else {
          throw dbError;
        }
      }
    } else {
      let insertResult;
      try {
        insertResult = await client.query(
          `INSERT INTO proveedor_reglas_empaque (proveedorid, tipoproductoid, cantidadempaque)
           VALUES ($1, $2, $3)
           RETURNING reglaid`,
          [proveedorId, tipoProductoId, cantidadEmpaque]
        );
      } catch (dbError) {
        if (dbError && dbError.code === "42703") {
          insertResult = await client.query(
            `INSERT INTO proveedor_reglas_empaque (proveedorid, tipoproductoid, piezasporpaquete)
             VALUES ($1, $2, $3)
             RETURNING reglaid`,
            [proveedorId, tipoProductoId, cantidadEmpaque]
          );
        } else {
          throw dbError;
        }
      }
      reglaid = insertResult.rows[0]?.reglaid ?? null;
    }

    const adminId = req?.user?.id ?? req?.user?.userId ?? null;
    const adminIdParsed = Number.parseInt(adminId, 10);
    if (!Number.isInteger(adminIdParsed) || adminIdParsed <= 0) {
      throw new Error("Usuario solicitante no identificado como admin");
    }

    const adminNombreResult = await client.query(
      `SELECT nombre
       FROM administradores
       WHERE adminid = $1`,
      [adminIdParsed]
    );
    const adminNombre = adminNombreResult.rows[0]?.nombre || "Usuario";

    const cambioRes = await client.query(
      `INSERT INTO control_cambios (
         entidad,
         entidad_id,
         tipo_cambio,
         datos_anteriores,
         datos_nuevos,
         usuario_solicitante_id,
         estado,
         fecha_resolucion,
         usuario_resolutor_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'APROBADO', NOW(), $6)
       RETURNING id`,
      [
        "proveedor_reglas_empaque",
        reglaid,
        tipoCambio,
        datosAnteriores ? JSON.stringify(datosAnteriores) : null,
        JSON.stringify(datosNuevos),
        adminIdParsed,
      ]
    );

    await notifySuperAdmins(client, {
      tipo: "sistema",
      prioridad: "media",
      titulo: "Aviso: Regla de Empaque Modificada",
      mensaje: `El usuario ${adminNombre} modificó la regla de empaque para ${proveedorNombre} - ${tipoProductoNombreFinal}: ${cantidadEmpaque} piezas`,
      url: `/admin-proveedor-detalle.html?id=${proveedorId}`,
      metadata: {
        proveedorId,
        proveedorNombre,
        tipoProductoId,
        tipoProductoNombre: tipoProductoNombreFinal,
        cantidadEmpaque,
        tipoCambio,
        controlCambioId: cambioRes.rows[0]?.id ?? null,
      },
    });

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Regla de empaque aplicada exitosamente",
      data: {
        reglaid,
        tipoCambio,
        cantidadEmpaque,
        controlCambioId: cambioRes.rows[0]?.id ?? null,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // silencioso
    }
    console.error("Error al guardar regla de empaque:", error);
    return res.status(500).json({
      success: false,
      message: "Error al guardar regla de empaque",
      error: error.message,
    });
  }
  finally {
    client.release();
  }
};

/**
 * Obtener clientes asignados a un agente específico
 * GET /api/admin/agentes/:id/clientes
 */
const getAgenteClientes = async (req, res) => {
  try {
    const agenteId = parseInt(req.params.id, 10);

    if (Number.isNaN(agenteId)) {
      return res.status(400).json({
        success: false,
        message: "ID de agente inválido",
      });
    }

    const agenteResult = await db.query(
      `SELECT AgenteID FROM AgentesDeVentas WHERE AgenteID = $1`,
      [agenteId]
    );

    if (agenteResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Agente no encontrado",
      });
    }

    const clientesResult = await db.query(
      `SELECT
         c.ClienteID,
         c.Nombre,
         c.Apellido,
         c.Email,
         c.Telefono,
         c.FechaDeRegistro,
         stats.total_pedidos,
         stats.monto_total,
         stats.total_comisiones
       FROM Clientes c
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) AS total_pedidos,
           COALESCE(SUM(p.MontoTotal), 0) AS monto_total,
           COALESCE(SUM(co.MontoComision), 0) AS total_comisiones
         FROM Pedidos p
         LEFT JOIN Comisiones co ON co.PedidoID = p.PedidoID
         WHERE p.ClienteID = c.ClienteID AND p.AgenteID = $1
       ) stats ON TRUE
       WHERE c.AgenteID = $1
       ORDER BY c.FechaDeRegistro DESC`,
      [agenteId]
    );

    const clientes = clientesResult.rows.map((row) => ({
      clienteId: row.clienteid,
      nombre: row.nombre,
      apellido: row.apellido,
      email: row.email,
      telefono: row.telefono,
      fechaRegistro: row.fechaderegistro,
      totalPedidos: Number.parseInt(row.total_pedidos ?? 0, 10),
      montoTotalCompras: Number.parseFloat(row.monto_total ?? 0),
      totalComisiones: Number.parseFloat(row.total_comisiones ?? 0),
    }));

    return res.json({
      success: true,
      data: {
        clientes,
        total: clientes.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener clientes del agente:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener la cartera del agente",
    });
  }
};

/**
 * Desvincular un cliente de su agente asignado
 * PUT /api/admin/clientes/:id/desvincular
 */
const desvincularClienteDeAgente = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);

    if (Number.isNaN(clienteId)) {
      return res.status(400).json({
        success: false,
        message: "ID de cliente inválido",
      });
    }

    const snapshotResult = await db.query(
      "SELECT * FROM Clientes WHERE ClienteID = $1",
      [clienteId]
    );

    if (snapshotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    const clienteActual = snapshotResult.rows[0];

    const rol = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rol === "admin" || rol === "superadmin";

    const datosNuevos = {
      AgenteID: null,
    };

    if (allowDirect) {
      const updateRes = await db.query(
        "UPDATE clientes SET agenteid = $1 WHERE clienteid = $2 RETURNING clienteid, nombre, apellido, email, telefono, activo, agenteid",
        [null, clienteId]
      );

      if (!updateRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Cliente no encontrado",
        });
      }

      const row = updateRes.rows[0];

      await auditService.registrarCambioPasivo(
        req,
        "clientes",
        clienteId,
        "UPDATE",
        clienteActual,
        {
          clienteid: row.clienteid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          telefono: row.telefono,
          activo: row.activo,
          agenteid: row.agenteid,
        }
      );

      return res.json({
        success: true,
        message: "Cliente desvinculado correctamente.",
        data: {
          clienteId: row.clienteid,
          agenteId: row.agenteid,
        },
      });
    }

    const resultado = await solicitarCambio(
      req,
      "clientes",
      clienteId,
      "UPDATE",
      datosNuevos,
      clienteActual
    );

    return res.json({
      success: true,
      message: resultado.mensaje,
      data: {
        clienteId,
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error("Error al desvincular cliente:", error);
    return res.status(500).json({
      success: false,
      message: "Error al desvincular al cliente del agente",
    });
  }
};

/**
 * Actualizar costo de envío de un pedido
 * PUT /api/admin/pedidos/:id/costo-envio
 */
const updateCostoEnvio = async (req, res) => {
  try {
    const pedidoId = parseInt(req.params.id);
    const { costoEnvio } = req.body;

    if (Number.isNaN(pedidoId)) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    if (costoEnvio === undefined || costoEnvio === null || costoEnvio === "") {
      return res.status(400).json({
        success: false,
        message: "El costo de envío es requerido",
      });
    }

    const costoEnvioValue = parseFloat(costoEnvio);

    if (Number.isNaN(costoEnvioValue) || costoEnvioValue < 0) {
      return res.status(400).json({
        success: false,
        message: "El costo de envío debe ser un número mayor o igual a 0",
      });
    }

    const result = await db.query(
      `UPDATE Pedidos
       SET CostoEnvio = $1
       WHERE PedidoID = $2
       RETURNING PedidoID, CostoEnvio`,
      [costoEnvioValue, pedidoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    res.json({
      success: true,
      message: "Costo de envío actualizado",
      data: {
        pedidoId: result.rows[0].pedidoid,
        costoEnvio: parseFloat(result.rows[0].costoenvio),
      },
    });
  } catch (error) {
    console.error("Error al actualizar costo de envío:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar el costo de envío",
    });
  }
};

/**
 * Obtener detalle de un cliente
 * GET /api/admin/clientes/:id
 */
const getClienteDetalle = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);

    if (!Number.isInteger(clienteId)) {
      return res.status(400).json({
        success: false,
        message: "ClienteID inválido",
      });
    }

    const clienteQuery = `
      SELECT 
        ClienteID,
        Nombre,
        Apellido,
        Email,
        Telefono,
        Activo,
        FechaDeRegistro
      FROM Clientes
      WHERE ClienteID = $1
    `;

    const clienteResult = await db.query(clienteQuery, [clienteId]);

    if (clienteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    const cliente = clienteResult.rows[0];

    const pedidosQuery = `
      SELECT 
        PedidoID,
        FechaPedido,
        MontoTotal,
        Estatus,
        DireccionEnvioID,
        AgenteID
      FROM Pedidos
      WHERE ClienteID = $1
      ORDER BY FechaPedido DESC
    `;

    const pedidosResult = await db.query(pedidosQuery, [clienteId]);

    const direccionesQuery = `
      SELECT 
        cd.DireccionID,
        cd.Etiqueta,
        cd.Receptor,
        cd.Calle,
        cd.NumeroExt,
        cd.NumeroInt,
        cd.Colonia,
        cd.Ciudad,
        cd.EstadoID,
        e.Nombre AS EstadoNombre,
        e.Abreviatura AS EstadoAbreviatura,
        cd.CodigoPostal,
        cd.TelefonoContacto
      FROM Cliente_Direcciones cd
      LEFT JOIN Estados e ON cd.EstadoID = e.EstadoID
      WHERE cd.ClienteID = $1
      ORDER BY cd.DireccionID DESC
    `;

    const direccionesResult = await db.query(direccionesQuery, [clienteId]);

    res.json({
      success: true,
      data: {
        cliente: {
          clienteId: cliente.clienteid,
          nombre: cliente.nombre,
          apellido: cliente.apellido,
          email: cliente.email,
          telefono: cliente.telefono,
          activo: cliente.activo,
          fechaRegistro: cliente.fechaderegistro,
        },
        pedidos: pedidosResult.rows.map((pedido) => ({
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          montoTotal: pedido.montototal ? parseFloat(pedido.montototal) : 0,
          estatus: pedido.estatus,
          direccionEnvioId: pedido.direccionenvioid,
          agenteId: pedido.agenteid,
        })),
        direcciones: direccionesResult.rows.map((direccion) => ({
          direccionId: direccion.direccionid,
          etiqueta: direccion.etiqueta,
          receptor: direccion.receptor,
          calle: direccion.calle,
          numeroExt: direccion.numeroext,
          numeroInt: direccion.numeroint,
          colonia: direccion.colonia,
          ciudad: direccion.ciudad,
          estadoId:
            direccion.estadoid !== null
              ? parseInt(direccion.estadoid, 10)
              : null,
          estado: direccion.estadonombre || null,
          estadoNombre: direccion.estadonombre || null,
          estadoAbreviatura: direccion.estadoabreviatura || null,
          codigoPostal: direccion.codigopostal,
          telefonoContacto: direccion.telefonocontacto,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener detalle del cliente:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Actualizar estado activo de un cliente
 * PUT /api/admin/clientes/:id/estado
 */
const actualizarEstadoCliente = async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id, 10);
    const { activo } = req.body;

    if (!Number.isInteger(clienteId)) {
      return res.status(400).json({
        success: false,
        message: "ClienteID inválido",
      });
    }

    if (typeof activo !== "boolean") {
      return res.status(400).json({
        success: false,
        message: 'El campo "activo" debe ser booleano',
      });
    }

    const snapshotResult = await db.query(
      "SELECT * FROM Clientes WHERE ClienteID = $1",
      [clienteId]
    );

    if (snapshotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    const clienteActual = snapshotResult.rows[0];

    const rol = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rol === "admin" || rol === "superadmin";

    const datosNuevos = {
      Activo: activo,
    };

    if (allowDirect) {
      const updateRes = await db.query(
        "UPDATE clientes SET activo = $1 WHERE clienteid = $2 RETURNING clienteid, activo",
        [activo, clienteId]
      );

      if (!updateRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Cliente no encontrado",
        });
      }

      const row = updateRes.rows[0];

      await auditService.registrarCambioPasivo(
        req,
        "clientes",
        clienteId,
        "UPDATE",
        clienteActual,
        {
          clienteid: row.clienteid,
          activo: row.activo,
        }
      );

      return res.json({
        success: true,
        message: "Estado del cliente actualizado correctamente.",
        data: {
          clienteId: row.clienteid,
          activo: row.activo,
        },
      });
    }

    const resultado = await solicitarCambio(
      req,
      "clientes",
      clienteId,
      "UPDATE",
      datosNuevos,
      clienteActual
    );

    res.json({
      success: true,
      message: resultado.mensaje,
      data: {
        clienteId,
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error("Error al actualizar estado del cliente:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener catálogo de medidas disponibles
 * GET /api/admin/medidas
 */
const getMedidas = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT MedidaID, Nombre, Abreviatura
       FROM Medidas
       ORDER BY Nombre`
    );

    res.json({
      success: true,
      data: {
        medidas: result.rows.map((row) => ({
          medidaId: row.medidaid,
          nombre: row.nombre,
          abreviatura: row.abreviatura,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener medidas:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener lista de medidas/dimensiones ya usadas en variantes
 * GET /api/admin/medidas-existentes
 * Devuelve un arreglo de strings en data.medidas
 */
const getMedidasExistentes = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT TRIM(Dimensiones) AS valor
       FROM Producto_Variantes
       WHERE Dimensiones IS NOT NULL AND TRIM(Dimensiones) <> ''
       ORDER BY TRIM(Dimensiones)`
    );

    const medidas = result.rows
      .map((row) => (row.valor || "").trim())
      .filter((v) => v.length > 0);

    res.json({
      success: true,
      data: {
        medidas,
      },
    });
  } catch (error) {
    console.error("Error al obtener medidas existentes:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Verificar token de admin
 * GET /api/admin/verify
 */
const verifyAdmin = async (req, res) => {
  try {
    // El middleware ya validó el token y agregó req.user
    const adminId = req.user.id;

    let adminInfo = null;

    if (req.user.adminSource === "agent") {
      const agentResult = await db.query(
        `SELECT 
          AgenteID,
          Nombre,
          Apellido,
          Email,
          CodigoAgente,
          AdminRol
        FROM AgentesDeVentas
        WHERE AgenteID = $1 AND Activo = TRUE`,
        [adminId]
      );

      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Administrador no encontrado",
        });
      }

      const agente = agentResult.rows[0];
      const nombreCompleto =
        [agente.nombre, agente.apellido].filter(Boolean).join(" ").trim() ||
        agente.nombre;

      adminInfo = {
        adminId: agente.agenteid,
        nombre: nombreCompleto,
        email: agente.email,
        rol: agente.adminrol || req.user.rol,
        origen: "agent",
        codigoAgente: agente.codigoagente || req.user.codigoAgente || null,
      };
    } else {
      const result = await db.query(
        "SELECT AdminID, Nombre, Apellido, Email, Rol FROM Administradores WHERE AdminID = $1 AND Activo = TRUE",
        [adminId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Administrador no encontrado",
        });
      }

      const admin = result.rows[0];
      const nombreCompleto =
        [admin.nombre, admin.apellido].filter(Boolean).join(" ").trim() ||
        admin.nombre;

      adminInfo = {
        adminId: admin.adminid,
        nombre: nombreCompleto,
        email: admin.email,
        rol: admin.rol,
        origen: "admin",
      };
    }

    res.json({
      success: true,
      data: {
        admin: adminInfo,
      },
    });
  } catch (error) {
    console.error("Error al verificar admin:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener perfil del admin
 * GET /api/admin/profile
 */
const getAdminProfile = async (req, res) => {
  try {
    const adminId = req.user.id;

    let adminData = null;

    if (req.user.adminSource === "agent") {
      const agentResult = await db.query(
        `SELECT 
          AgenteID,
          Nombre,
          Apellido,
          Email,
          CodigoAgente,
          AdminRol,
          FechaCreacion
        FROM AgentesDeVentas
        WHERE AgenteID = $1 AND Activo = TRUE`,
        [adminId]
      );

      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Administrador no encontrado",
        });
      }

      const agente = agentResult.rows[0];
      const nombreCompleto =
        [agente.nombre, agente.apellido].filter(Boolean).join(" ").trim() ||
        agente.nombre;

      adminData = {
        adminId: agente.agenteid,
        nombre: nombreCompleto,
        email: agente.email,
        rol: agente.adminrol || req.user.rol,
        fechaCreacion: agente.fechacreacion,
        origen: "agent",
        codigoAgente: agente.codigoagente || req.user.codigoAgente || null,
      };
    } else {
      const result = await db.query(
        `SELECT 
          AdminID, 
          Nombre, 
          Apellido,
          Email, 
          Rol, 
          FechaCreacion
        FROM Administradores 
        WHERE AdminID = $1 AND Activo = TRUE`,
        [adminId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Administrador no encontrado",
        });
      }

      const admin = result.rows[0];
      const nombreCompleto =
        [admin.nombre, admin.apellido].filter(Boolean).join(" ").trim() ||
        admin.nombre;

      adminData = {
        adminId: admin.adminid,
        nombre: nombreCompleto,
        email: admin.email,
        rol: admin.rol,
        fechaCreacion: admin.fechacreacion,
        origen: "admin",
      };
    }

    res.json({
      success: true,
      data: adminData,
    });
  } catch (error) {
    console.error("Error al obtener perfil de admin:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Renovar token de admin
 * POST /api/admin/refresh-token
 */
const refreshAdminToken = async (req, res) => {
  try {
    // El middleware authenticate ya verificó el token actual
    const adminId = req.user.id;
    const email = req.user.email;
    const tipo = req.user.tipo;

    // Verificar que el admin aún existe
    const result = await db.query(
      `SELECT AdminID FROM Administradores WHERE AdminID = $1`,
      [adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Administrador no encontrado",
      });
    }

    // Generar un nuevo token con el mismo payload
    const { generateToken } = require("../utils/jwtHelper");
    const newToken = generateToken({
      userId: adminId,
      tipo: tipo,
      rol: req.user.rol,
      email: email,
    });

    console.log("🔄 Token de admin renovado:", { adminId, email });

    res.json({
      success: true,
      message: "Token renovado exitosamente",
      data: {
        token: newToken,
      },
    });
  } catch (error) {
    console.error("Error refreshing admin token:", error);
    res.status(500).json({
      success: false,
      message: "Error al renovar token",
    });
  }
};

/**
 * Obtener estadísticas del dashboard
 * GET /api/admin/dashboard-stats
 */
const getDashboardStats = async (req, res) => {
  try {
    // Pedidos pendientes
    const pedidosPendientes = await db.query(
      `SELECT COUNT(*) as total FROM Pedidos WHERE Estatus = 'Pendiente'`
    );

    // Total de comisiones pendientes
    const comisionesPendientes = await db.query(
      `SELECT COALESCE(SUM(MontoComision), 0) as total 
       FROM Comisiones 
       WHERE Estatus = 'Pendiente'`
    );

    // Variantes con stock bajo (<=5 paquetes)
    const productosStockBajo = await db.query(
      `SELECT COUNT(*) AS total
       FROM Producto_Variantes
       WHERE COALESCE(Stock, 0) <= 5`
    );

    // Total de pedidos (para estadística general)
    const totalPedidos = await db.query(
      `SELECT COUNT(*) as total FROM Pedidos`
    );

    // Ingresos totales
    const ingresosTotales = await db.query(
      `SELECT COALESCE(SUM(MontoTotal), 0) as total FROM Pedidos`
    );

    // Clientes totales (tabla Clientes no tiene columna Activo)
    const clientesActivos = await db.query(
      `SELECT COUNT(*) as total FROM Clientes`
    );

    // Agentes activos
    const agentesActivos = await db.query(
      `SELECT COUNT(*) as total FROM AgentesDeVentas WHERE Activo = TRUE`
    );

    res.json({
      success: true,
      data: {
        pedidosPendientes: parseInt(pedidosPendientes.rows[0].total),
        comisionesPendientes: parseFloat(comisionesPendientes.rows[0].total),
        productosStockBajo: parseInt(productosStockBajo.rows[0].total),
        totalPedidos: parseInt(totalPedidos.rows[0].total),
        ingresosTotales: parseFloat(ingresosTotales.rows[0].total),
        clientesActivos: parseInt(clientesActivos.rows[0].total),
        agentesActivos: parseInt(agentesActivos.rows[0].total),
      },
    });
  } catch (error) {
    console.error("Error al obtener estadísticas:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener todos los pedidos (para administración)
 * GET /api/admin/pedidos
 */
const getAllPedidos = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        p.PedidoID,
        p.ClienteID,
        c.Nombre || ' ' || c.Apellido as ClienteNombre,
        c.Email as ClienteEmail,
        p.FechaPedido,
        p.MontoTotal,
        p.CostoEnvio,
        p.Estatus,
        p.DireccionEnvioID,
        CONCAT_WS(', ', d.Calle, d.Ciudad, e.Nombre) as DireccionCompleta,
        d.EstadoID,
        e.Nombre as EstadoNombre,
        p.AgenteID,
        CASE 
          WHEN a.AgenteID IS NOT NULL THEN a.Nombre || ' ' || a.Apellido 
          ELSE NULL 
        END as AgenteNombre,
        (SELECT COUNT(*) FROM DetallesDelPedido dp WHERE dp.PedidoID = p.PedidoID) as TotalItems
      FROM Pedidos p
      INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
      LEFT JOIN Cliente_Direcciones d ON p.DireccionEnvioID = d.DireccionID
      LEFT JOIN Estados e ON d.EstadoID = e.EstadoID
      LEFT JOIN AgentesDeVentas a ON p.AgenteID = a.AgenteID
      ORDER BY p.FechaPedido DESC`
    );

    res.json({
      success: true,
      data: {
        pedidos: result.rows.map((row) => ({
          pedidoId: row.pedidoid,
          clienteId: row.clienteid,
          clienteNombre: row.clientenombre,
          clienteEmail: row.clienteemail,
          fechaPedido: row.fechapedido,
          montoTotal: parseFloat(row.montototal),
          costoEnvio:
            row.costoenvio !== null ? parseFloat(row.costoenvio) : null,
          estatus: row.estatus,
          direccionEnvioId: row.direccionenvioid,
          direccionCompleta: row.direccioncompleta,
          estadoId: row.estadoid !== null ? parseInt(row.estadoid, 10) : null,
          estadoNombre: row.estadonombre || null,
          agenteId: row.agenteid,
          agenteNombre: row.agentenombre,
          totalItems: parseInt(row.totalitems),
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener pedidos:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Actualizar estatus de un pedido
 * PUT /api/admin/pedidos/:id
 */
const updatePedidoEstatus = async (req, res) => {
  try {
    const pedidoId = Number.parseInt(req.params.id, 10);
    const estatusBody = req.body ? req.body.estatus : null;

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    const estatusNuevo = typeof estatusBody === "string" ? estatusBody.trim() : "";

    // Permitir cualquier estatus manual (incluye 'Parcialmente Surtido'),
    // pero auditarlo via control_cambios.
    if (!estatusNuevo) {
      return res.status(400).json({
        success: false,
        message: "Estatus inválido",
      });
    }

    const pedidoResult = await db.query(
      "SELECT PedidoID, Estatus FROM Pedidos WHERE PedidoID = $1",
      [pedidoId]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const estatusAnterior = pedidoResult.rows[0].estatus || "Pendiente";
    const rolRaw = (req?.user?.rol || "").toString().trim().toLowerCase();
    const rolNorm = rolRaw.replace(/[\s_-]+/g, "");
    const allowDirect = rolNorm === "superadmin" || rolNorm === "admin" || rolNorm === "agente";

    if (allowDirect) {
      const oldData = {
        pedidoid: pedidoId,
        estatus: estatusAnterior,
      };
      const newData = {
        pedidoid: pedidoId,
        estatus: estatusNuevo,
      };

      const updateRes = await db.query(
        "UPDATE pedidos SET estatus = $1 WHERE pedidoid = $2 RETURNING pedidoid, clienteid, agenteid, direccionenvioid, fechapedido, montototal, estatus, costoenvio",
        [estatusNuevo, pedidoId]
      );

      if (!updateRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Pedido no encontrado",
        });
      }

      await auditService.registrarCambioPasivo(
        req,
        "pedidos",
        pedidoId,
        "UPDATE",
        oldData,
        newData
      );

      const row = updateRes.rows[0];
      return res.status(200).json({
        success: true,
        message: "Estatus actualizado correctamente.",
        data: {
          pedido: {
            pedidoId: row.pedidoid,
            clienteId: row.clienteid,
            agenteId: row.agenteid,
            direccionEnvioId: row.direccionenvioid,
            fechaPedido: row.fechapedido,
            montoTotal: row.montototal !== null ? parseFloat(row.montototal) : null,
            estatus: row.estatus,
            costoEnvio: row.costoenvio !== null ? parseFloat(row.costoenvio) : null,
          },
        },
      });
    }

    await solicitarCambio(
      req,
      "pedidos",
      pedidoId,
      "UPDATE",
      { estatus: estatusNuevo },
      { estatus: estatusAnterior }
    );

    return res.status(200).json({
      success: true,
      message: "Solicitud de cambio de estatus enviada a bitácora.",
    });
  } catch (error) {
    if (error && error.code === "PENDING_CHANGE_EXISTS") {
      return res.status(409).json({
        success: false,
        message:
          "Ya existe una solicitud pendiente para este registro. Revisa la bitácora.",
      });
    }
    console.error("Error updating order status:", error);
    return res.status(500).json({
      success: false,
      message: "Error al actualizar el estatus del pedido",
      error: error.message,
    });
  }
};

const devolverStockPedido = async (client, pedidoId, usuarioId) => {
  const motivoVenta = `Venta Pedido #${pedidoId}`;

  const movimientosResult = await client.query(
    `SELECT VarianteID, SUM(CantidadCambiado) AS total_cambiado
     FROM Log_Inventario
     WHERE Motivo = $1
     GROUP BY VarianteID`,
    [motivoVenta]
  );

  if (!movimientosResult.rows.length) {
    return;
  }

  for (const row of movimientosResult.rows) {
    const varianteId = row.varianteid;
    const totalCambiadoRaw = row.total_cambiado;

    if (!varianteId || totalCambiadoRaw === null) {
      continue;
    }

    const totalCambiado = parseInt(totalCambiadoRaw, 10);
    if (!Number.isFinite(totalCambiado) || totalCambiado === 0) {
      continue;
    }

    const piezasADevolver = -totalCambiado; // totalCambiado es negativo en la venta
    if (piezasADevolver <= 0) {
      continue;
    }

    const stockResult = await client.query(
      `SELECT COALESCE(Stock, 0) AS stock_actual
       FROM Producto_Variantes
       WHERE VarianteID = $1
       FOR UPDATE`,
      [varianteId]
    );

    if (!stockResult.rows.length) {
      continue;
    }

    const stockActual = parseInt(stockResult.rows[0].stock_actual, 10) || 0;
    const nuevoStock = Math.max(stockActual + piezasADevolver, 0);

    await client.query(
      `UPDATE Producto_Variantes
       SET Stock = $1
       WHERE VarianteID = $2`,
      [nuevoStock, varianteId]
    );

    await client.query(
      `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        varianteId,
        piezasADevolver,
        nuevoStock,
        `Devolución Pedido Cancelado #${pedidoId}`,
        usuarioId || null,
      ]
    );
  }
};

const reducirStockPedido = async (client, pedidoId, usuarioId) => {
  const motivoVenta = `Venta Pedido #${pedidoId}`;

  const movimientosResult = await client.query(
    `SELECT VarianteID, SUM(CantidadCambiado) AS total_cambiado
     FROM Log_Inventario
     WHERE Motivo = $1
     GROUP BY VarianteID`,
    [motivoVenta]
  );

  if (!movimientosResult.rows.length) {
    return;
  }

  const variantesAReactivar = [];

  // 1) Validar stock disponible para todas las variantes afectadas
  for (const row of movimientosResult.rows) {
    const varianteId = row.varianteid;
    const totalCambiadoRaw = row.total_cambiado;

    if (!varianteId || totalCambiadoRaw === null) {
      continue;
    }

    const totalCambiado = parseInt(totalCambiadoRaw, 10);
    if (!Number.isFinite(totalCambiado) || totalCambiado === 0) {
      continue;
    }

    // totalCambiado es negativo en la venta; necesitamos volver a restar esas piezas
    const piezasADescontar = -totalCambiado;
    if (piezasADescontar <= 0) {
      continue;
    }

    const stockResult = await client.query(
      `SELECT COALESCE(Stock, 0) AS stock_actual
       FROM Producto_Variantes
       WHERE VarianteID = $1
       FOR UPDATE`,
      [varianteId]
    );

    if (!stockResult.rows.length) {
      continue;
    }

    const stockActual = parseInt(stockResult.rows[0].stock_actual, 10) || 0;

    if (stockActual < piezasADescontar) {
      const error = new Error(
        `Stock insuficiente para reactivar el pedido #${pedidoId} en la variante ${varianteId}. Actual: ${stockActual}, requerido: ${piezasADescontar}`
      );
      error.code = "NO_STOCK_REACTIVACION";
      throw error;
    }

    variantesAReactivar.push({ varianteId, stockActual, piezasADescontar });
  }

  // 2) Aplicar los movimientos de salida de stock
  for (const variante of variantesAReactivar) {
    const { varianteId, stockActual, piezasADescontar } = variante;
    const nuevoStock = Math.max(stockActual - piezasADescontar, 0);

    await client.query(
      `UPDATE Producto_Variantes
       SET Stock = $1
       WHERE VarianteID = $2`,
      [nuevoStock, varianteId]
    );

    await client.query(
      `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        varianteId,
        -piezasADescontar,
        nuevoStock,
        `Reactivación Pedido #${pedidoId}`,
        usuarioId || null,
      ]
    );
  }
};

const findOrCreateTamanosFromPacks = async (client, packs) => {
  const cantidades = Array.isArray(packs)
    ? packs
        .map((p) => Number.parseInt(p, 10))
        .filter((n) => Number.isInteger(n) && n > 0)
    : [];

  if (!cantidades.length) {
    return [];
  }

  // 1) Buscar tamaños existentes por Cantidad
  const existentesResult = await client.query(
    `SELECT TamanoID, Cantidad
     FROM Cat_TamanoPaquetes
     WHERE Cantidad = ANY($1::int[])`,
    [cantidades]
  );

  const existentesPorCantidad = new Map(); // Cantidad -> TamanoID

  existentesResult.rows.forEach((row) => {
    const cantidad = Number.parseInt(row.cantidad, 10);
    const tamanoId = Number.parseInt(row.tamanoid, 10);
    if (Number.isInteger(cantidad) && Number.isInteger(tamanoId)) {
      existentesPorCantidad.set(cantidad, tamanoId);
    }
  });

  const idsResultantes = [];

  // 2) Para cada cantidad, reutilizar o crear tamaño
  for (const cantidad of cantidades) {
    if (existentesPorCantidad.has(cantidad)) {
      idsResultantes.push(existentesPorCantidad.get(cantidad));
      continue;
    }

    // La tabla Cat_TamanoPaquetes solo tiene columnas TamanoID (PK) y Cantidad,
    // así que insertamos únicamente Cantidad y dejamos que TamanoID se autogenere.
    const insertResult = await client.query(
      `INSERT INTO Cat_TamanoPaquetes (Cantidad)
       VALUES ($1)
       RETURNING TamanoID, Cantidad`,
      [cantidad]
    );

    const newRow = insertResult.rows[0];
    const nuevoTamanoId = Number.parseInt(newRow.tamanoid, 10);
    const cantidadCreada = Number.parseInt(newRow.cantidad, 10);

    if (Number.isInteger(nuevoTamanoId) && Number.isInteger(cantidadCreada)) {
      existentesPorCantidad.set(cantidadCreada, nuevoTamanoId);
      idsResultantes.push(nuevoTamanoId);
    }
  }

  console.log(
    "🟢 [PACKS] TamanoIDs vinculados desde packs (find-or-create por Cantidad):",
    {
      packs: cantidades,
      tamanoIds: idsResultantes,
    }
  );

  return idsResultantes;
};

const sanitizeSkuSegment = (input, maxLen, fallback) => {
  const raw = input === undefined || input === null ? "" : String(input);
  const normalized = raw
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");

  const base = normalized.length ? normalized : String(fallback || "");
  return base.slice(0, maxLen);
};

const generarSkuMaestro = async (
  pool,
  { proveedorid, tipoproductoid, categoriaid, nombreproducto }
) => {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("pool inválido");
  }

  const yearSegment = String(new Date().getFullYear()).slice(-2);

  const proveedorIdParsed =
    proveedorid !== undefined && proveedorid !== null
      ? Number.parseInt(proveedorid, 10)
      : null;
  const tipoProductoIdParsed =
    tipoproductoid !== undefined && tipoproductoid !== null
      ? Number.parseInt(tipoproductoid, 10)
      : null;
  const categoriaIdParsed =
    categoriaid !== undefined && categoriaid !== null
      ? Number.parseInt(categoriaid, 10)
      : null;

  const proveedorNombre = await (async () => {
    if (!Number.isInteger(proveedorIdParsed) || proveedorIdParsed <= 0) {
      return "GEN";
    }
    const r = await pool.query(
      "SELECT nombreempresa FROM proveedores WHERE proveedorid = $1",
      [proveedorIdParsed]
    );
    return r.rows[0]?.nombreempresa ?? "GEN";
  })();

  const tipoProductoNombre = await (async () => {
    if (!Number.isInteger(tipoProductoIdParsed) || tipoProductoIdParsed <= 0) {
      return "GEN";
    }
    const r = await pool.query(
      "SELECT nombre FROM tipoproducto WHERE tipoproductoid = $1",
      [tipoProductoIdParsed]
    );
    return r.rows[0]?.nombre ?? "GEN";
  })();

  const categoriaNombre = await (async () => {
    if (!Number.isInteger(categoriaIdParsed) || categoriaIdParsed <= 0) {
      return "GEN";
    }
    const r = await pool.query(
      "SELECT nombre FROM categorias WHERE categoriaid = $1",
      [categoriaIdParsed]
    );
    return r.rows[0]?.nombre ?? "GEN";
  })();

  const proveedorSegment = sanitizeSkuSegment(proveedorNombre, 3, "GEN");
  const tipoSegment = sanitizeSkuSegment(tipoProductoNombre, 3, "GEN");
  const categoriaSegment = sanitizeSkuSegment(categoriaNombre, 3, "GEN");
  const nombreSegment = sanitizeSkuSegment(nombreproducto, 4, "PROD");

  return `${yearSegment}-${proveedorSegment}-${tipoSegment}-${categoriaSegment}-${nombreSegment}`;
};

const procesarMedidaParaSkuVariante = (dimensiones) => {
  const raw = dimensiones === undefined || dimensiones === null ? "" : String(dimensiones);
  const normalized = raw
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/×/g, "X")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "");

  if (!normalized.length) {
    return "";
  }

  const hasNumbers = /\d/.test(normalized);
  return hasNumbers ? normalized : normalized.slice(0, 3);
};

const procesarColorParaSkuVariante = (colorNombre) => {
  const raw = colorNombre === undefined || colorNombre === null ? "" : String(colorNombre);
  const normalized = raw
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "");

  if (!normalized.length) {
    return "";
  }

  return normalized.slice(0, 6);
};

/**
 * Crear un nuevo producto
 * POST /api/admin/productos
 */
const crearProducto = async (req, res) => {
  const {
    nombre,
    sku_maestro,
    descripcion,
    categoriaId,
    TipoProductoID: tipoProductoIdRaw,
    tipoProducto,
    TipoProducto: tipoProductoRaw,
    tamanos,
    tamanoIds,
    proveedorId: proveedorIdRaw,
    activo,
    stockTotalInicial: stockTotalInicialRaw,
    venderIndividual: venderIndividualRaw,
    precioUnitarioBase: precioUnitarioBaseRaw,
    precioUnitario: precioUnitarioLegacyRaw,
    variantes: variantesRaw,
    packs,
  } = req.body;

  const allowDirect = true;

  // DEBUG BACKEND: inspeccionar qué llega al crear producto maestro
  console.log("🟢 [CREAR_PRODUCTO] Body recibido:", {
    nombre,
    sku_maestro,
    categoriaId,
    tipoProducto: tipoProducto ?? tipoProductoRaw,
    proveedorIdRaw,
    stockTotalInicialRaw,
    venderIndividualRaw,
    tamanoIds,
    tamanos,
    packs,
  });

  if (!nombre) {
    return res.status(400).json({
      success: false,
      message: "El nombre del producto es obligatorio",
    });
  }

  const categoriaIdParsed = (() => {
    if (
      categoriaId === undefined ||
      categoriaId === null ||
      String(categoriaId).trim() === ""
    ) {
      return null;
    }
    const parsed = Number.parseInt(categoriaId, 10);
    return Number.isNaN(parsed) ? null : parsed;
  })();

  if (categoriaIdParsed === null) {
    return res.status(400).json({
      success: false,
      message: "Debes seleccionar una categoría para el producto maestro.",
    });
  }

  const client = await db.pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const proveedorIdRawEffective =
      proveedorIdRaw ??
      req.body?.proveedorid_default ??
      req.body?.proveedorId_Default ??
      req.body?.ProveedorID_Default ??
      req.body?.proveedorid ??
      null;

    let proveedorId = null;
    if (proveedorIdRawEffective !== undefined && proveedorIdRawEffective !== null) {
      const parsed = Number.parseInt(proveedorIdRawEffective, 10);
      if (!Number.isNaN(parsed)) {
        proveedorId = parsed;
      }
    }

    if (proveedorId !== null) {
      const proveedorResult = await client.query(
        "SELECT ProveedorID FROM Proveedores WHERE ProveedorID = $1",
        [proveedorId]
      );

      if (proveedorResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "El proveedor predeterminado no existe",
        });
      }
    }

    // Gestión de visibilidad: respetar lo enviado, por defecto TRUE.
    const activoFinal = activo !== undefined ? Boolean(activo) : true;

    const tipoProductoNombre = (() => {
      const raw =
        tipoProducto !== undefined && tipoProducto !== null
          ? tipoProducto
          : tipoProductoRaw;
      if (raw === undefined || raw === null) {
        return null;
      }
      const txt = String(raw).trim();
      return txt.length ? txt : null;
    })();

    const tipoProductoId = await (async () => {
      if (tipoProductoIdRaw !== undefined && tipoProductoIdRaw !== null && String(tipoProductoIdRaw).trim() !== "") {
        const parsed = Number.parseInt(tipoProductoIdRaw, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error("TIPO_PRODUCTO_INVALIDO");
        }

        const existe = await client.query(
          `SELECT tipoproductoid
           FROM tipoproducto
           WHERE tipoproductoid = $1
             AND activo = TRUE`,
          [parsed]
        );

        if (!existe.rows.length) {
          throw new Error("TIPO_PRODUCTO_NO_EXISTE");
        }

        return parsed;
      }

      if (tipoProductoNombre) {
        return (
          await client.query(
            `INSERT INTO tipoproducto (nombre, descripcion, activo)
             VALUES ($1, NULL, TRUE)
             ON CONFLICT (nombre)
             DO UPDATE SET activo = TRUE
             RETURNING tipoproductoid`,
            [tipoProductoNombre]
          )
        ).rows[0]?.tipoproductoid ?? null;
      }

      return null;
    })();

    const skuMaestroFinal = await generarSkuMaestro(client, {
      proveedorid: proveedorId,
      tipoproductoid: tipoProductoId,
      categoriaid: categoriaIdParsed,
      nombreproducto: nombre,
    });

    const skuExisteResult = await client.query(
      `SELECT productoid
       FROM productos
       WHERE sku_maestro = $1
       LIMIT 1`,
      [skuMaestroFinal]
    );

    if (skuExisteResult.rows.length > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "El SKU Maestro ya existe. Debe ser único.",
      });
    }

    const parseBoolean = (value, defaultValue = false) => {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") return true;
        if (normalized === "false" || normalized === "0") return false;
      }
      if (typeof value === "number") {
        if (value === 1) return true;
        if (value === 0) return false;
      }
      return defaultValue;
    };

    const stockTotalInicial = (() => {
      if (stockTotalInicialRaw === undefined || stockTotalInicialRaw === null) {
        return 0;
      }
      const parsed = Number.parseInt(stockTotalInicialRaw, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        throw new Error("STOCK_INICIAL_INVALIDO");
      }
      return parsed;
    })();

    const venderIndividual = parseBoolean(venderIndividualRaw, false);

    const precioUnitarioBaseNormalized = (() => {
      const raw =
        precioUnitarioBaseRaw !== undefined && precioUnitarioBaseRaw !== null
          ? precioUnitarioBaseRaw
          : precioUnitarioLegacyRaw;

      // Si no se venderá por pieza, no necesitamos precio unitario base
      if (!venderIndividual) {
        return null;
      }

      // Si se venderá por pieza pero aún no se define el precio, permitir null.
      // El precio podrá configurarse posteriormente en la pantalla de variantes.
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        return null;
      }

      const parsed = Number.parseFloat(raw);
      if (Number.isNaN(parsed) || parsed < 0) {
        throw new Error("PRECIO_UNITARIO_BASE_INVALIDO");
      }
      return Number(parsed.toFixed(4));
    })();

    const variantesInput = Array.isArray(variantesRaw) ? variantesRaw : [];

    const result = await client.query(
      `INSERT INTO Productos (NombreProducto, sku_maestro, Descripcion, CategoriaID, ProveedorID_Default, Activo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ProductoID, NombreProducto, sku_maestro, Descripcion, CategoriaID, ProveedorID_Default AS ProveedorID, Activo`,
      [
        nombre,
        skuMaestroFinal,
        descripcion || null,
        categoriaIdParsed,
        proveedorId,
        activoFinal,
      ]
    );

    const producto = result.rows[0];

    console.log("🟢 [CREAR_PRODUCTO] Producto insertado:", producto);

    const serieSkuBase = (() => {
      const base =
        (typeof skuMaestroFinal === "string" && skuMaestroFinal.trim().length
          ? skuMaestroFinal
          : typeof nombre === "string" && nombre.trim().length
          ? nombre
          : `PROD-${producto.productoid}`) || `PROD-${producto.productoid}`;
      return base
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `PROD-${producto.productoid}`;
    })();

    const buildSku = (suffix) => {
      const normalizedSuffix = (suffix || "VAR")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return `${serieSkuBase}-${normalizedSuffix || "VAR"}`;
    };

    let tamanosAsociados = [];

    // A partir de packs, encontrar/crear tamaños en catálogo y obtener sus IDs
    const tamanoIdsFromPacks = await findOrCreateTamanosFromPacks(
      client,
      packs
    );

    const tamanosProductoRawBase = Array.isArray(tamanos)
      ? tamanos
      : Array.isArray(tamanoIds)
      ? tamanoIds
      : [];

    const tamanosProductoRaw = [
      ...tamanosProductoRawBase,
      ...tamanoIdsFromPacks,
    ];

    const sanitizedTamanosProducto = [
      ...new Set(
        tamanosProductoRaw
          .map((id) => Number.parseInt(id, 10))
          .filter((id) => Number.isInteger(id) && id > 0)
      ),
    ];

    const tamanoIdsFromVariantes = [
      ...new Set(
        variantesInput
          .map((v) =>
            Number.parseInt(v?.tamanoId ?? v?.tamanoid ?? v?.TamanoID, 10)
          )
          .filter((id) => Number.isInteger(id) && id > 0)
      ),
    ];

    const tamanoIdsNecesarios = [
      ...new Set([...sanitizedTamanosProducto, ...tamanoIdsFromVariantes]),
    ];

    const tamanoCatalogoMap = new Map();
    const valueCandidates = [
      "valor",
      "cantidad",
      "piezas",
      "piezasporpaquete",
      "numeropiezas",
      "tamano",
      "cantidadpiezas",
    ];

    const extractValorNumerico = (row) => {
      for (const field of valueCandidates) {
        if (
          Object.prototype.hasOwnProperty.call(row, field) &&
          row[field] !== null &&
          row[field] !== undefined
        ) {
          const parsed = Number.parseInt(row[field], 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            return parsed;
          }
        }
        const capitalized =
          field.charAt(0).toUpperCase() + field.slice(1);
        if (
          Object.prototype.hasOwnProperty.call(row, capitalized) &&
          row[capitalized] !== null &&
          row[capitalized] !== undefined
        ) {
          const parsed = Number.parseInt(row[capitalized], 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            return parsed;
          }
        }
      }
      return null;
    };

    if (tamanoIdsNecesarios.length) {
      const tamanosCatalogoResult = await client.query(
        "SELECT * FROM Cat_TamanoPaquetes WHERE TamanoID = ANY($1::int[])",
        [tamanoIdsNecesarios]
      );

      tamanosCatalogoResult.rows.forEach((row) => {
        const tamanoId = Number.parseInt(row.tamanoid, 10);
        if (!Number.isInteger(tamanoId)) return;
        tamanoCatalogoMap.set(tamanoId, {
          raw: row,
          valor: extractValorNumerico(row),
        });
      });

      for (const requiredId of tamanoIdsNecesarios) {
        if (!tamanoCatalogoMap.has(requiredId)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: `El tamaño con ID ${requiredId} no existe en el catálogo`,
          });
        }
      }
    }

    if (sanitizedTamanosProducto.length) {
      for (const tamanoId of sanitizedTamanosProducto) {
        await client.query(
          `INSERT INTO Producto_TamanosDisponibles (ProductoID, TamanoID)
           VALUES ($1, $2)`,
          [producto.productoid, tamanoId]
        );
      }
      tamanosAsociados = sanitizedTamanosProducto;
      console.log(
        "🟢 [CREAR_PRODUCTO] tamanosAsociados en Producto_TamanosDisponibles:",
        tamanosAsociados
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    await auditService.registrarCambioPasivo(
      req,
      "productos",
      producto.productoid,
      "INSERT",
      null,
      producto
    );

    return res.status(201).json({
      success: true,
      message: "Producto creado correctamente.",
      data: {
        producto,
        tamanosDisponibles: tamanosAsociados,
        varianteMaestra: null,
        variantes: [],
      },
    });

    const userId = req.user?.id || req.user?.userId || null;

    const variantesCreadas = [];

    // Usar el SKU base del producto para la variante maestra (sin sufijo UNIT)
    const masterSku = serieSkuBase;
    const masterDimensiones = null;

    const masterVarianteResult = await client.query(
      `INSERT INTO Producto_Variantes (
        ProductoID,
        SKU,
        Dimensiones,
        CostoUnitario,
        PrecioUnitario,
        PrecioOfertaUnitario,
        Stock,
        TipoProductoID,
        MedidaID,
        Activo,
        PiezasPorPaquete
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING VarianteID, SKU, Stock, Activo, PiezasPorPaquete`,
      [
        producto.productoid,
        masterSku,
        masterDimensiones,
        0, // Costo unitario se define más adelante en las variantes; aquí usamos 0 para respetar NOT NULL
        precioUnitarioBaseNormalized,
        null,
        stockTotalInicial,
        tipoProductoId,
        null,
        venderIndividual,
        1,
      ]
    );

    const varianteMaestra = masterVarianteResult.rows[0];
    variantesCreadas.push({
      ...varianteMaestra,
      esVarianteMaestra: true,
    });

    if (stockTotalInicial > 0) {
      await client.query(
        `INSERT INTO Log_Inventario (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          varianteMaestra.varianteid,
          stockTotalInicial,
          stockTotalInicial,
          "Stock inicial variante maestra (1 pieza)",
          userId,
        ]
      );
    }

    const inferPiezasPorPaquete = (variante) => {
      if (!variante || typeof variante !== "object") return null;

      const candidateKeys = [
        "piezasPorPaquete",
        "valor",
        "cantidad",
        "piezas",
        "numeropiezas",
        "tamanoValor",
        "pieces",
        "qty",
      ];

      for (const key of candidateKeys) {
        if (variante[key] !== undefined && variante[key] !== null) {
          const parsed = Number.parseInt(variante[key], 10);
          if (!Number.isNaN(parsed) && parsed > 0) return parsed;
        }
      }

      const tamanoId = Number.parseInt(
        variante.tamanoId ?? variante.tamanoid ?? variante.TamanoID,
        10
      );
      if (Number.isInteger(tamanoId) && tamanoCatalogoMap.has(tamanoId)) {
        return tamanoCatalogoMap.get(tamanoId).valor || null;
      }

      return null;
    };

    const inferPrecioUnitario = (variante, piezasPorPaquete) => {
      const candidateKeys = [
        "precioUnitario",
        "precio",
        "price",
        "precioPorUnidad",
        "unitPrice",
      ];

      for (const key of candidateKeys) {
        if (variante[key] !== undefined && variante[key] !== null) {
          const parsed = Number.parseFloat(variante[key]);
          if (!Number.isNaN(parsed) && parsed > 0) {
            return Number(parsed.toFixed(4));
          }
        }
      }

      const pricePerPackKeys = [
        "precioPorPaquete",
        "precioPack",
        "pricePerPack",
      ];

      for (const key of pricePerPackKeys) {
        if (
          variante[key] !== undefined &&
          variante[key] !== null &&
          piezasPorPaquete &&
          piezasPorPaquete > 0
        ) {
          const parsed = Number.parseFloat(variante[key]);
          if (!Number.isNaN(parsed) && parsed > 0) {
            return Number((parsed / piezasPorPaquete).toFixed(4));
          }
        }
      }

      return null;
    };

    for (const [index, variante] of variantesInput.entries()) {
      if (!variante || typeof variante !== "object") {
        continue;
      }

      const piezasPorPaquete = inferPiezasPorPaquete(variante);
      if (!Number.isInteger(piezasPorPaquete) || piezasPorPaquete <= 1) {
        continue;
      }

      const precioUnitarioVariante = inferPrecioUnitario(
        variante,
        piezasPorPaquete
      );
      if (precioUnitarioVariante === null) {
        continue;
      }

      const precioOfertaUnitario =
        variante.precioOfertaUnitario !== undefined &&
        variante.precioOfertaUnitario !== null
          ? Number.parseFloat(variante.precioOfertaUnitario)
          : null;

      const skuVariante =
        typeof variante.sku === "string" && variante.sku.trim().length
          ? variante.sku.trim().toUpperCase()
          : buildSku(`PACK${piezasPorPaquete}`);

      const dimensionesVariante =
        variante.dimensiones ||
        variante.presentacion ||
        `Pack de ${piezasPorPaquete}`;

      const activoVariante =
        variante.activo !== undefined && variante.activo !== null
          ? parseBoolean(variante.activo, true)
          : true;

      const tipoProductoId =
        variante.tipoProductoId !== undefined
          ? variante.tipoProductoId
          : variante.tipoProductoID;

      const medidaId =
        variante.medidaId !== undefined ? variante.medidaId : variante.medidaID;

      const insertResult = await client.query(
        `INSERT INTO Producto_Variantes (
          ProductoID,
          SKU,
          Dimensiones,
          CostoUnitario,
          PrecioUnitario,
          PrecioOfertaUnitario,
          Stock,
          TipoProductoID,
          MedidaID,
          Activo,
          PiezasPorPaquete
        )
        VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10)
        RETURNING VarianteID, SKU, Activo, PiezasPorPaquete`,
        [
          producto.productoid,
          skuVariante,
          dimensionesVariante || null,
          variante.costoUnitario || null,
          precioUnitarioVariante,
          precioOfertaUnitario && precioOfertaUnitario > 0
            ? precioOfertaUnitario
            : null,
          tipoProductoId || null,
          medidaId || null,
          activoVariante,
          piezasPorPaquete,
        ]
      );

      variantesCreadas.push({
        ...insertResult.rows[0],
        esVarianteMaestra: false,
        indice: index,
      });
    }

    await client.query("COMMIT");

    console.log("🟢 [CREAR_PRODUCTO] Transacción COMMIT realizada", {
      producto,
      tamanosAsociados,
      varianteMaestra,
      variantesCreadasCount: variantesCreadas.length,
    });

    // Registrar solicitud de cambio para PUBLICAR/ACTIVAR el producto maestro (estrategia híbrida)
    try {
      await solicitarCambio(
        req,
        "productos",
        producto.productoid,
        "UPDATE",
        {
          Activo: true,
        },
        producto
      );
    } catch (crError) {
      console.error(
        "Error al registrar solicitud de cambio para creación de producto:",
        crError
      );
      // No rompemos el flujo principal: el producto queda inactivo si falla el registro
    }

    res.status(201).json({
      success: true,
      message:
        "Producto creado preliminarmente. Pendiente de aprobación para activación.",
      data: {
        producto,
        tamanosDisponibles: tamanosAsociados,
        varianteMaestra: varianteMaestra,
        variantes: variantesCreadas,
      },
    });

    // Registrar log de creación de producto (no bloquear el flujo principal)
    try {
      registrarLog(req, "CREAR", "Producto", producto.productoid, {
        nombre: producto.nombreproducto,
        categoriaId: producto.categoriaid,
        proveedorId: producto.proveedorid,
        activo: producto.activo,
      }).catch((logError) => {
        console.error("Error guardando log al crear producto:", logError);
      });
    } catch (logError) {
      console.error(
        "Error interno al preparar log de CREAR Producto:",
        logError
      );
    }
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    if (error && error.message === "TIPO_PRODUCTO_INVALIDO") {
      return res.status(400).json({
        success: false,
        message: "Tipo de producto inválido",
      });
    }

    if (error && error.message === "TIPO_PRODUCTO_NO_EXISTE") {
      return res.status(400).json({
        success: false,
        message: "El tipo de producto seleccionado no existe",
      });
    }

    if (error && error.code === "23505") {
      const detail = (error.detail || "").toString().toLowerCase();
      const constraint = (error.constraint || "").toString().toLowerCase();
      const haySku =
        detail.includes("sku") ||
        detail.includes("sku_maestro") ||
        constraint.includes("sku") ||
        constraint.includes("sku_maestro");

      return res.status(409).json({
        success: false,
        message: haySku
          ? "El SKU ingresado ya existe. Por favor utiliza uno diferente."
          : "Ya existe un registro con este valor duplicado.",
      });
    }

    if (
      error.code === "23502" &&
      error.table === "productos" &&
      error.column &&
      error.column.toLowerCase() === "categoriaid"
    ) {
      return res.status(400).json({
        success: false,
        message: "Debes seleccionar una categoría para el producto maestro.",
      });
    }
    if (error.message === "STOCK_INICIAL_INVALIDO") {
      return res.status(400).json({
        success: false,
        message:
          "El stock total inicial debe ser un número entero mayor o igual a 0.",
      });
    }
    if (error.message === "PRECIO_UNITARIO_BASE_INVALIDO") {
      return res.status(400).json({
        success: false,
        message:
          "Debes proporcionar un precio unitario válido para vender por pieza.",
      });
    }
    console.error("Error al crear producto maestro:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener catálogo de tamaños de paquetes
 * GET /api/admin/tamanos-paquetes
 */
const getTamanosPaquetes = async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT *
       FROM Cat_TamanoPaquetes
       ORDER BY TamanoID ASC`
    );

    const valueCandidates = [
      "valor",
      "piezas",
      "piezasporpaquete",
      "cantidad",
      "numeropiezas",
      "tamano",
      "cantidadpiezas",
    ];

    const labelCandidates = ["etiqueta", "descripcion", "nombre", "label"];

    const tamanos = result.rows.map((row) => {
      const tamanoId = Number.parseInt(row.tamanoid, 10);

      let valor = null;
      for (const field of valueCandidates) {
        if (
          Object.prototype.hasOwnProperty.call(row, field) &&
          row[field] !== null &&
          row[field] !== undefined
        ) {
          const parsed = Number.parseInt(row[field], 10);
          if (!Number.isNaN(parsed)) {
            valor = parsed;
            break;
          }
        }
      }

      let etiqueta = null;
      for (const field of labelCandidates) {
        if (
          Object.prototype.hasOwnProperty.call(row, field) &&
          typeof row[field] === "string" &&
          row[field].trim()
        ) {
          etiqueta = row[field].trim();
          break;
        }
      }

      return {
        tamanoId,
        valor,
        etiqueta,
      };
    });

    tamanos.sort((a, b) => {
      if (Number.isFinite(a.valor) && Number.isFinite(b.valor)) {
        return a.valor - b.valor;
      }
      if (Number.isFinite(a.valor)) return -1;
      if (Number.isFinite(b.valor)) return 1;
      return a.tamanoId - b.tamanoId;
    });

    res.json({
      success: true,
      data: {
        tamanos,
        total: tamanos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener tamaños de paquetes:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener los tamaños de paquetes",
    });
  }
};

/**
 * Actualizar un producto existente
 * PUT /api/admin/productos/:id
 */
const actualizarProducto = async (req, res) => {
  const productoId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(productoId) || productoId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ProductoID inválido",
    });
  }

  if (req.body && typeof req.body === "object") {
    if (Object.prototype.hasOwnProperty.call(req.body, "sku_maestro")) {
      delete req.body.sku_maestro;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "skuMaestro")) {
      delete req.body.skuMaestro;
    }
  }

  const {
    nombre,
    descripcion,
    categoriaId,
    TipoProductoID: tipoProductoIdRaw,
    tipoProducto,
    TipoProducto: tipoProductoRaw,
    tamanos,
    tamanoIds,
    proveedorId: proveedorIdRaw,
    activo,
    packs,
    ordenImagenes,
  } = req.body;

  const client = await db.pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const productoResult = await client.query(
      `SELECT ProductoID, NombreProducto, sku_maestro, Descripcion, CategoriaID, ProveedorID_Default AS ProveedorID, Activo, TipoProductoID
       FROM Productos
       WHERE ProductoID = $1`,
      [productoId]
    );

    if (productoResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Producto maestro no encontrado",
      });
    }

    const productoActual = productoResult.rows[0];

    const allowDirect = true;

    // Si viene un orden explícito de imágenes, actualizarlo aquí.
    // Esto debe aplicarse inmediatamente (no requiere solicitud de cambio) porque es un atributo de presentación.
    if (Array.isArray(ordenImagenes)) {
      const desired = ordenImagenes
        .map((u) => (u || "").toString().trim())
        .filter(Boolean);

      if (desired.length > 0) {
        const existingImgs = await client.query(
          `SELECT url_imagen
           FROM producto_imagenes
           WHERE productoid = $1`,
          [productoId]
        );

        const existingUrls = new Set(
          (existingImgs.rows || [])
            .map((r) => (r.url_imagen || "").toString().trim())
            .filter(Boolean)
        );

        const filteredDesired = desired.filter((u) => existingUrls.has(u));

        // Agregar al final las imágenes que existan pero no estén en el arreglo recibido
        const missing = Array.from(existingUrls).filter(
          (u) => !filteredDesired.includes(u)
        );

        const finalOrder = [...filteredDesired, ...missing];

        let orden = 0;
        for (const url of finalOrder) {
          orden += 1;
          await client.query(
            `UPDATE producto_imagenes
             SET orden = $1
             WHERE productoid = $2 AND url_imagen = $3`,
            [orden, productoId, url]
          );
        }
      }
    }

    const normalizarReglaBackorder = (raw, fallback = "UNITARIO") => {
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        return fallback;
      }

      const normalized = String(raw).trim().toUpperCase();
      if (normalized === "DOCENA") {
        return "PAQUETE";
      }

      if (normalized === "PAQUETE" || normalized === "UNITARIO") {
        return normalized;
      }

      return fallback;
    };

    const nombreFinal =
      nombre !== undefined
        ? typeof nombre === "string"
          ? nombre.trim()
          : ""
        : productoActual.nombreproducto;

    if (!nombreFinal) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "El nombre del producto es obligatorio",
      });
    }

    const descripcionFinal =
      descripcion !== undefined
        ? typeof descripcion === "string" && descripcion.trim()
          ? descripcion.trim()
          : null
        : productoActual.descripcion;

    const categoriaFinal =
      categoriaId !== undefined
        ? categoriaId || null
        : productoActual.categoriaid;

    const proveedorIdRawEffective =
      proveedorIdRaw ??
      req.body?.proveedorid_default ??
      req.body?.proveedorId_Default ??
      req.body?.ProveedorID_Default ??
      req.body?.proveedorid ??
      null;

    let proveedorId = productoActual.proveedorid;
    if (proveedorIdRawEffective !== undefined) {
      if (
        proveedorIdRawEffective === null ||
        proveedorIdRawEffective === "" ||
        proveedorIdRawEffective === 0
      ) {
        proveedorId = null;
      } else {
        const parsedProveedor = Number.parseInt(proveedorIdRawEffective, 10);
        if (Number.isNaN(parsedProveedor) || parsedProveedor <= 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "Proveedor predeterminado inválido",
          });
        }

        const proveedorExiste = await client.query(
          "SELECT ProveedorID FROM Proveedores WHERE ProveedorID = $1",
          [parsedProveedor]
        );

        if (proveedorExiste.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "El proveedor predeterminado especificado no existe",
          });
        }

        proveedorId = parsedProveedor;
      }
    }

    // Gestión de visibilidad: mantener el valor actual si no se especifica
    const activoFinal =
      activo !== undefined ? Boolean(activo) : productoActual.activo;

    const tipoProductoNombre = (() => {
      const raw =
        tipoProducto !== undefined && tipoProducto !== null
          ? tipoProducto
          : tipoProductoRaw;
      if (raw === undefined) {
        return null;
      }
      if (raw === null) {
        return "";
      }
      return String(raw).trim();
    })();

    const tipoProductoId = (() => {
      if (tipoProductoIdRaw !== undefined) {
        if (tipoProductoIdRaw === null || String(tipoProductoIdRaw).trim() === "") {
          return Promise.resolve(null);
        }
        const parsed = Number.parseInt(tipoProductoIdRaw, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return Promise.reject(new Error("TIPO_PRODUCTO_INVALIDO"));
        }
        return db
          .query(
            `SELECT tipoproductoid
             FROM tipoproducto
             WHERE tipoproductoid = $1
               AND activo = TRUE`,
            [parsed]
          )
          .then((r) => {
            if (!r.rows.length) throw new Error("TIPO_PRODUCTO_NO_EXISTE");
            return parsed;
          });
      }

      if (tipoProductoNombre === null) {
        return Promise.resolve(null);
      }
      if (tipoProductoNombre === "") {
        return Promise.resolve(null);
      }
      return db
        .query(
          `INSERT INTO tipoproducto (nombre, descripcion, activo)
           VALUES ($1, NULL, TRUE)
           ON CONFLICT (nombre)
           DO UPDATE SET activo = TRUE
           RETURNING tipoproductoid`,
          [tipoProductoNombre]
        )
        .then((r) => r.rows[0]?.tipoproductoid ?? null);
    })();

    const datosNuevosProducto = {
      NombreProducto: nombreFinal,
      Descripcion: descripcionFinal,
      CategoriaID: categoriaFinal,
      ProveedorID_Default: proveedorId,
      Activo: activoFinal,
    };

    let resolvedTipoProductoId = null;
    if (tipoProductoNombre !== null || tipoProductoIdRaw !== undefined) {
      resolvedTipoProductoId = await tipoProductoId;
      datosNuevosProducto.TipoProductoID = resolvedTipoProductoId;
    }

    const updateProductoRes = await client.query(
      `UPDATE productos
       SET nombreproducto = $1,
           descripcion = $2,
           categoriaid = $3,
           proveedorid_default = $4,
           activo = $5,
           tipoproductoid = $6
       WHERE productoid = $7
       RETURNING productoid, nombreproducto, sku_maestro, descripcion, categoriaid, proveedorid_default, activo, tipoproductoid`,
      [
        datosNuevosProducto.NombreProducto,
        datosNuevosProducto.Descripcion,
        datosNuevosProducto.CategoriaID,
        datosNuevosProducto.ProveedorID_Default,
        datosNuevosProducto.Activo,
        resolvedTipoProductoId ?? productoActual.tipoproductoid ?? null,
        productoId,
      ]
    );

    if (!updateProductoRes.rows.length) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
        transactionStarted = false;
      }
      return res.status(404).json({
        success: false,
        message: "Producto maestro no encontrado",
      });
    }

    const productoActualizado = updateProductoRes.rows[0];

    let varianteTipoAudit = null;

    if (tipoProductoNombre !== null || tipoProductoIdRaw !== undefined) {
      const masterVarianteResult = await client.query(
        `SELECT *
         FROM producto_variantes
         WHERE productoid = $1
         ORDER BY piezasporpaquete ASC NULLS LAST, varianteid ASC
         LIMIT 1`,
        [productoId]
      );

      const varianteMaestraActual = masterVarianteResult.rows[0] || null;
      if (varianteMaestraActual && varianteMaestraActual.varianteid) {
        const updateVarianteTipoRes = await client.query(
          `UPDATE producto_variantes
           SET tipoproductoid = $1
           WHERE varianteid = $2
           RETURNING varianteid, productoid, sku, tipoproductoid`,
          [resolvedTipoProductoId, varianteMaestraActual.varianteid]
        );

        if (updateVarianteTipoRes.rows.length) {
          varianteTipoAudit = {
            old: varianteMaestraActual,
            neu: updateVarianteTipoRes.rows[0],
          };
        }
      }
    }

    await client.query("COMMIT");
    transactionStarted = false;

    await auditService.registrarCambioPasivo(
      req,
      "productos",
      productoId,
      "UPDATE",
      productoActual,
      productoActualizado
    );

    if (varianteTipoAudit) {
      await auditService.registrarCambioPasivo(
        req,
        "producto_variantes",
        varianteTipoAudit.neu.varianteid,
        "UPDATE",
        varianteTipoAudit.old,
        varianteTipoAudit.neu
      );
    }

    return res.json({
      success: true,
      message: "Producto actualizado correctamente.",
      data: {
        productoId,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    if (error && error.code === "23505") {
      const detail = (error.detail || "").toString().toLowerCase();
      const constraint = (error.constraint || "").toString().toLowerCase();
      const haySku =
        detail.includes("sku") ||
        detail.includes("sku_maestro") ||
        constraint.includes("sku") ||
        constraint.includes("sku_maestro");

      return res.status(409).json({
        success: false,
        message: haySku
          ? "El SKU ingresado ya existe. Por favor utiliza uno diferente."
          : "Ya existe un registro con este valor duplicado.",
      });
    }
    console.error("Error al actualizar producto maestro:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Ajustar inventario manualmente
 * POST /api/admin/inventario/ajuste
 */
const ajustarInventario = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const rolesRaw = Array.isArray(req.user?.roles) ? req.user.roles : [req.user?.rol];
    const roles = rolesRaw
      .filter(Boolean)
      .map((r) => r.toString().trim().toLowerCase());
    const isSuperAdmin = roles.some((r) => ["superadmin", "super-admin", "super admin"].includes(r));

    if (!req.user || req.user.tipo !== "admin" || !isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado. Se requieren permisos de super-administrador",
      });
    }

    const {
      varianteId,
      // Nuevo contrato
      tipoMovimiento,
      cantidad,
      motivo,
      usuarioId,
      esExcepcion,
      // Retro-compat
      cantidadCambio,
    } = req.body;

    if (!varianteId) {
      return res.status(400).json({
        success: false,
        message: "varianteId es requerido",
      });
    }

    const tipoMov = (tipoMovimiento || "").toString().trim().toUpperCase();
    const motivoNormalizado = (motivo || "").toString().trim();

    // Permitir retro-compat: si viene cantidadCambio lo usamos, si no, usamos cantidad+tipoMovimiento
    let cantidadDelta = null;
    if (cantidadCambio !== undefined && cantidadCambio !== null) {
      const parsed = Number.parseInt(cantidadCambio, 10);
      cantidadDelta = Number.isFinite(parsed) ? parsed : null;
    } else {
      const parsedCantidad = Number.parseInt(cantidad, 10);
      if (!Number.isFinite(parsedCantidad)) {
        return res.status(400).json({
          success: false,
          message: "cantidad inválida",
        });
      }
      if (!["ENTRADA", "SALIDA"].includes(tipoMov)) {
        return res.status(400).json({
          success: false,
          message: "tipoMovimiento debe ser ENTRADA o SALIDA",
        });
      }

      const absCantidad = Math.abs(parsedCantidad);
      cantidadDelta = tipoMov === "SALIDA" ? -absCantidad : absCantidad;
    }

    if (cantidadDelta === null || !Number.isFinite(cantidadDelta)) {
      return res.status(400).json({
        success: false,
        message: "cantidad inválida",
      });
    }

    if (cantidadDelta === 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad de cambio no puede ser cero",
      });
    }

    // Para el contrato nuevo, motivo es requerido. En retro-compat, mantenemos el mismo requisito.
    if (!motivoNormalizado) {
      return res.status(400).json({
        success: false,
        message: "motivo es requerido",
      });
    }

    await client.query("BEGIN");

    const resolvedUsuarioId = Number.isInteger(Number.parseInt(usuarioId, 10))
      ? Number.parseInt(usuarioId, 10)
      : req.user.id;

    const { stockAnterior, stockNuevo } = await inventoryService.registrarMovimiento(
      client,
      {
        varianteId,
        cantidadDelta,
        motivo: motivoNormalizado,
        usuarioId: resolvedUsuarioId,
        esExcepcion,
      }
    );

    await client.query("COMMIT");

    checkStockBajo(varianteId).catch((err) => {
      console.error("Error verificando stock bajo tras ajuste:", err);
    });

    res.json({
      success: true,
      nuevoStock: stockNuevo,
      stockAnterior,
      message: "Inventario ajustado exitosamente",
      data: {
        varianteId,
        stockAnterior,
        cantidadCambio: cantidadDelta,
        stockNuevo,
        motivo: motivoNormalizado,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error al ajustar inventario:", error);

    const status = error && Number.isInteger(error.status) ? error.status : 500;
    res.status(status).json({
      success: false,
      message: error.message || "Error en el servidor",
      error: error.message,
      code: error.code,
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener resumen de inventario por producto maestro
 * GET /api/admin/inventario
 */
const getInventarioResumen = async (req, res) => {
  try {
    const query = `
      SELECT
        p.ProductoID,
        p.NombreProducto,
        c.Nombre AS NombreCategoria,
        COUNT(v.VarianteID) AS TotalVariantes
      FROM Productos p
      LEFT JOIN Categorias c ON c.CategoriaID = p.CategoriaID
      LEFT JOIN Producto_Variantes v ON v.ProductoID = p.ProductoID
      GROUP BY p.ProductoID, p.NombreProducto, c.Nombre
      ORDER BY p.NombreProducto ASC
    `;

    const result = await db.query(query);

    const productos = result.rows.map((row) => ({
      productoId: row.productoid,
      nombreProducto: row.nombreproducto,
      nombreCategoria: row.nombrecategoria || "Sin categoría",
      totalVariantes:
        row.totalvariantes !== null ? parseInt(row.totalvariantes, 10) : 0,
    }));

    res.json({
      success: true,
      data: {
        productos,
        total: productos.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener inventario resumido:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener detalle de un producto maestro con sus variantes
 * GET /api/admin/productos/:id
 */
const getProductoDetalle = async (req, res) => {
  try {
    const productoId = parseInt(req.params.id, 10);

    if (Number.isNaN(productoId)) {
      return res.status(400).json({
        success: false,
        message: "ProductoID inválido",
      });
    }

    const productoResult = await db.query(
      `SELECT
         p.productoid,
         p.nombreproducto,
         p.sku_maestro,
         p.descripcion,
         p.proveedorid_default,
         p.activo,
         p.categoriaid,
         p.tipoproductoid,
         c.nombre AS categorianombre,
         c.descripcion AS categoriadescripcion
       FROM productos p
       LEFT JOIN categorias c ON c.categoriaid = p.categoriaid
       LEFT JOIN tipoproducto tp ON tp.tipoproductoid = p.tipoproductoid
       WHERE p.productoid = $1`,
      [productoId]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    const producto = productoResult.rows[0];

    const imagenesResult = await db.query(
      `SELECT
         pi.imagenid,
         pi.url_imagen,
         pi.textoalternativo,
         pi.orden
       FROM producto_imagenes pi
       WHERE pi.productoid = $1
       ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC`,
      [productoId]
    );

    const imagenesProducto = imagenesResult.rows.map((row) => ({
      imagenId: row.imagenid,
      url: row.url_imagen,
      textoAlternativo: row.textoalternativo || null,
      orden: row.orden !== null && row.orden !== undefined ? parseInt(row.orden, 10) : null,
    }));

    const variantesResult = await db.query(
      `SELECT
         pv.varianteid,
         pv.productoid,
         pv.sku,
         pv.dimensiones,
         pv.costounitario,
         pv.preciounitario,
         pv.piezasporpaquete,
         pv.stock,
         pv.tipoproductoid,
         pv.medidaid,
         pv.color_nombre,
         pv.url_imagen_variante,
         pv.activo
       FROM producto_variantes pv
       WHERE pv.productoid = $1
       ORDER BY pv.varianteid ASC`,
      [productoId]
    );

    const tamanosQuery = `
      SELECT ptd.tamanoid, ct.*
      FROM producto_tamanosdisponibles ptd
      INNER JOIN cat_tamanopaquetes ct ON ct.tamanoid = ptd.tamanoid
      WHERE ptd.productoid = $1
    `;

    const tamanosResult = await db.query(tamanosQuery, [productoId]);

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

    const tamanosDisponibles = tamanosResult.rows
      .map((row) => {
        const tamanoId = Number.parseInt(row.tamanoid, 10);

        let valor = null;
        for (const key of valueCandidates) {
          if (Object.prototype.hasOwnProperty.call(row, key)) {
            const parsed = Number.parseInt(row[key], 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              valor = parsed;
              break;
            }
          }
        }

        let etiqueta = null;
        for (const key of labelCandidates) {
          if (
            Object.prototype.hasOwnProperty.call(row, key) &&
            typeof row[key] === "string" &&
            row[key].trim()
          ) {
            etiqueta = row[key].trim();
            break;
          }
        }

        return {
          tamanoId,
          valor,
          etiqueta,
        };
      })
      .sort((a, b) => {
        if (Number.isFinite(a.valor) && Number.isFinite(b.valor)) {
          return a.valor - b.valor;
        }
        if (Number.isFinite(a.valor)) return -1;
        if (Number.isFinite(b.valor)) return 1;
        return a.tamanoId - b.tamanoId;
      });

    const tamanoReferencia = tamanosDisponibles.find(
      (tam) => Number.isFinite(tam.valor) && tam.valor > 0
    );

    const buildEtiqueta = (tamano) => {
      if (!tamano) return null;
      if (tamano.etiqueta) return tamano.etiqueta;
      if (tamano.valor === 1) return "Pieza individual";
      if (Number.isFinite(tamano.valor) && tamano.valor > 1)
        return `Pack de ${tamano.valor}`;
      return `Presentación ${tamano.tamanoId}`;
    };

    // Variantes reales en BD
    const variantes = variantesResult.rows.map((row) => {
      const precioUnitario =
        row.preciounitario !== null ? parseFloat(row.preciounitario) : null;
      const costoUnitario =
        row.costounitario !== null ? parseFloat(row.costounitario) : null;
      const stock = row.stock !== null ? parseInt(row.stock, 10) : 0;

      const piezasPorPaquete =
        row.piezasporpaquete !== null && row.piezasporpaquete !== undefined
          ? parseInt(row.piezasporpaquete, 10)
          : null;

      const precioPaquete =
        precioUnitario !== null && tamanoReferencia?.valor
          ? parseFloat((precioUnitario * tamanoReferencia.valor).toFixed(2))
          : null;

      return {
        varianteId: row.varianteid,
        productoId: row.productoid,
        sku: row.sku || null,
        dimensiones: row.dimensiones || null,
        colorNombre: row.color_nombre || null,
        urlImagenVariante: row.url_imagen_variante || null,
        costoUnitario,
        precioUnitario,
        precioPaquete,
        presentacionEtiqueta: buildEtiqueta(tamanoReferencia),
        tamanoValorReferencia: tamanoReferencia?.valor || null,
        stock,
        piezasPorPaquete:
          Number.isInteger(piezasPorPaquete) && piezasPorPaquete > 0
            ? piezasPorPaquete
            : 1,
        tipoEmpaque: null,
        tipoProductoId:
          row.tipoproductoid !== null ? parseInt(row.tipoproductoid, 10) : null,
        medidaId: row.medidaid !== null ? parseInt(row.medidaid, 10) : null,
        activo: row.activo !== undefined ? row.activo : true,
      };
    });

    // Variantes pendientes de aprobación desde control_cambios
    const cambiosPendientesResult = await db.query(
      `SELECT id, datos_nuevos
       FROM control_cambios
       WHERE entidad = 'producto_variantes'
         AND tipo_cambio = 'INSERT'
         AND estado = 'PENDIENTE'`
    );

    const variantesPendientes = cambiosPendientesResult.rows
      .map((rowCambio) => {
        let datos = rowCambio.datos_nuevos;
        if (!datos || typeof datos !== "object") {
          try {
            datos = JSON.parse(rowCambio.datos_nuevos);
          } catch (e) {
            return null;
          }
        }

        const pendienteProductoIdRaw =
          datos.productoid ?? datos.ProductoID ?? datos.productoId;
        const pendienteProductoId = Number.parseInt(pendienteProductoIdRaw, 10);

        if (
          !Number.isInteger(pendienteProductoId) ||
          pendienteProductoId !== productoId
        ) {
          return null;
        }

        const precioUnitario =
          datos.preciounitario !== undefined && datos.preciounitario !== null
            ? Number.parseFloat(datos.preciounitario)
            : null;
        const costoUnitario =
          datos.costounitario !== undefined && datos.costounitario !== null
            ? Number.parseFloat(datos.costounitario)
            : null;
        const stock =
          datos.stock !== undefined && datos.stock !== null
            ? Number.parseInt(datos.stock, 10)
            : 0;

        const precioPaquete =
          precioUnitario !== null && tamanoReferencia?.valor
            ? Number.parseFloat(
                (precioUnitario * tamanoReferencia.valor).toFixed(2)
              )
            : null;

        const tipoProductoId =
          datos.tipoproductoid !== undefined && datos.tipoproductoid !== null
            ? Number.parseInt(datos.tipoproductoid, 10)
            : null;
        const medidaId =
          datos.medidaid !== undefined && datos.medidaid !== null
            ? Number.parseInt(datos.medidaid, 10)
            : null;

        const activo =
          datos.activo !== undefined && datos.activo !== null
            ? Boolean(datos.activo)
            : true;

        return {
          varianteId: null,
          productoId: pendienteProductoId,
          sku: datos.sku || null,
          dimensiones: datos.dimensiones || null,
          costoUnitario,
          precioUnitario,
          precioPaquete,
          presentacionEtiqueta: buildEtiqueta(tamanoReferencia),
          tamanoValorReferencia: tamanoReferencia?.valor || null,
          stock,
          tipoProductoId,
          medidaId,
          activo,
          isPending: true,
          controlCambioId: rowCambio.id,
        };
      })
      .filter(Boolean);

    const variantesCombinadas = [...variantes, ...variantesPendientes];

    const productoDetalle = {
      productoId: producto.productoid,
      nombreProducto: producto.nombreproducto,
      sku_maestro: producto.sku_maestro || null,
      descripcion: producto.descripcion,
      proveedorid_default:
        producto.proveedorid_default !== null &&
        producto.proveedorid_default !== undefined
          ? Number.parseInt(producto.proveedorid_default, 10)
          : null,
      activo: producto.activo,
      TipoProductoID:
        producto.tipoproductoid !== null && producto.tipoproductoid !== undefined
          ? Number.parseInt(producto.tipoproductoid, 10)
          : null,
      imagenes: imagenesProducto,
      categoria: producto.categoriaid
        ? {
            categoriaId: producto.categoriaid,
            nombre: producto.categorianombre,
            descripcion: producto.categoriadescripcion,
          }
        : null,
      totalVariantes: variantesCombinadas.length,
      variantesConStock: variantesCombinadas.filter(
        (v) => typeof v.stock === "number" && v.stock > 0
      ).length,
    };

    return res.json({
      success: true,
      message: "Producto obtenido exitosamente",
      data: {
        producto: productoDetalle,
        variantes: variantesCombinadas,
        tamanosDisponibles,
      },
    });
  } catch (error) {
    console.error("Error al obtener detalle de producto:", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

/**
 * Obtener todos los productos (para gestión)
 * GET /api/admin/productos
 */
const getAllProductos = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        p.productoid,
        p.nombreproducto,
        p.descripcion,
        p.categoriaid,
        p.activo,
        tipo_info.tipoproductoid AS tipoproductoid,
        tipo_info.nombre AS tipo_producto,
        COALESCE(SUM(v.stock), 0) AS stock_total,
        COUNT(v.varianteid) AS variantes_count,
        MIN(v.preciounitario) FILTER (WHERE v.preciounitario IS NOT NULL) AS precio_desde,
        JSONB_BUILD_OBJECT(
          'varianteId', v_top.varianteid,
          'sku', v_top.sku,
          'precioUnitario', v_top.preciounitario,
          'stock', v_top.stock,
          'dimensiones', v_top.dimensiones,
          'medidaId', v_top.medidaid
        ) AS variante_destacada,
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'varianteId', v.varianteid,
            'sku', v.sku,
            'precioUnitario', v.preciounitario,
            'stock', v.stock,
            'dimensiones', v.dimensiones,
            'medidaId', v.medidaid
          )
        ) FILTER (WHERE v.varianteid IS NOT NULL) AS variantes,
        imagen.url_imagen,
        imagen.textoalternativo
      FROM productos p
      LEFT JOIN producto_variantes v ON v.productoid = p.productoid
      LEFT JOIN LATERAL (
        SELECT tp.tipoproductoid, tp.nombre
        FROM producto_variantes pv_tipo
        LEFT JOIN tipoproducto tp ON tp.tipoproductoid = pv_tipo.tipoproductoid
        WHERE pv_tipo.productoid = p.productoid
        ORDER BY pv_tipo.piezasporpaquete ASC NULLS LAST, pv_tipo.varianteid ASC
        LIMIT 1
      ) tipo_info ON true
      LEFT JOIN LATERAL (
        SELECT v2.*
        FROM producto_variantes v2
        WHERE v2.productoid = p.productoid
        ORDER BY v2.stock DESC NULLS LAST, v2.varianteid ASC
        LIMIT 1
      ) v_top ON true
      LEFT JOIN LATERAL (
        SELECT 
          pi.url_imagen,
          pi.textoalternativo
        FROM producto_imagenes pi
        WHERE pi.productoid = p.productoid
        ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
        LIMIT 1
      ) imagen ON true
      GROUP BY 
        p.productoid, 
        p.nombreproducto, 
        p.descripcion, 
        p.categoriaid, 
        tipo_info.tipoproductoid,
        tipo_info.nombre,
        v_top.varianteid, 
        v_top.sku, 
        v_top.preciounitario, 
        v_top.stock, 
        v_top.dimensiones, 
        v_top.medidaid,
        imagen.url_imagen,
        imagen.textoalternativo
      ORDER BY p.productoid DESC`
    );

    const categorias = await db.query(
      "SELECT categoriaid, nombre FROM categorias"
    );
    const categoriasMap = {};
    categorias.rows.forEach((cat) => {
      categoriasMap[cat.categoriaid] = cat.nombre;
    });

    res.json({
      success: true,
      data: {
        productos: result.rows.map((row) => {
          const varianteDestacada =
            row.variante_destacada && row.variante_destacada.varianteId
              ? {
                  varianteId: row.variante_destacada.varianteId,
                  sku: row.variante_destacada.sku,
                  precioUnitario: row.variante_destacada.precioUnitario
                    ? parseFloat(row.variante_destacada.precioUnitario)
                    : null,
                  stock: row.variante_destacada.stock ?? 0,
                  dimensiones: row.variante_destacada.dimensiones || null,
                  medidaId: row.variante_destacada.medidaId || null,
                }
              : null;

          const variantes = Array.isArray(row.variantes)
            ? row.variantes.map((variant) => ({
                varianteId: variant.varianteId,
                sku: variant.sku,
                precioUnitario: variant.precioUnitario
                  ? parseFloat(variant.precioUnitario)
                  : null,
                stock: variant.stock ?? 0,
                dimensiones: variant.dimensiones || null,
                medidaId: variant.medidaId || null,
              }))
            : [];

          return {
            productoid: row.productoid,
            nombreproducto: row.nombreproducto,
            descripcion: row.descripcion,
            activo: row.activo,
            TipoProductoID:
              row.tipoproductoid !== null && row.tipoproductoid !== undefined
                ? Number.parseInt(row.tipoproductoid, 10)
                : null,
            tipoProducto:
              row.tipo_producto !== null && row.tipo_producto !== undefined
                ? String(row.tipo_producto)
                : null,
            stockTotal: parseInt(row.stock_total, 10) || 0,
            variantesCount: parseInt(row.variantes_count, 10) || 0,
            precioDesde: row.precio_desde ? parseFloat(row.precio_desde) : null,
            categoriaNombre: categoriasMap[row.categoriaid] || "Sin categoría",
            imagenUrl: row.url_imagen || null,
            imagenAlt: row.textoalternativo || null,
            varianteDestacada,
            variantes,
          };
        }),
      },
    });
  } catch (error) {
    console.error("Error al obtener productos:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener categorías disponibles
 * GET /api/admin/categorias
 */
const getCategorias = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        c.CategoriaID,
        c.Nombre,
        c.Descripcion,
        c.ParentCategoriaID,
        c.Activo,
        p.Nombre AS ParentNombre
      FROM Categorias c
      LEFT JOIN Categorias p ON c.ParentCategoriaID = p.CategoriaID
      ORDER BY c.Nombre`
    );

    res.json({
      success: true,
      data: {
        categorias: result.rows.map((row) => ({
          categoriaId: row.categoriaid,
          nombre: row.nombre,
          descripcion: row.descripcion,
          parentCategoriaId: row.parentcategoriaid,
          parentNombre: row.parentnombre || null,
          activo: row.activo,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener categorías:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Crear una nueva categoría
 * POST /api/admin/categorias
 */
const crearCategoria = async (req, res) => {
  try {
    const { nombre, descripcion, parentCategoriaId, activo } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({
        success: false,
        message: "El nombre de la categoría es requerido",
      });
    }

    let parentCategoria = null;

    if (parentCategoriaId !== undefined && parentCategoriaId !== null) {
      const parentResult = await db.query(
        "SELECT CategoriaID FROM Categorias WHERE CategoriaID = $1",
        [parentCategoriaId]
      );

      if (parentResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "La categoría padre especificada no existe",
        });
      }

      parentCategoria = parentCategoriaId;
    }

    const nombreNormalizado = nombre.trim();

    const existente = await db.query(
      "SELECT CategoriaID FROM Categorias WHERE LOWER(Nombre) = LOWER($1)",
      [nombreNormalizado]
    );

    if (existente.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Ya existe una categoría con ese nombre",
      });
    }

    // Gestión de visibilidad: activo por defecto TRUE
    const activoFinal = activo !== undefined ? Boolean(activo) : true;

    const datosNuevos = {
      Nombre: nombreNormalizado,
      Descripcion: descripcion?.trim() || null,
      ParentCategoriaID: parentCategoria,
      Activo: activoFinal,
    };

    const rolesRaw = Array.isArray(req.user?.roles)
      ? req.user.roles
      : [req.user?.rol];
    const roles = rolesRaw
      .filter(Boolean)
      .map((r) => r.toString().trim().toLowerCase());
    const allowDirect = roles.some((r) =>
      ["admin", "superadmin", "super-admin", "super admin"].includes(r)
    );

    if (allowDirect) {
      const insertRes = await db.query(
        "INSERT INTO categorias (nombre, descripcion, parentcategoriaid, activo) VALUES ($1, $2, $3, $4) RETURNING categoriaid, nombre, descripcion, parentcategoriaid, activo",
        [
          datosNuevos.Nombre,
          datosNuevos.Descripcion,
          datosNuevos.ParentCategoriaID,
          datosNuevos.Activo,
        ]
      );

      const row = insertRes.rows[0];

      await auditService.registrarCambioPasivo(
        req,
        "categorias",
        row.categoriaid,
        "INSERT",
        null,
        {
          categoriaid: row.categoriaid,
          nombre: row.nombre,
          descripcion: row.descripcion,
          parentcategoriaid: row.parentcategoriaid,
          activo: row.activo,
        }
      );

      return res.status(201).json({
        success: true,
        message: "Categoría creada correctamente.",
        data: {
          categoria: {
            categoriaId: row.categoriaid,
            nombre: row.nombre,
            descripcion: row.descripcion,
            parentCategoriaId: row.parentcategoriaid,
            activo: row.activo,
          },
        },
      });
    }

    const resultado = await solicitarCambio(
      req,
      "categorias",
      null,
      "INSERT",
      datosNuevos,
      null
    );

    res.status(201).json({
      success: true,
      message: "Solicitud de cambio en categoría registrada.",
      data: {
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error("Error al crear categoría:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear la categoría",
    });
  }
};

/**
 * Actualizar una categoría existente
 * PUT /api/admin/categorias/:id
 */
const actualizarCategoria = async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.id, 10);
    const { nombre, descripcion, parentCategoriaId, activo } = req.body;

    if (Number.isNaN(categoriaId)) {
      return res.status(400).json({
        success: false,
        message: "ID de categoría inválido",
      });
    }

    if (parentCategoriaId && Number(parentCategoriaId) === categoriaId) {
      return res.status(400).json({
        success: false,
        message: "Una categoría no puede ser su propia categoría padre",
      });
    }

    const categoriaResult = await db.query(
      "SELECT * FROM Categorias WHERE CategoriaID = $1",
      [categoriaId]
    );

    if (categoriaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
    }

    const categoriaActual = categoriaResult.rows[0];

    let parentCategoria = null;

    if (parentCategoriaId !== undefined && parentCategoriaId !== null) {
      const parentResult = await db.query(
        "SELECT CategoriaID FROM Categorias WHERE CategoriaID = $1",
        [parentCategoriaId]
      );

      if (parentResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "La categoría padre especificada no existe",
        });
      }

      parentCategoria = parentCategoriaId;
    }

    const nombreNormalizado = nombre?.trim();

    if (nombreNormalizado) {
      const existeNombre = await db.query(
        "SELECT CategoriaID FROM Categorias WHERE LOWER(Nombre) = LOWER($1) AND CategoriaID <> $2",
        [nombreNormalizado, categoriaId]
      );

      if (existeNombre.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Ya existe otra categoría con ese nombre",
        });
      }
    }

    // Gestión de visibilidad: mantener el valor actual si no se especifica
    const activoFinal =
      activo !== undefined ? Boolean(activo) : categoriaActual.activo;

    const datosNuevos = {
      Nombre: nombreNormalizado || categoriaActual.nombre,
      Descripcion: descripcion?.trim() || categoriaActual.descripcion,
      ParentCategoriaID:
        parentCategoria !== null ? parentCategoria : categoriaActual.parentcategoriaid,
      Activo: activoFinal,
    };

    const rolesRaw = Array.isArray(req.user?.roles)
      ? req.user.roles
      : [req.user?.rol];
    const roles = rolesRaw
      .filter(Boolean)
      .map((r) => r.toString().trim().toLowerCase());
    const allowDirect = roles.some((r) =>
      ["admin", "superadmin", "super-admin", "super admin"].includes(r)
    );

    if (allowDirect) {
      const updateRes = await db.query(
        "UPDATE categorias SET nombre = $1, descripcion = $2, parentcategoriaid = $3, activo = $4 WHERE categoriaid = $5 RETURNING categoriaid, nombre, descripcion, parentcategoriaid, activo",
        [
          datosNuevos.Nombre,
          datosNuevos.Descripcion,
          datosNuevos.ParentCategoriaID,
          datosNuevos.Activo,
          categoriaId,
        ]
      );

      if (!updateRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Categoría no encontrada",
        });
      }

      const row = updateRes.rows[0];

      await auditService.registrarCambioPasivo(
        req,
        "categorias",
        categoriaId,
        "UPDATE",
        categoriaActual,
        {
          categoriaid: row.categoriaid,
          nombre: row.nombre,
          descripcion: row.descripcion,
          parentcategoriaid: row.parentcategoriaid,
          activo: row.activo,
        }
      );

      return res.json({
        success: true,
        message: "Categoría actualizada correctamente.",
        data: {
          categoria: {
            categoriaId: row.categoriaid,
            nombre: row.nombre,
            descripcion: row.descripcion,
            parentCategoriaId: row.parentcategoriaid,
            activo: row.activo,
          },
        },
      });
    }

    const resultado = await solicitarCambio(
      req,
      "categorias",
      categoriaId,
      "UPDATE",
      datosNuevos,
      categoriaActual
    );

    res.json({
      success: true,
      message: "Solicitud de cambio en categoría registrada.",
      data: {
        categoriaId,
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error("Error al actualizar categoría:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar la categoría",
    });
  }
};

/**
 * Eliminar una categoría
 * DELETE /api/admin/categorias/:id
 */
const eliminarCategoria = async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.id, 10);

    if (Number.isNaN(categoriaId)) {
      return res.status(400).json({
        success: false,
        message: "ID de categoría inválido",
      });
    }

    const categoriaResult = await db.query(
      "SELECT * FROM Categorias WHERE CategoriaID = $1",
      [categoriaId]
    );

    if (categoriaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Categoría no encontrada",
      });
    }

    // Verificar si la categoría tiene subcategorías
    const subcategoriasResult = await db.query(
      "SELECT COUNT(*) AS total FROM Categorias WHERE ParentCategoriaID = $1",
      [categoriaId]
    );

    if (parseInt(subcategoriasResult.rows[0].total, 10) > 0) {
      return res.status(400).json({
        success: false,
        message:
          "No se puede eliminar la categoría porque tiene subcategorías asociadas",
      });
    }

    // Verificar si hay productos asociados a la categoría
    const productosAsociados = await db.query(
      "SELECT COUNT(*) AS total FROM Productos WHERE CategoriaID = $1",
      [categoriaId]
    );

    if (parseInt(productosAsociados.rows[0].total, 10) > 0) {
      return res.status(400).json({
        success: false,
        message:
          "No se puede eliminar la categoría porque existen productos asociados",
      });
    }

    // Verificar si hay variantes usando productos de esta categoría
    const productosEnUso = await db.query(
      `SELECT COUNT(*) AS total
       FROM Producto_Variantes pv
       INNER JOIN Productos p ON pv.ProductoID = p.ProductoID
       WHERE p.CategoriaID = $1`,
      [categoriaId]
    );

    if (parseInt(productosEnUso.rows[0].total, 10) > 0) {
      return res.status(400).json({
        success: false,
        message:
          "No se puede eliminar la categoría porque existen productos asociados",
      });
    }

    const categoriaSnapshot = categoriaResult.rows[0];

    const rolesRaw = Array.isArray(req.user?.roles)
      ? req.user.roles
      : [req.user?.rol];
    const roles = rolesRaw
      .filter(Boolean)
      .map((r) => r.toString().trim().toLowerCase());
    const allowDirect = roles.some((r) =>
      ["admin", "superadmin", "super-admin", "super admin"].includes(r)
    );

    const datosNuevos = {};

    if (allowDirect) {
      const deleteRes = await db.query(
        "DELETE FROM categorias WHERE categoriaid = $1 RETURNING categoriaid",
        [categoriaId]
      );

      if (!deleteRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Categoría no encontrada",
        });
      }

      await auditService.registrarCambioPasivo(
        req,
        "categorias",
        categoriaId,
        "DELETE",
        categoriaSnapshot,
        {}
      );

      return res.json({
        success: true,
        message: "Categoría eliminada correctamente.",
        data: {
          categoriaId,
        },
      });
    }

    const resultado = await solicitarCambio(
      req,
      "categorias",
      categoriaId,
      "DELETE",
      datosNuevos,
      categoriaSnapshot
    );

    res.json({
      success: true,
      message: "Solicitud de cambio en categoría registrada.",
      data: {
        categoriaId,
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error("Error al eliminar categoría:", error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar la categoría",
    });
  }
};

/**
 * Crear un nuevo agente
 * POST /api/admin/agentes
 */
const crearAgente = async (req, res) => {
  try {
    const { nombre, apellido, email, password, telefono } = req.body;

    // Validaciones
    if (!nombre || !apellido || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Todos los campos obligatorios deben ser proporcionados",
      });
    }

    // Verificar si el email ya existe
    const emailCheck = await db.query(
      "SELECT AgenteID FROM AgentesDeVentas WHERE Email = $1",
      [email]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "El email ya está registrado",
      });
    }

    const nuevoCodigoAgente = await generateCodigoAgente(db);

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    const rol = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rol === "admin" || rol === "superadmin";

    if (allowDirect) {
      const insertRes = await db.query(
        "INSERT INTO agentesdeventas (nombre, apellido, email, passwordhash, codigoagente, activo, esadmin, adminrol) VALUES ($1, $2, $3, $4, $5, TRUE, FALSE, NULL) RETURNING agenteid, nombre, apellido, email, codigoagente, activo, esadmin, adminrol",
        [nombre.trim(), apellido.trim(), email, hashedPassword, nuevoCodigoAgente]
      );

      const row = insertRes.rows[0];

      await auditService.registrarCambioPasivo(
        req,
        "agentes",
        row.agenteid,
        "INSERT",
        null,
        {
          agenteid: row.agenteid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          codigoagente: row.codigoagente,
          activo: row.activo,
          esadmin: row.esadmin,
          adminrol: row.adminrol,
        }
      );

      return res.status(201).json({
        success: true,
        message: "Agente creado correctamente.",
        data: {
          agenteId: row.agenteid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          codigoAgente: row.codigoagente,
          solicitudId: null,
        },
      });
    }

    // Estrategia Pura: registrar solicitud de creación en control_cambios
    const datosNuevosAgente = {
      Nombre: nombre,
      Apellido: apellido,
      Email: email,
      PasswordHash: hashedPassword,
      CodigoAgente: nuevoCodigoAgente,
      Activo: true,
    };

    const resultado = await solicitarCambio(
      req,
      "agentes",
      null,
      "INSERT",
      datosNuevosAgente,
      null
    );

    const isSuperAdmin =
      req.user &&
      (req.user.rol === "superadmin" || req.user.tipo === "superadmin");

    if (isSuperAdmin) {
      try {
        const autoResult = await aprobarSolicitudes(
          [resultado.solicitudId],
          req.user.id
        );

        const aplicado = autoResult.applied.find(
          (c) => c.id === resultado.solicitudId
        );

        let agenteIdRes = aplicado?.entidadId || null;

        if (!agenteIdRes) {
          // Intentar resolver por email
          const refetch = await db.query(
            "SELECT AgenteID, Nombre, Apellido, Email, CodigoAgente FROM AgentesDeVentas WHERE Email = $1",
            [email]
          );
          if (refetch.rows.length) {
            agenteIdRes = refetch.rows[0].agenteid;
          }
        }

        let agenteData = null;
        if (agenteIdRes) {
          const refetch = await db.query(
            "SELECT AgenteID, Nombre, Apellido, Email, CodigoAgente FROM AgentesDeVentas WHERE AgenteID = $1",
            [agenteIdRes]
          );
          agenteData = refetch.rows[0] || null;
        }

        // Registrar log solo cuando el cambio ya fue aplicado
        if (agenteData) {
          try {
            registrarLog(req, "CREAR", "Agente", agenteData.agenteid, {
              nombre: agenteData.nombre,
              apellido: agenteData.apellido,
              email: agenteData.email,
              codigoAgente: agenteData.codigoagente,
            }).catch((err) => {
              console.error("Error guardando log de CREAR Agente:", err);
            });
          } catch (logError) {
            console.error(
              "Error interno al preparar log de CREAR Agente:",
              logError
            );
          }
        }

        return res.status(201).json({
          success: true,
          message: "Agente creado correctamente (auto-aprobado)",
          data: {
            agenteId: agenteData?.agenteid || null,
            nombre: agenteData?.nombre || nombre,
            apellido: agenteData?.apellido || apellido,
            email,
            codigoAgente: agenteData?.codigoagente || nuevoCodigoAgente,
            solicitudId: resultado.solicitudId,
          },
        });
      } catch (autoError) {
        console.error("Error en auto-aprobación de crearAgente:", autoError);
        return res.status(500).json({
          success: false,
          message:
            "La solicitud de cambio se registró, pero ocurrió un error al aplicar la auto-aprobación.",
          error: autoError.message,
          data: {
            solicitudId: resultado.solicitudId,
          },
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: resultado.mensaje,
      data: {
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error("Error al crear agente:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

/**
 * Obtener todos los agentes (reales + pendientes de creación)
 * GET /api/admin/agentes
 */
const getAllAgentes = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        a.AgenteID,
        a.Nombre,
        a.Apellido,
        a.Email,
        a.CodigoAgente,
        a.Activo,
        COUNT(DISTINCT p.PedidoID) as TotalVentas,
        COALESCE(SUM(p.MontoTotal), 0) as MontoTotalVentas,
        COALESCE(SUM(c.MontoComision), 0) as ComisionesTotales
      FROM AgentesDeVentas a
      LEFT JOIN Pedidos p ON a.AgenteID = p.AgenteID
      LEFT JOIN Comisiones c ON a.AgenteID = c.AgenteID
      GROUP BY a.AgenteID
      ORDER BY a.AgenteID DESC`
    );

    const agentesReales = result.rows.map((row) => ({
      agenteId: row.agenteid,
      nombre: row.nombre,
      apellido: row.apellido,
      email: row.email,
      codigoAgente: row.codigoagente,
      telefono: row.telefono,
      activo: row.activo,
      fechaCreacion: row.fechacreacion,
      totalVentas: parseInt(row.totalventas),
      montoTotalVentas: parseFloat(row.montototalventas),
      comisionesTotales: parseFloat(row.comisionestotales),
    }));

    // Agentes pendientes de creación en control_cambios (INSERT, PENDIENTE)
    const cambiosPendientesResult = await db.query(
      `SELECT id, datos_nuevos
       FROM control_cambios
       WHERE entidad = 'agentes'
         AND tipo_cambio = 'INSERT'
         AND estado = 'PENDIENTE'`
    );

    const agentesPendientes = cambiosPendientesResult.rows
      .map((rowCambio) => {
        let datos = rowCambio.datos_nuevos;
        if (!datos || typeof datos !== "object") {
          try {
            datos = JSON.parse(rowCambio.datos_nuevos);
          } catch (e) {
            return null;
          }
        }

        const nombre = (datos.Nombre || "").trim();
        const apellido = (datos.Apellido || "").trim();
        const email = (datos.Email || "").trim();

        if (!nombre && !apellido && !email) {
          // Datos incompletos, evitar mostrar basura
          return null;
        }

        const codigoAgente = datos.CodigoAgente || null;
        const telefono = datos.Telefono || null;
        const activo =
          datos.Activo !== undefined && datos.Activo !== null
            ? Boolean(datos.Activo)
            : true;

        return {
          agenteId: null,
          nombre,
          apellido,
          email,
          codigoAgente,
          telefono,
          activo,
          fechaCreacion: null,
          totalVentas: 0,
          montoTotalVentas: 0,
          comisionesTotales: 0,
          _isPending: true,
          controlCambioId: rowCambio.id,
        };
      })
      .filter(Boolean);

    const agentes = [...agentesReales, ...agentesPendientes];

    res.json({
      success: true,
      data: {
        agentes,
      },
    });
  } catch (error) {
    console.error("Error al obtener agentes:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener detalles de un agente específico
 * GET /api/admin/agentes/:id
 */
const getAgenteDetalle = async (req, res) => {
  try {
    const agenteId = parseInt(req.params.id);

    // Obtener información del agente
    const agenteResult = await db.query(
      `SELECT 
        AgenteID, Nombre, Apellido, Email, CodigoAgente, Activo
      FROM AgentesDeVentas
      WHERE AgenteID = $1`,
      [agenteId]
    );

    if (agenteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Agente no encontrado",
      });
    }

    const agente = agenteResult.rows[0];

    // Obtener ventas del agente
    const ventasResult = await db.query(
      `SELECT 
        p.PedidoID,
        p.FechaPedido,
        p.MontoTotal,
        p.Estatus,
        c.Nombre || ' ' || c.Apellido as ClienteNombre
      FROM Pedidos p
      INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
      WHERE p.AgenteID = $1
      ORDER BY p.FechaPedido DESC`,
      [agenteId]
    );

    // Obtener comisiones del agente
    const comisionesResult = await db.query(
      `SELECT 
        ComisionID,
        PedidoID,
        MontoComision,
        Estatus
      FROM Comisiones
      WHERE AgenteID = $1
      ORDER BY ComisionID DESC`,
      [agenteId]
    );

    res.json({
      success: true,
      data: {
        agente: {
          agenteId: agente.agenteid,
          nombre: agente.nombre,
          apellido: agente.apellido,
          email: agente.email,
          codigoAgente: agente.codigoagente,
          activo: agente.activo,
        },
        ventas: ventasResult.rows.map((row) => ({
          pedidoId: row.pedidoid,
          fechaPedido: row.fechapedido,
          montoTotal: parseFloat(row.montototal),
          estatus: row.estatus,
          clienteNombre: row.clientenombre,
        })),
        comisiones: comisionesResult.rows.map((row) => ({
          comisionId: row.comisionid,
          pedidoId: row.pedidoid,
          montoComision: parseFloat(row.montocomision),
          estatus: row.estatus,
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener detalle de agente:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Desactivar un agente (soft delete) vía control de cambios
 * PUT /api/admin/agentes/:id/desactivar
 */
const desactivarAgente = async (req, res) => {
  try {
    const agenteId = parseInt(req.params.id);

    const snapshotResult = await db.query(
      "SELECT * FROM AgentesDeVentas WHERE AgenteID = $1",
      [agenteId]
    );

    if (snapshotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Agente no encontrado",
      });
    }

    const agenteActual = snapshotResult.rows[0];

    const rol = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rol === "admin" || rol === "superadmin";

    const datosNuevos = {
      Activo: false,
    };

    if (allowDirect) {
      const updateRes = await db.query(
        "UPDATE agentesdeventas SET activo = FALSE WHERE agenteid = $1 RETURNING agenteid, nombre, apellido, email, codigoagente, activo, esadmin, adminrol",
        [agenteId]
      );

      if (!updateRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Agente no encontrado",
        });
      }

      const row = updateRes.rows[0];

      await auditService.registrarCambioPasivo(
        req,
        "agentes",
        agenteId,
        "UPDATE",
        agenteActual,
        {
          agenteid: row.agenteid,
          activo: row.activo,
        }
      );

      return res.json({
        success: true,
        message: `Agente ${row.nombre} ${row.apellido} desactivado exitosamente.`,
        data: {
          agenteId: row.agenteid,
        },
      });
    }

    const resultado = await solicitarCambio(
      req,
      "agentes",
      agenteId,
      "UPDATE",
      datosNuevos,
      agenteActual
    );

    const isSuperAdmin =
      req.user &&
      (req.user.rol === "superadmin" || req.user.tipo === "superadmin");

    if (isSuperAdmin) {
      try {
        await aprobarSolicitudes([resultado.solicitudId], req.user.id);

        const refreshed = await db.query(
          "SELECT AgenteID, Nombre, Apellido FROM AgentesDeVentas WHERE AgenteID = $1",
          [agenteId]
        );

        const agente = refreshed.rows[0] || agenteActual;

        // Registrar log solo cuando el cambio ya fue aplicado
        try {
          registrarLog(req, "ELIMINAR", "Agente", agente.agenteid, {
            nombre: agente.nombre,
            apellido: agente.apellido,
            motivo:
              "Desactivación de agente (soft delete) desde panel administrativo",
          }).catch((err) => {
            console.error("Error guardando log de ELIMINAR Agente:", err);
          });
        } catch (logError) {
          console.error(
            "Error interno al preparar log de ELIMINAR Agente:",
            logError
          );
        }

        return res.json({
          success: true,
          message: `Agente ${agente.nombre} ${agente.apellido} desactivado exitosamente (auto-aprobado)`,
          data: {
            agenteId: agente.agenteid,
          },
        });
      } catch (autoError) {
        console.error("Error en auto-aprobación de desactivarAgente:", autoError);
        return res.status(500).json({
          success: false,
          message:
            "La solicitud de cambio se registró, pero ocurrió un error al aplicar la auto-aprobación.",
          error: autoError.message,
          data: {
            solicitudId: resultado.solicitudId,
          },
        });
      }
    }

    return res.json({
      success: true,
      message: resultado.mensaje,
      data: {
        agenteId,
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error("Error al desactivar agente:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener todas las comisiones
 * GET /api/admin/comisiones
 */
const getAllComisiones = async (req, res) => {
  try {
    const { estatus } = req.query;

    let query = `
      SELECT 
        c.ComisionID,
        c.PedidoID,
        c.AgenteID,
        a.Nombre || ' ' || a.Apellido as AgenteNombre,
        a.CodigoAgente,
        c.MontoComision,
        c.Estatus,
        c.FechaCalculo,
        NULL::timestamp AS FechaPago,
        p.MontoTotal as MontoVenta
      FROM Comisiones c
      INNER JOIN AgentesDeVentas a ON c.AgenteID = a.AgenteID
      INNER JOIN Pedidos p ON c.PedidoID = p.PedidoID
    `;

    const params = [];
    if (estatus) {
      query += " WHERE c.Estatus = $1";
      params.push(estatus);
    }

    query += " ORDER BY c.FechaCalculo DESC";

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        comisiones: result.rows.map((row) => ({
          comisionId: row.comisionid,
          pedidoId: row.pedidoid,
          agenteId: row.agenteid,
          agenteNombre: row.agentenombre,
          codigoAgente: row.codigoagente,
          montoComision: parseFloat(row.montocomision),
          estatus: row.estatus,
          fechaCalculo: row.fechacalculo,
          fechaGeneracion: row.fechacalculo,
          fechaPago: row.fechapago,
          montoVenta: parseFloat(row.montoventa),
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener comisiones:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Pagar una comisión
 * PUT /api/admin/comisiones/:id/pagar
 */
const pagarComision = async (req, res) => {
  try {
    const comisionId = parseInt(req.params.id);

    // Verificar que la comisión existe y está pendiente
    const checkResult = await db.query(
      "SELECT * FROM Comisiones WHERE ComisionID = $1",
      [comisionId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Comisión no encontrada",
      });
    }

    const comision = checkResult.rows[0];

    if (comision.estatus === "Pagada") {
      return res.status(400).json({
        success: false,
        message: "Esta comisión ya ha sido pagada",
      });
    }

    const datosNuevos = {
      Estatus: "Pagada",
    };

    const rol = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rol === "admin" || rol === "superadmin";

    if (allowDirect) {
      const updateRes = await db.query(
        "UPDATE comisiones SET estatus = $1 WHERE comisionid = $2 RETURNING comisionid, pedidoid, agenteid, montocomision, fechacalculo, estatus",
        ["Pagada", comisionId]
      );

      if (!updateRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Comisión no encontrada",
        });
      }

      const row = updateRes.rows[0];

      await auditService.registrarCambioPasivo(
        req,
        "comisiones",
        comisionId,
        "UPDATE",
        comision,
        {
          comisionid: row.comisionid,
          estatus: row.estatus,
        }
      );

      return res.json({
        success: true,
        message: "Comisión pagada correctamente.",
        data: {
          comisionId: row.comisionid,
          estatus: row.estatus,
        },
      });
    }

    const resultado = await solicitarCambio(
      req,
      "comisiones",
      comisionId,
      "UPDATE",
      datosNuevos,
      comision
    );

    res.json({
      success: true,
      message: "Solicitud de cambio en comisión registrada.",
      data: {
        comisionId,
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error("Error al pagar comisión:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener todos los clientes
 * GET /api/admin/clientes
 */
const getAllClientes = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        c.ClienteID,
        c.Nombre,
        c.Apellido,
        c.Email,
        c.Telefono,
        c.Activo,
        c.FechaDeRegistro,
        COUNT(DISTINCT p.PedidoID) AS TotalPedidos,
        COALESCE(SUM(p.MontoTotal), 0) AS MontoTotalCompras
      FROM Clientes c
      LEFT JOIN Pedidos p ON c.ClienteID = p.ClienteID
      GROUP BY c.ClienteID
      ORDER BY c.FechaDeRegistro DESC`
    );

    res.json({
      success: true,
      data: {
        clientes: result.rows.map((row) => ({
          clienteId: row.clienteid,
          nombre: row.nombre,
          apellido: row.apellido,
          email: row.email,
          telefono: row.telefono,
          activo: row.activo,
          fechaRegistro: row.fechaderegistro,
          totalPedidos: parseInt(row.totalpedidos),
          montoTotalCompras: parseFloat(row.montototalcompras),
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener clientes:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Obtener detalle de un pedido
 * GET /api/admin/pedidos/:id/detalle
 */
const getPedidoDetalle = async (req, res) => {
  try {
    const pedidoId = parseInt(req.params.id);

    // Obtener información del pedido
    const pedidoResult = await db.query(
      `SELECT 
        p.*,
        c.Nombre as ClienteNombre,
        c.Apellido as ClienteApellido,
        c.Email as ClienteEmail,
        c.Telefono as ClienteTelefono,
        a.Nombre as AgenteNombre,
        a.Apellido as AgenteApellido,
        a.CodigoAgente,
        d.Calle,
        d.NumeroExt,
        d.NumeroInt,
        d.Colonia,
        d.Ciudad,
        d.EstadoID,
        e.Nombre as EstadoNombre,
        e.Abreviatura as EstadoAbreviatura,
        d.CodigoPostal,
        d.TelefonoContacto as Referencias
      FROM Pedidos p
      INNER JOIN Clientes c ON p.ClienteID = c.ClienteID
      LEFT JOIN AgentesDeVentas a ON p.AgenteID = a.AgenteID
      LEFT JOIN Cliente_Direcciones d ON p.DireccionEnvioID = d.DireccionID
      LEFT JOIN Estados e ON d.EstadoID = e.EstadoID
      WHERE p.PedidoID = $1`,
      [pedidoId]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const pedido = pedidoResult.rows[0];

    // Obtener detalles de productos del pedido
    const detallesResult = await db.query(
      `SELECT 
        dp.DetalleID,
        dp.PedidoID,
        dp.VarianteID,
        dp.TamanoID,
        dp.CantidadPaquetes,
        dp.PrecioPorPaquete,
        dp.PiezasTotales,
        dp.PrecioUnitario,
        COALESCE(
          dp.PrecioUnitario, 
          ROUND(dp.PrecioPorPaquete / NULLIF((dp.PiezasTotales / NULLIF(dp.CantidadPaquetes, 0)), 0), 2)
        ) as PrecioUnitarioCalculado,
        pv.SKU,
        pv.Dimensiones,
        pv.ProductoID,
        pr.NombreProducto,
        row_to_json(ct) as tamano_info
      FROM DetallesDelPedido dp
      INNER JOIN Producto_Variantes pv ON dp.VarianteID = pv.VarianteID
      INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
      LEFT JOIN Cat_TamanoPaquetes ct ON dp.TamanoID = ct.TamanoID
      WHERE dp.PedidoID = $1`,
      [pedidoId]
    );

    res.json({
      success: true,
      data: {
        pedido: {
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          estatus: pedido.estatus,
          montoTotal: parseFloat(pedido.montototal),
          costoEnvio:
            pedido.costoenvio !== null ? parseFloat(pedido.costoenvio) : null,
          cliente: {
            nombre: `${pedido.clientenombre} ${pedido.clienteapellido}`,
            email: pedido.clienteemail,
            telefono: pedido.clientetelefono,
          },
          agente: pedido.agentenombre
            ? {
                nombre: `${pedido.agentenombre} ${pedido.agenteapellido}`,
                codigo: pedido.codigoagente,
              }
            : null,
          direccion: {
            calle: pedido.calle,
            numeroExterior: pedido.numeroext,
            numeroInterior: pedido.numeroint,
            colonia: pedido.colonia,
            ciudad: pedido.ciudad,
            estadoId:
              pedido.estadoid !== null ? parseInt(pedido.estadoid, 10) : null,
            estado: pedido.estadonombre || null,
            estadoNombre: pedido.estadonombre || null,
            estadoAbreviatura: pedido.estadoabreviatura || null,
            codigoPostal: pedido.codigopostal,
            referencias: pedido.referencias,
          },
        },
        productos: detallesResult.rows.map((row) => {
          // Extraer piezasPorPaquete del tamano_info JSON
          const tamanoInfo = row.tamano_info || {};
          const piezasPorPaquete =
            tamanoInfo.valor ||
            tamanoInfo.cantidad ||
            tamanoInfo.piezas ||
            tamanoInfo.piezasporpaquete ||
            tamanoInfo.numeropiezas ||
            null;

          return {
            detalleId: row.detalleid,
            productoId: row.productoid,
            varianteId: row.varianteid,
            nombre: row.nombreproducto,
            sku: row.sku,
            cantidadPaquetes: parseInt(row.cantidadpaquetes, 10),
            piezasPorPaquete,
            precioPorPaquete: row.precioporpaquete
              ? parseFloat(row.precioporpaquete)
              : 0,
            precioUnitario: row.preciounitariocalculado
              ? parseFloat(row.preciounitariocalculado)
              : 0,
            piezasTotales: parseInt(row.piezastotales, 10),
            dimensiones: row.dimensiones || null,
            subtotal: row.precioporpaquete
              ? parseFloat((row.cantidadpaquetes || 0) * row.precioporpaquete)
              : 0,
          };
        }),
      },
    });
  } catch (error) {
    console.error("Error al obtener detalle del pedido:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * ============================================
 * GESTIÓN DE PROVEEDORES
 * ============================================
 */

/**
 * Obtener todos los proveedores (reales + pendientes de creación)
 * GET /api/admin/proveedores
 */
const getAllProveedores = async (req, res) => {
  try {
    const query = `
      SELECT 
        ProveedorID,
        NombreEmpresa,
        ContactoNombre,
        Email,
        Telefono,
        RazonSocial,
        RFC,
        RegimenFiscal,
        Calle,
        Colonia,
        CodigoPostal,
        Ciudad,
        Estado,
        NombreRepresentanteVentas,
        CelularVentas,
        EmailVentas,
        NombreContactoCobranza,
        TelefonoCobranza,
        EmailCobranza,
        Banco,
        NumeroCuenta,
        CLABE,
        ReferenciaPago,
        DiasCredito,
        LimiteCredito,
        DescuentoFinanciero,
        MinimoCompra,
        AceptaDevoluciones
      FROM Proveedores
      ORDER BY NombreEmpresa ASC
    `;

    const result = await db.query(query);
    const proveedores = result.rows;

    res.json({
      success: true,
      message: "Proveedores obtenidos exitosamente",
      data: {
        proveedores,
        total: proveedores.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener proveedores:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener proveedores",
    });
  }
};

/**
 * Crear un nuevo proveedor
 * POST /api/admin/proveedores
 */
const crearProveedor = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const {
      nombreEmpresa,
      contactoNombre,
      email,
      telefono,
      razonSocial,
      rfc,
      regimenFiscal,
      calle,
      colonia,
      cp,
      ciudad,
      estado,
      nombreRepresentanteVentas,
      celularVentas,
      emailVentas,
      nombreContactoCobranza,
      telefonoCobranza,
      emailCobranza,
      banco,
      numeroCuenta,
      clabe,
      referenciaPago,
      diasCredito,
      limiteCredito,
      descuentoFinanciero,
      minimoCompra,
      aceptaDevoluciones,
    } = req.body;

    const reglasEmpaqueInput = normalizeReglasEmpaqueInput(req.body?.reglasEmpaque);

    // Helper function to convert empty strings to NULL
    const toNullIfEmpty = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string" && value.trim() === "") return null;
      return typeof value === "string" ? value.trim() : value;
    };

    // Validaciones
    if (!nombreEmpresa || nombreEmpresa.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "El nombre de la empresa es requerido",
      });
    }

    // Validar email principal si se proporciona
    if (email && email.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "El email no tiene un formato válido",
        });
      }
    }

    // Validar email de ventas si se proporciona
    if (emailVentas && emailVentas.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailVentas)) {
        return res.status(400).json({
          success: false,
          message: "El email de ventas no tiene un formato válido",
        });
      }
    }

    // Validar email de cobranza si se proporciona
    if (emailCobranza && emailCobranza.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailCobranza)) {
        return res.status(400).json({
          success: false,
          message: "El email de cobranza no tiene un formato válido",
        });
      }
    }

    const datosNuevosProveedor = {
      NombreEmpresa: nombreEmpresa.trim(),
      ContactoNombre: toNullIfEmpty(contactoNombre),
      Email: toNullIfEmpty(email),
      Telefono: toNullIfEmpty(telefono),
      RazonSocial: toNullIfEmpty(razonSocial),
      RFC: toNullIfEmpty(rfc),
      RegimenFiscal: toNullIfEmpty(regimenFiscal),
      Calle: toNullIfEmpty(calle),
      Colonia: toNullIfEmpty(colonia),
      CodigoPostal: toNullIfEmpty(cp),
      Ciudad: toNullIfEmpty(ciudad),
      Estado: toNullIfEmpty(estado),
      NombreRepresentanteVentas: toNullIfEmpty(nombreRepresentanteVentas),
      CelularVentas: toNullIfEmpty(celularVentas),
      EmailVentas: toNullIfEmpty(emailVentas),
      NombreContactoCobranza: toNullIfEmpty(nombreContactoCobranza),
      TelefonoCobranza: toNullIfEmpty(telefonoCobranza),
      EmailCobranza: toNullIfEmpty(emailCobranza),
      Banco: toNullIfEmpty(banco),
      NumeroCuenta: toNullIfEmpty(numeroCuenta),
      CLABE: toNullIfEmpty(clabe),
      ReferenciaPago: toNullIfEmpty(referenciaPago),
      DiasCredito: diasCredito ? parseInt(diasCredito) : null,
      LimiteCredito: limiteCredito ? parseFloat(limiteCredito) : null,
      DescuentoFinanciero: toNullIfEmpty(descuentoFinanciero),
      MinimoCompra: toNullIfEmpty(minimoCompra),
      AceptaDevoluciones:
        aceptaDevoluciones !== undefined ? Boolean(aceptaDevoluciones) : null,
    };

    await client.query("BEGIN");

    const insertRes = await client.query(
      `INSERT INTO proveedores (
        nombreempresa,
        contactonombre,
        email,
        telefono,
        razonsocial,
        rfc,
        regimenfiscal,
        calle,
        colonia,
        codigopostal,
        ciudad,
        estado,
        nombrerepresentanteventas,
        celularventas,
        emailventas,
        nombrecontactocobranza,
        telefonocobranza,
        emailcobranza,
        banco,
        numerocuenta,
        clabe,
        referenciapago,
        diascredito,
        limitecredito,
        descuentofinanciero,
        minimocompra,
        aceptadevoluciones
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
      ) RETURNING *`,
      [
        datosNuevosProveedor.NombreEmpresa,
        datosNuevosProveedor.ContactoNombre,
        datosNuevosProveedor.Email,
        datosNuevosProveedor.Telefono,
        datosNuevosProveedor.RazonSocial,
        datosNuevosProveedor.RFC,
        datosNuevosProveedor.RegimenFiscal,
        datosNuevosProveedor.Calle,
        datosNuevosProveedor.Colonia,
        datosNuevosProveedor.CodigoPostal,
        datosNuevosProveedor.Ciudad,
        datosNuevosProveedor.Estado,
        datosNuevosProveedor.NombreRepresentanteVentas,
        datosNuevosProveedor.CelularVentas,
        datosNuevosProveedor.EmailVentas,
        datosNuevosProveedor.NombreContactoCobranza,
        datosNuevosProveedor.TelefonoCobranza,
        datosNuevosProveedor.EmailCobranza,
        datosNuevosProveedor.Banco,
        datosNuevosProveedor.NumeroCuenta,
        datosNuevosProveedor.CLABE,
        datosNuevosProveedor.ReferenciaPago,
        datosNuevosProveedor.DiasCredito,
        datosNuevosProveedor.LimiteCredito,
        datosNuevosProveedor.DescuentoFinanciero,
        datosNuevosProveedor.MinimoCompra,
        datosNuevosProveedor.AceptaDevoluciones,
      ]
    );

    const row = insertRes.rows[0];

    const eventosAuditoria = [];
    for (const regla of reglasEmpaqueInput) {
      const tipoId = regla.tipoProductoId;
      const cantidad = regla.piezasPorPaquete;
      const reglaid = await upsertReglaEmpaque(client, row.proveedorid, tipoId, cantidad);

      eventosAuditoria.push({
        tipoCambio: "INSERT",
        entidadId: reglaid,
        datosAnteriores: null,
        datosNuevos: {
          proveedorid: row.proveedorid,
          tipoproductoid: tipoId,
          cantidadempaque: cantidad,
        },
      });
    }

    await client.query("COMMIT");

    try {
      await auditService.registrarCambioPasivo(
        req,
        "proveedores",
        row.proveedorid,
        "INSERT",
        null,
        row
      );
    } catch (e) {
      // no bloquear
    }

    if (eventosAuditoria.length) {
      await registrarAuditoriaReglasEmpaque(client, req, eventosAuditoria);

      const usuarioNombre = [req?.user?.nombre, req?.user?.apellido]
        .filter((x) => String(x || "").trim().length)
        .join(" ") || "Usuario";

      try {
        await notifySuperAdmins(client, {
          tipo: "sistema",
          prioridad: "media",
          titulo: "Reglas de Empaque Actualizadas",
          mensaje: `El usuario ${usuarioNombre} modificó reglas de empaque para ${row.nombreempresa}. Ver bitácora.`,
          url: "/admin-bitacora.html",
          metadata: {
            proveedorId: row.proveedorid,
            proveedorNombre: row.nombreempresa,
            cambios: eventosAuditoria.map((e) => ({
              tipoCambio: e.tipoCambio,
              datosNuevos: e.datosNuevos,
            })),
          },
        });
      } catch (e) {
        // no bloquear
      }
    }

    return res.status(201).json({
      success: true,
      message: "Proveedor creado correctamente.",
      data: {
        proveedorId: row.proveedorid,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error al crear proveedor:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear el proveedor",
    });
  }
  finally {
    client.release();
  }
};

/**
 * Actualizar un proveedor existente
 * PUT /api/admin/proveedores/:id
 */
const actualizarProveedor = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const proveedorId = parseInt(req.params.id);
    const {
      nombreEmpresa,
      contactoNombre,
      email,
      telefono,
      razonSocial,
      rfc,
      regimenFiscal,
      calle,
      colonia,
      cp,
      ciudad,
      estado,
      nombreRepresentanteVentas,
      celularVentas,
      emailVentas,
      nombreContactoCobranza,
      telefonoCobranza,
      emailCobranza,
      banco,
      numeroCuenta,
      clabe,
      referenciaPago,
      diasCredito,
      limiteCredito,
      descuentoFinanciero,
      minimoCompra,
      aceptaDevoluciones,
    } = req.body;

    const reglasEmpaqueInput = normalizeReglasEmpaqueInput(req.body?.reglasEmpaque);

    // Helper function to convert empty strings to NULL
    const toNullIfEmpty = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string" && value.trim() === "") return null;
      return typeof value === "string" ? value.trim() : value;
    };

    // Validaciones
    if (!nombreEmpresa || nombreEmpresa.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "El nombre de la empresa es requerido",
      });
    }

    // Validar email principal si se proporciona
    if (email && email.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "El email no tiene un formato válido",
        });
      }
    }

    // Validar email de ventas si se proporciona
    if (emailVentas && emailVentas.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailVentas)) {
        return res.status(400).json({
          success: false,
          message: "El email de ventas no tiene un formato válido",
        });
      }
    }

    // Validar email de cobranza si se proporciona
    if (emailCobranza && emailCobranza.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailCobranza)) {
        return res.status(400).json({
          success: false,
          message: "El email de cobranza no tiene un formato válido",
        });
      }
    }

    // Verificar que el proveedor existe y obtener snapshot actual
    const checkQuery =
      "SELECT * FROM Proveedores WHERE ProveedorID = $1";
    const checkResult = await client.query(checkQuery, [proveedorId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const proveedorActual = checkResult.rows[0];

    const proveedorNombreActual = proveedorActual?.nombreempresa || "Proveedor";

    await client.query("BEGIN");

    const reglasActuales = await getReglasEmpaqueProveedorSnapshot(client, proveedorId);

    const datosNuevosProveedor = {
      NombreEmpresa: nombreEmpresa.trim(),
      ContactoNombre: toNullIfEmpty(contactoNombre),
      Email: toNullIfEmpty(email),
      Telefono: toNullIfEmpty(telefono),
      RazonSocial: toNullIfEmpty(razonSocial),
      RFC: toNullIfEmpty(rfc),
      RegimenFiscal: toNullIfEmpty(regimenFiscal),
      Calle: toNullIfEmpty(calle),
      Colonia: toNullIfEmpty(colonia),
      CodigoPostal: toNullIfEmpty(cp),
      Ciudad: toNullIfEmpty(ciudad),
      Estado: toNullIfEmpty(estado),
      NombreRepresentanteVentas: toNullIfEmpty(nombreRepresentanteVentas),
      CelularVentas: toNullIfEmpty(celularVentas),
      EmailVentas: toNullIfEmpty(emailVentas),
      NombreContactoCobranza: toNullIfEmpty(nombreContactoCobranza),
      TelefonoCobranza: toNullIfEmpty(telefonoCobranza),
      EmailCobranza: toNullIfEmpty(emailCobranza),
      Banco: toNullIfEmpty(banco),
      NumeroCuenta: toNullIfEmpty(numeroCuenta),
      CLABE: toNullIfEmpty(clabe),
      ReferenciaPago: toNullIfEmpty(referenciaPago),
      DiasCredito: diasCredito ? parseInt(diasCredito) : null,
      LimiteCredito: limiteCredito ? parseFloat(limiteCredito) : null,
      DescuentoFinanciero: toNullIfEmpty(descuentoFinanciero),
      MinimoCompra: toNullIfEmpty(minimoCompra),
      AceptaDevoluciones:
        aceptaDevoluciones !== undefined ? Boolean(aceptaDevoluciones) : null,
    };

    const updateRes = await client.query(
      `UPDATE proveedores
       SET nombreempresa = $1,
           contactonombre = $2,
           email = $3,
           telefono = $4,
           razonsocial = $5,
           rfc = $6,
           regimenfiscal = $7,
           calle = $8,
           colonia = $9,
           codigopostal = $10,
           ciudad = $11,
           estado = $12,
           nombrerepresentanteventas = $13,
           celularventas = $14,
           emailventas = $15,
           nombrecontactocobranza = $16,
           telefonocobranza = $17,
           emailcobranza = $18,
           banco = $19,
           numerocuenta = $20,
           clabe = $21,
           referenciapago = $22,
           diascredito = $23,
           limitecredito = $24,
           descuentofinanciero = $25,
           minimocompra = $26,
           aceptadevoluciones = $27
       WHERE proveedorid = $28
       RETURNING *`,
      [
        datosNuevosProveedor.NombreEmpresa,
        datosNuevosProveedor.ContactoNombre,
        datosNuevosProveedor.Email,
        datosNuevosProveedor.Telefono,
        datosNuevosProveedor.RazonSocial,
        datosNuevosProveedor.RFC,
        datosNuevosProveedor.RegimenFiscal,
        datosNuevosProveedor.Calle,
        datosNuevosProveedor.Colonia,
        datosNuevosProveedor.CodigoPostal,
        datosNuevosProveedor.Ciudad,
        datosNuevosProveedor.Estado,
        datosNuevosProveedor.NombreRepresentanteVentas,
        datosNuevosProveedor.CelularVentas,
        datosNuevosProveedor.EmailVentas,
        datosNuevosProveedor.NombreContactoCobranza,
        datosNuevosProveedor.TelefonoCobranza,
        datosNuevosProveedor.EmailCobranza,
        datosNuevosProveedor.Banco,
        datosNuevosProveedor.NumeroCuenta,
        datosNuevosProveedor.CLABE,
        datosNuevosProveedor.ReferenciaPago,
        datosNuevosProveedor.DiasCredito,
        datosNuevosProveedor.LimiteCredito,
        datosNuevosProveedor.DescuentoFinanciero,
        datosNuevosProveedor.MinimoCompra,
        datosNuevosProveedor.AceptaDevoluciones,
        proveedorId,
      ]
    );

    if (!updateRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const row = updateRes.rows[0];

    const eventosAuditoria = [];
    for (const regla of reglasEmpaqueInput) {
      const tipoId = regla.tipoProductoId;
      const cantidadNueva = regla.piezasPorPaquete;

      const anterior = reglasActuales.get(tipoId) || null;
      if (anterior && anterior.cantidad === cantidadNueva) {
        continue;
      }

      const reglaid = await upsertReglaEmpaque(client, proveedorId, tipoId, cantidadNueva);

      if (!anterior) {
        eventosAuditoria.push({
          tipoCambio: "INSERT",
          entidadId: reglaid,
          datosAnteriores: null,
          datosNuevos: {
            proveedorid: proveedorId,
            tipoproductoid: tipoId,
            cantidadempaque: cantidadNueva,
          },
        });
      } else {
        eventosAuditoria.push({
          tipoCambio: "UPDATE",
          entidadId: anterior.reglaid ?? reglaid,
          datosAnteriores: {
            proveedorid: proveedorId,
            tipoproductoid: tipoId,
            cantidadempaque: anterior.cantidad,
          },
          datosNuevos: {
            proveedorid: proveedorId,
            tipoproductoid: tipoId,
            cantidadempaque: cantidadNueva,
          },
        });
      }
    }

    await client.query("COMMIT");

    try {
      await auditService.registrarCambioPasivo(
        req,
        "proveedores",
        proveedorId,
        "UPDATE",
        proveedorActual,
        row
      );
    } catch (e) {
      // no bloquear
    }

    if (eventosAuditoria.length) {
      await registrarAuditoriaReglasEmpaque(client, req, eventosAuditoria);

      const usuarioNombre = [req?.user?.nombre, req?.user?.apellido]
        .filter((x) => String(x || "").trim().length)
        .join(" ") || "Usuario";

      try {
        await notifySuperAdmins(client, {
          tipo: "sistema",
          prioridad: "media",
          titulo: "Reglas de Empaque Actualizadas",
          mensaje: `El usuario ${usuarioNombre} modificó reglas de empaque para ${proveedorNombreActual}. Ver bitácora.`,
          url: "/admin-bitacora.html",
          metadata: {
            proveedorId,
            proveedorNombre: proveedorNombreActual,
            cambios: eventosAuditoria.map((e) => ({
              tipoCambio: e.tipoCambio,
              datosNuevos: e.datosNuevos,
            })),
          },
        });
      } catch (e) {
        // no bloquear
      }
    }

    return res.json({
      success: true,
      message: "Proveedor actualizado correctamente.",
      data: {
        proveedorId,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error al actualizar proveedor:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar el proveedor",
    });
  }
  finally {
    client.release();
  }
};

/**
 * ============================================
 * GESTIÓN DE ÓRDENES DE COMPRA
 * ============================================
 */

/**
 * Conteo Ciego: Listar órdenes de compra pendientes/parciales
 * GET /api/admin/compras/pendientes
 */
const getComprasPendientes = async (req, res) => {
  try {
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
       WHERE oc.estatus IN ('Pendiente', 'Parcial')
       GROUP BY oc.ordencompraid, oc.proveedorid, oc.fechacreacion, oc.fechaentregaesperada, oc.estatus, p.nombreempresa
       ORDER BY oc.fechacreacion DESC`
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
    console.error("Error al obtener compras pendientes:", error);
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
    console.error("Error al obtener detalle ciego de OC:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener detalle de la orden",
    });
  }
};

/**
 * Conteo Ciego: Validar recepción y aplicar inventario si coincide
 * POST /api/admin/compras/:id/validar-recepcion
 * Body: { conteos: [{ varianteId, cantidadContada }] }
 */
const validarRecepcionCompra = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const ordenCompraId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden de compra inválido",
      });
    }

    const conteos = Array.isArray(req.body?.conteos) ? req.body.conteos : [];
    if (!conteos.length) {
      return res.status(400).json({
        success: false,
        message: "Debes enviar conteos",
      });
    }

    // Normalizar conteos en Map (varianteId -> cantidadContada)
    const conteosMap = new Map();
    for (const c of conteos) {
      const varianteId = Number.parseInt(c?.varianteId, 10);
      const cantidadContada = Number.parseInt(c?.cantidadContada, 10);
      if (!Number.isInteger(varianteId) || varianteId <= 0) {
        return res.status(400).json({
          success: false,
          message: "conteos contiene varianteId inválido",
        });
      }
      if (!Number.isInteger(cantidadContada) || cantidadContada < 0) {
        return res.status(400).json({
          success: false,
          message: "conteos contiene cantidadContada inválida",
        });
      }
      conteosMap.set(varianteId, cantidadContada);
    }

    await client.query("BEGIN");

    const ordenLock = await client.query(
      "SELECT OrdenCompraID, Estatus FROM OrdenesDeCompra WHERE OrdenCompraID = $1 FOR UPDATE",
      [ordenCompraId]
    );

    if (!ordenLock.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const estatus = (ordenLock.rows[0].estatus || "").toString().trim();
    if (!['Pendiente', 'Parcial'].includes(estatus)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `La orden no se puede recepcionar en estatus '${estatus || "(vacío)"}'`,
      });
    }

    const detalles = await client.query(
      `SELECT
         doc.detalleoc_id,
         doc.varianteid,
         doc.cantidadsolicitada,
         doc.cantidadrecibida,
         doc.piezasporpaquete,
         pv.sku,
         pr.nombreproducto
       FROM detallesordencompra doc
       INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
       INNER JOIN productos pr ON pv.productoid = pr.productoid
       WHERE doc.ordencompraid = $1
       FOR UPDATE`,
      [ordenCompraId]
    );

    if (!detalles.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "La orden no tiene productos",
      });
    }

    // Validación de discrepancias (no tocar inventario si algo no coincide)
    for (const row of detalles.rows) {
      const varianteId = Number.parseInt(row.varianteid, 10);
      const solicitado = Number.parseInt(row.cantidadsolicitada, 10) || 0;
      const recibido = Number.parseInt(row.cantidadrecibida, 10) || 0;
      const pendiente = Math.max(solicitado - recibido, 0);

      if (pendiente === 0) {
        continue;
      }

      if (!conteosMap.has(varianteId)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: `Discrepancia en ${row.nombreproducto}: Esperado ${pendiente}, Contado 0`,
          data: {
            varianteId,
            sku: row.sku,
            producto: row.nombreproducto,
            esperado: pendiente,
            contado: 0,
          },
        });
      }

      const contado = conteosMap.get(varianteId);
      if (contado !== pendiente) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: `Discrepancia en ${row.nombreproducto}: Esperado ${pendiente}, Contado ${contado}`,
          data: {
            varianteId,
            sku: row.sku,
            producto: row.nombreproducto,
            esperado: pendiente,
            contado,
          },
        });
      }
    }

    // Si todo coincide, aplicamos recepción completa de lo pendiente
    const movimientos = [];

    for (const row of detalles.rows) {
      const solicitado = Number.parseInt(row.cantidadsolicitada, 10) || 0;
      const recibido = Number.parseInt(row.cantidadrecibida, 10) || 0;
      const pendiente = Math.max(solicitado - recibido, 0);
      if (pendiente === 0) continue;

      const piezasPorPaqueteParsed = Number.parseInt(row.piezasporpaquete, 10);
      const piezasPorPaquete =
        Number.isInteger(piezasPorPaqueteParsed) && piezasPorPaqueteParsed > 0
          ? piezasPorPaqueteParsed
          : 1;

      const cantidadAumentar = pendiente * piezasPorPaquete;
      const motivo = `Recepción Blindada OC #${ordenCompraId} (${pendiente} paquete${pendiente === 1 ? "" : "s"} x ${piezasPorPaquete} piezas)`;

      await inventoryService.registrarMovimiento(client, {
        varianteId: row.varianteid,
        cantidadDelta: cantidadAumentar,
        motivo,
        usuarioId: req.user.id,
        esExcepcion: false,
      });

      await client.query(
        `UPDATE DetallesOrdenCompra
         SET CantidadRecibida = CantidadRecibida + $1
         WHERE DetalleOC_ID = $2 AND OrdenCompraID = $3`,
        [pendiente, row.detalleoc_id, ordenCompraId]
      );

      movimientos.push({
        detalleId: row.detalleoc_id,
        varianteId: row.varianteid,
        sku: row.sku,
        producto: row.nombreproducto,
        cantidadContada: pendiente,
        piezasPorPaquete,
        unidadesAgregadas: cantidadAumentar,
      });
    }

    await client.query(
      "UPDATE OrdenesDeCompra SET Estatus = 'Completada' WHERE OrdenCompraID = $1",
      [ordenCompraId]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Recepción perfecta (Conteo Ciego): inventario actualizado",
      data: {
        ordenCompraId,
        movimientos,
        estatus: "Completada",
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error en validarRecepcionCompra:", error);
    const status = error && Number.isInteger(error.status) ? error.status : 500;
    return res.status(status).json({
      success: false,
      message: error.message || "Error al validar recepción",
      error: error.message,
      code: error.code,
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener todas las órdenes de compra (con filtro por estatus)
 * GET /api/admin/ordenes-compra
 */
const getAllOrdenesCompra = async (req, res) => {
  try {
    const { estatus } = req.query;

    // DEBUG: Ver todas las órdenes primero
    const debugQuery = await db.query(`
      SELECT OrdenCompraID, OrigenOC, Estatus 
      FROM OrdenesDeCompra 
      ORDER BY FechaCreacion DESC 
      LIMIT 10
    `);
    console.log("🔍 DEBUG - Todas las órdenes recientes:", debugQuery.rows);

    let query = `
      SELECT 
        oc.OrdenCompraID,
        oc.ProveedorID,
        oc.FechaCreacion,
        oc.FechaEntregaEsperada,
        oc.Estatus,
        oc.OrigenOC,
        p.NombreEmpresa as ProveedorNombre,
        COUNT(doc.DetalleOC_ID) as TotalProductos
      FROM OrdenesDeCompra oc
      INNER JOIN Proveedores p ON oc.ProveedorID = p.ProveedorID
      LEFT JOIN DetallesOrdenCompra doc ON oc.OrdenCompraID = doc.OrdenCompraID
      WHERE 1=1
    `;

    const values = [];

    // Filtrar por estatus si se proporciona (además del filtro de backorder)
    if (estatus) {
      if (estatus === "Pendiente,Parcial") {
        query += ` AND oc.Estatus IN ('Pendiente', 'Parcial')`;
      } else {
        query += ` AND oc.Estatus = $1`;
        values.push(estatus);
      }
    }

    query += `
      GROUP BY oc.OrdenCompraID, oc.ProveedorID, oc.FechaCreacion, 
               oc.FechaEntregaEsperada, oc.Estatus, oc.OrigenOC, p.NombreEmpresa
      ORDER BY oc.FechaCreacion DESC
    `;

    const result = await db.query(query, values);

    console.log(
      "🔍 DEBUG - Órdenes de backorder encontradas:",
      result.rows.length
    );
    console.log("🔍 DEBUG - Filtro estatus:", estatus);

    res.json({
      success: true,
      message: "Órdenes de compra de backorder obtenidas exitosamente",
      data: {
        ordenes: result.rows.map((row) => ({
          ordenCompraId: row.ordencompraid,
          proveedorId: row.proveedorid,
          proveedorNombre: row.proveedornombre,
          fechaCreacion: row.fechacreacion,
          fechaEntregaEsperada: row.fechaentregaesperada,
          estatus: row.estatus,
          origenOC: row.origenoc,
          totalProductos: parseInt(row.totalproductos),
        })),
        total: result.rows.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener órdenes de compra:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener órdenes de compra",
    });
  }
};

/**
 * Obtener detalles de una orden de compra específica
 * GET /api/admin/ordenes-compra/:id/detalles
 */
const getDetallesOrdenCompra = async (req, res) => {
  try {
    const ordenCompraId = parseInt(req.params.id);

    // Obtener información de la orden
    const ordenQuery = `
      SELECT 
        oc.ordencompraid,
        oc.proveedorid,
        oc.fechacreacion,
        oc.fechaentregaesperada,
        oc.estatus,
        p.nombreempresa as proveedornombre,
        p.contactonombre as proveedorcontacto
      FROM ordenesdecompra oc
      INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
      WHERE oc.ordencompraid = $1
    `;

    const ordenResult = await db.query(ordenQuery, [ordenCompraId]);

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenResult.rows[0];

    // Obtener detalles de productos
    const detallesQuery = `
      SELECT 
        doc.detalleoc_id,
        doc.ordencompraid,
        doc.varianteid,
        doc.cantidadsolicitada,
        doc.cantidadrecibida,
        doc.piezasporpaquete,
        pv.productoid,
        pv.sku,
        pv.dimensiones,
        pv.medidaid,
        COALESCE(pv.stock, 0) AS stockvariante,
        pr.nombreproducto
      FROM detallesordencompra doc
      INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
      INNER JOIN productos pr ON pv.productoid = pr.productoid
      WHERE doc.ordencompraid = $1
      ORDER BY pr.nombreproducto ASC
    `;

    const detallesResult = await db.query(detallesQuery, [ordenCompraId]);

    res.json({
      success: true,
      message: "Detalles obtenidos exitosamente",
      data: {
        orden: {
          ordenCompraId: orden.ordencompraid,
          proveedorId: orden.proveedorid,
          proveedorNombre: orden.proveedornombre,
          proveedorContacto: orden.proveedorcontacto,
          fechaCreacion: orden.fechacreacion,
          fechaEntregaEsperada: orden.fechaentregaesperada,
          estatus: orden.estatus,
        },
        detalles: detallesResult.rows.map((row) => ({
          detalleId: row.detalleoc_id,
          ordenCompraId: row.ordencompraid,
          varianteId: row.varianteid,
          productoId: row.productoid,
          nombreProducto: row.nombreproducto,
          sku: row.sku,
          dimensiones: row.dimensiones,
          medidaId: row.medidaid,
          cantidadSolicitada: row.cantidadsolicitada,
          cantidadRecibida: row.cantidadrecibida,
          cantidadPendiente: row.cantidadsolicitada - row.cantidadrecibida,
          stockVariante: row.stockvariante,
          piezasPorPaquete: (() => {
            const parsed = Number.parseInt(row.piezasporpaquete, 10);
            return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
          })(),
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener detalles de orden de compra:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener detalles de la orden de compra",
    });
  }
};

/**
 * Recibir inventario de una orden de compra
 * POST /api/admin/ordenes-compra/recibir
 */
const recibirInventario = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { ordenCompraId, productos, adminId, discrepancias } = req.body;
    const usuarioRecibeId = Number.parseInt(req?.user?.id ?? req?.user?.userId, 10);

    // Validaciones
    if (!ordenCompraId) {
      return res.status(400).json({
        success: false,
        message: "El ID de la orden de compra es requerido",
      });
    }

    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debe incluir al menos un producto para recibir",
      });
    }

    const discrepanciasArray = Array.isArray(discrepancias) ? discrepancias : [];
    const discrepanciasByDetalle = new Map(
      discrepanciasArray
        .map((d) => {
          const detalleId = Number.parseInt(d?.detalleId, 10);
          if (!Number.isInteger(detalleId) || detalleId <= 0) return null;
          return [detalleId, d];
        })
        .filter(Boolean)
    );

    // Validar cada producto
    for (const producto of productos) {
      if (!producto.detalleId || producto.cantidadRecibidaAhora === undefined) {
        return res.status(400).json({
          success: false,
          message: "Cada producto debe tener detalleId y cantidadRecibidaAhora",
        });
      }

      if (producto.cantidadRecibidaAhora < 0) {
        return res.status(400).json({
          success: false,
          message: "La cantidad recibida no puede ser negativa",
        });
      }
    }

    // Iniciar transacción
    await client.query("BEGIN");

    // Verificar que la orden existe
    const ordenCheck = await client.query(
      "SELECT OrdenCompraID, Estatus FROM OrdenesDeCompra WHERE OrdenCompraID = $1",
      [ordenCompraId]
    );

    if (ordenCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const estatusAnterior = (ordenCheck.rows[0].estatus || "").toString();
    const productosActualizados = [];
    const alertasSeguridad = [];

    // Procesar cada producto
    for (const producto of productos) {
      const cantidadRecibida = parseInt(producto.cantidadRecibidaAhora, 10);

      if (cantidadRecibida === 0) {
        continue; // Saltar si no se recibió nada
      }

      // 1. Obtener información del detalle actual
      const detalleQuery = `
        SELECT 
          doc.DetalleOC_ID,
          doc.VarianteID,
          doc.CantidadSolicitada,
          doc.CantidadRecibida,
          doc.PiezasPorPaquete,
          pv.ProductoID,
          pv.SKU,
          pv.Dimensiones,
          pv.MedidaID,
          pv.Stock AS StockVariante,
          pr.NombreProducto
        FROM DetallesOrdenCompra doc
        INNER JOIN Producto_Variantes pv ON doc.VarianteID = pv.VarianteID
        INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
        WHERE doc.DetalleOC_ID = $1 AND doc.OrdenCompraID = $2
      `;

      const detalleResult = await client.query(detalleQuery, [
        producto.detalleId,
        ordenCompraId,
      ]);

      if (detalleResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: `Detalle ${producto.detalleId} no encontrado en esta orden`,
        });
      }

      const detalle = detalleResult.rows[0];
      const nuevaCantidadRecibida = detalle.cantidadrecibida + cantidadRecibida;

      const pendienteEsperada = Number.parseInt(
        (detalle.cantidadsolicitada || 0) - (detalle.cantidadrecibida || 0),
        10
      );

      const piezasPorPaqueteRaw = detalle.piezasporpaquete;
      let piezasPorPaquete = Number.parseInt(piezasPorPaqueteRaw, 10);
      if (!Number.isInteger(piezasPorPaquete) || piezasPorPaquete <= 0) {
        piezasPorPaquete = 1;
      }

      const cantidadAumentar = cantidadRecibida * piezasPorPaquete;

      // Validar que no se exceda la cantidad solicitada
      if (nuevaCantidadRecibida > detalle.cantidadsolicitada) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: `No puede recibir más de lo solicitado para ${detalle.nombreproducto}. Solicitado: ${detalle.cantidadsolicitada}, Ya recibido: ${detalle.cantidadrecibida}`,
        });
      }

      // 2. Actualizar CantidadRecibida en DetallesOrdenCompra
      await client.query(
        `UPDATE DetallesOrdenCompra 
         SET CantidadRecibida = CantidadRecibida + $1 
         WHERE DetalleOC_ID = $2`,
        [cantidadRecibida, producto.detalleId]
      );

      // 3. Actualizar Stock en la variante seleccionada
      const nuevoStockVariante =
        (detalle.stockvariante || 0) + cantidadAumentar;
      await client.query(
        `UPDATE Producto_Variantes 
         SET Stock = COALESCE(Stock, 0) + $1 
         WHERE VarianteID = $2`,
        [cantidadAumentar, detalle.varianteid]
      );

      // 4. Registrar movimiento en Log_Inventario
      await client.query(
        `INSERT INTO Log_Inventario 
         (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          detalle.varianteid,
          cantidadAumentar,
          nuevoStockVariante,
          `Recepción de OC #${ordenCompraId} (${cantidadRecibida} paquete${
            cantidadRecibida === 1 ? "" : "s"
          } x ${piezasPorPaquete} piezas)` ,
          Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0
            ? usuarioRecibeId
            : adminId || null,
        ]
      );

      productosActualizados.push({
        productoId: detalle.productoid,
        varianteId: detalle.varianteid,
        nombreProducto: detalle.nombreproducto,
        sku: detalle.sku,
        medidaId: detalle.medidaid,
        dimensiones: detalle.dimensiones,
        cantidadRecibidaAhora: cantidadRecibida,
        piezasPorPaquete,
        cantidadAumentada: cantidadAumentar,
        cantidadRecibidaTotal: nuevaCantidadRecibida,
        cantidadSolicitada: detalle.cantidadsolicitada,
        stockVariante: nuevoStockVariante,
      });

      const discrepanciaInfo = discrepanciasByDetalle.get(producto.detalleId);
      if (
        discrepanciaInfo &&
        Number.isInteger(pendienteEsperada) &&
        pendienteEsperada >= 0 &&
        cantidadRecibida !== pendienteEsperada
      ) {
        const justificacion = (discrepanciaInfo?.justificacion || "")
          .toString()
          .trim();

        if (!justificacion) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message:
              "Discrepancia detectada: la justificación es obligatoria para guardar con diferencia",
          });
        }

        alertasSeguridad.push({
          ordenCompraId,
          detalleId: producto.detalleId,
          varianteId: detalle.varianteid,
          sku: detalle.sku,
          producto: detalle.nombreproducto,
          esperado: pendienteEsperada,
          recibido: cantidadRecibida,
          justificacion,
          evidenciaUrl: discrepanciaInfo?.evidenciaUrl || null,
          adminId:
            Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0
              ? usuarioRecibeId
              : adminId || null,
        });

        try {
          await client.query(
            `INSERT INTO alertas_seguridad
              (tipo, mensaje, metadata, creado_en)
             VALUES ($1, $2, $3, NOW())`,
            [
              "DISCREPANCIA_RECEPCION_OC",
              `Discrepancia de inventario detectada en OC #${ordenCompraId}`,
              JSON.stringify({
                ordenCompraId,
                detalleId: producto.detalleId,
                varianteId: detalle.varianteid,
                sku: detalle.sku,
                esperado: pendienteEsperada,
                recibido: cantidadRecibida,
                justificacion,
                evidenciaUrl: discrepanciaInfo?.evidenciaUrl || null,
                adminId:
                  Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0
                    ? usuarioRecibeId
                    : adminId || null,
              }),
            ]
          );
        } catch (e) {
          // Si la tabla no existe u otro error, no bloquear
        }
      }
    }

    // 5. Actualizar el Estatus de la OrdenDeCompra
    // Obtener suma total de solicitado vs recibido
    const estatusQuery = `
      SELECT 
        SUM(CantidadSolicitada) as TotalSolicitado,
        SUM(CantidadRecibida) as TotalRecibido
      FROM DetallesOrdenCompra
      WHERE OrdenCompraID = $1
    `;

    const estatusResult = await client.query(estatusQuery, [ordenCompraId]);
    const { totalsolicitado, totalrecibido } = estatusResult.rows[0];

    let nuevoEstatus;
    if (parseInt(totalrecibido) >= parseInt(totalsolicitado)) {
      nuevoEstatus = "Completada";
    } else if (parseInt(totalrecibido) > 0) {
      nuevoEstatus = "Parcial";
    } else {
      nuevoEstatus = "Pendiente";
    }

    await client.query(
      "UPDATE OrdenesDeCompra SET Estatus = $1 WHERE OrdenCompraID = $2",
      [nuevoEstatus, ordenCompraId]
    );

    let cuentaPorPagar = null;
    if (["Parcial", "Completada"].includes(nuevoEstatus)) {
      const usuarioId =
        Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0 ? usuarioRecibeId : null;
      cuentaPorPagar = await upsertCuentaPorPagarForOC(client, ordenCompraId, usuarioId);
    }

    if (alertasSeguridad.length > 0) {
      const resumen = alertasSeguridad
        .map((a) => `${a.sku}: esperado ${a.esperado}, recibido ${a.recibido}`)
        .join(" | ");

      await notifySuperAdmins(client, {
        titulo: `⚠️ Discrepancia de Inventario Detectada en OC #${ordenCompraId}`,
        mensaje: `Se detectó discrepancia en recepción. ${resumen}`,
        url: `/admin-recibir-inventario.html?ordenId=${ordenCompraId}`,
        metadata: {
          ordenCompraId,
          nuevoEstatus,
          alertas: alertasSeguridad,
        },
      });
    }

    // Commit de la transacción
    await client.query("COMMIT");

    try {
      await auditService.registrarCambioPasivo(
        req,
        "ordenesdecompra",
        ordenCompraId,
        "UPDATE",
        {
          estatus: estatusAnterior,
        },
        {
          estatus: nuevoEstatus,
          recibidoPor: Number.isInteger(usuarioRecibeId) ? usuarioRecibeId : null,
          productosActualizados,
        }
      );
    } catch (e) {
      // silencioso
    }

    console.log("✅ Inventario recibido:", {
      ordenCompraId,
      productosActualizados: productosActualizados.length,
      nuevoEstatus,
    });

    res.json({
      success: true,
      message: "Inventario recibido exitosamente",
      data: {
        ordenCompraId,
        nuevoEstatus,
        cuentaPorPagar,
        productosActualizados,
        alertasSeguridad,
        totalSolicitado: parseInt(totalsolicitado),
        totalRecibido: parseInt(totalrecibido),
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al recibir inventario:", error);
    res.status(500).json({
      success: false,
      message: "Error al recibir el inventario",
    });
  } finally {
    client.release();
  }
};

const recibirItemOrdenCompra = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const ordenCompraId = Number.parseInt(req.params.id, 10);
    const detalleId = Number.parseInt(req.body?.detalleId, 10);
    const varianteId = Number.parseInt(req.body?.varianteId, 10);
    const cantidadIngresada = Number.parseInt(req.body?.cantidadIngresada, 10);
    const usuarioRecibeId = Number.parseInt(req?.user?.id ?? req?.user?.userId, 10);

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden de compra inválido",
      });
    }
    if (!Number.isInteger(detalleId) || detalleId <= 0) {
      return res.status(400).json({
        success: false,
        message: "detalleId inválido",
      });
    }
    if (!Number.isInteger(varianteId) || varianteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "varianteId inválido",
      });
    }
    if (!Number.isInteger(cantidadIngresada) || cantidadIngresada <= 0) {
      return res.status(400).json({
        success: false,
        message: "cantidadIngresada inválida",
      });
    }

    await client.query("BEGIN");

    const ordenLock = await client.query(
      "SELECT OrdenCompraID, Estatus FROM OrdenesDeCompra WHERE OrdenCompraID = $1 FOR UPDATE",
      [ordenCompraId]
    );
    if (!ordenLock.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const estatusActual = (ordenLock.rows[0].estatus || "").toString().trim();
    if (!["Pendiente", "Parcial"].includes(estatusActual)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `La orden no se puede recepcionar en estatus '${estatusActual || "(vacío)"}'`,
      });
    }

    const detalleResult = await client.query(
      `SELECT 
         doc.DetalleOC_ID,
         doc.OrdenCompraID,
         doc.VarianteID,
         doc.CantidadSolicitada,
         doc.CantidadRecibida,
         doc.PiezasRecibidas,
         doc.PiezasPorPaquete,
         pv.ProductoID,
         pv.SKU,
         pv.Stock AS StockVariante,
         pr.NombreProducto
       FROM DetallesOrdenCompra doc
       INNER JOIN Producto_Variantes pv ON doc.VarianteID = pv.VarianteID
       INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
       WHERE doc.DetalleOC_ID = $1 AND doc.OrdenCompraID = $2
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
    const varianteIdDb = Number.parseInt(detalle.varianteid, 10);
    if (varianteIdDb !== varianteId) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "La variante no corresponde al detalle indicado",
      });
    }

    const solicitado = Number.parseInt(detalle.cantidadsolicitada, 10) || 0;
    const recibidoPiezasRaw = detalle.piezasrecibidas;
    const recibidoPiezas = Number.isInteger(Number.parseInt(recibidoPiezasRaw, 10))
      ? Number.parseInt(recibidoPiezasRaw, 10)
      : null;
    const piezasPorPaqueteParsed = Number.parseInt(detalle.piezasporpaquete, 10);
    const piezasPorPaquete =
      Number.isInteger(piezasPorPaqueteParsed) && piezasPorPaqueteParsed > 0
        ? piezasPorPaqueteParsed
        : 1;

    const solicitadoPzas = solicitado * piezasPorPaquete;
    const recibidoPzasActual =
      recibidoPiezas !== null ? recibidoPiezas : (Number.parseInt(detalle.cantidadrecibida, 10) || 0) * piezasPorPaquete;
    const nuevoRecibidoPzas = recibidoPzasActual + cantidadIngresada;
    if (nuevoRecibidoPzas > solicitadoPzas) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `No puede recibir más de lo solicitado para ${detalle.nombreproducto}. Solicitado: ${solicitadoPzas}, Ya recibido: ${recibidoPzasActual}`,
      });
    }

    await client.query(
      "UPDATE DetallesOrdenCompra SET PiezasRecibidas = COALESCE(PiezasRecibidas, 0) + $1 WHERE DetalleOC_ID = $2 AND OrdenCompraID = $3",
      [cantidadIngresada, detalleId, ordenCompraId]
    );

    const cantidadAumentar = cantidadIngresada;
    await client.query(
      "UPDATE Producto_Variantes SET Stock = COALESCE(Stock, 0) + $1 WHERE VarianteID = $2",
      [cantidadAumentar, varianteId]
    );

    const stockAnterior = Number.parseInt(detalle.stockvariante, 10) || 0;
    const nuevoStock = stockAnterior + cantidadAumentar;

    await client.query(
      `INSERT INTO Log_Inventario 
       (VarianteID, CantidadCambiado, NuevoStock, Motivo, UsuarioID) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        varianteId,
        cantidadAumentar,
        nuevoStock,
        `Recepción OC #${ordenCompraId}`,
        Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0 ? usuarioRecibeId : null,
      ]
    );

    const faltantesResult = await client.query(
      "SELECT COUNT(*)::int AS faltantes FROM DetallesOrdenCompra WHERE OrdenCompraID = $1 AND COALESCE(PiezasRecibidas, 0) < (CantidadSolicitada * COALESCE(NULLIF(PiezasPorPaquete, 0), 1))",
      [ordenCompraId]
    );

    const faltantes = Number.parseInt(faltantesResult.rows[0]?.faltantes, 10) || 0;
    const nuevoEstatusOC = faltantes === 0 ? "Completada" : "Parcial";

    await client.query(
      "UPDATE OrdenesDeCompra SET Estatus = $1 WHERE OrdenCompraID = $2",
      [nuevoEstatusOC, ordenCompraId]
    );

    let cuentaPorPagar = null;
    if (["Parcial", "Completada"].includes(nuevoEstatusOC)) {
      const usuarioId =
        Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0 ? usuarioRecibeId : null;
      cuentaPorPagar = await upsertCuentaPorPagarForOC(client, ordenCompraId, usuarioId);
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Item recibido correctamente",
      data: {
        ordenCompraId,
        estatusOC: nuevoEstatusOC,
        cuentaPorPagar,
        item: {
          detalleId,
          varianteId,
          sku: detalle.sku,
          nombreProducto: detalle.nombreproducto,
          cantidadSolicitada: solicitadoPzas,
          cantidadRecibida: nuevoRecibidoPzas,
          cantidadPendiente: Math.max(solicitadoPzas - nuevoRecibidoPzas, 0),
          piezasPorPaquete,
          stockVariante: nuevoStock,
        },
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error al recibir item de OC:", error);
    return res.status(500).json({
      success: false,
      message: "Error al recibir item de la orden de compra",
    });
  } finally {
    client.release();
  }
};

/**
 * Crear una nueva orden de compra
 * POST /api/admin/ordenes-compra
 */
const crearOrdenCompra = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const { proveedorId, fechaEntregaEsperada, productos } = req.body;

    // Validaciones
    if (!proveedorId) {
      return res.status(400).json({
        success: false,
        message: "El proveedor es requerido",
      });
    }

    if (!fechaEntregaEsperada) {
      return res.status(400).json({
        success: false,
        message: "La fecha de entrega esperada es requerida",
      });
    }

    if (!productos || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debe incluir al menos un producto",
      });
    }

    // Validar cada producto
    for (const producto of productos) {
      if (!producto.varianteId || !producto.cantidadSolicitada) {
        return res.status(400).json({
          success: false,
          message: "Cada producto debe tener varianteId y cantidadSolicitada",
        });
      }

      if (producto.cantidadSolicitada <= 0) {
        return res.status(400).json({
          success: false,
          message: "La cantidad solicitada debe ser mayor a 0",
        });
      }

      const piezasPorPaqueteParsed = Number.parseInt(
        producto.piezasPorPaquete ?? producto.piezasporpaquete ?? 1,
        10
      );
      if (!Number.isInteger(piezasPorPaqueteParsed) || piezasPorPaqueteParsed <= 0) {
        return res.status(400).json({
          success: false,
          message: "piezasPorPaquete inválido",
        });
      }

      const costoRaw =
        producto.costoUnitario ?? producto.costounitario ?? producto.costo_unitario;
      if (costoRaw !== undefined && costoRaw !== null && costoRaw !== "") {
        const costoParsed = Number.parseFloat(costoRaw);
        if (!Number.isFinite(costoParsed) || costoParsed < 0) {
          return res.status(400).json({
            success: false,
            message: "costoUnitario inválido",
          });
        }
      }
    }

    // Verificar que el proveedor existe
    const proveedorCheck = await client.query(
      "SELECT ProveedorID FROM Proveedores WHERE ProveedorID = $1",
      [proveedorId]
    );

    if (proveedorCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    // Iniciar transacción
    await client.query("BEGIN");

    // 1. Crear la orden de compra
    const ordenQuery = `
      INSERT INTO OrdenesDeCompra (ProveedorID, FechaEntregaEsperada, Estatus)
      VALUES ($1, $2, 'Pendiente')
      RETURNING OrdenCompraID, ProveedorID, FechaCreacion, FechaEntregaEsperada, Estatus
    `;

    const ordenResult = await client.query(ordenQuery, [
      proveedorId,
      fechaEntregaEsperada,
    ]);

    const ordenCompra = ordenResult.rows[0];
    const ordenCompraId = ordenCompra.ordencompraid;

    // 2. Insertar los detalles de la orden (productos)
    const detallesInsertados = [];

    let totalCents = 0;

    for (const producto of productos) {
      // Verificar que la variante existe
      const varianteResult = await client.query(
        `SELECT pv.VarianteID, pv.ProductoID, pv.SKU, pv.Dimensiones, pv.MedidaID, pv.CostoUnitario, pr.NombreProducto
         FROM Producto_Variantes pv
         INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
         WHERE pv.VarianteID = $1`,
        [producto.varianteId]
      );

      if (varianteResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: `Variante con ID ${producto.varianteId} no encontrada`,
        });
      }

      const variante = varianteResult.rows[0];

      if (producto.productoId && producto.productoId !== variante.productoid) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "La variante seleccionada no pertenece al producto indicado",
        });
      }

      const piezasPorPaquete = Number.parseInt(
        producto.piezasPorPaquete ?? producto.piezasporpaquete ?? 1,
        10
      );

      const costoUnitario = (() => {
        const costoRaw =
          producto.costoUnitario ?? producto.costounitario ?? producto.costo_unitario;
        const costoParsed = Number.parseFloat(costoRaw);
        if (Number.isFinite(costoParsed) && costoParsed >= 0) return costoParsed;
        const fallback = Number.parseFloat(variante.costounitario);
        if (Number.isFinite(fallback) && fallback >= 0) return fallback * piezasPorPaquete;
        return 0;
      })();

      const cantidadSolicitada = Number.parseInt(producto.cantidadSolicitada, 10);
      if (Number.isInteger(cantidadSolicitada) && cantidadSolicitada > 0) {
        totalCents += Math.round(costoUnitario * 100) * cantidadSolicitada;
      }

      const detalleQuery = `
        INSERT INTO DetallesOrdenCompra (OrdenCompraID, VarianteID, CantidadSolicitada, CantidadRecibida, PiezasPorPaquete, CostoUnitario)
        VALUES ($1, $2, $3, 0, $4, $5)
        RETURNING DetalleOC_ID, VarianteID, CantidadSolicitada, CantidadRecibida
      `;

      const detalleResult = await client.query(detalleQuery, [
        ordenCompraId,
        variante.varianteid,
        producto.cantidadSolicitada,
        piezasPorPaquete,
        costoUnitario,
      ]);

      detallesInsertados.push({
        detalleId: detalleResult.rows[0].detalleoc_id,
        varianteId: detalleResult.rows[0].varianteid,
        productoId: variante.productoid,
        nombreProducto: variante.nombreproducto,
        sku: variante.sku,
        medidaId: variante.medidaid,
        dimensiones: variante.dimensiones,
        cantidadSolicitada: detalleResult.rows[0].cantidadsolicitada,
        cantidadRecibida: detalleResult.rows[0].cantidadrecibida,
      });
    }

    const totalMonetario = totalCents / 100;
    await client.query("UPDATE OrdenesDeCompra SET Total = $1 WHERE OrdenCompraID = $2", [
      totalMonetario,
      ordenCompraId,
    ]);

    // Commit de la transacción
    await client.query("COMMIT");

    console.log("✅ Orden de compra creada:", {
      ordenCompraId,
      proveedorId,
      totalProductos: detallesInsertados.length,
    });

    res.status(201).json({
      success: true,
      message: "Orden de compra creada exitosamente",
      data: {
        ordenCompra: {
          ordenCompraId: ordenCompraId,
          proveedorId: ordenCompra.proveedorid,
          fechaCreacion: ordenCompra.fechacreacion,
          fechaEntregaEsperada: ordenCompra.fechaentregaesperada,
          estatus: ordenCompra.estatus,
        },
        detalles: detallesInsertados,
      },
    });
  } catch (error) {
    // Rollback en caso de error
    await client.query("ROLLBACK");
    console.error("Error al crear orden de compra:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear la orden de compra",
    });
  } finally {
    client.release();
  }
};

/**
 * Subir imagen para un producto
 * POST /api/admin/productos/:id/imagen
 * Middleware: upload.single('imagen')
 * 
 * NOTA: producto_imagenes.productoid es FK a productos.productoid
 */
const subirImagenProducto = async (req, res) => {
  const { id } = req.params;
  
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionó ningún archivo de imagen",
      });
    }

    // Validar que el producto maestro exista
    const productoResult = await db.query(
      `SELECT productoid FROM productos WHERE productoid = $1`,
      [id]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    // Generar la ruta relativa de la imagen
    const rutaImagen = `/uploads/${req.file.filename}`;

    // Verificar si ya existe una imagen principal (orden = 1)
    const existingImageResult = await db.query(
      `SELECT imagenid FROM producto_imagenes 
       WHERE productoid = $1 AND orden = 1`,
      [id]
    );

    let imagenResult;
    
    if (existingImageResult.rows.length > 0) {
      // Actualizar imagen principal existente
      imagenResult = await db.query(
        `UPDATE producto_imagenes 
         SET url_imagen = $2
         WHERE productoid = $1 AND orden = 1
         RETURNING imagenid, url_imagen`,
        [id, rutaImagen]
      );
    } else {
      // Insertar nueva imagen principal
      imagenResult = await db.query(
        `INSERT INTO producto_imagenes (productoid, url_imagen, orden)
         VALUES ($1, $2, 1)
         RETURNING imagenid, url_imagen`,
        [id, rutaImagen]
      );
    }

    console.log(`✅ Imagen guardada: producto ${id} -> ${rutaImagen}`);

    res.status(200).json({
      success: true,
      message: "Imagen subida exitosamente",
      data: {
        imagenId: imagenResult.rows[0].imagenid,
        rutaImagen: imagenResult.rows[0].url_imagen,
        urlCompleta: `${req.protocol}://${req.get("host")}${rutaImagen}`,
      },
    });
  } catch (error) {
    console.error(`❌ Error al subir imagen del producto ${id}:`, error.message);
    
    res.status(500).json({
      success: false,
      message: "Error al subir la imagen",
      error: error.message,
    });
  }
};

/**
 * Subir múltiples imágenes para un producto
 * POST /api/admin/productos/:id/imagenes
 * Middleware: upload.array('imagenes', 5)
 */
const subirImagenesProductoMultiple = async (req, res) => {
  const { id } = req.params;

  try {
    const archivos = (() => {
      if (Array.isArray(req.files)) {
        return req.files;
      }

      if (req.files && typeof req.files === "object") {
        const fromImagenes = Array.isArray(req.files.imagenes)
          ? req.files.imagenes
          : [];
        const fromImages = Array.isArray(req.files.images) ? req.files.images : [];
        return [...fromImagenes, ...fromImages];
      }

      return [];
    })();

    if (archivos.length > 12) {
      return res.status(400).json({
        success: false,
        message: "El límite máximo es de 12 imágenes por producto",
      });
    }

    if (!archivos.length) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionaron archivos de imagen",
      });
    }

    const productoResult = await db.query(
      `SELECT productoid FROM productos WHERE productoid = $1`,
      [id]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    const ordenResult = await db.query(
      `SELECT COALESCE(MAX(orden), 0) AS max_orden
       FROM producto_imagenes
       WHERE productoid = $1`,
      [id]
    );

    let nextOrden = Number.parseInt(ordenResult.rows[0]?.max_orden, 10);
    if (!Number.isFinite(nextOrden) || nextOrden < 0) {
      nextOrden = 0;
    }

    const imagenesGuardadas = [];

    for (const file of archivos) {
      if (!file || !file.filename) continue;

      const rutaImagen = `/uploads/${file.filename}`;
      nextOrden += 1;

      const insertResult = await db.query(
        `INSERT INTO producto_imagenes (productoid, url_imagen, textoalternativo, orden)
         VALUES ($1, $2, NULL, $3)
         RETURNING imagenid, url_imagen, textoalternativo, orden`,
        [id, rutaImagen, nextOrden]
      );

      imagenesGuardadas.push(insertResult.rows[0]);
    }

    if (!imagenesGuardadas.length) {
      return res.status(400).json({
        success: false,
        message: "No se pudieron guardar las imágenes proporcionadas",
      });
    }

    console.log(
      `✅ Imágenes guardadas para producto ${id}:`,
      imagenesGuardadas.map((img) => img.url_imagen)
    );

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    res.status(200).json({
      success: true,
      message: "Imágenes subidas exitosamente",
      data: {
        imagenes: imagenesGuardadas.map((img) => ({
          imagenId: img.imagenid,
          rutaImagen: img.url_imagen,
          urlCompleta: `${baseUrl}${img.url_imagen}`,
          textoAlternativo: img.textoalternativo || null,
          orden: img.orden,
        })),
      },
    });
  } catch (error) {
    console.error(
      `❌ Error al subir imágenes múltiples del producto ${id}:`,
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Error al subir las imágenes",
      error: error.message,
    });
  }
};

const getImagenesVariante = async (req, res) => {
  const { id } = req.params;
  const varianteId = Number.parseInt(id, 10);

  if (!Number.isInteger(varianteId) || varianteId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ID de variante inválido",
    });
  }

  try {
    const varianteResult = await db.query(
      "SELECT varianteid, url_imagen_variante FROM producto_variantes WHERE varianteid = $1",
      [varianteId]
    );

    if (!varianteResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const imagenesResult = await db.query(
      `SELECT imagenid, url_imagen, textoalternativo, orden
       FROM producto_variante_imagenes
       WHERE varianteid = $1
       ORDER BY orden ASC NULLS LAST, imagenid ASC`,
      [varianteId]
    );

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const imagenes = (imagenesResult.rows || []).map((row) => ({
      imagenId: row.imagenid,
      rutaImagen: row.url_imagen,
      urlCompleta: `${baseUrl}${row.url_imagen}`,
      textoAlternativo: row.textoalternativo || null,
      orden: row.orden,
    }));

    return res.json({
      success: true,
      data: {
        varianteId,
        portadaUrl: varianteResult.rows[0].url_imagen_variante || null,
        imagenes,
      },
    });
  } catch (error) {
    console.error("❌ Error al obtener imágenes de la variante:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener imágenes de la variante",
      error: error.message,
    });
  }
};

const subirImagenesVarianteMultiple = async (req, res) => {
  const { id } = req.params;
  const varianteId = Number.parseInt(id, 10);

  if (!Number.isInteger(varianteId) || varianteId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ID de variante inválido",
    });
  }

  try {
    const archivos = (() => {
      if (Array.isArray(req.files)) {
        return req.files;
      }

      if (req.files && typeof req.files === "object") {
        const fromImagenes = Array.isArray(req.files.imagenes)
          ? req.files.imagenes
          : [];
        const fromImages = Array.isArray(req.files.images) ? req.files.images : [];
        return [...fromImagenes, ...fromImages];
      }

      return [];
    })();

    if (archivos.length > 12) {
      return res.status(400).json({
        success: false,
        message: "El límite máximo es de 12 imágenes por variante",
      });
    }

    if (!archivos.length) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionaron archivos de imagen",
      });
    }

    const varianteResult = await db.query(
      "SELECT varianteid FROM producto_variantes WHERE varianteid = $1",
      [varianteId]
    );

    if (!varianteResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const ordenResult = await db.query(
      `SELECT COALESCE(MAX(orden), 0) AS max_orden
       FROM producto_variante_imagenes
       WHERE varianteid = $1`,
      [varianteId]
    );

    let nextOrden = Number.parseInt(ordenResult.rows[0]?.max_orden, 10);
    if (!Number.isFinite(nextOrden) || nextOrden < 0) {
      nextOrden = 0;
    }

    const imagenesGuardadas = [];

    for (const file of archivos) {
      if (!file || !file.filename) continue;

      const rutaImagen = `/uploads/${file.filename}`;
      nextOrden += 1;

      const insertResult = await db.query(
        `INSERT INTO producto_variante_imagenes (varianteid, url_imagen, textoalternativo, orden)
         VALUES ($1, $2, NULL, $3)
         RETURNING imagenid, url_imagen, textoalternativo, orden`,
        [varianteId, rutaImagen, nextOrden]
      );

      imagenesGuardadas.push(insertResult.rows[0]);
    }

    if (!imagenesGuardadas.length) {
      return res.status(400).json({
        success: false,
        message: "No se pudieron guardar las imágenes proporcionadas",
      });
    }

    const portadaResult = await db.query(
      `SELECT url_imagen
       FROM producto_variante_imagenes
       WHERE varianteid = $1
       ORDER BY orden ASC NULLS LAST, imagenid ASC
       LIMIT 1`,
      [varianteId]
    );

    const portadaUrl = portadaResult.rows[0]?.url_imagen || null;
    await db.query(
      "UPDATE producto_variantes SET url_imagen_variante = $1 WHERE varianteid = $2",
      [portadaUrl, varianteId]
    );

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    return res.status(200).json({
      success: true,
      message: "Imágenes subidas exitosamente",
      data: {
        varianteId,
        portadaUrl,
        imagenes: imagenesGuardadas.map((img) => ({
          imagenId: img.imagenid,
          rutaImagen: img.url_imagen,
          urlCompleta: `${baseUrl}${img.url_imagen}`,
          textoAlternativo: img.textoalternativo || null,
          orden: img.orden,
        })),
      },
    });
  } catch (error) {
    console.error("❌ Error al subir imágenes múltiples de la variante:", error);

    return res.status(500).json({
      success: false,
      message: "Error al subir las imágenes",
      error: error.message,
    });
  }
};

const actualizarOrdenImagenesVariante = async (req, res) => {
  const { id } = req.params;
  const varianteId = Number.parseInt(id, 10);

  if (!Number.isInteger(varianteId) || varianteId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ID de variante inválido",
    });
  }

  const { ordenImagenes } = req.body || {};
  if (!Array.isArray(ordenImagenes)) {
    return res.status(400).json({
      success: false,
      message: "ordenImagenes debe ser un arreglo",
    });
  }

  const client = await db.pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const varianteResult = await client.query(
      "SELECT varianteid FROM producto_variantes WHERE varianteid = $1",
      [varianteId]
    );

    if (!varianteResult.rows.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const existingImgs = await client.query(
      `SELECT url_imagen
       FROM producto_variante_imagenes
       WHERE varianteid = $1`,
      [varianteId]
    );

    const existingUrls = new Set(
      (existingImgs.rows || [])
        .map((r) => (r.url_imagen || "").toString().trim())
        .filter(Boolean)
    );

    const desired = ordenImagenes
      .map((u) => (u || "").toString().trim())
      .filter(Boolean);

    const filteredDesired = desired.filter((u) => existingUrls.has(u));
    const missing = Array.from(existingUrls).filter(
      (u) => !filteredDesired.includes(u)
    );
    const finalOrder = [...filteredDesired, ...missing];

    let orden = 0;
    for (const url of finalOrder) {
      orden += 1;
      await client.query(
        `UPDATE producto_variante_imagenes
         SET orden = $1
         WHERE varianteid = $2 AND url_imagen = $3`,
        [orden, varianteId, url]
      );
    }

    const portadaUrl = finalOrder.length ? finalOrder[0] : null;
    await client.query(
      "UPDATE producto_variantes SET url_imagen_variante = $1 WHERE varianteid = $2",
      [portadaUrl, varianteId]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Orden de imágenes actualizado correctamente",
      data: {
        varianteId,
        portadaUrl,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("❌ Error al actualizar orden de imágenes de variante:", error);
    return res.status(500).json({
      success: false,
      message: "Error al actualizar el orden de imágenes",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

/**
 * Confirmar orden de backorder
 * POST /api/admin/ordenes-compra/:id/confirmar
 */
const confirmarOrdenBackorder = async (req, res) => {
  try {
    const ordenCompraId = parseInt(req.params.id);

    // Verificar que la orden existe y está pendiente
    const ordenResult = await db.query(
      `SELECT oc.*, p.nombreempresa
       FROM ordenesdecompra oc
       INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
       WHERE oc.ordencompraid = $1`,
      [ordenCompraId]
    );

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenResult.rows[0];

    // Actualizar estatus a confirmado
    await db.query(
      `UPDATE ordenesdecompra 
       SET estatus = 'Confirmada'
       WHERE ordencompraid = $1`,
      [ordenCompraId]
    );

    // Obtener clientes afectados por productos en backorder
    const clientesQuery = await db.query(
      `SELECT DISTINCT p.clienteid
       FROM pedidos p
       INNER JOIN detallespedido dp ON p.pedidoid = dp.pedidoid
       INNER JOIN detallesordencompra doc ON dp.varianteid = doc.varianteid
       WHERE doc.ordencompraid = $1
       AND p.estatus = 'Backorder'`,
      [ordenCompraId]
    );

    // Notificar a cada cliente
    const notificacionesController = require('./notificacionesController');
    for (const cliente of clientesQuery.rows) {
      await notificacionesController.crearNotificacion(cliente.clienteid, {
        tipo: 'backorder',
        titulo: '✅ Orden de Backorder Confirmada',
        mensaje: `Tu orden de backorder #${ordenCompraId} ha sido confirmada y está siendo procesada.`,
        url: '/dashboard.html?tab=pedidos',
        prioridad: 'normal',
        metadata: { ordenCompraId },
      });
    }

    res.json({
      success: true,
      message: "Orden de backorder confirmada exitosamente",
      data: {
        ordenCompraId,
        clientesNotificados: clientesQuery.rows.length,
      },
    });
  } catch (error) {
    console.error("Error al confirmar orden de backorder:", error);
    res.status(500).json({
      success: false,
      message: "Error al confirmar orden de backorder",
      error: error.message,
    });
  }
};

/**
 * Cancelar orden de backorder
 * POST /api/admin/ordenes-compra/:id/cancelar
 */
const cancelarOrdenBackorder = async (req, res) => {
  try {
    const ordenCompraId = parseInt(req.params.id);
    const { motivo } = req.body;

    if (!motivo || motivo.trim() === '') {
      return res.status(400).json({
        success: false,
        message: "El motivo de cancelación es requerido",
      });
    }

    // Verificar que la orden existe
    const ordenResult = await db.query(
      `SELECT * FROM ordenesdecompra WHERE ordencompraid = $1`,
      [ordenCompraId]
    );

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    // Actualizar estatus a cancelado
    await db.query(
      `UPDATE ordenesdecompra 
       SET estatus = 'Cancelada'
       WHERE ordencompraid = $1`,
      [ordenCompraId]
    );

    // Obtener clientes afectados
    const clientesQuery = await db.query(
      `SELECT DISTINCT p.clienteid
       FROM pedidos p
       INNER JOIN detallespedido dp ON p.pedidoid = dp.pedidoid
       INNER JOIN detallesordencompra doc ON dp.varianteid = doc.varianteid
       WHERE doc.ordencompraid = $1
       AND p.estatus = 'Backorder'`,
      [ordenCompraId]
    );

    // Notificar a cada cliente
    const notificacionesController = require('./notificacionesController');
    for (const cliente of clientesQuery.rows) {
      await notificacionesController.notificarBackorderCancelado(
        ordenCompraId,
        cliente.clienteid,
        motivo
      );
    }

    res.json({
      success: true,
      message: "Orden de backorder cancelada y clientes notificados",
      data: {
        ordenCompraId,
        clientesNotificados: clientesQuery.rows.length,
        motivo,
      },
    });
  } catch (error) {
    console.error("Error al cancelar orden de backorder:", error);
    res.status(500).json({
      success: false,
      message: "Error al cancelar orden de backorder",
      error: error.message,
    });
  }
};

const cancelarOrdenCompra = cancelarOrdenBackorder;

const normalizeUploadedFiles = (req) => {
  const files = [];

  if (Array.isArray(req.files)) {
    req.files.forEach((f) => files.push(f));
    return files;
  }

  if (req.files && typeof req.files === "object") {
    const a = Array.isArray(req.files.imagenes) ? req.files.imagenes : [];
    const b = Array.isArray(req.files.images) ? req.files.images : [];
    return [...a, ...b];
  }

  return files;
};

const safeUnlinkUploads = async (files) => {
  if (!Array.isArray(files) || !files.length) return;

  await Promise.all(
    files
      .filter((f) => f && f.path)
      .map((f) =>
        fs.promises
          .unlink(f.path)
          .catch(() => null)
      )
  );
};

const parseGaleriaPayload = (raw) => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "object") return raw;
  const txt = String(raw).trim();
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
};

const applyGaleriaVarianteAtomic = async ({
  client,
  varianteId,
  galeria,
  uploadedFiles,
  baseUrl,
}) => {
  const files = Array.isArray(uploadedFiles) ? uploadedFiles : [];
  const galeriaArr = Array.isArray(galeria) ? galeria : null;

  if (!galeriaArr) {
    return { portadaUrl: null, imagenes: [] };
  }

  const existingItems = galeriaArr
    .filter((it) => it && String(it.type || it.tipo).toLowerCase() === "existing")
    .map((it) => Number.parseInt(it.imagenId ?? it.imagenid, 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  const newItems = galeriaArr
    .filter((it) => it && String(it.type || it.tipo).toLowerCase() === "new")
    .map((it) => {
      const uploadIndex = Number.parseInt(it.uploadIndex ?? it.uploadindex, 10);
      return Number.isInteger(uploadIndex) && uploadIndex >= 0 ? uploadIndex : null;
    })
    .filter((n) => n !== null);

  const existingDb = await client.query(
    `SELECT imagenid, url_imagen, textoalternativo, orden
     FROM producto_variante_imagenes
     WHERE varianteid = $1`,
    [varianteId]
  );
  const existingDbIds = (existingDb.rows || [])
    .map((r) => Number.parseInt(r.imagenid, 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  const keepSet = new Set(existingItems);
  const toDelete = existingDbIds.filter((id) => !keepSet.has(id));

  if (toDelete.length) {
    await client.query(
      `DELETE FROM producto_variante_imagenes
       WHERE varianteid = $1
         AND imagenid = ANY($2::int[])`,
      [varianteId, toDelete]
    );
  }

  let orden = 0;

  for (const item of galeriaArr) {
    const type = String(item?.type || item?.tipo || "").toLowerCase();
    orden += 1;

    if (type === "existing") {
      const imagenId = Number.parseInt(item.imagenId ?? item.imagenid, 10);
      if (!Number.isInteger(imagenId) || imagenId <= 0) continue;
      await client.query(
        `UPDATE producto_variante_imagenes
         SET orden = $1
         WHERE varianteid = $2 AND imagenid = $3`,
        [orden, varianteId, imagenId]
      );
      continue;
    }

    if (type === "new") {
      const uploadIndex = Number.parseInt(item.uploadIndex ?? item.uploadindex, 10);
      if (!Number.isInteger(uploadIndex) || uploadIndex < 0) continue;
      const file = files[uploadIndex];
      if (!file || !file.filename) continue;

      const rutaImagen = `/uploads/${file.filename}`;
      const alt =
        item.textoalternativo !== undefined
          ? (() => {
              if (item.textoalternativo === null) return null;
              const txt = String(item.textoalternativo).trim();
              return txt.length ? txt : null;
            })()
          : item.textoAlternativo !== undefined
            ? (() => {
                if (item.textoAlternativo === null) return null;
                const txt = String(item.textoAlternativo).trim();
                return txt.length ? txt : null;
              })()
            : null;
      await client.query(
        `INSERT INTO producto_variante_imagenes (url_imagen, textoalternativo, orden, varianteid)
         VALUES ($1, $2, $3, $4)`,
        [rutaImagen, alt, orden, varianteId]
      );
      continue;
    }
  }

  const portadaRes = await client.query(
    `SELECT url_imagen
     FROM producto_variante_imagenes
     WHERE varianteid = $1
     ORDER BY orden ASC NULLS LAST, imagenid ASC
     LIMIT 1`,
    [varianteId]
  );

  const portadaRuta = portadaRes.rows?.[0]?.url_imagen || null;

  await client.query(
    `UPDATE producto_variantes
     SET url_imagen_variante = $1
     WHERE varianteid = $2`,
    [portadaRuta, varianteId]
  );

  const imagenesFinalRes = await client.query(
    `SELECT imagenid, url_imagen, textoalternativo, orden
     FROM producto_variante_imagenes
     WHERE varianteid = $1
     ORDER BY orden ASC NULLS LAST, imagenid ASC`,
    [varianteId]
  );

  const imagenes = (imagenesFinalRes.rows || []).map((row) => ({
    imagenId: row.imagenid,
    rutaImagen: row.url_imagen,
    urlCompleta: `${baseUrl}${row.url_imagen}`,
    textoAlternativo: row.textoalternativo || null,
    orden: row.orden,
  }));

  return {
    portadaUrl: portadaRuta ? `${baseUrl}${portadaRuta}` : null,
    imagenes,
  };
};

/**
 * Crear una variante
 * POST /api/admin/variantes
 *
 * Nuevo flujo: no inserta directamente en Producto_Variantes.
 * Registra una solicitud de cambio (INSERT) en control_cambios para revisión.
 */
const crearVariante = async (req, res) => {
  const galeriaParsed = parseGaleriaPayload(req.body?.galeria);
  const uploadedFiles = normalizeUploadedFiles(req);
  const isAtomic = Array.isArray(galeriaParsed) || uploadedFiles.length > 0;

  if (isAtomic) {
    const rolUsuario = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rolUsuario === "admin" || rolUsuario === "superadmin";
    if (!allowDirect) {
      await safeUnlinkUploads(uploadedFiles);
      return res.status(403).json({
        success: false,
        message: "No tienes permisos para guardar variantes con imágenes en una sola operación.",
      });
    }

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      const {
        productoId,
        dimensiones,
        costoUnitario,
        precioUnitario,
        precioOfertaUnitario,
        stock,
        tipoProductoId,
        medidaId,
        color_nombre,
        activo,
      } = req.body || {};

      const parsedProductoId = Number.parseInt(productoId, 10);
      if (!parsedProductoId || Number.isNaN(parsedProductoId)) {
        throw Object.assign(new Error("productoId es obligatorio y debe ser numérico"), {
          status: 400,
        });
      }

      const dimensionesFinal = (() => {
        if (dimensiones === undefined) return null;
        if (dimensiones === null) return null;
        const txt = String(dimensiones).trim();
        return txt.length ? txt : null;
      })();

      if (!dimensionesFinal) {
        throw Object.assign(new Error("dimensiones es obligatorio para generar el SKU"), {
          status: 400,
        });
      }

      if (
        precioUnitario === undefined ||
        precioUnitario === null ||
        String(precioUnitario).trim() === ""
      ) {
        throw Object.assign(new Error("precioUnitario es obligatorio"), { status: 400 });
      }

      const precioUnitarioNum = Number.parseFloat(precioUnitario);
      if (!Number.isFinite(precioUnitarioNum) || precioUnitarioNum <= 0) {
        throw Object.assign(new Error("precioUnitario debe ser un número mayor a 0"), {
          status: 400,
        });
      }

      const stockNum =
        stock === undefined || stock === null || stock === ""
          ? 0
          : Number.parseInt(stock, 10);
      if (!Number.isInteger(stockNum) || stockNum < 0) {
        throw Object.assign(new Error("stock debe ser un entero mayor o igual a 0"), {
          status: 400,
        });
      }

      const costoUnitarioNumRaw =
        costoUnitario === undefined ||
        costoUnitario === null ||
        costoUnitario === ""
          ? 0
          : Number.parseFloat(costoUnitario);
      const costoUnitarioNum =
        Number.isFinite(costoUnitarioNumRaw) && costoUnitarioNumRaw >= 0
          ? costoUnitarioNumRaw
          : 0;

      let ofertaNum = null;
      if (
        precioOfertaUnitario !== undefined &&
        precioOfertaUnitario !== null &&
        String(precioOfertaUnitario).trim() !== ""
      ) {
        const parsedOferta = Number.parseFloat(precioOfertaUnitario);
        if (
          Number.isFinite(parsedOferta) &&
          parsedOferta > 0 &&
          parsedOferta < precioUnitarioNum
        ) {
          ofertaNum = parsedOferta;
        }
      }

      const activoFinal = activo !== undefined ? Boolean(activo) : true;

      const productoResult = await client.query(
        "SELECT productoid, sku_maestro FROM productos WHERE productoid = $1",
        [parsedProductoId]
      );
      if (!productoResult.rows.length) {
        throw Object.assign(new Error("Producto maestro no encontrado"), {
          status: 404,
        });
      }

      const skuMaestroBase = (productoResult.rows[0]?.sku_maestro || "")
        .toString()
        .trim();
      if (!skuMaestroBase) {
        throw Object.assign(
          new Error(
            "El producto no tiene SKU Maestro. Debe existir para generar el SKU de la variante."
          ),
          { status: 400 }
        );
      }

      const medidaProcesada = procesarMedidaParaSkuVariante(dimensionesFinal);
      if (!medidaProcesada) {
        throw Object.assign(new Error("No se pudo procesar dimensiones para generar el SKU"), {
          status: 400,
        });
      }

      const colorFinal = (() => {
        if (color_nombre === undefined || color_nombre === null) return null;
        const txt = String(color_nombre).trim();
        return txt.length ? txt : null;
      })();

      const colorSegment = procesarColorParaSkuVariante(colorFinal);

      const skuMaestroSan = skuMaestroBase.toUpperCase().replace(/\s+/g, "");
      const maxSkuLen = 50;
      const remaining = maxSkuLen - (skuMaestroSan.length + 1);
      const tailRaw = colorSegment ? `${medidaProcesada}-${colorSegment}` : medidaProcesada;
      const tail = remaining > 0 ? tailRaw.slice(0, remaining).replace(/-+$/g, "") : "";
      const skuFinal = remaining > 0 && tail ? `${skuMaestroSan}-${tail}` : skuMaestroSan.slice(0, maxSkuLen);

      const insertRes = await client.query(
        `INSERT INTO producto_variantes
          (productoid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, preciounitario, precioofertaunitario, color_nombre, url_imagen_variante, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11)
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, preciounitario, precioofertaunitario, stock, tipoproductoid, medidaid, color_nombre, url_imagen_variante, activo, piezasporpaquete`,
        [
          parsedProductoId,
          skuFinal,
          dimensionesFinal,
          costoUnitarioNum,
          stockNum,
          tipoProductoId || null,
          medidaId || null,
          precioUnitarioNum,
          ofertaNum,
          colorFinal,
          activoFinal,
        ]
      );

      const row = insertRes.rows[0];
      const varianteId = row.varianteid;
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const galeriaResult = await applyGaleriaVarianteAtomic({
        client,
        varianteId,
        galeria: galeriaParsed || [],
        uploadedFiles,
        baseUrl,
      });

      const usedUploadIndexes = new Set(
        (Array.isArray(galeriaParsed) ? galeriaParsed : [])
          .filter((it) => it && String(it.type || it.tipo).toLowerCase() === "new")
          .map((it) => Number.parseInt(it.uploadIndex ?? it.uploadindex, 10))
          .filter((n) => Number.isInteger(n) && n >= 0)
      );

      const unusedFiles = uploadedFiles.filter((_, idx) => !usedUploadIndexes.has(idx));
      await safeUnlinkUploads(unusedFiles);

      await client.query("COMMIT");

      return res.status(201).json({
        success: true,
        message: "Variante creada correctamente.",
        data: {
          variante: {
            varianteId: row.varianteid,
            productoId: row.productoid,
            sku: row.sku,
            dimensiones: row.dimensiones,
            colorNombre: row.color_nombre || null,
            urlImagenVariante: galeriaResult.portadaUrl || null,
            costoUnitario:
              row.costounitario !== null ? parseFloat(row.costounitario) : null,
            precioUnitario:
              row.preciounitario !== null ? parseFloat(row.preciounitario) : null,
            precioOfertaUnitario:
              row.precioofertaunitario !== null
                ? parseFloat(row.precioofertaunitario)
                : null,
            stock: row.stock !== null ? parseInt(row.stock, 10) : 0,
            activo: row.activo !== undefined ? row.activo : true,
            tipoproductoid: row.tipoproductoid,
            medidaid: row.medidaid,
            piezasporpaquete: row.piezasporpaquete,
          },
          galeria: galeriaResult,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      await safeUnlinkUploads(uploadedFiles);
      const status = error && Number.isInteger(error.status) ? error.status : 500;
      return res.status(status).json({
        success: false,
        message: error.message || "Error en el servidor",
      });
    } finally {
      client.release();
    }
  }

  try {
    const {
      productoId,
      sku,
      dimensiones,
      costoUnitario,
      precioUnitario,
      precioOfertaUnitario,
      stock,
      tipoProductoId,
      medidaId,
      color_nombre,
      url_imagen_variante,
      activo,
    } = req.body || {};

    const rolUsuario = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rolUsuario === "admin" || rolUsuario === "superadmin";

    const parsedProductoId = Number.parseInt(productoId, 10);
    if (!parsedProductoId || Number.isNaN(parsedProductoId)) {
      return res.status(400).json({
        success: false,
        message: "productoId es obligatorio y debe ser numérico",
      });
    }

    const dimensionesFinal =
      dimensiones === undefined
        ? null
        : (() => {
            if (dimensiones === null) return null;
            const txt = String(dimensiones).trim();
            return txt.length ? txt : null;
          })();

    if (!dimensionesFinal) {
      return res.status(400).json({
        success: false,
        message: "dimensiones es obligatorio para generar el SKU",
      });
    }

    if (
      precioUnitario === undefined ||
      precioUnitario === null ||
      String(precioUnitario).trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "precioUnitario es obligatorio",
      });
    }

    const precioUnitarioNum = Number.parseFloat(precioUnitario);
    if (!Number.isFinite(precioUnitarioNum) || precioUnitarioNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "precioUnitario debe ser un número mayor a 0",
      });
    }

    const stockNum =
      stock === undefined || stock === null || stock === ""
        ? 0
        : Number.parseInt(stock, 10);
    if (!Number.isInteger(stockNum) || stockNum < 0) {
      return res.status(400).json({
        success: false,
        message: "stock debe ser un entero mayor o igual a 0",
      });
    }

    const costoUnitarioNumRaw =
      costoUnitario === undefined ||
      costoUnitario === null ||
      costoUnitario === ""
        ? 0
        : Number.parseFloat(costoUnitario);
    const costoUnitarioNum =
      Number.isFinite(costoUnitarioNumRaw) && costoUnitarioNumRaw >= 0
        ? costoUnitarioNumRaw
        : 0;

    let ofertaNum = null;
    if (
      precioOfertaUnitario !== undefined &&
      precioOfertaUnitario !== null &&
      String(precioOfertaUnitario).trim() !== ""
    ) {
      const parsedOferta = Number.parseFloat(precioOfertaUnitario);
      if (
        Number.isFinite(parsedOferta) &&
        parsedOferta > 0 &&
        parsedOferta < precioUnitarioNum
      ) {
        ofertaNum = parsedOferta;
      }
    }

    const activoFinal = activo !== undefined ? Boolean(activo) : true;

    // Verificar que el producto maestro exista, pero sin modificar tablas de negocio
    const productoResult = await db.query(
      "SELECT productoid, nombreproducto, sku_maestro FROM productos WHERE productoid = $1",
      [parsedProductoId]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto maestro no encontrado",
      });
    }

    const productoRow = productoResult.rows[0];
    const skuMaestroBase = (productoRow?.sku_maestro || "").toString().trim();
    if (!skuMaestroBase) {
      return res.status(400).json({
        success: false,
        message:
          "El producto no tiene SKU Maestro. Debe existir para generar el SKU de la variante.",
      });
    }

    const medidaProcesada = procesarMedidaParaSkuVariante(dimensionesFinal);
    if (!medidaProcesada) {
      return res.status(400).json({
        success: false,
        message: "No se pudo procesar dimensiones para generar el SKU",
      });
    }

    const colorFinal =
      color_nombre === undefined || color_nombre === null
        ? null
        : (() => {
            const txt = String(color_nombre).trim();
            return txt.length ? txt : null;
          })();

    const colorSegment = procesarColorParaSkuVariante(colorFinal);

    const skuMaestroSan = skuMaestroBase.toUpperCase().replace(/\s+/g, "");
    const maxSkuLen = 50;
    const remaining = maxSkuLen - (skuMaestroSan.length + 1);
    const tailRaw = colorSegment ? `${medidaProcesada}-${colorSegment}` : medidaProcesada;
    const tail = remaining > 0 ? tailRaw.slice(0, remaining).replace(/-+$/g, "") : "";
    const skuFinal = remaining > 0 && tail ? `${skuMaestroSan}-${tail}` : skuMaestroSan.slice(0, maxSkuLen);

    // Usar nombres de columnas reales de Producto_Variantes (en minúsculas)
    const payloadNuevos = {
      productoid: parsedProductoId,
      sku: skuFinal,
      dimensiones: dimensionesFinal,
      costounitario: costoUnitarioNum,
      preciounitario: precioUnitarioNum,
      precioofertaunitario: ofertaNum,
      stock: stockNum,
      tipoproductoid: tipoProductoId || null,
      medidaid: medidaId || null,
      color_nombre:
        colorFinal,
      url_imagen_variante:
        url_imagen_variante === undefined || url_imagen_variante === null
          ? null
          : (() => {
              const txt = String(url_imagen_variante).trim();
              return txt.length ? txt : null;
            })(),
      activo: activoFinal,
    };

    if (allowDirect) {
      const insertRes = await db.query(
        `INSERT INTO producto_variantes
          (productoid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, preciounitario, precioofertaunitario, color_nombre, url_imagen_variante, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, preciounitario, precioofertaunitario, stock, tipoproductoid, medidaid, color_nombre, url_imagen_variante, activo, piezasporpaquete`,
        [
          payloadNuevos.productoid,
          payloadNuevos.sku,
          payloadNuevos.dimensiones,
          payloadNuevos.costounitario,
          payloadNuevos.stock,
          payloadNuevos.tipoproductoid,
          payloadNuevos.medidaid,
          payloadNuevos.preciounitario,
          payloadNuevos.precioofertaunitario,
          payloadNuevos.color_nombre,
          payloadNuevos.url_imagen_variante,
          payloadNuevos.activo,
        ]
      );

      const row = insertRes.rows[0];

      await auditService.registrarCambioPasivo(
        req,
        "producto_variantes",
        row.varianteid,
        "INSERT",
        null,
        row
      );

      return res.status(201).json({
        success: true,
        message: "Variante creada correctamente.",
        data: {
          variante: {
            varianteId: row.varianteid,
            productoId: row.productoid,
            sku: row.sku,
            dimensiones: row.dimensiones,
            colorNombre: row.color_nombre || null,
            urlImagenVariante: row.url_imagen_variante || null,
            costoUnitario:
              row.costounitario !== null ? parseFloat(row.costounitario) : null,
            precioUnitario:
              row.preciounitario !== null ? parseFloat(row.preciounitario) : null,
            precioOfertaUnitario:
              row.precioofertaunitario !== null
                ? parseFloat(row.precioofertaunitario)
                : null,
            stock: row.stock ?? 0,
            activo: row.activo,
            piezasPorPaquete: row.piezasporpaquete,
            tipoProductoId: row.tipoproductoid ?? null,
            medidaId: row.medidaid ?? null,
          },
        },
      });
    }

    const resultado = await solicitarCambio(
      req,
      "producto_variantes",
      null,
      "INSERT",
      payloadNuevos,
      null
    );

    return res.status(201).json({
      success: true,
      message: resultado.mensaje,
      data: {
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error("Error al crear variante (solicitud de cambio):", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
    });
  }
};

/**
 * Actualizar una variante
 * PUT /api/admin/variantes/:id
 *
 * Soporta dos usos:
 * - Toggle rápido de visibilidad (solo 'activo').
 * - Edición de datos económicos: SKU, dimensiones, costo, precio, oferta.
 */
const actualizarVariante = async (req, res) => {
  const galeriaParsed = parseGaleriaPayload(req.body?.galeria);
  const uploadedFiles = normalizeUploadedFiles(req);
  const isAtomic = Array.isArray(galeriaParsed) || uploadedFiles.length > 0;

  if (isAtomic) {
    const varianteId = parseInt(req.params.id, 10);
    if (!varianteId || Number.isNaN(varianteId)) {
      await safeUnlinkUploads(uploadedFiles);
      return res.status(400).json({
        success: false,
        message: "ID de variante inválido",
      });
    }

    const rolUsuario = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rolUsuario === "admin" || rolUsuario === "superadmin";
    if (!allowDirect) {
      await safeUnlinkUploads(uploadedFiles);
      return res.status(403).json({
        success: false,
        message: "No tienes permisos para guardar variantes con imágenes en una sola operación.",
      });
    }

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      const {
        activo,
        dimensiones,
        costoUnitario,
        precioUnitario,
        precioOfertaUnitario,
        color_nombre,
      } = req.body || {};

      const result = await client.query(
        `SELECT VarianteID, SKU, Dimensiones, CostoUnitario, PrecioUnitario, PrecioOfertaUnitario, Stock, Activo,
                color_nombre, url_imagen_variante
         FROM Producto_Variantes
         WHERE VarianteID = $1`,
        [varianteId]
      );
      if (!result.rows.length) {
        throw Object.assign(new Error("Variante no encontrada"), { status: 404 });
      }

      const actual = result.rows[0];

      const parseNullableNumero = (raw) => {
        if (raw === undefined) return { usarActual: true, valor: null };
        if (raw === null || raw === "") {
          return { usarActual: false, valor: null };
        }
        const num = Number.parseFloat(raw);
        if (Number.isNaN(num)) {
          return { usarActual: false, valor: null };
        }
        return { usarActual: false, valor: num };
      };

      const normalizarTextoNullable = (raw) => {
        if (raw === undefined) return { usarActual: true, valor: null };
        if (raw === null) return { usarActual: false, valor: null };
        const txt = String(raw).trim();
        return { usarActual: false, valor: txt.length ? txt : null };
      };

      const dimensionesActual = actual.dimensiones;
      const costoActual =
        actual.costounitario !== null && actual.costounitario !== undefined
          ? Number.parseFloat(actual.costounitario)
          : null;
      const precioActual =
        actual.preciounitario !== null && actual.preciounitario !== undefined
          ? Number.parseFloat(actual.preciounitario)
          : null;
      const ofertaActual =
        actual.precioofertaunitario !== null && actual.precioofertaunitario !== undefined
          ? Number.parseFloat(actual.precioofertaunitario)
          : null;

      const nuevasDimensiones =
        dimensiones !== undefined
          ? (() => {
              if (dimensiones === null) return null;
              const texto = String(dimensiones).trim();
              return texto.length ? texto : null;
            })()
          : dimensionesActual;

      const costoParse = parseNullableNumero(costoUnitario);
      const nuevoCosto = costoParse.usarActual ? costoActual : costoParse.valor;

      const precioParse = parseNullableNumero(precioUnitario);
      const nuevoPrecio = precioParse.usarActual ? precioActual : precioParse.valor;

      if (nuevoPrecio === null || !(nuevoPrecio > 0)) {
        throw Object.assign(
          new Error(
            "El precio unitario debe ser un número mayor a 0 al editar la variante"
          ),
          { status: 400 }
        );
      }

      const ofertaParse = parseNullableNumero(precioOfertaUnitario);
      let nuevaOferta = ofertaParse.usarActual ? ofertaActual : ofertaParse.valor;
      if (nuevaOferta !== null && !(nuevaOferta > 0 && nuevaOferta < nuevoPrecio)) {
        nuevaOferta = null;
      }

      const colorParsed = normalizarTextoNullable(color_nombre);
      const colorFinal = colorParsed.usarActual
        ? actual.color_nombre ?? actual.color_nombre
        : colorParsed.valor;

      const activoFinal = activo !== undefined ? Boolean(activo) : Boolean(actual.activo);

      const updateRes = await client.query(
        `UPDATE producto_variantes
         SET dimensiones = $1,
             costounitario = $2,
             preciounitario = $3,
             precioofertaunitario = $4,
             color_nombre = $5,
             activo = $6
         WHERE varianteid = $7
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, preciounitario, precioofertaunitario, stock, activo, tipoproductoid, medidaid, color_nombre, url_imagen_variante, piezasporpaquete`,
        [
          nuevasDimensiones,
          nuevoCosto,
          nuevoPrecio,
          nuevaOferta,
          colorFinal,
          activoFinal,
          varianteId,
        ]
      );

      if (!updateRes.rows.length) {
        throw Object.assign(new Error("Variante no encontrada"), { status: 404 });
      }

      const row = updateRes.rows[0];
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const galeriaResult = await applyGaleriaVarianteAtomic({
        client,
        varianteId,
        galeria: galeriaParsed || [],
        uploadedFiles,
        baseUrl,
      });

      const usedUploadIndexes = new Set(
        (Array.isArray(galeriaParsed) ? galeriaParsed : [])
          .filter((it) => it && String(it.type || it.tipo).toLowerCase() === "new")
          .map((it) => Number.parseInt(it.uploadIndex ?? it.uploadindex, 10))
          .filter((n) => Number.isInteger(n) && n >= 0)
      );
      const unusedFiles = uploadedFiles.filter((_, idx) => !usedUploadIndexes.has(idx));
      await safeUnlinkUploads(unusedFiles);

      await client.query("COMMIT");

      return res.json({
        success: true,
        message: "Variante actualizada correctamente.",
        data: {
          variante: {
            varianteId: row.varianteid,
            productoId: row.productoid,
            sku: row.sku,
            dimensiones: row.dimensiones,
            colorNombre: row.color_nombre || null,
            urlImagenVariante: galeriaResult.portadaUrl || null,
            costoUnitario:
              row.costounitario !== null ? parseFloat(row.costounitario) : null,
            precioUnitario:
              row.preciounitario !== null ? parseFloat(row.preciounitario) : null,
            precioOfertaUnitario:
              row.precioofertaunitario !== null
                ? parseFloat(row.precioofertaunitario)
                : null,
            stock: row.stock !== null ? parseInt(row.stock, 10) : 0,
            activo: row.activo !== undefined ? row.activo : true,
            tipoproductoid: row.tipoproductoid,
            medidaid: row.medidaid,
            piezasporpaquete: row.piezasporpaquete,
          },
          galeria: galeriaResult,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      await safeUnlinkUploads(uploadedFiles);
      const status = error && Number.isInteger(error.status) ? error.status : 500;
      return res.status(status).json({
        success: false,
        message: error.message || "Error en el servidor",
      });
    } finally {
      client.release();
    }
  }

  try {
    const varianteId = parseInt(req.params.id, 10);

    if (!varianteId || isNaN(varianteId)) {
      return res.status(400).json({
        success: false,
        message: "ID de variante inválido",
      });
    }

    const {
      activo,
      dimensiones,
      costoUnitario,
      precioUnitario,
      precioOfertaUnitario,
      color_nombre,
      url_imagen_variante,
    } = req.body || {};

    const result = await db.query(
      `SELECT VarianteID, SKU, Dimensiones, CostoUnitario, PrecioUnitario, PrecioOfertaUnitario, Stock, Activo,
              color_nombre, url_imagen_variante
       FROM Producto_Variantes
       WHERE VarianteID = $1`,
      [varianteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const actual = result.rows[0];

    const rolUsuario = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rolUsuario === "admin" || rolUsuario === "superadmin";

    const normalizarBoolean = (value, fallback) => {
      if (value === undefined) return fallback;
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value === 1;
      if (typeof value === "string") {
        const norm = value.trim().toLowerCase();
        if (norm === "true" || norm === "1") return true;
        if (norm === "false" || norm === "0") return false;
      }
      return fallback;
    };

    const parseNullableNumero = (raw) => {
      if (raw === undefined) return { usarActual: true, valor: null };
      if (raw === null || raw === "") {
        return { usarActual: false, valor: null };
      }
      const num = Number.parseFloat(raw);
      if (Number.isNaN(num)) {
        return { usarActual: false, valor: null };
      }
      return { usarActual: false, valor: num };
    };

    const skuActual = actual.sku;
    const dimensionesActual = actual.dimensiones;
    const costoActual =
      actual.costounitario !== null && actual.costounitario !== undefined
        ? Number.parseFloat(actual.costounitario)
        : null;
    const precioActual =
      actual.preciounitario !== null && actual.preciounitario !== undefined
        ? Number.parseFloat(actual.preciounitario)
        : null;
    const ofertaActual =
      actual.precioofertaunitario !== null &&
      actual.precioofertaunitario !== undefined
        ? Number.parseFloat(actual.precioofertaunitario)
        : null;
    const activoActual = Boolean(actual.activo);

    const nuevasDimensiones =
      dimensiones !== undefined
        ? (() => {
            if (dimensiones === null) return null;
            const texto = String(dimensiones).trim();
            return texto.length ? texto : null;
          })()
        : dimensionesActual;

    const costoParse = parseNullableNumero(costoUnitario);
    const nuevoCosto = costoParse.usarActual ? costoActual : costoParse.valor;

    const precioParse = parseNullableNumero(precioUnitario);
    const nuevoPrecio = precioParse.usarActual ? precioActual : precioParse.valor;

    if (nuevoPrecio === null || !(nuevoPrecio > 0)) {
      return res.status(400).json({
        success: false,
        message:
          "El precio unitario debe ser un número mayor a 0 al editar la variante",
      });
    }

    const ofertaParse = parseNullableNumero(precioOfertaUnitario);
    let nuevaOferta = ofertaParse.usarActual ? ofertaActual : ofertaParse.valor;

    if (nuevaOferta !== null && !(nuevaOferta > 0 && nuevaOferta < nuevoPrecio)) {
      nuevaOferta = null;
    }

    const nuevoActivo = normalizarBoolean(activo, activoActual);

    console.log("📝 Solicitud de actualización de variante", {
      varianteId,
      sku: skuActual,
      dimensiones: nuevasDimensiones,
      costoUnitario: nuevoCosto,
      precioUnitario: nuevoPrecio,
      precioOfertaUnitario: nuevaOferta,
      activo: nuevoActivo,
    });

    const normalizarTextoNullable = (raw) => {
      if (raw === undefined) return { usarActual: true, valor: null };
      if (raw === null) return { usarActual: false, valor: null };
      const txt = String(raw).trim();
      return { usarActual: false, valor: txt.length ? txt : null };
    };

    // Usar nombres de columnas reales de Producto_Variantes (en minúsculas)
    const payloadNuevos = {
      dimensiones: nuevasDimensiones,
      costounitario: nuevoCosto,
      preciounitario: nuevoPrecio,
      precioofertaunitario: nuevaOferta,
      activo: nuevoActivo,
    };

    const colorParsed = normalizarTextoNullable(color_nombre);
    if (!colorParsed.usarActual) {
      payloadNuevos.color_nombre = colorParsed.valor;
    }
    const urlParsed = normalizarTextoNullable(url_imagen_variante);
    if (!urlParsed.usarActual) {
      payloadNuevos.url_imagen_variante = urlParsed.valor;
    }

    if (allowDirect) {
      const colorFinal = Object.prototype.hasOwnProperty.call(payloadNuevos, "color_nombre")
        ? payloadNuevos.color_nombre
        : actual.color_nombre ?? actual.color_nombre;
      const urlFinal = Object.prototype.hasOwnProperty.call(payloadNuevos, "url_imagen_variante")
        ? payloadNuevos.url_imagen_variante
        : actual.url_imagen_variante ?? actual.url_imagen_variante;

      const updateRes = await db.query(
        `UPDATE producto_variantes
         SET dimensiones = $1,
             costounitario = $2,
             preciounitario = $3,
             precioofertaunitario = $4,
             color_nombre = $5,
             url_imagen_variante = $6,
             activo = $7
         WHERE varianteid = $8
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, preciounitario, precioofertaunitario, stock, activo, tipoproductoid, medidaid, color_nombre, url_imagen_variante, piezasporpaquete`,
        [
          payloadNuevos.dimensiones,
          payloadNuevos.costounitario,
          payloadNuevos.preciounitario,
          payloadNuevos.precioofertaunitario,
          colorFinal,
          urlFinal,
          payloadNuevos.activo,
          varianteId,
        ]
      );

      if (!updateRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Variante no encontrada",
        });
      }

      const row = updateRes.rows[0];

      await auditService.registrarCambioPasivo(
        req,
        "producto_variantes",
        varianteId,
        "UPDATE",
        actual,
        row
      );

      return res.json({
        success: true,
        message: "Variante actualizada correctamente.",
        data: {
          variante: {
            varianteId: row.varianteid,
            productoId: row.productoid,
            sku: row.sku,
            dimensiones: row.dimensiones,
            colorNombre: row.color_nombre || null,
            urlImagenVariante: row.url_imagen_variante || null,
            costoUnitario:
              row.costounitario !== null ? parseFloat(row.costounitario) : null,
            precioUnitario:
              row.preciounitario !== null ? parseFloat(row.preciounitario) : null,
            precioOfertaUnitario:
              row.precioofertaunitario !== null
                ? parseFloat(row.precioofertaunitario)
                : null,
            stock: row.stock ?? 0,
            activo: row.activo,
            piezasPorPaquete: row.piezasporpaquete,
            tipoProductoId: row.tipoproductoid ?? null,
            medidaId: row.medidaid ?? null,
          },
        },
      });
    }

    const resultado = await solicitarCambio(
      req,
      "producto_variantes",
      varianteId,
      "UPDATE",
      payloadNuevos,
      actual
    );

    res.json({
      success: true,
      message: resultado.mensaje,
      data: {
        varianteId,
        solicitudId: resultado.solicitudId,
        estado: resultado.estado,
      },
    });
  } catch (error) {
    console.error("❌ Error al generar solicitud de actualización de variante:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor: " + error.message,
      error: error.message,
    });
  }
};

module.exports = {
  loginAdmin,
  verifyAdmin,
  getAdminProfile,
  refreshAdminToken,
  getDashboardStats,
  getAllPedidos,
  confirmarPedido,
  updateCostoEnvio,
  updatePedidoEstatus,
  getPedidoDetalle,
  getMovimientosInventario,
  getHistorialInventarioVariante,
  recepcionarMercancia,
  ajustarInventario,
  getInventarioResumen,
  buscarProductosCompra,
  getProductoDetalle,
  getVariantesPendientesProducto,
  getAllProductos,
  crearProducto,
  actualizarProducto,
  getTamanosPaquetes,
  getCategorias,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  getMedidas,
getMedidasExistentes,
  crearVariante,
  actualizarVariante,
  crearAgente,
  getAllAgentes,
  getAgenteDetalle,
  getAgenteClientes,
  desactivarAgente,
  getAllComisiones,
  pagarComision,
  getAllClientes,
  getClienteDetalle,
  actualizarEstadoCliente,
  desvincularClienteDeAgente,
  getAllProveedores,
  getProveedorById,
  crearProveedor,
  actualizarProveedor,
  getSolicitudesPendientesProveedor,
  getReglasEmpaqueProveedor,
  saveReglaEmpaque,
  getTiposProductoAdmin,
  crearTipoProductoAdmin,
  getAllOrdenesCompra,
  getDetallesOrdenCompra,
  getRecepcionOrdenCompra,
  getComprasPendientes,
  getCompraDetalleCiego,
  validarRecepcionCompra,
  crearOrdenCompra,
  cancelarOrdenCompra,
  recibirInventario,
  recibirItemOrdenCompra,
  recepcionMasivaOrdenCompra,
  getCuentasPorPagar,
  registrarPagoCuentaPorPagar,
  getResumenEstadoCuentaProveedores,
  getEstadoCuentaProveedorMovimientos,
  getProductosRecibidosPorCxp,
  subirEvidenciaRecepcionOC,
  subirImagenProducto,
  subirImagenesProductoMultiple,
  getImagenesVariante,
  subirImagenesVarianteMultiple,
  actualizarOrdenImagenesVariante,
  confirmarOrdenBackorder,
  cancelarOrdenBackorder,
};
