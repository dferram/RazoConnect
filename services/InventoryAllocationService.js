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

      // 2. Obtener detalles del pedido (sin agregaciones para poder usar FOR UPDATE)
      // CRÍTICO: No podemos usar SUM() con FOR UPDATE, así que obtenemos solo los detalles
      const detallesResult = await client.query(`
        SELECT
          d.detalleid,
          d.varianteid,
          d.piezastotales,
          d.estado_producto
        FROM detallesdelpedido d
        WHERE d.pedidoid = $1 AND d.tenant_id = $2
        ORDER BY d.detalleid
        FOR UPDATE OF d  -- Bloquear las filas de detallesdelpedido
      `, [pedidoId, tenantId]);

      const detalles = detallesResult.rows;
      const splitResults = [];

      // CRÍTICO: Mantener un registro en memoria del stock virtual asignado
      // Esto previene sobre-asignación cuando el mismo producto aparece múltiples veces en el pedido
      const stockVirtual = {}; // { varianteid: stock_restante }

      // 3. Obtener el stock disponible REAL de stock_admin
      // Obtener todas las variantes únicas del pedido
      const varianteIds = [...new Set(detalles.map(d => d.varianteid))];
      
      if (varianteIds.length > 0) {
        // Bloquear las filas de stock_admin para estas variantes
        // CRÍTICO: Calcular stock disponible = stock físico - stock ya asignado a otros pedidos del MISMO admin
        const stockResult = await client.query(`
          SELECT 
            sa.variante_id,
            sa.cantidad as stock_fisico,
            COALESCE(SUM(
              CASE 
                WHEN dp.estado_producto = 'Con stock' AND dp.pedidoid != $2
                THEN dp.piezastotales 
                ELSE 0 
              END
            ), 0) as stock_reservado_otros_pedidos,
            (sa.cantidad - COALESCE(SUM(
              CASE 
                WHEN dp.estado_producto = 'Con stock' AND dp.pedidoid != $2
                THEN dp.piezastotales 
                ELSE 0 
              END
            ), 0)) as stock_disponible
          FROM stock_admin sa
          LEFT JOIN detallesdelpedido dp ON dp.varianteid = sa.variante_id 
            AND dp.tenant_id = sa.tenant_id
          LEFT JOIN pedidos p ON dp.pedidoid = p.pedidoid 
            AND p.tenant_id = dp.tenant_id
            AND p.admin_asignado_id = sa.admin_id
          WHERE sa.variante_id = ANY($1::int[])
            AND sa.admin_id = $3
            AND sa.tenant_id = $4
          GROUP BY sa.variante_id, sa.cantidad
          FOR UPDATE OF sa  -- Bloquear el stock para prevenir race conditions inter-pedido
        `, [varianteIds, pedidoId, adminAsignadoId, tenantId]);

        // Inicializar el stock virtual con el stock disponible real
        stockResult.rows.forEach(row => {
          stockVirtual[row.variante_id] = Math.max(0, row.stock_disponible);
        });
      }

      // 4. Procesar cada detalle y realizar Line Splitting si es necesario
      for (const detalle of detalles) {
        const { detalleid, varianteid, piezastotales, estado_producto } = detalle;

        // Obtener el stock disponible VIRTUAL (descontando asignaciones previas en este pedido)
        const stockDisponibleVirtual = stockVirtual[varianteid] || 0;

        // Evaluar el estado del producto basado en stock disponible VIRTUAL
        const nuevoEstado = OrderStateEngine.evaluateProductStockState(
          estado_producto,
          piezastotales,
          stockDisponibleVirtual
        );

        // Si el estado ya es 'Surtido' o 'Facturado', no hacer nada
        if (['Surtido', 'Facturado'].includes(estado_producto)) {
          continue;
        }

        // Caso 1: Stock suficiente - actualizar estado a 'Con stock'
        if (stockDisponibleVirtual >= piezastotales) {
          await client.query(
            `UPDATE detallesdelpedido 
             SET estado_producto = 'Con stock', esbackorder = false
             WHERE detalleid = $1 AND tenant_id = $2`,
            [detalleid, tenantId]
          );

          // CRÍTICO: Restar del stock virtual para el siguiente detalle del mismo producto
          stockVirtual[varianteid] = stockDisponibleVirtual - piezastotales;

          splitResults.push({
            detalleid,
            action: 'updated',
            estado: 'Con stock',
            cantidad: piezastotales,
            stockRestante: stockVirtual[varianteid]
          });
        }
        // Caso 2: Stock parcial - realizar Line Splitting
        else if (stockDisponibleVirtual > 0 && stockDisponibleVirtual < piezastotales) {
          const cantidadConStock = stockDisponibleVirtual;
          const cantidadBajoPedido = piezastotales - stockDisponibleVirtual;

          // Actualizar el detalle original con la cantidad que tiene stock
          await client.query(
            `UPDATE detallesdelpedido 
             SET piezastotales = $1, estado_producto = 'Con stock', esbackorder = false 
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

          // CRÍTICO: Agotar el stock virtual (ya se asignó todo)
          stockVirtual[varianteid] = 0;

          splitResults.push({
            originalDetalleid: detalleid,
            nuevoDetalleid: insertResult.rows[0].detalleid,
            action: 'split',
            conStock: cantidadConStock,
            bajoPedido: cantidadBajoPedido,
            stockRestante: 0
          });
        }
        // Caso 3: Sin stock - actualizar estado a 'Bajo pedido'
        else {
          await client.query(
            `UPDATE detallesdelpedido 
             SET estado_producto = 'Bajo pedido', esbackorder = true
             WHERE detalleid = $1 AND tenant_id = $2`,
            [detalleid, tenantId]
          );

          splitResults.push({
            detalleid,
            action: 'updated',
            estado: 'Bajo pedido',
            cantidad: piezastotales,
            stockRestante: stockVirtual[varianteid] || 0
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
      // Obtener el detalle actual y su pedido padre
      const detalleResult = await client.query(
        `SELECT estado_producto, piezastotales, pedidoid FROM detallesdelpedido 
         WHERE detalleid = $1 AND tenant_id = $2`,
        [detalleIdRobado, tenantId]
      );

      if (detalleResult.rows.length === 0) {
        throw new Error(`Detalle ${detalleIdRobado} no encontrado`);
      }

      const { estado_producto, pedidoid } = detalleResult.rows[0];

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
         SET estado_producto = 'Bajo pedido', esbackorder = true
         WHERE detalleid = $1 AND tenant_id = $2`,
        [detalleIdRobado, tenantId]
      );

      // CRÍTICO: Recalcular el estado del pedido padre
      // Obtener todos los items del pedido actualizados
      const { rows: items } = await client.query(
        `SELECT estado_producto, piezastotales 
         FROM detallesdelpedido 
         WHERE pedidoid = $1 AND tenant_id = $2`,
        [pedidoid, tenantId]
      );

      // Usar OrderStateEngine para calcular el nuevo estado
      const OrderStateEngine = require('./OrderStateEngine');
      const nuevoEstadoPedido = OrderStateEngine.calculateOrderState(items);

      // Actualizar el estado del pedido
      await client.query(
        `UPDATE pedidos 
         SET estatus = $1 
         WHERE pedidoid = $2 AND tenant_id = $3`,
        [nuevoEstadoPedido, pedidoid, tenantId]
      );

      return {
        success: true,
        detalleId: detalleIdRobado,
        pedidoId: pedidoid,
        estadoAnterior: 'Con stock',
        estadoNuevo: 'Bajo pedido',
        estadoPedidoAnterior: null, // No lo tenemos, pero podríamos guardarlo
        estadoPedidoNuevo: nuevoEstadoPedido
      };
    } catch (error) {
      console.error(`[InventoryAllocationService] Error en applyFIFORetroceso:`, error);
      throw error;
    }
  }
}

module.exports = InventoryAllocationService;
