/**
 * ════════════════════════════════════════════════════════════
 * TESTS - Sistema de Permisos Granulares Frontend
 * ════════════════════════════════════════════════════════════
 */

// Implementación simplificada de PermissionsManager para tests
class PermissionsManager {
  constructor() {
    this.permissions = null;
    this.rol = null;
    this.lastUpdate = null;
    this.CACHE_DURATION = 5 * 60 * 1000;
  }

  async loadPermissions() {
    try {
      if (this.permissions && this.lastUpdate && 
          (Date.now() - this.lastUpdate < this.CACHE_DURATION)) {
        return this.permissions;
      }

      const token = localStorage.getItem('razoconnect_token') || 
                    localStorage.getItem('razoconnect_admin_token');

      if (!token) {
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
        
        localStorage.setItem('razoconnect_permissions', JSON.stringify({
          permisos: this.permissions,
          rol: this.rol,
          timestamp: this.lastUpdate
        }));

        return this.permissions;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  hasPermission(modulo, accion) {
    if (!this.permissions) {
      return false;
    }

    if (this.permissions['*'] && this.permissions['*'].includes('*')) {
      return true;
    }

    if (this.permissions[modulo]) {
      const acciones = this.permissions[modulo];
      if (acciones.includes('*')) {
        return true;
      }
      if (acciones.includes(accion)) {
        return true;
      }
    }

    return false;
  }

  hasAnyPermission(modulo) {
    if (!this.permissions) {
      return false;
    }

    if (this.permissions['*'] && this.permissions['*'].includes('*')) {
      return true;
    }

    return !!(this.permissions[modulo] && this.permissions[modulo].length > 0);
  }

  getPermissions() {
    return this.permissions;
  }

  getRol() {
    return this.rol;
  }

  isSuperAdmin() {
    return this.rol === 'super_admin' || 
           (this.permissions && this.permissions['*'] && this.permissions['*'].includes('*'));
  }

  isAdmin() {
    return this.rol === 'super_admin' || this.rol === 'admin';
  }

  clearPermissions() {
    this.permissions = null;
    this.rol = null;
    this.lastUpdate = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('razoconnect_permissions');
    }
  }

  canViewMenuSection(requiredModules) {
    if (!this.permissions) {
      return false;
    }

    if (this.isSuperAdmin()) {
      return true;
    }

    return requiredModules.some(modulo => this.hasAnyPermission(modulo));
  }

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

// Mock del entorno del navegador
global.fetch = jest.fn();
global.localStorage = {
  data: {},
  getItem(key) {
    return this.data[key] || null;
  },
  setItem(key, value) {
    this.data[key] = value;
  },
  removeItem(key) {
    delete this.data[key];
  },
  clear() {
    this.data = {};
  }
};

// Instancia global para tests
let permissionsManager;

describe('Sistema de Permisos Frontend', () => {
  
  beforeEach(() => {
    // Crear nueva instancia para cada test
    permissionsManager = new PermissionsManager();
    
    // Limpiar localStorage
    global.localStorage.clear();
    
    // Reset fetch mock
    global.fetch.mockClear();
  });

  describe('PermissionsManager - Carga de Permisos', () => {
    
    test('Debe cargar permisos desde backend correctamente', async () => {
      // Mock del endpoint
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rol: 'gerente_finanzas',
          permisos: {
            finanzas: ['ver', 'editar', 'aprobar'],
            credito: ['ver', 'aprobar'],
            reportes: ['ver']
          }
        })
      });

      // Configurar token
      localStorage.setItem('razoconnect_token', 'Bearer test-token');

      const permisos = await permissionsManager.loadPermissions();

      expect(permisos).toBeDefined();
      expect(permisos.finanzas).toEqual(['ver', 'editar', 'aprobar']);
      expect(permissionsManager.getRol()).toBe('gerente_finanzas');
    });

    test('Debe usar caché si no ha expirado', async () => {
      // Primera carga
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rol: 'almacenista',
          permisos: {
            inventario: ['contar']
          }
        })
      });

      localStorage.setItem('razoconnect_token', 'Bearer test-token');

      await permissionsManager.loadPermissions();
      const firstCallCount = global.fetch.mock.calls.length;

      // Segunda carga (debe usar caché)
      await permissionsManager.loadPermissions();
      const secondCallCount = global.fetch.mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount); // No debe hacer otra llamada
    });

    test('Debe retornar null si no hay token', async () => {
      const permisos = await permissionsManager.loadPermissions();
      expect(permisos).toBeNull();
    });

    test('Debe manejar error 401 correctamente', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      localStorage.setItem('razoconnect_token', 'Bearer invalid-token');

      const permisos = await permissionsManager.loadPermissions();
      expect(permisos).toBeNull();
    });
  });

  describe('PermissionsManager - Verificación de Permisos', () => {
    
    beforeEach(async () => {
      // Configurar permisos de prueba
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rol: 'gerente_finanzas',
          permisos: {
            finanzas: ['ver', 'editar', 'aprobar'],
            credito: ['ver', 'aprobar'],
            reportes: ['ver']
          }
        })
      });

      localStorage.setItem('razoconnect_token', 'Bearer test-token');
      await permissionsManager.loadPermissions();
    });

    test('hasPermission() debe retornar true para permiso existente', () => {
      const result = permissionsManager.hasPermission('finanzas', 'ver');
      expect(result).toBe(true);
    });

    test('hasPermission() debe retornar false para permiso inexistente', () => {
      const result = permissionsManager.hasPermission('inventario', 'crear');
      expect(result).toBe(false);
    });

    test('hasAnyPermission() debe retornar true si tiene algún permiso en módulo', () => {
      const result = permissionsManager.hasAnyPermission('finanzas');
      expect(result).toBe(true);
    });

    test('hasAnyPermission() debe retornar false si no tiene permisos en módulo', () => {
      const result = permissionsManager.hasAnyPermission('inventario');
      expect(result).toBe(false);
    });

    test('canViewMenuSection() debe retornar true si tiene permiso en al menos un módulo', () => {
      const result = permissionsManager.canViewMenuSection(['finanzas', 'inventario']);
      expect(result).toBe(true); // Tiene finanzas
    });

    test('canViewMenuSection() debe retornar false si no tiene ningún permiso', () => {
      const result = permissionsManager.canViewMenuSection(['inventario', 'compras']);
      expect(result).toBe(false);
    });
  });

  describe('PermissionsManager - Super Admin', () => {
    
    beforeEach(async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rol: 'super_admin',
          permisos: {
            '*': ['*']
          }
        })
      });

      localStorage.setItem('razoconnect_token', 'Bearer super-admin-token');
      await permissionsManager.loadPermissions();
    });

    test('isSuperAdmin() debe retornar true', () => {
      expect(permissionsManager.isSuperAdmin()).toBe(true);
    });

    test('hasPermission() debe retornar true para cualquier módulo/acción', () => {
      expect(permissionsManager.hasPermission('cualquier_modulo', 'cualquier_accion')).toBe(true);
    });

    test('hasAnyPermission() debe retornar true para cualquier módulo', () => {
      expect(permissionsManager.hasAnyPermission('cualquier_modulo')).toBe(true);
    });

    test('canViewMenuSection() debe retornar true para cualquier sección', () => {
      expect(permissionsManager.canViewMenuSection(['modulo1', 'modulo2'])).toBe(true);
    });
  });

  describe('PermissionsManager - Gestión de Caché', () => {
    
    test('clearPermissions() debe limpiar permisos y caché', async () => {
      // Cargar permisos
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rol: 'marketing',
          permisos: { productos: ['ver'] }
        })
      });

      localStorage.setItem('razoconnect_token', 'Bearer test-token');
      await permissionsManager.loadPermissions();

      expect(permissionsManager.getPermissions()).toBeDefined();

      // Limpiar
      permissionsManager.clearPermissions();

      expect(permissionsManager.getPermissions()).toBeNull();
      expect(localStorage.getItem('razoconnect_permissions')).toBeNull();
    });

    test('getModuleActions() debe retornar acciones del módulo', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rol: 'almacenista',
          permisos: {
            inventario: ['contar', 'ajuste_menor']
          }
        })
      });

      localStorage.setItem('razoconnect_token', 'Bearer test-token');
      await permissionsManager.loadPermissions();

      const actions = permissionsManager.getModuleActions('inventario');
      expect(actions).toEqual(['contar', 'ajuste_menor']);
    });

    test('getModuleActions() debe retornar array vacío para módulo sin permisos', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          rol: 'almacenista',
          permisos: {
            inventario: ['contar']
          }
        })
      });

      localStorage.setItem('razoconnect_token', 'Bearer test-token');
      await permissionsManager.loadPermissions();

      const actions = permissionsManager.getModuleActions('finanzas');
      expect(actions).toEqual([]);
    });
  });
});
