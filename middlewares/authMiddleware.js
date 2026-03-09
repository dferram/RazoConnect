const { verifyToken } = require("../utils/jwtHelper");
const db = require("../db");
const tenantSessionGuard = require("./tenantSessionGuard");
const { isTokenBlacklisted } = require("../config/redisClient");
const logger = require("../utils/logger");

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
      logger.error('Token verification failed', {
        path: req.path,
        error: verifyError.message,
        requestId: req.requestId
      });
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
    // Roles administrativos: admin, super_admin, o cualquier rol granular (gerente_*, contador, etc.)
    const isAdminToken = rolFromToken === "admin" || 
                        rolFromToken === "super_admin" || 
                        (!isAgenteToken && !isClienteToken);

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
        logger.error('Cliente token sin tenant_id', {
          userId,
          path: req.path,
          tokenTenantId: decoded?.tenant_id,
          reqTenantId: req.tenant?.tenant_id,
          requestId: req.requestId
        });
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
        logger.error('Cliente no encontrado o inactivo', {
          userId,
          tenantId: tenantIdFromToken,
          path: req.path,
          requestId: req.requestId
        });
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
      
      // Normalizar variantes de super_admin
      let rolFinal = dbRol;
      if (["superadmin", "super-admin", "super admin"].includes(dbRol)) {
        rolFinal = "super_admin";
      }
      // Para roles granulares, mantener el rol exacto de la BD

      req.user = {
        id: userId,
        userId, // Legacy compatibility
        rol: rolFinal,
        roles: [rolFinal], // Legacy compatibility
        email: decoded?.email || adminResult.rows[0].email || null,
        tenant_id: adminResult.rows[0].tenant_id,
        permisos: [], // Se llenará con authorizePermiso si es necesario
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
 * Acepta los 7 roles base del sistema: super_admin, admin, inventarios, catalogo, finanzas, compras, agente
 * También acepta roles granulares legacy (gerente_*, contador, etc.)
 * RECHAZA: solo 'cliente'
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
  
  // CRÍTICO: Rechazar SOLO clientes - todos los demás roles son administrativos
  const isCliente = rol === "cliente";
  
  if (isCliente) {
    return res.status(403).json({
      success: false,
      message: "Acceso denegado. Solo administradores",
    });
  }

  // Todos los roles administrativos (super_admin, admin, inventarios, catalogo, finanzas, compras, agente, gerente_*, etc.) pasan
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

/**
 * Middleware para autorizar por roles granulares
 * Acepta array de roles exactos o wildcards tipo 'gerente_*'
 * super_admin y admin pasan SIEMPRE (backward compatible)
 * @param {Array<string>} rolesPermitidos - Array de roles permitidos
 */
const authorizeRole = (rolesPermitidos = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    const rolUsuario = normalizeRole(req.user.rol);

    // super_admin y admin pasan SIEMPRE (backward compatible)
    if (rolUsuario === "super_admin" || rolUsuario === "admin") {
      return next();
    }

    // Verificar roles permitidos
    const rolesNormalizados = rolesPermitidos.map(normalizeRole);
    
    // Verificar coincidencia exacta
    if (rolesNormalizados.includes(rolUsuario)) {
      return next();
    }

    // Verificar wildcards (ej: 'gerente_*' acepta gerente_finanzas, gerente_operaciones, etc.)
    const tieneAccesoPorWildcard = rolesNormalizados.some(rolPermitido => {
      if (rolPermitido.endsWith('*')) {
        const prefijo = rolPermitido.slice(0, -1);
        return rolUsuario.startsWith(prefijo);
      }
      return false;
    });

    if (tieneAccesoPorWildcard) {
      return next();
    }

    // Construir mensaje descriptivo
    const rolesLegibles = rolesPermitidos.join(', ');
    return res.status(403).json({
      success: false,
      message: `Acceso denegado. Se requiere uno de los siguientes roles: ${rolesLegibles}`,
      rolActual: req.user.rol,
    });
  };
};

/**
 * Middleware para autorizar por permisos granulares
 * Verifica si el rol del usuario tiene permiso para modulo:accion
 * super_admin y admin tienen "*" en todo → pasan siempre
 * @param {string} modulo - Módulo del sistema (ej: 'inventario', 'finanzas')
 * @param {string} accion - Acción específica (ej: 'ver', 'editar', 'auditar')
 */
const authorizePermiso = (modulo, accion) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    const rolUsuario = normalizeRole(req.user.rol);

    // super_admin y admin tienen acceso total (backward compatible)
    if (rolUsuario === "super_admin" || rolUsuario === "admin") {
      return next();
    }

    try {
      // Lazy load del servicio de permisos (evitar dependencia circular)
      const { tienePermiso } = require('../services/permisosService');
      
      const permitido = await tienePermiso(rolUsuario, modulo, accion);
      
      if (permitido) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere permiso: ${modulo}:${accion}`,
        rolActual: req.user.rol,
      });
    } catch (error) {
      logger.error('Error verificando permisos', {
        error: error.message,
        rol: rolUsuario,
        modulo,
        accion,
        requestId: req.requestId
      });
      
      return res.status(500).json({
        success: false,
        message: "Error al verificar permisos",
      });
    }
  };
};

/**
 * Middleware RBAC - Verificación de Permisos Granulares
 * 
 * Verifica si el usuario tiene permiso para ejecutar una acción en un módulo específico.
 * Usa la matriz de permisos de config/rolesConfig.js como fuente única de verdad.
 * 
 * REGLAS:
 * 1. super_admin y admin tienen bypass total (acceso a todo)
 * 2. Los demás roles se validan contra la matriz de permisos
 * 3. Si el rol no existe en la matriz, se deniega el acceso
 * 4. Si el módulo no está en los permisos del rol, se deniega
 * 5. Si la acción no está permitida para ese módulo, se deniega
 * 
 * @param {string} modulo - Módulo del sistema (ej: 'inventario', 'productos', 'pedidos')
 * @param {string} accion - Acción específica (ej: 'ver', 'crear', 'modificar', 'eliminar')
 * @returns {Function} Middleware de Express
 * 
 * @example
 * // Proteger ruta de ajustes de inventario
 * router.post('/inventario/ajustes', 
 *   authenticate, 
 *   requirePermission('ajustes', 'crear'), 
 *   controller.crearAjuste
 * );
 * 
 * @example
 * // Proteger ruta de validación de pagos
 * router.put('/pagos/:id/validar', 
 *   authenticate, 
 *   requirePermission('validar_pagos', 'modificar'), 
 *   controller.validarPago
 * );
 */
const requirePermission = (modulo, accion) => {
  return (req, res, next) => {
    // 1. Verificar autenticación
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    const rolUsuario = normalizeRole(req.user.rol);

    // 2. Bypass para super_admin y admin (acceso total)
    if (rolUsuario === "super_admin" || rolUsuario === "admin") {
      return next();
    }

    // 3. Importar matriz de permisos desde config
    const { tienePermiso } = require('../config/rolesConfig');

    // 4. Verificar si el rol tiene el permiso requerido
    const permitido = tienePermiso(rolUsuario, modulo, accion);

    if (permitido) {
      return next();
    }

    // 5. Denegar acceso con mensaje descriptivo
    return res.status(403).json({
      success: false,
      message: `Acceso denegado. Se requiere permiso: ${modulo}:${accion}`,
      rolActual: req.user.rol,
      permisoRequerido: {
        modulo,
        accion
      }
    });
  };
};

module.exports = {
  authenticate,
  authorize,
  authorizeAdmin,
  authorizeAdminOrAgente,
  authorizeAdminOnly,
  authorizeSuperAdmin,
  verifySuperAdmin,
  authorizeRole,
  authorizePermiso,
  requirePermission, // Nueva función RBAC con matriz de permisos
};
