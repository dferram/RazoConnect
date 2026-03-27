/**
 * CUENTAS POR PAGAR (CXP) ADMIN CONTROLLER
 * 
 * Controlador especializado para la gestión de cuentas por pagar a proveedores.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/cxpAdminController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener cuentas por pagar
 * GET /api/admin/cuentas-por-pagar
 */
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
    logger.error('Error al obtener cuentas por pagar:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener cuentas por pagar",
    });
  }
};

/**
 * Registrar pago de cuenta por pagar
 * POST /api/admin/cuentas-por-pagar/:id/pagar
 */
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
    logger.error('Error al registrar pago CxP:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al registrar pago",
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener resumen estado de cuenta proveedores
 * GET /api/admin/cuentas-por-pagar/resumen-proveedores
 */
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
    logger.error('Error al obtener resumen estado de cuenta proveedores:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener estado de cuenta",
    });
  }
};

/**
 * Obtener estado de cuenta y movimientos de un proveedor
 * GET /api/admin/cuentas-por-pagar/proveedor/:id/movimientos
 */
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
      `SELECT tipo, cxp_id, orden_compra_id, fecha, monto, monto_pagado, estatus, referencia, comprobante_url, pago_id FROM (
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
    logger.error('Error al obtener movimientos proveedor:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener movimientos",
    });
  }
};

/**
 * Obtener productos recibidos por CXP
 * GET /api/admin/cuentas-por-pagar/:id/productos
 */
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
    logger.error('Error al obtener productos recibidos por CxP:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener productos recibidos",
    });
  }
};

module.exports = {
  getCuentasPorPagar,
  registrarPagoCuentaPorPagar,
  getResumenEstadoCuentaProveedores,
  getEstadoCuentaProveedorMovimientos,
  getProductosRecibidosPorCxp
};
