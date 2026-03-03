/**
 * ════════════════════════════════════════════════════════════
 * PERMISSIONS MANAGER - Sistema de Permisos Granulares Frontend
 * ════════════════════════════════════════════════════════════
 * 
 * Gestiona permisos del usuario en el frontend de forma centralizada.
 * Se sincroniza con /api/auth/mis-permisos al login/refresh.
 * 
 * Funciones principales:
 * - loadPermissions(): Carga permisos desde backend
 * - hasPermission(modulo, accion): Verifica permiso específico
 * - hasAnyPermission(modulo): Verifica si tiene algún permiso en módulo
 * - getPermissions(): Obtiene todos los permisos
 * - clearPermissions(): Limpia caché de permisos
 */

class PermissionsManager {
  constructor() {
    this.permissions = null;
    this.rol = null;
    this.lastUpdate = null;
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Carga permisos desde el backend
   * @returns {Promise<Object>} Objeto de permisos
   */
  async loadPermissions() {
    try {
      // Verificar si hay caché válido
      if (this.permissions && this.lastUpdate && 
          (Date.now() - this.lastUpdate < this.CACHE_DURATION)) {
        return this.permissions;
      }

      const token = localStorage.getItem('razoconnect_token') || 
                    localStorage.getItem('razoconnect_admin_token') ||
                    localStorage.getItem('razoconnect_agente_token');

      if (!token) {
        console.warn('⚠️ No hay token de autenticación');
        return null;
      }

      const response = await fetch('/api/auth/mis-permisos', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.warn('⚠️ Token inválido o expirado');
          this.clearPermissions();
          return null;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.permisos) {
        this.permissions = data.permisos;
        this.rol = data.rol;
        this.lastUpdate = Date.now();
        
        // Guardar en localStorage para acceso rápido
        localStorage.setItem('razoconnect_permissions', JSON.stringify({
          permisos: this.permissions,
          rol: this.rol,
          timestamp: this.lastUpdate
        }));

        console.log('✅ Permisos cargados:', this.rol, this.permissions);
        return this.permissions;
      }

      return null;
    } catch (error) {
      console.error('❌ Error cargando permisos:', error);
      
      // Intentar cargar desde localStorage como fallback
      try {
        const cached = localStorage.getItem('razoconnect_permissions');
        if (cached) {
          const data = JSON.parse(cached);
          if (Date.now() - data.timestamp < this.CACHE_DURATION) {
            this.permissions = data.permisos;
            this.rol = data.rol;
            this.lastUpdate = data.timestamp;
            console.log('📦 Usando permisos en caché');
            return this.permissions;
          }
        }
      } catch (e) {
        console.error('Error leyendo caché:', e);
      }

      return null;
    }
  }

  /**
   * Verifica si el usuario tiene un permiso específico
   * @param {string} modulo - Nombre del módulo (ej: 'finanzas', 'inventario')
   * @param {string} accion - Acción específica (ej: 'ver', 'editar', 'crear')
   * @returns {boolean}
   */
  hasPermission(modulo, accion) {
    if (!this.permissions) {
      console.warn('⚠️ Permisos no cargados. Llama a loadPermissions() primero.');
      return false;
    }

    // super_admin tiene acceso a todo
    if (this.permissions['*'] && this.permissions['*'].includes('*')) {
      return true;
    }

    // Verificar permiso específico del módulo
    if (this.permissions[modulo]) {
      const acciones = this.permissions[modulo];
      
      // Wildcard en acciones del módulo
      if (acciones.includes('*')) {
        return true;
      }

      // Verificar acción específica
      if (acciones.includes(accion)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Verifica si el usuario tiene ALGÚN permiso en un módulo
   * @param {string} modulo - Nombre del módulo
   * @returns {boolean}
   */
  hasAnyPermission(modulo) {
    if (!this.permissions) {
      return false;
    }

    // super_admin tiene acceso a todo
    if (this.permissions['*'] && this.permissions['*'].includes('*')) {
      return true;
    }

    // Verificar si existe el módulo y tiene al menos una acción
    return this.permissions[modulo] && this.permissions[modulo].length > 0;
  }

  /**
   * Obtiene todos los permisos del usuario
   * @returns {Object|null}
   */
  getPermissions() {
    return this.permissions;
  }

  /**
   * Obtiene el rol del usuario
   * @returns {string|null}
   */
  getRol() {
    return this.rol;
  }

  /**
   * Verifica si el usuario es super_admin
   * @returns {boolean}
   */
  isSuperAdmin() {
    return this.rol === 'super_admin' || 
           (this.permissions && this.permissions['*'] && this.permissions['*'].includes('*'));
  }

  /**
   * Verifica si el usuario es admin (super_admin o admin)
   * @returns {boolean}
   */
  isAdmin() {
    return this.rol === 'super_admin' || this.rol === 'admin';
  }

  /**
   * Limpia los permisos del caché
   */
  clearPermissions() {
    this.permissions = null;
    this.rol = null;
    this.lastUpdate = null;
    localStorage.removeItem('razoconnect_permissions');
  }

  /**
   * Verifica si tiene permiso para ver una sección del menú
   * @param {string[]} requiredModules - Módulos requeridos (OR logic)
   * @returns {boolean}
   */
  canViewMenuSection(requiredModules) {
    if (!this.permissions) {
      return false;
    }

    // super_admin ve todo
    if (this.isSuperAdmin()) {
      return true;
    }

    // Verificar si tiene al menos un permiso en alguno de los módulos
    return requiredModules.some(modulo => this.hasAnyPermission(modulo));
  }

  /**
   * Obtiene acciones permitidas para un módulo
   * @param {string} modulo - Nombre del módulo
   * @returns {string[]}
   */
  getModuleActions(modulo) {
    if (!this.permissions) {
      return [];
    }

    if (this.permissions['*'] && this.permissions['*'].includes('*')) {
      return ['*'];
    }

    return this.permissions[modulo] || [];
  }
}

// Exportar instancia singleton
const permissionsManager = new PermissionsManager();

// Hacer disponible globalmente
if (typeof window !== 'undefined') {
  window.PermissionsManager = permissionsManager;
}

// Export para módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = permissionsManager;
}
