const db = require("../db");
const logger = require("../utils/logger");

/**
 * Obtener todos los administradores con sus estados asignados
 * GET /api/admin/gestionar-estados/admins
 */
const getAdminsConEstados = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    const result = await db.query(
      `SELECT
        a.adminid,
        a.nombre,
        a.apellido,
        a.email,
        a.rol,
        STRING_AGG(e.nombre, ', ' ORDER BY e.nombre) as estados_asignados,
        COUNT(ae.administrador_estado_id) as cantidad_estados,
        ARRAY_AGG(ae.estado_id) as estado_ids
       FROM administradores a
       LEFT JOIN administrador_estados ae ON a.adminid = ae.admin_id
         AND a.tenant_id = ae.tenant_id
       LEFT JOIN estados e ON ae.estado_id = e.estadoid
       WHERE a.tenant_id = $1 AND a.activo = TRUE
       GROUP BY a.adminid, a.nombre, a.apellido, a.email, a.rol
       ORDER BY a.nombre, a.apellido`,
      [tenant_id]
    );

    res.json({
      success: true,
      data: result.rows.map(row => ({
        ...row,
        estado_ids: row.estado_ids ? row.estado_ids.filter(id => id !== null) : []
      }))
    });
  } catch (error) {
    logger.error("Error al obtener admins con estados:", {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      success: false,
      message: "Error al obtener los administradores",
    });
  }
};

/**
 * Obtener todos los estados con sus administradores responsables
 * GET /api/admin/gestionar-estados/estados
 */
const getEstadosConAdmins = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    const result = await db.query(
      `SELECT
        e.estadoid,
        e.nombre,
        e.abreviatura,
        STRING_AGG(CONCAT(a.nombre, ' ', a.apellido), ', ' ORDER BY a.nombre) as admins_responsables
       FROM estados e
       LEFT JOIN administrador_estados ae ON e.estadoid = ae.estado_id
         AND ae.tenant_id = $1
       LEFT JOIN administradores a ON ae.admin_id = a.adminid AND a.activo = TRUE
       GROUP BY e.estadoid, e.nombre, e.abreviatura
       ORDER BY e.nombre`,
      [tenant_id]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error("Error al obtener estados con admins:", {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      success: false,
      message: "Error al obtener los estados",
    });
  }
};

/**
 * Obtener todos los clientes con su estado y admin asignado
 * GET /api/admin/gestionar-estados/clientes
 */
const getClientesConEstado = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    const result = await db.query(
      `SELECT
        c.clienteid,
        c.nombre,
        c.apellido,
        c.email,
        c.telefono,
        e.nombre as estado_nombre,
        STRING_AGG(CONCAT(a.nombre, ' ', a.apellido), ', ') as admin_responsable
       FROM clientes c
       LEFT JOIN estados e ON c.estado_id = e.estadoid
       LEFT JOIN administrador_estados ae ON e.estadoid = ae.estado_id
         AND ae.tenant_id = $1
       LEFT JOIN administradores a ON ae.admin_id = a.adminid AND a.activo = TRUE
       WHERE c.tenant_id = $1 AND c.activo = TRUE
       GROUP BY c.clienteid, c.nombre, c.apellido, c.email, c.telefono, e.nombre
       ORDER BY c.nombre, c.apellido`,
      [tenant_id]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error("Error al obtener clientes con estado:", {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      success: false,
      message: "Error al obtener los clientes",
    });
  }
};

/**
 * Asignar/reasignar estados a un administrador
 * POST /api/admin/gestionar-estados/asignar
 * Body: { adminId, estadoIds }
 */
const asignarEstados = async (req, res) => {
  try {
    const { adminId, estadoIds } = req.body;
    const { tenant_id } = req.tenant;

    // Validar parámetros
    if (!adminId || !Array.isArray(estadoIds) || estadoIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debes proporcionar adminId y al menos un estadoId",
      });
    }

    // Validar que el admin existe
    const adminCheck = await db.query(
      `SELECT adminid FROM administradores
       WHERE adminid = $1 AND tenant_id = $2 AND activo = TRUE`,
      [adminId, tenant_id]
    );

    if (adminCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Administrador no encontrado",
      });
    }

    // Validar que todos los estados existen
    const estadosCheck = await db.query(
      `SELECT COUNT(*) as count FROM estados
       WHERE estadoid = ANY($1)`,
      [estadoIds]
    );

    if (parseInt(estadosCheck.rows[0].count) < estadoIds.length) {
      return res.status(400).json({
        success: false,
        message: "Uno o más estados no existen en el sistema",
      });
    }

    // Eliminar asignaciones existentes
    await db.query(
      `DELETE FROM administrador_estados
       WHERE admin_id = $1 AND tenant_id = $2`,
      [adminId, tenant_id]
    );

    // Insertar nuevas asignaciones
    for (const estadoId of estadoIds) {
      await db.query(
        `INSERT INTO administrador_estados (admin_id, estado_id, tenant_id, activo)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (admin_id, estado_id, tenant_id) DO UPDATE SET activo = TRUE`,
        [adminId, estadoId, tenant_id]
      );
    }

    logger.info("Estados asignados al administrador:", {
      adminId,
      estadoIds,
      tenantId: tenant_id,
      usuarioId: req.user?.id,
    });

    res.json({
      success: true,
      message: "Estados asignados correctamente",
      data: {
        adminId,
        estadoIds,
      }
    });
  } catch (error) {
    logger.error("Error al asignar estados:", {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      success: false,
      message: "Error al asignar los estados",
    });
  }
};

module.exports = {
  getAdminsConEstados,
  getEstadosConAdmins,
  getClientesConEstado,
  asignarEstados,
};
