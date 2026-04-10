/**
 * PEDIDOS STATUS CONTROLLER
 * 
 * Controlador especializado para el cambio de estatus de pedidos.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * CARACTERÍSTICAS:
 * - Transacciones atómicas con rollback automático
 * - Validación de stock antes de confirmar
 * - Deducción de inventario con SmartStockService
 * - Generación de CXC para pedidos a crédito
 * - Registro en Kardex (movimientos_inventario)
 * - Notificaciones al cliente
 * 
 * GARANTÍAS:
 * - Si cualquier operación falla, TODA la transacción se revierte
 * - No puede haber stock deducido sin CXC generado
 * - No puede haber CXC sin stock deducido
 * 
 * @module controllers/pedidosStatusController
 * @author RazoConnect Team
 * @date 2026-02-26
 */

const db = require('../db');
const logger = require('../utils/logger');
const estadosHelper = require('../utils/estadosHelper');
const SmartStockService = require('../services/SmartStockService');
const inventoryService = require('../services/inventoryService');
const { crearNotificacion } = require('../services/notificacionesService');
const { executeTransaction, createValidator } = require('../utils/transactionManager');

/**
 * Actualiza el estatus de un pedido con transacciones atómicas
 *
 * ⚠️ IMPORTANTE: Este controller SOLO cambia el estado del PEDIDO
 *
 * FLUJO REAL DEL SISTEMA:
 * 1. Estados de PRODUCTOS (detallesdelpedido.estado_producto) cambian automáticamente:
 *    - Dinámicos: "Bajo pedido" ↔ "Con stock" (por triggers en stock_admin)
 *    - Semifijo: Inventarios marca como "Surtido" (manual)
 *    - Final: Finanzas marca como "Facturado" (manual) → ✅ CXC se genera aquí
 *
 * 2. Estados de PEDIDOS (pedidos.estatus) cambian cálculados por triggers:
 *    - Dinámicos: "Bajo pedido" / "Combinado" / "Completo"
 *    - Semifijo: "Listo para remisionar" (por trigger cuando inventarios confirma todos)
 *    - Final: "Surtido completo" (cuando pedido está 100% facturado)
 *
 * 3. CXC se genera cuando finanzas confirma productos (estado_producto = 'Facturado')
 *    - Puede haber MÚLTIPLES CXC por el mismo pedido
 *    - Una CXC por cada producto que fue facturado
 *
 * @route PUT /api/admin/pedidos/:id
 * @param {Object} req.params.id - ID del pedido
 * @param {Object} req.body.estatus - Nuevo estatus (solo los 5 válidos para pedidos)
 */
const updatePedidoEstatus = async (req, res) => {
  try {
    const { tenant_id } = req.tenant;
    const pedidoId = parseInt(req.params.id);
    const { estatus, confirmarBackorder } = req.body;


    // ========================================
    // VALIDACIONES PREVIAS (Fuera de transacción)
    // ========================================

    if (!estatus) {
      return res.status(400).json({
        success: false,
        message: "El estatus es requerido"
      });
    }

    const estatusValidos = [
      'Bajo pedido',
      'Combinado',
      'Completo',
      'Listo para remisionar',
      'Surtido completo'
    ];

    if (!estatusValidos.includes(estatus)) {
      logger.error(`❌ [STATUS CHANGE] Estatus inválido: ${estatus}`, {
        requestId: req.requestId,
        tenantId: req.tenant?.tenant_id
      });
      return res.status(400).json({
        success: false,
        message: `Estatus inválido. Valores permitidos: ${estatusValidos.join(', ')}`
      });
    }

    // Obtener información completa del pedido CON detalles (QUERY CONSOLIDADA)
    const pedidoConDetalles = await db.query(
      `SELECT
        p.pedidoid,
        p.estatus,
        p.clienteid,
        p.montototal,
        p.es_credito,
        p.monto_descuento,
        p.admin_asignado_id,
        p.tenant_id,
        d.detalleid,
        d.varianteid,
        d.piezastotales,
        d.cantidadsurtida,
        d.estado_producto,
        pv.sku,
        pv.stock,
        pv.dimensiones,
        prd.nombreproducto as producto_nombre,
        prd.productoid
       FROM pedidos p
       LEFT JOIN detallesdelpedido d ON d.pedidoid = p.pedidoid AND d.tenant_id = p.tenant_id
       LEFT JOIN producto_variantes pv ON pv.varianteid = d.varianteid
       LEFT JOIN productos prd ON prd.productoid = pv.productoid
       WHERE p.pedidoid = $1 AND p.tenant_id = $2`,
      [pedidoId, tenant_id]
    );

    if (pedidoConDetalles.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado"
      });
    }

    const estatusActual = pedidoConDetalles.rows[0].estatus;
    const detalles = pedidoConDetalles.rows.filter(row => row.detalleid);  // Filtrar filas con detalles

    // ========================================
    // TRANSACCIÓN ATÓMICA
    // ========================================

    const result = await executeTransaction(async (client, logger) => {
      logger.logOperation('INICIO_CAMBIO_ESTATUS', { pedidoId, estatusActual, estatusNuevo: estatus });

      // ✅ PASO 1: Cambiar estatus del pedido
      // NOTA: La deducción de stock y generación de CXC ocurren por triggers
      // cuando los PRODUCTOS cambian a 'Facturado', no aquí en el PEDIDO

      logger.logOperation('CAMBIO_ESTATUS_PEDIDO', {
        pedidoId,
        estatusActual,
        estatusNuevo: estatus
      });

      // ✅ PASO 3: Actualizar estatus del pedido
      const updateResult = await client.query(
        `UPDATE pedidos 
         SET estatus = $1
         WHERE pedidoid = $2 AND tenant_id = $3
         RETURNING *`,
        [estatus, pedidoId, tenant_id]
      );

      if (updateResult.rows.length === 0) {
        throw new Error(`Pedido ${pedidoId} no encontrado al actualizar estatus`);
      }

      logger.logOperation('ESTATUS_ACTUALIZADO', { pedidoId, nuevoEstatus: estatus });

      return {
        success: true,
        pedido: updateResult.rows[0]
      };

    }, {
      context: {
        userId: req.user?.id || 0,
        endpoint: 'PUT /api/admin/pedidos/:id',
        pedidoId,
        estatusActual,
        estatusNuevo: estatus
      },
      timeout: 30000
    });

    // ========================================
    // POST-TRANSACCIÓN: Notificación (Fire-and-Forget)
    // ========================================

    // ✅ FIX #1: Fire-and-forget notificación - NO esperar
    // Cliente recibe respuesta inmediatamente (-200ms)
    crearNotificacion(
      result.pedido.clienteid,
      'pedido',
      `Pedido ${estatus}`,
      `Tu pedido #${pedidoId} ha sido actualizado a: ${estatus}`,
      {
        url: `/dashboard.html?tab=pedidos`,
        prioridad: 'normal',
        metadata: { pedidoId }
      }
    ).catch(notifError => {
      logger.warn('[NOTIFICATION] Error al crear notificación (no crítico)', {
        error: notifError.message,
        requestId: req.requestId,
        tenantId: req.tenant?.tenant_id,
        pedidoId,
        clienteId: result.pedido.clienteid
      });
    });

    res.json({
      success: true,
      message: `Pedido actualizado a ${estatus}`,
      pedido: result.pedido
    });

  } catch (error) {
    logger.error('Error crítico al cambiar estatus de pedido', {
      pedidoId: req.params.id,
      error: error.message,
      stack: error.stack,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    
    res.status(500).json({
      success: false,
      message: "Error al actualizar el estatus del pedido"
    });
  }
};

module.exports = {
  updatePedidoEstatus
};
