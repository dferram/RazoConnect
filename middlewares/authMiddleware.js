const { verifyToken } = require("../utils/jwtHelper");

function normalizeRole(role) {
  return (role || "").toString().trim().toLowerCase();
}

function getUserRoles(req) {
  if (!req?.user) return [];
  const roles =
    Array.isArray(req.user.roles) && req.user.roles.length
      ? req.user.roles
      : [req.user.rol].filter(Boolean);
  return roles.map(normalizeRole).filter(Boolean);
}

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
        message: "Token no proporcionado",
      });
    }

    // El formato esperado es: "Bearer TOKEN"
    const token = authHeader.startsWith("Bearer ")
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
      message: "Token inválido o expirado",
      error: error.message,
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
        message: "No autenticado",
      });
    }

    if (roles.length) {
      const allowedRoles = roles.map(normalizeRole).filter(Boolean);
      const userRoles = getUserRoles(req);
      const hasRole = userRoles.some((role) => allowedRoles.includes(role));

      if (!hasRole) {
        return res.status(403).json({
          success: false,
          message: "No tienes permisos para acceder a este recurso",
        });
      }
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
      message: "No autenticado",
    });
  }

  // Verificar que el tipo de usuario sea 'admin'
  if (req.user.tipo !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Acceso denegado. Solo administradores",
    });
  }

  const userRoles = getUserRoles(req);

  // Verificar que tenga un rol de admin válido
  const hasAdminRole = userRoles.some((role) =>
    ["admin", "superadmin", "super-admin", "super admin"].includes(role)
  );

  if (!hasAdminRole) {
    return res.status(403).json({
      success: false,
      message: "Rol de administrador inválido",
    });
  }

  next();
};

/**
 * Middleware: permitir acceso a administradores o agentes autenticados.
 * Útil para acciones operativas donde un agente debe participar, sin conceder permisos de admin completos.
 */
const authorizeAdminOrAgente = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "No autenticado",
    });
  }

  const userRoles = getUserRoles(req);
  const allowed = userRoles.some((role) => ["admin", "agente", "superadmin", "super-admin", "super admin"].includes(role));

  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: "No tienes permisos para acceder a este recurso",
    });
  }

  return next();
};

/**
 * Middleware: solo administradores reales (no agentes con acceso admin).
 * Bloquea tokens que incluyan rol 'agente'.
 */
const authorizeAdminOnly = (req, res, next) => {
  authorizeAdmin(req, res, () => {
    const userRoles = getUserRoles(req);
    const isAgente = userRoles.includes("agente");
    if (isAgente) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado. Solo administradores",
      });
    }
    return next();
  });
};

const verifySuperAdmin = (req, res, next) => {
  const userRoles = getUserRoles(req);
  const isSuperAdmin = userRoles.some((role) =>
    ["superadmin", "super-admin", "super admin"].includes(role)
  );
  if (req.user && isSuperAdmin) return next();
  return res.status(403).json({
    success: false,
    message: "Acceso denegado. Se requieren permisos de Super Administrador.",
  });
};

/**
 * Middleware específico para verificar que el usuario es un super-administrador
 * Solo los super-admins pueden realizar ciertas acciones críticas como crear otros administradores
 */
const authorizeSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "No autenticado",
    });
  }

  // Verificar que el tipo de usuario sea 'admin'
  if (req.user.tipo !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Acceso denegado. Solo super-administradores",
    });
  }

  const userRoles =
    Array.isArray(req.user.roles) && req.user.roles.length
      ? req.user.roles
      : [req.user.rol].filter(Boolean);

  // Verificar que tenga específicamente el rol 'superadmin' o 'super-admin'
  const isSuperAdmin = userRoles.some((role) =>
    ["superadmin", "super-admin"].includes(role.toLowerCase())
  );

  if (!isSuperAdmin) {
    return res.status(403).json({
      success: false,
      message: "Acceso denegado. Se requieren permisos de super-administrador",
    });
  }

  next();
};

module.exports = {
  authenticate,
  authorize,
  authorizeAdmin,
  authorizeAdminOrAgente,
  authorizeAdminOnly,
  authorizeSuperAdmin,
  verifySuperAdmin,
};
