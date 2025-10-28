const { verifyToken } = require('../utils/jwtHelper');

/**
 * Middleware para verificar autenticación JWT
 */
const authenticate = (req, res, next) => {
  try {
    // Obtener el token del header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Token no proporcionado'
      });
    }

    // El formato esperado es: "Bearer TOKEN"
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    // Verificar y decodificar el token
    const decoded = verifyToken(token);
    
    // Agregar la información del usuario al request
    req.user = decoded;
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido o expirado',
      error: error.message
    });
  }
};

/**
 * Middleware para verificar rol específico
 * @param {Array} roles - Array de roles permitidos ['cliente', 'agente', 'admin']
 */
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado'
      });
    }

    if (roles.length && !roles.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para acceder a este recurso'
      });
    }

    next();
  };
};

/**
 * Middleware específico para verificar que el usuario es un administrador
 * Verifica que el token tenga el campo 'tipo' = 'admin'
 */
const authorizeAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'No autenticado'
    });
  }

  // Verificar que el tipo de usuario sea 'admin'
  if (req.user.tipo !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Acceso denegado. Solo administradores'
    });
  }

  // Verificar que tenga un rol de admin válido
  if (!['admin', 'superadmin'].includes(req.user.rol)) {
    return res.status(403).json({
      success: false,
      message: 'Rol de administrador inválido'
    });
  }

  next();
};

module.exports = {
  authenticate,
  authorize,
  authorizeAdmin
};
