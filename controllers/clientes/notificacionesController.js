const db = require("../../db");

/**
 * Obtener notificaciones del cliente autenticado
 * GET /api/cliente/notificaciones
 */
async function obtenerNotificacionesCliente(req, res) {
  try {
    const clienteId = req.user.userId;

    const result = await db.query(
      `SELECT 
        NotificacionID,
        Tipo,
        Titulo,
        Mensaje,
        Leida,
        Fecha,
        DatosAdicionales
      FROM Notificaciones
      WHERE ClienteID = $1
      ORDER BY Fecha DESC`,
      [clienteId]
    );

    res.json({
      success: true,
      data: {
        notificaciones: result.rows,
        total: result.rows.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener notificaciones del cliente:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener las notificaciones",
      error: error.message,
    });
  }
}

async function obtenerConteoNotificacionesNoLeidas(req, res) {
  try {
    const clienteId = req.user.userId;

    const result = await db.query(
      "SELECT COUNT(*) as total FROM notificaciones WHERE clienteid = $1 AND leida = false",
      [clienteId]
    );

    const totalRaw = result.rows?.[0]?.total;
    const count = Number.parseInt(totalRaw, 10) || 0;

    return res.json({
      success: true,
      count,
    });
  } catch (error) {
    console.error("Error al obtener conteo de notificaciones no leídas:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener el conteo de notificaciones",
      error: error.message,
    });
  }
}

module.exports = {
  obtenerNotificacionesCliente,
  obtenerConteoNotificacionesNoLeidas,
};
