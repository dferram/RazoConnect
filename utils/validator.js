/**
 * Valida formato de email
 * @param {String} email
 * @returns {Boolean}
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Valida que la contraseña tenga al menos 6 caracteres
 * @param {String} password
 * @returns {Boolean}
 */
const isValidPassword = (password) => {
  return password && password.length >= 6;
};

/**
 * Valida que un campo no esté vacío
 * @param {String} value
 * @returns {Boolean}
 */
const isNotEmpty = (value) => {
  return value && value.trim().length > 0;
};

/**
 * Valida los datos de registro de cliente
 * @param {Object} data
 * @returns {Object} { valid: Boolean, errors: Array }
 */
const validateClienteRegistro = (data) => {
  const errors = [];
  
  if (!isNotEmpty(data.Nombre)) {
    errors.push('El nombre es requerido');
  }
  
  if (!isNotEmpty(data.Apellido)) {
    errors.push('El apellido es requerido');
  }
  
  if (!isValidEmail(data.Email)) {
    errors.push('El email no es válido');
  }
  
  if (!isValidPassword(data.Password)) {
    errors.push('La contraseña debe tener al menos 6 caracteres');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Valida los datos de registro de agente
 * @param {Object} data
 * @returns {Object} { valid: Boolean, errors: Array }
 */
const validateAgenteRegistro = (data) => {
  const errors = [];
  
  if (!isNotEmpty(data.Nombre)) {
    errors.push('El nombre es requerido');
  }
  
  if (!isNotEmpty(data.Apellido)) {
    errors.push('El apellido es requerido');
  }
  
  if (!isValidEmail(data.Email)) {
    errors.push('El email no es válido');
  }
  
  if (!isValidPassword(data.Password)) {
    errors.push('La contraseña debe tener al menos 6 caracteres');
  }
  
  if (!isNotEmpty(data.CodigoAgente)) {
    errors.push('El código de agente es requerido');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Valida los datos de login
 * @param {Object} data
 * @returns {Object} { valid: Boolean, errors: Array }
 */
const validateLogin = (data) => {
  const errors = [];
  
  if (!isValidEmail(data.Email)) {
    errors.push('El email no es válido');
  }
  
  if (!isNotEmpty(data.Password)) {
    errors.push('La contraseña es requerida');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  isValidEmail,
  isValidPassword,
  isNotEmpty,
  validateClienteRegistro,
  validateAgenteRegistro,
  validateLogin
};
