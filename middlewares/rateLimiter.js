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
// CONFIGURACIÓN ESTRICTA DE AZURE REDIS CON TLS
// ============================================================================

// Crear cliente de Redis con credenciales de Azure
const redisClient = createClient({
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT || 6380,
    tls: true // OBLIGATORIO PARA AZURE
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
  
  // Usar RedisStore con Azure Redis (sin fallback)
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:global:', // Prefijo para keys de Redis
  }),
  
  // Mensaje de error personalizado
  handler: (req, res) => {
    const clientIp = req.ip || 'unknown';
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
  
  // Usar RedisStore con Azure Redis (sin fallback)
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:auth:', // Prefijo diferente para auth
  }),
  
  handler: (req, res) => {
    const clientIp = req.ip || 'unknown';
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

  // Usar el keyGenerator por defecto (basado en IP) y agregar tenant_id al prefix
  // Esto evita problemas con IPv6 y usa el helper interno de express-rate-limit
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    // El prefix incluirá el tenant_id dinámicamente
    prefix: (req) => {
      const tenantId = req.tenantId || req.headers['x-tenant-id'] || 'unknown';
      return `rl:tenant:${tenantId}:`;
    },
  }),

  handler: (req, res) => {
    const tenantId = req.tenantId || 'unknown';
    logger.warn('Rate limit por tenant alcanzado', { tenantId, ip: req.ip });
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

  // Usar el keyGenerator por defecto (basado en IP) y agregar tenant_id al prefix
  // Esto evita problemas con IPv6 y usa el helper interno de express-rate-limit
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    // El prefix incluirá el tenant_id dinámicamente
    prefix: (req) => {
      const tenantId = req.tenantId || req.headers['x-tenant-id'] || 'unknown';
      return `rl:heavy:${tenantId}:`;
    },
  }),

  handler: (req, res) => {
    const tenantId = req.tenantId || 'unknown';
    logger.warn('Rate limit de operaciones pesadas alcanzado', { tenantId, ip: req.ip });
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
  redisClient // Exportar para uso en otros módulos si es necesario
};
