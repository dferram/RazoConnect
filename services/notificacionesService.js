const db = require("../db");

/**
 * Crear una notificación para un cliente
 * @param {number} clienteId
 * @param {'pedido'|'oferta'|'temporada'|'backorder'|'sistema'|'producto'} tipo
 * @param {string} titulo
 * @param {string} mensaje
 * @param {object|null} options - { url, prioridad, metadata }
 * @returns {Promise<object>}
 */
async function crearNotificacion(
  clienteId,
  tipo,
  titulo,
  mensaje,
  options = {}
) {
  if (!clienteId || !tipo || !titulo || !mensaje) {
    throw new Error("Datos insuficientes para crear la notificación");
  }

  const tiposPermitidos = ['pedido', 'oferta', 'temporada', 'backorder', 'sistema', 'producto'];
  const tipoNormalizado = tiposPermitidos.includes(tipo) ? tipo : 'sistema';
  
  const prioridadesPermitidas = ['baja', 'normal', 'alta', 'urgente'];
  const prioridad = prioridadesPermitidas.includes(options.prioridad) ? options.prioridad : 'normal';
  
  const url = options.url || null;
  const metadata = options.metadata ? JSON.stringify(options.metadata) : '{}';

  try {
    const result = await db.query(
      `INSERT INTO notificaciones
        (clienteid, tipo, titulo, mensaje, url, prioridad, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [clienteId, tipoNormalizado, titulo, mensaje, url, prioridad, metadata]
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
