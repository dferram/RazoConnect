/**
 * @file services/OrderStateEngine.js
 * @description Máquina de estados pura para calcular el estado de pedidos y productos.
 * Principio SRP: NO interactúa con la BD. Solo recibe datos y retorna estados.
 */

class OrderStateEngine {
  /**
   * Calcula el estado a nivel Pedido evaluando sus productos.
   * Regla de negocio: Los productos 'Facturados' ya no influyen en el estado del pedido restante.
   *
   * @param {Array} items - Lista de detalles del pedido.
   * @param {string} items[].estado_producto - 'Con stock' | 'Bajo pedido' | 'Surtido' | 'Facturado'
   * @returns {string} Estado general del pedido
   */
  static calculateOrderState(items) {
    if (!items || items.length === 0) return 'Bajo pedido';

    const totalItems = items.length;

    // 1. Obtener los productos que ya cerraron ciclo (Facturados)
    const facturados = items.filter(i => i.estado_producto === 'Facturado');

    // Si todos los productos de la orden ya fueron facturados, la orden muere aquí.
    if (facturados.length === totalItems) {
      return 'Surtido completo';
    }

    // 2. Aislar los productos restantes (IGNORAR los facturados para el recálculo)
    const activeItems = items.filter(i => i.estado_producto !== 'Facturado');
    const activeTotal = activeItems.length;

    // 3. Regla Vista Inventarios:
    // Si la orden aún tiene vida y al menos UN producto ha sido marcado como 'Surtido'
    const surtidos = activeItems.filter(i => i.estado_producto === 'Surtido');
    if (surtidos.length > 0) {
      return 'Listo para remisionar';
    }

    // 4. Regla Vista Cliente (Dinámica por Stock):
    const conStock = activeItems.filter(i => i.estado_producto === 'Con stock').length;
    const bajoPedido = activeItems.filter(i => i.estado_producto === 'Bajo pedido').length;

    if (bajoPedido === activeTotal) {
      return 'Bajo pedido';
    }

    if (conStock === activeTotal) {
      return 'Completo';
    }

    // Si hay una mezcla entre 'Con stock' y 'Bajo pedido'
    if (conStock > 0 && bajoPedido > 0) {
      return 'Combinado';
    }

    // Fallback de seguridad
    return 'Bajo pedido';
  }

  /**
   * Determina si un producto individual puede transicionar a "Surtido" por Inventarios.
   */
  static canTransitionToSurtido(estadoActual) {
    return estadoActual === 'Con stock';
  }

  /**
   * Determina el estado de un producto al evaluarse dinámicamente contra el stock (FIFO).
   */
  static evaluateProductStockState(estadoActual, cantidadPedida, stockDisponible) {
    // Si Inventarios o Finanzas ya tomaron control del ítem, el stock dinámico ya no lo afecta
    if (['Surtido', 'Facturado'].includes(estadoActual)) {
      return estadoActual;
    }

    return (stockDisponible >= cantidadPedida) ? 'Con stock' : 'Bajo pedido';
  }
}

module.exports = OrderStateEngine;
