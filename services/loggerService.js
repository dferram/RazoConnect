/**
 * SERVICIO DE AUDITORÍA Y BITÁCORA
 * Registra todas las acciones de escritura en el sistema
 * 
 * @module loggerService
 */

const db = require("../db");

/**
 * Registra una acción en la bitácora de auditoría
 * 
 * @param {Object} req - Objeto de request de Express (contiene usuario autenticado)
 * @param {string} accion - Tipo de acción: 'CREAR', 'EDITAR', 'ELIMINAR', 'LOGIN', 'LOGOUT'
 * @param {string} entidad - Nombre de la entidad afectada: 'Producto', 'Categoría', 'Pedido', etc.
 * @param {number|string} entidadId - ID del registro afectado (puede ser null para acciones generales)
 * @param {Object} detalles - Objeto con información adicional (se guarda como JSONB)
 * @param {string} detalles.descripcion - Descripción legible de la acción
 * @param {Object} detalles.anterior - Estado anterior del registro (opcional)
 * @param {Object} detalles.nuevo - Estado nuevo del registro (opcional)
 * @param {Array} detalles.campos - Lista de campos modificados (opcional)
 * @returns {Promise<Object>} Registro de log creado
 */
const registrarLog = async (req, accion, entidad, entidadId = null, detalles = {}) => {
  try {
    // Extraer información del usuario autenticado
    const usuario = req.user || {};
    const usuarioId = usuario.id || usuario.userId || null;
    const nombreUsuario = usuario.nombre 
      ? `${usuario.nombre} ${usuario.apellido || ''}`.trim() 
      : usuario.email || 'Usuario desconocido';
    const rol = Array.isArray(usuario.roles) 
      ? usuario.roles[0] 
      : usuario.rol || 'Sin rol';

    // Extraer IP del cliente
    const ip = req.ip || 
               req.headers['x-forwarded-for'] || 
               req.headers['x-real-ip'] || 
               req.connection.remoteAddress || 
               'IP desconocida';

    // Limpiar IPv6 local
    const ipLimpia = ip.replace('::ffff:', '');

    // Validar datos requeridos
    if (!accion || !entidad) {
      console.warn('⚠️ Logger: Faltan parámetros requeridos (accion o entidad)');
      return null;
    }

    // Convertir detalles a JSON si no lo es
    const detallesJSON = typeof detalles === 'string' 
      ? detalles 
      : JSON.stringify(detalles);

    // Insertar en la base de datos
    const result = await db.query(
      `INSERT INTO Log_Movimientos 
        (UsuarioID, NombreUsuario, Rol, Accion, Entidad, EntidadID, Detalles, IP)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING LogID, Fecha`,
      [
        usuarioId,
        nombreUsuario,
        rol,
        accion.toUpperCase(),
        entidad,
        entidadId,
        detallesJSON,
        ipLimpia
      ]
    );

    const logCreado = result.rows[0];
    
    return logCreado;

  } catch (error) {
    // No fallar si el log falla - solo registrar el error
    console.error('❌ Error al registrar en bitácora:', error.message);
    console.error('Detalles:', {
      accion,
      entidad,
      entidadId,
      usuario: req.user?.email || 'desconocido'
    });
    return null;
  }
};

/**
 * Registra múltiples acciones en un lote (útil para operaciones masivas)
 * 
 * @param {Object} req - Request de Express
 * @param {Array} acciones - Array de objetos {accion, entidad, entidadId, detalles}
 * @returns {Promise<number>} Cantidad de logs registrados
 */
const registrarLogBatch = async (req, acciones) => {
  let registrados = 0;
  
  for (const accion of acciones) {
    const resultado = await registrarLog(
      req,
      accion.accion,
      accion.entidad,
      accion.entidadId,
      accion.detalles
    );
    if (resultado) registrados++;
  }
  
  return registrados;
};

/**
 * Obtiene el historial de logs con filtros y paginación
 * 
 * @param {Object} filtros - Filtros de búsqueda
 * @param {string} filtros.usuarioId - Filtrar por usuario específico
 * @param {string} filtros.accion - Filtrar por tipo de acción
 * @param {string} filtros.entidad - Filtrar por entidad
 * @param {string} filtros.fechaInicio - Fecha inicial (YYYY-MM-DD)
 * @param {string} filtros.fechaFin - Fecha final (YYYY-MM-DD)
 * @param {number} filtros.limit - Límite de registros (default: 50)
 * @param {number} filtros.offset - Offset para paginación (default: 0)
 * @returns {Promise<{rows: Array, total: number}>} Lista de logs y total
 */
const obtenerLogs = async (filtros = {}) => {
  try {
    const {
      usuarioId,
      accion,
      entidad,
      fechaInicio,
      fechaFin,
      limit = 50,
      offset = 0
    } = filtros;

    // Construir cláusula WHERE y parámetros compartidos
    let whereClause = "WHERE 1=1";
    const params = [];
    let paramIndex = 1;

    if (usuarioId) {
      whereClause += ` AND l.UsuarioID = $${paramIndex}`;
      params.push(usuarioId);
      paramIndex++;
    }

    if (accion) {
      whereClause += ` AND l.Accion = $${paramIndex}`;
      params.push(accion.toUpperCase());
      paramIndex++;
    }

    if (entidad) {
      whereClause += ` AND l.Entidad = $${paramIndex}`;
      params.push(entidad);
      paramIndex++;
    }

    if (fechaInicio) {
      whereClause += ` AND l.Fecha >= $${paramIndex}`;
      params.push(fechaInicio);
      paramIndex++;
    }

    if (fechaFin) {
      whereClause += ` AND l.Fecha <= $${paramIndex}`;
      params.push(fechaFin);
      paramIndex++;
    }

    const selectQuery = `
      SELECT 
        l.LogID,
        l.UsuarioID,
        l.NombreUsuario,
        l.Rol,
        l.Accion,
        l.Entidad,
        l.EntidadID,
        l.Detalles,
        l.IP,
        l.Fecha,
        a.Nombre AS admin_nombre,
        a.Email AS admin_email
      FROM Log_Movimientos l
      LEFT JOIN Administradores a ON l.UsuarioID = a.AdminID
      ${whereClause}
      ORDER BY l.Fecha DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const selectParams = [...params, limit, offset];

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM Log_Movimientos l
      ${whereClause}
    `;

    const [result, countResult] = await Promise.all([
      db.query(selectQuery, selectParams),
      db.query(countQuery, params),
    ]);

    const total = parseInt(countResult.rows[0]?.total, 10) || 0;

    return {
      rows: result.rows,
      total,
    };
  } catch (error) {
    console.error('Error al obtener logs:', error);
    throw error;
  }
};

/**
 * Obtiene estadísticas de la bitácora
 * 
 * @returns {Promise<Object>} Estadísticas generales
 */
const obtenerEstadisticas = async () => {
  try {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_movimientos,
        COUNT(DISTINCT UsuarioID) as usuarios_activos,
        COUNT(CASE WHEN Accion = 'CREAR' THEN 1 END) as total_creaciones,
        COUNT(CASE WHEN Accion = 'EDITAR' THEN 1 END) as total_ediciones,
        COUNT(CASE WHEN Accion = 'ELIMINAR' THEN 1 END) as total_eliminaciones,
        COUNT(CASE WHEN Fecha >= NOW() - INTERVAL '24 hours' THEN 1 END) as movimientos_hoy
      FROM Log_Movimientos
    `);

    return result.rows[0];
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    throw error;
  }
};

module.exports = {
  registrarLog,
  registrarLogBatch,
  obtenerLogs,
  obtenerEstadisticas
};
