/**
 * ADMINISTRADORES OC CONTROLLER
 * 
 * Controlador para obtener lista de administradores que han creado órdenes de compra.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/administradoresOCController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');

const getAdministradoresOrdenesCompra = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    const query = `
      SELECT DISTINCT
        a.adminid,
        a.nombre,
        a.rol
      FROM Administradores a
      INNER JOIN OrdenesDeCompra oc ON a.adminid = oc.admin_creador_id
      WHERE oc.tenant_id = $1
      ORDER BY a.nombre ASC
    `;

    const result = await db.query(query, [tenant_id]);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        adminid: row.adminid,
        nombre: row.nombre,
        rol: row.rol
      }))
    });
  } catch (error) {
    console.error("Error al obtener administradores de órdenes de compra:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener administradores"
    });
  }
};

module.exports = {
  getAdministradoresOrdenesCompra
};
