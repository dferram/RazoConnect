const pool = require('../db');
const logger = require('../utils/logger');

const CACHE_TTL = 5 * 60 * 1000;

const cache = new Map();

function getCacheKey(tenantId, clave) {
  return `${tenantId}:${clave}`;
}

function isCacheValid(entry) {
  return entry && (Date.now() - entry.timestamp < CACHE_TTL);
}

async function getConfiguracion(tenantId, clave, defaultValue = null) {
  const cacheKey = getCacheKey(tenantId, clave);
  const cached = cache.get(cacheKey);

  if (isCacheValid(cached)) {
    return cached.value;
  }

  try {
    const result = await pool.query(
      'SELECT valor FROM configuracion_tenant WHERE tenant_id = $1 AND clave = $2',
      [tenantId, clave]
    );

    const value = result.rows.length > 0 ? result.rows[0].valor : defaultValue;

    cache.set(cacheKey, {
      value,
      timestamp: Date.now()
    });

    return value;
  } catch (error) {
    logger.error(`[ConfiguracionService] Error al obtener configuración ${clave} para tenant ${tenantId}:`, error);
    return defaultValue;
  }
}

async function setConfiguracion(tenantId, clave, valor, adminId = null) {
  try {
    const result = await pool.query(
      `INSERT INTO configuracion_tenant (tenant_id, clave, valor, actualizado_por, actualizado_en)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tenant_id, clave) 
       DO UPDATE SET 
         valor = EXCLUDED.valor,
         actualizado_por = EXCLUDED.actualizado_por,
         actualizado_en = NOW()
       RETURNING *`,
      [tenantId, clave, valor, adminId]
    );

    const cacheKey = getCacheKey(tenantId, clave);
    cache.set(cacheKey, {
      value: valor,
      timestamp: Date.now()
    });

    logger.info(`[ConfiguracionService] Configuración actualizada: tenant=${tenantId}, clave=${clave}, valor=${valor}, admin=${adminId}`);

    return result.rows[0];
  } catch (error) {
    logger.error(`[ConfiguracionService] Error al guardar configuración ${clave} para tenant ${tenantId}:`, error);
    throw error;
  }
}

async function getIvaTasa(tenantId) {
  const valor = await getConfiguracion(tenantId, 'iva_tasa', '0.16');
  return parseFloat(valor);
}

function clearCache(tenantId = null, clave = null) {
  if (tenantId && clave) {
    const cacheKey = getCacheKey(tenantId, clave);
    cache.delete(cacheKey);
  } else if (tenantId) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}

module.exports = {
  getConfiguracion,
  setConfiguracion,
  getIvaTasa,
  clearCache
};
