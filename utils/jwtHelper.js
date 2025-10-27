const jwt = require('jsonwebtoken');

/**
 * Genera un token JWT
 * @param {Object} payload - Datos a incluir en el token (userId, rol)
 * @returns {String} Token JWT
 */
const generateToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'razoconnect_secret_key',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    }
  );
};

/**
 * Verifica y decodifica un token JWT
 * @param {String} token - Token a verificar
 * @returns {Object} Payload decodificado
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'razoconnect_secret_key');
  } catch (error) {
    throw new Error('Token inválido o expirado');
  }
};

module.exports = {
  generateToken,
  verifyToken
};
