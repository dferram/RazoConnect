const db = require("../db");

/**
 * Obtiene el admin responsable del estado de un cliente
 * @param {number} clienteId - ID del cliente
 * @param {number} tenantId - ID del tenant
 * @returns {Promise<number|null>} adminId o null si no hay admin asignado
 */
async function getAdminByClienteEstado(clienteId, tenantId) {
  try {
    const result = await db.query(
      `SELECT DISTINCT ame.admin_id
       FROM clientes c
       LEFT JOIN administrador_estados ame ON c.estado_id = ame.estado_id AND c.tenant_id = ame.tenant_id
       WHERE c.clienteid = $1 AND c.tenant_id = $2 AND c.activo = TRUE
       AND ame.activo = TRUE
       LIMIT 1`,
      [clienteId, tenantId]
    );

    return result.rows.length > 0 ? result.rows[0].admin_id : null;
  } catch (error) {
    console.error('[estadosHelper] Error al obtener admin por estado:', error);
    return null;
  }
}

/**
 * Obtiene el estado del cliente
 * @param {number} clienteId - ID del cliente
 * @param {number} tenantId - ID del tenant
 * @returns {Promise<Object>} { estado_id, nombre } o null
 */
async function getClienteEstado(clienteId, tenantId) {
  try {
    const result = await db.query(
      `SELECT c.estado_id, e.nombre, e.abreviatura
       FROM clientes c
       LEFT JOIN estados e ON c.estado_id = e.estadoid
       WHERE c.clienteid = $1 AND c.tenant_id = $2 AND c.activo = TRUE`,
      [clienteId, tenantId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('[estadosHelper] Error al obtener estado del cliente:', error);
    return null;
  }
}

/**
 * Asigna un estado a un cliente
 * @param {number} clienteId - ID del cliente
 * @param {number} estadoId - ID del estado
 * @param {number} tenantId - ID del tenant
 * @returns {Promise<boolean>} true si fue exitoso
 */
async function asignarEstadoCliente(clienteId, estadoId, tenantId) {
  try {
    await db.query(
      `UPDATE clientes
       SET estado_id = $1
       WHERE clienteid = $2 AND tenant_id = $3`,
      [estadoId, clienteId, tenantId]
    );
    return true;
  } catch (error) {
    console.error('[estadosHelper] Error al asignar estado:', error);
    return false;
  }
}

/**
 * Obtiene todos los admins de un estado
 * @param {number} estadoId - ID del estado
 * @param {number} tenantId - ID del tenant
 * @returns {Promise<Array>} Array de admins
 */
async function getAdminesByEstado(estadoId, tenantId) {
  try {
    const result = await db.query(
      `SELECT DISTINCT a.adminid, a.nombre, a.apellido, a.email
       FROM administrador_estados ame
       JOIN administradores a ON ame.admin_id = a.adminid
       WHERE ame.estado_id = $1 AND ame.tenant_id = $2 AND ame.activo = TRUE AND a.activo = TRUE`,
      [estadoId, tenantId]
    );

    return result.rows;
  } catch (error) {
    console.error('[estadosHelper] Error al obtener admins por estado:', error);
    return [];
  }
}

module.exports = {
  getAdminByClienteEstado,
  getClienteEstado,
  asignarEstadoCliente,
  getAdminesByEstado
};
