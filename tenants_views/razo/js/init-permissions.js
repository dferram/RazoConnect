/**
 * ════════════════════════════════════════════════════════════
 * INIT PERMISSIONS - Inicialización del Sistema de Permisos
 * ════════════════════════════════════════════════════════════
 * 
 * Carga e inicializa todos los módulos del sistema de permisos
 * en el orden correcto. Debe incluirse en TODAS las páginas admin/agente.
 * 
 * Uso:
 * <script src="/js/utils/permissions-manager.js"></script>
 * <script src="/js/utils/error-handler.js"></script>
 * <script src="/js/utils/action-buttons-manager.js"></script>
 * <script src="/js/init-permissions.js"></script>
 */

(async function() {
  'use strict';

  console.log('🚀 Inicializando sistema de permisos...');

  // Verificar que los módulos estén cargados
  if (!window.PermissionsManager) {
    console.error('❌ PermissionsManager no está disponible. Asegúrate de incluir permissions-manager.js');
    return;
  }

  if (!window.ErrorHandler) {
    console.warn('⚠️ ErrorHandler no está disponible. Los errores 403 no se manejarán correctamente.');
  }

  if (!window.ActionButtonsManager) {
    console.warn('⚠️ ActionButtonsManager no está disponible. Los botones no se gestionarán automáticamente.');
  }

  try {
    // 1. Cargar permisos del usuario
    console.log('📥 Cargando permisos del usuario...');
    let permissions = null;
    
    try {
      permissions = await window.PermissionsManager.loadPermissions();
    } catch (loadError) {
      console.error('❌ Error crítico al cargar permisos:', loadError);
      console.warn('⚠️ Continuando con permisos limitados para evitar bloqueo de UI');
      // Don't return - allow UI to load with limited functionality
    }

    if (!permissions) {
      console.warn('⚠️ No se pudieron cargar los permisos. Algunas funciones pueden no estar disponibles.');
      // Don't return - allow page to load
    } else {
      const rol = window.PermissionsManager.getRol();
      console.log(`✅ Permisos cargados para rol: ${rol}`);
      
      // CRITICAL FIX: Safely handle permissions object
      try {
        const permKeys = permissions && typeof permissions === 'object' 
          ? Object.keys(permissions) 
          : [];
        console.log('📋 Módulos disponibles:', permKeys);
      } catch (e) {
        console.warn('⚠️ Error al procesar módulos de permisos:', e);
      }
    }

    // 2. Inicializar ActionButtonsManager
    if (window.ActionButtonsManager) {
      try {
        await window.ActionButtonsManager.initialize();
        
        // Procesar botones después de un pequeño delay para asegurar que el DOM esté listo
        setTimeout(() => {
          window.ActionButtonsManager.processAllButtons();
        }, 100);
      } catch (btnError) {
        console.error('❌ Error al inicializar ActionButtonsManager:', btnError);
        // Continue - don't break the page
      }
    }

    // 3. Disparar evento personalizado para que otras partes de la app sepan que los permisos están listos
    const event = new CustomEvent('permissionsLoaded', {
      detail: {
        rol: rol,
        permissions: permissions
      }
    });
    window.dispatchEvent(event);

    console.log('✅ Sistema de permisos inicializado correctamente');

  } catch (error) {
    console.error('❌ Error inicializando sistema de permisos:', error);
  }
})();

/**
 * Helper global para verificar permisos rápidamente
 */
window.hasPermission = function(module, action) {
  if (!window.PermissionsManager) {
    console.warn('PermissionsManager no disponible');
    return false;
  }
  return window.PermissionsManager.hasPermission(module, action);
};

/**
 * Helper global para verificar si puede ver un módulo
 */
window.canViewModule = function(module) {
  if (!window.PermissionsManager) {
    console.warn('PermissionsManager no disponible');
    return false;
  }
  return window.PermissionsManager.hasAnyPermission(module);
};

/**
 * Helper global para ejecutar acción con verificación de permisos
 */
window.executeWithPermission = function(module, action, callback, onDenied = null) {
  if (!window.ActionButtonsManager) {
    console.warn('ActionButtonsManager no disponible');
    callback();
    return;
  }
  window.ActionButtonsManager.checkAndExecute(module, action, callback, onDenied);
};

/**
 * Helper para ocultar elementos sin permisos
 */
window.hideIfNoPermission = function(selector, modules) {
  if (!window.ActionButtonsManager) {
    return;
  }
  window.ActionButtonsManager.hideSection(selector, modules);
};

console.log('✅ Helpers globales de permisos disponibles: hasPermission(), canViewModule(), executeWithPermission(), hideIfNoPermission()');
