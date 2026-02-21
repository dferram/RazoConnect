/**
 * MIDDLEWARE DE RATE LIMITING
 * 
 * Protege contra ataques de fuerza bruta y DDoS limitando el número de peticiones
 * que un cliente puede hacer en un período de tiempo determinado.
 * 
 * OWASP: Previene ataques automatizados y abuso de recursos
 * 
 * Implementación sin dependencias externas usando memoria en proceso
 * Para producción con múltiples instancias, considerar Redis
 */

// Store para tracking de peticiones por IP
const requestStore = new Map();

/**
 * Limpia entradas expiradas del store cada 5 minutos
 * Previene memory leaks en aplicaciones de larga duración
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestStore.entries()) {
    if (now > data.resetTime) {
      requestStore.delete(key);
    }
  }
}, 5 * 60 * 1000); // Limpieza cada 5 minutos

/**
 * Crea un rate limiter configurable
 * 
 * @param {Object} options - Opciones de configuración
 * @param {number} options.windowMs - Ventana de tiempo en milisegundos (default: 15 minutos)
 * @param {number} options.max - Máximo de peticiones permitidas en la ventana (default: 100)
 * @param {string} options.message - Mensaje personalizado de error
 * @param {number} options.statusCode - Código HTTP de respuesta (default: 429)
 * @param {boolean} options.skipSuccessfulRequests - No contar peticiones exitosas (default: false)
 * @param {Function} options.keyGenerator - Función para generar la key de identificación
 * 
 * @returns {Function} Middleware de Express
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutos por defecto
    max = 100, // 100 peticiones por defecto
    message = 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo más tarde.',
    statusCode = 429,
    skipSuccessfulRequests = false,
    keyGenerator = (req) => {
      // Usar IP real considerando proxies (Azure, Cloudflare, etc.)
      return req.ip || 
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             req.headers['x-real-ip'] || 
             req.connection.remoteAddress || 
             'unknown';
    }
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    
    // Obtener o crear registro para esta key
    let record = requestStore.get(key);
    
    if (!record || now > record.resetTime) {
      // Crear nuevo registro o resetear si expiró
      record = {
        count: 0,
        resetTime: now + windowMs,
        firstRequest: now
      };
      requestStore.set(key, record);
    }
    
    // Incrementar contador
    record.count++;
    
    // Headers informativos para el cliente (OWASP recomendado)
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
    
    // Verificar si excedió el límite
    if (record.count > max) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      
      // Log de seguridad para monitoreo
      console.warn(`⚠️  [RATE LIMIT] IP bloqueada temporalmente: ${key} - ${record.count} peticiones en ${Math.ceil((now - record.firstRequest) / 1000)}s`);
      
      return res.status(statusCode).json({
        success: false,
        message,
        retryAfter: `${retryAfter} segundos`,
        limit: max,
        windowMs: windowMs / 1000 / 60 + ' minutos'
      });
    }
    
    // Si skipSuccessfulRequests está activo, decrementar en respuestas exitosas
    if (skipSuccessfulRequests) {
      const originalSend = res.send;
      res.send = function(data) {
        if (res.statusCode < 400) {
          record.count = Math.max(0, record.count - 1);
        }
        return originalSend.call(this, data);
      };
    }
    
    next();
  };
};

/**
 * RATE LIMITERS PRECONFIGURADOS
 * Configuraciones específicas según tipo de endpoint
 */

// Rate limiter estricto para autenticación (previene fuerza bruta)
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Solo 5 intentos de login por IP cada 15 minutos
  message: 'Demasiados intentos de inicio de sesión. Por favor, espera 15 minutos antes de intentar nuevamente.',
  skipSuccessfulRequests: true // No penalizar logins exitosos
});

// Rate limiter para registro de usuarios
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // Solo 3 registros por IP cada hora
  message: 'Demasiados intentos de registro. Por favor, espera antes de crear otra cuenta.'
});

// Rate limiter para recuperación de contraseña
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // Solo 3 intentos por hora
  message: 'Demasiadas solicitudes de recuperación de contraseña. Por favor, espera antes de intentar nuevamente.'
});

// Rate limiter general para APIs públicas
const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 peticiones por IP cada 15 minutos
  message: 'Demasiadas peticiones. Por favor, reduce la frecuencia de tus solicitudes.'
});

// Rate limiter moderado para operaciones de carrito/checkout
const checkoutLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 30, // 30 operaciones cada 10 minutos
  message: 'Demasiadas operaciones de carrito. Por favor, espera un momento antes de continuar.'
});

// Rate limiter para endpoints administrativos
const adminLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // Límite más alto para admins legítimos
  message: 'Límite de peticiones administrativas excedido. Por favor, espera antes de continuar.'
});

module.exports = {
  createRateLimiter,
  authLimiter,
  registerLimiter,
  passwordResetLimiter,
  apiLimiter,
  checkoutLimiter,
  adminLimiter
};
