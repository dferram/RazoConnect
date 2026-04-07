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
       WHERE ame.estado_id = $1 AND ame.tenant_id = $2 AND a.activo = TRUE`,
      [estadoId, tenantId]
    );

    return result.rows;
  } catch (error) {
    console.error('[estadosHelper] Error al obtener admins por estado:', error);
    return [];
  }
}

/**
 * Obtiene el admin_id desde el contexto del usuario
 * Usa para filtrar CxC y otras operaciones separadas por admin
 *
 * @param {Object} user - req.user
 * @returns {Object} { adminId: number|null, shouldFilter: boolean }
 *   - adminId: el ID del admin a filtrar (null = no filtrar = ver todo)
 *   - shouldFilter: true si debe agregarse filtro WHERE admin_id = X
 *
 * Lógica:
 *   - Super Admin (rol=super_admin): adminId=null, shouldFilter=false (VE TODO)
 *   - Admin (rol=admin): adminId=su adminid, shouldFilter=true
 *   - Staff (admin_responsable_id): adminId=admin_responsable_id, shouldFilter=true
 */
function getAdminIdFromContext(user) {
  if (!user) {
    return { adminId: 1, shouldFilter: true };
  }

  // Super Admin ve TODO
  if (user.rol === 'super_admin') {
    return { adminId: null, shouldFilter: false };
  }

  // Admin ve su stock
  if (user.rol === 'admin') {
    return { adminId: user.adminid, shouldFilter: true };
  }

  // Staff (finanzas, inventarios, etc) ve admin asignado
  if (user.admin_responsable_id) {
    return { adminId: user.admin_responsable_id, shouldFilter: true };
  }

  // Default: mostrar admin 1
  return { adminId: 1, shouldFilter: true };
}

module.exports = {
  getAdminByClienteEstado,
  getClienteEstado,
  asignarEstadoCliente,
  getAdminesByEstado,
  getAdminIdFromContext
};
