/**
 * CONTROLADOR DE BITÁCORA DE AUDITORÍA
 * Endpoints para consultar y analizar el historial de movimientos
 */

const logger = require("../services/loggerService");

const safeInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
};

const normalizeDate = (value) => {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

/**
 * Obtener logs de auditoría con filtros
 * GET /api/admin/bitacora
 */
const obtenerBitacora = async (req, res) => {
  try {
    const {
      usuarioId,
      accion,
      entidad,
      fechaInicio,
      fechaFin,
      page,
      limit
    } = req.query;

    const pageNumber = page ? parseInt(page, 10) : 1;
    const pageSize = limit ? parseInt(limit, 10) : 20;
    const offset = (pageNumber - 1) * pageSize;

    const { rows, total } = await logger.obtenerLogs({
      usuarioId,
      accion,
      entidad,
      fechaInicio,
      fechaFin,
      limit: pageSize,
      offset,
    });

    // Formatear respuesta
    const logsFormateados = rows.map(log => ({
      logId: log.logid,
      usuarioId: log.usuarioid,
      nombreUsuario: log.nombreusuario,
      rol: log.rol,
      accion: log.accion,
      entidad: log.entidad,
      entidadId: log.entidadid,
      detalles: log.detalles,
      ip: log.ip,
      fecha: log.fecha,
      nombre: log.admin_nombre || log.nombreusuario || null,
      email: log.admin_email || null
    }));

    const totalRegistros = total;
    const totalPaginas = totalRegistros > 0
      ? Math.ceil(totalRegistros / pageSize)
      : 1;

    res.json({
      success: true,
      data: {
        logs: logsFormateados,
        pagination: {
          totalRegistros,
          totalPaginas,
          paginaActual: pageNumber,
          registrosPorPagina: pageSize,
        },
      },
    });

  } catch (error) {
    console.error('Error al obtener bitácora:', error);
    res.status(500).json({
      success: false,
      message: "Error al obtener bitácora"
    });
  }
};

const obtenerActividad = async (req, res) => {
  try {
    const db = require("../db");

    const {
      usuarioId,
      accion,
      entidad,
      fechaInicio,
      fechaFin,
      limit,
    } = req.query;

    const where = [];
    const values = [];

    const usuarioIdParsed = safeInt(usuarioId);
    if (usuarioIdParsed) {
      values.push(usuarioIdParsed);
      where.push(`cc.usuario_solicitante_id = $${values.length}`);
    }

    const accionNorm = (accion || "").toString().trim().toUpperCase();
    if (accionNorm) {
      values.push(accionNorm);
      where.push(`cc.tipo_cambio = $${values.length}::tipo_cambio_enum`);
    }

    const entidadNorm = (entidad || "").toString().trim();
    if (entidadNorm) {
      values.push(entidadNorm);
      where.push(`cc.entidad = $${values.length}`);
    }

    const startDate = normalizeDate(fechaInicio);
    if (startDate) {
      values.push(startDate);
      where.push(`cc.fecha_solicitud >= $${values.length}`);
    }

    const endDate = normalizeDate(fechaFin);
    if (endDate) {
      values.push(endDate);
      where.push(`cc.fecha_solicitud <= $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const limitParsed = safeInt(limit);
    const pageSize = limitParsed && limitParsed > 0 && limitParsed <= 500 ? limitParsed : 200;
    values.push(pageSize);

    const query = `
      SELECT
        cc.id,
        cc.entidad,
        cc.entidad_id,
        cc.tipo_cambio,
        cc.datos_nuevos,
        cc.usuario_solicitante_id,
        cc.fecha_solicitud,
        COALESCE(a.nombre, ag.nombre) AS solicitante_nombre,
        COALESCE(a.email, ag.email) AS solicitante_email
      FROM control_cambios cc
      LEFT JOIN administradores a
        ON a.adminid = cc.usuario_solicitante_id
      LEFT JOIN agentesdeventas ag
        ON ag.agenteid = cc.usuario_solicitante_id
      ${whereSql}
      ORDER BY cc.fecha_solicitud DESC
      LIMIT $${values.length}
    `;

    const { rows } = await db.query(query, values);

    const historial = (rows || []).map((row) => ({
      id: row.id,
      entidad: row.entidad,
      entidadId: row.entidad_id,
      tipoCambio: row.tipo_cambio,
      datosNuevos: row.datos_nuevos,
      usuarioSolicitanteId: row.usuario_solicitante_id,
      solicitanteNombre: row.solicitante_nombre || null,
      solicitanteEmail: row.solicitante_email || null,
      fechaSolicitud: row.fecha_solicitud,
    }));

    return res.json({
      success: true,
      data: {
        historial,
        total: historial.length,
      },
    });
  } catch (error) {
    console.error("Error al obtener actividad:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener historial de actividad"
    });
  }
};
const obtenerUsuariosActividad = async (req, res) => {
  try {
    const db = require("../db");

    const result = await db.query(
      `SELECT DISTINCT
         cc.usuario_solicitante_id,
         COALESCE(a.nombre, ag.nombre) AS nombre,
         COALESCE(a.email, ag.email) AS email
       FROM control_cambios cc
       LEFT JOIN administradores a
         ON a.adminid = cc.usuario_solicitante_id
       LEFT JOIN agentesdeventas ag
         ON ag.agenteid = cc.usuario_solicitante_id
       WHERE cc.usuario_solicitante_id IS NOT NULL
       ORDER BY nombre NULLS LAST, email NULLS LAST, cc.usuario_solicitante_id`
    );

    const usuarios = (result.rows || []).map((row) => ({
      usuarioId: row.usuario_solicitante_id,
      nombre: row.nombre || null,
      email: row.email || null,
    }));

    return res.json({
      success: true,
      data: { usuarios },
    });
  } catch (error) {
    console.error("Error al obtener usuarios de actividad:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener usuarios"
    });
  }
};
const obtenerEntidadesActividad = async (req, res) => {
  try {
    const db = require("../db");

    const result = await db.query(
      `SELECT DISTINCT cc.entidad
       FROM control_cambios cc
       WHERE cc.entidad IS NOT NULL
       ORDER BY cc.entidad`
    );

    const entidades = (result.rows || []).map((row) => row.entidad);

    return res.json({
      success: true,
      data: { entidades },
    });
  } catch (error) {
    console.error("Error al obtener entidades de actividad:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener entidades"
    });
  }
};

/**
 * Obtener estadísticas de la bitácora
 * GET /api/admin/bitacora/estadisticas
 */
const obtenerEstadisticas = async (req, res) => {
  try {
    const estadisticas = await logger.obtenerEstadisticas();

    res.json({
      success: true,
      data: {
        totalMovimientos: parseInt(estadisticas.total_movimientos),
        usuariosActivos: parseInt(estadisticas.usuarios_activos),
        totalCreaciones: parseInt(estadisticas.total_creaciones),
        totalEdiciones: parseInt(estadisticas.total_ediciones),
        totalEliminaciones: parseInt(estadisticas.total_eliminaciones),
        movimientosHoy: parseInt(estadisticas.movimientos_hoy)
      }
    });

  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas'
    });
  }
};

/**
 * Obtener lista de usuarios únicos en la bitácora
 * GET /api/admin/bitacora/usuarios
 */
const obtenerUsuariosUnicos = async (req, res) => {
  try {
    const db = require('../db');
    
    const result = await db.query(`
      SELECT DISTINCT 
        UsuarioID,
        NombreUsuario,
        Rol
      FROM Log_Movimientos
      WHERE UsuarioID IS NOT NULL
      ORDER BY NombreUsuario
    `);

    const usuarios = result.rows.map(u => ({
      usuarioId: u.usuarioid,
      nombreUsuario: u.nombreusuario,
      rol: u.rol
    }));

    res.json({
      success: true,
      data: { usuarios }
    });

  } catch (error) {
    console.error('Error al obtener usuarios únicos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener usuarios',
      error: error.message
    });
  }
};

/**
 * Obtener lista de entidades únicas en la bitácora
 * GET /api/admin/bitacora/entidades
 */
const obtenerEntidadesUnicas = async (req, res) => {
  try {
    const db = require('../db');
    
    const result = await db.query(`
      SELECT DISTINCT Entidad
      FROM Log_Movimientos
      ORDER BY Entidad
    `);

    const entidades = result.rows.map(e => e.entidad);

    res.json({
      success: true,
      data: { entidades }
    });

  } catch (error) {
    console.error('Error al obtener entidades:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener entidades',
      error: error.message
    });
  }
};

module.exports = {
  obtenerBitacora,
  obtenerEstadisticas,
  obtenerUsuariosUnicos,
  obtenerEntidadesUnicas,
  obtenerActividad,
  obtenerUsuariosActividad,
  obtenerEntidadesActividad,
};
