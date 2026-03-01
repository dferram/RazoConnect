/**
 * ADMINISTRADORES CONTROLLER
 * 
 * Controlador especializado para gestión de administradores.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/administradoresController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener todos los administradores activos
 * GET /api/admin/administradores
 */
const getAllAdministradores = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    const query = `
      SELECT
        adminid,
        nombre,
        apellido,
        email,
        rol,
        activo
      FROM Administradores
      WHERE tenant_id = $1
        AND activo = true
      ORDER BY nombre ASC
    `;

    const result = await db.query(query, [tenant_id]);

    res.json({
      success: true,
      data: {
        administradores: result.rows
      }
    });
  } catch (error) {
    logger.error('Error al obtener administradores:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener administradores"
    });
  }
};

module.exports = {
  getAllAdministradores
};
