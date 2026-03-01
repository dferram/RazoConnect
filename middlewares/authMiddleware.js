const { verifyToken } = require("../utils/jwtHelper");
const db = require("../db");
const tenantSessionGuard = require("./tenantSessionGuard");
const { isTokenBlacklisted } = require("../config/redisClient");

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
      console.warn(`⚠️  [AUTH] Token no proporcionado - Path: ${req.path}`);
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
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (verifyError) {
      console.error(`❌ [AUTH] Token verification failed - Path: ${req.path}`, verifyError.message);
      return res.status(401).json({
        success: false,
        message: "Token inválido o expirado",
        error: verifyError.message,
      });
    }

    // Verificar si el token está en la blacklist (logout)
    if (decoded.jti) {
      const blacklisted = await isTokenBlacklisted(decoded.jti);
      if (blacklisted) {
        return res.status(401).json({
          success: false,
          message: 'Sesión inválida. Por favor inicia sesión nuevamente.'
        });
      }
    }

    // Extraer ID del payload normalizado
    const userId = decoded?.id;
    
    if (!userId || !Number.isInteger(Number(userId)) || Number(userId) <= 0) {
      return res.status(401).json({
        success: false,
        message: "Token inválido (id de usuario faltante o inválido)",
      });
    }

    // Normalizar rol del payload
    const rolFromToken = normalizeRole(decoded?.rol);
    
    if (!rolFromToken) {
      return res.status(401).json({
        success: false,
        message: "Token inválido (rol faltante)",
      });
    }

    const isAgenteToken = rolFromToken === "agente";
    const isClienteToken = rolFromToken === "cliente";
    const isAdminToken = rolFromToken === "admin" || rolFromToken === "super_admin";

    // 1) Si el token declara agente, validar contra agentesdeventas (activo)
    // CRÍTICO: Agentes son globales (no tienen tenant_id), validar solo por ID y estado
    if (isAgenteToken) {
      const agenteResult = await db.query(
        "SELECT agenteid, activo, email, codigoagente FROM agentesdeventas WHERE agenteid = $1 AND activo = TRUE LIMIT 1",
        [userId]
      );

      if (!agenteResult.rows.length) {
        return res.status(401).json({
          success: false,
          message: "Agente no autorizado o inactivo",
        });
      }

      req.user = {
        id: userId,
        userId, // Legacy compatibility
        rol: "agente",
        roles: ["agente"], // Legacy compatibility
        email: decoded?.email || agenteResult.rows[0].email || null,
        tenant_id: decoded?.tenant_id || null,
        codigoAgente: agenteResult.rows[0].codigoagente || null,
      };

      return tenantSessionGuard(req, res, next);
    }

    if (isClienteToken) {
      // CRÍTICO: Clientes están aislados por tenant_id
      const tenantIdFromToken = decoded?.tenant_id || req.tenant?.tenant_id;
      
      if (!tenantIdFromToken) {
        console.error(
          `❌ [AUTH] Cliente token sin tenant_id - UserID: ${userId}, Path: ${req.path}\n` +
          `   Token tenant_id: ${decoded?.tenant_id}\n` +
          `   Req.tenant: ${req.tenant?.tenant_id}`
        );
        return res.status(401).json({
          success: false,
          message: "Token de cliente sin tenant_id válido",
        });
      }

      const clienteResult = await db.query(
        "SELECT clienteid, activo, email, tenant_id FROM clientes WHERE clienteid = $1 AND tenant_id = $2 AND activo = TRUE LIMIT 1",
        [userId, tenantIdFromToken]
      );

      if (!clienteResult.rows.length) {
        console.error(
          `❌ [AUTH] Cliente no encontrado o inactivo - UserID: ${userId}, TenantID: ${tenantIdFromToken}, Path: ${req.path}`
        );
        return res.status(401).json({
          success: false,
          message: "Cliente no autorizado o inactivo",
        });
      }

      req.user = {
        id: userId,
        userId, // Legacy compatibility
        rol: "cliente",
        roles: ["cliente"], // Legacy compatibility
        email: decoded?.email || clienteResult.rows[0].email || null,
        tenant_id: clienteResult.rows[0].tenant_id,
      };

      return tenantSessionGuard(req, res, next);
    }

    // 2) Si no es agente por token, validar primero contra administradores (activo)
    // CRÍTICO: Filtrar por tenant_id para aislamiento multi-tenant
    const tenantIdFromToken = decoded?.tenant_id || req.tenant?.tenant_id;
    
    if (!tenantIdFromToken) {
      return res.status(401).json({
        success: false,
        message: "Token sin tenant_id válido",
      });
    }

    const adminResult = await db.query(
      "SELECT adminid, rol, activo, email, tenant_id FROM administradores WHERE adminid = $1 AND tenant_id = $2 AND activo = TRUE LIMIT 1",
      [userId, tenantIdFromToken]
    );

    if (adminResult.rows.length && adminResult.rows[0].activo === true) {
      const dbRol = normalizeRole(adminResult.rows[0].rol);
      const rolFinal = ["superadmin", "super-admin", "super admin"].includes(dbRol)
        ? "super_admin"
        : "admin";

      req.user = {
        id: userId,
        userId, // Legacy compatibility
        rol: rolFinal,
        roles: [rolFinal], // Legacy compatibility
        email: decoded?.email || adminResult.rows[0].email || null,
        tenant_id: adminResult.rows[0].tenant_id,
      };

      return tenantSessionGuard(req, res, next);
    }

    // 3) Fallback: si no existe en administradores, buscar como agente (activo)
    // Agentes son globales, no requieren tenant_id
    const agenteFallback = await db.query(
      "SELECT agenteid, activo, email, codigoagente FROM agentesdeventas WHERE agenteid = $1 AND activo = TRUE LIMIT 1",
      [userId]
    );

    if (agenteFallback.rows.length) {
      req.user = {
        id: userId,
        userId, // Legacy compatibility
        rol: "agente",
        roles: ["agente"], // Legacy compatibility
        email: decoded?.email || agenteFallback.rows[0].email || null,
        tenant_id: decoded?.tenant_id || null,
        codigoAgente: agenteFallback.rows[0].codigoagente || null,
      };

      return tenantSessionGuard(req, res, next);
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
 * Verifica que el token tenga el campo 'tipo' = 'admin' o que tenga rol admin/superadmin
 * También permite agentes con permisos de admin (EsAdmin=true) que tienen ['admin'] en roles
 */
const authorizeAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "No autenticado",
    });
  }

  // Verificar rol principal
  const rol = normalizeRole(req.user.rol);
  const isAdminByRol = rol === "admin" || rol === "super_admin" || rol === "superadmin";

  // Verificar array de roles (para agentes con permisos de admin)
  const userRoles = getUserRoles(req);
  const isAdminByRoles = userRoles.includes("admin") || userRoles.includes("super_admin") || userRoles.includes("superadmin");

  if (!isAdminByRol && !isAdminByRoles) {
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
  const allowed = rol === "admin" || rol === "superadmin" || rol === "super_admin" || rol === "agente";
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
    ["superadmin", "super-admin", "super admin", "super_admin"].includes(role)
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

  // Verificar que tenga específicamente el rol 'superadmin', 'super-admin' o 'super_admin'
  const isSuperAdmin = userRoles.some((role) =>
    ["superadmin", "super-admin", "super_admin"].includes(role.toLowerCase())
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
