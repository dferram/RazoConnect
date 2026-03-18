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

// ============================================
// CACHE STAMPEDE PREVENTION
// ============================================
// Map para almacenar promesas de fetch en curso
// Evita que múltiples requests ejecuten la misma query simultáneamente
const pendingFetches = new Map();

// ============================================
// TTL RECOMENDADOS POR TIPO DE DATO
// ============================================
const CACHE_TTL = {
  // Datos financieros: TTL corto (1-2 minutos)
  SALDO_CLIENTE: 60,
  CXC_SUMMARY: 120,
  CXP_SUMMARY: 120,
  PAGOS_PENDIENTES: 60,
  
  // Catálogos: TTL largo (10-30 minutos)
  PRODUCTOS: 600,
  CATEGORIAS: 1800,
  PROVEEDORES: 1800,
  MEDIDAS: 1800,
  
  // Sesiones y permisos: TTL muy corto (30-60 segundos)
  BLACKLIST: 60,
  PERMISOS_USUARIO: 300,
  REFRESH_TOKEN: 2592000, // 30 días
  
  // Reportes y dashboards: TTL medio (5 minutos)
  DASHBOARD_STATS: 300,
  VENTAS_DIARIAS: 300,
  INVENTARIO_RESUMEN: 300,
  
  // Configuración: TTL muy largo (1 hora)
  CONFIGURACION_SISTEMA: 3600,
  TENANT_CONFIG: 3600,
  
  // Default
  DEFAULT: 300
};

// Hybrid Cache: Memoria RAM local (antes de Redis)
const localCache = new NodeCache({
  stdTTL: CACHE_TTL.DEFAULT,
  checkperiod: 60, // Limpieza cada 60 segundos
  useClones: false // Mejor performance, no clona objetos
});

// Cache específico para blacklist (60 segundos)
const blacklistCache = new NodeCache({
  stdTTL: CACHE_TTL.BLACKLIST,
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
  const cleanupInterval = setInterval(() => {
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
        
        case 'script':
          // rate-limit-redis usa SCRIPT LOAD para cargar scripts Lua
          // En el mock, simplemente retornamos un SHA ficticio
          const subCmd = params[0]?.toLowerCase();
          if (subCmd === 'load') {
            // Retornar un SHA-1 ficticio (40 caracteres hex)
            return 'mock' + Math.random().toString(36).substring(2, 15).padEnd(36, '0');
          }
          return 'OK';
        
        case 'evalsha':
          // rate-limit-redis usa EVALSHA para ejecutar scripts Lua
          // Simulamos el comportamiento del script de rate limiting
          const [sha, numKeys, ...scriptArgs] = params;
          const rlKey = scriptArgs[0];
          const limit = parseInt(scriptArgs[1], 10);
          const window = parseInt(scriptArgs[2], 10);
          
          // Incrementar contador
          const count = parseInt(store.get(rlKey) || '0', 10) + 1;
          store.set(rlKey, String(count));
          
          // Establecer TTL si es el primer request
          if (count === 1) {
            expirations.set(rlKey, Date.now() + window);
          }
          
          // Retornar [current_count, ttl_ms]
          const ttl = expirations.get(rlKey);
          const ttlRemaining = ttl ? Math.max(0, ttl - Date.now()) : window;
          return [count, ttlRemaining];
        
        default:
          console.warn(`⚠️ [REDIS MOCK] Comando no implementado: ${cmd}`);
          return null;
      }
    },
    
    // Métodos de conexión (no-op en mock)
    connect: async () => {},
    quit: async () => {
      // Limpiar el interval para evitar memory leaks
      clearInterval(cleanupInterval);
    },
    disconnect: async () => {
      clearInterval(cleanupInterval);
    },
    
    // Método para limpiar el store (útil para testing)
    _clearAll: () => {
      store.clear();
      expirations.clear();
    },
    
    // Método para limpiar el interval (útil para testing)
    _cleanup: () => {
      clearInterval(cleanupInterval);
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
 * HYBRID CACHE HELPER CON CACHE STAMPEDE PREVENTION
 * Busca en: RAM local → Redis → Base de datos (fetchFunction)
 * 
 * MEJORAS:
 * - Previene Cache Stampede: Si hay un fetch en curso, otras peticiones esperan
 * - Graceful Degradation: Si hay error, ejecuta fetchFunction directamente
 * - Logging mejorado para debugging
 * 
 * @param {string} key - Clave del cache
 * @param {Function} fetchFunction - Función async que obtiene datos de BD
 * @param {number} ttl - Tiempo de vida en segundos (default: 300s = 5min)
 * @returns {Promise<any>}
 */
const getOrSetCache = async (key, fetchFunction, ttl = CACHE_TTL.DEFAULT) => {
  try {
    // 1. Verificar en RAM local (más rápido)
    const cachedValue = localCache.get(key);
    if (cachedValue !== undefined) {
      return cachedValue;
    }

    // 2. Verificar en Redis (remoto)
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

    // 3. ✅ CACHE STAMPEDE PREVENTION
    // Si ya hay un fetch en curso para esta key, esperar su resultado
    if (pendingFetches.has(key)) {
      console.log(`[CACHE] Esperando fetch en curso para: ${key}`);
      return await pendingFetches.get(key);
    }

    // 4. Ejecutar fetchFunction y almacenar promesa
    const fetchPromise = fetchFunction()
      .then(freshData => {
        // Guardar en ambos caches
        localCache.set(key, freshData, ttl);
        if (client) {
          client.setEx(key, ttl, JSON.stringify(freshData)).catch(err => 
            console.error('[CACHE] Error guardando en Redis:', err.message)
          );
        }
        return freshData;
      })
      .catch(error => {
        console.error('[CACHE] Error en fetchFunction:', error.message);
        throw error;
      })
      .finally(() => {
        // Limpiar promesa pendiente
        pendingFetches.delete(key);
      });

    // Almacenar promesa para que otras peticiones la esperen
    pendingFetches.set(key, fetchPromise);
    return await fetchPromise;

  } catch (error) {
    console.error('[HYBRID CACHE] Error:', error.message);
    // Limpiar promesa pendiente en caso de error
    pendingFetches.delete(key);
    // Graceful Degradation: ejecutar fetchFunction directamente
    try {
      return await fetchFunction();
    } catch (fallbackError) {
      console.error('[CACHE FALLBACK] Error crítico:', fallbackError.message);
      throw fallbackError;
    }
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
  pendingFetches.clear();
};

/**
 * Obtiene estadísticas del cache para monitoreo
 */
const getCacheStats = () => {
  return {
    localCache: {
      keys: localCache.keys().length,
      stats: localCache.getStats()
    },
    blacklistCache: {
      keys: blacklistCache.keys().length,
      stats: blacklistCache.getStats()
    },
    pendingFetches: pendingFetches.size
  };
};

/**
 * Resetea el cliente Redis (solo para testing)
 * Permite reinicializar el cliente en un nuevo entorno
 */
const resetRedisClient = async () => {
  if (redisClient && !isDevelopmentMode) {
    try {
      await redisClient.quit();
    } catch (err) {
      // Ignorar errores al cerrar
    }
  }
  redisClient = null;
  isConnected = false;
  isDevelopmentMode = false;
};

module.exports = {
  initRedisClient,
  getRedisClient,
  isRedisConnected,
  isUsingMock,
  closeRedisConnection,
  resetRedisClient,
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
  getCacheStats,
  // Constantes de TTL
  CACHE_TTL,
};