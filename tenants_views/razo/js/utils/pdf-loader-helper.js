/**
 * PDF LOADER HELPER
 * Utilidad para manejar loading indicators en botones de generación de PDF
 * 
 * Uso:
 * ```javascript
 * const button = document.getElementById('btnGenerarPDF');
 * const pdfGenerator = new PDFLoaderHelper(button, generatePDFFunction);
 * button.addEventListener('click', () => pdfGenerator.execute());
 * ```
 */

class PDFLoaderHelper {
  constructor(buttonElement, generatorFunction, options = {}) {
    this.button = buttonElement;
    this.generator = generatorFunction;
    this.originalText = buttonElement?.textContent || 'Generar PDF';
    this.originalHTML = buttonElement?.innerHTML;
    this.isLoading = false;
    
    // Opciones
    this.loadingText = options.loadingText || 'Generando...';
    this.errorMessage = options.errorMessage || 'Error al generar PDF';
    this.onSuccess = options.onSuccess || (() => {});
    this.onError = options.onError || (() => {});
  }

  /**
   * Ejecuta la función de generación con indicador de carga
   */
  async execute() {
    if (this.isLoading) return; // Prevenir múltiples clicks

    try {
      this.setLoading(true);
      const result = await this.generator();
      this.setLoading(false);
      this.onSuccess(result);
      return result;
    } catch (error) {
      this.setLoading(false);
      console.error('Error en PDFLoaderHelper:', error);
      this.onError(error);
      throw error;
    }
  }

  /**
   * Actualiza estado visual del botón
   */
  setLoading(isLoading) {
    this.isLoading = isLoading;
    
    if (!this.button) return;

    if (isLoading) {
      this.button.disabled = true;
      this.button.style.opacity = '0.7';
      
      // Agregar spinner
      this.button.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        <span>${this.loadingText}</span>
      `;
      this.button.classList.add('loading');
    } else {
      this.button.disabled = false;
      this.button.style.opacity = '1';
      
      // Restaurar texto original
      if (this.originalHTML) {
        this.button.innerHTML = this.originalHTML;
      } else {
        this.button.textContent = this.originalText;
      }
      this.button.classList.remove('loading');
    }
  }

  /**
   * Cancela la operación manualmente
   */
  cancel() {
    this.setLoading(false);
  }
}

/**
 * MODO SIMPLIFICADO
 * Para casos simples donde solo necesitas agregar el indicador
 */
function setupPDFButton(buttonId, generatorFunction, options = {}) {
  const button = document.getElementById(buttonId);
  if (!button) {
    console.warn(`Botón con ID "${buttonId}" no encontrado`);
    return null;
  }

  const helper = new PDFLoaderHelper(button, generatorFunction, options);
  button.addEventListener('click', () => helper.execute());
  return helper;
}

// Hacer disponible globalmente
if (typeof window !== 'undefined') {
  window.PDFLoaderHelper = PDFLoaderHelper;
  window.setupPDFButton = setupPDFButton;
}
