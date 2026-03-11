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
const NodeCache = require('node-cache');

// Hybrid Cache: Memoria RAM local (antes de Redis)
const localCache = new NodeCache({
  stdTTL: 300, // 5 minutos por defecto
  checkperiod: 60, // Limpieza cada 60 segundos
  useClones: false // Mejor performance, no clona objetos
});

// Cache específico para blacklist (60 segundos)
const blacklistCache = new NodeCache({
  stdTTL: 60,
  checkperiod: 10,
  useClones: false
});

let redisClient = null;
let isConnected = false;
let isDevelopmentMode = false;

/**
 * Crea un cliente mock de Redis para desarrollo local
 * Simula los métodos básicos de Redis usando Map en memoria
 */
const createMockRedisClient = () => {
  const store = new Map();
  const expirations = new Map();

  // Limpieza automática de claves expiradas cada 10 segundos
  setInterval(() => {
    const now = Date.now();
    for (const [key, expireTime] of expirations.entries()) {
      if (now >= expireTime) {
        store.delete(key);
        expirations.delete(key);
      }
    }
  }, 10000);

  return {
    // Simular métodos de Redis
    get: async (key) => {
      const now = Date.now();
      const expireTime = expirations.get(key);
      
      if (expireTime && now >= expireTime) {
        store.delete(key);
        expirations.delete(key);
        return null;
      }
      
      return store.get(key) || null;
    },
    
    set: async (key, value) => {
      store.set(key, value);
      return 'OK';
    },
    
    setEx: async (key, seconds, value) => {
      store.set(key, value);
      expirations.set(key, Date.now() + (seconds * 1000));
      return 'OK';
    },
    
    del: async (key) => {
      const existed = store.has(key);
      store.delete(key);
      expirations.delete(key);
      return existed ? 1 : 0;
    },
    
    exists: async (key) => {
      const now = Date.now();
      const expireTime = expirations.get(key);
      
      if (expireTime && now >= expireTime) {
        store.delete(key);
        expirations.delete(key);
        return 0;
      }
      
      return store.has(key) ? 1 : 0;
    },
    
    // Método para rate-limit-redis
    sendCommand: async (args) => {
      const [command, ...params] = args;
      const cmd = command.toLowerCase();
      
      switch (cmd) {
        case 'incr':
          const current = parseInt(store.get(params[0]) || '0', 10);
          const newVal = current + 1;
          store.set(params[0], String(newVal));
          return newVal;
        
        case 'pexpire':
          const key = params[0];
          const ms = parseInt(params[1], 10);
          expirations.set(key, Date.now() + ms);
          return 1;
        
        case 'pttl':
          const expTime = expirations.get(params[0]);
          if (!expTime) return -2; // Key doesn't exist
          const remaining = expTime - Date.now();
          return remaining > 0 ? remaining : -2;
        
        default:
          console.warn(`⚠️ [REDIS MOCK] Comando no implementado: ${cmd}`);
          return null;
      }
    },
    
    // Métodos de conexión (no-op en mock)
    connect: async () => {},
    quit: async () => {},
    disconnect: async () => {},
    
    // Método para limpiar el store (útil para testing)
    _clearAll: () => {
      store.clear();
      expirations.clear();
    }
  };
};

/**
 * Inicializa y conecta el cliente Redis
 * En desarrollo (NODE_ENV=development), usa un mock en memoria
 * En producción, conecta a Upstash/Azure Redis
 * @returns {Promise<RedisClient>}
 */
const initRedisClient = async () => {
  if (redisClient && isConnected) {
    return redisClient;
  }

  try {
    // 🔍 DETECCIÓN DE ENTORNO
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    // Si estamos en desarrollo, usar mock en memoria
    if (nodeEnv === 'development') {
      console.log('⚠️ [REDIS] Modo desarrollo activo: Usando memoria RAM local');
      console.log('💡 [REDIS] Para usar Redis real, configura NODE_ENV=production');
      
      redisClient = createMockRedisClient();
      isConnected = true;
      isDevelopmentMode = true;
      
      return redisClient;
    }
    
    // 🌐 MODO PRODUCCIÓN: Conectar a Redis real
    console.log('🌐 [REDIS] Modo producción: Conectando a Redis remoto...');
    
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
    isDevelopmentMode = false;

    return redisClient;
  } catch (error) {
    console.error('❌ [REDIS] Error crítico de inicialización:', error.message);
    // Fail-safe: No lanzamos error para que la app no muera, 
    // el middleware de rate limit manejará el 'skip' automáticamente.
    isConnected = false;
    isDevelopmentMode = false;
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
 * Verifica si estamos en modo desarrollo (usando mock)
 */
const isUsingMock = () => {
  return isDevelopmentMode;
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
    // 1. Verificar en RAM local primero (60s cache)
    const cachedResult = blacklistCache.get(tokenId);
    if (cachedResult !== undefined) {
      return cachedResult;
    }

    // 2. Si no está en RAM, verificar en Redis
    const client = await getRedisClient();
    if (!client) return false;
    const key = `blacklist:${tokenId}`;
    const exists = await client.exists(key);
    const isBlacklisted = exists === 1;

    // 3. Guardar resultado en RAM local por 60 segundos
    blacklistCache.set(tokenId, isBlacklisted);

    return isBlacklisted;
  } catch (error) {
    console.error('[REDIS] Error al verificar blacklist:', error);
    return false;
  }
};

/**
 * HYBRID CACHE HELPER
 * Busca en: RAM local → Redis → Base de datos (fetchFunction)
 * @param {string} key - Clave del cache
 * @param {Function} fetchFunction - Función async que obtiene datos de BD
 * @param {number} ttl - Tiempo de vida en segundos (default: 300s = 5min)
 * @returns {Promise<any>}
 */
const getOrSetCache = async (key, fetchFunction, ttl = 300) => {
  try {
    // 1. Verificar en RAM local
    const cachedValue = localCache.get(key);
    if (cachedValue !== undefined) {
      return cachedValue;
    }

    // 2. Verificar en Redis
    const client = await getRedisClient();
    if (client) {
      const redisValue = await client.get(key);
      if (redisValue !== null) {
        const parsed = JSON.parse(redisValue);
        // Guardar en RAM local para próximas peticiones
        localCache.set(key, parsed, ttl);
        return parsed;
      }
    }

    // 3. Ejecutar fetchFunction (consulta a BD)
    const freshData = await fetchFunction();

    // 4. Guardar en ambos caches
    localCache.set(key, freshData, ttl);
    if (client) {
      await client.setEx(key, ttl, JSON.stringify(freshData));
    }

    return freshData;
  } catch (error) {
    console.error('[HYBRID CACHE] Error:', error);
    // Fallback: ejecutar fetchFunction directamente
    return await fetchFunction();
  }
};

/**
 * Invalida cache en RAM y Redis
 * @param {string} key - Clave a invalidar
 */
const invalidateCache = async (key) => {
  try {
    localCache.del(key);
    const client = await getRedisClient();
    if (client) {
      await client.del(key);
    }
  } catch (error) {
    console.error('[HYBRID CACHE] Error al invalidar:', error);
  }
};

/**
 * Limpia todo el cache local (útil para testing)
 */
const flushLocalCache = () => {
  localCache.flushAll();
  blacklistCache.flushAll();
};

module.exports = {
  initRedisClient,
  getRedisClient,
  isRedisConnected,
  isUsingMock,
  closeRedisConnection,
  saveRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  refreshTokenExists,
  blacklistAccessToken,
  isTokenBlacklisted,
  // Hybrid Cache
  getOrSetCache,
  invalidateCache,
  flushLocalCache,
};