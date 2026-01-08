/**
 * Formateadores de fecha seguros para RazoConnect
 * Maneja correctamente valores null, undefined y fechas inválidas
 */

/**
 * Formatea una fecha de forma segura
 * @param {string|Date|null|undefined} value - Valor de fecha
 * @param {Intl.DateTimeFormatOptions} options - Opciones de formato
 * @returns {string} Fecha formateada o "—" si es inválida
 */
function formatDateSafe(value, options = {}) {
  if (!value || value === null || value === undefined) {
    return "—";
  }

  const date = new Date(value);
  
  if (Number.isNaN(date.getTime()) || !isFinite(date.getTime())) {
    return "—";
  }

  const defaultOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  };

  try {
    return date.toLocaleDateString("es-MX", defaultOptions);
  } catch (error) {
    console.error("Error formateando fecha:", error);
    return "—";
  }
}

/**
 * Formatea fecha con día de la semana
 */
function formatDateLong(value) {
  return formatDateSafe(value, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Formatea fecha corta (solo mes y día)
 */
function formatDateShort(value) {
  return formatDateSafe(value, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Formatea fecha con hora
 */
function formatDateTime(value) {
  return formatDateSafe(value, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Alias para mantener compatibilidad con código existente
 */
function formatDate(value) {
  return formatDateSafe(value);
}

function formatDateToMX(value) {
  return formatDateSafe(value);
}
