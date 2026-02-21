/**
 * VALIDADOR DE SECRETOS Y VARIABLES DE ENTORNO
 * 
 * Verifica que todas las variables de entorno críticas estén configuradas
 * y que no haya secretos hardcodeados en el código
 * 
 * OWASP: A02:2021 – Cryptographic Failures
 * OWASP: A05:2021 – Security Misconfiguration
 */

/**
 * Lista de variables de entorno requeridas
 * Categorizadas por criticidad
 */
const REQUIRED_ENV_VARS = {
  // Críticas - La app no puede funcionar sin estas
  critical: [
    'JWT_SECRET',
    'SESSION_SECRET',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD'
  ],
  
  // Importantes - Funcionalidades clave pueden fallar
  important: [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET'
  ],
  
  // Opcionales - Features específicas
  optional: [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'MP_ACCESS_TOKEN',
    'SUPER_ADMIN_KEY',
    'FRONTEND_BASE_URL'
  ]
};

/**
 * Valida que todas las variables de entorno críticas estén configuradas
 * 
 * @returns {Object} { valid: boolean, missing: Array, warnings: Array }
 */
const validateEnvironmentVariables = () => {
  const missing = [];
  const warnings = [];
  const weak = [];
  
  // Verificar variables críticas
  for (const varName of REQUIRED_ENV_VARS.critical) {
    const value = process.env[varName];
    
    if (!value || value.trim() === '') {
      missing.push(varName);
    } else {
      // Verificar fortaleza de secretos críticos
      if (varName.includes('SECRET') || varName.includes('PASSWORD')) {
        if (value.length < 16) {
          weak.push(`${varName} tiene menos de 16 caracteres`);
        }
        
        // Detectar secretos débiles comunes
        const weakSecrets = ['secret', 'password', '123456', 'admin', 'test'];
        if (weakSecrets.some(weak => value.toLowerCase().includes(weak))) {
          weak.push(`${varName} contiene un patrón débil común`);
        }
      }
    }
  }
  
  // Verificar variables importantes
  for (const varName of REQUIRED_ENV_VARS.important) {
    const value = process.env[varName];
    
    if (!value || value.trim() === '') {
      warnings.push(`${varName} no está configurado - algunas funcionalidades pueden no funcionar`);
    }
  }
  
  // Verificar NODE_ENV
  if (!process.env.NODE_ENV) {
    warnings.push('NODE_ENV no está configurado - usando "development" por defecto');
  }
  
  // Verificar que en producción se use HTTPS
  if (process.env.NODE_ENV === 'production') {
    const frontendUrl = process.env.FRONTEND_BASE_URL || '';
    if (frontendUrl && !frontendUrl.startsWith('https://')) {
      warnings.push('FRONTEND_BASE_URL debe usar HTTPS en producción');
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
    warnings,
    weak
  };
};

/**
 * Detecta posibles secretos hardcodeados en strings
 * 
 * @param {string} str - String a analizar
 * @returns {boolean} true si parece contener un secreto
 */
const detectHardcodedSecret = (str) => {
  if (typeof str !== 'string') return false;
  
  // Patrones de secretos comunes
  const secretPatterns = [
    /api[_-]?key[_-]?=[\w-]{20,}/i,
    /secret[_-]?key[_-]?=[\w-]{20,}/i,
    /password[_-]?=[\w-]{8,}/i,
    /token[_-]?=[\w-]{20,}/i,
    /bearer\s+[\w-]{20,}/i,
    /[a-z0-9]{32,}/i, // Posibles hashes MD5/SHA
    /sk_live_[\w-]+/i, // Stripe live keys
    /pk_live_[\w-]+/i, // Stripe public keys
    /AIza[0-9A-Za-z-_]{35}/i, // Google API keys
    /AKIA[0-9A-Z]{16}/i, // AWS Access Key
    /ya29\.[0-9A-Za-z\-_]+/i // Google OAuth tokens
  ];
  
  return secretPatterns.some(pattern => pattern.test(str));
};

/**
 * Valida que los secretos en .env sean suficientemente fuertes
 * 
 * @param {string} varName - Nombre de la variable
 * @param {string} value - Valor de la variable
 * @returns {Object} { valid: boolean, message: string }
 */
const validateSecretStrength = (varName, value) => {
  if (!value) {
    return { valid: false, message: 'Secreto vacío' };
  }
  
  // Longitud mínima
  if (value.length < 16) {
    return { 
      valid: false, 
      message: `${varName} debe tener al menos 16 caracteres (actual: ${value.length})` 
    };
  }
  
  // Verificar complejidad para secretos críticos
  if (varName.includes('SECRET') || varName.includes('PASSWORD')) {
    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumbers = /[0-9]/.test(value);
    const hasSpecial = /[^A-Za-z0-9]/.test(value);
    
    const complexity = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecial].filter(Boolean).length;
    
    if (complexity < 3) {
      return {
        valid: false,
        message: `${varName} debe contener al menos 3 de: mayúsculas, minúsculas, números, caracteres especiales`
      };
    }
  }
  
  // Verificar que no sea un secreto común
  const commonSecrets = [
    'secret',
    'password',
    '123456',
    'admin',
    'test',
    'changeme',
    'default',
    'qwerty'
  ];
  
  if (commonSecrets.some(common => value.toLowerCase().includes(common))) {
    return {
      valid: false,
      message: `${varName} contiene un patrón común inseguro`
    };
  }
  
  return { valid: true, message: 'OK' };
};

/**
 * Ejecuta validación completa al iniciar la aplicación
 * Imprime reporte de seguridad en consola
 */
const runSecurityAudit = () => {
  console.log('\n🔒 ════════════════════════════════════════════════════════════');
  console.log('🔒 AUDITORÍA DE SEGURIDAD - VARIABLES DE ENTORNO');
  console.log('🔒 ════════════════════════════════════════════════════════════\n');
  
  const validation = validateEnvironmentVariables();
  
  // Reportar variables faltantes (CRÍTICO)
  if (validation.missing.length > 0) {
    console.error('❌ VARIABLES CRÍTICAS FALTANTES:');
    validation.missing.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\n⚠️  LA APLICACIÓN NO PUEDE INICIAR SIN ESTAS VARIABLES\n');
    
    // En producción, detener la aplicación
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Variables de entorno críticas faltantes. Revisa la configuración.');
    }
  } else {
    console.log('✅ Todas las variables críticas están configuradas\n');
  }
  
  // Reportar advertencias
  if (validation.warnings.length > 0) {
    console.warn('⚠️  ADVERTENCIAS:');
    validation.warnings.forEach(warning => {
      console.warn(`   - ${warning}`);
    });
    console.warn('');
  }
  
  // Reportar secretos débiles
  if (validation.weak.length > 0) {
    console.warn('⚠️  SECRETOS DÉBILES DETECTADOS:');
    validation.weak.forEach(issue => {
      console.warn(`   - ${issue}`);
    });
    console.warn('   Recomendación: Generar secretos más fuertes\n');
  }
  
  // Validar fortaleza de secretos críticos
  console.log('🔐 VALIDACIÓN DE FORTALEZA DE SECRETOS:');
  const secretVars = ['JWT_SECRET', 'SESSION_SECRET', 'DB_PASSWORD'];
  
  secretVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      const result = validateSecretStrength(varName, value);
      const icon = result.valid ? '✅' : '❌';
      console.log(`   ${icon} ${varName}: ${result.message}`);
    }
  });
  
  console.log('\n🔒 ════════════════════════════════════════════════════════════');
  console.log(`🔒 ENTORNO: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 ESTADO: ${validation.valid && validation.weak.length === 0 ? 'SEGURO ✅' : 'REQUIERE ATENCIÓN ⚠️'}`);
  console.log('🔒 ════════════════════════════════════════════════════════════\n');
  
  return validation;
};

/**
 * Middleware para prevenir exposición de secretos en logs
 * Redacta valores sensibles antes de logear
 */
const redactSecrets = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveKeys = [
    'password',
    'passwordhash',
    'secret',
    'token',
    'apikey',
    'api_key',
    'authorization',
    'cookie',
    'session'
  ];
  
  const redacted = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    
    // Si la key contiene palabras sensibles, redactar
    if (sensitiveKeys.some(sensitive => keyLower.includes(sensitive))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSecrets(value);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
};

/**
 * Genera un secreto aleatorio fuerte
 * Útil para generar JWT_SECRET, SESSION_SECRET, etc.
 * 
 * @param {number} length - Longitud del secreto (default: 32)
 * @returns {string} Secreto aleatorio
 */
const generateStrongSecret = (length = 32) => {
  const crypto = require('crypto');
  return crypto.randomBytes(length).toString('base64').slice(0, length);
};

module.exports = {
  validateEnvironmentVariables,
  validateSecretStrength,
  detectHardcodedSecret,
  runSecurityAudit,
  redactSecrets,
  generateStrongSecret
};
