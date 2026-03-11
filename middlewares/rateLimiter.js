/**
 * MIDDLEWARE DE RATE LIMITING DISTRIBUIDO CON AZURE REDIS
 * 
 * Protege contra ataques de fuerza bruta y DDoS limitando el número de peticiones
 * que un cliente puede hacer en un período de tiempo determinado.
 * 
 * OWASP: Previene ataques automatizados y abuso de recursos
 * 
 * Configuración estricta con Azure Cache for Redis (TLS obligatorio)
 */

const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const logger = require('../utils/logger');
const { getRedisClient, isRedisConnected, isUsingMock } = require('../config/redisClient');

// ============================================================================
// HELPER: Extrae IP limpia (sin puerto) para Azure App Service
// Azure inyecta X-Forwarded-For con formato IP:PUERTO
// ============================================================================
function getCleanIp(req) {
  const raw = req.ip || req.connection?.remoteAddress || 'unknown';
  
  // Manejar formato IPv4-mapped IPv6 (::ffff:1.2.3.4)
  if (raw.startsWith('::ffff:')) {
    return raw.substring(7);
  }
  
  // Manejar formato IP:PUERTO que Azure App Service puede inyectar
  // Ej: "148.220.190.13:10048" → "148.220.190.13"
  const ipv4WithPort = raw.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/);
  if (ipv4WithPort) {
    return ipv4WithPort[1];
  }
  
  return raw;
}

// ============================================================================
// HELPER: Detecta si Redis está disponible para el rate limiter
// Si Redis no está listo, deja pasar la request (fail-open) para evitar 
// que un fallo de Redis bloquee la app completa
// ============================================================================

// Skip function: si Redis no está listo, deja pasar SIN limitear
// Esto es "fail-open" — preferimos no limitar a bloquear toda la app
function skipIfRedisDown(req, res) {
  if (!isRedisConnected()) {
    logger.warn('Rate limiter: Redis no disponible, skip aplicado', {
      path: req.path,
      method: req.method
    });
    return true; // true = skip the rate limiter
  }
  return false;
}

// ============================================================================
// CONFIGURACIÓN DE REDIS STORE
// Usa la instancia centralizada de config/redisClient.js
// ============================================================================

// Función helper para crear RedisStore con lazy loading del cliente
// En modo desarrollo, retorna undefined para que express-rate-limit use MemoryStore
const createRedisStore = (prefix) => {
  // 🔍 Si estamos usando el mock de Redis, NO usar RedisStore
  // Esto permite que express-rate-limit use su MemoryStore por defecto
  if (isUsingMock()) {
    return undefined; // express-rate-limit usará MemoryStore automáticamente
  }
  
  // 🌐 Modo producción: usar RedisStore real
  return new RedisStore({
    sendCommand: async (...args) => {
      const client = await getRedisClient();
      if (!client) {
        throw new Error('Redis client not available');
      }
      return client.sendCommand(args);
    },
    prefix,
  });
};

// ============================================================================
// RATE LIMITERS DISTRIBUIDOS
// ============================================================================

/**
 * Rate Limiter Global para todas las rutas /api
 * 300 peticiones por 15 minutos
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300, // 300 peticiones por ventana
  standardHeaders: true, // Retornar info en headers `RateLimit-*`
  legacyHeaders: false, // Deshabilitar headers `X-RateLimit-*`
  
  // CRÍTICO: skip si Redis no está disponible (fail-open)
  skip: skipIfRedisDown,
  
  // FIX AZURE: keyGenerator personalizado para sanitizar IP:PUERTO
  keyGenerator: (req) => getCleanIp(req),
  
  // Usar RedisStore con instancia centralizada
  store: createRedisStore('rl:global:'),
  
  // Mensaje de error personalizado
  handler: (req, res) => {
    const clientIp = getCleanIp(req);
    logger.warn('Rate limit global alcanzado', { ip: clientIp });
    
    res.status(429).json({
      success: false,
      error: 'Demasiadas peticiones. Por favor, intenta de nuevo en 15 minutos.',
      retryAfter: '15 minutos'
    });
  },
  
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

/**
 * Rate Limiter Estricto para Autenticación
 * 10 peticiones por 15 minutos
 * Previene ataques de fuerza bruta en login
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Solo 10 intentos de login por IP cada 15 minutos
  standardHeaders: true,
  legacyHeaders: false,
  
  // CRÍTICO: skip si Redis no está disponible (fail-open)
  skip: skipIfRedisDown,
  
  // FIX AZURE: keyGenerator personalizado para sanitizar IP:PUERTO
  keyGenerator: (req) => getCleanIp(req),
  
  // Usar RedisStore con instancia centralizada
  store: createRedisStore('rl:auth:'),
  
  handler: (req, res) => {
    const clientIp = getCleanIp(req);
    logger.warn('Rate limit auth alcanzado - posible fuerza bruta', { ip: clientIp });
    
    res.status(429).json({
      error: 'Demasiados intentos de acceso. Por favor, intenta de nuevo en 15 minutos.'
    });
  },
  
  // NO penalizar logins exitosos
  skipSuccessfulRequests: true,
});

/**
 * Rate Limiter por Tenant
 * Limita peticiones por combinación IP + tenant_id
 * Evita que un tenant abusivo afecte a otros en el SaaS
 * 100 peticiones por 15 minutos por tenant
 */
const tenantRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,

  // CRÍTICO: skip si Redis no está disponible (fail-open)
  skip: skipIfRedisDown,

  // FIX AZURE: keyGenerator personalizado que combina IP limpia + tenant
  keyGenerator: (req) => {
    const cleanIp = getCleanIp(req);
    const tenantId = req.tenantId || req.headers['x-tenant-id'] || 'unknown';
    return `${cleanIp}:${tenantId}`;
  },

  store: createRedisStore('rl:tenant:'),

  handler: (req, res) => {
    const tenantId = req.tenantId || 'unknown';
    logger.warn('Rate limit por tenant alcanzado', { tenantId, ip: getCleanIp(req) });
    res.status(429).json({
      success: false,
      message: 'Límite de peticiones alcanzado. Intenta de nuevo en 15 minutos.',
    });
  },
});

/**
 * Rate Limiter para endpoints de alto costo (PDFs, reportes, imágenes)
 * 20 peticiones por hora
 */
const heavyOperationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,

  // CRÍTICO: skip si Redis no está disponible (fail-open)
  skip: skipIfRedisDown,

  // FIX AZURE: keyGenerator personalizado que combina IP limpia + tenant
  keyGenerator: (req) => {
    const cleanIp = getCleanIp(req);
    const tenantId = req.tenantId || req.headers['x-tenant-id'] || 'unknown';
    return `${cleanIp}:${tenantId}`;
  },

  store: createRedisStore('rl:heavy:'),

  handler: (req, res) => {
    const tenantId = req.tenantId || 'unknown';
    logger.warn('Rate limit de operaciones pesadas alcanzado', { tenantId, ip: getCleanIp(req) });
    res.status(429).json({
      success: false,
      message: 'Límite de operaciones alcanzado. Intenta de nuevo en 1 hora.',
    });
  },
});

// ============================================================================
// RATE LIMITERS LEGACY (Mantener compatibilidad con código existente)
// ============================================================================

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  
  // CRÍTICO: skip si Redis no está disponible (fail-open)
  skip: skipIfRedisDown,
  
  // FIX AZURE: keyGenerator personalizado para sanitizar IP:PUERTO
  keyGenerator: (req) => getCleanIp(req),
  
  store: createRedisStore('rl:register:'),
  handler: (req, res) => {
    res.status(429).json({
      error: 'Demasiados intentos de registro. Por favor, espera antes de crear otra cuenta.'
    });
  }
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  
  // CRÍTICO: skip si Redis no está disponible (fail-open)
  skip: skipIfRedisDown,
  
  // FIX AZURE: keyGenerator personalizado para sanitizar IP:PUERTO
  keyGenerator: (req) => getCleanIp(req),
  
  store: createRedisStore('rl:password:'),
  handler: (req, res) => {
    res.status(429).json({
      error: 'Demasiadas solicitudes de recuperación de contraseña. Por favor, espera antes de intentar nuevamente.'
    });
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  
  // CRÍTICO: skip si Redis no está disponible (fail-open)
  skip: skipIfRedisDown,
  
  // FIX AZURE: keyGenerator personalizado para sanitizar IP:PUERTO
  keyGenerator: (req) => getCleanIp(req),
  
  store: createRedisStore('rl:api:'),
  handler: (req, res) => {
    res.status(429).json({
      error: 'Demasiadas peticiones. Por favor, reduce la frecuencia de tus solicitudes.'
    });
  }
});

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  
  // CRÍTICO: skip si Redis no está disponible (fail-open)
  skip: skipIfRedisDown,
  
  // FIX AZURE: keyGenerator personalizado para sanitizar IP:PUERTO
  keyGenerator: (req) => getCleanIp(req),
  
  store: createRedisStore('rl:checkout:'),
  handler: (req, res) => {
    res.status(429).json({
      error: 'Demasiadas operaciones de carrito. Por favor, espera un momento antes de continuar.'
    });
  }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  
  // CRÍTICO: skip si Redis no está disponible (fail-open)
  skip: skipIfRedisDown,
  
  // FIX AZURE: keyGenerator personalizado para sanitizar IP:PUERTO
  keyGenerator: (req) => getCleanIp(req),
  
  store: createRedisStore('rl:admin:'),
  handler: (req, res) => {
    res.status(429).json({
      error: 'Límite de peticiones administrativas excedido. Por favor, espera antes de continuar.'
    });
  }
});

// ============================================================================
// EXPORTAR LIMITERS Y UTILIDADES
// ============================================================================

module.exports = {
  globalLimiter,
  authLimiter,
  tenantRateLimiter,
  heavyOperationLimiter,
  registerLimiter,
  passwordResetLimiter,
  apiLimiter,
  checkoutLimiter,
  adminLimiter,
  _skipIfRedisDown: skipIfRedisDown, // Para testing
  _getCleanIp: getCleanIp // Para testing
};
