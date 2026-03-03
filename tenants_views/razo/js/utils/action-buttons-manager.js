/**
 * ════════════════════════════════════════════════════════════
 * ACTION BUTTONS MANAGER - Gestión de Botones por Permisos
 * ════════════════════════════════════════════════════════════
 * 
 * Muestra/oculta/deshabilita botones de acción según permisos.
 * Se integra con PermissionsManager para verificar acceso.
 */

class ActionButtonsManager {
  constructor() {
    this.initialized = false;
  }

  /**
   * Inicializa el sistema de botones
   * Debe llamarse después de cargar permisos
   */
  async initialize() {
    if (!window.PermissionsManager) {
      console.error('❌ PermissionsManager no está disponible');
      return;
    }

    // Cargar permisos si no están cargados
    if (!window.PermissionsManager.getPermissions()) {
      await window.PermissionsManager.loadPermissions();
    }

    this.initialized = true;
    console.log('✅ ActionButtonsManager inicializado');
  }

  /**
   * Procesa todos los botones con atributos data-permission
   */
  processAllButtons() {
    if (!this.initialized) {
      console.warn('⚠️ ActionButtonsManager no inicializado. Llama a initialize() primero.');
      return;
    }

    // Buscar todos los botones con data-permission-module
    const buttons = document.querySelectorAll('[data-permission-module]');
    
    buttons.forEach(button => {
      const module = button.getAttribute('data-permission-module');
      const action = button.getAttribute('data-permission-action');
      const hideMode = button.getAttribute('data-permission-hide') === 'true';

      if (!module || !action) {
        console.warn('⚠️ Botón sin módulo o acción definida:', button);
        return;
      }

      const hasPermission = window.PermissionsManager.hasPermission(module, action);

      if (hasPermission) {
        // Usuario tiene permiso
        button.disabled = false;
        button.style.display = '';
        button.removeAttribute('title');
      } else {
        // Usuario NO tiene permiso
        if (hideMode) {
          // Ocultar completamente
          button.style.display = 'none';
        } else {
          // Deshabilitar y mostrar tooltip
          button.disabled = true;
          button.title = `No tienes permiso para esta acción (${module}: ${action})`;
          button.style.opacity = '0.5';
          button.style.cursor = 'not-allowed';
        }
      }
    });

    console.log(`✅ Procesados ${buttons.length} botones con permisos`);
  }

  /**
   * Verifica permiso y ejecuta callback
   * @param {string} module - Módulo requerido
   * @param {string} action - Acción requerida
   * @param {Function} callback - Función a ejecutar si tiene permiso
   * @param {Function} onDenied - Función a ejecutar si no tiene permiso
   */
  checkAndExecute(module, action, callback, onDenied = null) {
    if (!this.initialized) {
      console.error('❌ ActionButtonsManager no inicializado');
      return;
    }

    if (window.PermissionsManager.hasPermission(module, action)) {
      callback();
    } else {
      if (window.ErrorHandler) {
        const message = `No tienes permiso para realizar esta acción.\n\nMódulo: ${module}\nAcción: ${action}`;
        window.ErrorHandler.showPermissionDeniedModal(message);
      } else {
        alert(`No tienes permiso para: ${module} - ${action}`);
      }

      if (onDenied) {
        onDenied();
      }
    }
  }

  /**
   * Crea un botón con verificación de permisos
   * @param {Object} config - Configuración del botón
   * @returns {HTMLButtonElement}
   */
  createButton(config) {
    const {
      label,
      module,
      action,
      onClick,
      className = 'btn btn-primary',
      icon = '',
      hideIfNoPermission = false
    } = config;

    const button = document.createElement('button');
    button.className = className;
    button.innerHTML = icon ? `${icon} ${label}` : label;

    // Agregar atributos de permiso
    button.setAttribute('data-permission-module', module);
    button.setAttribute('data-permission-action', action);
    if (hideIfNoPermission) {
      button.setAttribute('data-permission-hide', 'true');
    }

    // Verificar permiso
    const hasPermission = window.PermissionsManager.hasPermission(module, action);

    if (hasPermission) {
      button.addEventListener('click', onClick);
    } else {
      if (hideIfNoPermission) {
        button.style.display = 'none';
      } else {
        button.disabled = true;
        button.title = `No tienes permiso para esta acción (${module}: ${action})`;
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
      }
    }

    return button;
  }

  /**
   * Oculta secciones completas si no tiene permisos
   * @param {string} selector - Selector CSS de la sección
   * @param {string[]} requiredModules - Módulos requeridos (OR logic)
   */
  hideSection(selector, requiredModules) {
    if (!this.initialized) {
      return;
    }

    const section = document.querySelector(selector);
    if (!section) {
      return;
    }

    const hasAccess = window.PermissionsManager.canViewMenuSection(requiredModules);

    if (!hasAccess) {
      section.style.display = 'none';
    }
  }

  /**
   * Muestra mensaje de "sin permisos" en contenedor
   * @param {string|HTMLElement} container - Contenedor
   * @param {string} module - Módulo requerido
   */
  showNoPermissionMessage(container, module) {
    const element = typeof container === 'string' ? document.querySelector(container) : container;
    
    if (!element) {
      return;
    }

    element.innerHTML = `
      <div style="
        max-width: 500px;
        margin: 3rem auto;
        padding: 2rem;
        background: #FEF2F2;
        border-left: 4px solid #EF4444;
        border-radius: 8px;
        text-align: center;
      ">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div>
        <h3 style="color: #991B1B; margin-bottom: 0.5rem;">
          Acceso Restringido
        </h3>
        <p style="color: #7F1D1D; margin-bottom: 1rem;">
          Tu perfil actual no permite ver esta sección.
        </p>
        <p style="color: #991B1B; font-size: 0.9rem;">
          Módulo requerido: <strong>${module}</strong>
        </p>
        <p style="color: #991B1B; font-size: 0.85rem; margin-top: 1rem;">
          Si crees que es un error, consulta con administración.
        </p>
      </div>
    `;
  }

  /**
   * Verifica si puede ver una página completa
   * @param {string[]} requiredModules - Módulos requeridos
   * @param {string} redirectUrl - URL de redirección si no tiene acceso
   */
  checkPageAccess(requiredModules, redirectUrl = '/admin-dashboard.html') {
    if (!this.initialized) {
      console.warn('⚠️ ActionButtonsManager no inicializado');
      return true;
    }

    const hasAccess = window.PermissionsManager.canViewMenuSection(requiredModules);

    if (!hasAccess) {
      console.warn('⚠️ Usuario sin acceso a esta página');
      
      if (window.ErrorHandler) {
        window.ErrorHandler.showInlineError(
          document.body,
          `Tu perfil actual no permite acceder a esta página.<br><br>Módulos requeridos: ${requiredModules.join(', ')}`
        );
      }

      return false;
    }

    return true;
  }

  /**
   * Agrega tooltips informativos a elementos del menú
   * @param {string} selector - Selector de elementos
   */
  addPermissionTooltips(selector = '.admin-nav-link') {
    const links = document.querySelectorAll(selector);
    
    links.forEach(link => {
      const title = link.getAttribute('title');
      if (title && title.startsWith('Requiere:')) {
        // Ya tiene tooltip de permisos
        link.style.position = 'relative';
      }
    });
  }
}

// Crear instancia global
const actionButtonsManager = new ActionButtonsManager();

// Hacer disponible globalmente
if (typeof window !== 'undefined') {
  window.ActionButtonsManager = actionButtonsManager;
}

// Auto-inicializar cuando se cargue la página
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    await actionButtonsManager.initialize();
    actionButtonsManager.processAllButtons();
  });
} else {
  (async () => {
    await actionButtonsManager.initialize();
    actionButtonsManager.processAllButtons();
  })();
}

// Export para módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = actionButtonsManager;
}
