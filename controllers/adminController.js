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
const auditLogger = require("../services/auditLogger");
const {
  procesarImagenesColor,
  guardarImagenesColor,
  obtenerImagenesColor,
} = require("../utils/imageColorHelper");
const {
  eliminarImagenCloudinary,
  extraerPublicIdDeUrl,
} = require("../utils/cloudinaryHelper");
const {
  checkEmailGlobalUniqueness,
  getContextualErrorMessage,
} = require("../utils/emailValidator");
const { generarSkuUnico } = require("../utils/skuGenerator");
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

    const url = req.file.path;
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

const getCxcSummary = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         c.clienteid,
         c.nombre,
         c.apellido,
         c.email,
         c.telefono,
         cred.credito_id,
         cred.limite_credito,
         cred.saldo_deudor,
         cred.dias_gracia,
         cred.estado_credito,
         cred.ultima_actualizacion,
         mov.fecha_movimiento AS ultima_fecha_movimiento,
         mov.descripcion AS ultima_descripcion,
         mov.tipo_movimiento AS ultima_tipo_movimiento,
         mov.saldo_despues_movimiento AS ultima_saldo_despues,
         COALESCE(vencido.tiene_vencido, false) AS esta_vencido
       FROM cliente_creditos cred
       INNER JOIN clientes c ON c.clienteid = cred.cliente_id
       LEFT JOIN LATERAL (
         SELECT
           fecha_movimiento,
           descripcion,
           tipo_movimiento,
           saldo_despues_movimiento
         FROM credito_movimientos
         WHERE credito_id = cred.credito_id
         ORDER BY fecha_movimiento DESC
         LIMIT 1
       ) mov ON TRUE
       LEFT JOIN LATERAL (
         SELECT TRUE AS tiene_vencido
         FROM pedidos p
         WHERE p.clienteid = c.clienteid
           AND COALESCE(p.pagado, FALSE) = FALSE
           AND p.fecha_vencimiento IS NOT NULL
           AND p.fecha_vencimiento < NOW()
         LIMIT 1
       ) vencido ON TRUE
       WHERE cred.saldo_deudor > 0
       ORDER BY cred.saldo_deudor DESC`
    );

    const cartera = (result.rows || []).map((row) => {
      const saldo = Number.parseFloat(row.saldo_deudor ?? 0) || 0;
      const limite = Number.parseFloat(row.limite_credito ?? 0) || 0;
      const disponible = Math.max(limite - saldo, 0);
      const estado =
        row.esta_vencido === true || row.esta_vencido === "true" ? "VENCIDO" : "AL_DIA";

      return {
        creditoId: row.credito_id,
        clienteId: row.clienteid,
        clienteNombre: [row.nombre, row.apellido].filter(Boolean).join(" ").trim(),
        email: row.email,
        telefono: row.telefono || null,
        limiteCredito: limite,
        saldoDeudor: saldo,
        disponible,
        diasGracia: Number.parseInt(row.dias_gracia, 10) || 0,
        estadoCredito: row.estado_credito,
        estado,
        ultimaActualizacion: row.ultima_actualizacion,
        ultimoMovimiento: row.ultima_fecha_movimiento || null,
        ultimoMovimientoDescripcion: row.ultima_descripcion || null,
        ultimoMovimientoTipo: row.ultima_tipo_movimiento || null,
        ultimoSaldoDespues:
          Number.parseFloat(row.ultima_saldo_despues ?? saldo) ||
          saldo,
      };
    });

    const totalCobrar = cartera.reduce((acc, item) => acc + item.saldoDeudor, 0);
    const totalVencido = cartera
      .filter((item) => item.estado === "VENCIDO")
      .reduce((acc, item) => acc + item.saldoDeudor, 0);

    return res.json({
      success: true,
      data: {
        totalCobrar,
        totalVencido,
        conteoClientes: cartera.length,
        cartera,
      },
    });
  } catch (error) {
    console.error("Error al obtener resumen CxC:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener el resumen de cuentas por cobrar",
    });
  }
};

const registrarAbonoCxC = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const clienteIdBody = Number.parseInt(
      req.body?.clienteId ?? req.body?.clienteid,
      10
    );
    const creditoIdBody = Number.parseInt(req.body?.creditoId, 10);
    const monto = Number.parseFloat(req.body?.monto);
    const metodoPagoRaw = (req.body?.metodoPago ?? req.body?.metodo_pago ?? "")
      .toString()
      .trim()
      .toLowerCase();
    const notas = (req.body?.notas ?? req.body?.nota ?? req.body?.concepto ?? "")
      .toString()
      .trim();
    const referencia = (req.body?.referencia ?? "").toString().trim();

    if ((!Number.isInteger(creditoIdBody) || creditoIdBody <= 0) && (!Number.isInteger(clienteIdBody) || clienteIdBody <= 0)) {
      return res.status(400).json({
        success: false,
        message: "Debe proporcionar creditoId o clienteId válido",
      });
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({
        success: false,
        message: "Monto inválido",
      });
    }

    const allowedMetodos = new Set(["efectivo", "transferencia"]);
    const metodoPago = allowedMetodos.has(metodoPagoRaw)
      ? metodoPagoRaw
      : "efectivo";

    const montoCentavos = Math.round(monto * 100);
    if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
      return res.status(400).json({
        success: false,
        message: "Monto inválido",
      });
    }

    const montoNormalizado = Number.parseFloat((montoCentavos / 100).toFixed(2));

    await client.query("BEGIN");

    let creditoRow;
    if (Number.isInteger(creditoIdBody) && creditoIdBody > 0) {
      const creditoResult = await client.query(
        `SELECT credito_id, cliente_id, saldo_deudor, estado_credito
         FROM cliente_creditos
         WHERE credito_id = $1
         FOR UPDATE`,
        [creditoIdBody]
      );

      if (!creditoResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Crédito no encontrado",
        });
      }
      creditoRow = creditoResult.rows[0];
    } else {
      const creditoResult = await client.query(
        `SELECT credito_id, cliente_id, saldo_deudor, estado_credito
         FROM cliente_creditos
         WHERE cliente_id = $1
         ORDER BY credito_id DESC
         FOR UPDATE
         LIMIT 1`,
        [clienteIdBody]
      );

      if (!creditoResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "El cliente no tiene crédito registrado",
        });
      }
      creditoRow = creditoResult.rows[0];
    }

    const creditoId = creditoRow.credito_id;
    const estadoAnterior = (creditoRow.estado_credito || "").toString().trim().toUpperCase();
    const saldoActual = Number.parseFloat(creditoRow.saldo_deudor ?? 0) || 0;
    const saldoActualCentavos = Math.round(saldoActual * 100);

    if (montoCentavos > saldoActualCentavos) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "El monto excede el saldo deudor actual",
      });
    }

    const nuevoSaldoCentavos = saldoActualCentavos - montoCentavos;
    const nuevoSaldo = Number.parseFloat((nuevoSaldoCentavos / 100).toFixed(2));

    const estadoFinal =
      estadoAnterior === "SUSPENDIDO" && nuevoSaldo <= 0 ? "ACTIVO" : estadoAnterior;
    const fueReactivado = estadoAnterior === "SUSPENDIDO" && estadoFinal === "ACTIVO";

    await client.query(
      `UPDATE cliente_creditos
       SET saldo_deudor = $1,
           ultima_actualizacion = NOW(),
           estado_credito = $3
       WHERE credito_id = $2`,
      [nuevoSaldo, creditoId, estadoFinal]
    );

    const rawUserId = req?.user?.id ?? req?.user?.userId;
    const usuarioId = Number.isFinite(Number(rawUserId))
      ? Number.parseInt(rawUserId, 10)
      : null;
    const rol = (req?.user?.rol || "").toString().trim().toLowerCase();

    const adminId =
      rol === "admin" || rol === "superadmin"
        ? usuarioId || null
        : null;
    const agenteId = rol === "agente" ? usuarioId || null : null;

    const descripcionBase =
      notas ||
      `Abono manual registrado (${metodoPago.charAt(0).toUpperCase() + metodoPago.slice(1)})`;
    const descripcion = descripcionBase.slice(0, 200);

    await client.query(
      `INSERT INTO credito_movimientos (
         credito_id,
         tipo_movimiento,
         monto,
         referencia_id,
         descripcion,
         saldo_despues_movimiento,
         registrado_por,
         admin_id,
         agente_id
       )
       VALUES ($1, 'ABONO', $2, $3, $4, $5, $6, $7, $8)`,
      [
        creditoId,
        montoNormalizado,
        metodoPago.toUpperCase(),
        descripcion,
        nuevoSaldo,
        usuarioId || null,
        adminId,
        agenteId,
      ]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: fueReactivado
        ? "Abono registrado y cliente reactivado"
        : "Abono registrado correctamente",
      data: {
        credito: {
          creditoId,
          clienteId: creditoRow.cliente_id,
          saldoDeudor: nuevoSaldo,
          saldoAnterior: saldoActual,
          estadoCredito: estadoFinal,
          fueReactivado,
        },
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // ignore
    }
    console.error("Error al registrar abono CxC:", error);
    return res.status(500).json({
      success: false,
      message: "Error al registrar el abono",
    });
  } finally {
    client.release();
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

    const comprobanteUrl = req.file ? req.file.path : null;

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
    const { tenant_id } = req.tenant;

    const result = await db.query(
      `SELECT
         proveedorid,
         nombreempresa,
         deuda_total_historica,
         saldo_pendiente_pago,
         facturas_vivas
       FROM v_resumen_bancario_proveedores
       WHERE tenant_id = $1
       ORDER BY saldo_pendiente_pago DESC, nombreempresa ASC`,
      [tenant_id]
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
    const { tenant_id } = req.tenant;
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
       WHERE proveedorid = $1 AND tenant_id = $2`,
      [proveedorId, tenant_id]
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

    const comprobanteUrl = req.file?.path
      ? req.file.path
      : null;

    const reglasEmpaqueRes = await client.query(
      `SELECT reglaid, tipoproductoid, cantidadempaque
       FROM proveedor_reglas_empaque
       WHERE proveedorid = $1`,
      [proveedorId]
    );
    const reglasEmpaqueByTipo = new Map();
    const reglasEmpaqueById = new Map();
    for (const r of reglasEmpaqueRes.rows || []) {
      const tipoProductoId = Number.parseInt(r.tipoproductoid, 10);
      const reglaid = Number.parseInt(r.reglaid, 10);
      const cantidadEmpaque = Number.parseInt(r.cantidadempaque, 10);
      if (!Number.isInteger(tipoProductoId) || tipoProductoId <= 0) continue;
      if (!Number.isInteger(reglaid) || reglaid <= 0) continue;
      if (!Number.isInteger(cantidadEmpaque) || cantidadEmpaque <= 0) continue;
      if (!reglasEmpaqueByTipo.has(tipoProductoId)) reglasEmpaqueByTipo.set(tipoProductoId, []);
      reglasEmpaqueByTipo.get(tipoProductoId).push({ reglaid, cantidadEmpaque });
      reglasEmpaqueById.set(reglaid, { tipoProductoId, cantidadEmpaque });
    }

    let montoTotalCentavos = 0;
    const productosActualizados = [];

    for (const raw of items) {
      const detalleId = Number.parseInt(raw?.detalleId, 10);
      const varianteIdReq = raw?.varianteId;
      const cantidadPaquetesRecibidos = Number.parseInt(
        raw?.cantidadPaquetes ?? raw?.cantidadpaquetes ?? raw?.paquetes ?? raw?.cantidadPaquete,
        10
      );
      const cantidadPiezasRecibidas = Number.parseInt(
        raw?.cantidadPiezas ?? raw?.cantidadpiezas ?? raw?.piezas ?? raw?.cantidad,
        10
      );
      const hasPaquetes = Number.isInteger(cantidadPaquetesRecibidos) && cantidadPaquetesRecibidos > 0;
      const hasPiezas = Number.isInteger(cantidadPiezasRecibidas) && cantidadPiezasRecibidas > 0;

      if (!Number.isInteger(detalleId) || detalleId <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "detalleId inválido en items",
        });
      }

      if (!hasPaquetes && !hasPiezas) {
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
           pv.tipoproductoid,
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

      const piezasPorPaqueteSafe = (() => {
        const fromPayload = Number.parseInt(raw?.piezasPorPaquete ?? raw?.piezasporpaquete, 10);
        if (Number.isInteger(fromPayload) && fromPayload > 0) return fromPayload;

        const parsed = Number.parseInt(detalle.piezasporpaquete, 10);
        if (Number.isInteger(parsed) && parsed > 0) return parsed;
        const alt = Number.parseInt(detalle.variante_piezasporpaquete, 10);
        if (Number.isInteger(alt) && alt > 0) return alt;
        return 1;
      })();

      const piezasRecibidasAhora = hasPaquetes
        ? cantidadPaquetesRecibidos * piezasPorPaqueteSafe
        : cantidadPiezasRecibidas;

      if (!Number.isInteger(piezasRecibidasAhora) || piezasRecibidasAhora <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Cantidad recibida inválida (piezas calculadas)",
        });
      }

      const paquetesRecibidosAhora = hasPaquetes
        ? cantidadPaquetesRecibidos
        : Math.floor(piezasRecibidasAhora / Math.max(piezasPorPaqueteSafe, 1));

      const solicitadoPzas = solicitado * piezasPorPaqueteSafe;
      const recibidoPzsActual = Number.parseInt(detalle.piezasrecibidas, 10) || 0;
      const nuevoRecibidoPzas = recibidoPzsActual + piezasRecibidasAhora;
      if (solicitadoPzas > 0 && nuevoRecibidoPzas > solicitadoPzas) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message:
            "La cantidad recibida excede lo solicitado para este renglón. Ajusta la cantidad o revisa el empaque seleccionado.",
        });
      }

      const montoTotalRenglon = Number.parseFloat(
        raw?.montoTotalRenglon ??
          raw?.monto_total_renglon ??
          raw?.montoTotal ??
          raw?.monto_total ??
          raw?.costoTotal ??
          raw?.costo_total ??
          raw?.subtotal,
        10
      );
      const montoTotalRenglonCentavos =
        Number.isFinite(montoTotalRenglon) && montoTotalRenglon > 0
          ? Math.round(montoTotalRenglon * 100)
          : null;

      const costoPaquete = Number.parseFloat(detalle.costounitario ?? 0) || 0;
      const costoVariante = Number.parseFloat(detalle.variante_costounitario ?? 0) || 0;
      const costoUnitarioRaw = Number.parseFloat(
        raw?.costoUnitario ?? raw?.costounitario ?? raw?.costo_unitario ?? raw?.precioUnitario
      );

      const costoUnitario = (() => {
        if (montoTotalRenglonCentavos !== null) {
          const unit = (montoTotalRenglonCentavos / Math.max(piezasRecibidasAhora, 1)) / 100;
          const safe = Number.parseFloat(unit.toFixed(2));
          return Number.isFinite(safe) && safe >= 0 ? safe : 0;
        }
        if (Number.isFinite(costoUnitarioRaw) && costoUnitarioRaw >= 0) return costoUnitarioRaw;
        if (Number.isFinite(costoPaquete) && costoPaquete > 0) return costoPaquete;
        if (Number.isFinite(costoVariante) && costoVariante > 0) return costoVariante;
        return 0;
      })();

      // Costos son UNITARIOS por pieza.
      // Si el frontend envía monto total del renglón, se usa como fuente de verdad.
      const costoUnitarioCentavos = Math.round((Number.parseFloat(costoUnitario) || 0) * 100);
      const subtotalCentavos =
        montoTotalRenglonCentavos !== null
          ? montoTotalRenglonCentavos
          : Math.round((piezasRecibidasAhora || 0) * costoUnitarioCentavos);
      montoTotalCentavos += subtotalCentavos;

      await client.query(
        `UPDATE detallesordencompra
         SET piezasrecibidas = COALESCE(piezasrecibidas, 0) + $1,
             piezasporpaquete = $4,
             costounitario = $5,
             cantidadrecibida = FLOOR(
               (COALESCE(piezasrecibidas, 0) + $1)
               / COALESCE(NULLIF($4, 0), 1)
             )::int
         WHERE detalleoc_id = $2 AND ordencompraid = $3`,
        [
          piezasRecibidasAhora,
          detalleId,
          ordenCompraId,
          piezasPorPaqueteSafe,
          Number.parseFloat((Number.parseFloat(costoUnitario) || 0).toFixed(2)),
        ]
      );

      const stockAnterior = Number.parseInt(detalle.stockvariante, 10) || 0;
      const stockUpdate = await client.query(
        `UPDATE producto_variantes
         SET stock = COALESCE(stock, 0) + $1
         WHERE varianteid = $2
         RETURNING stock`,
        [piezasRecibidasAhora, varianteId]
      );
      const nuevoStock = Number.parseInt(stockUpdate.rows[0]?.stock, 10);
      const nuevoStockSafe = Number.isInteger(nuevoStock)
        ? nuevoStock
        : stockAnterior + piezasRecibidasAhora;

      productosActualizados.push({
        detalleId,
        varianteId,
        sku: detalle.sku,
        nombreProducto: detalle.nombreproducto,
        cantidadRecibidaAhora: piezasRecibidasAhora,
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
    const userRole = req.user.rol;
    const userId = req.user.id;

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden de compra inválido",
      });
    }

    let whereConditions = ['oc.ordencompraid = $1'];
    let queryParams = [ordenCompraId];
    let paramIndex = 2;

    // REGLA DE VISIBILIDAD: Admin solo puede acceder a sus propias órdenes
    if (userRole === 'admin') {
      queryParams.push(userId);
      whereConditions.push(`oc.usuario_creador_id = $${paramIndex}`);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    const ordenResult = await db.query(
      `SELECT
         oc.ordencompraid,
         oc.proveedorid,
         oc.fechacreacion,
         oc.fechaentregaesperada,
         oc.estatus,
         oc.usuario_creador_id,
         p.nombreempresa AS proveedornombre,
         p.contactonombre AS proveedorcontacto
       FROM ordenesdecompra oc
       INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
       WHERE ${whereClause}`,
      queryParams
    );

    if (!ordenResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada o no tienes permiso para acceder a ella",
      });
    }

    const orden = ordenResult.rows[0];

    let reglasEmpaqueProveedor = [];
    try {
      const reglasRes = await db.query(
        `SELECT reglaid, tipoproductoid, cantidadempaque, descripcion, nombre_regla
         FROM proveedor_reglas_empaque
         WHERE proveedorid = $1
         ORDER BY reglaid ASC`,
        [orden.proveedorid]
      );
      reglasEmpaqueProveedor = reglasRes.rows || [];
    } catch (dbError) {
      if (dbError && dbError.code === "42703") {
        const reglasRes = await db.query(
          `SELECT reglaid, tipoproductoid, cantidadempaque, descripcion
           FROM proveedor_reglas_empaque
           WHERE proveedorid = $1
           ORDER BY reglaid ASC`,
          [orden.proveedorid]
        );
        reglasEmpaqueProveedor = reglasRes.rows || [];
      } else {
        throw dbError;
      }
    }

    const reglasEmpaqueByTipo = new Map();
    for (const r of reglasEmpaqueProveedor) {
      const tipoProductoId = Number.parseInt(r.tipoproductoid, 10);
      const reglaid = Number.parseInt(r.reglaid, 10);
      const cantidadEmpaque = Number.parseInt(r.cantidadempaque, 10);
      if (!Number.isInteger(tipoProductoId) || tipoProductoId <= 0) continue;
      if (!Number.isInteger(cantidadEmpaque) || cantidadEmpaque <= 0) continue;

      const nombreRegla = (() => {
        const raw = (r.nombre_regla ?? r.descripcion ?? "").toString().trim();
        if (raw) return raw;
        return `Caja x${cantidadEmpaque}`;
      })();

      if (!reglasEmpaqueByTipo.has(tipoProductoId)) {
        reglasEmpaqueByTipo.set(tipoProductoId, []);
      }
      reglasEmpaqueByTipo.get(tipoProductoId).push({
        reglaId: Number.isInteger(reglaid) && reglaid > 0 ? reglaid : null,
        tipoProductoId,
        cantidadEmpaque,
        nombreRegla,
      });
    }

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
         pi.url_imagen AS imagen
       FROM detallesordencompra doc
       INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
       INNER JOIN productos pr ON pv.productoid = pr.productoid
       LEFT JOIN producto_imagenes pi ON pi.productoid = pr.productoid AND pi.orden = 1
       WHERE doc.ordencompraid = $1
       ORDER BY pr.nombreproducto ASC`,
      [ordenCompraId]
    );

    const items = detallesResult.rows.map((row) => {
      const tipoProductoId = Number.parseInt(row.tipoproductoid, 10);
      const reglasDisponibles = reglasEmpaqueByTipo.get(tipoProductoId) || [];

      const piezasPorPaqueteParsed = Number.parseInt(
        row.piezasporpaquete ??
          row.variante_piezasporpaquete ??
          reglasDisponibles[0]?.cantidadEmpaque,
        10
      );
      const piezasPorPaquete =
        Number.isInteger(piezasPorPaqueteParsed) && piezasPorPaqueteParsed > 0
          ? piezasPorPaqueteParsed
          : 1;

      const solicitadoPaq = Number.parseInt(row.cantidadsolicitada, 10) || 0;
      const solicitadoPzas = solicitadoPaq * piezasPorPaquete;
      const recibidoPzas = (() => {
        const piezasRecibidasRaw = row.piezasrecibidas;
        const piezasRecibidas = Number.parseInt(piezasRecibidasRaw, 10);
        if (Number.isInteger(piezasRecibidas) && piezasRecibidas >= 0) return piezasRecibidas;
        const recibidoPaq = Number.parseInt(row.cantidadrecibida, 10) || 0;
        return recibidoPaq * piezasPorPaquete;
      })();

      const reglaEmpaqueIdSeleccionada = (() => {
        if (!Array.isArray(reglasDisponibles) || reglasDisponibles.length === 0) return null;
        const match = reglasDisponibles.find((r) => r.cantidadEmpaque === piezasPorPaquete);
        return match?.reglaId ?? reglasDisponibles[0]?.reglaId ?? null;
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
        tipoProductoId,
        imagen: row.imagen || null,
        cantidadSolicitada: solicitadoPzas,
        cantidadRecibida: recibidoPzas,
        cantidadSolicitadaPaquetes: solicitadoPaq,
        cantidadRecibidaPaquetes: Number.parseInt(row.cantidadrecibida, 10) || 0,
        piezasRecibidas: Number.parseInt(row.piezasrecibidas, 10) || 0,
        cantidadPendiente: Math.max(solicitadoPzas - recibidoPzas, 0),
        piezasPorPaquete,
        costounitario: row.costounitario !== null ? Number.parseFloat(row.costounitario) : 0,
        stockVariante: Number.parseInt(row.stockvariante, 10) || 0,
        reglas_empaque: {
          cantidadEmpaque: piezasPorPaquete,
          disponibles: reglasDisponibles,
          reglaEmpaqueIdSeleccionada,
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
    // Check if a record already exists
    const checkRes = await client.query(
      `SELECT reglaid FROM proveedor_reglas_empaque 
       WHERE proveedorid = $1 AND tipoproductoid = $2`,
      [proveedorId, tipoProductoId]
    );

    if (checkRes.rows.length > 0) {
      // Update existing record
      const reglaid = checkRes.rows[0].reglaid;
      await client.query(
        `UPDATE proveedor_reglas_empaque 
         SET cantidadempaque = $1 
         WHERE reglaid = $2`,
        [cantidadEmpaque, reglaid]
      );
      return reglaid;
    } else {
      // Insert new record
      const res = await client.query(
        `INSERT INTO proveedor_reglas_empaque (proveedorid, tipoproductoid, cantidadempaque)
         VALUES ($1, $2, $3)
         RETURNING reglaid`,
        [proveedorId, tipoProductoId, cantidadEmpaque]
      );
      return res.rows?.[0]?.reglaid ?? null;
    }
  } catch (dbError) {
    // Fallback for legacy column name
    if (dbError && dbError.code === "42703") {
      const checkRes = await client.query(
        `SELECT reglaid FROM proveedor_reglas_empaque 
         WHERE proveedorid = $1 AND tipoproductoid = $2`,
        [proveedorId, tipoProductoId]
      );

      if (checkRes.rows.length > 0) {
        const reglaid = checkRes.rows[0].reglaid;
        await client.query(
          `UPDATE proveedor_reglas_empaque 
           SET piezasporpaquete = $1 
           WHERE reglaid = $2`,
          [cantidadEmpaque, reglaid]
        );
        return reglaid;
      } else {
        const res = await client.query(
          `INSERT INTO proveedor_reglas_empaque (proveedorid, tipoproductoid, piezasporpaquete)
           VALUES ($1, $2, $3)
           RETURNING reglaid`,
          [proveedorId, tipoProductoId, cantidadEmpaque]
        );
        return res.rows?.[0]?.reglaid ?? null;
      }
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
    const { tenant_id } = req.tenant;
    const result = await db.query(
      `SELECT tp.tipoproductoid, tp.nombre, tp.descripcion
       FROM tipoproducto tp
       WHERE tp.activo = TRUE AND tp.tenant_id = $1
       ORDER BY tp.nombre ASC`,
      [tenant_id]
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
    const { tenant_id } = req.tenant;
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
      `INSERT INTO tipoproducto (nombre, descripcion, activo, tenant_id)
       VALUES ($1, $2, TRUE, $3)
       ON CONFLICT (nombre, tenant_id)
       DO UPDATE SET activo = TRUE,
                    descripcion = COALESCE(EXCLUDED.descripcion, tipoproducto.descripcion)
       RETURNING tipoproductoid, nombre, descripcion`,
      [nombre, descripcion, tenant_id]
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
    const { tenant_id } = req.tenant;
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
      "p.tenant_id = $2",
    ];
    const params = [reglasProveedorId, tenant_id];
    let i = 3;

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
         pv.piezasporpaquete,
         img_producto.url_imagen AS url_imagen_producto,
         img_variante.url_imagen AS url_imagen_variante
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       LEFT JOIN medidas m ON m.medidaid = pv.medidaid
       LEFT JOIN LATERAL (
         SELECT pre.cantidadempaque
         FROM proveedor_reglas_empaque pre
         WHERE pre.reglaid = p.reglaid
         LIMIT 1
       ) regla ON true
       LEFT JOIN LATERAL (
         SELECT pi.url_imagen
         FROM producto_imagenes pi
         WHERE pi.productoid = p.productoid
         ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
         LIMIT 1
       ) img_producto ON true
       LEFT JOIN LATERAL (
         SELECT pvi.url_imagen
         FROM producto_variante_imagenes pvi
         WHERE pvi.varianteid = pv.varianteid
         ORDER BY pvi.orden ASC NULLS LAST, pvi.imagenid ASC
         LIMIT 1
       ) img_variante ON true
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
        url_imagen_producto: row.url_imagen_producto || null,
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
    const { tenant_id } = req.tenant;
    const where = [`p.tenant_id = $1`];
    const values = [tenant_id];

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

    const whereSql = `WHERE ${where.join(" AND ")}`;

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
    const { tenant_id } = req.tenant;
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
       INNER JOIN producto_variantes pv ON pv.varianteid = li.varianteid
       INNER JOIN productos p ON p.productoid = pv.productoid
       LEFT JOIN administradores a ON a.adminid = li.usuarioid
       LEFT JOIN agentesdeventas av ON av.agenteid = li.usuarioid
       WHERE li.varianteid = $1 AND p.tenant_id = $2
       ORDER BY li.fecha DESC
       LIMIT $3`,
      [varianteId, tenant_id, limit]
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
    const { tenant_id } = req.tenant;
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
       WHERE ProveedorID = $1 AND tenant_id = $2`,
      [proveedorId, tenant_id]
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

    // CRITICAL SECURITY: Validar tenant_id del request
    if (!req.tenant || !req.tenant.tenant_id) {
      return res.status(400).json({
        success: false,
        message: "Tenant no identificado",
      });
    }

    const { tenant_id } = req.tenant;

    // Buscar administrador por email Y tenant_id (aislamiento multi-tenant)
    const result = await db.query(
      "SELECT * FROM Administradores WHERE Email = $1 AND tenant_id = $2 AND Activo = TRUE",
      [email, tenant_id]
    );

    let cuenta = null;

    if (result.rows.length > 0) {
      const admin = result.rows[0];
      cuenta = {
        id: admin.adminid,
        email: admin.email,
        nombre: (admin.nombre || "").trim(),
        apellido: (admin.apellido || "").trim(),
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
        WHERE Email = $1 AND tenant_id = $2 AND Activo = TRUE
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
          WHERE Email = $1 AND tenant_id = $2 AND Activo = TRUE
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
          WHERE Email = $1 AND tenant_id = $2 AND Activo = TRUE
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
          WHERE Email = $1 AND tenant_id = $2 AND Activo = TRUE
        `;
      }

      const agenteResult = await db.query(agenteQueryText, [email, tenant_id]);

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
            nombre: (agente.nombre || "").trim(),
            apellido: (agente.apellido || "").trim(),
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
      tenant_id: tenant_id,
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
      { expiresIn: "30d" } // Token válido por 30 días
    );

    const nombreCompleto =
      [cuenta.nombre?.trim(), cuenta.apellido?.trim()].filter(Boolean).join(" ").trim() ||
      cuenta.nombre?.trim() ||
      "Admin";

    // ============================================================================
    // CRÍTICO: PERSISTIR SESIÓN PARA EVITAR EXPULSIÓN INMEDIATA
    // ============================================================================
    // Guardar tenant_id y datos de usuario en la sesión de Express
    // Esto evita que tenantGuard destruya la sesión al detectar un tenant_id "nuevo"
    if (req.session) {
      req.session.tenant_id = tenant_id;
      req.session.userId = cuenta.id;
      req.session.user = {
        id: cuenta.id,
        email: cuenta.email,
        nombre: cuenta.nombre,
        apellido: cuenta.apellido,
        rol: cuenta.rol,
        tipo: 'admin',
        adminSource: cuenta.adminSource,
        tenant_id: tenant_id
      };
      
      console.log(`🔐 [LOGIN ADMIN] Sesión persistida para ${cuenta.email} (Tenant: ${tenant_id})`);
    }

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

/**
 * Obtener estadísticas del dashboard de administrador
 * GET /api/admin/dashboard-stats
 */
const getDashboardStats = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    // Obtener total de pedidos
    const pedidosResult = await db.query(
      `SELECT COUNT(*) as total FROM Pedidos WHERE tenant_id = $1`,
      [tenant_id]
    );

    // Obtener pedidos pendientes
    const pedidosPendientesResult = await db.query(
      `SELECT COUNT(*) as total FROM Pedidos 
       WHERE tenant_id = $1 AND Estatus IN ('Pendiente', 'Procesando')`,
      [tenant_id]
    );

    // Obtener total de clientes activos
    const clientesResult = await db.query(
      `SELECT COUNT(*) as total FROM Clientes 
       WHERE tenant_id = $1 AND Activo = TRUE`,
      [tenant_id]
    );

    // Obtener ventas del mes actual
    const ventasMesResult = await db.query(
      `SELECT COALESCE(SUM(MontoTotal), 0) as total 
       FROM Pedidos 
       WHERE tenant_id = $1 
       AND EXTRACT(MONTH FROM FechaPedido) = EXTRACT(MONTH FROM CURRENT_DATE)
       AND EXTRACT(YEAR FROM FechaPedido) = EXTRACT(YEAR FROM CURRENT_DATE)
       AND Estatus NOT IN ('Cancelado')`,
      [tenant_id]
    );

    res.json({
      success: true,
      data: {
        totalPedidos: parseInt(pedidosResult.rows[0].total),
        pedidosPendientes: parseInt(pedidosPendientesResult.rows[0].total),
        clientesActivos: parseInt(clientesResult.rows[0].total),
        ventasMes: parseFloat(ventasMesResult.rows[0].total)
      }
    });
  } catch (error) {
    console.error("Error al obtener estadísticas del dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener estadísticas",
      error: error.message
    });
  }
};

/**
 * Obtener todos los pedidos (para gestión admin)
 * GET /api/admin/pedidos
 */
const getAllPedidos = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const { estatus, clienteId, agenteId, fechaInicio, fechaFin } = req.query;

    let query = `
      SELECT 
        p.PedidoID,
        p.FechaPedido,
        p.MontoTotal,
        p.Estatus,
        p.CostoEnvio,
        c.Nombre as ClienteNombre,
        c.Apellido as ClienteApellido,
        c.Email as ClienteEmail,
        a.Nombre as AgenteNombre,
        a.Apellido as AgenteApellido,
        a.CodigoAgente,
        d.Ciudad,
        d.EstadoID,
        e.Nombre as EstadoNombre
      FROM Pedidos p
      LEFT JOIN Clientes c ON p.ClienteID = c.ClienteID
      LEFT JOIN AgentesDeVentas a ON p.AgenteID = a.AgenteID
      LEFT JOIN Cliente_Direcciones d ON p.DireccionEnvioID = d.DireccionID
      LEFT JOIN Estados e ON d.EstadoID = e.EstadoID
      WHERE p.tenant_id = $1
    `;

    const params = [tenant_id];
    let paramIndex = 2;

    if (estatus) {
      query += ` AND p.Estatus = $${paramIndex}`;
      params.push(estatus);
      paramIndex++;
    }

    if (clienteId) {
      query += ` AND p.ClienteID = $${paramIndex}`;
      params.push(parseInt(clienteId));
      paramIndex++;
    }

    if (agenteId) {
      query += ` AND p.AgenteID = $${paramIndex}`;
      params.push(parseInt(agenteId));
      paramIndex++;
    }

    if (fechaInicio) {
      query += ` AND p.FechaPedido >= $${paramIndex}`;
      params.push(fechaInicio);
      paramIndex++;
    }

    if (fechaFin) {
      query += ` AND p.FechaPedido <= $${paramIndex}`;
      params.push(fechaFin);
      paramIndex++;
    }

    query += ` ORDER BY p.FechaPedido DESC`;

    const result = await db.query(query, params);

    const pedidos = result.rows.map(row => ({
      pedidoId: row.pedidoid,
      fechaPedido: row.fechapedido,
      montoTotal: parseFloat(row.montototal),
      costoEnvio: row.costoenvio ? parseFloat(row.costoenvio) : 0,
      estatus: row.estatus,
      clienteNombre: `${row.clientenombre || ''} ${row.clienteapellido || ''}`.trim(),
      cliente: {
        nombre: row.clientenombre,
        apellido: row.clienteapellido,
        email: row.clienteemail
      },
      agente: row.agentenombre ? {
        nombre: row.agentenombre,
        apellido: row.agenteapellido,
        codigoAgente: row.codigoagente
      } : null,
      direccion: {
        ciudad: row.ciudad,
        estadoId: row.estadoid,
        estado: row.estadonombre
      }
    }));

    res.json({
      success: true,
      data: {
        pedidos: pedidos
      }
    });
  } catch (error) {
    console.error("Error al obtener pedidos:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener pedidos",
      error: error.message
    });
  }
};

/**
 * Actualizar estatus de un pedido
 * PUT /api/admin/pedidos/:id
 */
const updatePedidoEstatus = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const pedidoId = parseInt(req.params.id);
    const { estatus } = req.body;

    if (!estatus) {
      return res.status(400).json({
        success: false,
        message: "El estatus es requerido"
      });
    }

    const estatusValidos = ['Pendiente', 'Procesando', 'Enviado', 'Entregado', 'Cancelado'];
    if (!estatusValidos.includes(estatus)) {
      return res.status(400).json({
        success: false,
        message: "Estatus inválido"
      });
    }

    const result = await db.query(
      `UPDATE Pedidos 
       SET Estatus = $1, FechaActualizacion = NOW()
       WHERE PedidoID = $2 AND tenant_id = $3
       RETURNING *`,
      [estatus, pedidoId, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado"
      });
    }

    // Crear notificación para el cliente
    try {
      await crearNotificacionServicio({
        clienteId: result.rows[0].clienteid,
        tipo: 'pedido',
        titulo: `Pedido ${estatus}`,
        mensaje: `Tu pedido #${pedidoId} ha sido actualizado a: ${estatus}`,
        url: `/dashboard.html?tab=pedidos`,
        prioridad: 'normal',
        metadata: { pedidoId }
      });
    } catch (notifError) {
      console.error("Error al crear notificación:", notifError);
    }

    res.json({
      success: true,
      message: "Estatus actualizado correctamente",
      data: {
        pedidoId: result.rows[0].pedidoid,
        estatus: result.rows[0].estatus
      }
    });
  } catch (error) {
    console.error("Error al actualizar estatus del pedido:", error);
    res.status(500).json({
      success: false,
      message: "Error al actualizar estatus",
      error: error.message
    });
  }
};

/**
 * Obtener medidas existentes (alias para getMedidas)
 * GET /api/admin/medidas-existentes
 */
const getMedidasExistentes = async (req, res) => {
  // Esta función es un alias de getMedidas para compatibilidad
  return getMedidas(req, res);
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
        `SELECT pre.reglaid, pre.tipoproductoid, pre.cantidadempaque, tp.nombre as nombre_tipo
         FROM proveedor_reglas_empaque pre
         JOIN tipoproducto tp ON pre.tipoproductoid = tp.tipoproductoid
         WHERE pre.proveedorid = $1`,
        [proveedorId]
      );
    } catch (dbError) {
      if (dbError && dbError.code === "42703") {
        reglasResult = await db.query(
          `SELECT pre.reglaid, pre.tipoproductoid, pre.piezasporpaquete AS cantidadempaque, tp.nombre as nombre_tipo
           FROM proveedor_reglas_empaque pre
           JOIN tipoproducto tp ON pre.tipoproductoid = tp.tipoproductoid
           WHERE pre.proveedorid = $1`,
          [proveedorId]
        );
      } else {
        throw dbError;
      }
    }

    const reglas = (reglasResult?.rows || []).map(row => ({
      reglaid: row.reglaid,
      tipoproductoid: row.tipoproductoid,
      cantidadempaque: parseInt(row.cantidadempaque, 10),
      nombre_tipo: row.nombre_tipo,
      nombre_regla: `${row.nombre_tipo} (${row.cantidadempaque} piezas)`
    })).filter(regla => 
      regla.tipoproductoid !== null && 
      regla.cantidadempaque !== null && 
      Number.isInteger(regla.cantidadempaque) && 
      regla.cantidadempaque > 0
    );

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

const getReglasEmpaqueProveedorMultiples = async (req, res) => {
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

    const reglasResult = await db.query(
      `SELECT reglaid, tipoproductoid, cantidadempaque, descripcion
       FROM proveedor_reglas_empaque
       WHERE proveedorid = $1
       ORDER BY tipoproductoid ASC, cantidadempaque ASC, reglaid ASC`,
      [proveedorId]
    );

    const reglas = (reglasResult.rows || []).map((row) => ({
      reglaid: Number.parseInt(row.reglaid, 10) || null,
      tipoproductoid: Number.parseInt(row.tipoproductoid, 10) || null,
      cantidadempaque: Number.parseInt(row.cantidadempaque, 10) || 1,
      nombre_regla: (row.descripcion || "").toString().trim(),
    }));

    return res.status(200).json({
      success: true,
      message: "Reglas de empaque obtenidas exitosamente",
      data: {
        reglas,
      },
    });
  } catch (error) {
    console.error("Error al obtener reglas de empaque múltiples:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener reglas de empaque",
      error: error.message,
    });
  }
};

const saveReglasEmpaqueMultiples = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const proveedorIdRaw = req.body?.proveedorId ?? req.body?.proveedorid ?? req.body?.ProveedorID;
    const proveedorId = Number.parseInt(proveedorIdRaw, 10);

    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProveedorID inválido",
      });
    }

    const reglasInput = Array.isArray(req.body?.reglas) ? req.body.reglas : [];
    if (!reglasInput.length) {
      return res.status(400).json({
        success: false,
        message: "Debes enviar al menos una regla",
      });
    }

    const adminId = req?.user?.id ?? req?.user?.userId ?? null;
    const adminIdParsed = Number.parseInt(adminId, 10);
    if (!Number.isInteger(adminIdParsed) || adminIdParsed <= 0) {
      return res.status(401).json({
        success: false,
        message: "Usuario solicitante no identificado como admin",
      });
    }

    const reglasNormalized = [];
    const tipoNombresSet = new Set();
    const dupeGuard = new Set();

    for (const raw of reglasInput) {
      const reglaidParsed = Number.parseInt(raw?.reglaid, 10);
      const tipoNombre = (raw?.tipo_nombre ?? raw?.tipoNombre ?? "")
        .toString()
        .trim();
      const cantidadempaque = Number.parseInt(
        raw?.cantidadempaque ?? raw?.cantidadEmpaque ?? raw?.piezasPorPaquete,
        10
      );
      const nombreRegla = (raw?.nombre_regla ?? raw?.nombreRegla ?? raw?.descripcion ?? "")
        .toString()
        .trim();

      const reglaid = Number.isInteger(reglaidParsed) && reglaidParsed > 0 ? reglaidParsed : null;

      if (!tipoNombre) {
        return res.status(400).json({
          success: false,
          message: "Hay reglas sin tipo de producto especificado",
        });
      }

      if (!Number.isInteger(cantidadempaque) || cantidadempaque <= 0) {
        return res.status(400).json({
          success: false,
          message: "Hay reglas con cantidadempaque inválida",
        });
      }

      if (!nombreRegla) {
        return res.status(400).json({
          success: false,
          message: "Hay reglas sin nombre_regla",
        });
      }

      const nombreTrim = nombreRegla.length > 100 ? nombreRegla.slice(0, 100) : nombreRegla;
      const tipoNombreTrim = tipoNombre.length > 50 ? tipoNombre.slice(0, 50) : tipoNombre;
      const key = `${tipoNombreTrim.toLowerCase()}|${cantidadempaque}|${nombreTrim.toLowerCase()}`;
      if (dupeGuard.has(key)) {
        return res.status(400).json({
          success: false,
          message: "No se permiten reglas duplicadas (tipo, piezas y nombre)",
        });
      }
      dupeGuard.add(key);
      tipoNombresSet.add(tipoNombreTrim);

      reglasNormalized.push({
        reglaid,
        tipo_nombre: tipoNombreTrim,
        cantidadempaque,
        nombre_regla: nombreTrim,
      });
    }

    await client.query("BEGIN");

    const proveedorResult = await client.query(
      `SELECT proveedorid
       FROM proveedores
       WHERE proveedorid = $1
       FOR UPDATE`,
      [proveedorId]
    );

    if (!proveedorResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Proveedor no encontrado",
      });
    }

    const tipoNombres = Array.from(tipoNombresSet);
    const tiposExistentes = await client.query(
      `SELECT tipoproductoid, nombre
       FROM tipoproducto
       WHERE LOWER(nombre) = ANY($1::text[])`,
      [tipoNombres.map(n => n.toLowerCase())]
    );

    const tipoNombreToIdMap = new Map();
    for (const row of tiposExistentes.rows || []) {
      const id = Number.parseInt(row.tipoproductoid, 10);
      const nombre = (row.nombre || "").toString().trim();
      if (Number.isInteger(id) && id > 0 && nombre) {
        tipoNombreToIdMap.set(nombre.toLowerCase(), id);
      }
    }

    for (const tipoNombre of tipoNombres) {
      const nombreLower = tipoNombre.toLowerCase();
      if (!tipoNombreToIdMap.has(nombreLower)) {
        const insertTipo = await client.query(
          `INSERT INTO tipoproducto (nombre)
           VALUES ($1)
           RETURNING tipoproductoid`,
          [tipoNombre]
        );
        const newId = Number.parseInt(insertTipo.rows?.[0]?.tipoproductoid, 10);
        if (Number.isInteger(newId) && newId > 0) {
          tipoNombreToIdMap.set(nombreLower, newId);
        } else {
          await client.query("ROLLBACK");
          return res.status(500).json({
            success: false,
            message: `No se pudo crear el tipo de producto: ${tipoNombre}`,
          });
        }
      }
    }

    for (const r of reglasNormalized) {
      const tipoId = tipoNombreToIdMap.get(r.tipo_nombre.toLowerCase());
      if (!tipoId) {
        await client.query("ROLLBACK");
        return res.status(500).json({
          success: false,
          message: `No se pudo mapear el tipo de producto: ${r.tipo_nombre}`,
        });
      }
      r.tipoproductoid = tipoId;
    }

    const existentesRes = await client.query(
      `SELECT reglaid
       FROM proveedor_reglas_empaque
       WHERE proveedorid = $1
       FOR UPDATE`,
      [proveedorId]
    );

    const existentesSet = new Set(
      (existentesRes.rows || [])
        .map((r) => Number.parseInt(r.reglaid, 10))
        .filter((id) => Number.isInteger(id) && id > 0)
    );

    const keepIds = [];

    for (const r of reglasNormalized) {
      if (!r.tipoproductoid) {
        await client.query("ROLLBACK");
        return res.status(500).json({
          success: false,
          message: "Error interno: tipoproductoid no asignado",
        });
      }

      if (r.reglaid) {
        if (!existentesSet.has(r.reglaid)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "Hay reglas con reglaid inválido para este proveedor",
          });
        }

        const upd = await client.query(
          `UPDATE proveedor_reglas_empaque
           SET tipoproductoid = $3,
               cantidadempaque = $4,
               descripcion = $5
           WHERE proveedorid = $1 AND reglaid = $2`,
          [proveedorId, r.reglaid, r.tipoproductoid, r.cantidadempaque, r.nombre_regla]
        );

        if (!upd.rowCount) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "No se pudo actualizar una regla (no encontrada)",
          });
        }

        keepIds.push(r.reglaid);
        continue;
      }

      const ins = await client.query(
        `INSERT INTO proveedor_reglas_empaque (proveedorid, tipoproductoid, cantidadempaque, descripcion)
         VALUES ($1, $2, $3, $4)
         RETURNING reglaid`,
        [proveedorId, r.tipoproductoid, r.cantidadempaque, r.nombre_regla]
      );

      const newId = Number.parseInt(ins.rows?.[0]?.reglaid ?? 0, 10);
      if (Number.isInteger(newId) && newId > 0) {
        keepIds.push(newId);
      }
    }

    if (keepIds.length) {
      await client.query(
        `DELETE FROM proveedor_reglas_empaque
         WHERE proveedorid = $1
           AND reglaid <> ALL($2::int[])`,
        [proveedorId, keepIds]
      );
    } else {
      await client.query(`DELETE FROM proveedor_reglas_empaque WHERE proveedorid = $1`, [proveedorId]);
    }

    await client.query("COMMIT");

    const reglasResult = await db.query(
      `SELECT reglaid, tipoproductoid, cantidadempaque, descripcion
       FROM proveedor_reglas_empaque
       WHERE proveedorid = $1
       ORDER BY tipoproductoid ASC, cantidadempaque ASC, reglaid ASC`,
      [proveedorId]
    );

    const reglas = (reglasResult.rows || []).map((row) => ({
      reglaid: Number.parseInt(row.reglaid, 10) || null,
      tipoproductoid: Number.parseInt(row.tipoproductoid, 10) || null,
      cantidadempaque: Number.parseInt(row.cantidadempaque, 10) || 1,
      nombre_regla: (row.descripcion || "").toString().trim(),
    }));

    return res.status(200).json({
      success: true,
      message: "Reglas guardadas correctamente",
      data: {
        reglas,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      // ignore
    }
    console.error("Error al guardar reglas de empaque múltiples:", error);
    return res.status(500).json({
      success: false,
      message: "Error al guardar reglas de empaque",
      error: error.message,
    });
  } finally {
    client.release();
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

    // CRITICAL: Filter by tenant_id for multi-tenant isolation
    const { tenant_id } = req.tenant;

    const agenteResult = await db.query(
      `SELECT AgenteID FROM AgentesDeVentas WHERE AgenteID = $1 AND tenant_id = $2`,
      [agenteId, tenant_id]
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

    // CRITICAL: Filter by tenant_id for multi-tenant isolation
    const { tenant_id } = req.tenant;

    const snapshotResult = await db.query(
      "SELECT * FROM Clientes WHERE ClienteID = $1 AND tenant_id = $2",
      [clienteId, tenant_id]
    );

    if (snapshotResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Cliente no encontrado",
      });
    }

    const datosAnteriores = snapshotResult.rows[0];
    const datosNuevos = { ...datosAnteriores, agenteid: null };

    const rolUsuario = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rolUsuario === "admin" || rolUsuario === "superadmin";

    if (allowDirect) {
      const updateRes = await db.query(
        "UPDATE clientes SET agenteid = $1 WHERE clienteid = $2 AND tenant_id = $3 RETURNING clienteid, nombre, apellido, email, telefono, activo, agenteid",
        [null, clienteId, tenant_id]
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

    // CRITICAL: Filter by tenant_id for multi-tenant isolation
    const { tenant_id } = req.tenant;

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
      WHERE ClienteID = $1 AND tenant_id = $2
    `;

    const clienteResult = await db.query(clienteQuery, [clienteId, tenant_id]);

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

    // CRITICAL: Filter by tenant_id for multi-tenant isolation
    const { tenant_id } = req.tenant;

    const snapshotResult = await db.query(
      "SELECT * FROM Clientes WHERE ClienteID = $1 AND tenant_id = $2",
      [clienteId, tenant_id]
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
        "UPDATE clientes SET activo = $1 WHERE clienteid = $2 AND tenant_id = $3 RETURNING clienteid, activo",
        [activo, clienteId, tenant_id]
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
    const { tenant_id } = req.tenant;

    const result = await db.query(
      `SELECT MedidaID, Nombre, Abreviatura
       FROM Medidas
       WHERE tenant_id = $1
       ORDER BY Nombre ASC`,
      [tenant_id]
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
 * Verificar token de admin
 * GET /api/admin/verify
 */
const verifyAdmin = async (req, res) => {
  try {
    // El middleware ya validó el token y agregó req.user
    const adminId = req.user.id;
    const { tenant_id } = req.tenant;

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
        WHERE AgenteID = $1 AND tenant_id = $2 AND Activo = TRUE`,
        [adminId, tenant_id]
      );

      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Administrador no encontrado",
        });
      }

      const agente = agentResult.rows[0];
      const nombreCompleto =
        [(agente.nombre || "").trim(), (agente.apellido || "").trim()].filter(Boolean).join(" ").trim() ||
        "Admin";

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
        "SELECT AdminID, Nombre, Apellido, Email, Rol FROM Administradores WHERE AdminID = $1 AND tenant_id = $2 AND Activo = TRUE",
        [adminId, tenant_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Administrador no encontrado",
        });
      }

      const admin = result.rows[0];
      const nombreCompleto =
        [(admin.nombre || "").trim(), (admin.apellido || "").trim()].filter(Boolean).join(" ").trim() ||
        "Admin";

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
    
    // CRITICAL: Preserve tenant_id from ORIGINAL token
    const originalTenantId = req.user.tenant_id;
    
    if (!originalTenantId) {
      console.error(`❌ CRITICAL: Admin token refresh attempted for user ${adminId} without tenant_id in token`);
      return res.status(401).json({
        success: false,
        message: "Token inválido: falta tenant_id",
      });
    }

    // Verificar que el admin aún existe y pertenece al tenant correcto
    const result = await db.query(
      `SELECT AdminID FROM Administradores WHERE AdminID = $1 AND tenant_id = $2 AND Activo = TRUE`,
      [adminId, originalTenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Administrador no encontrado o inactivo",
      });
    }

    // Generar un nuevo token PRESERVANDO el tenant_id original
    const { generateToken } = require("../utils/jwtHelper");
    const newToken = generateToken({
      userId: adminId,
      tipo: tipo,
      rol: req.user.rol,
      email: email || null,
      tenant_id: originalTenantId,
    });

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

const findOrCreateTamanosFromPacks = async (client, packs, tenant_id) => {
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
    `SELECT tamanoid, cantidad
     FROM cat_tamanopaquetes
     WHERE cantidad = ANY($1::int[]) AND tenant_id = $2`,
    [cantidades, tenant_id]
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

    // La tabla cat_tamanopaquetes solo tiene columnas tamanoid (PK), cantidad y tenant_id
    const insertResult = await client.query(
      `INSERT INTO cat_tamanopaquetes (cantidad, tenant_id)
       VALUES ($1, $2)
       RETURNING tamanoid, cantidad`,
      [cantidad, tenant_id]
    );

    const newRow = insertResult.rows[0];
    const nuevoTamanoId = Number.parseInt(newRow.tamanoid, 10);
    const cantidadCreada = Number.parseInt(newRow.cantidad, 10);

    if (Number.isInteger(nuevoTamanoId) && Number.isInteger(cantidadCreada)) {
      existentesPorCantidad.set(cantidadCreada, nuevoTamanoId);
      idsResultantes.push(nuevoTamanoId);
    }
  }

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
  { categoriaid, nombreProducto }
) => {
  if (!pool || typeof pool.query !== "function") {
    throw new Error("pool inválido");
  }

  // Si se proporciona el nombre del producto, usar el nuevo sistema
  if (nombreProducto && typeof nombreProducto === "string" && nombreProducto.trim().length > 0) {
    return await generarSkuUnico(nombreProducto.trim());
  }

  // Fallback al sistema antiguo basado en categoría (por compatibilidad)
  const categoriaIdParsed =
    categoriaid !== undefined && categoriaid !== null
      ? Number.parseInt(categoriaid, 10)
      : null;

  if (!Number.isInteger(categoriaIdParsed) || categoriaIdParsed <= 0) {
    throw new Error("CATEGORIA_ID_REQUERIDO_PARA_SKU");
  }

  // Llamar a la función de PostgreSQL para obtener el siguiente SKU
  const result = await pool.query(
    "SELECT obtener_siguiente_sku($1) as nuevo_sku",
    [categoriaIdParsed]
  );

  const nuevoSku = result.rows[0]?.nuevo_sku;

  if (!nuevoSku || typeof nuevoSku !== "string") {
    throw new Error("ERROR_GENERANDO_SKU");
  }

  return nuevoSku;
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
  const { tenant_id } = req.tenant;
  const {
    nombre,
    sku_maestro,
    descripcion,
    categoriaId,
    reglaid: reglaIdRaw,
    reglaId: reglaIdAlt,
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

    const reglaId = await (async () => {
      const rawReglaId = reglaIdRaw ?? reglaIdAlt;
      if (rawReglaId !== undefined && rawReglaId !== null && String(rawReglaId).trim() !== "") {
        const parsed = Number.parseInt(rawReglaId, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error("REGLA_ID_INVALIDO");
        }

        const existe = await client.query(
          `SELECT reglaid FROM proveedor_reglas_empaque WHERE reglaid = $1`,
          [parsed]
        );

        if (!existe.rows.length) {
          throw new Error("REGLA_EMPAQUE_NO_EXISTE");
        }

        return parsed;
      }

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

      if (tipoProductoId && proveedorId) {
        const reglaRes = await client.query(
          `SELECT reglaid FROM proveedor_reglas_empaque
           WHERE proveedorid = $1 AND tipoproductoid = $2
           LIMIT 1`,
          [proveedorId, tipoProductoId]
        );
        if (reglaRes.rows.length > 0) {
          return reglaRes.rows[0].reglaid;
        }
      }

      return null;
    })();

    const tipoProductoIdForSku = reglaId ? (
      await client.query(
        `SELECT tipoproductoid FROM proveedor_reglas_empaque WHERE reglaid = $1`,
        [reglaId]
      )
    ).rows[0]?.tipoproductoid ?? null : null;

    const skuMaestroFinal = await generarSkuMaestro(client, {
      categoriaid: categoriaIdParsed,
      nombreProducto: nombre,
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
      `INSERT INTO Productos (NombreProducto, sku_maestro, Descripcion, CategoriaID, ProveedorID_Default, Activo, reglaid, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ProductoID, NombreProducto, sku_maestro, Descripcion, CategoriaID, ProveedorID_Default AS ProveedorID, Activo, reglaid`,
      [
        nombre,
        skuMaestroFinal,
        descripcion || null,
        categoriaIdParsed,
        proveedorId,
        activoFinal,
        reglaId,
        tenant_id,
      ]
    );

    const producto = result.rows[0];

    // El SKU maestro ya viene en formato híbrido (ej: CAJ-001)
    // Lo usamos directamente como base para las variantes
    const serieSkuBase = skuMaestroFinal || `PROD-${producto.productoid}`;

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
      packs,
      tenant_id
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
        "SELECT tamanoid, cantidad, tenant_id FROM cat_tamanopaquetes WHERE tamanoid = ANY($1::int[])",
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
    }

    // Procesar imágenes maestro (galería unificada) y por color
    let imagenesGeneralesGuardadas = [];
    let imagenesColorGuardadas = [];

    if (req.files) {
      // Galería unificada: todas las imágenes del campo imagenMaestro van a producto_imagenes
      if (req.files.imagenMaestro && Array.isArray(req.files.imagenMaestro)) {
        for (let i = 0; i < req.files.imagenMaestro.length; i++) {
          const file = req.files.imagenMaestro[i];
          const orden = i + 1; // Primera imagen = portada (orden 1)
          
          const result = await client.query(
            `INSERT INTO producto_imagenes (productoid, url_imagen, textoalternativo, orden)
             VALUES ($1, $2, $3, $4)
             RETURNING imagenid, url_imagen, orden`,
            [producto.productoid, file.path, nombre, orden]
          );
          
          imagenesGeneralesGuardadas.push(result.rows[0]);
        }
      }

      // Imágenes por color (separadas, van a producto_imagenes_color)
      if (req.files.imagenesColor && Array.isArray(req.files.imagenesColor)) {
        const imagenesColorMap = procesarImagenesColor(req.files, variantesInput);
        imagenesColorGuardadas = await guardarImagenesColor(
          client,
          producto.productoid,
          imagenesColorMap
        );
      }
    }

    await client.query("COMMIT");
    transactionStarted = false;

    // ============================================
    // AUDITORÍA EXHAUSTIVA: CREACIÓN DE PRODUCTO
    // ============================================
    try {
      await auditLogger.registrarCreacion({
        usuarioId: req.user?.id || req.user?.userId || null,
        nombreUsuario: req.user?.nombre || req.user?.email || 'Sistema',
        rol: req.user?.rol || req.user?.tipo || 'admin',
        entidad: 'Producto',
        entidadId: producto.productoid,
        datos: {
          nombreproducto: producto.nombreproducto,
          sku_maestro: producto.sku_maestro,
          descripcion: producto.descripcion,
          categoriaid: producto.categoriaid,
          proveedorid_default: producto.proveedorid,
          activo: producto.activo,
          reglaid: producto.reglaid,
          tamanosAsociados: tamanosAsociados,
          cantidadImagenes: imagenesGeneralesGuardadas.length,
          cantidadImagenesColor: imagenesColorGuardadas.length
        },
        ip: req.ip || req.connection?.remoteAddress || null,
        tenantId: tenant_id
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría de creación de producto:', auditError);
    }

    return res.status(201).json({
      success: true,
      message: "Producto creado correctamente.",
      data: {
        producto,
        tamanosDisponibles: tamanosAsociados,
        varianteMaestra: null,
        variantes: [],
        imagenesGenerales: imagenesGeneralesGuardadas,
        imagenesColor: imagenesColorGuardadas,
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
 * 
 * SCHEMA (backup.sql):
 * - tamanoid (PK, integer)
 * - cantidad (integer, NOT NULL)
 * - tenant_id (integer, FK to tenants)
 */
const getTamanosPaquetes = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    const result = await db.query(
      `SELECT tamanoid, cantidad, tenant_id
       FROM cat_tamanopaquetes
       WHERE tenant_id = $1
       ORDER BY cantidad ASC`,
      [tenant_id]
    );

    const tamanos = result.rows.map((row) => ({
      tamanoId: row.tamanoid,
      cantidad: row.cantidad,
      valor: row.cantidad, // Alias para compatibilidad con frontend
      etiqueta: `${row.cantidad} ${row.cantidad === 1 ? 'pieza' : 'piezas'}`,
      tenant_id: row.tenant_id
    }));

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
      error: error.message
    });
  }
};

/**
 * Actualizar un producto existente
 * PUT /api/admin/productos/:id
 */
const actualizarProducto = async (req, res) => {
  const { tenant_id } = req.tenant;
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
    reglaid: reglaIdRaw,
    reglaId: reglaIdAlt,
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
      `SELECT ProductoID, NombreProducto, sku_maestro, Descripcion, CategoriaID, ProveedorID_Default AS ProveedorID, Activo, reglaid
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

    const reglaId = await (async () => {
      const rawReglaId = reglaIdRaw ?? reglaIdAlt;
      if (rawReglaId !== undefined) {
        if (rawReglaId === null || String(rawReglaId).trim() === "") {
          return null;
        }
        const parsed = Number.parseInt(rawReglaId, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error("REGLA_ID_INVALIDO");
        }

        const existe = await client.query(
          `SELECT reglaid FROM proveedor_reglas_empaque WHERE reglaid = $1`,
          [parsed]
        );

        if (!existe.rows.length) {
          throw new Error("REGLA_EMPAQUE_NO_EXISTE");
        }

        return parsed;
      }

      const tipoProductoId = await (async () => {
        if (tipoProductoIdRaw !== undefined) {
          if (tipoProductoIdRaw === null || String(tipoProductoIdRaw).trim() === "") {
            return null;
          }
          const parsed = Number.parseInt(tipoProductoIdRaw, 10);
          if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new Error("TIPO_PRODUCTO_INVALIDO");
          }
          const r = await client.query(
            `SELECT tipoproductoid
             FROM tipoproducto
             WHERE tipoproductoid = $1
               AND activo = TRUE`,
            [parsed]
          );
          if (!r.rows.length) throw new Error("TIPO_PRODUCTO_NO_EXISTE");
          return parsed;
        }

        if (tipoProductoNombre === null || tipoProductoNombre === "") {
          return null;
        }
        const r = await client.query(
          `INSERT INTO tipoproducto (nombre, descripcion, activo)
           VALUES ($1, NULL, TRUE)
           ON CONFLICT (nombre)
           DO UPDATE SET activo = TRUE
           RETURNING tipoproductoid`,
          [tipoProductoNombre]
        );
        return r.rows[0]?.tipoproductoid ?? null;
      })();

      if (tipoProductoId && proveedorId) {
        const reglaRes = await client.query(
          `SELECT reglaid FROM proveedor_reglas_empaque
           WHERE proveedorid = $1 AND tipoproductoid = $2
           LIMIT 1`,
          [proveedorId, tipoProductoId]
        );
        if (reglaRes.rows.length > 0) {
          return reglaRes.rows[0].reglaid;
        }
      }

      return productoActual.reglaid ?? null;
    })();

    const datosNuevosProducto = {
      NombreProducto: nombreFinal,
      Descripcion: descripcionFinal,
      CategoriaID: categoriaFinal,
      ProveedorID_Default: proveedorId,
      Activo: activoFinal,
      reglaid: reglaId,
    };

    const updateProductoRes = await client.query(
      `UPDATE productos
       SET nombreproducto = $1,
           descripcion = $2,
           categoriaid = $3,
           proveedorid_default = $4,
           activo = $5,
           reglaid = $6
       WHERE productoid = $7
       RETURNING productoid, nombreproducto, sku_maestro, descripcion, categoriaid, proveedorid_default, activo, reglaid`,
      [
        datosNuevosProducto.NombreProducto,
        datosNuevosProducto.Descripcion,
        datosNuevosProducto.CategoriaID,
        datosNuevosProducto.ProveedorID_Default,
        datosNuevosProducto.Activo,
        reglaId,
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

    // ============================================
    // SINCRONIZACIÓN DE RELACIONES: TAMANOS/PACKS
    // ============================================
    console.log("🔄 [BACKEND] Sincronizando tamanos/packs para producto:", productoId);
    console.log("🔄 [BACKEND] tamanoIds recibidos:", tamanoIds);
    console.log("🔄 [BACKEND] tamanos recibidos:", tamanos);

    // Determinar los tamanoIds a sincronizar
    let tamanoIdsToSync = [];
    
    // Procesar tamanoIds directos
    if (Array.isArray(tamanoIds) && tamanoIds.length > 0) {
      tamanoIdsToSync = tamanoIds
        .map(id => Number.parseInt(id, 10))
        .filter(id => Number.isInteger(id) && id > 0);
    } else if (Array.isArray(tamanos) && tamanos.length > 0) {
      tamanoIdsToSync = tamanos
        .map(id => Number.parseInt(id, 10))
        .filter(id => Number.isInteger(id) && id > 0);
    }

    // Procesar packs array: convertir valores de packs a tamanoIds
    if (Array.isArray(packs) && packs.length > 0) {
      console.log("📦 [BACKEND] Procesando packs array:", packs);
      const tamanoIdsFromPacks = await findOrCreateTamanosFromPacks(client, packs, tenant_id);
      console.log("📦 [BACKEND] TamanoIds obtenidos de packs:", tamanoIdsFromPacks);
      
      // Combinar con los tamanoIds existentes (sin duplicados)
      tamanoIdsToSync = [...new Set([...tamanoIdsToSync, ...tamanoIdsFromPacks])];
    }

    console.log("🔄 [BACKEND] tamanoIds a sincronizar (parseados + packs):", tamanoIdsToSync);

    // Si se enviaron tamanoIds (incluso si es un array vacío), sincronizar
    if (tamanoIds !== undefined || tamanos !== undefined) {
      // PASO A: Eliminar todas las relaciones antiguas
      const deleteResult = await client.query(
        `DELETE FROM producto_tamanosdisponibles WHERE productoid = $1`,
        [productoId]
      );
      console.log(`✅ [BACKEND] Eliminadas ${deleteResult.rowCount} relaciones antiguas de tamanos`);

      // PASO B: Insertar las nuevas relaciones
      if (tamanoIdsToSync.length > 0) {
        // Validar que todos los tamanoIds existen en el catálogo
        const validationResult = await client.query(
          `SELECT tamanoid FROM cat_tamanopaquetes WHERE tamanoid = ANY($1::int[])`,
          [tamanoIdsToSync]
        );

        const validTamanoIds = validationResult.rows.map(row => 
          Number.parseInt(row.tamanoid, 10)
        );

        console.log("✅ [BACKEND] TamanoIds válidos en catálogo:", validTamanoIds);

        // Insertar solo los IDs válidos
        for (const tamanoId of validTamanoIds) {
          await client.query(
            `INSERT INTO producto_tamanosdisponibles (productoid, tamanoid)
             VALUES ($1, $2)
             ON CONFLICT (productoid, tamanoid) DO NOTHING`,
            [productoId, tamanoId]
          );
        }

        console.log(`✅ [BACKEND] Insertadas ${validTamanoIds.length} nuevas relaciones de tamanos`);

        // Advertir si algunos IDs no eran válidos
        const invalidIds = tamanoIdsToSync.filter(id => !validTamanoIds.includes(id));
        if (invalidIds.length > 0) {
          console.warn(`⚠️ [BACKEND] TamanoIds inválidos ignorados:`, invalidIds);
        }
      } else {
        console.log("ℹ️ [BACKEND] No hay tamanos para insertar (array vacío o undefined)");
      }
    } else {
      console.log("ℹ️ [BACKEND] No se enviaron tamanoIds/tamanos, no se sincroniza");
    }

    // ============================================
    // SINCRONIZACIÓN DE RELACIONES: PACKS (si aplica)
    // ============================================
    // Nota: Si tienes una tabla de packs personalizados, agregar lógica similar aquí
    if (packs !== undefined) {
      console.log("🔄 [BACKEND] Packs recibidos:", packs);
      // TODO: Implementar sincronización de packs si existe tabla de relación
      // Ejemplo:
      // await client.query(`DELETE FROM producto_packs WHERE productoid = $1`, [productoId]);
      // for (const pack of packs) { ... INSERT ... }
    }

    await client.query("COMMIT");
    transactionStarted = false;

    // ============================================
    // AUDITORÍA EXHAUSTIVA: ACTUALIZACIÓN CON DIFF
    // ============================================
    try {
      await auditLogger.registrarActualizacion({
        usuarioId: req.user?.id || req.user?.userId || null,
        nombreUsuario: req.user?.nombre || req.user?.email || 'Sistema',
        rol: req.user?.rol || req.user?.tipo || 'admin',
        entidad: 'Producto',
        entidadId: productoId,
        datosAnteriores: {
          nombreproducto: productoActual.nombreproducto,
          descripcion: productoActual.descripcion,
          categoriaid: productoActual.categoriaid,
          proveedorid_default: productoActual.proveedorid,
          activo: productoActual.activo,
          reglaid: productoActual.reglaid
        },
        datosNuevos: {
          nombreproducto: productoActualizado.nombreproducto,
          descripcion: productoActualizado.descripcion,
          categoriaid: productoActualizado.categoriaid,
          proveedorid_default: productoActualizado.proveedorid_default,
          activo: productoActualizado.activo,
          reglaid: productoActualizado.reglaid
        },
        ip: req.ip || req.connection?.remoteAddress || null,
        tenantId: tenant_id
      });
    } catch (auditError) {
      console.error('Error al registrar auditoría de actualización de producto:', auditError);
    }

    return res.json({
      success: true,
      message: "Producto actualizado correctamente.",
      data: {
        productoId,
        tamanosActualizados: tamanoIdsToSync.length,
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
    const userRol = req.user?.rol?.toLowerCase();
    const isSuperAdmin = userRol === 'superadmin' || userRol === 'super-admin';

    const query = `
      SELECT
        p.ProductoID,
        p.NombreProducto,
        p.Activo,
        c.Nombre AS NombreCategoria,
        COUNT(v.VarianteID) AS TotalVariantes
        ${isSuperAdmin ? `,
        STRING_AGG(DISTINCT CONCAT(a.Nombre, ' ', COALESCE(a.Apellido, '')), ', ') AS AdminsRegistrados
        ` : ''}
      FROM Productos p
      LEFT JOIN Categorias c ON c.CategoriaID = p.CategoriaID
      LEFT JOIN Producto_Variantes v ON v.ProductoID = p.ProductoID
      ${isSuperAdmin ? `
      LEFT JOIN inventarios_admin ia ON ia.variante_id = v.VarianteID
      LEFT JOIN administradores a ON a.AdminID = ia.registrado_por
      ` : ''}
      GROUP BY p.ProductoID, p.NombreProducto, p.Activo, c.Nombre
      ORDER BY p.NombreProducto ASC
    `;

    const result = await db.query(query);

    const productos = result.rows.map((row) => ({
      productoId: row.productoid,
      nombreProducto: row.nombreproducto,
      activo: row.activo !== undefined ? row.activo : true,
      nombreCategoria: row.nombrecategoria || "Sin categoría",
      totalVariantes:
        row.totalvariantes !== null ? parseInt(row.totalvariantes, 10) : 0,
      ...(isSuperAdmin && { adminsRegistrados: row.adminsregistrados || 'N/A' })
    }));

    res.json({
      success: true,
      data: {
        productos,
        total: productos.length,
        isSuperAdmin
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
 * Obtener detalle completo de producto para modal de inventario
 * GET /api/admin/inventario/producto-detalle/:id
 * Incluye: proveedor, variantes con stock por admin, totales
 */
const getProductoDetalleInventario = async (req, res) => {
  try {
    const productoId = parseInt(req.params.id, 10);
    const adminId = req.user?.id;

    if (Number.isNaN(productoId)) {
      return res.status(400).json({
        success: false,
        message: "ProductoID inválido",
      });
    }

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado",
      });
    }

    // Consulta principal con JOINs optimizados
    const productoQuery = `
      SELECT
        p.productoid,
        p.nombreproducto,
        p.sku_maestro,
        p.descripcion,
        p.proveedorid_default,
        p.activo,
        p.categoriaid,
        prov.nombreempresa AS proveedor_nombre,
        c.nombre AS categoria_nombre,
        (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'imagenId', pi.imagenid,
              'url', pi.url_imagen,
              'textoAlternativo', pi.textoalternativo,
              'orden', pi.orden
            ) ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
          )
          FROM producto_imagenes pi
          WHERE pi.productoid = p.productoid
        ) AS imagenes,
        (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'varianteId', pv.varianteid,
              'sku', pv.sku,
              'dimensiones', pv.dimensiones,
              'colorNombre', pv.color_nombre,
              'precioUnitario', pv.preciounitario,
              'stock', COALESCE(ia.cantidad, 0),
              'activo', pv.activo
            )
          )
          FROM producto_variantes pv
          LEFT JOIN inventarios_admin ia ON ia.variante_id = pv.varianteid AND ia.admin_id = $2
          WHERE pv.productoid = p.productoid
        ) AS lista_variantes,
        (
          SELECT COUNT(*)
          FROM producto_variantes pv
          WHERE pv.productoid = p.productoid
        ) AS total_variantes,
        (
          SELECT COALESCE(SUM(ia.cantidad), 0)
          FROM producto_variantes pv
          LEFT JOIN inventarios_admin ia ON ia.variante_id = pv.varianteid AND ia.admin_id = $2
          WHERE pv.productoid = p.productoid
        ) AS total_stock
      FROM productos p
      LEFT JOIN proveedores prov ON prov.proveedorid = p.proveedorid_default
      LEFT JOIN categorias c ON c.categoriaid = p.categoriaid
      WHERE p.productoid = $1
    `;

    const result = await db.query(productoQuery, [productoId, adminId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    const row = result.rows[0];
    const variantes = row.lista_variantes || [];
    const imagenes = row.imagenes || [];

    // Debug: Log raw data
    console.log('Raw variantes data:', JSON.stringify(variantes, null, 2));

    const productoDetalle = {
      productoId: row.productoid,
      nombreProducto: row.nombreproducto,
      skuMaestro: row.sku_maestro || "Sin SKU",
      descripcion: row.descripcion || "Sin descripción",
      proveedor: row.proveedor_nombre || "Sin asignar",
      categoria: row.categoria_nombre || "Sin categoría",
      activo: row.activo,
      totalVariantes: parseInt(row.total_variantes, 10) || 0,
      totalStock: parseInt(row.total_stock, 10) || 0,
      imagenes: imagenes.map(img => ({
        imagenId: img.imagenid,
        url: img.url,
        textoAlternativo: img.textoalternativo || null,
        orden: img.orden !== null && img.orden !== undefined ? parseInt(img.orden, 10) : null
      })),
      variantes: variantes.map(v => {
        // PostgreSQL devuelve las claves en minúsculas desde JSON_BUILD_OBJECT
        const precioRaw = v.precioUnitario || v.preciounitario;
        const precio = precioRaw !== null && precioRaw !== undefined 
          ? parseFloat(precioRaw) 
          : 0;
        console.log(`Variante ${v.sku}: precioUnitario=${v.precioUnitario}, preciounitario=${v.preciounitario}, parsed=${precio}`);
        
        // Extract medida and color separately
        const medida = v.dimensiones || null;
        const color = v.colorNombre || v.colornombre || null;
        
        return {
          varianteId: v.varianteId || v.varianteid,
          sku: v.sku || "Sin SKU",
          medida: medida,
          color: color,
          caracteristica: color || medida || "Sin especificar",
          precio: precio,
          stock: parseInt(v.stock, 10) || 0,
          activo: v.activo !== false
        };
      })
    };

    return res.json({
      success: true,
      message: "Detalle de producto obtenido exitosamente",
      data: productoDetalle,
    });
  } catch (error) {
    console.error("Error al obtener detalle de inventario:", error);
    return res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message,
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
         p.reglaid,
         pre.tipoproductoid,
         c.nombre AS categorianombre,
         c.descripcion AS categoriadescripcion
       FROM productos p
       LEFT JOIN categorias c ON c.categoriaid = p.categoriaid
       LEFT JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
       LEFT JOIN tipoproducto tp ON tp.tipoproductoid = pre.tipoproductoid
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
         pv.activo
       FROM producto_variantes pv
       WHERE pv.productoid = $1
       ORDER BY pv.varianteid ASC`,
      [productoId]
    );

    // Fetch variant images separately
    const variantImagenesResult = await db.query(
      `SELECT 
         pvi.varianteid,
         pvi.url_imagen,
         pvi.textoalternativo,
         pvi.orden
       FROM producto_variante_imagenes pvi
       WHERE pvi.varianteid = ANY(
         SELECT varianteid FROM producto_variantes WHERE productoid = $1
       )
       ORDER BY pvi.varianteid, pvi.orden`,
      [productoId]
    );

    // Group images by varianteid
    const variantImagenesMap = {};
    variantImagenesResult.rows.forEach(img => {
      if (!variantImagenesMap[img.varianteid]) {
        variantImagenesMap[img.varianteid] = [];
      }
      variantImagenesMap[img.varianteid].push({
        url: img.url_imagen,
        textoAlternativo: img.textoalternativo,
        orden: img.orden
      });
    });

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

      // Get images for this variant
      const variantImages = variantImagenesMap[row.varianteid] || [];
      const primaryImage = variantImages.length > 0 ? variantImages[0].url : null;

      return {
        varianteId: row.varianteid,
        productoId: row.productoid,
        sku: row.sku || null,
        dimensiones: row.dimensiones || null,
        colorNombre: row.color_nombre || null,
        urlImagenVariante: primaryImage,
        imagenes: variantImages,
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
        p.reglaid,
        pre.tipoproductoid,
        tp.nombre AS tipo_producto,
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
      LEFT JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
      LEFT JOIN tipoproducto tp ON tp.tipoproductoid = pre.tipoproductoid
      LEFT JOIN producto_variantes v ON v.productoid = p.productoid
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
        p.activo,
        p.reglaid,
        pre.tipoproductoid,
        tp.nombre,
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
            activo: row.activo === true || row.activo === 't' || row.activo === 1,
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
    const { tenant_id } = req.tenant;
    const result = await db.query(
      `SELECT 
        c.CategoriaID,
        c.Nombre,
        c.Descripcion,
        c.ParentCategoriaID,
        c.Activo,
        c.imagen_url,
        c.imagen_public_id,
        p.Nombre AS ParentNombre
      FROM Categorias c
      LEFT JOIN Categorias p ON c.ParentCategoriaID = p.CategoriaID
      WHERE c.tenant_id = $1
      ORDER BY c.Nombre`,
      [tenant_id]
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
          imagenUrl: row.imagen_url || null,
          imagenPublicId: row.imagen_public_id || null,
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
    const { tenant_id } = req.tenant;
    const { nombre, descripcion, parentCategoriaId, activo } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({
        success: false,
        message: "El nombre de la categoría es requerido",
      });
    }

    // Obtener datos de imagen si se subió
    const imagenUrl = req.file?.secure_url || req.file?.path || null;
    const imagenPublicId = req.file?.public_id || null;

    let parentCategoria = null;

    if (parentCategoriaId !== undefined && parentCategoriaId !== null) {
      const parentResult = await db.query(
        "SELECT CategoriaID FROM Categorias WHERE CategoriaID = $1 AND tenant_id = $2",
        [parentCategoriaId, tenant_id]
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
      "SELECT CategoriaID FROM Categorias WHERE LOWER(Nombre) = LOWER($1) AND tenant_id = $2",
      [nombreNormalizado, tenant_id]
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
      ImagenUrl: imagenUrl,
      ImagenPublicId: imagenPublicId,
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
        "INSERT INTO categorias (nombre, descripcion, parentcategoriaid, activo, imagen_url, imagen_public_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING categoriaid, nombre, descripcion, parentcategoriaid, activo, imagen_url, imagen_public_id",
        [
          datosNuevos.Nombre,
          datosNuevos.Descripcion,
          datosNuevos.ParentCategoriaID,
          datosNuevos.Activo,
          datosNuevos.ImagenUrl,
          datosNuevos.ImagenPublicId,
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
          imagen_url: row.imagen_url,
          imagen_public_id: row.imagen_public_id,
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
            imagenUrl: row.imagen_url,
            imagenPublicId: row.imagen_public_id,
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

    // Obtener datos de imagen si se subió una nueva
    const nuevaImagenUrl = req.file?.secure_url || req.file?.path || null;
    const nuevaImagenPublicId = req.file?.public_id || null;

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

    // Si se subió una nueva imagen, eliminar la anterior de Cloudinary
    if (nuevaImagenPublicId && categoriaActual.imagen_public_id) {
      try {
        await eliminarImagenCloudinary(categoriaActual.imagen_public_id);
      } catch (error) {
        console.warn("⚠️ Error al eliminar imagen anterior de Cloudinary:", error);
        // No bloqueamos la actualización si falla la eliminación
      }
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
      ImagenUrl: nuevaImagenUrl || categoriaActual.imagen_url,
      ImagenPublicId: nuevaImagenPublicId || categoriaActual.imagen_public_id,
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
        "UPDATE categorias SET nombre = $1, descripcion = $2, parentcategoriaid = $3, activo = $4, imagen_url = $5, imagen_public_id = $6 WHERE categoriaid = $7 RETURNING categoriaid, nombre, descripcion, parentcategoriaid, activo, imagen_url, imagen_public_id",
        [
          datosNuevos.Nombre,
          datosNuevos.Descripcion,
          datosNuevos.ParentCategoriaID,
          datosNuevos.Activo,
          datosNuevos.ImagenUrl,
          datosNuevos.ImagenPublicId,
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
          imagen_url: row.imagen_url,
          imagen_public_id: row.imagen_public_id,
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
            imagenUrl: row.imagen_url,
            imagenPublicId: row.imagen_public_id,
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
 * Toggle product visibility (activo field)
 * PUT /api/admin/productos/:id/toggle-visibilidad
 */
const toggleProductoVisibilidad = async (req, res) => {
  try {
    const productoId = parseInt(req.params.id, 10);
    const { activo } = req.body;

    if (Number.isNaN(productoId)) {
      return res.status(400).json({
        success: false,
        message: "ID de producto inválido",
      });
    }

    if (typeof activo !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "El campo 'activo' debe ser un valor booleano",
      });
    }

    // Verificar que el producto existe
    const productoResult = await db.query(
      "SELECT productoid, activo FROM productos WHERE productoid = $1",
      [productoId]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    // Actualizar el estado
    const updateResult = await db.query(
      "UPDATE productos SET activo = $1 WHERE productoid = $2 RETURNING productoid, activo",
      [activo, productoId]
    );

    const producto = updateResult.rows[0];

    // Registrar en auditoría
    await auditService.registrarCambioPasivo(
      req,
      "productos",
      productoId,
      "UPDATE",
      productoResult.rows[0],
      producto
    );

    return res.json({
      success: true,
      message: `Producto ${activo ? 'activado' : 'desactivado'} correctamente`,
      data: {
        productoId: producto.productoid,
        activo: producto.activo,
      },
    });
  } catch (error) {
    console.error("Error al cambiar visibilidad del producto:", error);
    return res.status(500).json({
      success: false,
      message: "Error al cambiar la visibilidad del producto",
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

    // Verificar unicidad global del email (no debe existir en ninguna tabla)
    const emailCheckGlobal = await checkEmailGlobalUniqueness(email, "agentesdeventas");

    if (emailCheckGlobal.exists) {
      const errorMessage = getContextualErrorMessage(
        emailCheckGlobal.table,
        "agentesdeventas"
      );
      return res.status(400).json({
        success: false,
        message: errorMessage,
      });
    }

    const nuevoCodigoAgente = await generateCodigoAgente(db);

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    const rol = (req?.user?.rol || "").toString().trim().toLowerCase();
    const allowDirect = rol === "admin" || rol === "superadmin";

    // CRITICAL: Include tenant_id for multi-tenant isolation
    const { tenant_id } = req.tenant;

    if (allowDirect) {
      const insertRes = await db.query(
        "INSERT INTO agentesdeventas (nombre, apellido, email, passwordhash, codigoagente, activo, esadmin, adminrol, tenant_id) VALUES ($1, $2, $3, $4, $5, TRUE, FALSE, NULL, $6) RETURNING agenteid, nombre, apellido, email, codigoagente, activo, esadmin, adminrol",
        [nombre.trim(), apellido.trim(), email, hashedPassword, nuevoCodigoAgente, tenant_id]
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
    // CRITICAL: Filter by tenant_id for multi-tenant isolation
    const { tenant_id } = req.tenant;

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
      WHERE a.tenant_id = $1
      GROUP BY a.AgenteID
      ORDER BY a.AgenteID DESC`,
      [tenant_id]
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

    // CRITICAL: Filter by tenant_id for multi-tenant isolation
    const { tenant_id } = req.tenant;

    // Obtener información del agente
    const agenteResult = await db.query(
      `SELECT 
        AgenteID, Nombre, Apellido, Email, CodigoAgente, Activo
      FROM AgentesDeVentas
      WHERE AgenteID = $1 AND tenant_id = $2`,
      [agenteId, tenant_id]
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

    // CRITICAL: Filter by tenant_id for multi-tenant isolation
    const { tenant_id } = req.tenant;

    const snapshotResult = await db.query(
      "SELECT * FROM AgentesDeVentas WHERE AgenteID = $1 AND tenant_id = $2",
      [agenteId, tenant_id]
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
        "UPDATE agentesdeventas SET activo = FALSE WHERE agenteid = $1 AND tenant_id = $2 RETURNING agenteid, nombre, apellido, email, codigoagente, activo, esadmin, adminrol",
        [agenteId, tenant_id]
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
    // CRITICAL: Filter by tenant_id for multi-tenant isolation
    const { tenant_id } = req.tenant;

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
      WHERE c.tenant_id = $1
      GROUP BY c.ClienteID
      ORDER BY c.FechaDeRegistro DESC`,
      [tenant_id]
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
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON dp.varianteid = pv.varianteid
      INNER JOIN productos pr ON pv.productoid = pr.productoid
      LEFT JOIN cat_tamanopaquetes ct ON dp.tamanoid = ct.tamanoid
      WHERE dp.pedidoid = $1`,
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
    const { tenant_id } = req.tenant;

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
      WHERE tenant_id = $1
      ORDER BY NombreEmpresa ASC
    `;

    const result = await db.query(query, [tenant_id]);
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

    const { tenant_id } = req.tenant;

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
        aceptadevoluciones,
        tenant_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
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
        tenant_id,
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

    const { tenant_id } = req.tenant;

    // Verificar que el proveedor existe y obtener snapshot actual
    const checkQuery =
      "SELECT * FROM Proveedores WHERE ProveedorID = $1 AND tenant_id = $2";
    const checkResult = await client.query(checkQuery, [proveedorId, tenant_id]);

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
    const { estatus, adminId } = req.query;
    const userRole = req.user.rol;
    const userId = req.user.id;

    let query = `
      SELECT 
        oc.OrdenCompraID,
        oc.ProveedorID,
        oc.FechaCreacion,
        oc.FechaEntregaEsperada,
        oc.Estatus,
        oc.OrigenOC,
        oc.usuario_creador_id,
        p.NombreEmpresa as ProveedorNombre,
        COUNT(doc.DetalleOC_ID) as TotalProductos,
        a.nombre as PropietarioNombre
      FROM OrdenesDeCompra oc
      INNER JOIN Proveedores p ON oc.ProveedorID = p.ProveedorID
      LEFT JOIN DetallesOrdenCompra doc ON oc.OrdenCompraID = doc.OrdenCompraID
      LEFT JOIN Administradores a ON oc.usuario_creador_id = a.adminid
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    // REGLA DE VISIBILIDAD: Admin solo ve sus registros, SuperAdmin ve todos o filtra por adminId
    if (userRole === 'admin') {
      query += ` AND oc.usuario_creador_id = $${paramIndex}`;
      values.push(userId);
      paramIndex++;
    } else if (userRole === 'superadmin' && adminId) {
      // SuperAdmin filtrando por un admin específico
      query += ` AND oc.usuario_creador_id = $${paramIndex}`;
      values.push(parseInt(adminId));
      paramIndex++;
    }
    // Si es superadmin sin filtro adminId, ve todos los registros

    // Filtrar por estatus si se proporciona
    if (estatus) {
      if (estatus === "Pendiente,Parcial") {
        query += ` AND oc.Estatus IN ('Pendiente', 'Parcial')`;
      } else {
        query += ` AND oc.Estatus = $${paramIndex}`;
        values.push(estatus);
        paramIndex++;
      }
    }

    query += `
      GROUP BY oc.OrdenCompraID, oc.ProveedorID, oc.FechaCreacion, 
               oc.FechaEntregaEsperada, oc.Estatus, oc.OrigenOC, oc.usuario_creador_id,
               p.NombreEmpresa, a.nombre
      ORDER BY oc.FechaCreacion DESC
    `;

    const result = await db.query(query, values);

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
          usuarioCreadorId: row.usuario_creador_id,
          propietarioNombre: row.propietarionombre || 'Sin asignar',
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

    let reglasEmpaqueProveedor = [];
    try {
      const reglasRes = await db.query(
        `SELECT reglaid, tipoproductoid, cantidadempaque, descripcion, nombre_regla
         FROM proveedor_reglas_empaque
         WHERE proveedorid = $1
         ORDER BY reglaid ASC`,
        [orden.proveedorid]
      );
      reglasEmpaqueProveedor = reglasRes.rows || [];
    } catch (dbError) {
      if (dbError && dbError.code === "42703") {
        const reglasRes = await db.query(
          `SELECT reglaid, tipoproductoid, cantidadempaque, descripcion
           FROM proveedor_reglas_empaque
           WHERE proveedorid = $1
           ORDER BY reglaid ASC`,
          [orden.proveedorid]
        );
        reglasEmpaqueProveedor = reglasRes.rows || [];
      } else {
        throw dbError;
      }
    }

    const reglasEmpaqueByTipo = new Map();
    for (const r of reglasEmpaqueProveedor) {
      const tipoProductoId = Number.parseInt(r.tipoproductoid, 10);
      const reglaid = Number.parseInt(r.reglaid, 10);
      const cantidadEmpaque = Number.parseInt(r.cantidadempaque, 10);
      if (!Number.isInteger(tipoProductoId) || tipoProductoId <= 0) continue;
      if (!Number.isInteger(cantidadEmpaque) || cantidadEmpaque <= 0) continue;

      const nombreRegla = (() => {
        const raw = (r.nombre_regla ?? r.descripcion ?? "").toString().trim();
        if (raw) return raw;
        return `Caja x${cantidadEmpaque}`;
      })();

      if (!reglasEmpaqueByTipo.has(tipoProductoId)) {
        reglasEmpaqueByTipo.set(tipoProductoId, []);
      }
      reglasEmpaqueByTipo.get(tipoProductoId).push({
        reglaId: Number.isInteger(reglaid) && reglaid > 0 ? reglaid : null,
        tipoProductoId,
        cantidadEmpaque,
        nombreRegla,
      });
    }

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
        pv.tipoproductoid,
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
          reglas_empaque: {
            disponibles:
              reglasEmpaqueByTipo.get(Number.parseInt(row.tipoproductoid, 10)) || [],
          },
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
    const userRole = req.user.rol;
    const userId = req.user.id;

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

    // Verificar que la orden existe y validar propiedad
    let ordenCheckQuery = "SELECT OrdenCompraID, Estatus, usuario_creador_id FROM OrdenesDeCompra WHERE OrdenCompraID = $1";
    let ordenCheckParams = [ordenCompraId];

    // REGLA DE VISIBILIDAD: Admin solo puede recibir inventario de sus propias órdenes
    if (userRole === 'admin') {
      ordenCheckQuery += " AND usuario_creador_id = $2";
      ordenCheckParams.push(userId);
    }

    const ordenCheck = await client.query(ordenCheckQuery, ordenCheckParams);

    if (ordenCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada o no tienes permiso para recibir inventario de esta orden",
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

      // 3.5. Registrar en inventarios_admin (UPSERT)
      const adminIdRegistro = Number.isInteger(usuarioRecibeId) && usuarioRecibeId > 0
        ? usuarioRecibeId
        : adminId || null;

      if (adminIdRegistro) {
        await client.query(
          `INSERT INTO inventarios_admin (admin_id, variante_id, cantidad, registrado_por, ultima_actualizacion)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (admin_id, variante_id)
           DO UPDATE SET 
             cantidad = inventarios_admin.cantidad + $3,
             ultima_actualizacion = CURRENT_TIMESTAMP`,
          [adminIdRegistro, detalle.varianteid, cantidadAumentar, adminIdRegistro]
        );
      }

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
    const piezasPorPaqueteSafe = (() => {
      const parsed = Number.parseInt(detalle.piezasporpaquete, 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    })();

    const solicitadoPzas = solicitado * piezasPorPaqueteSafe;
    const recibidoPzsActual = Number.parseInt(detalle.piezasrecibidas, 10) || 0;
    const nuevoRecibidoPzas = recibidoPzsActual + cantidadIngresada;
    if (nuevoRecibidoPzas > solicitadoPzas) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `No puede recibir más de lo solicitado para ${detalle.nombreproducto}. Solicitado: ${solicitadoPzas}, Ya recibido: ${recibidoPzsActual}`,
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
          piezasPorPaquete: piezasPorPaqueteSafe,
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
      INSERT INTO OrdenesDeCompra (ProveedorID, FechaEntregaEsperada, Estatus, usuario_creador_id)
      VALUES ($1, $2, 'Pendiente', $3)
      RETURNING OrdenCompraID, ProveedorID, FechaCreacion, FechaEntregaEsperada, Estatus
    `;

    const ordenResult = await client.query(ordenQuery, [
      proveedorId,
      fechaEntregaEsperada,
      req.user.id,
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
 * Agregar item a una orden de compra existente
 * POST /api/admin/ordenes-compra/:id/items
 */
const addItemToOrder = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const ordenCompraId = parseInt(req.params.id, 10);
    const { varianteId, cantidad, costoUnitario, piezasPorPaquete } = req.body;

    // Validaciones
    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden inválido",
      });
    }

    if (!varianteId || !cantidad) {
      return res.status(400).json({
        success: false,
        message: "varianteId y cantidad son requeridos",
      });
    }

    const cantidadParsed = parseInt(cantidad, 10);
    if (!Number.isInteger(cantidadParsed) || cantidadParsed <= 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad debe ser un número entero positivo",
      });
    }

    const piezasParsed = parseInt(piezasPorPaquete || 1, 10);
    if (!Number.isInteger(piezasParsed) || piezasParsed <= 0) {
      return res.status(400).json({
        success: false,
        message: "piezasPorPaquete inválido",
      });
    }

    await client.query("BEGIN");

    // Verificar que la orden existe y está en estatus editable
    const ordenCheck = await client.query(
      `SELECT OrdenCompraID, Estatus, usuario_creador_id 
       FROM OrdenesDeCompra 
       WHERE OrdenCompraID = $1`,
      [ordenCompraId]
    );

    if (ordenCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenCheck.rows[0];

    // Verificar permisos: solo el creador o superadmin pueden editar
    if (req.user.rol !== 'superadmin' && orden.usuario_creador_id !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para editar esta orden",
      });
    }

    // Solo se pueden editar órdenes en estatus Pendiente o Confirmada
    if (!['Pendiente', 'Confirmada'].includes(orden.estatus)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `No se puede editar una orden en estatus ${orden.estatus}`,
      });
    }

    // Verificar que la variante existe
    const varianteResult = await client.query(
      `SELECT pv.VarianteID, pv.ProductoID, pv.SKU, pv.Dimensiones, pv.CostoUnitario, pr.NombreProducto
       FROM Producto_Variantes pv
       INNER JOIN Productos pr ON pv.ProductoID = pr.ProductoID
       WHERE pv.VarianteID = $1`,
      [varianteId]
    );

    if (varianteResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Variante no encontrada",
      });
    }

    const variante = varianteResult.rows[0];

    // Determinar costo unitario
    const costoFinal = (() => {
      if (costoUnitario !== undefined && costoUnitario !== null) {
        const parsed = parseFloat(costoUnitario);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
      }
      const fallback = parseFloat(variante.costounitario);
      if (Number.isFinite(fallback) && fallback >= 0) return fallback * piezasParsed;
      return 0;
    })();

    // Verificar si la variante ya existe en la orden
    const existingItem = await client.query(
      `SELECT DetalleOC_ID, CantidadSolicitada, CostoUnitario
       FROM DetallesOrdenCompra
       WHERE OrdenCompraID = $1 AND VarianteID = $2`,
      [ordenCompraId, varianteId]
    );

    let detalleId;

    if (existingItem.rows.length > 0) {
      // Si existe, sumar la cantidad
      const nuevaCantidad = existingItem.rows[0].cantidadsolicitada + cantidadParsed;
      await client.query(
        `UPDATE DetallesOrdenCompra 
         SET CantidadSolicitada = $1
         WHERE DetalleOC_ID = $2`,
        [nuevaCantidad, existingItem.rows[0].detalleoc_id]
      );
      detalleId = existingItem.rows[0].detalleoc_id;
    } else {
      // Si no existe, insertar nuevo item
      const insertResult = await client.query(
        `INSERT INTO DetallesOrdenCompra 
         (OrdenCompraID, VarianteID, CantidadSolicitada, CantidadRecibida, PiezasPorPaquete, CostoUnitario)
         VALUES ($1, $2, $3, 0, $4, $5)
         RETURNING DetalleOC_ID`,
        [ordenCompraId, varianteId, cantidadParsed, piezasParsed, costoFinal]
      );
      detalleId = insertResult.rows[0].detalleoc_id;
    }

    // Recalcular el total de la orden
    const totalResult = await client.query(
      `SELECT COALESCE(SUM(CantidadSolicitada * CostoUnitario), 0) as total
       FROM DetallesOrdenCompra
       WHERE OrdenCompraID = $1`,
      [ordenCompraId]
    );

    const nuevoTotal = parseFloat(totalResult.rows[0].total);

    await client.query(
      `UPDATE OrdenesDeCompra SET Total = $1 WHERE OrdenCompraID = $2`,
      [nuevoTotal, ordenCompraId]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Item agregado exitosamente a la orden",
      data: {
        detalleId,
        nuevoTotal,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al agregar item a orden:", error);
    res.status(500).json({
      success: false,
      message: "Error al agregar item a la orden",
    });
  } finally {
    client.release();
  }
};

/**
 * Eliminar item de una orden de compra existente
 * DELETE /api/admin/ordenes-compra/:id/items/:detalleId
 */
const removeItemFromOrder = async (req, res) => {
  const client = await db.pool.connect();

  try {
    const ordenCompraId = parseInt(req.params.id, 10);
    const detalleId = parseInt(req.params.detalleId, 10);

    // Validaciones
    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden inválido",
      });
    }

    if (!Number.isInteger(detalleId) || detalleId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de detalle inválido",
      });
    }

    await client.query("BEGIN");

    // Verificar que la orden existe y está en estatus editable
    const ordenCheck = await client.query(
      `SELECT OrdenCompraID, Estatus, usuario_creador_id
       FROM OrdenesDeCompra
       WHERE OrdenCompraID = $1`,
      [ordenCompraId]
    );

    if (ordenCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenCheck.rows[0];

    // Verificar permisos
    if (req.user.rol !== 'superadmin' && orden.usuario_creador_id !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para editar esta orden",
      });
    }

    // Solo se pueden editar órdenes en estatus Pendiente o Confirmada
    if (!['Pendiente', 'Confirmada'].includes(orden.estatus)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `No se puede editar una orden en estatus ${orden.estatus}`,
      });
    }

    // Verificar que el detalle existe y pertenece a esta orden
    const detalleCheck = await client.query(
      `SELECT DetalleOC_ID FROM DetallesOrdenCompra
       WHERE DetalleOC_ID = $1 AND OrdenCompraID = $2`,
      [detalleId, ordenCompraId]
    );

    if (detalleCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Item no encontrado en esta orden",
      });
    }

    // Verificar que no sea el último item
    const countResult = await client.query(
      `SELECT COUNT(*) as total FROM DetallesOrdenCompra WHERE OrdenCompraID = $1`,
      [ordenCompraId]
    );

    if (parseInt(countResult.rows[0].total, 10) <= 1) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "No se puede eliminar el último item de la orden. Cancela la orden completa si deseas eliminarla.",
      });
    }

    // Eliminar el item
    await client.query(
      `DELETE FROM DetallesOrdenCompra WHERE DetalleOC_ID = $1`,
      [detalleId]
    );

    // Recalcular el total de la orden
    const totalResult = await client.query(
      `SELECT COALESCE(SUM(CantidadSolicitada * CostoUnitario), 0) as total
       FROM DetallesOrdenCompra
       WHERE OrdenCompraID = $1`,
      [ordenCompraId]
    );

    const nuevoTotal = parseFloat(totalResult.rows[0].total);

    await client.query(
      `UPDATE OrdenesDeCompra SET Total = $1 WHERE OrdenCompraID = $2`,
      [nuevoTotal, ordenCompraId]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Item eliminado exitosamente de la orden",
      data: {
        nuevoTotal,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al eliminar item de orden:", error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar item de la orden",
    });
  } finally {
    client.release();
  }
};

const getOrderDetailsForExcel = async (req, res) => {
  try {
    const ordenCompraId = parseInt(req.params.id, 10);

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden inválido",
      });
    }

    // Obtener información completa de la orden
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

    // Verificar permisos: solo el creador o superadmin pueden ver
    if (req.user.rol !== 'superadmin' && orden.usuario_creador_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "No tienes permiso para acceder a esta orden",
      });
    }

    // Obtener detalles de productos
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
    console.error("Error al obtener detalles de orden para Excel:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener detalles de la orden",
    });
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

    // Obtener la URL de Cloudinary
    const rutaImagen = req.file.path;

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
      if (!file || !file.path) continue;

      const rutaImagen = file.path;
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
      "SELECT varianteid FROM producto_variantes WHERE varianteid = $1",
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

    const portadaUrl = imagenes.length > 0 ? imagenes[0].rutaImagen : null;

    return res.json({
      success: true,
      data: {
        varianteId,
        portadaUrl,
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
      if (!file || !file.path) continue;

      const rutaImagen = file.path;
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

    // ============================================
    // REPLICACIÓN AUTOMÁTICA A VARIANTES HERMANAS
    // ============================================
    console.log(`[REPLICACION_IMG] Iniciando replicación para varianteId: ${varianteId}`);
    
    try {
      // Obtener productoid y color_nombre de la variante actual
      const varianteInfoResult = await db.query(
        `SELECT productoid, color_nombre 
         FROM producto_variantes 
         WHERE varianteid = $1`,
        [varianteId]
      );

      if (varianteInfoResult.rows.length > 0) {
        const { productoid, color_nombre } = varianteInfoResult.rows[0];
        console.log(`[REPLICACION_IMG] Variante origen - ProductoID: ${productoid}, Color: ${color_nombre}`);

        // Buscar variantes hermanas (mismo producto + color) que NO tengan imágenes
        const variantesHermanasResult = await db.query(
          `SELECT pv.varianteid
           FROM producto_variantes pv
           WHERE pv.productoid = $1
             AND pv.varianteid != $2
             AND (pv.color_nombre = $3 OR (pv.color_nombre IS NULL AND $3 IS NULL))
             AND NOT EXISTS (
               SELECT 1 
               FROM producto_variante_imagenes pvi 
               WHERE pvi.varianteid = pv.varianteid
             )`,
          [productoid, varianteId, color_nombre]
        );

        const variantesHermanas = variantesHermanasResult.rows;
        console.log(`[REPLICACION_IMG] Variantes hermanas sin imágenes encontradas: ${variantesHermanas.length}`);

        if (variantesHermanas.length > 0) {
          // Replicar cada imagen guardada a todas las variantes hermanas
          for (const hermana of variantesHermanas) {
            console.log(`[REPLICACION_IMG] Replicando ${imagenesGuardadas.length} imágenes a varianteId: ${hermana.varianteid}`);
            
            for (const img of imagenesGuardadas) {
              await db.query(
                `INSERT INTO producto_variante_imagenes (varianteid, url_imagen, textoalternativo, orden)
                 VALUES ($1, $2, $3, $4)`,
                [hermana.varianteid, img.url_imagen, img.textoalternativo, img.orden]
              );
            }
          }
          console.log(`[REPLICACION_IMG] Replicación completada exitosamente para ${variantesHermanas.length} variantes`);
        } else {
          console.log(`[REPLICACION_IMG] No hay variantes hermanas sin imágenes para replicar`);
        }
      } else {
        console.log(`[REPLICACION_IMG] No se pudo obtener información de la variante origen`);
      }
    } catch (replicacionError) {
      // No fallar la operación principal si falla la replicación
      console.error(`[REPLICACION_IMG] Error durante replicación (operación principal exitosa):`, replicacionError);
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
       INNER JOIN detallesdelpedido dp ON p.pedidoid = dp.pedidoid
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
  // Con Cloudinary, los archivos se gestionan en la nube
  // No es necesario eliminar archivos locales
  // Esta función se mantiene por compatibilidad pero no hace nada
  return;
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
      // Soportar URLs de Cloudinary directas (nuevo sistema) o archivos subidos por multer (legacy)
      let rutaImagen = null;
      
      // Prioridad 1: URL de Cloudinary (nuevo sistema de upload directo)
      if (item.url && typeof item.url === 'string' && item.url.trim()) {
        rutaImagen = item.url.trim();
      } 
      // Prioridad 2: uploadIndex para archivos de multer (legacy)
      else {
        const uploadIndex = Number.parseInt(item.uploadIndex ?? item.uploadindex, 10);
        if (Number.isInteger(uploadIndex) && uploadIndex >= 0) {
          const file = files[uploadIndex];
          if (file && file.path) {
            rutaImagen = file.path;
          }
        }
      }
      
      if (!rutaImagen) continue;

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

  // ============================================
  // REPLICACIÓN AUTOMÁTICA A VARIANTES HERMANAS
  // ============================================
  if (imagenes.length > 0) {
    console.log(`[REPLICACION_IMG] Iniciando replicación desde applyGaleriaVarianteAtomic para varianteId: ${varianteId}`);
    
    try {
      // Obtener productoid y color_nombre de la variante actual
      const varianteInfoResult = await client.query(
        `SELECT productoid, color_nombre 
         FROM producto_variantes 
         WHERE varianteid = $1`,
        [varianteId]
      );

      if (varianteInfoResult.rows.length > 0) {
        const { productoid, color_nombre } = varianteInfoResult.rows[0];
        console.log(`[REPLICACION_IMG] Variante origen - ProductoID: ${productoid}, Color: ${color_nombre}`);

        // Buscar variantes hermanas (mismo producto + color) que NO tengan imágenes
        const variantesHermanasResult = await client.query(
          `SELECT pv.varianteid
           FROM producto_variantes pv
           WHERE pv.productoid = $1
             AND pv.varianteid != $2
             AND (pv.color_nombre = $3 OR (pv.color_nombre IS NULL AND $3 IS NULL))
             AND NOT EXISTS (
               SELECT 1 
               FROM producto_variante_imagenes pvi 
               WHERE pvi.varianteid = pv.varianteid
             )`,
          [productoid, varianteId, color_nombre]
        );

        const variantesHermanas = variantesHermanasResult.rows;
        console.log(`[REPLICACION_IMG] Variantes hermanas sin imágenes encontradas: ${variantesHermanas.length}`);

        if (variantesHermanas.length > 0) {
          // Replicar cada imagen a todas las variantes hermanas
          for (const hermana of variantesHermanas) {
            console.log(`[REPLICACION_IMG] Replicando ${imagenes.length} imágenes a varianteId: ${hermana.varianteid}`);
            
            for (const img of imagenesFinalRes.rows) {
              await client.query(
                `INSERT INTO producto_variante_imagenes (varianteid, url_imagen, textoalternativo, orden)
                 VALUES ($1, $2, $3, $4)`,
                [hermana.varianteid, img.url_imagen, img.textoalternativo, img.orden]
              );
            }
          }
          console.log(`[REPLICACION_IMG] Replicación completada exitosamente para ${variantesHermanas.length} variantes`);
        } else {
          console.log(`[REPLICACION_IMG] No hay variantes hermanas sin imágenes para replicar`);
        }
      } else {
        console.log(`[REPLICACION_IMG] No se pudo obtener información de la variante origen`);
      }
    } catch (replicacionError) {
      // No fallar la operación principal si falla la replicación
      console.error(`[REPLICACION_IMG] Error durante replicación en applyGaleriaVarianteAtomic:`, replicacionError);
    }
  }

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

      const colorFinal = (() => {
        if (color_nombre === undefined || color_nombre === null) return null;
        const txt = String(color_nombre).trim();
        return txt.length ? txt : null;
      })();

      const skuMaestroSan = skuMaestroBase.toUpperCase().replace(/\s+/g, "");
      const skuTemporal = `${skuMaestroSan}-TEMP`;

      const insertRes = await client.query(
        `INSERT INTO producto_variantes
          (productoid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, preciounitario, precioofertaunitario, color_nombre, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, preciounitario, precioofertaunitario, stock, tipoproductoid, medidaid, color_nombre, activo, piezasporpaquete`,
        [
          parsedProductoId,
          skuTemporal,
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

      // Generar SKU final con el ID de la variante (formato: SKU_MAESTRO-00001)
      const varianteIdPadded = String(varianteId).padStart(5, '0');
      const skuFinal = `${skuMaestroSan}-${varianteIdPadded}`;

      // Actualizar el SKU con el ID real
      await client.query(
        'UPDATE producto_variantes SET sku = $1 WHERE varianteid = $2',
        [skuFinal, varianteId]
      );

      // Actualizar el row con el SKU final
      row.sku = skuFinal;
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

      // Note: Image propagation by color is now handled automatically in applyGaleriaVarianteAtomic
      // for producto_variante_imagenes table

      await client.query("COMMIT");

      // ============================================
      // AUDITORÍA EXHAUSTIVA: CREACIÓN DE VARIANTE
      // ============================================
      try {
        await auditLogger.registrarCreacion({
          usuarioId: req.user?.id || req.user?.userId || null,
          nombreUsuario: req.user?.nombre || req.user?.email || 'Sistema',
          rol: req.user?.rol || req.user?.tipo || 'admin',
          entidad: 'Variante',
          entidadId: row.varianteid,
          datos: {
            productoid: row.productoid,
            sku: row.sku,
            dimensiones: row.dimensiones,
            costounitario: row.costounitario,
            preciounitario: row.preciounitario,
            precioofertaunitario: row.precioofertaunitario,
            stock: row.stock,
            tipoproductoid: row.tipoproductoid,
            medidaid: row.medidaid,
            color_nombre: row.color_nombre,
            activo: row.activo,
            piezasporpaquete: row.piezasporpaquete,
            cantidadImagenes: galeriaResult?.imagenes?.length || 0
          },
          ip: req.ip || req.connection?.remoteAddress || null,
          tenantId: req.tenant?.tenant_id || 1
        });
      } catch (auditError) {
        console.error('Error al registrar auditoría de creación de variante:', auditError);
      }

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

    const colorFinal =
      color_nombre === undefined || color_nombre === null
        ? null
        : (() => {
            const txt = String(color_nombre).trim();
            return txt.length ? txt : null;
          })();

    const skuMaestroSan = skuMaestroBase.toUpperCase().replace(/\s+/g, "");
    const skuTemporal = `${skuMaestroSan}-TEMP`;

    // Usar nombres de columnas reales de Producto_Variantes (en minúsculas)
    const payloadNuevos = {
      productoid: parsedProductoId,
      sku: skuTemporal,
      dimensiones: dimensionesFinal,
      costounitario: costoUnitarioNum,
      preciounitario: precioUnitarioNum,
      precioofertaunitario: ofertaNum,
      stock: stockNum,
      tipoproductoid: tipoProductoId || null,
      medidaid: medidaId || null,
      color_nombre: colorFinal,
      activo: activoFinal,
    };

    if (allowDirect) {
      const insertRes = await db.query(
        `INSERT INTO producto_variantes
          (productoid, sku, dimensiones, costounitario, stock, tipoproductoid, medidaid, preciounitario, precioofertaunitario, color_nombre, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, preciounitario, precioofertaunitario, stock, tipoproductoid, medidaid, color_nombre, activo, piezasporpaquete`,
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
          payloadNuevos.activo,
        ]
      );

      const row = insertRes.rows[0];
      const varianteId = row.varianteid;

      // Generar SKU final con el ID de la variante (formato: SKU_MAESTRO-00001)
      const varianteIdPadded = String(varianteId).padStart(5, '0');
      const skuFinal = `${skuMaestroSan}-${varianteIdPadded}`;

      // Actualizar el SKU con el ID real
      await db.query(
        'UPDATE producto_variantes SET sku = $1 WHERE varianteid = $2',
        [skuFinal, varianteId]
      );

      // Actualizar el row con el SKU final
      row.sku = skuFinal;

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
            urlImagenVariante: null,
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
        `SELECT v.VarianteID, v.SKU, v.Dimensiones, v.CostoUnitario, v.PrecioUnitario, v.PrecioOfertaUnitario, v.Stock, v.Activo,
                v.color_nombre, v.MedidaID, v.ProductoID,
                m.nombremedida as medida_nombre
         FROM Producto_Variantes v
         LEFT JOIN medidas m ON m.medidaid = v.medidaid
         WHERE v.VarianteID = $1`,
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

      // ============================================
      // DETECCIÓN DE CAMBIOS Y AUDITORÍA
      // ============================================
      const cambiosDetectados = [];
      
      // Comparar dimensiones
      if (nuevasDimensiones !== dimensionesActual) {
        cambiosDetectados.push({
          campo: 'Dimensiones',
          valorAnterior: dimensionesActual || 'N/A',
          valorNuevo: nuevasDimensiones || 'N/A'
        });
      }
      
      // Comparar costo unitario
      if (nuevoCosto !== costoActual) {
        cambiosDetectados.push({
          campo: 'Costo Unitario',
          valorAnterior: costoActual !== null ? `$${costoActual.toFixed(2)}` : 'N/A',
          valorNuevo: nuevoCosto !== null ? `$${nuevoCosto.toFixed(2)}` : 'N/A'
        });
      }
      
      // Comparar precio unitario
      if (nuevoPrecio !== precioActual) {
        cambiosDetectados.push({
          campo: 'Precio Unitario',
          valorAnterior: precioActual !== null ? `$${precioActual.toFixed(2)}` : 'N/A',
          valorNuevo: nuevoPrecio !== null ? `$${nuevoPrecio.toFixed(2)}` : 'N/A'
        });
      }
      
      // Comparar precio oferta
      if (nuevaOferta !== ofertaActual) {
        cambiosDetectados.push({
          campo: 'Precio Oferta',
          valorAnterior: ofertaActual !== null ? `$${ofertaActual.toFixed(2)}` : 'Sin oferta',
          valorNuevo: nuevaOferta !== null ? `$${nuevaOferta.toFixed(2)}` : 'Sin oferta'
        });
      }
      
      // Comparar color
      const colorActual = actual.color_nombre || null;
      if (colorFinal !== colorActual) {
        cambiosDetectados.push({
          campo: 'Color',
          valorAnterior: colorActual || 'Sin color',
          valorNuevo: colorFinal || 'Sin color'
        });
      }
      
      // Comparar estado activo
      const activoActualBool = Boolean(actual.activo);
      if (activoFinal !== activoActualBool) {
        cambiosDetectados.push({
          campo: 'Estado',
          valorAnterior: activoActualBool ? 'Activo' : 'Inactivo',
          valorNuevo: activoFinal ? 'Activo' : 'Inactivo'
        });
      }

      const updateRes = await client.query(
        `UPDATE producto_variantes
         SET dimensiones = $1,
             costounitario = $2,
             preciounitario = $3,
             precioofertaunitario = $4,
             color_nombre = $5,
             activo = $6
         WHERE varianteid = $7
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, preciounitario, precioofertaunitario, stock, activo, tipoproductoid, medidaid, color_nombre, piezasporpaquete`,
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

      // Note: Image propagation by color is now handled automatically in applyGaleriaVarianteAtomic
      // for producto_variante_imagenes table

      await client.query("COMMIT");

      // ============================================
      // AUDITORÍA EXHAUSTIVA: ACTUALIZACIÓN CON DIFF
      // ============================================
      try {
        await auditLogger.registrarActualizacion({
          usuarioId: req.user?.id || req.user?.userId || null,
          nombreUsuario: req.user?.nombre || req.user?.email || 'Sistema',
          rol: req.user?.rol || req.user?.tipo || 'admin',
          entidad: 'Variante',
          entidadId: varianteId,
          datosAnteriores: {
            sku: actual.sku,
            dimensiones: dimensionesActual,
            costounitario: costoActual,
            preciounitario: precioActual,
            precioofertaunitario: ofertaActual,
            color_nombre: actual.color_nombre,
            activo: actual.activo
          },
          datosNuevos: {
            sku: row.sku,
            dimensiones: row.dimensiones,
            costounitario: row.costounitario !== null ? parseFloat(row.costounitario) : null,
            preciounitario: row.preciounitario !== null ? parseFloat(row.preciounitario) : null,
            precioofertaunitario: row.precioofertaunitario !== null ? parseFloat(row.precioofertaunitario) : null,
            color_nombre: row.color_nombre,
            activo: row.activo
          },
          ip: req.ip || req.connection?.remoteAddress || null,
          tenantId: req.tenant?.tenant_id || 1
        });
      } catch (auditError) {
        console.error('Error al registrar auditoría de actualización de variante:', auditError);
      }

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
    } = req.body || {};

    const result = await db.query(
      `SELECT v.VarianteID, v.SKU, v.Dimensiones, v.CostoUnitario, v.PrecioUnitario, v.PrecioOfertaUnitario, v.Stock, v.Activo,
              v.color_nombre, v.MedidaID, v.ProductoID,
              m.nombremedida as medida_nombre
       FROM Producto_Variantes v
       LEFT JOIN medidas m ON m.medidaid = v.medidaid
       WHERE v.VarianteID = $1`,
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

    if (allowDirect) {
      const colorFinal = Object.prototype.hasOwnProperty.call(payloadNuevos, "color_nombre")
        ? payloadNuevos.color_nombre
        : actual.color_nombre ?? actual.color_nombre;

      // ============================================
      // DETECCIÓN DE CAMBIOS Y AUDITORÍA (Non-Atomic Path)
      // ============================================
      const cambiosDetectados = [];
      
      // Comparar dimensiones
      if (payloadNuevos.dimensiones !== dimensionesActual) {
        cambiosDetectados.push({
          campo: 'Dimensiones',
          valorAnterior: dimensionesActual || 'N/A',
          valorNuevo: payloadNuevos.dimensiones || 'N/A'
        });
      }
      
      // Comparar costo unitario
      if (payloadNuevos.costounitario !== costoActual) {
        cambiosDetectados.push({
          campo: 'Costo Unitario',
          valorAnterior: costoActual !== null ? `$${costoActual.toFixed(2)}` : 'N/A',
          valorNuevo: payloadNuevos.costounitario !== null ? `$${payloadNuevos.costounitario.toFixed(2)}` : 'N/A'
        });
      }
      
      // Comparar precio unitario
      if (payloadNuevos.preciounitario !== precioActual) {
        cambiosDetectados.push({
          campo: 'Precio Unitario',
          valorAnterior: precioActual !== null ? `$${precioActual.toFixed(2)}` : 'N/A',
          valorNuevo: payloadNuevos.preciounitario !== null ? `$${payloadNuevos.preciounitario.toFixed(2)}` : 'N/A'
        });
      }
      
      // Comparar precio oferta
      if (payloadNuevos.precioofertaunitario !== ofertaActual) {
        cambiosDetectados.push({
          campo: 'Precio Oferta',
          valorAnterior: ofertaActual !== null ? `$${ofertaActual.toFixed(2)}` : 'Sin oferta',
          valorNuevo: payloadNuevos.precioofertaunitario !== null ? `$${payloadNuevos.precioofertaunitario.toFixed(2)}` : 'Sin oferta'
        });
      }
      
      // Comparar color
      const colorActual = actual.color_nombre || null;
      if (colorFinal !== colorActual) {
        cambiosDetectados.push({
          campo: 'Color',
          valorAnterior: colorActual || 'Sin color',
          valorNuevo: colorFinal || 'Sin color'
        });
      }
      
      // Comparar estado activo
      if (payloadNuevos.activo !== activoActual) {
        cambiosDetectados.push({
          campo: 'Estado',
          valorAnterior: activoActual ? 'Activo' : 'Inactivo',
          valorNuevo: payloadNuevos.activo ? 'Activo' : 'Inactivo'
        });
      }

      const updateRes = await db.query(
        `UPDATE producto_variantes
         SET dimensiones = $1,
             costounitario = $2,
             preciounitario = $3,
             precioofertaunitario = $4,
             color_nombre = $5,
             activo = $6
         WHERE varianteid = $7
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, preciounitario, precioofertaunitario, stock, activo, tipoproductoid, medidaid, color_nombre, piezasporpaquete`,
        [
          payloadNuevos.dimensiones,
          payloadNuevos.costounitario,
          payloadNuevos.preciounitario,
          payloadNuevos.precioofertaunitario,
          colorFinal,
          payloadNuevos.activo,
          varianteId,
        ]
      );
      
      // ============================================
      // REGISTRAR CAMBIOS EN BITÁCORA
      // ============================================
      if (cambiosDetectados.length > 0) {
        const usuarioId = req.user?.id || req.user?.userId;
        const productoId = actual.productoid;
        
        for (const cambio of cambiosDetectados) {
          try {
            await db.query(
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
                'producto_variantes',
                varianteId,
                'UPDATE',
                JSON.stringify({
                  productoId: productoId,
                  varianteId: varianteId,
                  sku: actual.sku,
                  campo: cambio.campo,
                  valorAnterior: cambio.valorAnterior,
                  medidaNombre: actual.medida_nombre || null
                }),
                JSON.stringify({
                  productoId: productoId,
                  varianteId: varianteId,
                  sku: actual.sku,
                  campo: cambio.campo,
                  valorNuevo: cambio.valorNuevo,
                  descripcion: `Producto [${productoId}] - Variante [SKU: ${actual.sku}]: Cambio en ${cambio.campo} de '${cambio.valorAnterior}' a '${cambio.valorNuevo}'`
                }),
                usuarioId
              ]
            );
          } catch (logError) {
            console.error('Error al registrar cambio en bitácora:', logError);
            // No bloquear la actualización si falla el log
          }
        }
      }

      if (!updateRes.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Variante no encontrada",
        });
      }

      const row = updateRes.rows[0];

      // Note: Image propagation by color is now handled automatically in subirImagenesVarianteMultiple
      // for producto_variante_imagenes table

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

/**
 * Elimina una imagen de producto (físicamente de Cloudinary y de la BD)
 */
const eliminarImagenProducto = async (req, res) => {
  const { id } = req.params; // imagenId
  const imagenId = Number.parseInt(id, 10);

  if (!Number.isInteger(imagenId) || imagenId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ID de imagen inválido",
    });
  }

  try {
    // Obtener la imagen de la BD para extraer el public_id
    const imagenResult = await db.query(
      `SELECT imagenid, productoid, url_imagen
       FROM producto_imagenes
       WHERE imagenid = $1`,
      [imagenId]
    );

    if (!imagenResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Imagen no encontrada",
      });
    }

    const imagen = imagenResult.rows[0];
    const urlImagen = imagen.url_imagen;

    // Extraer public_id de la URL de Cloudinary
    const publicId = extraerPublicIdDeUrl(urlImagen);

    // Eliminar de Cloudinary si se pudo extraer el public_id
    if (publicId) {
      try {
        await eliminarImagenCloudinary(publicId);
      } catch (cloudinaryError) {
        console.warn(`⚠️ No se pudo eliminar de Cloudinary: ${publicId}`, cloudinaryError);
        // Continuar con la eliminación de BD aunque falle Cloudinary
      }
    } else {
      console.warn(`⚠️ No se pudo extraer public_id de URL: ${urlImagen}`);
    }

    // Eliminar de la base de datos
    await db.query(
      `DELETE FROM producto_imagenes WHERE imagenid = $1`,
      [imagenId]
    );

    res.json({
      success: true,
      message: "Imagen eliminada correctamente",
      data: {
        imagenId,
        productoId: imagen.productoid,
      },
    });
  } catch (error) {
    console.error(`❌ Error al eliminar imagen ${imagenId}:`, error);
    res.status(500).json({
      success: false,
      message: "Error al eliminar la imagen",
      error: error.message,
    });
  }
};

/**
 * Subir evidencia de entrega (remisión firmada)
 * POST /api/admin/pedidos/:id/evidencia
 */
const subirEvidenciaEntrega = async (req, res) => {
  try {
    const pedidoId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionó ningún archivo de evidencia",
      });
    }

    const urlEvidencia = req.file.path;

    const pedidoResult = await db.query(
      "SELECT pedidoid, estatus, clienteid FROM pedidos WHERE pedidoid = $1",
      [pedidoId]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const updateResult = await db.query(
      `UPDATE pedidos 
       SET url_evidencia_entrega = $1, 
           fecha_entrega_real = NOW(), 
           estatus = 'Entregado'
       WHERE pedidoid = $2
       RETURNING pedidoid, url_evidencia_entrega, fecha_entrega_real, estatus`,
      [urlEvidencia, pedidoId]
    );

    const pedido = updateResult.rows[0];
    const clienteId = pedidoResult.rows[0].clienteid;

    if (clienteId) {
      try {
        await crearNotificacionServicio(
          clienteId,
          'pedido',
          `Pedido #${pedidoId} Entregado`,
          `Tu pedido ha sido entregado exitosamente. La evidencia de entrega ha sido registrada.`,
          `/pedido-detalle.html?id=${pedidoId}`,
          'normal'
        );
      } catch (notifError) {
        console.warn("No se pudo crear notificación de entrega:", notifError);
      }
    }

    await auditService.registrarCambioPasivo(
      req,
      "pedidos",
      pedidoId,
      "UPDATE",
      { estatus: pedidoResult.rows[0].estatus },
      { estatus: "Entregado", url_evidencia_entrega: urlEvidencia }
    );

    res.json({
      success: true,
      message: "Evidencia de entrega subida exitosamente",
      data: {
        pedidoId: pedido.pedidoid,
        urlEvidencia: pedido.url_evidencia_entrega,
        fechaEntregaReal: pedido.fecha_entrega_real,
        estatus: pedido.estatus,
      },
    });
  } catch (error) {
    console.error("Error al subir evidencia de entrega:", error);
    res.status(500).json({
      success: false,
      message: "Error al subir evidencia de entrega",
      error: error.message,
    });
  }
};

/**
 * Obtener datos para generar remisión PDF
 * GET /api/admin/pedidos/:id/remision
 */
const obtenerRemisionPedido = async (req, res) => {
  try {
    const pedidoId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    const pedidoQuery = `
      SELECT 
        p.pedidoid,
        p.fechapedido,
        p.montototal,
        p.costoenvio,
        p.estatus,
        c.nombre as cliente_nombre,
        c.apellido as cliente_apellido,
        c.email as cliente_email,
        c.telefono as cliente_telefono,
        d.receptor,
        d.calle,
        d.ciudad,
        e.nombre as estado_nombre,
        a.nombre as agente_nombre,
        a.apellido as agente_apellido,
        a.codigoagente
      FROM pedidos p
      INNER JOIN clientes c ON c.clienteid = p.clienteid
      LEFT JOIN cliente_direcciones d ON d.direccionid = p.direccionenvioid
      LEFT JOIN estados e ON e.estadoid = d.estadoid
      LEFT JOIN agentesdeventas a ON a.agenteid = p.agenteid
      WHERE p.pedidoid = $1
    `;

    const pedidoResult = await db.query(pedidoQuery, [pedidoId]);

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const pedido = pedidoResult.rows[0];

    const detallesQuery = `
      SELECT 
        dp.cantidad,
        dp.preciounitarioaplicado,
        dp.piezastotales,
        pv.sku,
        pv.dimensiones,
        prod.nombreproducto,
        t.etiqueta as tamano_etiqueta,
        t.valor as tamano_valor
      FROM detallesdelpedido dp
      INNER JOIN producto_variantes pv ON pv.varianteid = dp.varianteid
      INNER JOIN productos prod ON prod.productoid = pv.productoid
      LEFT JOIN cat_tamanopaquetes t ON t.tamanoid = dp.tamanoid
      WHERE dp.pedidoid = $1
      ORDER BY dp.detalleid ASC
    `;

    const detallesResult = await db.query(detallesQuery, [pedidoId]);

    const items = detallesResult.rows.map((item) => ({
      sku: item.sku,
      nombreProducto: item.nombreproducto,
      dimensiones: item.dimensiones,
      tamano: item.tamano_etiqueta || 'N/A',
      cantidad: parseInt(item.cantidad, 10),
      precioUnitario: parseFloat(item.preciounitarioaplicado),
      piezasTotales: item.piezastotales,
      subtotal: parseFloat(
        (parseInt(item.cantidad, 10) * 
         (item.tamano_valor || 1) * 
         parseFloat(item.preciounitarioaplicado)).toFixed(2)
      ),
    }));

    res.json({
      success: true,
      data: {
        pedido: {
          pedidoId: pedido.pedidoid,
          fechaPedido: pedido.fechapedido,
          montoTotal: parseFloat(pedido.montototal),
          costoEnvio: parseFloat(pedido.costoenvio || 0),
          estatus: pedido.estatus,
          cliente: {
            nombre: `${pedido.cliente_nombre} ${pedido.cliente_apellido}`,
            email: pedido.cliente_email,
            telefono: pedido.cliente_telefono,
          },
          direccion: {
            receptor: pedido.receptor,
            calle: pedido.calle,
            ciudad: pedido.ciudad,
            estado: pedido.estado_nombre,
          },
          agente: pedido.agente_nombre ? {
            nombre: `${pedido.agente_nombre} ${pedido.agente_apellido}`,
            codigo: pedido.codigoagente,
          } : null,
          items,
        },
      },
    });
  } catch (error) {
    console.error("Error al obtener datos de remisión:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener datos de remisión",
      error: error.message,
    });
  }
};

module.exports = {
  loginAdmin,
  verifyAdmin,
  refreshAdminToken,
  getDashboardStats,
  getAllPedidos,
  updatePedidoEstatus,
  confirmarPedido,
  updateCostoEnvio,
  getPedidoDetalle,
  getMovimientosInventario,
  getHistorialInventarioVariante,
  recepcionarMercancia,
  ajustarInventario,
  getInventarioResumen,
  getProductoDetalleInventario,
  buscarProductosCompra,
  getProductoDetalle,
  getVariantesPendientesProducto,
  getAllProductos,
  crearProducto,
  actualizarProducto,
  toggleProductoVisibilidad,
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
  getReglasEmpaqueProveedorMultiples,
  saveReglaEmpaque,
  saveReglasEmpaqueMultiples,
  getTiposProductoAdmin,
  crearTipoProductoAdmin,
  getAllOrdenesCompra,
  getDetallesOrdenCompra,
  getRecepcionOrdenCompra,
  getComprasPendientes,
  getCompraDetalleCiego,
  validarRecepcionCompra,
  crearOrdenCompra,
  addItemToOrder,
  removeItemFromOrder,
  getOrderDetailsForExcel,
  cancelarOrdenCompra,
  recibirInventario,
  recibirItemOrdenCompra,
  getMovimientosInventario,
  getCuentasPorPagar,
  registrarPagoCuentaPorPagar,
  getCxcSummary,
  registrarAbonoCxC,
  recepcionMasivaOrdenCompra,
  getResumenEstadoCuentaProveedores,
  getEstadoCuentaProveedorMovimientos,
  getProductosRecibidosPorCxp,
  subirEvidenciaRecepcionOC,
  subirImagenProducto,
  subirImagenesProductoMultiple,
  eliminarImagenProducto,
  getImagenesVariante,
  subirImagenesVarianteMultiple,
  actualizarOrdenImagenesVariante,
  confirmarOrdenBackorder,
  cancelarOrdenBackorder,
  subirEvidenciaEntrega,
  obtenerRemisionPedido,
};
