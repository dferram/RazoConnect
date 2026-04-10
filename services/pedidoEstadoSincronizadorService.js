/**
 * ============================================================
 * SERVICIO: Sincronización Automática de Estados de Pedidos
 * ============================================================
 *
 * Propósito: Exponer métodos para recalcular estados de pedidos
 * manualmente cuando sea necesario (regeneración, auditoría, debugging)
 *
 * Métodos principales:
 * - recalcularUnPedido(): Recalcula estado de UN pedido
 * - recalcularPedidosDelAdmin(): Recalcula TODOS los pedidos de un admin
 * - obtenerHistorialCambios(): Obtiene auditoria de un pedido
 * - obtenerEstadisticasCambios(): Análisis agregado de cambios
 *
 * OBS: Los cambios automáticos se disparan en triggers de PostgreSQL
 * Este servicio es COMPLEMENTARIO para casos de uso Admin.
 *
 * @module services/pedidoEstadoSincronizadorService
 * @author RazoConnect Team
 * @date 2026-04-10
 */

const db = require('../db');
const logger = require('../utils/logger');

class PedidoEstadoSincronizadorService {
  /**
   * ============================================================
   * Recalcula el estado de UN pedido específico
   * ============================================================
   *
   * Llama a la función PostgreSQL fn_recalcular_estado_pedido_dinamico()
   * que aplica la lógica de prioridad de estados.
   *
   * @param {number} pedidoId - ID del pedido
   * @param {number} tenantId - ID del tenant
   * @returns {Promise<Object>} { nuevo_estado, cambio_realizado, razon }
   *
   * Ejemplo:
   * const result = await PedidoEstadoSincronizadorService.recalcularUnPedido(1234, 1);
   * console.log(result.cambio_realizado); // true/false
   * console.log(result.nuevo_estado);     // "COMPLETO", "BAJO_PEDIDO", etc.
   */
  static async recalcularUnPedido(pedidoId, tenantId) {
    const startTime = Date.now();

    try {
      logger.info('[PedidoEstadoSync] Recalculando estado de pedido', {
        pedidoId,
        tenantId
      });

      const result = await db.query(`
        SELECT
          nuevo_estado,
          cambio_realizado,
          razon
        FROM fn_recalcular_estado_pedido_dinamico($1, $2)
      `, [pedidoId, tenantId]);

      if (result.rows.length === 0) {
        throw new Error(`Función NO retornó resultado para pedido ${pedidoId}`);
      }

      const resultado = result.rows[0];
      const duration = Date.now() - startTime;

      logger.info('[PedidoEstadoSync] Recálculo completado', {
        pedidoId,
        cambioRealizado: resultado.cambio_realizado,
        estadoAnterior: resultado.estado_anterior,
        estadoNuevo: resultado.nuevo_estado,
        duracionMs: duration
      });

      return resultado;
    } catch (error) {
      logger.error('[PedidoEstadoSync] Error recalculando pedido individual', {
        pedidoId,
        tenantId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * ============================================================
   * Recalcula estados de TODOS los pedidos de un admin
   * ============================================================
   *
   * Útil para:
   * - Regeneración después de cambios de stock masivos
   * - Auditoria de inconsistencias
   * - Debugging de casos problemáticos
   *
   * NOTA: Ejecuta secuencialmente (no paralelo) para evitar
   * condiciones de carrera. Si necesitas paralelismo, agregar
   * worker threads/queue.
   *
   * @param {number} adminId - ID del admin
   * @param {number} tenantId - ID del tenant
   * @returns {Promise<Array>} Array de { pedidoId, cambio, nuevoEstado }
   *
   * Ejemplo:
   * const resultados = await PedidoEstadoSincronizadorService
   *   .recalcularPedidosDelAdmin(3, 1);
   * console.log(`${resultados.length} pedidos procesados`);
   * console.log(`${resultados.filter(r => r.cambio).length} con cambios`);
   */
  static async recalcularPedidosDelAdmin(adminId, tenantId) {
    const startTime = Date.now();
    let processados = 0;
    let conCambios = 0;

    try {
      logger.info('[PedidoEstadoSync] Iniciando recálculo masivo de pedidos', {
        adminId,
        tenantId
      });

      // 1. Obtener todos los pedidos ACTIVOS del admin
      const pedidosResult = await db.query(`
        SELECT DISTINCT p.pedidoid
        FROM pedidos p
        WHERE
          p.admin_asignado_id = $1
          AND p.tenant_id = $2
          AND p.estatus NOT IN ('Cancelado', 'Completado', 'Entregado')
        ORDER BY p.pedidoid
      `, [adminId, tenantId]);

      const pedidos = pedidosResult.rows;
      logger.info('[PedidoEstadoSync] Pedidos a procesar', {
        adminId,
        total: pedidos.length
      });

      // 2. Recalcular cada pedido secuencialmente
      const resultados = [];
      for (const { pedidoid } of pedidos) {
        try {
          const result = await this.recalcularUnPedido(pedidoid, tenantId);

          resultados.push({
            pedidoId: pedidoid,
            cambio: result.cambio_realizado,
            nuevoEstado: result.nuevo_estado,
            razon: result.razon
          });

          processados++;
          if (result.cambio_realizado) {
            conCambios++;
          }
        } catch (error) {
          logger.error('[PedidoEstadoSync] Error procesando pedido individual', {
            pedidoId: pedidoid,
            error: error.message
          });

          resultados.push({
            pedidoId: pedidoid,
            error: error.message,
            cambio: false
          });
        }
      }

      const duration = Date.now() - startTime;

      logger.info('[PedidoEstadoSync] Recálculo masivo completado', {
        adminId,
        totalPedidos: pedidos.length,
        procesados,
        conCambios,
        duracionMs: duration,
        promedioMspPorPedido: (duration / processados).toFixed(2)
      });

      return resultados;
    } catch (error) {
      logger.error('[PedidoEstadoSync] Error recalculando pedidos del admin', {
        adminId,
        tenantId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * ============================================================
   * Obtiene historial de cambios automáticos de un pedido
   * ============================================================
   *
   * Retorna última auditoría de cambios de estado que fueron
   * generados automáticamente por el trigger.
   *
   * @param {number} pedidoId - ID del pedido
   * @param {number} tenantId - ID del tenant
   * @param {number} limit - Máximo de registros (default 50)
   * @returns {Promise<Array>} Array de cambios registrados
   *
   * Ejemplo:
   * const historial = await PedidoEstadoSincronizadorService
   *   .obtenerHistorialCambios(1234, 1);
   * // Cada item: {
   * //   cambio_id,
   * //   estado_anterior,
   * //   estado_nuevo,
   * //   razon,
   * //   disparador, // STOCK_INSERT, STOCK_UPDATE, STOCK_DELETE
   * //   creado_at
   * // }
   */
  static async obtenerHistorialCambios(pedidoId, tenantId, limit = 50) {
    try {
      logger.info('[PedidoEstadoSync] Obteniendo historial de cambios', {
        pedidoId,
        tenantId,
        limit
      });

      const result = await db.query(`
        SELECT
          cambio_id,
          estado_anterior,
          estado_nuevo,
          razon,
          disparador,
          cantidad_stock_anterior,
          cantidad_stock_nuevo,
          admin_id,
          variante_id,
          created_at
        FROM estado_cambios_automaticos
        WHERE
          pedido_id = $1
          AND tenant_id = $2
        ORDER BY created_at DESC
        LIMIT $3
      `, [pedidoId, tenantId, limit]);

      logger.info('[PedidoEstadoSync] Historial obtenido', {
        pedidoId,
        totalRegistros: result.rows.length
      });

      return result.rows;
    } catch (error) {
      logger.error('[PedidoEstadoSync] Error obteniendo historial', {
        pedidoId,
        tenantId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * ============================================================
   * Obtiene estadísticas agreras de cambios automáticos
   * ============================================================
   *
   * Análisis por período, disparador, admin, etc.
   * Útil para:
   * - Monitoreo de salud del sistema
   * - Debugging de anomalías
   * - Dashboards y reporting
   *
   * @param {number} tenantId - ID del tenant
   * @param {string} periodo - 'hora', 'dia', 'semana' (default: 'dia')
   * @returns {Promise<Object>} Estadísticas agregadas
   */
  static async obtenerEstadisticasCambios(tenantId, periodo = 'dia') {
    try {
      logger.info('[PedidoEstadoSync] Calculando estadísticas de cambios', {
        tenantId,
        periodo
      });

      // Mapear período a intervalo SQL
      const intervalMap = {
        'hora': '1 hour',
        'dia': '1 day',
        'semana': '1 week',
        'mes': '1 month'
      };

      const interval = intervalMap[periodo] || '1 day';

      // Query agregada
      const result = await db.query(`
        SELECT
          DATE_TRUNC('${interval.split(' ')[0].toLowerCase()}', created_at) as periodo,
          COUNT(*) as total_cambios,
          COUNT(DISTINCT pedido_id) as pedidos_unicos,
          COUNT(DISTINCT admin_id) as admins_unicos,
          COUNT(DISTINCT disparador) as tipos_disparadores,
          STRING_AGG(DISTINCT disparador, ', ' ORDER BY disparador) as disparadores,
          COUNT(CASE WHEN estado_nuevo = 'COMPLETO' THEN 1 END) as cambios_a_completo,
          COUNT(CASE WHEN estado_nuevo = 'BAJO_PEDIDO' THEN 1 END) as cambios_a_bajo_pedido,
          COUNT(CASE WHEN estado_nuevo = 'COMBINADO' THEN 1 END) as cambios_a_combinado
        FROM estado_cambios_automaticos
        WHERE tenant_id = $1
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('${interval.split(' ')[0].toLowerCase()}', created_at)
        ORDER BY periodo DESC
        LIMIT 30
      `, [tenantId]);

      logger.info('[PedidoEstadoSync] Estadísticas calculadas', {
        tenantId,
        registros: result.rows.length
      });

      return {
        periodo,
        estadisticas: result.rows,
        resumen: {
          totalCambios: result.rows.reduce((sum, row) => sum + parseInt(row.total_cambios), 0),
          pedidosUnicos: result.rows.reduce((sum, row) => sum + parseInt(row.pedidos_unicos), 0),
          adminsUnicos: result.rows.reduce((sum, row) => sum + parseInt(row.admins_unicos), 0)
        }
      };
    } catch (error) {
      logger.error('[PedidoEstadoSync] Error calculando estadísticas', {
        tenantId,
        period,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * ============================================================
   * Obtiene cambios de un disparador específico
   * ============================================================
   *
   * Filtra cambios por tipo de operación en stock_admin
   * (INSERT, UPDATE, DELETE)
   *
   * @param {string} disparador - STOCK_INSERT, STOCK_UPDATE, o STOCK_DELETE
   * @param {number} tenantId - ID del tenant
   * @param {number} limit - Máximo de registros (default 100)
   * @returns {Promise<Array>} Cambios del disparador especificado
   */
  static async obtenerCambiosPorDisparador(disparador, tenantId, limit = 100) {
    try {
      // Validar disparador
      const disparadoresValidos = ['STOCK_INSERT', 'STOCK_UPDATE', 'STOCK_DELETE'];
      if (!disparadoresValidos.includes(disparador)) {
        throw new Error(`Disparador inválido: ${disparador}`);
      }

      logger.info('[PedidoEstadoSync] Obteniendo cambios por disparador', {
        disparador,
        tenantId,
        limit
      });

      const result = await db.query(`
        SELECT
          cambio_id,
          pedido_id,
          admin_id,
          variante_id,
          estado_anterior,
          estado_nuevo,
          disparador,
          created_at
        FROM estado_cambios_automaticos
        WHERE
          disparador = $1
          AND tenant_id = $2
        ORDER BY created_at DESC
        LIMIT $3
      `, [disparador, tenantId, limit]);

      logger.info('[PedidoEstadoSync] Cambios obtenidos', {
        disparador,
        totalRegistros: result.rows.length
      });

      return result.rows;
    } catch (error) {
      logger.error('[PedidoEstadoSync] Error obteniendo cambios por disparador', {
        disparador,
        tenantId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * ============================================================
   * Limpieza de auditoría antigüa (OPCIONAL)
   * ============================================================
   *
   * Elimina registros de cambios más antiguos que X días
   * para evitar crecimiento ilimitado de la tabla.
   *
   * ADVERTENCIA: Operación destructiva, usar con cuidado
   *
   * @param {number} diasRetention - Cuántos días retener (default: 90)
   * @param {number} tenantId - ID del tenant (si NULL: TODOS los tenants)
   * @returns {Promise<Object>} { registrosEliminados, fechaCorte }
   */
  static async limpiarAuditoriaAntigua(diasRetention = 90, tenantId = null) {
    try {
      logger.warn('[PedidoEstadoSync] Iniciando limpieza de auditoría antigua', {
        diasRetention,
        tenantId
      });

      let query = `
        DELETE FROM estado_cambios_automaticos
        WHERE created_at < NOW() - INTERVAL '${diasRetention} days'
      `;

      let params = [];

      if (tenantId) {
        query += ` AND tenant_id = $1`;
        params.push(tenantId);
      }

      query += ` RETURNING cambio_id`;

      const result = await db.query(query, params);

      logger.info('[PedidoEstadoSync] Limpieza completada', {
        registrosEliminados: result.rows.length,
        diasRetention,
        tenantId
      });

      return {
        registrosEliminados: result.rows.length,
        fechaCorte: new Date(Date.now() - diasRetention * 24 * 60 * 60 * 1000)
      };
    } catch (error) {
      logger.error('[PedidoEstadoSync] Error limpiando auditoría', {
        diasRetention,
        tenantId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = PedidoEstadoSincronizadorService;
