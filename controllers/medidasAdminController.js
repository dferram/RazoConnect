/**
 * MEDIDAS ADMIN CONTROLLER
 * 
 * Controlador especializado para la gestión de medidas y dimensiones de productos.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/medidasAdminController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');

/**
 * Obtener catálogo de medidas disponibles
 * GET /api/admin/medidas
 */
const getMedidas = async (req, res) => {
  try {
    console.log("\n=== INICIO getMedidas ===");
    const { tenant_id } = req.tenant;
    console.log("tenant_id:", tenant_id);

    const result = await db.query(
      `SELECT medidaid, tipoproductoid, nombremedida, descripcion, 
              alto, ancho, profundidad, unidadmedida, activo, orden
       FROM medidas
       WHERE tenant_id = $1 AND activo = true
       ORDER BY orden ASC, nombremedida ASC`,
      [tenant_id]
    );

    console.log("Medidas encontradas:", result.rows.length);

    res.json({
      success: true,
      data: {
        medidas: result.rows.map((row) => ({
          medidaId: row.medidaid,
          tipoProductoId: row.tipoproductoid,
          nombreMedida: row.nombremedida,
          descripcion: row.descripcion,
          alto: row.alto,
          ancho: row.ancho,
          profundidad: row.profundidad,
          unidadMedida: row.unidadmedida,
          activo: row.activo,
          orden: row.orden
        })),
      },
    });
  } catch (error) {
    console.error("\n=== ERROR en getMedidas ===");
    console.error("Error completo:", error);
    console.error("Error message:", error.message);
    console.error("Error code:", error.code);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message
    });
  }
};

/**
 * Obtener medidas existentes (dimensiones únicas de variantes)
 * GET /api/admin/medidas-existentes
 */
const getMedidasExistentes = async (req, res) => {
  try {
    console.log("\n=== INICIO getMedidasExistentes ===");
    const { tenant_id } = req.tenant;
    console.log("tenant_id:", tenant_id);

    const result = await db.query(
      `SELECT DISTINCT TRIM(pv.dimensiones) as dimension
       FROM producto_variantes pv
       INNER JOIN productos p ON p.productoid = pv.productoid
       WHERE p.tenant_id = $1 
         AND pv.dimensiones IS NOT NULL 
         AND TRIM(pv.dimensiones) != ''
       ORDER BY dimension ASC`,
      [tenant_id]
    );

    console.log("Dimensiones únicas encontradas:", result.rows.length);

    // Retornar array simple de strings
    const medidas = result.rows.map(row => row.dimension);

    res.json({
      success: true,
      data: {
        medidas
      },
    });
  } catch (error) {
    console.error("\n=== ERROR en getMedidasExistentes ===");
    console.error("Error completo:", error);
    console.error("Error message:", error.message);
    console.error("Error code:", error.code);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
      error: error.message
    });
  }
};

module.exports = {
  getMedidas,
  getMedidasExistentes
};
