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

module.exports = {
  obtenerNotificacionesCliente,
};
