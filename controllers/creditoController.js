const db = require("../db");
const logger = require('../utils/logger');

const NIVEL_RIESGO = {
  BAJO: "BAJO",
  MEDIO: "MEDIO",
  ALTO: "ALTO"
};

async function analizarRiesgoSolicitud(solicitudId, tenantId) {
  const solicitudQuery = `
    SELECT
      s.*,
      c.nombre as nombre_cliente,
      c.fechaderegistro as fecha_registro,
      c.email as email_cliente
    FROM solicitudes_credito s
    INNER JOIN clientes c ON s.cliente_id = c.clienteid
    WHERE s.solicitud_id = $1 AND s.tenant_id = $2 AND c.tenant_id = $2
  `;
  const { rows: [solicitud] } = await db.query(solicitudQuery, [solicitudId, tenantId]);
  
  if (!solicitud) {
    throw new Error("Solicitud no encontrada");
  }

  const pedidosQuery = `
    SELECT montototal, fechapedido
    FROM pedidos
    WHERE clienteid = $1 AND pagado = true AND tenant_id = $2
    ORDER BY fechapedido DESC
  `;
  const { rows: pedidos } = await db.query(pedidosQuery, [solicitud.cliente_id, tenantId]);

  const hoy = new Date();
  const fechaRegistro = new Date(solicitud.fecha_registro);
  const antiguedadMeses = Math.floor((hoy - fechaRegistro) / (1000 * 60 * 60 * 24 * 30));
  
  const maxTicketHistorico = pedidos.length > 0 
    ? Math.max(...pedidos.map(p => parseFloat(p.montototal)))
    : 0;

  const totalCompras = pedidos.reduce((sum, p) => sum + parseFloat(p.montototal), 0);
  const promedioCompras = antiguedadMeses > 0 ? totalCompras / antiguedadMeses : 0;

  let nivelRiesgo = NIVEL_RIESGO.ALTO;
  let mensajeAdvertencia = [];
  const montoSolicitado = parseFloat(solicitud.monto_solicitado);

  if (antiguedadMeses > 6 && montoSolicitado <= maxTicketHistorico * 1.5 && pedidos.length > 3) {
    nivelRiesgo = NIVEL_RIESGO.BAJO;
    mensajeAdvertencia.push("Cliente con buen historial y solicitud dentro de parámetros seguros.");
  } else if (antiguedadMeses >= 1 && antiguedadMeses <= 6 && montoSolicitado <= maxTicketHistorico * 2.5) {
    nivelRiesgo = NIVEL_RIESGO.MEDIO;
    mensajeAdvertencia.push("Cliente relativamente nuevo o monto elevado respecto a su historial.");
  } else {
    if (antiguedadMeses < 1) mensajeAdvertencia.push("Cliente demasiado nuevo (menos de 1 mes).");
    if (montoSolicitado > maxTicketHistorico * 3) mensajeAdvertencia.push("Monto solicitado excede significativamente el historial de compras.");
    if (pedidos.length === 0) mensajeAdvertencia.push("Sin historial de pedidos pagados.");
  }

  return {
    nivel_riesgo: nivelRiesgo,
    mensaje_advertencia: mensajeAdvertencia.join(" "),
    sugerencia: nivelRiesgo === NIVEL_RIESGO.BAJO ? "APROBAR" : nivelRiesgo === NIVEL_RIESGO.MEDIO ? "REVISAR" : "RECHAZAR"
  };
}

async function obtenerSolicitudesPendientes(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const query = `
      SELECT
        s.solicitud_id,
        s.cliente_id,
        s.monto_solicitado,
        s.motivo_uso,
        s.fecha_solicitud,
        c.nombre as nombre_cliente,
        c.email as email_cliente,
        c.fechaderegistro as fecha_registro
      FROM solicitudes_credito s
      INNER JOIN clientes c ON s.cliente_id = c.clienteid
      WHERE s.estado = 'PENDIENTE'
        AND s.tenant_id = $1
        AND c.tenant_id = $1
      ORDER BY s.fecha_solicitud ASC
    `;

    const { rows: solicitudes } = await db.query(query, [tenant_id]);
    const stats = {
      total_pendientes: solicitudes.length,
      monto_total_pendiente: solicitudes.reduce((sum, s) => sum + parseFloat(s.monto_solicitado), 0),
      solicitudes_alto_riesgo: 0
    };

    for (const solicitud of solicitudes) {
      const analisis = await analizarRiesgoSolicitud(solicitud.solicitud_id, tenant_id);
      if (analisis.nivel_riesgo === NIVEL_RIESGO.ALTO) stats.solicitudes_alto_riesgo++;
    }

    return res.json({ success: true, data: { solicitudes, stats } });
  } catch (error) {
    logger.error('Error al obtener solicitudes pendientes:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({ success: false, message: "Error al obtener solicitudes pendientes" });
  }
}

async function analizarRiesgoCredito(req, res) {
  try {
    const solicitudId = Number(req.params.solicitud_id);
    const { tenant_id } = req.tenant;
    if (!Number.isInteger(solicitudId)) {
      return res.status(400).json({ success: false, message: "ID de solicitud inválido" });
    }

    const solicitudQuery = `
      SELECT s.*, c.nombre as nombre_cliente, c.fechaderegistro as fecha_registro, c.email as email_cliente
      FROM solicitudes_credito s
      INNER JOIN clientes c ON s.cliente_id = c.clienteid
      WHERE s.solicitud_id = $1 AND s.tenant_id = $2 AND c.tenant_id = $2
    `;
    const { rows: [solicitud] } = await db.query(solicitudQuery, [solicitudId, tenant_id]);

    if (!solicitud) {
      return res.status(404).json({ success: false, message: "Solicitud no encontrada" });
    }

    const pedidosQuery = `SELECT montototal, fechapedido FROM pedidos WHERE clienteid = $1 AND pagado = true AND tenant_id = $2 ORDER BY fechapedido DESC`;
    const { rows: pedidos } = await db.query(pedidosQuery, [solicitud.cliente_id, tenant_id]);

    const hoy = new Date();
    const fechaRegistro = new Date(solicitud.fecha_registro);
    const antiguedadMeses = Math.floor((hoy - fechaRegistro) / (1000 * 60 * 60 * 24 * 30));
    const maxTicketHistorico = pedidos.length > 0 ? Math.max(...pedidos.map(p => parseFloat(p.montototal))) : 0;
    const totalCompras = pedidos.reduce((sum, p) => sum + parseFloat(p.montototal), 0);
    const promedioCompras = antiguedadMeses > 0 ? totalCompras / antiguedadMeses : 0;
    const evaluacion = await analizarRiesgoSolicitud(solicitudId, tenant_id);

    const analisis = {
      solicitud,
      metricas: { antiguedad_meses: antiguedadMeses, pedidos_totales: pedidos.length, compra_maxima: maxTicketHistorico, promedio_compra: promedioCompras },
      evaluacion
    };

    return res.json({ success: true, data: analisis });
  } catch (error) {
    logger.error('Error al analizar riesgo crediticio:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({ success: false, message: "Error al analizar riesgo crediticio" });
  }
}

async function aprobarSolicitud(req, res) {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    const { solicitud_id, limite_aprobado } = req.body;
    const { tenant_id } = req.tenant;
    if (!solicitud_id || !limite_aprobado) throw new Error("Faltan datos requeridos");

    const { rows: [solicitud] } = await client.query("SELECT cliente_id FROM solicitudes_credito WHERE solicitud_id = $1 AND tenant_id = $2 AND estado = 'PENDIENTE'", [solicitud_id, tenant_id]);
    if (!solicitud) throw new Error("Solicitud no encontrada o ya procesada");

    // ⚠️ CRITICAL: Obtener admin_id del cliente para asignar crédito al admin correcto
    const estadosHelper = require('../../utils/estadosHelper');
    const adminClienteId = await estadosHelper.getAdminByClienteEstado(solicitud.cliente_id, tenant_id);
    const adminId = adminClienteId || 1;

    await client.query("UPDATE solicitudes_credito SET estado = 'APROBADO' WHERE solicitud_id = $1 AND tenant_id = $2", [solicitud_id, tenant_id]);

    const { rows: [creditoExistente] } = await client.query("SELECT credito_id FROM cliente_creditos WHERE cliente_id = $1 AND admin_id = $2 AND tenant_id = $3", [solicitud.cliente_id, adminId, tenant_id]);
    if (creditoExistente) {
      await client.query("UPDATE cliente_creditos SET limite_credito = $1, estado_credito = 'ACTIVO' WHERE credito_id = $2 AND admin_id = $3 AND tenant_id = $4", [limite_aprobado, creditoExistente.credito_id, adminId, tenant_id]);
    } else {
      await client.query("INSERT INTO cliente_creditos (cliente_id, limite_credito, estado_credito, admin_id, tenant_id) VALUES ($1, $2, 'ACTIVO', $3, $4)", [solicitud.cliente_id, limite_aprobado, adminId, tenant_id]);
    }

    await client.query("COMMIT");
    return res.json({ success: true, message: "Solicitud aprobada correctamente" });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error('Error al aprobar solicitud:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({ success: false, message: "Error al aprobar solicitud" });
  } finally {
    client.release();
  }
}

async function rechazarSolicitud(req, res) {
  try {
    const { solicitud_id, motivo_rechazo } = req.body;
    const { tenant_id } = req.tenant;
    if (!solicitud_id || !motivo_rechazo) {
      return res.status(400).json({ success: false, message: "Faltan datos requeridos" });
    }

    const result = await db.query("UPDATE solicitudes_credito SET estado = 'RECHAZADO', comentarios_admin = $1 WHERE solicitud_id = $2 AND tenant_id = $3 AND estado = 'PENDIENTE'", [motivo_rechazo, solicitud_id, tenant_id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Solicitud no encontrada o ya procesada" });
    }

    return res.json({ success: true, message: "Solicitud rechazada correctamente" });
  } catch (error) {
    logger.error('Error al rechazar solicitud:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({ success: false, message: "Error al rechazar solicitud" });
  }
}

module.exports = { obtenerSolicitudesPendientes, analizarRiesgoCredito, aprobarSolicitud, rechazarSolicitud };
