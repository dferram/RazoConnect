/**
 * TAMAÑOS ADMIN CONTROLLER
 * 
 * Controlador especializado para la gestión de tamaños de paquetes.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/tamanosAdminController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener todos los tamaños de paquetes disponibles
 * GET /api/admin/tamanos-paquetes
 * 
 * Esquema de cat_tamanopaquetes:
 * - tamanoid (integer, PK)
 * - cantidad (integer, NOT NULL)
 * - tenant_id (integer, FK to tenants)
 */
const getTamanosPaquetes = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;

    const result = await db.query(
      `SELECT tamanoid, cantidad, tenant_id
       FROM cat_tamanopaquetes
       WHERE tenant_id = $1
       ORDER BY cantidad ASC`,
      [tenant_id]
    );

    const tamanos = result.rows.map((row) => ({
      tamanoId: row.tamanoid,
      nombre: `Pack ${row.cantidad}`,
      cantidad: row.cantidad,
      valor: row.cantidad,
      etiqueta: `${row.cantidad} ${row.cantidad === 1 ? 'pieza' : 'piezas'}`,
      tenant_id: row.tenant_id
    }));

    res.json({
      success: true,
      data: {
        tamanos: tamanos
      },
    });
  } catch (error) {
    logger.error('Error al obtener tamaños de paquetes:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener los tamaños de paquetes",
      error: error.message
    });
  }
};

/**
 * Obtener tamaños de paquetes disponibles para un producto específico
 * GET /api/admin/productos/:id/tamanos-disponibles
 */
const getTamanosDisponiblesProducto = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const productoId = parseInt(req.params.id, 10);

    if (!Number.isInteger(productoId) || productoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProductoID inválido"
      });
    }

    const result = await db.query(
      `SELECT 
        ct.tamanoid,
        ct.cantidad
      FROM producto_tamanosdisponibles ptd
      INNER JOIN cat_tamanopaquetes ct ON ct.tamanoid = ptd.tamanoid AND ct.tenant_id = $2
      WHERE ptd.productoid = $1 AND ptd.tenant_id = $2
      ORDER BY ct.cantidad ASC`,
      [productoId, tenant_id]
    );

    const tamanos = result.rows.map((row) => ({
      tamanoId: row.tamanoid,
      nombre: `Pack ${row.cantidad}`,
      cantidad: row.cantidad
    }));

    res.json({
      success: true,
      data: tamanos
    });
  } catch (error) {
    logger.error('Error al obtener tamaños disponibles del producto:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al obtener los tamaños disponibles",
      error: error.message
    });
  }
};

module.exports = {
  getTamanosPaquetes,
  getTamanosDisponiblesProducto
};
