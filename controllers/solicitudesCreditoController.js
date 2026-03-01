const db = require("../db");
const logger = require('../utils/logger');
const { sendTemplatedEmail } = require("../services/emailService");

const NIVEL_RIESGO = {
  BAJO: "BAJO",
  MEDIO: "MEDIO",
  ALTO: "ALTO"
};

async function obtenerSolicitudesPendientes(req, res) {
  try {
    const { tenant_id } = req.tenant;

    const { rows } = await db.query(
      `SELECT 
        s.solicitud_id,
        s.cliente_id,
        s.monto_solicitado,
        s.motivo_uso,
        s.estado,
        s.fecha_solicitud,
        c.nombre || ' ' || c.apellido as nombre_cliente
      FROM solicitudes_credito s
      INNER JOIN clientes c ON c.clienteid = s.cliente_id AND c.tenant_id = s.tenant_id
      WHERE s.estado = 'PENDIENTE'
        AND s.tenant_id = $1
      ORDER BY s.fecha_solicitud DESC`,
      [tenant_id]
    );

    // Calcular monto total solicitado
    const montoTotal = rows.reduce((sum, row) => sum + Number(row.monto_solicitado), 0);

    return res.json({
      success: true,
      data: {
        solicitudes: rows,
        stats: {
          total_pendientes: rows.length,
          monto_total_pendiente: montoTotal
        }
      }
    });
  } catch (error) {
    logger.error('Error obteniendo solicitudes pendientes:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener solicitudes pendientes"
    });
  }
}

async function obtenerAnalisisSolicitud(req, res) {
  try {
    const { tenant_id } = req.tenant;
    const solicitudId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(solicitudId)) {
      return res.status(400).json({
        success: false,
        message: "ID de solicitud inválido"
      });
    }

    // 1. Obtener datos de la solicitud y cliente
    const { rows: [solicitud] } = await db.query(
      `SELECT 
        s.solicitud_id,
        s.cliente_id,
        s.monto_solicitado,
        s.motivo_uso,
        s.fecha_solicitud,
        c.nombre || ' ' || c.apellido as nombre_cliente,
        c.fechaderegistro,
        EXTRACT(MONTH FROM AGE(CURRENT_DATE, c.fechaderegistro))::integer as antiguedad_meses
      FROM solicitudes_credito s
      INNER JOIN clientes c ON c.clienteid = s.cliente_id AND c.tenant_id = s.tenant_id
      WHERE s.solicitud_id = $1
        AND s.tenant_id = $2`,
      [solicitudId, tenant_id]
    );

    if (!solicitud) {
      return res.status(404).json({
        success: false,
        message: "Solicitud no encontrada"
      });
    }

    // 2. Obtener métricas de pedidos
    const { rows: [metricas] } = await db.query(
      `SELECT 
        COUNT(*)::integer as pedidos_totales,
        COALESCE(SUM(montototal), 0) as total_comprado,
        COALESCE(MAX(montototal), 0) as compra_maxima,
        COALESCE(AVG(montototal), 0) as promedio_compra,
        MAX(fecha) as ultima_compra
      FROM pedidos 
      WHERE clienteid = $1 
        AND tenant_id = $2
        AND estatus = 'COMPLETADO' 
        AND pagado = true`,
      [solicitud.cliente_id, tenant_id]
    );

    // 3. Verificar pagos vencidos
    const { rows: [{ pagos_vencidos }] } = await db.query(
      `SELECT COUNT(*)::integer as pagos_vencidos
       FROM pedidos 
       WHERE clienteid = $1 
         AND tenant_id = $2
         AND es_credito = true
         AND pagado = false
         AND fecha_vencimiento < CURRENT_DATE`,
      [solicitud.cliente_id, tenant_id]
    );

    // 4. Calcular score y mensaje
    let score = NIVEL_RIESGO.MEDIO;
    let mensajes = [];

    if (pagos_vencidos > 0) {
      score = NIVEL_RIESGO.ALTO;
      mensajes.push("Cliente tiene pagos vencidos pendientes");
    } else if (metricas.pedidos_totales === 0) {
      score = NIVEL_RIESGO.ALTO;
      mensajes.push("Cliente sin historial de compras");
    } else if (solicitud.antiguedad_meses < 3) {
      score = NIVEL_RIESGO.MEDIO;
      mensajes.push("Cliente con menos de 3 meses de antigüedad");
    } else if (solicitud.monto_solicitado > metricas.compra_maxima * 2) {
      score = NIVEL_RIESGO.MEDIO;
      mensajes.push('Monto solicitado supera 2x la compra máxima histórica (' + metricas.compra_maxima.toFixed(2) + ')');
    } else if (solicitud.antiguedad_meses >= 6 && solicitud.monto_solicitado <= metricas.compra_maxima * 1.5) {
      score = NIVEL_RIESGO.BAJO;
    }

    return res.json({
      success: true,
      data: {
        solicitud: {
          id: solicitud.solicitud_id,
          monto: solicitud.monto_solicitado,
          motivo: solicitud.motivo_uso,
          fecha: solicitud.fecha_solicitud
        },
        cliente: {
          id: solicitud.cliente_id,
          nombre: solicitud.nombre_cliente,
          antiguedad_meses: solicitud.antiguedad_meses
        },
        metricas: {
          total_comprado: metricas.total_comprado,
          compra_maxima: metricas.compra_maxima,
          pedidos_totales: metricas.pedidos_totales,
          promedio_compra: metricas.promedio_compra,
          ultima_compra: metricas.ultima_compra,
          pagos_vencidos
        },
        score,
        mensajes
      }
    });
  } catch (error) {
    logger.error('Error en análisis de solicitud:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al analizar solicitud"
    });
  }
}

async function aprobarSolicitud(req, res) {
  const client = await db.pool.connect();
  try {
    const { tenant_id } = req.tenant;
    const solicitudId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(solicitudId)) {
      return res.status(400).json({
        success: false,
        message: "ID de solicitud inválido"
      });
    }

    await client.query('BEGIN');

    // 1. Obtener datos de la solicitud
    const { rows: [solicitud] } = await client.query(
      `SELECT cliente_id, monto_solicitado 
       FROM solicitudes_credito 
       WHERE solicitud_id = $1 
         AND tenant_id = $2
         AND estado = 'PENDIENTE'
       FOR UPDATE`,
      [solicitudId, tenant_id]
    );

    if (!solicitud) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Solicitud no encontrada o ya procesada"
      });
    }

    // 2. Verificar que no tenga crédito activo
    const { rows: [creditoActivo] } = await client.query(
      `SELECT credito_id 
       FROM cliente_creditos 
       WHERE cliente_id = $1 
         AND tenant_id = $2
         AND estado_credito = 'ACTIVO'
       LIMIT 1`,
      [solicitud.cliente_id, tenant_id]
    );

    if (creditoActivo) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: "El cliente ya tiene una línea de crédito activa"
      });
    }

    // 3. Crear línea de crédito
    await client.query(
      `INSERT INTO cliente_creditos 
         (cliente_id, limite_credito, saldo_deudor, estado_credito, tenant_id)
       VALUES 
         ($1, $2, 0, 'ACTIVO', $3)`,
      [solicitud.cliente_id, solicitud.monto_solicitado, tenant_id]
    );

    // 4. Actualizar estado de la solicitud
    await client.query(
      `UPDATE solicitudes_credito 
       SET estado = 'APROBADO',
           comentarios_admin = $1
       WHERE solicitud_id = $2`,
      [`Aprobado por administrador ${req.user.id}`, solicitudId]
    );

    // 5. Obtener datos del cliente para notificaciones
    const { rows: [cliente] } = await client.query(
      `SELECT nombre, apellido, email FROM clientes WHERE clienteid = $1 AND tenant_id = $2`,
      [solicitud.cliente_id, tenant_id]
    );

    // 6. Crear notificación in-app para el cliente
    await client.query(
      `INSERT INTO notificaciones 
         (clienteid, tipo, titulo, mensaje, prioridad, url, tenant_id)
       VALUES 
         ($1, 'sistema', '¡Crédito Aprobado!', 'Tu solicitud de crédito ha sido aprobada. Ya puedes realizar compras a crédito por un monto de $' || $2 || '.', 'alta', '/perfil/creditos', $3)`,
      [solicitud.cliente_id, solicitud.monto_solicitado, tenant_id]
    );

    await client.query('COMMIT');

    // 7. Enviar email de forma asíncrona (no bloqueante)
    if (cliente && cliente.email) {
      const frontendUrl = process.env.FRONTEND_BASE_URL || 'https://razo.com.mx';
      const nombreCompleto = `${cliente.nombre} ${cliente.apellido}`;
      
      sendTemplatedEmail(
        cliente.email,
        '¡Felicidades! Tu Crédito Razo ha sido Aprobado',
        {
          title: '¡Solicitud Aprobada!',
          name: nombreCompleto,
          message: `Nos complace informarte que tu solicitud de crédito ha sido aprobada exitosamente. Ahora dispones de un límite de crédito de <strong>$${Number(solicitud.monto_solicitado).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> para tus compras.`,
          buttonText: 'Ver mi Saldo',
          buttonUrl: `${frontendUrl}/perfil/creditos`,
          additionalInfo: 'Puedes comenzar a realizar compras a crédito de inmediato. Recuerda revisar tus movimientos y saldos regularmente.'
        }
      ).catch(err => logger.error('Error enviando email de aprobación de crédito:', {
      error: err.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    }));
    }

    return res.json({
      success: true,
      message: "Solicitud aprobada correctamente"
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error aprobando solicitud:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al aprobar solicitud"
    });
  } finally {
    client.release();
  }
}

async function rechazarSolicitud(req, res) {
  const client = await db.pool.connect();
  try {
    const { tenant_id } = req.tenant;
    const solicitudId = Number.parseInt(req.params.id, 10);
    const { motivo } = req.body;

    if (!Number.isInteger(solicitudId)) {
      return res.status(400).json({
        success: false,
        message: "ID de solicitud inválido"
      });
    }

    await client.query('BEGIN');

    // 1. Obtener datos de la solicitud
    const { rows: [solicitud] } = await client.query(
      `SELECT cliente_id 
       FROM solicitudes_credito 
       WHERE solicitud_id = $1 
         AND tenant_id = $2
         AND estado = 'PENDIENTE'
       FOR UPDATE`,
      [solicitudId, tenant_id]
    );

    if (!solicitud) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: "Solicitud no encontrada o ya procesada"
      });
    }

    // 2. Obtener datos del cliente para notificaciones
    const { rows: [cliente] } = await client.query(
      `SELECT nombre, apellido, email FROM clientes WHERE clienteid = $1 AND tenant_id = $2`,
      [solicitud.cliente_id, tenant_id]
    );

    // 3. Actualizar estado de la solicitud
    const motivoRechazo = motivo || `Rechazado por administrador ${req.user.id}`;
    await client.query(
      `UPDATE solicitudes_credito 
       SET estado = 'RECHAZADO',
           comentarios_admin = $1
       WHERE solicitud_id = $2`,
      [motivoRechazo, solicitudId]
    );

    // 4. Crear notificación in-app para el cliente
    const mensajeNotificacion = motivo 
      ? `Tu solicitud de crédito ha sido rechazada. Motivo: ${motivo}` 
      : 'Tu solicitud de crédito ha sido rechazada. Contacta a tu agente para más información.';
    
    await client.query(
      `INSERT INTO notificaciones 
         (clienteid, tipo, titulo, mensaje, prioridad, url, tenant_id)
       VALUES 
         ($1, 'sistema', 'Actualización de Solicitud de Crédito', $2, 'alta', '/contacto', $3)`,
      [solicitud.cliente_id, mensajeNotificacion, tenant_id]
    );

    await client.query('COMMIT');

    // 5. Enviar email de forma asíncrona (no bloqueante)
    if (cliente && cliente.email) {
      const frontendUrl = process.env.FRONTEND_BASE_URL || 'https://razo.com.mx';
      const nombreCompleto = `${cliente.nombre} ${cliente.apellido}`;
      
      const mensajeEmail = motivo
        ? `Hemos revisado tu solicitud de crédito. Lamentamos informarte que en esta ocasión no ha sido posible aprobarla.<br><br><strong>Motivo:</strong> ${motivo}`
        : 'Hemos revisado tu solicitud de crédito. Lamentamos informarte que en esta ocasión no ha sido posible aprobarla.';
      
      sendTemplatedEmail(
        cliente.email,
        'Actualización sobre tu Solicitud de Crédito',
        {
          title: 'Estado de tu Solicitud',
          name: nombreCompleto,
          message: mensajeEmail,
          buttonText: 'Contactar Soporte',
          buttonUrl: `${frontendUrl}/contacto`,
          additionalInfo: 'Si tienes preguntas sobre esta decisión, nuestro equipo está disponible para ayudarte.'
        }
      ).catch(err => logger.error('Error enviando email de rechazo de crédito:', {
      error: err.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    }));
    }

    return res.json({
      success: true,
      message: "Solicitud rechazada correctamente"
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error rechazando solicitud:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al rechazar solicitud"
    });
  } finally {
    client.release();
  }
}

module.exports = {
  obtenerSolicitudesPendientes,
  obtenerAnalisisSolicitud,
  aprobarSolicitud,
  rechazarSolicitud
};
