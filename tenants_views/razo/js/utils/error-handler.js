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
        
        // Interceptar errores HTTP y redirigir a páginas de error
        if (response.status === 401) {
          this.handle401Error(args[0]);
          return response;
        }

        if (response.status === 403) {
          this.handle403Error(args[0]);
          return response;
        }

        if (response.status === 429) {
          this.handle429Error(args[0]);
          return response;
        }

        if (response.status === 500) {
          this.handle500Error(args[0]);
          return response;
        }

        if (response.status === 503) {
          this.handle503Error(args[0]);
          return response;
        }

        return response;
      } catch (error) {
        console.error('Error en fetch:', error);
        throw error;
      }
    };
  }

  /**
   * Maneja errores 401 (Unauthorized)
   * @param {string} url - URL de la petición
   */
  handle401Error(url) {
    console.warn('⚠️ [401] Token inválido o expirado');
    
    // Limpiar permisos en caché
    if (window.PermissionsManager) {
      window.PermissionsManager.clearPermissions();
    }
    
    // Limpiar localStorage
    localStorage.removeItem('razoconnect_admin');
    localStorage.removeItem('razoconnect_agente');
    localStorage.removeItem('razoconnect_cliente');
    localStorage.removeItem('razoconnect_permissions');
    
    // Redirigir a página de error 401
    setTimeout(() => {
      window.location.href = '/401.html';
    }, 100);
  }

  /**
   * Maneja errores 403 (Forbidden)
   * @param {string} url - URL de la petición
   */
  handle403Error(url) {
    console.warn('⚠️ [403] Acceso denegado a:', url);
    
    // Redirigir a página de error 403
    setTimeout(() => {
      window.location.href = '/403.html';
    }, 100);
  }

  /**
   * Maneja errores 429 (Too Many Requests)
   * @param {string} url - URL de la petición
   */
  handle429Error(url) {
    console.warn('⚠️ [429] Demasiadas solicitudes a:', url);
    
    // Redirigir a página de error 429
    setTimeout(() => {
      window.location.href = '/429.html';
    }, 100);
  }

  /**
   * Maneja errores 500 (Internal Server Error)
   * @param {string} url - URL de la petición
   */
  handle500Error(url) {
    console.error('❌ [500] Error del servidor en:', url);
    
    // Redirigir a página de error 500
    setTimeout(() => {
      window.location.href = '/500.html';
    }, 100);
  }

  /**
   * Maneja errores 503 (Service Unavailable)
   * @param {string} url - URL de la petición
   */
  handle503Error(url) {
    console.error('❌ [503] Servicio no disponible:', url);
    
    // Redirigir a página de error 503
    setTimeout(() => {
      window.location.href = '/503.html';
    }, 100);
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
      console.warn(`⚠️ [403] Permiso denegado - Módulo: ${modulo}, Acción: ${accion}`);
      
      if (onDenied) {
        onDenied();
      }
      
      // Redirigir a página de error 403
      setTimeout(() => {
        window.location.href = '/403.html';
      }, 100);
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
