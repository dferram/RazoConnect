/**
 * ============================================================
 * SERVICIO: Sincronización Automática de Estados de Pedidos
 * ============================================================
 * 
 * ⚠️ DESHABILITADO - 2026-05-19
 * 
 * Este servicio dependía de funciones SQL automáticas que causaban
 * problemas de sincronización y transiciones incorrectas de estado.
 * 
 * Las funciones SQL fueron eliminadas y el control de estados ahora
 * se maneja exclusivamente desde el código de aplicación en:
 * - utils/pedidoStatus.js
 * - services/OrderStateEngine.js
 * 
 * @deprecated Use utils/pedidoStatus.js instead
 * @module services/pedidoEstadoSincronizadorService
 * @author RazoConnect Team
 * @date 2026-04-10
 */

const logger = require('../utils/logger');

class PedidoEstadoSincronizadorService {
  /**
   * ⚠️ DESHABILITADO - Este servicio ya no está disponible
   * Use utils/pedidoStatus.recalcularEstadoPedido() en su lugar
   */
  static async recalcularUnPedido(pedidoId, tenantId) {
    logger.warn('PedidoEstadoSincronizadorService.recalcularUnPedido() ha sido deshabilitado', {
      pedidoId,
      tenantId
    });
    throw new Error('PedidoEstadoSincronizadorService ha sido deshabilitado. Use utils/pedidoStatus.recalcularEstadoPedido() en su lugar.');
  }

  static async recalcularPedidosDelAdmin(adminId, tenantId) {
    logger.warn('PedidoEstadoSincronizadorService.recalcularPedidosDelAdmin() ha sido deshabilitado', {
      adminId,
      tenantId
    });
    throw new Error('PedidoEstadoSincronizadorService ha sido deshabilitado. Use utils/pedidoStatus.recalcularEstadoPedido() en su lugar.');
  }

  static async obtenerHistorialCambios(pedidoId, tenantId, limit = 50) {
    logger.warn('PedidoEstadoSincronizadorService.obtenerHistorialCambios() ha sido deshabilitado');
    throw new Error('PedidoEstadoSincronizadorService ha sido deshabilitado.');
  }

  static async obtenerEstadisticasCambios(tenantId, periodo = 'dia') {
    logger.warn('PedidoEstadoSincronizadorService.obtenerEstadisticasCambios() ha sido deshabilitado');
    throw new Error('PedidoEstadoSincronizadorService ha sido deshabilitado.');
  }

  static async obtenerCambiosPorDisparador(disparador, tenantId) {
    logger.warn('PedidoEstadoSincronizadorService.obtenerCambiosPorDisparador() ha sido deshabilitado');
    throw new Error('PedidoEstadoSincronizadorService ha sido deshabilitado.');
  }

  static async limpiarAuditoriaAntigua(diasRetention = 90, tenantId) {
    logger.warn('PedidoEstadoSincronizadorService.limpiarAuditoriaAntigua() ha sido deshabilitado');
    throw new Error('PedidoEstadoSincronizadorService ha sido deshabilitado.');
  }
}

module.exports = PedidoEstadoSincronizadorService;
