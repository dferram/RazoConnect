/**
 * Utilidades para calcular totales basados en cantidades surtidas
 * @module utils/calcularTotalSurtido
 */

/**
 * Calcula el total basado en cantidades surtidas
 * @param {Array} detalles - Array de detalles con cantidad_surtida y precio_unitario
 * @returns {number} - Total calculado con 2 decimales
 */
function calcularTotalSurtido(detalles = []) {
  const total = detalles.reduce((sum, d) => {
    const cantidad = Number(d.cantidad_surtida || d.cantidadsurtida || 0);
    const precio = Number(d.precio_unitario || d.preciounitario || d.precioporpaquete || 0);
    return sum + (cantidad * precio);
  }, 0);
  
  return parseFloat(total.toFixed(2));
}

/**
 * Calcula subtotal para un detalle individual
 * @param {number} cantidadSurtida - Cantidad surtida
 * @param {number} precioUnitario - Precio unitario
 * @returns {number} - Subtotal con 2 decimales
 */
function calcularSubtotalSurtido(cantidadSurtida, precioUnitario) {
  const cantidad = Number(cantidadSurtida || 0);
  const precio = Number(precioUnitario || 0);
  return parseFloat((cantidad * precio).toFixed(2));
}

module.exports = {
  calcularTotalSurtido,
  calcularSubtotalSurtido
};
