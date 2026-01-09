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

/**
 * Genera un token JWT
 * @param {Object} payload - Datos a incluir en el token (userId, rol)
 * @param {String} expiresIn - Duración del token (opcional, por defecto 30d)
 * @returns {String} Token JWT
 */
const generateToken = (payload, expiresIn = null) => {
  return jwt.sign(payload, resolveJwtSecret(), {
    expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || "30d",
  });
};

/**
 * Verifica y decodifica un token JWT
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
  generateToken,
  verifyToken,
};
