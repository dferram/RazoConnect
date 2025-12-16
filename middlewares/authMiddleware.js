const { verifyToken } = require("../utils/jwtHelper");
const db = require("../db");

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
const authenticate = async (req, res, next) => {
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

    const rawUserId =
      decoded?.userId ?? decoded?.id ?? decoded?.userid ?? decoded?.AdminID ?? decoded?.adminId;
    const userId = Number.parseInt(rawUserId, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Token inválido (userId)",
      });
    }

    const rolesFromToken = Array.isArray(decoded?.roles)
      ? decoded.roles.map(normalizeRole).filter(Boolean)
      : [normalizeRole(decoded?.rol)].filter(Boolean);

    const isAgenteToken = rolesFromToken.includes("agente");
    const isClienteToken = rolesFromToken.includes("cliente");

    // 1) Si el token declara agente, validar contra agentesdeventas (activo)
    if (isAgenteToken) {
      const agenteResult = await db.query(
        "SELECT agenteid, activo, email, codigoagente FROM agentesdeventas WHERE agenteid = $1 LIMIT 1",
        [userId]
      );

      if (!agenteResult.rows.length || agenteResult.rows[0].activo !== true) {
        return res.status(401).json({
          success: false,
          message: "Agente no autorizado o inactivo",
        });
      }

      req.user = {
        ...decoded,
        id: userId,
        userId,
        rol: "agente",
        roles: ["agente"],
        email: decoded?.email || agenteResult.rows[0].email || null,
        codigoAgente: decoded?.codigoAgente || agenteResult.rows[0].codigoagente || null,
      };

      return next();
    }

    if (isClienteToken) {
      const clienteResult = await db.query(
        "SELECT clienteid, activo, email FROM clientes WHERE clienteid = $1 LIMIT 1",
        [userId]
      );

      if (!clienteResult.rows.length || clienteResult.rows[0].activo !== true) {
        return res.status(401).json({
          success: false,
          message: "Cliente no autorizado o inactivo",
        });
      }

      req.user = {
        ...decoded,
        id: userId,
        userId,
        rol: "cliente",
        roles: ["cliente"],
        email: decoded?.email || clienteResult.rows[0].email || null,
      };

      return next();
    }

    // 2) Si no es agente por token, validar primero contra administradores (activo)
    const adminResult = await db.query(
      "SELECT adminid, rol, activo, email FROM administradores WHERE adminid = $1 LIMIT 1",
      [userId]
    );

    if (adminResult.rows.length && adminResult.rows[0].activo === true) {
      const dbRol = normalizeRole(adminResult.rows[0].rol);
      const rolFinal = ["superadmin", "super-admin", "super admin"].includes(dbRol)
        ? "superadmin"
        : "admin";

      req.user = {
        ...decoded,
        id: userId,
        userId,
        rol: rolFinal,
        roles: [rolFinal],
        email: decoded?.email || adminResult.rows[0].email || null,
      };

      return next();
    }

    // 3) Fallback: si no existe en administradores, buscar como agente (activo)
    const agenteFallback = await db.query(
      "SELECT agenteid, activo, email, codigoagente FROM agentesdeventas WHERE agenteid = $1 LIMIT 1",
      [userId]
    );

    if (agenteFallback.rows.length && agenteFallback.rows[0].activo === true) {
      req.user = {
        ...decoded,
        id: userId,
        userId,
        rol: "agente",
        roles: ["agente"],
        email: decoded?.email || agenteFallback.rows[0].email || null,
        codigoAgente: decoded?.codigoAgente || agenteFallback.rows[0].codigoagente || null,
      };

      return next();
    }

    return res.status(401).json({
      success: false,
      message: "Usuario no autorizado",
    });
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

  const rol = normalizeRole(req.user.rol);
  if (rol !== "admin" && rol !== "superadmin") {
    return res.status(403).json({
      success: false,
      message: "Acceso denegado. Solo administradores",
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

  const rol = normalizeRole(req.user.rol);
  const allowed = rol === "admin" || rol === "superadmin" || rol === "agente";
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
