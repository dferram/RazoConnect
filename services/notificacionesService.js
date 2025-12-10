const db = require("../db");

/**
 * Crear una notificación para un cliente
 * @param {number} clienteId
 * @param {'general'|'pedido'|'oferta'|'backorder'|'temporada'|string} tipo
 * @param {string} titulo
 * @param {string} mensaje
 * @param {object|null} datosAdicionales
 * @returns {Promise<object>}
 */
async function crearNotificacion(
  clienteId,
  tipo,
  titulo,
  mensaje,
  datosAdicionales = null
) {
  if (!clienteId || !tipo || !titulo || !mensaje) {
    throw new Error("Datos insuficientes para crear la notificación");
  }

  try {
    const result = await db.query(
      `INSERT INTO Notificaciones
        (ClienteID, Tipo, Titulo, Mensaje)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [clienteId, tipo, titulo, mensaje]
    );

    return result.rows[0];
  } catch (error) {
    console.error("Error al crear notificación:", error);
    throw error;
  }
}

module.exports = {
  crearNotificacion,
};
