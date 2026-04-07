/**
 * BACKORDER CONTROLLER
 * 
 * Controlador especializado para gestión de órdenes en backorder.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/backorderController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Confirmar orden de backorder
 * POST /api/admin/ordenes-compra/:id/confirmar
 */
const confirmarOrdenBackorder = async (req, res) => {
  try {
    const ordenCompraId = parseInt(req.params.id);
    const tenant_id = req.tenant?.tenant_id || 1;

    // Verificar que la orden existe y está pendiente
    const ordenResult = await db.query(
      `SELECT oc.*, p.nombreempresa
       FROM ordenesdecompra oc
       INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
       WHERE oc.ordencompraid = $1
       AND oc.tenant_id = $2`,
      [ordenCompraId, tenant_id]
    );

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenResult.rows[0];

    // Actualizar estatus a confirmado
    await db.query(
      `UPDATE ordenesdecompra
       SET estatus = 'Confirmada'
       WHERE ordencompraid = $1 AND tenant_id = $2`,
      [ordenCompraId, tenant_id]
    );

    // Obtener clientes afectados por productos en backorder
    const clientesQuery = await db.query(
      `SELECT DISTINCT p.clienteid
       FROM pedidos p
       INNER JOIN detallesdelpedido dp ON p.pedidoid = dp.pedidoid
       INNER JOIN detallesordencompra doc ON dp.varianteid = doc.varianteid
       WHERE doc.ordencompraid = $1
       AND p.estatus = 'Backorder'
       AND p.tenant_id = $2`,
      [ordenCompraId, tenant_id]
    );

    // Notificar a cada cliente
    const notificacionesController = require('./notificacionesController');
    for (const cliente of clientesQuery.rows) {
      await notificacionesController.crearNotificacion(cliente.clienteid, {
        tipo: 'backorder',
        titulo: '✅ Orden de Backorder Confirmada',
        mensaje: `Tu orden de backorder #${ordenCompraId} ha sido confirmada y está siendo procesada.`,
        url: '/dashboard.html?tab=pedidos',
        prioridad: 'normal',
        metadata: { ordenCompraId },
      });
    }

    res.json({
      success: true,
      message: "Orden de backorder confirmada exitosamente",
      data: {
        ordenCompraId,
        clientesNotificados: clientesQuery.rows.length,
      },
    });
  } catch (error) {
    logger.error('Error al confirmar orden de backorder:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al confirmar orden de backorder"
    });
  }
};

/**
 * Cancelar orden de backorder
 * POST /api/admin/ordenes-compra/:id/cancelar
 */
const cancelarOrdenBackorder = async (req, res) => {
  try {
    const ordenCompraId = parseInt(req.params.id);
    const { motivo } = req.body;

    if (!motivo || motivo.trim() === '') {
      return res.status(400).json({
        success: false,
        message: "El motivo de cancelación es requerido",
      });
    }

    const { tenant_id } = req.tenant;
    // Verificar que la orden existe
    const ordenResult = await db.query(
      `SELECT ordencompraid, estatus, tenant_id FROM ordenesdecompra WHERE ordencompraid = $1 AND tenant_id = $2`,
      [ordenCompraId, tenant_id]
    );

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    // Actualizar estatus a cancelado
    await db.query(
      `UPDATE ordenesdecompra 
       SET estatus = 'Cancelada'
       WHERE ordencompraid = $1 AND tenant_id = $2`,
      [ordenCompraId, tenant_id]
    );

    // Obtener clientes afectados
    const clientesQuery = await db.query(
      `SELECT DISTINCT p.clienteid
       FROM pedidos p
       INNER JOIN detallesdelpedido dp ON p.pedidoid = dp.pedidoid
       INNER JOIN detallesordencompra doc ON dp.varianteid = doc.varianteid
       WHERE doc.ordencompraid = $1
       AND p.estatus = 'Backorder'`,
      [ordenCompraId]
    );

    // Notificar a cada cliente
    const notificacionesController = require('./notificacionesController');
    for (const cliente of clientesQuery.rows) {
      await notificacionesController.notificarBackorderCancelado(
        ordenCompraId,
        cliente.clienteid,
        motivo
      );
    }

    res.json({
      success: true,
      message: "Orden de backorder cancelada y clientes notificados",
      data: {
        ordenCompraId,
        clientesNotificados: clientesQuery.rows.length,
        motivo,
      },
    });
  } catch (error) {
    logger.error('Error al cancelar orden de backorder:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error al cancelar orden de backorder"
    });
  }
};

module.exports = {
  confirmarOrdenBackorder,
  cancelarOrdenBackorder
};
