const db = require("../db");
const logger = require('../utils/logger');

/**
 * Obtener notificaciones del cliente autenticado
 * GET /api/notificaciones
 */
const obtenerNotificaciones = async (req, res) => {
  try {
    const clienteId = req.user.userId;
    const { leidas, tipo, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        notificacionid,
        tipo,
        titulo,
        mensaje,
        leida,
        fechacreacion,
        metadata,
        url,
        prioridad
      FROM notificaciones
      WHERE clienteid = $1
    `;

    const params = [clienteId];
    let paramIndex = 2;

    // Filtro por leídas/no leídas
    if (leidas !== undefined) {
      query += ` AND leida = $${paramIndex}`;
      params.push(leidas === 'true');
      paramIndex++;
    }

    // Filtro por tipo
    if (tipo) {
      query += ` AND tipo = $${paramIndex}`;
      params.push(tipo);
      paramIndex++;
    }

    query += ` ORDER BY 
      CASE prioridad 
        WHEN 'urgente' THEN 1
        WHEN 'alta' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'baja' THEN 4
      END,
      leida ASC,
      fechacreacion DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Contar no leídas
    const countQuery = `
      SELECT COUNT(*) as total_no_leidas
      FROM notificaciones
      WHERE clienteid = $1 AND leida = FALSE
    `;
    const countResult = await db.query(countQuery, [clienteId]);

    res.json({
      success: true,
      data: {
        notificaciones: result.rows,
        totalNoLeidas: parseInt(countResult.rows[0].total_no_leidas),
        total: result.rows.length,
      },
    });
  } catch (error) {
    logger.error('Error al obtener notificaciones:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener notificaciones",
      error: error.message,
    });
  }
};

/**
 * Marcar todas las notificaciones staff como leídas
 * POST /api/staff/notificaciones/marcar-todas-leidas
 */
const marcarTodasLeidasStaff = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    const roles =
      Array.isArray(req.user.roles) && req.user.roles.length
        ? req.user.roles
        : [req.user.rol].filter(Boolean);

    const isAdmin = roles.some((r) =>
      ["admin", "superadmin"].includes(String(r).toLowerCase())
    );
    const isAgente = roles.some((r) => String(r).toLowerCase() === "agente");

    let column = null;
    let staffId = null;

    if (isAdmin) {
      column = "administrador_id";
      staffId = req.user.id || req.user.userId || null;
    } else if (isAgente) {
      column = "agente_id";
      staffId = req.user.userId || req.user.agenteId || null;
    }

    if (!column || !staffId) {
      return res.status(403).json({
        success: false,
        message: "No tienes permisos para acceder a este recurso",
      });
    }

    const result = await db.query(
      `UPDATE notificaciones
       SET leida = TRUE
       WHERE ${column} = $1
         AND leida = FALSE
       RETURNING notificacionid`,
      [staffId]
    );

    return res.json({
      success: true,
      message: `${result.rows.length} notificaciones marcadas como leídas`,
      data: {
        actualizadas: result.rows.length,
      },
    });
  } catch (error) {
    logger.error('Error al marcar todas como leídas (staff):', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al marcar todas como leídas",
      error: error.message,
    });
  }
};

/**
 * Obtener conteo de notificaciones no leídas para staff (admin/superadmin/agente)
 * GET /api/staff/notificaciones/unread-count
 */
const obtenerConteoNoLeidasStaff = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    const roles =
      Array.isArray(req.user.roles) && req.user.roles.length
        ? req.user.roles
        : [req.user.rol].filter(Boolean);

    const isAdmin = roles.some((r) =>
      ["admin", "super_admin", "superadmin"].includes(String(r).toLowerCase())
    );
    const isAgente = roles.some((r) => String(r).toLowerCase() === "agente");

    let column = null;
    let staffId = null;

    if (isAdmin) {
      column = "administrador_id";
      staffId = req.user.id || req.user.userId || null;
    } else if (isAgente) {
      column = "agente_id";
      staffId = req.user.userId || req.user.agenteId || null;
    }

    if (!column || !staffId) {
      return res.status(403).json({
        success: false,
        message: "No tienes permisos para acceder a este recurso",
      });
    }

    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM notificaciones
      WHERE ${column} = $1
        AND leida = FALSE
    `;

    const result = await db.query(countQuery, [staffId]);
    const count = Number(result.rows?.[0]?.count || 0);

    return res.json({
      success: true,
      count,
    });
  } catch (error) {
    logger.error('Error al obtener conteo de notificaciones staff:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener conteo de notificaciones",
      error: error.message,
    });
  }
};

/**
 * Obtener notificaciones internas para staff (admin/superadmin/agente)
 * GET /api/staff/notificaciones
 */
const obtenerNotificacionesStaff = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    const roles =
      Array.isArray(req.user.roles) && req.user.roles.length
        ? req.user.roles
        : [req.user.rol].filter(Boolean);

    const isAdmin = roles.some((r) => ["admin", "super_admin", "superadmin"].includes(String(r).toLowerCase()));
    const isAgente = roles.some((r) => String(r).toLowerCase() === "agente");

    let column = null;
    let staffId = null;

    if (isAdmin) {
      column = "administrador_id";
      staffId = req.user.id || req.user.userId || null;
    } else if (isAgente) {
      column = "agente_id";
      staffId = req.user.userId || req.user.agenteId || null;
    }

    if (!column || !staffId) {
      return res.status(403).json({
        success: false,
        message: "No tienes permisos para acceder a este recurso",
      });
    }

    const { limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT
        notificacionid,
        tipo,
        titulo,
        mensaje,
        leida,
        fechacreacion,
        metadata,
        url,
        prioridad,
        administrador_id,
        agente_id,
        clienteid
      FROM notificaciones
      WHERE ${column} = $1
      ORDER BY leida ASC, fechacreacion DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [staffId, parseInt(limit), parseInt(offset)]);

    return res.json({
      success: true,
      data: {
        notificaciones: result.rows,
        total: result.rows.length,
      },
    });
  } catch (error) {
    logger.error('Error al obtener notificaciones staff:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener notificaciones",
      error: error.message,
    });
  }
};

/**
 * Marcar notificación como leída
 * POST /api/notificaciones/:id/marcar-leida
 */
const marcarComoLeida = async (req, res) => {
  try {
    const clienteId = req.user.userId;
    const notificacionId = parseInt(req.params.id);

    const result = await db.query(
      `UPDATE notificaciones 
       SET leida = TRUE 
       WHERE notificacionid = $1 AND clienteid = $2
       RETURNING *`,
      [notificacionId, clienteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notificación no encontrada",
      });
    }

    res.json({
      success: true,
      message: "Notificación marcada como leída",
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error al marcar notificación:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al marcar notificación",
      error: error.message,
    });
  }
};

/**
 * Marcar todas las notificaciones como leídas
 * POST /api/notificaciones/marcar-todas-leidas
 */
const marcarTodasLeidas = async (req, res) => {
  try {
    const clienteId = req.user.userId;

    const result = await db.query(
      `UPDATE notificaciones 
       SET leida = TRUE 
       WHERE clienteid = $1 AND leida = FALSE
       RETURNING notificacionid`,
      [clienteId]
    );

    res.json({
      success: true,
      message: `${result.rows.length} notificaciones marcadas como leídas`,
      data: {
        actualizadas: result.rows.length,
      },
    });
  } catch (error) {
    logger.error('Error al marcar todas como leídas:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al marcar todas como leídas",
      error: error.message,
    });
  }
};

/**
 * Eliminar una notificación
 * DELETE /api/notificaciones/:id
 */
const eliminarNotificacion = async (req, res) => {
  try {
    const clienteId = req.user.userId;
    const notificacionId = parseInt(req.params.id);

    const result = await db.query(
      `DELETE FROM notificaciones 
       WHERE notificacionid = $1 AND clienteid = $2
       RETURNING notificacionid`,
      [notificacionId, clienteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notificación no encontrada",
      });
    }

    res.json({
      success: true,
      message: "Notificación eliminada",
    });
  } catch (error) {
    logger.error('Error al eliminar notificación:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al eliminar notificación",
      error: error.message,
    });
  }
};

/**
 * Crear notificación (uso interno del sistema)
 * @param {number} clienteId - ID del cliente
 * @param {object} notificacion - Datos de la notificación
 */
const crearNotificacion = async (clienteId, notificacion) => {
  const {
    tipo,
    titulo,
    mensaje,
    url = null,
    prioridad = 'normal',
    metadata = {},
  } = notificacion;

  try {
    const tenant_id = req.tenant?.tenant_id || req.user?.tenantId || 1;
    const result = await db.query(
      `INSERT INTO notificaciones 
       (clienteid, tipo, titulo, mensaje, url, prioridad, metadata, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [clienteId, tipo, titulo, mensaje, url, prioridad, JSON.stringify(metadata), tenant_id]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error al crear notificación:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    throw error;
  }
};

/**
 * Crear notificación de cambio de estado de pedido
 */
const notificarCambioEstadoPedido = async (pedidoId, nuevoEstado, clienteId) => {
  const mensajes = {
    Pendiente: {
      titulo: "Pedido Recibido",
      mensaje: `Tu pedido #${pedidoId} ha sido recibido y está siendo procesado.`,
      emoji: "📦",
    },
    Procesando: {
      titulo: "Pedido en Proceso",
      mensaje: `Tu pedido #${pedidoId} está siendo preparado para envío.`,
      emoji: "⚙️",
    },
    Enviado: {
      titulo: "Pedido Enviado",
      mensaje: `¡Tu pedido #${pedidoId} ha sido enviado! Pronto llegará a tu dirección.`,
      emoji: "🚚",
    },
    Entregado: {
      titulo: "Pedido Entregado",
      mensaje: `Tu pedido #${pedidoId} ha sido entregado exitosamente. ¡Gracias por tu compra!`,
      emoji: "✅",
    },
    Cancelado: {
      titulo: "Pedido Cancelado",
      mensaje: `Tu pedido #${pedidoId} ha sido cancelado.`,
      emoji: "❌",
    },
  };

  const info = mensajes[nuevoEstado] || {
    titulo: "Actualización de Pedido",
    mensaje: `Tu pedido #${pedidoId} ha cambiado de estado: ${nuevoEstado}`,
    emoji: "🔔",
  };

  return await crearNotificacion(clienteId, {
    tipo: 'pedido',
    titulo: `${info.emoji} ${info.titulo}`,
    mensaje: info.mensaje,
    url: `/dashboard.html?tab=pedidos&pedido=${pedidoId}`,
    prioridad: nuevoEstado === 'Cancelado' ? 'alta' : 'normal',
    metadata: { pedidoId, estado: nuevoEstado },
  });
};

/**
 * Crear notificación de backorder cancelado
 */
const notificarBackorderCancelado = async (ordenCompraId, clienteId, motivo) => {
  return await crearNotificacion(clienteId, {
    tipo: 'backorder',
    titulo: "⚠️ Orden de Backorder Cancelada",
    mensaje: `Tu orden de backorder #${ordenCompraId} ha sido cancelada. Motivo: ${motivo}`,
    url: `/dashboard.html?tab=pedidos`,
    prioridad: 'alta',
    metadata: { ordenCompraId, motivo },
  });
};

/**
 * Crear notificación de nueva oferta
 */
const notificarNuevaOferta = async (clienteId, productoNombre, descuento) => {
  return await crearNotificacion(clienteId, {
    tipo: 'oferta',
    titulo: `🔥 ¡Nueva Oferta! ${descuento}% OFF`,
    mensaje: `${productoNombre} ahora tiene un ${descuento}% de descuento. ¡No te lo pierdas!`,
    url: '/catalogo.html',
    prioridad: 'normal',
    metadata: { productoNombre, descuento },
  });
};

/**
 * Crear notificación de temporada cercana
 */
const notificarTemporadaCercana = async (clienteId, temporada, diasRestantes) => {
  return await crearNotificacion(clienteId, {
    tipo: 'temporada',
    titulo: `🎉 ${temporada} se acerca`,
    mensaje: `Faltan ${diasRestantes} días para ${temporada}. ¡Prepara tus pedidos especiales!`,
    url: '/catalogo.html',
    prioridad: 'normal',
    metadata: { temporada, diasRestantes },
  });
};

module.exports = {
  obtenerNotificaciones,
  obtenerNotificacionesStaff,
  obtenerConteoNoLeidasStaff,
  marcarTodasLeidasStaff,
  marcarComoLeida,
  marcarTodasLeidas,
  eliminarNotificacion,
  crearNotificacion,
  notificarCambioEstadoPedido,
  notificarBackorderCancelado,
  notificarNuevaOferta,
  notificarTemporadaCercana,
};
