/**
 * ════════════════════════════════════════════════════════════
 * SERVICIO DE PERMISOS GRANULARES
 * ════════════════════════════════════════════════════════════
 * 
 * Gestiona la carga y verificación de permisos por rol desde
 * la tabla roles_permisos con caché en memoria (TTL 5 min).
 * 
 * Funciones principales:
 * - getPermisosRol(rol): Obtiene permisos completos de un rol
 * - tienePermiso(rol, modulo, accion): Verifica permiso específico
 * - getRolesConPermiso(modulo, accion): Lista roles con permiso
 */

const pool = require('../db');
const logger = require('../utils/logger');

// ════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE CACHÉ
// ════════════════════════════════════════════════════════════

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const cache = new Map();

/**
 * Genera clave de caché para un rol
 */
function getCacheKey(rol) {
  return `permisos:${rol.toLowerCase()}`;
}

/**
 * Verifica si una entrada de caché es válida
 */
function isCacheValid(entry) {
  return entry && (Date.now() - entry.timestamp < CACHE_TTL);
}

/**
 * Limpia el caché de permisos
 * @param {string} rol - Rol específico a limpiar (opcional)
 */
function clearCache(rol = null) {
  if (rol) {
    const cacheKey = getCacheKey(rol);
    cache.delete(cacheKey);
    logger.info(`[PermisosService] Caché limpiado para rol: ${rol}`);
  } else {
    cache.clear();
    logger.info('[PermisosService] Caché completo limpiado');
  }
}

// ════════════════════════════════════════════════════════════
// FUNCIONES PRINCIPALES
// ════════════════════════════════════════════════════════════

/**
 * Obtiene los permisos completos de un rol desde la BD (con caché)
 * @param {string} rol - Nombre del rol
 * @returns {Object|null} Objeto con permisos { modulo: [acciones] } o null
 */
async function getPermisosRol(rol) {
  if (!rol) {
    logger.warn('[PermisosService] getPermisosRol llamado sin rol');
    return null;
  }

  const rolNormalizado = rol.toLowerCase().trim();
  
  // super_admin y admin tienen acceso total (no requieren consulta BD)
  if (rolNormalizado === 'super_admin' || rolNormalizado === 'admin') {
    return { '*': ['*'] }; // Acceso total a todo
  }

  const cacheKey = getCacheKey(rolNormalizado);
  const cached = cache.get(cacheKey);

  // Retornar desde caché si es válido
  if (isCacheValid(cached)) {
    logger.debug(`[PermisosService] Permisos obtenidos desde caché: ${rolNormalizado}`);
    return cached.value;
  }

  // Consultar base de datos
  try {
    const result = await pool.query(
      'SELECT permisos FROM roles_permisos WHERE LOWER(rol) = $1',
      [rolNormalizado]
    );

    if (result.rows.length === 0) {
      logger.warn(`[PermisosService] Rol no encontrado en roles_permisos: ${rolNormalizado}`);
      
      // Cachear resultado negativo para evitar consultas repetidas
      cache.set(cacheKey, {
        value: null,
        timestamp: Date.now()
      });
      
      return null;
    }

    const permisos = result.rows[0].permisos;

    // Cachear resultado
    cache.set(cacheKey, {
      value: permisos,
      timestamp: Date.now()
    });

    logger.debug(`[PermisosService] Permisos cargados desde BD: ${rolNormalizado}`);
    return permisos;
  } catch (error) {
    logger.error(`[PermisosService] Error al obtener permisos para rol ${rolNormalizado}:`, {
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Verifica si un rol tiene permiso para una acción específica en un módulo
 * @param {string} rol - Nombre del rol
 * @param {string} modulo - Módulo del sistema (ej: 'inventario', 'finanzas')
 * @param {string} accion - Acción específica (ej: 'ver', 'editar', 'auditar')
 * @returns {boolean} true si tiene permiso, false si no
 */
async function tienePermiso(rol, modulo, accion) {
  if (!rol || !modulo || !accion) {
    logger.warn('[PermisosService] tienePermiso llamado con parámetros faltantes', {
      rol,
      modulo,
      accion
    });
    return false;
  }

  const rolNormalizado = rol.toLowerCase().trim();
  const moduloNormalizado = modulo.toLowerCase().trim();
  const accionNormalizada = accion.toLowerCase().trim();

  // super_admin y admin tienen acceso total
  if (rolNormalizado === 'super_admin' || rolNormalizado === 'admin') {
    return true;
  }

  // Obtener permisos del rol
  const permisos = await getPermisosRol(rolNormalizado);
  
  if (!permisos) {
    logger.debug(`[PermisosService] Rol sin permisos: ${rolNormalizado}`);
    return false;
  }

  // Verificar si tiene acceso total (wildcard "*")
  if (permisos['*'] && permisos['*'].includes('*')) {
    return true;
  }

  // Verificar permisos del módulo específico
  const accionesModulo = permisos[moduloNormalizado];
  
  if (!accionesModulo || !Array.isArray(accionesModulo)) {
    logger.debug(`[PermisosService] Módulo no encontrado en permisos: ${moduloNormalizado} para rol ${rolNormalizado}`);
    return false;
  }

  // Verificar si tiene wildcard en el módulo
  if (accionesModulo.includes('*')) {
    return true;
  }

  // Verificar acción específica
  const tieneAccion = accionesModulo.includes(accionNormalizada);
  
  logger.debug(`[PermisosService] Verificación de permiso: ${rolNormalizado} -> ${moduloNormalizado}:${accionNormalizada} = ${tieneAccion}`);
  
  return tieneAccion;
}

/**
 * Obtiene lista de roles que tienen permiso para una acción específica
 * @param {string} modulo - Módulo del sistema
 * @param {string} accion - Acción específica
 * @returns {Array<string>} Array de nombres de roles con permiso
 */
async function getRolesConPermiso(modulo, accion) {
  if (!modulo || !accion) {
    logger.warn('[PermisosService] getRolesConPermiso llamado con parámetros faltantes', {
      modulo,
      accion
    });
    return [];
  }

  const moduloNormalizado = modulo.toLowerCase().trim();
  const accionNormalizada = accion.toLowerCase().trim();

  try {
    // Consultar todos los roles que tienen el permiso
    const result = await pool.query(`
      SELECT rol 
      FROM roles_permisos 
      WHERE 
        permisos->$1 @> $2::jsonb
        OR permisos @> '{"*": ["*"]}'::jsonb
        OR permisos->$1 @> '["*"]'::jsonb
    `, [moduloNormalizado, JSON.stringify([accionNormalizada])]);

    const roles = result.rows.map(row => row.rol);
    
    logger.debug(`[PermisosService] Roles con permiso ${moduloNormalizado}:${accionNormalizada}:`, roles);
    
    return roles;
  } catch (error) {
    logger.error(`[PermisosService] Error al obtener roles con permiso ${moduloNormalizado}:${accionNormalizada}:`, {
      error: error.message,
      stack: error.stack
    });
    return [];
  }
}

/**
 * Obtiene todos los roles disponibles con sus descripciones
 * @returns {Array<Object>} Array de objetos { rol, descripcion }
 */
async function getAllRoles() {
  try {
    const result = await pool.query(
      'SELECT rol, descripcion FROM roles_permisos ORDER BY rol'
    );
    
    return result.rows;
  } catch (error) {
    logger.error('[PermisosService] Error al obtener todos los roles:', {
      error: error.message,
      stack: error.stack
    });
    return [];
  }
}

/**
 * Obtiene la descripción de un rol específico
 * @param {string} rol - Nombre del rol
 * @returns {string|null} Descripción del rol o null
 */
async function getDescripcionRol(rol) {
  if (!rol) return null;

  const rolNormalizado = rol.toLowerCase().trim();

  try {
    const result = await pool.query(
      'SELECT descripcion FROM roles_permisos WHERE LOWER(rol) = $1',
      [rolNormalizado]
    );

    return result.rows.length > 0 ? result.rows[0].descripcion : null;
  } catch (error) {
    logger.error(`[PermisosService] Error al obtener descripción del rol ${rolNormalizado}:`, {
      error: error.message
    });
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════

module.exports = {
  getPermisosRol,
  tienePermiso,
  getRolesConPermiso,
  getAllRoles,
  getDescripcionRol,
  clearCache,
};
