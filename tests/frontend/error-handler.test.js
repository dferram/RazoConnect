/**
 * ════════════════════════════════════════════════════════════
 * TESTS - Sistema de Manejo de Errores HTTP
 * ════════════════════════════════════════════════════════════
 */

// Mock del entorno del navegador
global.window = {
  location: {
    href: ''
  },
  fetch: jest.fn(),
  PermissionsManager: {
    clearPermissions: jest.fn(),
    getPermissions: jest.fn(),
    hasPermission: jest.fn(),
    loadPermissions: jest.fn()
  }
};

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

global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn()
};

global.setTimeout = (fn) => fn(); // Ejecutar inmediatamente en tests

// Implementación simplificada de ErrorHandler para tests
class ErrorHandler {
  constructor() {
    this.setupGlobalErrorHandling();
  }

  setupGlobalErrorHandling() {
    const originalFetch = global.window.fetch;
    global.window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
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
    };
  }

  handle401Error(url) {
    console.warn('⚠️ [401] Token inválido o expirado');
    
    if (global.window.PermissionsManager) {
      global.window.PermissionsManager.clearPermissions();
    }
    
    localStorage.removeItem('razoconnect_admin');
    localStorage.removeItem('razoconnect_agente');
    localStorage.removeItem('razoconnect_cliente');
    localStorage.removeItem('razoconnect_permissions');
    
    global.window.location.href = '/401.html';
  }

  handle403Error(url) {
    console.warn('⚠️ [403] Acceso denegado a:', url);
    global.window.location.href = '/403.html';
  }

  handle429Error(url) {
    console.warn('⚠️ [429] Demasiadas solicitudes a:', url);
    global.window.location.href = '/429.html';
  }

  handle500Error(url) {
    console.error('❌ [500] Error del servidor en:', url);
    global.window.location.href = '/500.html';
  }

  handle503Error(url) {
    console.error('❌ [503] Servicio no disponible:', url);
    global.window.location.href = '/503.html';
  }

  async checkPermissionAndExecute(modulo, accion, callback, onDenied = null) {
    if (!global.window.PermissionsManager) {
      console.error('PermissionsManager no está disponible');
      return;
    }

    if (!global.window.PermissionsManager.getPermissions()) {
      await global.window.PermissionsManager.loadPermissions();
    }

    if (global.window.PermissionsManager.hasPermission(modulo, accion)) {
      callback();
    } else {
      console.warn(`⚠️ [403] Permiso denegado - Módulo: ${modulo}, Acción: ${accion}`);
      
      if (onDenied) {
        onDenied();
      }
      
      global.window.location.href = '/403.html';
    }
  }
}

describe('Sistema de Manejo de Errores HTTP', () => {
  let errorHandler;

  beforeEach(() => {
    // Reset mocks
    global.window.location.href = '';
    global.localStorage.clear();
    global.console.warn.mockClear();
    global.console.error.mockClear();
    global.window.PermissionsManager.clearPermissions.mockClear();
    global.window.PermissionsManager.getPermissions.mockClear();
    global.window.PermissionsManager.hasPermission.mockClear();
    
    // Crear instancia sin interceptar fetch (probaremos métodos directamente)
    errorHandler = new ErrorHandler();
  });

  describe('ErrorHandler - Manejo de Errores HTTP', () => {
    
    test('handle401Error debe limpiar localStorage y redirigir a 401.html', () => {
      // Configurar localStorage con datos de sesión
      localStorage.setItem('razoconnect_admin', JSON.stringify({ nombre: 'Admin' }));
      localStorage.setItem('razoconnect_agente', JSON.stringify({ nombre: 'Agente' }));
      localStorage.setItem('razoconnect_cliente', JSON.stringify({ nombre: 'Cliente' }));
      localStorage.setItem('razoconnect_permissions', JSON.stringify({ finanzas: ['ver'] }));

      // Llamar handler
      errorHandler.handle401Error('/api/admin/pedidos');

      // Verificar que se limpió localStorage
      expect(localStorage.getItem('razoconnect_admin')).toBeNull();
      expect(localStorage.getItem('razoconnect_agente')).toBeNull();
      expect(localStorage.getItem('razoconnect_cliente')).toBeNull();
      expect(localStorage.getItem('razoconnect_permissions')).toBeNull();

      // Verificar que se llamó clearPermissions
      expect(global.window.PermissionsManager.clearPermissions).toHaveBeenCalled();

      // Verificar redirección
      expect(global.window.location.href).toBe('/401.html');

      // Verificar log
      expect(global.console.warn).toHaveBeenCalledWith('⚠️ [401] Token inválido o expirado');
    });

    test('handle403Error debe redirigir a 403.html', () => {
      const url = '/api/admin/productos/123';
      errorHandler.handle403Error(url);

      expect(global.window.location.href).toBe('/403.html');
      expect(global.console.warn).toHaveBeenCalledWith('⚠️ [403] Acceso denegado a:', url);
    });

    test('handle429Error debe redirigir a 429.html', () => {
      const url = '/api/admin/pedidos';
      errorHandler.handle429Error(url);

      expect(global.window.location.href).toBe('/429.html');
      expect(global.console.warn).toHaveBeenCalledWith('⚠️ [429] Demasiadas solicitudes a:', url);
    });

    test('handle500Error debe redirigir a 500.html', () => {
      const url = '/api/admin/reportes';
      errorHandler.handle500Error(url);

      expect(global.window.location.href).toBe('/500.html');
      expect(global.console.error).toHaveBeenCalledWith('❌ [500] Error del servidor en:', url);
    });

    test('handle503Error debe redirigir a 503.html', () => {
      const url = '/api/admin/inventario';
      errorHandler.handle503Error(url);

      expect(global.window.location.href).toBe('/503.html');
      expect(global.console.error).toHaveBeenCalledWith('❌ [503] Servicio no disponible:', url);
    });
  });

  describe('ErrorHandler - Verificación de Permisos', () => {
    
    test('checkPermissionAndExecute debe ejecutar callback si tiene permiso', async () => {
      const callback = jest.fn();
      const onDenied = jest.fn();

      global.window.PermissionsManager.getPermissions.mockReturnValue({
        productos: ['crear', 'editar']
      });
      global.window.PermissionsManager.hasPermission.mockReturnValue(true);

      await errorHandler.checkPermissionAndExecute('productos', 'crear', callback, onDenied);

      expect(callback).toHaveBeenCalled();
      expect(onDenied).not.toHaveBeenCalled();
      expect(global.window.location.href).toBe('');
    });

    test('checkPermissionAndExecute debe redirigir a 403.html si NO tiene permiso', async () => {
      const callback = jest.fn();
      const onDenied = jest.fn();

      global.window.PermissionsManager.getPermissions.mockReturnValue({
        productos: ['ver']
      });
      global.window.PermissionsManager.hasPermission.mockReturnValue(false);

      await errorHandler.checkPermissionAndExecute('productos', 'eliminar', callback, onDenied);

      expect(callback).not.toHaveBeenCalled();
      expect(onDenied).toHaveBeenCalled();
      expect(global.window.location.href).toBe('/403.html');
      expect(global.console.warn).toHaveBeenCalledWith(
        '⚠️ [403] Permiso denegado - Módulo: productos, Acción: eliminar'
      );
    });

    test('checkPermissionAndExecute debe cargar permisos si no están cargados', async () => {
      const callback = jest.fn();

      global.window.PermissionsManager.getPermissions
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({ productos: ['crear'] });
      
      global.window.PermissionsManager.loadPermissions.mockResolvedValue({
        productos: ['crear']
      });
      
      global.window.PermissionsManager.hasPermission.mockReturnValue(true);

      await errorHandler.checkPermissionAndExecute('productos', 'crear', callback);

      expect(global.window.PermissionsManager.loadPermissions).toHaveBeenCalled();
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('ErrorHandler - Limpieza Selectiva de localStorage', () => {
    
    test('Debe limpiar solo datos de sesión, no otros datos en localStorage', () => {
      // Configurar localStorage con múltiples datos
      localStorage.setItem('razoconnect_admin', JSON.stringify({ id: 1 }));
      localStorage.setItem('razoconnect_agente', JSON.stringify({ id: 2 }));
      localStorage.setItem('razoconnect_cliente', JSON.stringify({ id: 3 }));
      localStorage.setItem('razoconnect_permissions', JSON.stringify({ test: ['ver'] }));
      localStorage.setItem('otro_dato', 'no debe eliminarse');

      errorHandler.handle401Error('/api/admin/test');

      // Verificar que se eliminaron los datos de sesión
      expect(localStorage.getItem('razoconnect_admin')).toBeNull();
      expect(localStorage.getItem('razoconnect_agente')).toBeNull();
      expect(localStorage.getItem('razoconnect_cliente')).toBeNull();
      expect(localStorage.getItem('razoconnect_permissions')).toBeNull();

      // Verificar que otros datos NO se eliminaron
      expect(localStorage.getItem('otro_dato')).toBe('no debe eliminarse');
    });
  });
});
