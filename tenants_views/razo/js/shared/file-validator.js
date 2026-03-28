/**
 * VALIDADOR DE ARCHIVOS PARA UPLOADS
 * 
 * Utilidad compartida para validar tamaños y formatos de archivos
 * antes de subirlos al servidor. Sincronizado con límites del backend.
 */

const FILE_UPLOAD_LIMITS = {
  PRODUCT_IMAGES: {
    maxSizeMB: 5,
    maxSizeBytes: 5 * 1024 * 1024,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
    message: 'Tamaño máximo: 5MB por imagen. Formatos: JPG, PNG, WEBP, HEIC'
  },
  CATEGORY_IMAGES: {
    maxSizeMB: 3,
    maxSizeBytes: 3 * 1024 * 1024,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
    message: 'Tamaño máximo: 3MB por imagen. Formatos: JPG, PNG, WEBP, HEIC'
  },
  PAYMENT_RECEIPTS: {
    maxSizeMB: 10,
    maxSizeBytes: 10 * 1024 * 1024,
    allowedFormats: ['jpg', 'jpeg', 'png', 'pdf', 'heic', 'heif'],
    message: 'Tamaño máximo: 10MB por archivo. Formatos: JPG, PNG, PDF, HEIC'
  },
  DELIVERY_EVIDENCE: {
    maxSizeMB: 10,
    maxSizeBytes: 10 * 1024 * 1024,
    allowedFormats: ['jpg', 'jpeg', 'png', 'pdf', 'heic', 'heif'],
    message: 'Tamaño máximo: 10MB por archivo. Formatos: JPG, PNG, PDF, HEIC'
  },
  LANDING_IMAGES: {
    maxSizeMB: 5,
    maxSizeBytes: 5 * 1024 * 1024,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
    message: 'Tamaño máximo: 5MB por imagen. Formatos: JPG, PNG, WEBP, HEIC'
  }
};

/**
 * Formatea bytes a formato legible
 * @param {number} bytes - Tamaño en bytes
 * @returns {string} Formato legible (ej: "3.5 MB")
 */
function formatBytes(bytes) {
  // Guard against invalid input
  if (bytes <= 0) return '0 Bytes';
  if (!isFinite(bytes)) return 'Invalid size';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  // Clamp index to valid range
  const clampedIndex = Math.max(0, Math.min(i, sizes.length - 1));
  
  return Math.round((bytes / Math.pow(k, clampedIndex)) * 100) / 100 + ' ' + sizes[clampedIndex];
}

/**
 * Valida un archivo individual
 * @param {File} file - Archivo a validar
 * @param {string} limitType - Tipo de límite (PRODUCT_IMAGES, CATEGORY_IMAGES, etc.)
 * @returns {Object} { valid: boolean, error: string|null, sizeMB: number }
 */
function validateFile(file, limitType) {
  const limits = FILE_UPLOAD_LIMITS[limitType];
  
  if (!limits) {
    return {
      valid: false,
      error: 'Tipo de archivo no reconocido',
      sizeMB: 0
    };
  }

  const fileSizeMB = file.size / (1024 * 1024);

  // Validar tamaño
  if (file.size > limits.maxSizeBytes) {
    return {
      valid: false,
      error: `⚠️ La imagen "${file.name}" excede el límite de ${limits.maxSizeMB}MB\n` +
             `Tamaño actual: ${formatBytes(file.size)}\n` +
             `Por favor, reduce el tamaño antes de subirla.`,
      sizeMB: fileSizeMB
    };
  }

  // Validar formato con mejor detección de extensión
  const dot = file.name.lastIndexOf('.');
  const extension = dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  
  if (!extension) {
    return {
      valid: false,
      error: `⚠️ Archivo sin extensión: "${file.name}"\n` +
             `Formatos permitidos: ${limits.allowedFormats.join(', ').toUpperCase()}`,
      sizeMB: fileSizeMB
    };
  }
  
  if (!limits.allowedFormats.includes(extension)) {
    return {
      valid: false,
      error: `⚠️ Formato no permitido: ${extension.toUpperCase()}\n` +
             `Formatos permitidos: ${limits.allowedFormats.join(', ').toUpperCase()}`,
      sizeMB: fileSizeMB
    };
  }

  return {
    valid: true,
    error: null,
    sizeMB: fileSizeMB
  };
}

/**
 * Valida múltiples archivos
 * @param {FileList|Array} files - Lista de archivos
 * @param {string} limitType - Tipo de límite
 * @returns {Object} { valid: boolean, errors: Array<string>, validFiles: Array<File> }
 */
function validateFiles(files, limitType) {
  const errors = [];
  const validFiles = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = validateFile(file, limitType);
    
    if (result.valid) {
      validFiles.push(file);
    } else {
      errors.push(result.error);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    validFiles: validFiles
  };
}

/**
 * Obtiene el mensaje informativo para un tipo de límite
 * @param {string} limitType - Tipo de límite
 * @returns {string} Mensaje informativo
 */
function getLimitMessage(limitType) {
  const limits = FILE_UPLOAD_LIMITS[limitType];
  return limits ? limits.message : '';
}

/**
 * Muestra un toast de error con SweetAlert2
 * @param {string} message - Mensaje a mostrar
 */
function showFileError(message) {
  if (typeof Swal !== 'undefined') {
    // Convertir newlines a HTML breaks para mejor renderizado
    const htmlMessage = message.replace(/\n/g, '<br>');
    Swal.fire({
      icon: 'error',
      title: 'Error de Validación',
      html: htmlMessage,
      confirmButtonColor: '#F97316',
      timer: 5000
    });
  } else {
    alert(message);
  }
}

/**
 * Crea un elemento de ayuda visual para mostrar límites
 * @param {string} limitType - Tipo de límite
 * @returns {HTMLElement} Elemento DOM con el mensaje
 */
function createLimitHint(limitType) {
  const limits = FILE_UPLOAD_LIMITS[limitType];
  if (!limits) return null;

  const hint = document.createElement('div');
  hint.className = 'file-upload-hint';
  hint.style.cssText = 'font-size: 0.85rem; color: #6b7280; margin-top: 0.5rem; display: flex; align-items: start; gap: 0.5rem;';
  hint.innerHTML = `
    <i class="bi bi-info-circle" style="color: #3b82f6; font-size: 1rem; margin-top: 0.1rem;"></i>
    <span>${limits.message}</span>
  `;
  return hint;
}

// Exponer en window para uso global
if (typeof window !== 'undefined') {
  window.FileValidator = {
    validateFile,
    validateFiles,
    formatBytes,
    getLimitMessage,
    showFileError,
    createLimitHint,
    LIMITS: FILE_UPLOAD_LIMITS
  };
}
