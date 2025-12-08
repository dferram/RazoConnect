/**
 * CONTROLADOR DE BITÁCORA DE AUDITORÍA
 * Endpoints para consultar y analizar el historial de movimientos
 */

const logger = require("../services/loggerService");

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
      limit,
      offset
    } = req.query;

    const logs = await logger.obtenerLogs({
      usuarioId,
      accion,
      entidad,
      fechaInicio,
      fechaFin,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });

    // Formatear respuesta
    const logsFormateados = logs.map(log => ({
      logId: log.logid,
      usuarioId: log.usuarioid,
      nombreUsuario: log.nombreusuario,
      rol: log.rol,
      accion: log.accion,
      entidad: log.entidad,
      entidadId: log.entidadid,
      detalles: log.detalles,
      ip: log.ip,
      fecha: log.fecha
    }));

    res.json({
      success: true,
      data: {
        logs: logsFormateados,
        total: logsFormateados.length
      }
    });

  } catch (error) {
    console.error('Error al obtener bitácora:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la bitácora',
      error: error.message
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
      message: 'Error al obtener estadísticas',
      error: error.message
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
  obtenerEntidadesUnicas
};
