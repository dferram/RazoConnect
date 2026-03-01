/**
 * AUTENTICACIÓN ADMIN CONTROLLER
 * 
 * Controlador especializado para autenticación y verificación de administradores.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/authAdminController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwtHelper');
const { saveRefreshToken } = require('../config/redisClient');
const { registrarLog } = require('../services/loggerService');

let agenteAdminColumnsCache = null;

const getAgenteAdminColumnsInfo = async () => {
  if (agenteAdminColumnsCache) {
    return agenteAdminColumnsCache;
  }

  try {
    const columnsResult = await db.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'agentesdeventas'
         AND column_name IN ('esadmin', 'adminrol')`
    );

    const found = columnsResult.rows.map((row) => row.column_name);
    agenteAdminColumnsCache = {
      esAdmin: found.includes("esadmin"),
      adminRol: found.includes("adminrol"),
    };

    if (!agenteAdminColumnsCache.esAdmin || !agenteAdminColumnsCache.adminRol) {
      logger.warn('Columnas opcionales para admin de agentes no detectadas en AgentesDeVentas', {
        columnsCache: agenteAdminColumnsCache
      });
    }
  } catch (error) {
    logger.error('Error verificando columnas de agentes admin:', {
      error: error.message
    });
    agenteAdminColumnsCache = {
      esAdmin: false,
      adminRol: false,
    };
  }

  return agenteAdminColumnsCache;
};

/**
 * Login de administrador
 * POST /api/admin/login
 */
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // CRITICAL SECURITY: Validar tenant_id del request
    if (!req.tenant || !req.tenant.tenant_id) {
      return res.status(400).json({
        success: false,
        message: "Tenant no identificado",
      });
    }

    const { tenant_id } = req.tenant;

    // Buscar administrador por email Y tenant_id (aislamiento multi-tenant)
    const result = await db.query(
      "SELECT * FROM Administradores WHERE Email = $1 AND tenant_id = $2 AND Activo = TRUE",
      [email, tenant_id]
    );

    let cuenta = null;

    if (result.rows.length > 0) {
      const admin = result.rows[0];
      cuenta = {
        id: admin.adminid,
        email: admin.email,
        nombre: (admin.nombre || "").trim(),
        apellido: (admin.apellido || "").trim(),
        rol: admin.rol,
        passwordHash: admin.passwordhash,
        adminSource: "admin",
        roles: Array.from(new Set(["admin", admin.rol].filter(Boolean))),
      };
    } else {
      const { esAdmin: hasEsAdminColumn, adminRol: hasAdminRolColumn } =
        await getAgenteAdminColumnsInfo();

      let agenteQueryText = `
        SELECT
          AgenteID,
          Nombre,
          Apellido,
          Email,
          PasswordHash,
          CodigoAgente,
          Activo
        FROM AgentesDeVentas
        WHERE Email = $1 AND tenant_id = $2 AND Activo = TRUE
      `;

      if (hasEsAdminColumn && hasAdminRolColumn) {
        agenteQueryText = `
          SELECT
            AgenteID,
            Nombre,
            Apellido,
            Email,
            PasswordHash,
            CodigoAgente,
            Activo,
            EsAdmin,
            AdminRol
          FROM AgentesDeVentas
          WHERE Email = $1 AND tenant_id = $2 AND Activo = TRUE
        `;
      } else if (hasEsAdminColumn) {
        agenteQueryText = `
          SELECT
            AgenteID,
            Nombre,
            Apellido,
            Email,
            PasswordHash,
            CodigoAgente,
            Activo,
            EsAdmin
          FROM AgentesDeVentas
          WHERE Email = $1 AND tenant_id = $2 AND Activo = TRUE
        `;
      } else if (hasAdminRolColumn) {
        agenteQueryText = `
          SELECT
            AgenteID,
            Nombre,
            Apellido,
            Email,
            PasswordHash,
            CodigoAgente,
            Activo,
            AdminRol
          FROM AgentesDeVentas
          WHERE Email = $1 AND tenant_id = $2 AND Activo = TRUE
        `;
      }

      const agenteResult = await db.query(agenteQueryText, [email, tenant_id]);

      if (agenteResult.rows.length > 0) {
        const agente = agenteResult.rows[0];
        const esAdmin = hasEsAdminColumn ? Boolean(agente.esadmin) : false;

        if (esAdmin) {
          const adminRol = hasAdminRolColumn
            ? agente.adminrol || "admin"
            : "admin";
          cuenta = {
            id: agente.agenteid,
            email: agente.email,
            nombre: (agente.nombre || "").trim(),
            apellido: (agente.apellido || "").trim(),
            rol: adminRol,
            passwordHash: agente.passwordhash,
            adminSource: "agent",
            codigoAgente: agente.codigoagente,
            roles: Array.from(new Set(["admin", adminRol, "agente"])),
          };
        }
      }
    }

    if (!cuenta) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, cuenta.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    // Normalizar rol para super_admin
    const rolNormalizado = cuenta.rol === 'superadmin' ? 'super_admin' : cuenta.rol;

    // Generar Access Token (1h) y Refresh Token (30d)
    const accessToken = generateAccessToken({
      id: cuenta.id,
      rol: rolNormalizado,
      email: cuenta.email,
      tenant_id: tenant_id,
    });

    const refreshToken = generateRefreshToken({
      id: cuenta.id,
      rol: rolNormalizado,
      email: cuenta.email,
      tenant_id: tenant_id,
    });

    // Guardar refresh token en Redis (30 días)
    await saveRefreshToken(cuenta.id, rolNormalizado, refreshToken, 30 * 24 * 60 * 60);

    const nombreCompleto =
      [cuenta.nombre?.trim(), cuenta.apellido?.trim()].filter(Boolean).join(" ").trim() ||
      cuenta.nombre?.trim() ||
      "Admin";

    // ============================================================================
    // CRÍTICO: PERSISTIR SESIÓN PARA EVITAR EXPULSIÓN INMEDIATA
    // ============================================================================
    // Guardar tenant_id y datos de usuario en la sesión de Express
    // Esto evita que tenantGuard destruya la sesión al detectar un tenant_id "nuevo"
    if (req.session) {
      req.session.tenant_id = tenant_id;
      req.session.userId = cuenta.id;
      req.session.user = {
        id: cuenta.id,
        email: cuenta.email,
        nombre: cuenta.nombre,
        apellido: cuenta.apellido,
        rol: cuenta.rol,
        tipo: 'admin',
        adminSource: cuenta.adminSource,
        tenant_id: tenant_id
      };
    }

    // Preparar datos de respuesta (estructura normalizada)
    res.json({
      success: true,
      message: "Login exitoso",
      data: {
        rol: rolNormalizado,
        usuario: {
          adminId: cuenta.id,
          nombre: nombreCompleto,
          email: cuenta.email,
          rol: rolNormalizado,
          origen: cuenta.adminSource,
        },
        accessToken,
        refreshToken,
      },
    });

    // Registrar log de LOGIN de admin (no bloquear el flujo principal)
    try {
      req.user = {
        id: cuenta.id,
        email: cuenta.email,
        nombre: cuenta.nombre,
        apellido: cuenta.apellido,
        rol: cuenta.rol,
        roles: cuenta.roles,
        adminSource: cuenta.adminSource,
      };

      registrarLog(req, "LOGIN", "Admin", cuenta.id, {
        email: cuenta.email,
        origen: cuenta.adminSource,
      }).catch((err) => {
        logger.error('Error guardando log de LOGIN admin:', {
      error: err.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
      });
    } catch (logError) {
      logger.error('Error interno al preparar log de LOGIN admin:', {
      error: logError.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    }
  } catch (error) {
    logger.error('Error en login de admin:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Verificar token de admin
 * GET /api/admin/verify
 */
const verifyAdmin = async (req, res) => {
  try {
    // El middleware ya validó el token y agregó req.user
    const adminId = req.user.id;
    const { tenant_id } = req.tenant;

    let adminInfo = null;

    if (req.user.adminSource === "agent") {
      const agentResult = await db.query(
        `SELECT 
          AgenteID,
          Nombre,
          Apellido,
          Email,
          CodigoAgente,
          AdminRol
        FROM AgentesDeVentas
        WHERE AgenteID = $1 AND tenant_id = $2 AND Activo = TRUE`,
        [adminId, tenant_id]
      );

      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Administrador no encontrado",
        });
      }

      const agente = agentResult.rows[0];
      const nombreCompleto =
        [(agente.nombre || "").trim(), (agente.apellido || "").trim()].filter(Boolean).join(" ").trim() ||
        "Admin";

      adminInfo = {
        adminId: agente.agenteid,
        nombre: nombreCompleto,
        email: agente.email,
        rol: agente.adminrol || req.user.rol,
        origen: "agent",
        codigoAgente: agente.codigoagente || req.user.codigoAgente || null,
      };
    } else {
      const result = await db.query(
        "SELECT AdminID, Nombre, Apellido, Email, Rol FROM Administradores WHERE AdminID = $1 AND tenant_id = $2 AND Activo = TRUE",
        [adminId, tenant_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Administrador no encontrado",
        });
      }

      const admin = result.rows[0];
      const nombreCompleto =
        [(admin.nombre || "").trim(), (admin.apellido || "").trim()].filter(Boolean).join(" ").trim() ||
        "Admin";

      adminInfo = {
        adminId: admin.adminid,
        nombre: nombreCompleto,
        email: admin.email,
        rol: admin.rol,
        origen: "admin",
      };
    }

    res.json({
      success: true,
      data: {
        admin: adminInfo,
      },
    });
  } catch (error) {
    logger.error('Error al verificar admin:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Renovar token de admin
 * POST /api/admin/refresh-token
 */
const refreshAdminToken = async (req, res) => {
  try {
    // El middleware authenticate ya verificó el token actual
    const adminId = req.user.id;
    const email = req.user.email;
    const tipo = req.user.tipo;
    
    // CRITICAL: Preserve tenant_id from ORIGINAL token
    const originalTenantId = req.user.tenant_id;
    
    if (!originalTenantId) {
      logger.error('❌ CRITICAL: Admin token refresh attempted for user ${adminId} without tenant_id in token', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
      return res.status(401).json({
        success: false,
        message: "Token inválido: falta tenant_id",
      });
    }

    // Verificar que el admin aún existe y pertenece al tenant correcto
    const result = await db.query(
      `SELECT AdminID FROM Administradores WHERE AdminID = $1 AND tenant_id = $2 AND Activo = TRUE`,
      [adminId, originalTenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Administrador no encontrado o inactivo",
      });
    }

    // Generar un nuevo token PRESERVANDO el tenant_id original
    const { generateToken } = require("../utils/jwtHelper");
    const newToken = generateToken({
      userId: adminId,
      tipo: tipo,
      rol: req.user.rol,
      email: email || null,
      tenant_id: originalTenantId,
    });

    res.json({
      success: true,
      message: "Token renovado exitosamente",
      data: {
        token: newToken,
      },
    });
  } catch (error) {
    logger.error('Error refreshing admin token:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al renovar token",
    });
  }
};

module.exports = {
  loginAdmin,
  verifyAdmin,
  refreshAdminToken
};
