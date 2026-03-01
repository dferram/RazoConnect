/**
 * REDIS CLIENT CONFIGURATION
 * 
 * Cliente Redis para Azure Cache for Redis
 * Usado para almacenar refresh tokens y gestión de sesiones
 * 
 * @module config/redisClient
 * @author RazoConnect Team
 * @date 2026-02-28
 */

const redis = require('redis');

let redisClient = null;
let isConnected = false;

/**
 * Inicializa y conecta el cliente Redis
 * @returns {Promise<RedisClient>}
 */
const initRedisClient = async () => {
  if (redisClient && isConnected) {
    return redisClient;
  }

  try {
    const redisConfig = {
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6380', 10),
        tls: true, // Azure Redis requiere TLS
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('❌ [REDIS] Máximo de reintentos alcanzado');
            return new Error('Demasiados reintentos de conexión a Redis');
          }
          // Reintentar después de 500ms * número de reintentos
          return Math.min(retries * 500, 3000);
        }
      },
      password: process.env.REDIS_PASSWORD,
    };

    redisClient = redis.createClient(redisConfig);

    // Event handlers
    redisClient.on('error', (err) => {
      console.error('❌ [REDIS] Error de conexión:', err.message);
      isConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('🔄 [REDIS] Conectando a Azure Redis...');
    });

    redisClient.on('ready', () => {
      console.log('✅ [REDIS] Cliente Redis conectado y listo');
      isConnected = true;
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 [REDIS] Reconectando a Redis...');
      isConnected = false;
    });

    redisClient.on('end', () => {
      console.log('⚠️  [REDIS] Conexión cerrada');
      isConnected = false;
    });

    // Conectar
    await redisClient.connect();

    return redisClient;
  } catch (error) {
    console.error('❌ [REDIS] Error al inicializar cliente:', error);
    throw error;
  }
};

/**
 * Obtiene el cliente Redis (inicializa si es necesario)
 * @returns {Promise<RedisClient>}
 */
const getRedisClient = async () => {
  if (!redisClient || !isConnected) {
    return await initRedisClient();
  }
  return redisClient;
};

/**
 * Verifica si Redis está conectado
 * @returns {boolean}
 */
const isRedisConnected = () => {
  return isConnected && redisClient !== null;
};

/**
 * Cierra la conexión de Redis (para shutdown graceful)
 */
const closeRedisConnection = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('✅ [REDIS] Conexión cerrada correctamente');
    } catch (error) {
      console.error('❌ [REDIS] Error al cerrar conexión:', error);
    } finally {
      redisClient = null;
      isConnected = false;
    }
  }
};

/**
 * Guarda un refresh token en Redis
 * @param {string} userId - ID del usuario
 * @param {string} rol - Rol del usuario (super_admin, admin, agente, cliente)
 * @param {string} refreshToken - Token a guardar
 * @param {number} ttl - Tiempo de vida en segundos (default: 30 días)
 */
const saveRefreshToken = async (userId, rol, refreshToken, ttl = 30 * 24 * 60 * 60) => {
  try {
    const client = await getRedisClient();
    const key = `refresh_token:${rol}:${userId}`;
    
    await client.setEx(key, ttl, refreshToken);
    
    return true;
  } catch (error) {
    console.error('❌ [REDIS] Error al guardar refresh token:', error);
    throw error;
  }
};

/**
 * Obtiene un refresh token de Redis
 * @param {string} userId - ID del usuario
 * @param {string} rol - Rol del usuario
 * @returns {Promise<string|null>}
 */
const getRefreshToken = async (userId, rol) => {
  try {
    const client = await getRedisClient();
    const key = `refresh_token:${rol}:${userId}`;
    
    const token = await client.get(key);
    
    return token;
  } catch (error) {
    console.error('❌ [REDIS] Error al obtener refresh token:', error);
    throw error;
  }
};

/**
 * Elimina un refresh token de Redis (logout)
 * @param {string} userId - ID del usuario
 * @param {string} rol - Rol del usuario
 * @returns {Promise<boolean>}
 */
const deleteRefreshToken = async (userId, rol) => {
  try {
    const client = await getRedisClient();
    const key = `refresh_token:${rol}:${userId}`;
    
    const result = await client.del(key);
    
    return result > 0;
  } catch (error) {
    console.error('❌ [REDIS] Error al eliminar refresh token:', error);
    throw error;
  }
};

/**
 * Verifica si un refresh token existe en Redis
 * @param {string} userId - ID del usuario
 * @param {string} rol - Rol del usuario
 * @returns {Promise<boolean>}
 */
const refreshTokenExists = async (userId, rol) => {
  try {
    const client = await getRedisClient();
    const key = `refresh_token:${rol}:${userId}`;
    
    const exists = await client.exists(key);
    return exists === 1;
  } catch (error) {
    console.error('❌ [REDIS] Error al verificar refresh token:', error);
    throw error;
  }
};

/**
 * Agrega un access token a la blacklist (logout)
 * @param {string} tokenId - JTI del token o hash único
 * @param {number} ttlSeconds - TTL en segundos (tiempo restante del token)
 */
const blacklistAccessToken = async (tokenId, ttlSeconds) => {
  try {
    const client = await getRedisClient();
    const key = `blacklist:${tokenId}`;
    // Mínimo 1 segundo, máximo el TTL real del token
    const safeTtl = Math.max(1, Math.min(ttlSeconds, 3600));
    await client.setEx(key, safeTtl, '1');
    return true;
  } catch (error) {
    console.error('[REDIS] Error al agregar token a blacklist:', error);
    return false; // No lanzar error — logout no debe fallar por esto
  }
};

/**
 * Verifica si un access token está en la blacklist
 * @param {string} tokenId - JTI del token o hash único
 * @returns {Promise<boolean>} true si está blacklisteado
 */
const isTokenBlacklisted = async (tokenId) => {
  try {
    const client = await getRedisClient();
    const key = `blacklist:${tokenId}`;
    const exists = await client.exists(key);
    return exists === 1;
  } catch (error) {
    console.error('[REDIS] Error al verificar blacklist:', error);
    return false; // En caso de error, NO bloquear — fail open para no romper el sistema
  }
};

module.exports = {
  initRedisClient,
  getRedisClient,
  isRedisConnected,
  closeRedisConnection,
  saveRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  refreshTokenExists,
  blacklistAccessToken,
  isTokenBlacklisted,
};
