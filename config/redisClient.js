/**
 * REDIS CLIENT CONFIGURATION
 * * Cliente optimizado para Upstash Redis o Azure Cache for Redis.
 * Soporta conexión mediante URL única (preferido para Upstash) 
 * o variables separadas (Azure).
 * * @module config/redisClient
 * @author RazoConnect Team
 * @date 2026-03-09
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
    const redisConfig = {};

    // 1. Prioridad: URL completa (Recomendado para Upstash)
    if (process.env.REDIS_URL) {
      redisConfig.url = process.env.REDIS_URL;
    } else {
      // 2. Respaldo: Variables separadas (Azure)
      redisConfig.socket = {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6380', 10),
      };
      redisConfig.password = process.env.REDIS_PASSWORD;
    }

    // Configuración de seguridad para la nube (Upstash/Azure)
    redisConfig.socket = {
      ...redisConfig.socket,
      tls: true, // Obligatorio para rediss://
      rejectUnauthorized: false, // Evita fallos por certificados intermedios
      family: 4, // Fuerza IPv4 para evitar retardos en DNS
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('❌ [REDIS] Máximo de reintentos alcanzado');
          return new Error('Demasiados reintentos de conexión');
        }
        return Math.min(retries * 500, 3000);
      }
    };

    redisClient = redis.createClient(redisConfig);

    // Manejadores de eventos
    redisClient.on('error', (err) => {
      console.error('❌ [REDIS] Error:', err.message);
      isConnected = false;
    });

    redisClient.on('ready', () => {
      console.log('✅ [REDIS] Conectado exitosamente (Upstash/Cloud)');
      isConnected = true;
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 [REDIS] Intentando reconexión...');
      isConnected = false;
    });

    // Conectar
    await redisClient.connect();

    return redisClient;
  } catch (error) {
    console.error('❌ [REDIS] Error crítico de inicialización:', error.message);
    // Fail-safe: No lanzamos error para que la app no muera, 
    // el middleware de rate limit manejará el 'skip' automáticamente.
    isConnected = false;
    return null;
  }
};

/**
 * Obtiene el cliente Redis (inicializa si es necesario)
 */
const getRedisClient = async () => {
  if (!redisClient || !isConnected) {
    return await initRedisClient();
  }
  return redisClient;
};

/**
 * Verifica si Redis está conectado
 */
const isRedisConnected = () => {
  return isConnected && redisClient !== null;
};

/**
 * Cierra la conexión de Redis (Shutdown)
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
 * --- MÉTODOS DE NEGOCIO (Refresh Tokens & Blacklist) ---
 */

const saveRefreshToken = async (userId, rol, refreshToken, ttl = 30 * 24 * 60 * 60) => {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    const key = `refresh_token:${rol}:${userId}`;
    await client.setEx(key, ttl, refreshToken);
    return true;
  } catch (error) {
    console.error('❌ [REDIS] Error al guardar refresh token:', error);
    return false;
  }
};

const getRefreshToken = async (userId, rol) => {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    const key = `refresh_token:${rol}:${userId}`;
    return await client.get(key);
  } catch (error) {
    console.error('❌ [REDIS] Error al obtener refresh token:', error);
    return null;
  }
};

const deleteRefreshToken = async (userId, rol) => {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    const key = `refresh_token:${rol}:${userId}`;
    const result = await client.del(key);
    return result > 0;
  } catch (error) {
    console.error('❌ [REDIS] Error al eliminar refresh token:', error);
    return false;
  }
};

const refreshTokenExists = async (userId, rol) => {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    const key = `refresh_token:${rol}:${userId}`;
    const exists = await client.exists(key);
    return exists === 1;
  } catch (error) {
    console.error('❌ [REDIS] Error al verificar refresh token:', error);
    return false;
  }
};

const blacklistAccessToken = async (tokenId, ttlSeconds) => {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    const key = `blacklist:${tokenId}`;
    const safeTtl = Math.max(1, Math.min(ttlSeconds, 3600));
    await client.setEx(key, safeTtl, '1');
    return true;
  } catch (error) {
    console.error('[REDIS] Error al agregar token a blacklist:', error);
    return false;
  }
};

const isTokenBlacklisted = async (tokenId) => {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    const key = `blacklist:${tokenId}`;
    const exists = await client.exists(key);
    return exists === 1;
  } catch (error) {
    console.error('[REDIS] Error al verificar blacklist:', error);
    return false;
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