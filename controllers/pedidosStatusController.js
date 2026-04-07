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
const SmartStockService = require('../services/SmartStockService');
const inventoryService = require('../services/inventoryService');
const { crearNotificacion } = require('../services/notificacionesService');
const { executeTransaction, createValidator } = require('../utils/transactionManager');

/**
 * Actualiza el estatus de un pedido con transacciones atómicas
 * 
 * FLUJO CRÍTICO:
 * 1. Validar estatus permitido
 * 2. Validar transición de estatus
 * 3. Validar stock disponible (si aplica)
 * 4. INICIAR TRANSACCIÓN
 * 5. Deducir stock (si cambia a "Surtido")
 * 6. Generar CXC (si es a crédito)
 * 7. Actualizar estatus del pedido
 * 8. Crear notificación al cliente
 * 9. COMMIT (o ROLLBACK si algo falla)
 * 
 * @route PUT /api/admin/pedidos/:id
 * @param {Object} req.params.id - ID del pedido
 * @param {Object} req.body.estatus - Nuevo estatus
 * @param {Object} req.body.confirmarBackorder - Flag para forzar cambio con backorder
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
      'Pendiente', 
      'Surtido', 
      'Procesando', 
      'Enviado', 
      'Entregado', 
      'Cancelado', 
      'Completado', 
      'Parcial', 
      'Parcialmente Surtido',
      'Listo para remisionar'
    ];

    if (!estatusValidos.includes(estatus)) {
      logger.error('❌ [STATUS CHANGE] Estatus inválido: ${estatus}', {
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
      return res.status(400).json({
        success: false,
        message: `Estatus inválido. Valores permitidos: ${estatusValidos.join(', ')}`
      });
    }

    // Obtener estatus actual del pedido
    const pedidoActualResult = await db.query(
      `SELECT estatus FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2`,
      [pedidoId, tenant_id]
    );

    if (pedidoActualResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pedido no encontrado"
      });
    }

    const estatusActual = pedidoActualResult.rows[0].estatus;

    // Validar transición de estatus
    if ((estatus === 'Enviado' || estatus === 'Entregado') && 
        estatusActual !== 'Surtido' && 
        estatusActual !== 'Enviado') {
      return res.status(400).json({
        success: false,
        message: `No se puede cambiar a "${estatus}" sin haber surtido el pedido primero.`,
        estatusActual: estatusActual,
        estatusRequerido: 'Surtido'
      });
    }

    // Validar stock disponible ANTES de iniciar transacción
    const estatusQueRequierenStock = ['Surtido', 'Enviado', 'Entregado'];
    
    if (estatusQueRequierenStock.includes(estatus) && !confirmarBackorder) {
      
      const detallesResult = await db.query(
        `SELECT 
          d.detalleid,
          d.varianteid,
          d.piezastotales,
          pv.sku,
          p.nombreproducto as producto_nombre,
          pv.dimensiones,
          COALESCE(pv.stock, 0) as stock_actual
         FROM detallesdelpedido d
         INNER JOIN producto_variantes pv ON pv.varianteid = d.varianteid
         INNER JOIN productos p ON p.productoid = pv.productoid
         WHERE d.pedidoid = $1 AND p.tenant_id = $2`,
        [pedidoId, tenant_id]
      );

      if (detallesResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No se encontraron productos en el pedido"
        });
      }

      const itemsConStockInsuficiente = [];
      
      for (const item of detallesResult.rows) {
        const piezasNecesarias = parseInt(item.piezastotales) || 0;
        const piezasDisponibles = parseInt(item.stock_actual) || 0;
        
        
        if (piezasDisponibles < piezasNecesarias) {
          itemsConStockInsuficiente.push({
            sku: item.sku,
            producto: item.producto_nombre,
            dimensiones: item.dimensiones || 'N/A',
            necesario: piezasNecesarias,
            disponible: piezasDisponibles,
            faltante: piezasNecesarias - piezasDisponibles
          });
        }
      }

      if (itemsConStockInsuficiente.length > 0) {
        logger.warn(`[STOCK VALIDATION] Stock insuficiente para ${itemsConStockInsuficiente.length} items`, {
          itemsCount: itemsConStockInsuficiente.length,
          requestId: req.requestId,
          tenantId: req.tenant?.tenant_id
        });
        
        const detalleProductos = itemsConStockInsuficiente.map(item => 
          `${item.producto} (${item.sku}): Necesitas ${item.necesario}, disponible ${item.disponible}`
        ).join('; ');
        
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente para el producto: ${itemsConStockInsuficiente[0].producto}`,
          error: `No hay suficiente inventario. ${detalleProductos}`,
          data: {
            itemsConStockInsuficiente,
            totalItems: detallesResult.rows.length,
            itemsConProblemas: itemsConStockInsuficiente.length
          }
        });
      }

    }

    // ========================================
    // TRANSACCIÓN ATÓMICA
    // ========================================

    const result = await executeTransaction(async (client, logger) => {
      logger.logOperation('INICIO_CAMBIO_ESTATUS', { pedidoId, estatusActual, estatusNuevo: estatus });

      // ✅ PASO 1: Deducir stock y generar CXC si cambia a "Surtido"
      if (estatus === 'Surtido' && estatusActual !== 'Surtido') {
        logger.logOperation('DEDUCCION_STOCK_INICIO', { pedidoId });
        
        // Obtener información del pedido
        const pedidoInfo = await client.query(
          `SELECT 
            p.pedidoid,
            p.clienteid,
            p.montototal,
            p.es_credito,
            p.monto_descuento
           FROM pedidos p
           WHERE p.pedidoid = $1 AND p.tenant_id = $2`,
          [pedidoId, tenant_id]
        );

        if (pedidoInfo.rows.length === 0) {
          throw new Error(`Pedido ${pedidoId} no encontrado en transacción`);
        }

        const pedido = pedidoInfo.rows[0];

        // ⚠️ CRITICAL: Obtener admin_id del cliente para asignar CXC al admin correcto
        const estadosHelper = require('../../utils/estadosHelper');
        const adminClienteId = await estadosHelper.getAdminByClienteEstado(pedido.clienteid, tenant_id);
        const adminIdCxc = adminClienteId || 1;

        // Obtener detalles para deducir stock
        const detallesResult = await client.query(
          `SELECT 
            d.detalleid,
            d.varianteid,
            d.cantidadpaquetes,
            d.piezastotales,
            pv.sku,
            p.nombreproducto as producto_nombre
           FROM detallesdelpedido d
           INNER JOIN producto_variantes pv ON pv.varianteid = d.varianteid
           INNER JOIN productos p ON p.productoid = pv.productoid
           WHERE d.pedidoid = $1 AND p.tenant_id = $2`,
          [pedidoId, tenant_id]
        );

        if (detallesResult.rows.length === 0) {
          throw new Error('No se encontraron productos para deducir stock');
        }

        const motivo = `Venta Pedido #${pedidoId}`;
        
        // Deducir stock para cada producto
        for (const item of detallesResult.rows) {
          const varianteId = parseInt(item.varianteid);
          const piezasTotales = parseInt(item.piezastotales) || 0;
          
          if (piezasTotales <= 0) {
            continue;
          }

          // ✅ Usar inventoryService para registrar en log_inventario con tipo_origen=VENTA
          try {
            await inventoryService.registrarMovimiento(client, {
              varianteId,
              cantidadDelta: -1 * piezasTotales,
              motivo,
              usuarioId: req.user.id,
              esExcepcion: false,
              tenantId: tenant_id,
              userRole: req.user.roles || ['admin'],
              tipoOrigen: 'VENTA' // ✅ CRÍTICO: Registrar como VENTA para conciliación
            });

            logger.logOperation('STOCK_DEDUCIDO', { 
              sku: item.sku, 
              cantidad: piezasTotales,
              tipoOrigen: 'VENTA'
            });
          } catch (error) {
            logger.logOperation('ERROR_DEDUCCION_STOCK', { 
              sku: item.sku, 
              error: error.message 
            });
            throw new Error(`Error al deducir stock de ${item.sku}: ${error.message}`);
          }
        }


        // ✅ PASO 2: Generar CXC si es a crédito
        if (pedido.es_credito) {
          logger.logOperation('CXC_INICIO', { pedidoId });

          const montoTotal = parseFloat(pedido.montototal);
          const clienteId = parseInt(pedido.clienteid);

          // Insertar en cuentas_por_cobrar - ⚠️ CRITICAL: Include admin_id
          await client.query(
            `INSERT INTO cuentas_por_cobrar
             (pedido_id, cliente_id, tipo_movimiento, monto, descripcion, tenant_id, admin_id)
             VALUES ($1, $2, 'CARGO', $3, $4, $5, $6)`,
            [
              pedidoId,
              clienteId,
              montoTotal,
              `Cargo por pedido #${pedidoId} confirmado`,
              tenant_id,
              adminIdCxc
            ]
          );

          logger.logOperation('CXC_INSERTADO', { monto: montoTotal });

          // Actualizar saldo deudor - ⚠️ CRITICAL: Add admin_id filter
          const creditoUpdate = await client.query(
            `UPDATE cliente_creditos
             SET saldo_deudor = saldo_deudor + $1,
                 ultima_actualizacion = NOW()
             WHERE cliente_id = $2 AND tenant_id = $3 AND admin_id = $4
             RETURNING credito_id, saldo_deudor`,
            [montoTotal, clienteId, tenant_id, adminIdCxc]
          );

          if (creditoUpdate.rows.length === 0) {
            throw new Error(`No se pudo actualizar el crédito del cliente ${clienteId}`);
          }

          logger.logOperation('CREDITO_ACTUALIZADO', { 
            clienteId, 
            nuevoSaldo: creditoUpdate.rows[0].saldo_deudor 
          });

          // Registrar movimiento de crédito
          const creditoId = creditoUpdate.rows[0].credito_id;
          const saldoDespues = creditoUpdate.rows[0].saldo_deudor;
          
          await client.query(
            `INSERT INTO credito_movimientos 
             (credito_id, tipo_movimiento, monto, descripcion, referencia_id, saldo_despues_movimiento, tenant_id)
             VALUES ($1, 'CARGO', $2, $3, $4, $5, $6)`,
            [
              creditoId,
              montoTotal,
              `Cargo por confirmación de pedido #${pedidoId}`,
              `PED-${pedidoId}`,
              saldoDespues,
              tenant_id
            ]
          );

          logger.logOperation('MOVIMIENTO_CREDITO_REGISTRADO', { creditoId });
        } else {
        }
      }

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
        userId: req.user.id,
        endpoint: 'PUT /api/admin/pedidos/:id',
        pedidoId,
        estatusActual,
        estatusNuevo: estatus
      },
      timeout: 30000
    });

    // ========================================
    // POST-TRANSACCIÓN: Notificación
    // ========================================

    // Crear notificación para el cliente (fuera de transacción)
    try {
      await crearNotificacion(
        result.pedido.clienteid,
        'pedido',
        `Pedido ${estatus}`,
        `Tu pedido #${pedidoId} ha sido actualizado a: ${estatus}`,
        {
          url: `/dashboard.html?tab=pedidos`,
          prioridad: 'normal',
          metadata: { pedidoId }
        }
      );
      logger.info('[NOTIFICATION] Notificación creada exitosamente', {
        clienteId: result.pedido.clienteid,
        pedidoId,
        estatus
      });
    } catch (notifError) {
      logger.warn('[NOTIFICATION] Error al crear notificación (no crítico)', {
        error: notifError.message,
        requestId: req.requestId,
        tenantId: req.tenant?.tenant_id
      });
    }


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
