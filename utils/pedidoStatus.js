/**
 * Utilidades para calcular el estado de un pedido basado en cantidades surtidas
 * @module utils/pedidoStatus
 */

const { normalizarEstado, ESTADOS_PEDIDO } = require('./pedidoEstados');

/**
 * Calcula el estado de un pedido basado en sus detalles
 * @param {Array} detalles - Array de objetos con cantidad_pedida y cantidad_surtida
 * @returns {string} - Estado normalizado del pedido usando ESTADOS_PEDIDO
 */
function calcularEstadoPedido(detalles = []) {
  if (!detalles || detalles.length === 0) return ESTADOS_PEDIDO.PENDIENTE;
  
  const allSurtido = detalles.every(d => {
    const surtida = Number(d.cantidad_surtida || d.cantidadsurtida || 0);
    const pedida = Number(d.cantidad_pedida || d.cantidadpaquetes || 0);
    return surtida >= pedida;
  });
  
  const anySurtido = detalles.some(d => {
    const surtida = Number(d.cantidad_surtida || d.cantidadsurtida || 0);
    return surtida > 0;
  });
  
  if (allSurtido) return ESTADOS_PEDIDO.SURTIDO;
  if (anySurtido) return ESTADOS_PEDIDO.PARCIALMENTE_SURTIDO;
  return ESTADOS_PEDIDO.PENDIENTE;
}

/**
 * Obtiene los detalles de un pedido con cantidades
 * @param {Object} client - Cliente de base de datos
 * @param {number} pedidoId - ID del pedido
 * @param {number} tenantId - ID del tenant
 * @returns {Promise<Array>} - Array de detalles del pedido
 */
async function getDetallesPedido(client, pedidoId, tenantId) {
  const result = await client.query(
    `SELECT 
      detalleid,
      cantidadpaquetes as cantidad_pedida,
      COALESCE(cantidadsurtida, 0) as cantidad_surtida
    FROM detallesdelpedido
    WHERE pedidoid = $1 AND tenant_id = $2`,
    [pedidoId, tenantId]
  );
  
  return result.rows;
}

/**
 * Actualiza el estado de un pedido en la base de datos
 * @param {Object} client - Cliente de base de datos
 * @param {number} pedidoId - ID del pedido
 * @param {string} nuevoEstado - Nuevo estado del pedido
 * @param {number} tenantId - ID del tenant
 * @returns {Promise<Object>} - Resultado de la actualización
 */
async function updatePedidoStatus(client, pedidoId, nuevoEstado, tenantId) {
  const result = await client.query(
    `UPDATE pedidos 
     SET estatus = $1
     WHERE pedidoid = $2 AND tenant_id = $3
     RETURNING *`,
    [nuevoEstado, pedidoId, tenantId]
  );
  
  return result.rows[0];
}

module.exports = {
  calcularEstadoPedido,
  getDetallesPedido,
  updatePedidoStatus
};
