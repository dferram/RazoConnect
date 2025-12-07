const db = require("../db");

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
    console.error("Error al obtener notificaciones:", error);
    res.status(500).json({
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
    console.error("Error al marcar notificación:", error);
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
    console.error("Error al marcar todas como leídas:", error);
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
    console.error("Error al eliminar notificación:", error);
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
    const result = await db.query(
      `INSERT INTO notificaciones 
       (clienteid, tipo, titulo, mensaje, url, prioridad, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [clienteId, tipo, titulo, mensaje, url, prioridad, JSON.stringify(metadata)]
    );

    return result.rows[0];
  } catch (error) {
    console.error("Error al crear notificación:", error);
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
  marcarComoLeida,
  marcarTodasLeidas,
  eliminarNotificacion,
  crearNotificacion,
  notificarCambioEstadoPedido,
  notificarBackorderCancelado,
  notificarNuevaOferta,
  notificarTemporadaCercana,
};
