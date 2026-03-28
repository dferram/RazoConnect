/**
 * CONFIGURACIÓN CENTRALIZADA DE LÍMITES DE CARGA
 * 
 * Define los límites de tamaño para diferentes tipos de archivos
 * y proporciona mensajes consistentes para el usuario.
 * 
 * IMPORTANTE: Actualizar estos valores afectará tanto backend como frontend
 */

const UPLOAD_LIMITS = {
  // Imágenes de productos (incluye HEIC de iOS que pueden ser grandes)
  PRODUCT_IMAGES: {
    maxSizeMB: 5,
    maxSizeBytes: 5 * 1024 * 1024,
    description: 'Imágenes de productos',
    allowedFormats: ['JPG', 'PNG', 'WEBP', 'HEIC'],
    message: 'Tamaño máximo: 5MB por imagen. Formatos: JPG, PNG, WEBP, HEIC'
  },

  // Imágenes de categorías
  CATEGORY_IMAGES: {
    maxSizeMB: 3,
    maxSizeBytes: 3 * 1024 * 1024,
    description: 'Imágenes de categorías',
    allowedFormats: ['JPG', 'PNG', 'WEBP', 'HEIC'],
    message: 'Tamaño máximo: 3MB por imagen. Formatos: JPG, PNG, WEBP, HEIC'
  },

  // Comprobantes de pago (pueden ser PDFs)
  PAYMENT_RECEIPTS: {
    maxSizeMB: 10,
    maxSizeBytes: 10 * 1024 * 1024,
    description: 'Comprobantes de pago',
    allowedFormats: ['JPG', 'PNG', 'PDF', 'HEIC'],
    message: 'Tamaño máximo: 10MB por archivo. Formatos: JPG, PNG, PDF, HEIC'
  },

  // Evidencias de entrega
  DELIVERY_EVIDENCE: {
    maxSizeMB: 10,
    maxSizeBytes: 10 * 1024 * 1024,
    description: 'Evidencias de entrega',
    allowedFormats: ['JPG', 'PNG', 'PDF', 'HEIC'],
    message: 'Tamaño máximo: 10MB por archivo. Formatos: JPG, PNG, PDF, HEIC'
  },

  // Imágenes de landing page
  LANDING_IMAGES: {
    maxSizeMB: 5,
    maxSizeBytes: 5 * 1024 * 1024,
    description: 'Imágenes de landing page',
    allowedFormats: ['JPG', 'PNG', 'WEBP', 'HEIC'],
    message: 'Tamaño máximo: 5MB por imagen. Formatos: JPG, PNG, WEBP, HEIC'
  }
};

/**
 * Genera mensaje de error personalizado cuando se excede el límite
 * @param {string} limitType - Tipo de límite (PRODUCT_IMAGES, CATEGORY_IMAGES, etc.)
 * @param {number} fileSizeMB - Tamaño del archivo en MB
 * @returns {string} Mensaje de error formateado
 */
function getOversizeErrorMessage(limitType, fileSizeMB) {
  const limit = UPLOAD_LIMITS[limitType];
  if (!limit) {
    return `El archivo es demasiado grande. Tamaño: ${fileSizeMB.toFixed(2)}MB`;
  }
  
  return `⚠️ ${limit.description}: El archivo excede el límite permitido.\n` +
         `Tamaño del archivo: ${fileSizeMB.toFixed(2)}MB\n` +
         `Límite máximo: ${limit.maxSizeMB}MB\n` +
         `Por favor, reduce el tamaño de la imagen o usa un formato más comprimido.`;
}

/**
 * Valida si un tamaño de archivo está dentro del límite
 * @param {number} fileSizeBytes - Tamaño del archivo en bytes
 * @param {string} limitType - Tipo de límite
 * @returns {boolean} true si está dentro del límite
 */
function isWithinLimit(fileSizeBytes, limitType) {
  const limit = UPLOAD_LIMITS[limitType];
  if (!limit) return false;
  return fileSizeBytes <= limit.maxSizeBytes;
}

/**
 * Formatea bytes a MB legible
 * @param {number} bytes - Tamaño en bytes
 * @returns {string} Formato legible (ej: "3.5 MB")
 */
function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

module.exports = {
  UPLOAD_LIMITS,
  getOversizeErrorMessage,
  isWithinLimit,
  formatBytes
};
