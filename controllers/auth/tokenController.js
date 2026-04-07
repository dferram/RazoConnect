/**
 * TOKEN CONTROLLER
 * 
 * Gestión de Access y Refresh Tokens
 * Endpoints para renovar tokens y cerrar sesión
 * 
 * @module controllers/auth/tokenController
 * @author RazoConnect Team
 * @date 2026-02-28
 */

const { 
  verifyRefreshToken, 
  generateAccessToken,
  generateRefreshToken,
  normalizePayload,
  verifyAccessToken
} = require('../../utils/jwtHelper');
const { 
  getRefreshToken, 
  deleteRefreshToken,
  saveRefreshToken,
  blacklistAccessToken
} = require('../../config/redisClient');
const db = require('../../db');
const logger = require('../../utils/logger');

/**
 * Renovar Access Token usando Refresh Token
 * POST /api/auth/refresh
 * @body { refreshToken }
 */
const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token es requerido',
      });
    }

    // 1. Verificar firma del refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token inválido o expirado',
      });
    }

    const { id, rol, tenant_id, email } = decoded;

    if (!id || !rol) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token inválido (datos incompletos)',
      });
    }

    // 2. Verificar que el refresh token exista en Redis
    const storedToken = await getRefreshToken(id, rol);

    if (!storedToken || storedToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token no válido o sesión expirada',
      });
    }

    // 3. Verificar que el usuario aún existe y está activo
    let userExists = false;

    if (rol === 'cliente') {
      const result = await db.query(
        'SELECT clienteid FROM clientes WHERE clienteid = $1 AND tenant_id = $2 AND activo = TRUE',
        [id, tenant_id]
      );
      userExists = result.rows.length > 0;
    } else if (rol === 'agente') {
      const result = await db.query(
        'SELECT agenteid FROM agentesdeventas WHERE agenteid = $1 AND tenant_id = $2 AND activo = TRUE',
        [id, tenant_id]
      );
      userExists = result.rows.length > 0;
    } else if (rol === 'admin' || rol === 'super_admin') {
      const result = await db.query(
        'SELECT adminid FROM administradores WHERE adminid = $1 AND tenant_id = $2 AND activo = TRUE',
        [id, tenant_id]
      );
      userExists = result.rows.length > 0;
    }

    if (!userExists) {
      // Usuario eliminado o desactivado - invalidar sesión
      await deleteRefreshToken(id, rol);
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado o inactivo',
      });
    }

    // 4. Generar nuevo Access Token
    const newAccessToken = generateAccessToken({
      id,
      rol,
      tenant_id,
      email,
    });

    return res.json({
      success: true,
      message: 'Access token renovado exitosamente',
      data: {
        accessToken: newAccessToken,
      },
    });
  } catch (error) {
    logger.error('Error al renovar token', {
      error: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      requestId: req.requestId
    });
    return res.status(500).json({
      success: false,
      message: 'Error al renovar token'
    });
  }
};

/**
 * Cerrar sesión (invalidar Refresh Token)
 * POST /api/auth/logout
 * @body { id, rol } o usa req.user si está autenticado
 */
const logout = async (req, res) => {
  try {
    // Intentar obtener datos del token si está autenticado
    let userId = req.body.id || req.user?.id;
    let userRol = req.body.rol || req.user?.rol;

    if (!userId || !userRol) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario y rol son requeridos',
      });
    }

    // Normalizar rol
    userRol = userRol.toLowerCase().trim();

    // Eliminar refresh token de Redis
    await deleteRefreshToken(userId, userRol);

    // Blacklist del access token si está presente
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const accessToken = authHeader.split(' ')[1];
      try {
        const decoded = verifyAccessToken(accessToken);
        
        if (decoded && decoded.jti) {
          const now = Math.floor(Date.now() / 1000);
          const ttlRemaining = decoded.exp ? (decoded.exp - now) : 3600;
          
          if (ttlRemaining > 0) {
            await blacklistAccessToken(decoded.jti, ttlRemaining);
          }
        }
      } catch {
        // Si el token ya expiró o es inválido, no hay nada que blacklistear
      }
    }

    // Destruir sesión de Express si existe
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          logger.error('Error al destruir sesión de Express:', {
      error: err.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
        }
      });
    }

    return res.json({
      success: true,
      message: 'Sesión cerrada exitosamente',
    });
  } catch (error) {
    logger.error('Error al cerrar sesión', {
      error: error.message,
      userId: req.body.id || req.user?.id,
      requestId: req.requestId
    });
    return res.status(500).json({
      success: false,
      message: 'Error al cerrar sesión'
    });
  }
};

/**
 * Verificar estado de sesión (si el refresh token es válido)
 * GET /api/auth/session-status
 * @query { userId, rol }
 */
const checkSessionStatus = async (req, res) => {
  try {
    const { userId, rol } = req.query;

    if (!userId || !rol) {
      return res.status(400).json({
        success: false,
        message: 'userId y rol son requeridos',
      });
    }

    const storedToken = await getRefreshToken(userId, rol);

    return res.json({
      success: true,
      data: {
        hasActiveSession: !!storedToken,
      },
    });
  } catch (error) {
    logger.error('Error al verificar estado de sesión', {
      error: error.message,
      requestId: req.requestId
    });
    return res.status(500).json({
      success: false,
      message: 'Error al verificar estado de sesión'
    });
  }
};

module.exports = {
  refreshAccessToken,
  logout,
  checkSessionStatus,
};
