/**
 * Constantes y utilidades para estados de pedidos normalizados
 * ESTRUCTURA: 6 Estados + 2 Excepciones
 * @module utils/pedidoEstados
 * @date 2026-04-04
 */

// ==========================================
// NUEVOS ESTADOS NORMALIZADOS (6)
// ==========================================
const ESTADOS_PEDIDO = {
  // Estados de disponibilidad de stock
  BAJO_PEDIDO: 'Bajo pedido',           // Todos backorder
  COMBINADO: 'Combinado',                // Mix backorder + stock
  COMPLETO: 'Completo',                  // Todos con stock
  
  // Estados de surtimiento y confirmación
  LISTO_PARA_REMISIONAR: 'Listo para remisionar', // Confirmado por inventarios, waiting finanzas
  SURTIDO_PARCIAL: 'Surtido parcial',   // Al menos 1 producto surtido/confirmado
  SURTIDO_COMPLETO: 'Surtido completo', // Todo surtido y confirmado
  
  // Estados de transición (legacy, mantenidos para compatibilidad)
  PENDIENTE: 'Pendiente',
  
  // EXCEPCIONES
  CANCELADO: 'Cancelado',                // Final: Cancelación del pedido
  ENTREGADO: 'Entregado'                 // Final: Fin del ciclo → Histórico
};

// ==========================================
// MAPEO DE ESTADOS LEGACY A NUEVOS
// ==========================================
const MAPEO_STATES_LEGACY = {
  'Parcial': ESTADOS_PEDIDO.SURTIDO_PARCIAL,
  'Parcialmente Surtido': ESTADOS_PEDIDO.SURTIDO_PARCIAL,
  'Surtido Parcial': ESTADOS_PEDIDO.SURTIDO_PARCIAL,
  'Confirmado': ESTADOS_PEDIDO.COMPLETO,
  'Aprobado': ESTADOS_PEDIDO.LISTO_PARA_REMISIONAR,
  'Pendiente de confirmación': ESTADOS_PEDIDO.LISTO_PARA_REMISIONAR,
  'Pendiente de confirmacion': ESTADOS_PEDIDO.LISTO_PARA_REMISIONAR,
  'Pendiente Confirmación': ESTADOS_PEDIDO.LISTO_PARA_REMISIONAR,
  'Surtido': ESTADOS_PEDIDO.SURTIDO_COMPLETO,
  'Completado': ESTADOS_PEDIDO.ENTREGADO
};

// Estados que son finales (no pueden cambiar)
const ESTADOS_FINALES = [
  ESTADOS_PEDIDO.CANCELADO,
  ESTADOS_PEDIDO.ENTREGADO
];

// Estados principales normalizados
const ESTADOS_PRINCIPALES = [
  ESTADOS_PEDIDO.BAJO_PEDIDO,
  ESTADOS_PEDIDO.COMBINADO,
  ESTADOS_PEDIDO.COMPLETO,
  ESTADOS_PEDIDO.LISTO_PARA_REMISIONAR,
  ESTADOS_PEDIDO.SURTIDO_PARCIAL,
  ESTADOS_PEDIDO.SURTIDO_COMPLETO
];

/**
 * Normaliza un estado a su forma canónica
 * @param {string} estado - Estado a normalizar
 * @returns {string} - Estado normalizado
 */
function normalizarEstado(estado) {
  if (!estado) return ESTADOS_PEDIDO.PENDIENTE;
  
  const estadoTrimmed = estado.toString().trim();
  const estadoLower = estadoTrimmed.toLowerCase();
  
  // Buscar en mapeo de legacy
  for (const [legacyKey, legacyValue] of Object.entries(MAPEO_STATES_LEGACY)) {
    if (legacyKey.toLowerCase() === estadoLower) {
      console.warn(`[STATUS] Legacy state "${estado}" → "${legacyValue}"`);
      return legacyValue;
    }
  }
  
  // Buscar en estados principales (case-insensitive)
  const estadoUpper = estadoTrimmed.toUpperCase().replace(/\s+/g, '_');
  for (const [key, value] of Object.entries(ESTADOS_PEDIDO)) {
    if (value.toLowerCase() === estadoLower) {
      return value;
    }
  }
  
  console.warn(`[STATUS] Unknown state: "${estado}" → defaulting to PENDIENTE`);
  return ESTADOS_PEDIDO.PENDIENTE;
}

/**
 * Verifica si un estado es válido
 */
function esEstadoValido(estado) {
  if (!estado) return false;
  const estadoNormalizado = normalizarEstado(estado);
  return Object.values(ESTADOS_PEDIDO).includes(estadoNormalizado);
}

/**
 * Verifica si un estado es final (no puede cambiar)
 */
function esEstadoFinal(estado) {
  const normalizado = normalizarEstado(estado);
  return ESTADOS_FINALES.includes(normalizado);
}

/**
 * Obtiene clase CSS para badge de estado
 * Colores: Rojo=Bajo pedido, Verde=Completo/Surtido, Azul=Listo remisionar
 */
function getClassBadgeEstado(estado) {
  const normalizado = normalizarEstado(estado);
  
  const mapa = {
    [ESTADOS_PEDIDO.BAJO_PEDIDO]: 'badge-estado-bajo-pedido',           // 🔴 Rojo
    [ESTADOS_PEDIDO.COMBINADO]: 'badge-estado-combinado',               // 🟠 Naranja
    [ESTADOS_PEDIDO.COMPLETO]: 'badge-estado-completo',                 // 🟡 Amarillo
    [ESTADOS_PEDIDO.LISTO_PARA_REMISIONAR]: 'badge-estado-listo-remisionar', // 🔵 Azul
    [ESTADOS_PEDIDO.SURTIDO_PARCIAL]: 'badge-estado-surtido-parcial',   // 🟠 Naranja
    [ESTADOS_PEDIDO.SURTIDO_COMPLETO]: 'badge-estado-surtido-completo', // 🟢 Verde
    [ESTADOS_PEDIDO.PENDIENTE]: 'badge-estado-pendiente',               // 🟡 Amarillo
    [ESTADOS_PEDIDO.CANCELADO]: 'badge-estado-cancelado',               // 🔴 Rojo
    [ESTADOS_PEDIDO.ENTREGADO]: 'badge-estado-entregado'                // ⚫ Negro/Gris
  };
  
  return mapa[normalizado] || 'badge-secondary';
}

module.exports = {
  ESTADOS_PEDIDO,
  ESTADOS_PRINCIPALES,
  ESTADOS_FINALES,
  MAPEO_STATES_LEGACY,
  normalizarEstado,
  esEstadoValido,
  esEstadoFinal,
  getClassBadgeEstado
};
