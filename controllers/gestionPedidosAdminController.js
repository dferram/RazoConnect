/**
 * GESTIÓN PEDIDOS ADMIN CONTROLLER
 * 
 * Controlador especializado para operaciones administrativas sobre pedidos.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/gestionPedidosAdminController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Actualizar costo de envío de un pedido
 * PUT /api/admin/pedidos/:id/costo-envio
 */
const updateCostoEnvio = async (req, res) => {
  try {
    const pedidoId = parseInt(req.params.id);
    const { costoEnvio } = req.body;

    if (Number.isNaN(pedidoId)) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    if (costoEnvio === undefined || costoEnvio === null || costoEnvio === "") {
      return res.status(400).json({
        success: false,
        message: "El costo de envío es requerido",
      });
    }

    const costoEnvioValue = parseFloat(costoEnvio);

    if (Number.isNaN(costoEnvioValue) || costoEnvioValue < 0) {
      return res.status(400).json({
        success: false,
        message: "El costo de envío debe ser un número mayor o igual a 0",
      });
    }

    const result = await db.query(
      `UPDATE Pedidos
       SET CostoEnvio = $1
       WHERE PedidoID = $2
       RETURNING PedidoID, CostoEnvio`,
      [costoEnvioValue, pedidoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    res.json({
      success: true,
      message: "Costo de envío actualizado",
      data: {
        pedidoId: result.rows[0].pedidoid,
        costoEnvio: parseFloat(result.rows[0].costoenvio),
      },
    });
  } catch (error) {
    logger.error('Error al actualizar costo de envío:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al actualizar el costo de envío",
    });
  }
};

module.exports = {
  updateCostoEnvio
};
