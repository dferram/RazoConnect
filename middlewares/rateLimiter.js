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

const { createClient } = require('redis');
const { rateLimit } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const logger = require('../utils/logger');

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
function isRedisReady() {
  try {
    return redisClient.isReady;
  } catch {
    return false;
  }
}

// Skip function: si Redis no está listo, deja pasar SIN limitear
// Esto es "fail-open" — preferimos no limitar a bloquear toda la app
function skipIfRedisDown(req, res) {
  if (!isRedisReady()) {
    logger.warn('Rate limiter: Redis no disponible, skip aplicado', {
      path: req.path,
      method: req.method
    });
    return true; // true = skip the rate limiter
  }
  return false;
}

// ============================================================================
// CONFIGURACIÓN ESTRICTA DE AZURE REDIS CON TLS
// ============================================================================

// Crear cliente de Redis con credenciales de Azure
const redisClient = createClient({
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT || 6380,
    tls: true, // OBLIGATORIO PARA AZURE
    keepAlive: 30000,         // Ping cada 30 segundos para mantener la conexión viva
    connectTimeout: 10000,    // Timeout de conexión 10 segundos
    commandTimeout: 3000,     // CRÍTICO: máx 3 segundos por comando — evita bloqueos largos
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error('Redis: demasiados reintentos, abandonando reconexión');
        return new Error('Redis reconexión abandonada después de 10 intentos');
      }
      // Backoff exponencial: 500ms, 1s, 2s, 4s, 8s... máx 30s
      return Math.min(500 * Math.pow(2, retries), 30000);
    }
  }
});

// Manejo de errores (NO crashea la app, solo logea)
redisClient.on('error', (err) => {
  logger.error('Rate limiter Redis error', { error: err.message });
});

redisClient.on('connect', () => {
  logger.info('Rate limiter Redis conectado');
});

redisClient.on('ready', () => {
  logger.info('Rate limiter Redis listo');
});

redisClient.on('reconnecting', () => {
  logger.warn('Rate limiter Redis reconectando');
});

redisClient.on('end', () => {
  logger.warn('Rate limiter Redis desconectado');
});

// Conectar al servidor Redis
redisClient.connect().catch((err) => {
  logger.error('Rate limiter Redis conexión fallida', { error: err.message });
});

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
  
  // Usar RedisStore con Azure Redis (sin fallback)
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:global:', // Prefijo para keys de Redis
  }),
  
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
  
  // Usar RedisStore con Azure Redis (sin fallback)
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:auth:', // Prefijo diferente para auth
  }),
  
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

  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:tenant:',
  }),

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

  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:heavy:',
  }),

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
  
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:register:',
  }),
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
  
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:password:',
  }),
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
  
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:api:',
  }),
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
  
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:checkout:',
  }),
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
  
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:admin:',
  }),
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
  redisClient, // Exportar para uso en otros módulos si es necesario
  _skipIfRedisDown: skipIfRedisDown, // Para testing
  _getCleanIp: getCleanIp // Para testing
};
