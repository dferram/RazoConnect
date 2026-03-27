/**
 * MIDDLEWARE DE CABECERAS DE SEGURIDAD HTTP
 * 
 * Implementa las mejores prácticas de OWASP para cabeceras de seguridad
 * Sin usar helmet para mantener control total y evitar dependencias innecesarias
 * 
 * OWASP Security Headers:
 * - Content Security Policy (CSP)
 * - X-Content-Type-Options
 * - X-Frame-Options
 * - X-XSS-Protection
 * - Strict-Transport-Security (HSTS)
 * - Referrer-Policy
 * - Permissions-Policy
 */

/**
 * Middleware principal de cabeceras de seguridad
 * Configura todas las cabeceras de seguridad recomendadas por OWASP
 */
const securityHeaders = (req, res, next) => {
  // ============================================================================
  // CONTENT SECURITY POLICY (CSP)
  // ============================================================================
  // Previene XSS, clickjacking y otros ataques de inyección de código
  // Política moderada que permite recursos necesarios para la app
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://www.googletagmanager.com https://www.google-analytics.com https://accounts.google.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
    "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://www.gstatic.com https://res.cloudinary.com https://*.cloudinary.com",
    "connect-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://accounts.google.com https://www.googleapis.com https://oauth2.googleapis.com https://api.mercadopago.com https://api.cloudinary.com https://razoconnect-api.azurewebsites.net https://razowebsite-bvdgfad5g6heb0fs.mexicocentral-01.azurewebsites.net",
    "frame-src 'self' https://accounts.google.com https://www.mercadopago.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', cspDirectives);
  
  // ============================================================================
  // X-CONTENT-TYPE-OPTIONS
  // ============================================================================
  // Previene MIME type sniffing
  // El navegador debe respetar el Content-Type declarado
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // ============================================================================
  // X-FRAME-OPTIONS
  // ============================================================================
  // Previene clickjacking
  // SAMEORIGIN permite iframes del mismo origen (útil para modales internos)
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  
  // ============================================================================
  // X-XSS-PROTECTION
  // ============================================================================
  // Habilita el filtro XSS del navegador (legacy, pero útil para navegadores antiguos)
  // mode=block detiene la página completamente si detecta XSS
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // ============================================================================
  // STRICT-TRANSPORT-SECURITY (HSTS)
  // ============================================================================
  // Fuerza HTTPS por 1 año (31536000 segundos)
  // includeSubDomains aplica a todos los subdominios
  // preload permite inclusión en listas de precarga de navegadores
  // SOLO aplicar en producción con HTTPS configurado
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
  
  // ============================================================================
  // REFERRER-POLICY
  // ============================================================================
  // Controla cuánta información del referrer se envía
  // strict-origin-when-cross-origin: envía origen completo en mismo origen,
  // solo dominio en cross-origin HTTPS, nada en downgrade HTTP
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // ============================================================================
  // PERMISSIONS-POLICY (antes Feature-Policy)
  // ============================================================================
  // Controla qué APIs del navegador puede usar la página
  // Deshabilita características no necesarias para reducir superficie de ataque
  const permissionsPolicy = [
    'geolocation=()',
    'microphone=()',
    'camera=()',
    'payment=(self)',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()'
  ].join(', ');
  
  res.setHeader('Permissions-Policy', permissionsPolicy);
  
  // ============================================================================
  // X-POWERED-BY
  // ============================================================================
  // Remover header que revela tecnología del servidor
  // Reduce información útil para atacantes
  res.removeHeader('X-Powered-By');
  
  // ============================================================================
  // X-DNS-PREFETCH-CONTROL
  // ============================================================================
  // Controla DNS prefetching para prevenir leaks de información
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  
  // ============================================================================
  // X-DOWNLOAD-OPTIONS
  // ============================================================================
  // Previene que IE ejecute descargas en el contexto del sitio
  res.setHeader('X-Download-Options', 'noopen');
  
  // ============================================================================
  // X-PERMITTED-CROSS-DOMAIN-POLICIES
  // ============================================================================
  // Restringe políticas cross-domain de Adobe Flash y PDF
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  
  next();
};

/**
 * Middleware de CORS seguro
 * Configura CORS de forma restrictiva basado en whitelist
 */
const secureCORS = (req, res, next) => {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:8080',
    'https://razo.com.mx',
    'https://www.razo.com.mx',
    'https://razowebsite-bvdgfad5g6heb0fs.mexicocentral-01.azurewebsites.net'
  ];
  
  const origin = req.headers.origin;
  
  // Verificar si el origen está en la whitelist
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Permitir peticiones sin origen (same-origin, Postman, etc.)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  // Métodos HTTP permitidos
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  
  // Headers permitidos
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  
  // Permitir credenciales (cookies, auth headers)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Cachear preflight requests por 24 horas
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
};

/**
 * Middleware para prevenir información sensible en respuestas de error
 * Sanitiza errores en producción para no exponer stack traces
 */
const sanitizeErrors = (err, req, res, next) => {
  // Log completo del error para debugging interno
  console.error('❌ [ERROR]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // En producción, NO exponer detalles del error
  if (process.env.NODE_ENV === 'production') {
    return res.status(err.status || 500).json({
      success: false,
      message: 'Ha ocurrido un error en el servidor',
      error: 'Internal Server Error'
    });
  }
  
  // En desarrollo, mostrar detalles para debugging
  return res.status(err.status || 500).json({
    success: false,
    message: err.message,
    error: err.name,
    stack: err.stack?.split('\n').slice(0, 5) // Solo primeras 5 líneas del stack
  });
};

/**
 * Middleware para prevenir HTTP Parameter Pollution (HPP)
 * Convierte arrays de parámetros duplicados en el último valor
 */
const preventParameterPollution = (req, res, next) => {
  // Limpiar query params duplicados
  if (req.query && typeof req.query === 'object') {
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        // Tomar solo el último valor si hay duplicados
        req.query[key] = value[value.length - 1];
        console.warn(`⚠️  [SECURITY] Parameter pollution detectado en query.${key}`);
      }
    }
  }
  
  next();
};

/**
 * Middleware para limitar tamaño de payload
 * Previene ataques DoS mediante payloads masivos
 */
const limitPayloadSize = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      const maxSizeInMB = parseInt(maxSize);
      
      if (sizeInMB > maxSizeInMB) {
        console.warn(`⚠️  [SECURITY] Payload demasiado grande rechazado: ${sizeInMB.toFixed(2)}MB`);
        return res.status(413).json({
          success: false,
          message: `El tamaño del payload excede el límite de ${maxSize}`,
          received: `${sizeInMB.toFixed(2)}MB`
        });
      }
    }
    
    next();
  };
};

module.exports = {
  securityHeaders,
  secureCORS,
  sanitizeErrors,
  preventParameterPollution,
  limitPayloadSize
};
