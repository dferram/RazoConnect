/**
 * TOGGLE VISIBILIDAD CONTROLLER
 * 
 * Controlador especializado para cambiar visibilidad de productos.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/toggleVisibilidadController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const auditService = require('../services/auditService');

/**
 * Toggle product visibility (activo field)
 * PUT /api/admin/productos/:id/toggle-visibilidad
 */
const toggleProductoVisibilidad = async (req, res) => {
  try {
    const productoId = parseInt(req.params.id, 10);
    const { activo } = req.body;
    const { tenant_id } = req.tenant;

    if (Number.isNaN(productoId)) {
      return res.status(400).json({
        success: false,
        message: "ID de producto inválido",
      });
    }

    if (typeof activo !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "El campo 'activo' debe ser un valor booleano",
      });
    }

    // Verificar que el producto existe
    const productoResult = await db.query(
      "SELECT productoid, activo FROM productos WHERE productoid = $1 AND tenant_id = $2",
      [productoId, tenant_id]
    );

    if (productoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    // Actualizar el estado
    const updateResult = await db.query(
      "UPDATE productos SET activo = $1 WHERE productoid = $2 RETURNING productoid, activo",
      [activo, productoId]
    );

    const producto = updateResult.rows[0];

    // Registrar en auditoría
    await auditService.registrarCambioPasivo(
      req,
      "productos",
      productoId,
      "UPDATE",
      productoResult.rows[0],
      producto
    );

    return res.json({
      success: true,
      message: `Producto ${activo ? 'activado' : 'desactivado'} correctamente`,
      data: {
        productoId: producto.productoid,
        activo: producto.activo,
      },
    });
  } catch (error) {
    console.error("Error al cambiar visibilidad del producto:", error);
    return res.status(500).json({
      success: false,
      message: "Error al cambiar la visibilidad del producto",
    });
  }
};

module.exports = {
  toggleProductoVisibilidad
};
