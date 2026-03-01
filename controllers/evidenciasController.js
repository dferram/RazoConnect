/**
 * EVIDENCIAS CONTROLLER
 * 
 * Controlador especializado para gestión de evidencias de recepción y entrega.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/evidenciasController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const auditService = require('../services/auditService');
const { crearNotificacion: crearNotificacionServicio } = require('../services/notificacionesService');

/**
 * Subir evidencia de recepción de orden de compra
 * POST /api/admin/ordenes-compra/:id/evidencia
 */
const subirEvidenciaRecepcionOC = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionó ningún archivo de evidencia",
      });
    }

    const url = req.file.path;
    return res.status(200).json({
      success: true,
      message: "Evidencia subida exitosamente",
      data: { url },
    });
  } catch (error) {
    console.error("Error al subir evidencia de recepción:", error);
    return res.status(500).json({
      success: false,
      message: "Error al subir la evidencia",
    });
  }
};

/**
 * Subir evidencia de entrega (remisión firmada)
 * POST /api/admin/pedidos/:id/evidencia
 */
const subirEvidenciaEntrega = async (req, res) => {
  try {
    const pedidoId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de pedido inválido",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionó ningún archivo de evidencia",
      });
    }

    const { tenant_id } = req.tenant;
    const urlEvidencia = req.file.path;

    const pedidoResult = await db.query(
      "SELECT pedidoid, estatus, clienteid FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2",
      [pedidoId, tenant_id]
    );

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado",
      });
    }

    const updateResult = await db.query(
      `UPDATE pedidos 
       SET url_evidencia_entrega = $1, 
           fecha_entrega_real = NOW(), 
           estatus = 'Entregado'
       WHERE pedidoid = $2
       RETURNING pedidoid, url_evidencia_entrega, fecha_entrega_real, estatus`,
      [urlEvidencia, pedidoId]
    );

    const pedido = updateResult.rows[0];
    const clienteId = pedidoResult.rows[0].clienteid;

    if (clienteId) {
      try {
        await crearNotificacionServicio(
          clienteId,
          'pedido',
          `Pedido #${pedidoId} Entregado`,
          `Tu pedido ha sido entregado exitosamente. La evidencia de entrega ha sido registrada.`,
          `/pedido-detalle.html?id=${pedidoId}`,
          'normal'
        );
      } catch (notifError) {
        console.warn("No se pudo crear notificación de entrega:", notifError);
      }
    }

    await auditService.registrarCambioPasivo(
      req,
      "pedidos",
      pedidoId,
      "UPDATE",
      { estatus: pedidoResult.rows[0].estatus },
      { estatus: "Entregado", url_evidencia_entrega: urlEvidencia }
    );

    // 🚀 FIFO HOOK: Recalcular pedidos posteriores que ahora podrían tener stock disponible
    try {
      const FIFOAllocationService = require('../services/FIFOAllocationService');
      
      const recalcResult = await FIFOAllocationService.onPedidoEntregado({
        pedidoId: pedidoId,
        tenantId: tenant_id,
        client: db
      });
      
      if (recalcResult.success) {
        console.log(`[Evidencia Entrega] ✅ Recálculo FIFO completado - Pedidos posteriores actualizados`);
      }
    } catch (fifoError) {
      console.warn('[Evidencia Entrega] ⚠️ Error en recálculo FIFO (no crítico):', fifoError.message);
      // No interrumpir la operación si falla el recálculo
    }

    res.json({
      success: true,
      message: "Evidencia de entrega subida exitosamente",
      data: {
        pedidoId: pedido.pedidoid,
        urlEvidencia: pedido.url_evidencia_entrega,
        fechaEntregaReal: pedido.fecha_entrega_real,
        estatus: pedido.estatus,
      },
    });
  } catch (error) {
    console.error("Error al subir evidencia de entrega:", error);
    res.status(500).json({
      success: false,
      message: "Error al subir evidencia de entrega"
    });
  }
};

module.exports = {
  subirEvidenciaRecepcionOC,
  subirEvidenciaEntrega
};
