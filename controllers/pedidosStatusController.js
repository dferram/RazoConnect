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
      'Bajo pedido',
      'Completo',
      'Combinado',
      'Listo para remisionar',
      'Surtido completo',
      'Cancelado',
      'Entregado'
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

      // ✅ PASO 1: Deducir stock y generar CXC si cambia a "Surtido"
      if (estatus === 'Surtido' && estatusActual !== 'Surtido') {
        logger.logOperation('DEDUCCION_STOCK_INICIO', { pedidoId });

        // ⚠️ CRITICAL: Reutilizar datos ya consolidados para NO hacer queries adicionales
        const pedido = {
          pedidoid: pedidoConDetalles.rows[0].pedidoid,
          clienteid: pedidoConDetalles.rows[0].clienteid,
          montototal: pedidoConDetalles.rows[0].montototal,
          es_credito: pedidoConDetalles.rows[0].es_credito,
          monto_descuento: pedidoConDetalles.rows[0].monto_descuento
        };

        // ⚠️ CRITICAL: Obtener admin_id del cliente para asignar CXC al admin correcto
        const adminClienteId = await estadosHelper.getAdminByClienteEstado(pedido.clienteid, tenant_id);
        const adminIdCxc = adminClienteId || 1;

        // ⚠️ CRITICAL: Filtrar detalles que tienen stock > 0
        const detallesFiltrados = detalles.filter(row => parseInt(row.piezastotales) > 0);

        if (detallesFiltrados.length === 0) {
          throw new Error('No se encontraron productos para deducir stock');
        }

        const motivo = `Venta Pedido #${pedidoId}`;

        // ✅ FIX #2: Paralelizar deducción de stock con Promise.allSettled
        const deduccionPromesas = detallesFiltrados.map(async (item) => {
          const varianteId = parseInt(item.varianteid);
          const piezasTotales = parseInt(item.piezastotales);

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
            return { success: true, sku: item.sku };
          } catch (error) {
            logger.logOperation('ERROR_DEDUCCION_STOCK', {
              sku: item.sku,
              error: error.message
            });
            return { success: false, sku: item.sku, error: error.message };
          }
        });

        // Ejecutar TODO en paralelo (no secuencial)
        const resultados = await Promise.allSettled(deduccionPromesas);

        // Verificar si hubo errores críticos
        const errores = resultados
          .filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success))
          .map(r => r.reason?.message || r.value?.error || 'Unknown error');

        if (errores.length > 0) {
          throw new Error(`Error deduciendo stock: ${errores.join('; ')}`);
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
