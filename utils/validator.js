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
 * Limpia un número de teléfono (quita espacios, guiones, paréntesis)
 * @param {String} phone
 * @returns {String}
 */
const cleanPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/[\s\-\(\)]/g, '');
};

/**
 * Valida formato de teléfono (10 dígitos)
 * @param {String} phone
 * @returns {Boolean}
 */
const isValidPhone = (phone) => {
  const cleaned = cleanPhone(phone);
  const phoneRegex = /^\d{10}$/;
  return phoneRegex.test(cleaned);
};

/**
 * Valida que sea email O teléfono válido
 * @param {String} identifier
 * @returns {Boolean}
 */
const isValidEmailOrPhone = (identifier) => {
  return isValidEmail(identifier) || isValidPhone(identifier);
};

/**
 * Valida los datos de registro de cliente
 * @param {Object} data
 * @returns {Object} { valid: Boolean, errors: Array }
 */
const validateClienteRegistro = (data) => {
  const errors = [];

  if (!isNotEmpty(data.Nombre)) {
    errors.push("El nombre es requerido");
  }

  if (!isNotEmpty(data.Apellido)) {
    errors.push("El apellido es requerido");
  }

  if (!isValidEmail(data.Email)) {
    errors.push("El email no es válido");
  }

  if (!isValidPassword(data.Password)) {
    errors.push("La contraseña debe tener al menos 6 caracteres");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Valida los datos de registro de agente
 * @param {Object} data - { nombre, apellido, email, telefono, password }
 * @returns {Object} { valid: Boolean, errors: Array }
 */
const validateAgenteRegistro = (data) => {
  const errors = [];

  if (!isNotEmpty(data.nombre)) {
    errors.push("El nombre es requerido");
  }

  if (!isNotEmpty(data.apellido)) {
    errors.push("El apellido es requerido");
  }

  // Al menos uno de los dos (email o telefono) debe estar presente
  const hasEmail = data.email && data.email.trim() !== '';
  const hasTelefono = data.telefono && data.telefono.trim() !== '';

  if (!hasEmail && !hasTelefono) {
    errors.push("Debes proporcionar al menos un medio de contacto (correo o teléfono)");
  }

  // Validar email si se proporcionó
  if (hasEmail && !isValidEmail(data.email)) {
    errors.push("El formato del email no es válido");
  }

  // Validar teléfono si se proporcionó
  if (hasTelefono && !isValidPhone(data.telefono)) {
    errors.push("El teléfono debe contener exactamente 10 dígitos numéricos");
  }

  if (!isValidPassword(data.password)) {
    errors.push("La contraseña debe tener al menos 6 caracteres");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Valida los datos de login
 * @param {Object} data
 * @returns {Object} { valid: Boolean, errors: Array }
 */
const validateLogin = (data) => {
  const errors = [];

  if (!isNotEmpty(data.Email)) {
    errors.push("El correo o teléfono es requerido");
  } else if (!isValidEmailOrPhone(data.Email)) {
    errors.push("El formato es inválido. Ingresa un correo válido o 10 dígitos");
  }

  if (!isNotEmpty(data.Password)) {
    errors.push("La contraseña es requerida");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

module.exports = {
  isValidEmail,
  isValidPassword,
  isNotEmpty,
  isValidPhone,
  isValidEmailOrPhone,
  cleanPhone,
  validateClienteRegistro,
  validateAgenteRegistro,
  validateLogin,
};
