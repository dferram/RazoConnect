/**
 * @file services/InventoryAllocationService.js
 * @description Servicio para calcular asignación de stock y realizar Line Splitting.
 * Principio SRP: Maneja SOLO la lógica de asignación y división de líneas.
 */

const OrderStateEngine = require('./OrderStateEngine');

class InventoryAllocationService {
  /**
   * Calcula la asignación de stock para un pedido y realiza Line Splitting si es necesario.
   * 
   * Line Splitting: Si un detalle pide 24 pero hay 12 en stock, se divide en:
   * - Línea 1: 12 unidades con estado 'Con stock'
   * - Línea 2: 12 unidades con estado 'Bajo pedido'
   *
   * @param {Object} client - Cliente de base de datos (pg)
   * @param {number} pedidoId - ID del pedido
   * @param {number} tenantId - ID del tenant
   * @param {number} userId - ID del usuario que ejecuta la operación (opcional)
   * @returns {Promise<Object>} Resultado de la asignación
   */
  static async calculateAllocation(client, pedidoId, tenantId, userId = null) {
    try {
      // 1. Obtener admin asignado al pedido
      const pedidoResult = await client.query(
        `SELECT admin_asignado_id, clienteid FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2`,
        [pedidoId, tenantId]
      );

      if (pedidoResult.rows.length === 0) {
        throw new Error(`Pedido ${pedidoId} no encontrado`);
      }

      let adminAsignadoId = pedidoResult.rows[0].admin_asignado_id;
      const clienteId = pedidoResult.rows[0].clienteid;

      // FALLBACK: Si no hay admin asignado, intentar obtener el admin del cliente
      if (!adminAsignadoId && clienteId) {
        console.warn(`[InventoryAllocationService] Pedido ${pedidoId} sin admin_asignado_id. Intentando obtener del cliente ${clienteId}`);
        
        const clienteResult = await client.query(
          `SELECT admin_asignado_id FROM clientes WHERE clienteid = $1 AND tenant_id = $2`,
          [clienteId, tenantId]
        );

        if (clienteResult.rows.length > 0 && clienteResult.rows[0].admin_asignado_id) {
          adminAsignadoId = clienteResult.rows[0].admin_asignado_id;
          
          // Actualizar el pedido con el admin del cliente
          await client.query(
            `UPDATE pedidos SET admin_asignado_id = $1 WHERE pedidoid = $2 AND tenant_id = $3`,
            [adminAsignadoId, pedidoId, tenantId]
          );
          
          console.info(`[InventoryAllocationService] Admin ${adminAsignadoId} asignado automáticamente al pedido ${pedidoId}`);
        }
      }

      // Si aún no hay admin asignado, retornar error descriptivo pero no fatal
      if (!adminAsignadoId) {
        return {
          success: false,
          error: 'NO_ADMIN_ASSIGNED',
          message: `Pedido ${pedidoId} sin admin asignado. Debe asignarse un administrador antes de calcular stock.`,
          pedidoId,
          requiresManualIntervention: true
        };
      }

      // 2. Obtener detalles del pedido con stock disponible
      // CRÍTICO: Usar SELECT FOR UPDATE para bloquear las filas y prevenir race conditions
      const detallesResult = await client.query(`
        SELECT
          d.detalleid,
          d.varianteid,
          d.piezastotales,
          d.estado_producto,
          COALESCE(SUM(sa.cantidad), 0) as stock_disponible
        FROM detallesdelpedido d
        LEFT JOIN stock_admin sa ON d.varianteid = sa.variante_id
          AND d.tenant_id = sa.tenant_id
          AND sa.admin_id = $2
        WHERE d.pedidoid = $1 AND d.tenant_id = $3
        GROUP BY d.detalleid, d.varianteid, d.piezastotales, d.estado_producto
        ORDER BY d.detalleid
        FOR UPDATE OF d  -- Bloquear las filas de detallesdelpedido para prevenir race conditions
      `, [pedidoId, adminAsignadoId, tenantId]);

      const detalles = detallesResult.rows;
      const splitResults = [];

      // 3. Procesar cada detalle y realizar Line Splitting si es necesario
      for (const detalle of detalles) {
        const { detalleid, varianteid, piezastotales, estado_producto, stock_disponible } = detalle;

        // Evaluar el estado del producto basado en stock disponible
        const nuevoEstado = OrderStateEngine.evaluateProductStockState(
          estado_producto,
          piezastotales,
          stock_disponible
        );

        // Si el estado ya es 'Surtido' o 'Facturado', no hacer nada
        if (['Surtido', 'Facturado'].includes(estado_producto)) {
          continue;
        }

        // Caso 1: Stock suficiente - actualizar estado a 'Con stock'
        if (stock_disponible >= piezastotales) {
          await client.query(
            `UPDATE detallesdelpedido 
             SET estado_producto = 'Con stock' 
             WHERE detalleid = $1 AND tenant_id = $2`,
            [detalleid, tenantId]
          );

          splitResults.push({
            detalleid,
            action: 'updated',
            estado: 'Con stock',
            cantidad: piezastotales
          });
        }
        // Caso 2: Stock parcial - realizar Line Splitting
        else if (stock_disponible > 0 && stock_disponible < piezastotales) {
          const cantidadConStock = stock_disponible;
          const cantidadBajoPedido = piezastotales - stock_disponible;

          // Actualizar el detalle original con la cantidad que tiene stock
          await client.query(
            `UPDATE detallesdelpedido 
             SET piezastotales = $1, estado_producto = 'Con stock' 
             WHERE detalleid = $2 AND tenant_id = $3`,
            [cantidadConStock, detalleid, tenantId]
          );

          // Insertar nuevo detalle con la cantidad restante en 'Bajo pedido'
          // CRÍTICO: Copiar TODAS las columnas del registro original para no perder datos
          const insertResult = await client.query(`
            INSERT INTO detallesdelpedido (
              pedidoid, varianteid, piezastotales, estado_producto, 
              esbackorder, tenant_id, cantidadsurtida,
              precio_unitario, descuento, notas_cliente, 
              promocion_id, fecha_creacion, usuario_creacion
            )
            SELECT 
              pedidoid, 
              varianteid, 
              $1 as piezastotales,  -- Cantidad restante
              'Bajo pedido' as estado_producto,
              true as esbackorder, 
              tenant_id, 
              0 as cantidadsurtida,
              precio_unitario,      -- Preservar precio
              descuento,            -- Preservar descuento
              notas_cliente,        -- Preservar notas
              promocion_id,         -- Preservar promoción
              NOW() as fecha_creacion,
              $4 as usuario_creacion
            FROM detallesdelpedido
            WHERE detalleid = $2 AND tenant_id = $3
            RETURNING detalleid
          `, [cantidadBajoPedido, detalleid, tenantId, userId]);

          splitResults.push({
            originalDetalleid: detalleid,
            nuevoDetalleid: insertResult.rows[0].detalleid,
            action: 'split',
            conStock: cantidadConStock,
            bajoPedido: cantidadBajoPedido
          });
        }
        // Caso 3: Sin stock - actualizar estado a 'Bajo pedido'
        else {
          await client.query(
            `UPDATE detallesdelpedido 
             SET estado_producto = 'Bajo pedido' 
             WHERE detalleid = $1 AND tenant_id = $2`,
            [detalleid, tenantId]
          );

          splitResults.push({
            detalleid,
            action: 'updated',
            estado: 'Bajo pedido',
            cantidad: piezastotales
          });
        }
      }

      return {
        success: true,
        pedidoId,
        splitResults
      };
    } catch (error) {
      console.error(`[InventoryAllocationService] Error en calculateAllocation:`, error);
      throw error;
    }
  }

  /**
   * Implementa el retroceso FIFO: un pedido prioritario reclama stock de otro pedido.
   * 
   * @param {Object} client - Cliente de base de datos (pg)
   * @param {number} detalleIdRobado - ID del detalle que pierde el stock
   * @param {number} tenantId - ID del tenant
   * @returns {Promise<Object>} Resultado del retroceso
   */
  static async applyFIFORetroceso(client, detalleIdRobado, tenantId) {
    try {
      // Obtener el detalle actual
      const detalleResult = await client.query(
        `SELECT estado_producto, piezastotales FROM detallesdelpedido 
         WHERE detalleid = $1 AND tenant_id = $2`,
        [detalleIdRobado, tenantId]
      );

      if (detalleResult.rows.length === 0) {
        throw new Error(`Detalle ${detalleIdRobado} no encontrado`);
      }

      const { estado_producto } = detalleResult.rows[0];

      // Solo aplicar retroceso si el estado actual es 'Con stock'
      if (estado_producto !== 'Con stock') {
        return {
          success: false,
          message: `Detalle ${detalleIdRobado} no está en estado 'Con stock'`
        };
      }

      // Bajar el estado a 'Bajo pedido'
      await client.query(
        `UPDATE detallesdelpedido 
         SET estado_producto = 'Bajo pedido' 
         WHERE detalleid = $1 AND tenant_id = $2`,
        [detalleIdRobado, tenantId]
      );

      return {
        success: true,
        detalleId: detalleIdRobado,
        estadoAnterior: 'Con stock',
        estadoNuevo: 'Bajo pedido'
      };
    } catch (error) {
      console.error(`[InventoryAllocationService] Error en applyFIFORetroceso:`, error);
      throw error;
    }
  }
}

module.exports = InventoryAllocationService;
