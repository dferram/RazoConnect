const db = require("../db");
const logger = require("../utils/logger");

/**
 * Obtener todos los estados disponibles
 * GET /api/estados
 */
const getAllEstados = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT estadoid, nombre, abreviatura
       FROM estados
       ORDER BY nombre ASC`,
    );

    res.json({
      success: true,
      message: "Estados obtenidos exitosamente",
      data: result.rows,
    });
  } catch (error) {
    logger.error("Error al obtener estados:", {
      error: error.message,
      requestId: req.requestId,
    });

    res.status(500).json({
      success: false,
      message: "Error al obtener los estados",
      error: error.message,
    });
  }
};

module.exports = {
  getAllEstados,
};
