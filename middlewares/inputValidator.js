/**
 * MIDDLEWARE DE VALIDACIÓN Y SANITIZACIÓN DE INPUTS
 * 
 * Protege contra inyección SQL, XSS y otros ataques basados en inputs maliciosos
 * 
 * OWASP Top 10:
 * - A03:2021 – Injection (SQL Injection, NoSQL Injection, Command Injection)
 * - A07:2021 – Identification and Authentication Failures
 * 
 * Estrategia de defensa en profundidad:
 * 1. Validación de tipo de datos
 * 2. Sanitización de strings
 * 3. Validación de rangos y formatos
 * 4. Rechazo de campos inesperados
 */

/**
 * Sanitiza un string removiendo caracteres peligrosos
 * Previene XSS y SQL Injection básicos
 * 
 * @param {string} str - String a sanitizar
 * @returns {string} String sanitizado
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  
  // Remover caracteres de control y null bytes
  let sanitized = str.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Escapar caracteres HTML para prevenir XSS
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  
  // Trim whitespace
  return sanitized.trim();
};

/**
 * Sanitiza recursivamente un objeto
 * 
 * @param {Object} obj - Objeto a sanitizar
 * @returns {Object} Objeto sanitizado
 */
const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitizar la key también (previene prototype pollution)
      const sanitizedKey = sanitizeString(key);
      
      // No permitir keys peligrosas
      if (sanitizedKey === '__proto__' || sanitizedKey === 'constructor' || sanitizedKey === 'prototype') {
        console.warn(`⚠️  [SECURITY] Intento de prototype pollution detectado: ${key}`);
        continue;
      }
      
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  return obj;
};

/**
 * Valida que un email tenga formato correcto
 * 
 * @param {string} email - Email a validar
 * @returns {boolean} true si es válido
 */
const isValidEmail = (email) => {
  if (typeof email !== 'string') return false;
  
  // Regex RFC 5322 simplificado
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  // Validaciones adicionales
  if (email.length > 254) return false; // RFC 5321
  if (email.includes('..')) return false; // Dots consecutivos no permitidos
  
  return emailRegex.test(email);
};

/**
 * Valida que un teléfono tenga formato correcto (México)
 * 
 * @param {string} phone - Teléfono a validar
 * @returns {boolean} true si es válido
 */
const isValidPhone = (phone) => {
  if (typeof phone !== 'string') return false;
  
  // Remover espacios, guiones y paréntesis
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  
  // Validar que solo contenga dígitos y tenga longitud correcta
  return /^\d{10,15}$/.test(cleaned);
};

/**
 * Valida que un número esté en un rango específico
 * 
 * @param {number} num - Número a validar
 * @param {number} min - Valor mínimo
 * @param {number} max - Valor máximo
 * @returns {boolean} true si está en rango
 */
const isInRange = (num, min, max) => {
  const parsed = parseFloat(num);
  return !isNaN(parsed) && parsed >= min && parsed <= max;
};

/**
 * Middleware: Sanitiza todos los inputs de la petición
 * Aplica sanitización a req.body, req.query y req.params
 * 
 * IMPORTANTE: Este middleware NO modifica los valores originales,
 * solo sanitiza para prevenir XSS. La validación de negocio
 * debe hacerse en los controladores.
 */
const sanitizeInputs = (req, res, next) => {
  try {
    // Sanitizar body (POST, PUT, PATCH)
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }
    
    // Sanitizar query params (GET)
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }
    
    // Sanitizar route params
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }
    
    next();
  } catch (error) {
    console.error('❌ [SECURITY] Error en sanitización de inputs:', error);
    return res.status(400).json({
      success: false,
      message: 'Error al procesar los datos de entrada'
    });
  }
};

/**
 * Middleware: Valida que el body solo contenga campos esperados
 * Previene mass assignment y ataques de parameter pollution
 * 
 * @param {Array<string>} allowedFields - Lista de campos permitidos
 * @param {boolean} strict - Si es true, rechaza campos extra. Si es false, solo los ignora
 * @returns {Function} Middleware de Express
 */
const validateAllowedFields = (allowedFields, strict = true) => {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return next();
    }
    
    const receivedFields = Object.keys(req.body);
    const unexpectedFields = receivedFields.filter(field => !allowedFields.includes(field));
    
    if (unexpectedFields.length > 0) {
      if (strict) {
        console.warn(`⚠️  [SECURITY] Campos no permitidos detectados: ${unexpectedFields.join(', ')} en ${req.path}`);
        return res.status(400).json({
          success: false,
          message: 'Campos no permitidos en la petición',
          unexpectedFields
        });
      } else {
        // Modo no estricto: solo remover campos no permitidos
        unexpectedFields.forEach(field => delete req.body[field]);
      }
    }
    
    next();
  };
};

/**
 * Middleware: Valida tipos de datos de campos específicos
 * 
 * @param {Object} schema - Esquema de validación { campo: 'tipo' }
 * Tipos soportados: 'string', 'number', 'boolean', 'email', 'phone', 'array', 'object'
 * @returns {Function} Middleware de Express
 */
const validateTypes = (schema) => {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return next();
    }
    
    const errors = [];
    
    for (const [field, expectedType] of Object.entries(schema)) {
      const value = req.body[field];
      
      // Si el campo no existe, skip (usar validateRequired para campos obligatorios)
      if (value === undefined || value === null) continue;
      
      let isValid = true;
      
      switch (expectedType) {
        case 'string':
          isValid = typeof value === 'string';
          break;
        case 'number':
          isValid = typeof value === 'number' || !isNaN(parseFloat(value));
          break;
        case 'boolean':
          isValid = typeof value === 'boolean' || value === 'true' || value === 'false';
          break;
        case 'email':
          isValid = isValidEmail(value);
          break;
        case 'phone':
          isValid = isValidPhone(value);
          break;
        case 'array':
          isValid = Array.isArray(value);
          break;
        case 'object':
          isValid = typeof value === 'object' && !Array.isArray(value);
          break;
        default:
          console.warn(`⚠️  [VALIDATION] Tipo desconocido en schema: ${expectedType}`);
      }
      
      if (!isValid) {
        errors.push(`El campo '${field}' debe ser de tipo ${expectedType}`);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Error de validación de tipos',
        errors
      });
    }
    
    next();
  };
};

/**
 * Middleware: Valida que campos requeridos estén presentes
 * 
 * @param {Array<string>} requiredFields - Lista de campos obligatorios
 * @returns {Function} Middleware de Express
 */
const validateRequired = (requiredFields) => {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Body de la petición es requerido'
      });
    }
    
    const missingFields = requiredFields.filter(field => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Campos requeridos faltantes',
        missingFields
      });
    }
    
    next();
  };
};

/**
 * Middleware: Valida longitud de strings
 * 
 * @param {Object} rules - Reglas de longitud { campo: { min: number, max: number } }
 * @returns {Function} Middleware de Express
 */
const validateLength = (rules) => {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return next();
    }
    
    const errors = [];
    
    for (const [field, { min, max }] of Object.entries(rules)) {
      const value = req.body[field];
      
      if (value === undefined || value === null) continue;
      
      if (typeof value !== 'string') {
        errors.push(`El campo '${field}' debe ser un string`);
        continue;
      }
      
      const length = value.length;
      
      if (min !== undefined && length < min) {
        errors.push(`El campo '${field}' debe tener al menos ${min} caracteres`);
      }
      
      if (max !== undefined && length > max) {
        errors.push(`El campo '${field}' no puede exceder ${max} caracteres`);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Error de validación de longitud',
        errors
      });
    }
    
    next();
  };
};

/**
 * Previene SQL Injection validando que no haya patrones sospechosos
 * NOTA: Esto es una capa adicional. La protección principal es usar queries parametrizadas.
 * 
 * @param {string} input - Input a validar
 * @returns {boolean} true si parece seguro
 */
const detectSQLInjection = (input) => {
  if (typeof input !== 'string') return false;
  
  // Patrones comunes de SQL Injection
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
    /(UNION\s+SELECT)/i,
    /(\bOR\b\s+\d+\s*=\s*\d+)/i,
    /(\bAND\b\s+\d+\s*=\s*\d+)/i,
    /(--|;|\/\*|\*\/)/,
    /(\bxp_cmdshell\b)/i
  ];
  
  return sqlPatterns.some(pattern => pattern.test(input));
};

/**
 * Middleware: Detecta intentos de SQL Injection
 * IMPORTANTE: Esto NO reemplaza el uso de queries parametrizadas
 */
const preventSQLInjection = (req, res, next) => {
  const checkObject = (obj, path = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'string' && detectSQLInjection(value)) {
        console.error(`❌ [SECURITY] Posible SQL Injection detectado en ${currentPath}: ${value.substring(0, 50)}...`);
        return currentPath;
      }
      
      if (typeof value === 'object' && value !== null) {
        const result = checkObject(value, currentPath);
        if (result) return result;
      }
    }
    return null;
  };
  
  // Verificar body
  if (req.body && typeof req.body === 'object') {
    const suspiciousField = checkObject(req.body);
    if (suspiciousField) {
      return res.status(400).json({
        success: false,
        message: 'Input no válido detectado',
        field: suspiciousField
      });
    }
  }
  
  // Verificar query params
  if (req.query && typeof req.query === 'object') {
    const suspiciousField = checkObject(req.query);
    if (suspiciousField) {
      return res.status(400).json({
        success: false,
        message: 'Parámetros no válidos detectados',
        field: suspiciousField
      });
    }
  }
  
  next();
};

module.exports = {
  sanitizeInputs,
  sanitizeString,
  sanitizeObject,
  validateAllowedFields,
  validateTypes,
  validateRequired,
  validateLength,
  preventSQLInjection,
  isValidEmail,
  isValidPhone,
  isInRange
};
