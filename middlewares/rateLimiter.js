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
  console.error('❌ [REDIS] Error en Redis:', err);
});

redisClient.on('connect', () => {
  console.log('✅ [REDIS] Conectado a Azure Redis exitosamente');
});

redisClient.on('ready', () => {
  console.log('✅ [REDIS] Azure Redis listo para usar');
});

redisClient.on('reconnecting', () => {
  console.log('🔄 [REDIS] Reintentando conexión a Azure Redis...');
});

redisClient.on('end', () => {
  console.log('⚠️  [REDIS] Conexión a Azure Redis cerrada');
});

// Conectar al servidor Redis
redisClient.connect().catch((err) => {
  console.error('❌ [REDIS] Error crítico al conectar:', err);
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
    console.warn(`⚠️  [RATE LIMIT GLOBAL] IP bloqueada: ${clientIp}`);
    
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
    console.warn(`🚨 [RATE LIMIT AUTH] Intento de fuerza bruta detectado desde IP: ${clientIp}`);
    
    res.status(429).json({
      error: 'Demasiados intentos de acceso. Por favor, intenta de nuevo en 15 minutos.'
    });
  },
  
  // NO penalizar logins exitosos
  skipSuccessfulRequests: true,
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
  registerLimiter,
  passwordResetLimiter,
  apiLimiter,
  checkoutLimiter,
  adminLimiter,
  redisClient // Exportar para uso en otros módulos si es necesario
};
