/**
 * TOKEN REFRESH MIDDLEWARE
 * Renueva automáticamente el Access Token cuando está próximo a expirar
 * Evita que los usuarios sean expulsados durante sesiones activas
 */

const { verifyAccessToken, generateAccessToken } = require('../utils/jwtHelper');
const logger = require('../utils/logger');

/**
 * Middleware que verifica si el token está próximo a expirar y lo renueva
 * Se ejecuta ANTES del middleware authenticate
 */
const autoRefreshToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.slice(7);
    
    try {
      const decoded = verifyAccessToken(token);
      
      // Verificar si el token expira en menos de 1 hora
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = decoded.exp - now;
      const oneHour = 60 * 60;
      
      // Si el token expira en menos de 1 hora, renovarlo
      if (timeUntilExpiry < oneHour && timeUntilExpiry > 0) {
        const newToken = generateAccessToken({
          id: decoded.id,
          rol: decoded.rol,
          email: decoded.email,
          tenant_id: decoded.tenant_id,
          estadoId: decoded.estadoId || null
        });
        
        // Agregar el nuevo token en el header de respuesta
        res.setHeader('X-New-Token', newToken);
        
        logger.info('Token renovado automáticamente', {
          userId: decoded.id,
          rol: decoded.rol,
          timeUntilExpiry: `${Math.floor(timeUntilExpiry / 60)} minutos`,
          requestId: req.requestId
        });
      }
    } catch (error) {
      // Si el token es inválido, dejar que authenticate lo maneje
      return next();
    }
    
    next();
  } catch (error) {
    logger.error('Error en autoRefreshToken middleware', {
      error: error.message,
      requestId: req.requestId
    });
    next();
  }
};

module.exports = autoRefreshToken;
