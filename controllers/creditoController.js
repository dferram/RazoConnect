const db = require("../db");
const { format } = require("date-fns");

const NIVEL_RIESGO = {
  BAJO: "BAJO",
  MEDIO: "MEDIO",
  ALTO: "ALTO"
};

// Obtener lista de solicitudes pendientes con datos del cliente
async function obtenerSolicitudesPendientes(req, res) {
  try {
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
      ORDER BY s.fecha_solicitud ASC
    `;

    const { rows: solicitudes } = await db.query(query);

    // Calcular estadísticas
    const stats = {
      total_pendientes: solicitudes.length,
      monto_total_pendiente: solicitudes.reduce((sum, s) => sum + parseFloat(s.monto_solicitado), 0),
      solicitudes_alto_riesgo: 0 // Se actualizará después de analizar cada solicitud
    };

    // Analizar riesgo de cada solicitud para contar las de alto riesgo
    for (const solicitud of solicitudes) {
      const analisis = await analizarRiesgoCredito(solicitud.solicitud_id);
      if (analisis.nivel_riesgo === NIVEL_RIESGO.ALTO) {
        stats.solicitudes_alto_riesgo++;
      }
    }

    return res.json({
      success: true,
      data: {
        solicitudes,
        stats
      }
    });
  } catch (error) {
    console.error("Error al obtener solicitudes pendientes:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener solicitudes pendientes"
    });
  }
}

// Analizar riesgo crediticio de una solicitud específica
async function analizarRiesgoCredito(req, res) {
  try {
    const solicitudId = req.params.solicitud_id;

    // 1. Obtener datos de la solicitud y cliente
    const solicitudQuery = `
      SELECT 
        s.*,
        c.nombre as nombre_cliente,
        c.fechaderegistro as fecha_registro,
        c.email as email_cliente
      FROM solicitudes_credito s
      INNER JOIN clientes c ON s.cliente_id = c.clienteid
      WHERE s.solicitud_id = $1
    `;
    const { rows: [solicitud] } = await db.query(solicitudQuery, [solicitudId]);
    
    if (!solicitud) {
      return res.status(404).json({
        success: false,
        message: "Solicitud no encontrada"
      });
    }

    // 2. Obtener historial de pedidos
    const pedidosQuery = `
      SELECT montototal, fechapedido
      FROM pedidos 
      WHERE clienteid = $1 AND pagado = true
      ORDER BY fechapedido DESC
    `;
    const { rows: pedidos } = await db.query(pedidosQuery, [solicitud.cliente_id]);

    // 3. Calcular métricas
    const hoy = new Date();
    const fechaRegistro = new Date(solicitud.fecha_registro);
    const antiguedadMeses = Math.floor((hoy - fechaRegistro) / (1000 * 60 * 60 * 24 * 30));
    
    const maxTicketHistorico = pedidos.length > 0 
      ? Math.max(...pedidos.map(p => parseFloat(p.montototal)))
      : 0;

    const totalCompras = pedidos.reduce((sum, p) => sum + parseFloat(p.montototal), 0);
    const promedioCompras = antiguedadMeses > 0 ? totalCompras / antiguedadMeses : 0;
    const frecuencia = antiguedadMeses > 0 ? pedidos.length / antiguedadMeses : 0;

    // 4. Aplicar reglas de negocio
    let nivelRiesgo = NIVEL_RIESGO.ALTO;
    let mensajeAdvertencia = [];

    const montoSolicitado = parseFloat(solicitud.monto_solicitado);

    if (antiguedadMeses > 6 && 
        montoSolicitado <= maxTicketHistorico * 1.5 && 
        pedidos.length > 3) {
      nivelRiesgo = NIVEL_RIESGO.BAJO;
      mensajeAdvertencia.push("Cliente con buen historial y solicitud dentro de parámetros seguros.");
    } else if (antiguedadMeses >= 1 && 
               antiguedadMeses <= 6 && 
               montoSolicitado <= maxTicketHistorico * 2.5) {
      nivelRiesgo = NIVEL_RIESGO.MEDIO;
      mensajeAdvertencia.push("Cliente relativamente nuevo o monto elevado respecto a su historial.");
    } else {
      if (antiguedadMeses < 1) {
        mensajeAdvertencia.push("Cliente demasiado nuevo (menos de 1 mes).");
      }
      if (montoSolicitado > maxTicketHistorico * 3) {
        mensajeAdvertencia.push("Monto solicitado excede significativamente el historial de compras.");
      }
      if (pedidos.length === 0) {
        mensajeAdvertencia.push("Sin historial de pedidos pagados.");
      }
    }

    const analisis = {
      solicitud,
      metricas: {
        antiguedad_meses: antiguedadMeses,
        total_pedidos: pedidos.length,
        max_ticket_historico: maxTicketHistorico,
        promedio_compras: promedioCompras,
        frecuencia_mensual: frecuencia
      },
      evaluacion: {
        nivel_riesgo: nivelRiesgo,
        mensaje_advertencia: mensajeAdvertencia.join(" "),
        sugerencia: nivelRiesgo === NIVEL_RIESGO.BAJO ? "APROBAR" : 
                   nivelRiesgo === NIVEL_RIESGO.MEDIO ? "REVISAR" : 
                   "RECHAZAR"
      }
    };

    return res.json({
      success: true,
      data: analisis
    });
  } catch (error) {
    console.error("Error al analizar riesgo crediticio:", error);
    return res.status(500).json({
      success: false,
      message: "Error al analizar riesgo crediticio"
    });
  }
}

// Aprobar solicitud de crédito
async function aprobarSolicitud(req, res) {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    const { solicitud_id, limite_aprobado } = req.body;
    if (!solicitud_id || !limite_aprobado) {
      throw new Error("Faltan datos requeridos");
    }

    // 1. Obtener datos de la solicitud
    const { rows: [solicitud] } = await client.query(
      "SELECT cliente_id FROM solicitudes_credito WHERE solicitud_id = $1 AND estado = 'PENDIENTE'",
      [solicitud_id]
    );

    if (!solicitud) {
      throw new Error("Solicitud no encontrada o ya procesada");
    }

    // 2. Actualizar estado de la solicitud
    await client.query(
      "UPDATE solicitudes_credito SET estado = 'APROBADO', fecha_actualizacion = CURRENT_TIMESTAMP WHERE solicitud_id = $1",
      [solicitud_id]
    );

    // 3. Crear o actualizar línea de crédito
    const { rows: [creditoExistente] } = await client.query(
      "SELECT credito_id FROM cliente_creditos WHERE cliente_id = $1",
      [solicitud.cliente_id]
    );

    if (creditoExistente) {
      await client.query(
        "UPDATE cliente_creditos SET limite_credito = $1, estado_credito = 'ACTIVO', fecha_actualizacion = CURRENT_TIMESTAMP WHERE credito_id = $2",
        [limite_aprobado, creditoExistente.credito_id]
      );
    } else {
      await client.query(
        "INSERT INTO cliente_creditos (cliente_id, limite_credito, estado_credito) VALUES ($1, $2, 'ACTIVO')",
        [solicitud.cliente_id, limite_aprobado]
      );
    }

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Solicitud aprobada correctamente"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al aprobar solicitud:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error al aprobar solicitud"
    });
  } finally {
    client.release();
  }
}

// Rechazar solicitud de crédito
async function rechazarSolicitud(req, res) {
  try {
    const { solicitud_id, motivo_rechazo } = req.body;
    if (!solicitud_id || !motivo_rechazo) {
      return res.status(400).json({
        success: false,
        message: "Faltan datos requeridos"
      });
    }

    const result = await db.query(
      "UPDATE solicitudes_credito SET estado = 'RECHAZADO', comentarios_admin = $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE solicitud_id = $2 AND estado = 'PENDIENTE'",
      [motivo_rechazo, solicitud_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Solicitud no encontrada o ya procesada"
      });
    }

    return res.json({
      success: true,
      message: "Solicitud rechazada correctamente"
    });
  } catch (error) {
    console.error("Error al rechazar solicitud:", error);
    return res.status(500).json({
      success: false,
      message: "Error al rechazar solicitud"
    });
  }
}

module.exports = {
  obtenerSolicitudesPendientes,
  analizarRiesgoCredito,
  aprobarSolicitud,
  rechazarSolicitud
};
