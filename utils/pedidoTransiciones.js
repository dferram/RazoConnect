/**
 * Gestión de transiciones de estado para pedidos
 * @module utils/pedidoTransiciones
 */

const { ESTADOS_PEDIDO } = require('./pedidoEstados');

// Matriz de transiciones permitidas
const TRANSICIONES_PERMITIDAS = {
  [ESTADOS_PEDIDO.PENDIENTE]: [
    ESTADOS_PEDIDO.LISTO_PARA_SURTIR,
    ESTADOS_PEDIDO.CANCELADO
  ],
  
  [ESTADOS_PEDIDO.LISTO_PARA_SURTIR]: [
    ESTADOS_PEDIDO.REVISION_ALMACEN,
    ESTADOS_PEDIDO.PENDIENTE_CONFIRMACION,
    ESTADOS_PEDIDO.PARCIALMENTE_SURTIDO,
    ESTADOS_PEDIDO.CANCELADO
  ],
  
  [ESTADOS_PEDIDO.REVISION_ALMACEN]: [
    ESTADOS_PEDIDO.PENDIENTE_CONFIRMACION,
    ESTADOS_PEDIDO.PARCIALMENTE_SURTIDO,
    ESTADOS_PEDIDO.CANCELADO
  ],
  
  [ESTADOS_PEDIDO.PENDIENTE_CONFIRMACION]: [
    ESTADOS_PEDIDO.SURTIDO,
    ESTADOS_PEDIDO.PARCIALMENTE_SURTIDO,
    ESTADOS_PEDIDO.REVISION_ALMACEN,
    ESTADOS_PEDIDO.CANCELADO
  ],
  
  [ESTADOS_PEDIDO.PARCIALMENTE_SURTIDO]: [
    ESTADOS_PEDIDO.SURTIDO,
    ESTADOS_PEDIDO.PENDIENTE_CONFIRMACION,
    ESTADOS_PEDIDO.CANCELADO
  ],
  
  [ESTADOS_PEDIDO.SURTIDO]: [
    ESTADOS_PEDIDO.LISTO_PARA_PAGO,
    ESTADOS_PEDIDO.ENVIADO,
    ESTADOS_PEDIDO.CANCELADO
  ],
  
  [ESTADOS_PEDIDO.LISTO_PARA_PAGO]: [
    ESTADOS_PEDIDO.COMPLETADO,
    ESTADOS_PEDIDO.ENVIADO,
    ESTADOS_PEDIDO.CANCELADO
  ],
  
  [ESTADOS_PEDIDO.ENVIADO]: [
    ESTADOS_PEDIDO.ENTREGADO,
    ESTADOS_PEDIDO.COMPLETADO
  ],
  
  [ESTADOS_PEDIDO.ENTREGADO]: [
    ESTADOS_PEDIDO.COMPLETADO
  ],
  
  [ESTADOS_PEDIDO.COMPLETADO]: [],
  
  [ESTADOS_PEDIDO.CANCELADO]: []
};

/**
 * Valida si una transición de estado es permitida
 * @param {string} estadoActual - Estado actual del pedido
 * @param {string} estadoNuevo - Estado al que se quiere transicionar
 * @returns {boolean} - true si la transición es válida
 */
function validarTransicion(estadoActual, estadoNuevo) {
  if (!estadoActual || !estadoNuevo) {
    return false;
  }
  
  const permitidas = TRANSICIONES_PERMITIDAS[estadoActual] || [];
  return permitidas.includes(estadoNuevo);
}

/**
 * Obtiene los estados permitidos desde un estado actual
 * @param {string} estadoActual - Estado actual del pedido
 * @returns {Array<string>} - Array de estados permitidos
 */
function obtenerTransicionesPermitidas(estadoActual) {
  if (!estadoActual) {
    return [];
  }
  
  return TRANSICIONES_PERMITIDAS[estadoActual] || [];
}

/**
 * Obtiene mensaje de error cuando una transición no es válida
 * @param {string} estadoActual 
 * @param {string} estadoNuevo 
 * @returns {string} - Mensaje de error descriptivo
 */
function obtenerMensajeErrorTransicion(estadoActual, estadoNuevo) {
  // Check if state exists in transitions matrix
  if (!TRANSICIONES_PERMITIDAS.hasOwnProperty(estadoActual)) {
    return `El estado "${estadoActual}" no es un estado válido del pedido.`;
  }
  
  const permitidas = obtenerTransicionesPermitidas(estadoActual);
  
  if (permitidas.length === 0) {
    return `El pedido está en estado "${estadoActual}" que es un estado final. No se permiten más cambios.`;
  }
  
  return `No se puede cambiar de "${estadoActual}" a "${estadoNuevo}". Estados permitidos: ${permitidas.join(', ')}`;
}

/**
 * Verifica si un estado es final (no permite más transiciones)
 * @param {string} estado 
 * @returns {boolean}
 */
function esEstadoFinal(estado) {
  const permitidas = TRANSICIONES_PERMITIDAS[estado] || [];
  return permitidas.length === 0;
}

module.exports = {
  TRANSICIONES_PERMITIDAS,
  validarTransicion,
  obtenerTransicionesPermitidas,
  obtenerMensajeErrorTransicion,
  esEstadoFinal
};
