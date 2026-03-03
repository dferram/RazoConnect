/**
 * ════════════════════════════════════════════════════════════
 * ERROR HANDLER - Manejo Global de Errores de Permisos
 * ════════════════════════════════════════════════════════════
 * 
 * Intercepta errores 403 y muestra mensajes contextuales al usuario.
 * Se integra con SweetAlert2 para mostrar modales elegantes.
 */

class ErrorHandler {
  constructor() {
    this.setupGlobalErrorHandling();
  }

  /**
   * Configura manejo global de errores fetch
   */
  setupGlobalErrorHandling() {
    // Interceptar fetch global
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        
        // Interceptar 403
        if (response.status === 403) {
          const clonedResponse = response.clone();
          try {
            const data = await clonedResponse.json();
            this.handle403Error(data, args[0]);
          } catch (e) {
            this.handle403Error({ message: 'No tienes permiso para realizar esta acción' }, args[0]);
          }
        }

        // Interceptar 401
        if (response.status === 401) {
          this.handle401Error(args[0]);
        }

        return response;
      } catch (error) {
        console.error('Error en fetch:', error);
        throw error;
      }
    };
  }

  /**
   * Maneja errores 403 (Forbidden)
   * @param {Object} data - Datos de respuesta del servidor
   * @param {string} url - URL de la petición
   */
  handle403Error(data, url) {
    const modulo = this.extractModuleFromUrl(url);
    const accion = this.extractActionFromUrl(url);

    let message = data.message || 'No tienes permiso para realizar esta acción.';
    
    // Agregar contexto si está disponible
    if (modulo || accion) {
      message += `\n\n`;
      if (modulo) message += `Módulo: ${modulo}\n`;
      if (accion) message += `Acción: ${accion}`;
    }

    message += `\n\nSi crees que deberías tener acceso, contacta a tu supervisor o al equipo de soporte.`;

    this.showPermissionDeniedModal(message);
  }

  /**
   * Maneja errores 401 (Unauthorized)
   * @param {string} url - URL de la petición
   */
  handle401Error(url) {
    // No redirigir automáticamente, solo mostrar mensaje
    console.warn('⚠️ Token inválido o expirado');
    
    // Limpiar permisos en caché
    if (window.PermissionsManager) {
      window.PermissionsManager.clearPermissions();
    }
  }

  /**
   * Muestra modal de permiso denegado
   * @param {string} message - Mensaje a mostrar
   */
  showPermissionDeniedModal(message) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'error',
        title: 'Acceso Denegado',
        html: message.replace(/\n/g, '<br>'),
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#F97316',
        customClass: {
          popup: 'permission-denied-modal'
        }
      });
    } else {
      // Fallback si SweetAlert2 no está disponible
      alert(message);
    }
  }

  /**
   * Muestra mensaje de error en página (no modal)
   * @param {string} container - Selector del contenedor
   * @param {string} message - Mensaje de error
   */
  showInlineError(container, message) {
    const element = typeof container === 'string' ? document.querySelector(container) : container;
    
    if (!element) {
      console.error('Contenedor no encontrado:', container);
      return;
    }

    element.innerHTML = `
      <div style="
        max-width: 600px;
        margin: 4rem auto;
        padding: 2rem;
        background: #FEF2F2;
        border-left: 4px solid #EF4444;
        border-radius: 8px;
        text-align: center;
      ">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🚫</div>
        <h2 style="color: #991B1B; margin-bottom: 1rem; font-size: 1.5rem;">
          Acceso Denegado
        </h2>
        <p style="color: #7F1D1D; line-height: 1.6; margin-bottom: 1.5rem;">
          ${message}
        </p>
        <p style="color: #991B1B; font-size: 0.9rem;">
          Si crees que deberías tener acceso, consulta con tu supervisor o el equipo de soporte.
        </p>
        <button 
          onclick="window.history.back()" 
          style="
            margin-top: 1.5rem;
            padding: 0.75rem 2rem;
            background: #F97316;
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            font-size: 1rem;
          "
        >
          Volver
        </button>
      </div>
    `;
  }

  /**
   * Extrae el módulo de la URL
   * @param {string} url - URL de la petición
   * @returns {string|null}
   */
  extractModuleFromUrl(url) {
    const modulePatterns = {
      '/api/admin/pedidos': 'Ventas',
      '/api/admin/clientes': 'Clientes',
      '/api/admin/agentes': 'Agentes',
      '/api/admin/comisiones': 'Comisiones',
      '/api/admin/productos': 'Productos',
      '/api/admin/inventario': 'Inventario',
      '/api/admin/ordenes-compra': 'Compras',
      '/api/admin/proveedores': 'Proveedores',
      '/api/admin/cxc': 'Cuentas por Cobrar',
      '/api/admin/cxp': 'Cuentas por Pagar',
      '/api/admin/creditos': 'Créditos',
      '/api/admin/cupones': 'Cupones',
      '/api/admin/reportes': 'Reportes',
      '/api/creditos': 'Créditos',
      '/api/reportes': 'Reportes',
      '/api/inventario': 'Inventario',
      '/api/compras': 'Compras'
    };

    for (const [pattern, module] of Object.entries(modulePatterns)) {
      if (url.includes(pattern)) {
        return module;
      }
    }

    return null;
  }

  /**
   * Extrae la acción de la URL y método HTTP
   * @param {string} url - URL de la petición
   * @returns {string|null}
   */
  extractActionFromUrl(url) {
    if (url.includes('/crear') || url.includes('POST')) return 'Crear';
    if (url.includes('/editar') || url.includes('PUT')) return 'Editar';
    if (url.includes('/eliminar') || url.includes('DELETE')) return 'Eliminar';
    if (url.includes('/aprobar')) return 'Aprobar';
    if (url.includes('/pagar')) return 'Registrar Pago';
    if (url.includes('/exportar')) return 'Exportar';
    
    return null;
  }

  /**
   * Verifica permisos antes de ejecutar una acción
   * @param {string} modulo - Módulo requerido
   * @param {string} accion - Acción requerida
   * @param {Function} callback - Función a ejecutar si tiene permiso
   * @param {Function} onDenied - Función a ejecutar si no tiene permiso (opcional)
   */
  async checkPermissionAndExecute(modulo, accion, callback, onDenied = null) {
    if (!window.PermissionsManager) {
      console.error('PermissionsManager no está disponible');
      return;
    }

    // Cargar permisos si no están cargados
    if (!window.PermissionsManager.getPermissions()) {
      await window.PermissionsManager.loadPermissions();
    }

    if (window.PermissionsManager.hasPermission(modulo, accion)) {
      callback();
    } else {
      const message = `No tienes permiso para realizar esta acción.\n\nMódulo: ${modulo}\nAcción: ${accion}`;
      this.showPermissionDeniedModal(message);
      
      if (onDenied) {
        onDenied();
      }
    }
  }
}

// Crear instancia global
const errorHandler = new ErrorHandler();

// Hacer disponible globalmente
if (typeof window !== 'undefined') {
  window.ErrorHandler = errorHandler;
}

// Export para módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = errorHandler;
}
