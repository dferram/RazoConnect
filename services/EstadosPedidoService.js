/**
 * ESTADOS PEDIDO SERVICE - Servicio Centralizado de Estados
 * 
 * Responsabilidad: Gestión centralizada y consistente de estados de pedidos y productos
 * - Actualizar estados de productos basado en stock real
 * - Calcular y actualizar estados de pedidos
 * - Sincronizar estados entre productos y pedidos
 * - Validar consistencia de datos
 * 
 * @module services/EstadosPedidoService
 * @author RazoConnect Team
 * @date 2026-05-15
 */

const logger = require('../utils/logger');
const { calcularEstadoPedidoCorrect } = require('../utils/pedidoStatus');
const { ESTADOS_PEDIDO } = require('../utils/pedidoEstados');

class EstadosPedidoService {
  /**
   * DESACTIVADO TEMPORALMENTE - Actualiza el estado de un producto individual basado en stock disponible
   * @param {Object} client - Cliente de BD (transacción)
   * @param {number} detalleId - ID del detalle del pedido
   * @param {number} varianteId - ID de la variante
   * @param {number} adminId - ID del admin asignado
   * @param {number} tenantId - ID del tenant
   * @returns {Promise<string>} Nuevo estado del producto
   */
  /* COMENTADO - Actualización automática desactivada
  static async actualizarEstadoProducto(client, detalleId, varianteId, adminId, tenantId) {
    try {
      // Obtener información del producto y stock actual
      const query = `
        SELECT 
          dp.detalleid,
          dp.piezastotales,
          dp.cantidadsurtida,
          dp.estado_producto,
          COALESCE(SUM(sa.cantidad), 0) as stock_disponible
        FROM detallesdelpedido dp
        LEFT JOIN stock_admin sa ON sa.variante_id = dp.varianteid 
          AND sa.admin_id = $3 
          AND sa.tenant_id = $4
        WHERE dp.detalleid = $1 
          AND dp.varianteid = $2
          AND dp.tenant_id = $4
        GROUP BY dp.detalleid, dp.piezastotales, dp.cantidadsurtida, dp.estado_producto
      `;

      const result = await client.query(query, [detalleId, varianteId, adminId, tenantId]);

      if (result.rows.length === 0) {
        throw new Error(`Detalle ${detalleId} no encontrado`);
      }

      const detalle = result.rows[0];
      const estadoActual = (detalle.estado_producto || '').toLowerCase().trim();
      
      // No cambiar estados finales
      if (estadoActual === 'facturado') {
        logger.info('📌 Producto ya facturado, no se actualiza estado', {
          detalleId,
          estadoActual: detalle.estado_producto
        });
        return detalle.estado_producto;
      }

      // No cambiar productos surtidos (solo finanzas puede cambiarlos)
      if (estadoActual === 'surtido') {
        logger.info('📌 Producto surtido, solo finanzas puede cambiar estado', {
          detalleId,
          estadoActual: detalle.estado_producto
        });
        return detalle.estado_producto;
      }

      // Calcular nuevo estado basado en stock
      let nuevoEstado;
      const stockDisponible = parseInt(detalle.stock_disponible || 0, 10);
      const piezasRequeridas = parseInt(detalle.piezastotales || 0, 10);

      if (stockDisponible >= piezasRequeridas) {
        nuevoEstado = 'Con stock';
      } else {
        nuevoEstado = 'Bajo pedido';
      }

      // Actualizar solo si cambió
      if (nuevoEstado.toLowerCase() !== estadoActual) {
        await client.query(
          `UPDATE detallesdelpedido 
           SET estado_producto = $1,
               esbackorder = $2
           WHERE detalleid = $3 AND tenant_id = $4`,
          [nuevoEstado, nuevoEstado === 'Bajo pedido', detalleId, tenantId]
        );

        logger.info('✅ Estado de producto actualizado', {
          detalleId,
          varianteId,
          estadoAnterior: detalle.estado_producto,
          nuevoEstado,
          stockDisponible,
          piezasRequeridas
        });
      }

      return nuevoEstado;

    } catch (error) {
      logger.error('Error al actualizar estado de producto:', {
        error: error.message,
        detalleId,
        varianteId,
        adminId,
        tenantId
      });
      throw error;
    }
  }
  */

  /**
   * DESACTIVADO TEMPORALMENTE - Actualiza estados de todos los productos de un pedido
   * @param {Object} client - Cliente de BD (transacción)
   * @param {number} pedidoId - ID del pedido
   * @param {number} adminId - ID del admin asignado
   * @param {number} tenantId - ID del tenant
   * @returns {Promise<Object>} Resumen de actualizaciones
   */
  /* COMENTADO - Actualización automática desactivada
  static async actualizarEstadosProductosPedido(client, pedidoId, adminId, tenantId) {
    try {
      logger.info('🔄 Actualizando estados de productos del pedido', {
        pedidoId,
        adminId,
        tenantId
      });

      // Obtener todos los productos del pedido que NO están surtidos ni facturados
      const query = `
        SELECT 
          dp.detalleid,
          dp.varianteid,
          dp.piezastotales,
          dp.cantidadsurtida,
          dp.estado_producto,
          COALESCE(SUM(sa.cantidad), 0) as stock_disponible
        FROM detallesdelpedido dp
        LEFT JOIN stock_admin sa ON sa.variante_id = dp.varianteid 
          AND sa.admin_id = $2 
          AND sa.tenant_id = $3
        WHERE dp.pedidoid = $1 
          AND dp.tenant_id = $3
          AND LOWER(COALESCE(dp.estado_producto, '')) NOT IN ('surtido', 'facturado')
        GROUP BY dp.detalleid, dp.varianteid, dp.piezastotales, dp.cantidadsurtida, dp.estado_producto
      `;

      const result = await client.query(query, [pedidoId, adminId, tenantId]);

      if (result.rows.length === 0) {
        logger.info('ℹ️ No hay productos para actualizar (todos surtidos/facturados)', {
          pedidoId
        });
        return {
          actualizados: 0,
          conStock: 0,
          bajoPedido: 0
        };
      }

      let actualizados = 0;
      let conStock = 0;
      let bajoPedido = 0;

      // Construir batch update
      const casosConStock = [];
      const casosBajoPedido = [];

      for (const detalle of result.rows) {
        const stockDisponible = parseInt(detalle.stock_disponible || 0, 10);
        const piezasRequeridas = parseInt(detalle.piezastotales || 0, 10);
        const estadoActual = (detalle.estado_producto || '').toLowerCase().trim();

        let nuevoEstado;
        if (stockDisponible >= piezasRequeridas) {
          nuevoEstado = 'Con stock';
          conStock++;
          casosConStock.push(detalle.detalleid);
        } else {
          nuevoEstado = 'Bajo pedido';
          bajoPedido++;
          casosBajoPedido.push(detalle.detalleid);
        }

        // Solo contar si cambió
        if (nuevoEstado.toLowerCase() !== estadoActual) {
          actualizados++;
        }
      }

      // Actualizar en batch
      if (casosConStock.length > 0) {
        await client.query(
          `UPDATE detallesdelpedido 
           SET estado_producto = 'Con stock',
               esbackorder = false
           WHERE detalleid = ANY($1::int[]) 
             AND tenant_id = $2
             AND LOWER(COALESCE(estado_producto, '')) NOT IN ('surtido', 'facturado')`,
          [casosConStock, tenantId]
        );
      }

      if (casosBajoPedido.length > 0) {
        await client.query(
          `UPDATE detallesdelpedido 
           SET estado_producto = 'Bajo pedido',
               esbackorder = true
           WHERE detalleid = ANY($1::int[]) 
             AND tenant_id = $2
             AND LOWER(COALESCE(estado_producto, '')) NOT IN ('surtido', 'facturado')`,
          [casosBajoPedido, tenantId]
        );
      }

      logger.info('✅ Estados de productos actualizados', {
        pedidoId,
        totalProductos: result.rows.length,
        actualizados,
        conStock,
        bajoPedido
      });

      return {
        actualizados,
        conStock,
        bajoPedido,
        total: result.rows.length
      };

    } catch (error) {
      logger.error('Error al actualizar estados de productos del pedido:', {
        error: error.message,
        pedidoId,
        adminId,
        tenantId
      });
      throw error;
    }
  }
  */

  /**
   * Actualiza el estado del pedido basado en estados de productos
   * @param {Object} client - Cliente de BD (transacción)
   * @param {number} pedidoId - ID del pedido
   * @param {number} tenantId - ID del tenant
   * @returns {Promise<string>} Nuevo estado del pedido
   */
  static async actualizarEstadoPedido(client, pedidoId, tenantId) {
    try {
      logger.info('🔄 Calculando estado del pedido', {
        pedidoId,
        tenantId
      });

      // Usar la función centralizada de cálculo
      const nuevoEstado = await calcularEstadoPedidoCorrect(client, pedidoId);

      // Actualizar el pedido
      const updateResult = await client.query(
        `UPDATE pedidos 
         SET estatus = $1 
         WHERE pedidoid = $2 AND tenant_id = $3
         RETURNING estatus`,
        [nuevoEstado, pedidoId, tenantId]
      );

      if (updateResult.rows.length === 0) {
        throw new Error(`Pedido ${pedidoId} no encontrado`);
      }

      logger.info('✅ Estado del pedido actualizado', {
        pedidoId,
        nuevoEstado
      });

      return nuevoEstado;

    } catch (error) {
      logger.error('Error al actualizar estado del pedido:', {
        error: error.message,
        pedidoId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Sincroniza estados completos: productos + pedido
   * @param {Object} client - Cliente de BD (transacción)
   * @param {number} pedidoId - ID del pedido
   * @param {number} adminId - ID del admin asignado
   * @param {number} tenantId - ID del tenant
   * @returns {Promise<Object>} Resultado de sincronización
   */
  /* COMENTADO - Sincronización automática desactivada
  static async sincronizarEstadosPedido(client, pedidoId, adminId, tenantId) {
    try {
      logger.info('🔄 Sincronizando estados completos del pedido', {
        pedidoId,
        adminId,
        tenantId
      });

      // 1. Actualizar estados de productos
      const productosResult = await this.actualizarEstadosProductosPedido(
        client,
        pedidoId,
        adminId,
        tenantId
      );

      // 2. Actualizar estado del pedido
      const estadoPedido = await this.actualizarEstadoPedido(
        client,
        pedidoId,
        tenantId
      );

      const resultado = {
        success: true,
        pedidoId,
        estadoPedido,
        productosActualizados: productosResult.actualizados,
        resumenProductos: {
          total: productosResult.total,
          conStock: productosResult.conStock,
          bajoPedido: productosResult.bajoPedido
        }
      };

      logger.info('✅ Sincronización completa exitosa', resultado);

      return resultado;

    } catch (error) {
      logger.error('Error al sincronizar estados del pedido:', {
        error: error.message,
        stack: error.stack,
        pedidoId,
        adminId,
        tenantId
      });
      throw error;
    }
  }
  */

  /**
   * Valida y corrige inconsistencias en estados
   * @param {Object} client - Cliente de BD (transacción)
   * @param {number} pedidoId - ID del pedido
   * @param {number} tenantId - ID del tenant
   * @returns {Promise<Object>} Reporte de inconsistencias y correcciones
   */
  static async validarYCorregirInconsistencias(client, pedidoId, tenantId) {
    try {
      logger.info('🔍 Validando inconsistencias en pedido', {
        pedidoId,
        tenantId
      });

      const inconsistencias = [];

      // 1. Detectar productos con cantidadsurtida > 0 pero estado != Surtido/Facturado
      const huerfanosQuery = `
        SELECT detalleid, varianteid, cantidadsurtida, estado_producto
        FROM detallesdelpedido
        WHERE pedidoid = $1 
          AND tenant_id = $2
          AND cantidadsurtida > 0
          AND LOWER(COALESCE(estado_producto, '')) NOT IN ('surtido', 'facturado')
      `;

      const huerfanos = await client.query(huerfanosQuery, [pedidoId, tenantId]);

      if (huerfanos.rows.length > 0) {
        inconsistencias.push({
          tipo: 'DATOS_HUERFANOS',
          descripcion: 'Productos con cantidadsurtida > 0 pero estado incorrecto',
          productos: huerfanos.rows,
          cantidad: huerfanos.rows.length
        });

        // Corregir: resetear cantidadsurtida
        await client.query(
          `UPDATE detallesdelpedido
           SET cantidadsurtida = 0
           WHERE pedidoid = $1 
             AND tenant_id = $2
             AND cantidadsurtida > 0
             AND LOWER(COALESCE(estado_producto, '')) NOT IN ('surtido', 'facturado')`,
          [pedidoId, tenantId]
        );

        logger.info('✅ Corregidos datos huérfanos', {
          pedidoId,
          productosCorregidos: huerfanos.rows.length
        });
      }

      // 2. Detectar productos Surtidos sin cantidadsurtida
      const surtidosSinCantidadQuery = `
        SELECT detalleid, varianteid, cantidadsurtida, estado_producto
        FROM detallesdelpedido
        WHERE pedidoid = $1 
          AND tenant_id = $2
          AND LOWER(estado_producto) = 'surtido'
          AND (cantidadsurtida IS NULL OR cantidadsurtida = 0)
      `;

      const surtidosSinCantidad = await client.query(surtidosSinCantidadQuery, [pedidoId, tenantId]);

      if (surtidosSinCantidad.rows.length > 0) {
        inconsistencias.push({
          tipo: 'SURTIDOS_SIN_CANTIDAD',
          descripcion: 'Productos marcados como Surtido sin cantidadsurtida',
          productos: surtidosSinCantidad.rows,
          cantidad: surtidosSinCantidad.rows.length
        });

        // Corregir: cambiar a Con stock o Bajo pedido según disponibilidad
        logger.warn('⚠️ Productos surtidos sin cantidad detectados', {
          pedidoId,
          cantidad: surtidosSinCantidad.rows.length
        });
      }

      const resultado = {
        pedidoId,
        inconsistenciasEncontradas: inconsistencias.length,
        inconsistencias,
        corregido: inconsistencias.length > 0
      };

      if (inconsistencias.length === 0) {
        logger.info('✅ No se encontraron inconsistencias', { pedidoId });
      } else {
        logger.warn('⚠️ Inconsistencias encontradas y corregidas', resultado);
      }

      return resultado;

    } catch (error) {
      logger.error('Error al validar inconsistencias:', {
        error: error.message,
        pedidoId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Recalcula estados de todos los pedidos activos (mantenimiento)
   * @param {Object} client - Cliente de BD
   * @param {number} tenantId - ID del tenant
   * @param {number} limit - Límite de pedidos a procesar
   * @returns {Promise<Object>} Resultado del recálculo
   */
  /* COMENTADO - Recálculo masivo desactivado
  static async recalcularEstadosPedidosActivos(client, tenantId, limit = 100) {
    try {
      logger.info('🔄 Iniciando recálculo masivo de estados', {
        tenantId,
        limit
      });

      // Obtener pedidos activos
      const pedidosQuery = `
        SELECT p.pedidoid, p.admin_asignado_id, p.estatus
        FROM pedidos p
        WHERE p.tenant_id = $1
          AND p.estatus NOT IN ('Cancelado', 'Entregado')
        ORDER BY p.fechapedido DESC
        LIMIT $2
      `;

      const pedidos = await client.query(pedidosQuery, [tenantId, limit]);

      let procesados = 0;
      let errores = 0;
      const resultados = [];

      for (const pedido of pedidos.rows) {
        try {
          const resultado = await this.sincronizarEstadosPedido(
            client,
            pedido.pedidoid,
            pedido.admin_asignado_id,
            tenantId
          );

          resultados.push({
            pedidoId: pedido.pedidoid,
            estadoAnterior: pedido.estatus,
            estadoNuevo: resultado.estadoPedido,
            cambio: pedido.estatus !== resultado.estadoPedido
          });

          procesados++;

        } catch (error) {
          logger.error('Error al procesar pedido en recálculo masivo:', {
            pedidoId: pedido.pedidoid,
            error: error.message
          });
          errores++;
        }
      }

      const resumen = {
        totalPedidos: pedidos.rows.length,
        procesados,
        errores,
        cambios: resultados.filter(r => r.cambio).length,
        resultados
      };

      logger.info('✅ Recálculo masivo completado', resumen);

      return resumen;

    } catch (error) {
      logger.error('Error en recálculo masivo de estados:', {
        error: error.message,
        tenantId
      });
      throw error;
    }
  }
  */
}

module.exports = EstadosPedidoService;
