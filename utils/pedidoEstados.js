/**
 * Constantes y utilidades para estados de pedidos
 * @module utils/pedidoEstados
 */

// Definición centralizada de estados de pedidos
const ESTADOS_PEDIDO = {
  PENDIENTE: 'Pendiente',
  LISTO_PARA_SURTIR: 'Listo para Surtir',
  REVISION_ALMACEN: 'Revisión de Almacén',
  PENDIENTE_CONFIRMACION: 'Pendiente de Confirmación',
  PARCIALMENTE_SURTIDO: 'Parcialmente Surtido',
  SURTIDO: 'Surtido',
  LISTO_PARA_PAGO: 'Listo para Pago',
  ENVIADO: 'Enviado',
  ENTREGADO: 'Entregado',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado'
};

// Alias para mantener compatibilidad con código legacy
const ESTADOS_LEGACY = {
  'Parcial': ESTADOS_PEDIDO.PARCIALMENTE_SURTIDO,
  'Confirmado': ESTADOS_PEDIDO.LISTO_PARA_SURTIR,
  'Aprobado': ESTADOS_PEDIDO.LISTO_PARA_SURTIR
};

/**
 * Normaliza un estado de pedido a su forma canónica
 * @param {string} estado - Estado a normalizar
 * @returns {string} - Estado normalizado
 */
function normalizarEstado(estado) {
  if (!estado) return ESTADOS_PEDIDO.PENDIENTE;
  
  const estadoTrimmed = estado.toString().trim();
  
  // Buscar en estados legacy
  if (ESTADOS_LEGACY[estadoTrimmed]) {
    return ESTADOS_LEGACY[estadoTrimmed];
  }
  
  // Buscar en estados principales (case-insensitive)
  const estadoUpper = estadoTrimmed.toUpperCase().replace(/\s+/g, '_');
  for (const [key, value] of Object.entries(ESTADOS_PEDIDO)) {
    if (key === estadoUpper || value.toUpperCase() === estadoTrimmed.toUpperCase()) {
      return value;
    }
  }
  
  // Si no se encuentra, retornar el original
  return estadoTrimmed;
}

/**
 * Verifica si un estado es válido
 * @param {string} estado - Estado a verificar
 * @returns {boolean} - true si es válido
 */
function esEstadoValido(estado) {
  if (!estado) return false;
  
  const estadoNormalizado = normalizarEstado(estado);
  return Object.values(ESTADOS_PEDIDO).includes(estadoNormalizado);
}

/**
 * Obtiene todos los estados válidos
 * @returns {Array<string>} - Array de estados válidos
 */
function obtenerEstadosValidos() {
  return Object.values(ESTADOS_PEDIDO);
}

/**
 * Compara dos estados (case-insensitive, normalizado)
 * @param {string} estado1 
 * @param {string} estado2 
 * @returns {boolean}
 */
function sonEstadosIguales(estado1, estado2) {
  return normalizarEstado(estado1) === normalizarEstado(estado2);
}

module.exports = {
  ESTADOS_PEDIDO,
  ESTADOS_LEGACY,
  normalizarEstado,
  esEstadoValido,
  obtenerEstadosValidos,
  sonEstadosIguales
};
