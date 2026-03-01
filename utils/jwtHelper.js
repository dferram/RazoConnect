const jwt = require("jsonwebtoken");

const resolveJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret || !secret.trim()) {
    throw new Error(
      "JWT_SECRET no está definido. Configura JWT_SECRET en el archivo .env"
    );
  }

  return secret;
};

const resolveJwtRefreshSecret = () => {
  const secret = process.env.JWT_REFRESH_SECRET;

  if (!secret || !secret.trim()) {
    throw new Error(
      "JWT_REFRESH_SECRET no está definido. Configura JWT_REFRESH_SECRET en el archivo .env"
    );
  }

  return secret;
};

/**
 * Normaliza el payload del JWT al formato estándar
 * @param {Object} data - Datos del usuario
 * @returns {Object} Payload normalizado
 */
const normalizePayload = (data) => {
  return {
    id: data.id || data.userId || data.clienteId || data.agenteId || data.adminId,
    rol: data.rol,
    tenant_id: data.tenant_id || null,
    email: data.email || null,
  };
};

/**
 * Genera un Access Token JWT (corta duración: 1h)
 * @param {Object} payload - Datos a incluir en el token {id, rol, tenant_id, email}
 * @returns {String} Access Token JWT
 */
const generateAccessToken = (payload) => {
  const normalizedPayload = normalizePayload(payload);
  
  return jwt.sign(normalizedPayload, resolveJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });
};

/**
 * Genera un Refresh Token JWT (larga duración: 30d)
 * @param {Object} payload - Datos a incluir en el token {id, rol, tenant_id, email}
 * @returns {String} Refresh Token JWT
 */
const generateRefreshToken = (payload) => {
  const normalizedPayload = normalizePayload(payload);
  
  return jwt.sign(normalizedPayload, resolveJwtRefreshSecret(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  });
};

/**
 * Genera un token JWT (LEGACY - mantener para compatibilidad)
 * @deprecated Usar generateAccessToken o generateRefreshToken
 * @param {Object} payload - Datos a incluir en el token
 * @param {String} expiresIn - Duración del token
 * @returns {String} Token JWT
 */
const generateToken = (payload, expiresIn = null) => {
  return jwt.sign(payload, resolveJwtSecret(), {
    expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || "1h",
  });
};

/**
 * Verifica y decodifica un Access Token JWT
 * @param {String} token - Token a verificar
 * @returns {Object} Payload decodificado
 */
const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, resolveJwtSecret());
  } catch (error) {
    throw new Error("Access token inválido o expirado");
  }
};

/**
 * Verifica y decodifica un Refresh Token JWT
 * @param {String} token - Token a verificar
 * @returns {Object} Payload decodificado
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, resolveJwtRefreshSecret());
  } catch (error) {
    throw new Error("Refresh token inválido o expirado");
  }
};

/**
 * Verifica y decodifica un token JWT (LEGACY - mantener para compatibilidad)
 * @deprecated Usar verifyAccessToken o verifyRefreshToken
 * @param {String} token - Token a verificar
 * @returns {Object} Payload decodificado
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, resolveJwtSecret());
  } catch (error) {
    throw new Error("Token inválido o expirado");
  }
};

module.exports = {
  // Nuevas funciones (Access + Refresh)
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  normalizePayload,
  
  // Legacy (mantener para compatibilidad)
  generateToken,
  verifyToken,
};
