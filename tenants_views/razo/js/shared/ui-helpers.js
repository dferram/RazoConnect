/**
 * ui-helpers.js
 * Utilidades de UI para el panel de administración.
 * Requiere SweetAlert2 (Swal) disponible globalmente.
 */

const UI = (() => {

  // =============================================
  // MANEJO DE BOTONES CON ESTADO DE CARGA
  // =============================================

  /**
   * Pone un botón en estado de carga (spinner + deshabilitado)
   * @param {HTMLButtonElement} btn - El botón
   * @param {string} loadingText - Texto mientras carga (ej: "Guardando...")
   * @returns {Function} - Función para restaurar el botón
   */
  const setButtonLoading = (btn, loadingText = 'Procesando...') => {
    const originalText = btn.innerHTML;
    const originalDisabled = btn.disabled;

    btn.disabled = true;
    btn.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"
            style="width:1em;height:1em;border-width:2px;display:inline-block;
                   border:2px solid currentColor;border-right-color:transparent;
                   border-radius:50%;animation:spin 0.75s linear infinite;"></span>
      ${loadingText}
    `;

    // Agregar keyframe si no existe
    if (!document.getElementById('spin-keyframe')) {
      const style = document.createElement('style');
      style.id = 'spin-keyframe';
      style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }

    // Retornar función de restauración
    return () => {
      btn.disabled = originalDisabled;
      btn.innerHTML = originalText;
    };
  };

  /**
   * Deshabilita todos los inputs y selects de un formulario
   * @param {HTMLFormElement} form
   * @returns {Function} - Función para rehabilitar
   */
  const disableForm = (form) => {
    const elements = form.querySelectorAll('input, select, textarea, button');
    elements.forEach(el => el.setAttribute('data-was-disabled', el.disabled));
    elements.forEach(el => { el.disabled = true; });

    return () => {
      elements.forEach(el => {
        el.disabled = el.getAttribute('data-was-disabled') === 'true';
        el.removeAttribute('data-was-disabled');
      });
    };
  };

  // =============================================
  // ALERTAS CONSISTENTES CON SWEETALERT2
  // =============================================

  /**
   * Alerta de éxito
   */
  const success = (title, text = '') => {
    if (typeof Swal === 'undefined') { alert(title); return; }
    return Swal.fire({
      icon: 'success',
      title,
      text,
      confirmButtonColor: '#f97316',
      timer: text ? undefined : 2500,
      timerProgressBar: !text,
    });
  };

  /**
   * Alerta de error
   */
  const error = (title, text = '') => {
    if (typeof Swal === 'undefined') { alert(`Error: ${title}`); return; }
    return Swal.fire({
      icon: 'error',
      title,
      text,
      confirmButtonColor: '#f97316',
    });
  };

  /**
   * Alerta de advertencia
   */
  const warning = (title, text = '') => {
    if (typeof Swal === 'undefined') { alert(`Advertencia: ${title}`); return; }
    return Swal.fire({
      icon: 'warning',
      title,
      text,
      confirmButtonColor: '#f97316',
    });
  };

  /**
   * Diálogo de confirmación
   * @returns {Promise<boolean>}
   */
  const confirm = async (title, text = '¿Estás seguro?', confirmText = 'Sí, continuar') => {
    if (typeof Swal === 'undefined') { return window.confirm(title); }
    const result = await Swal.fire({
      icon: 'question',
      title,
      text,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#f97316',
      cancelButtonColor: '#6b7280',
    });
    return result.isConfirmed;
  };

  /**
   * Manejador global de errores de ApiClient
   * Muestra el mensaje apropiado según el status code
   * @param {ApiError|Error} err
   */
  const handleApiError = (err) => {
    if (err.name === 'ApiError') {
      switch (err.status) {
        case 0:
          return error('Sin conexión', err.message);
        case 400:
          return error('Datos inválidos', err.message);
        case 403:
          return error('Sin permisos', err.message || 'No tienes permiso para realizar esta acción.');
        case 404:
          return error('No encontrado', err.message || 'El recurso solicitado no existe.');
        case 408:
          return error('Tiempo agotado', err.message);
        case 409:
          return error('Conflicto', err.message);
        case 422:
          return error('Error de validación', err.message);
        case 500:
        default:
          return error('Error del servidor', 'Ocurrió un error interno. Intenta de nuevo en unos momentos.');
      }
    }
    // Error inesperado (no ApiError)
    console.error('Error inesperado:', err);
    return error('Error inesperado', 'Algo salió mal. Por favor recarga la página.');
  };

  /**
   * Toast de notificación (no bloquea la UI)
   */
  const toast = (title, icon = 'success') => {
    if (typeof Swal === 'undefined') return;
    Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
    }).fire({ icon, title });
  };

  return {
    setButtonLoading,
    disableForm,
    success,
    error,
    warning,
    confirm,
    handleApiError,
    toast,
  };
})();
