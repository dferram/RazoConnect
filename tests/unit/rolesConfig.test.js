/**
 * Tests Unitarios - rolesConfig.js
 * 
 * Verifica que la matriz de permisos funcione correctamente
 * y que las funciones de validación retornen los valores esperados.
 */

const {
  ROLES_PERMISOS,
  getPermisosRol,
  tienePermiso,
  getRolesValidos,
  esRolValido,
  getDescripcionRol
} = require('../../config/rolesConfig');

describe('rolesConfig - Matriz de Permisos RBAC', () => {
  
  // ========================================================================
  // SUITE 1: Validación de Roles
  // ========================================================================
  describe('getRolesValidos()', () => {
    test('debe retornar exactamente 7 roles', () => {
      const roles = getRolesValidos();
      expect(roles).toHaveLength(7);
    });

    test('debe incluir todos los roles base', () => {
      const roles = getRolesValidos();
      expect(roles).toContain('super_admin');
      expect(roles).toContain('admin');
      expect(roles).toContain('inventarios');
      expect(roles).toContain('catalogo');
      expect(roles).toContain('finanzas');
      expect(roles).toContain('compras');
      expect(roles).toContain('agente');
    });

    test('no debe incluir roles legacy', () => {
      const roles = getRolesValidos();
      expect(roles).not.toContain('gerente_finanzas');
      expect(roles).not.toContain('jefe_almacen');
      expect(roles).not.toContain('supervisor_ventas');
    });
  });

  describe('esRolValido()', () => {
    test('debe validar roles correctos', () => {
      expect(esRolValido('super_admin')).toBe(true);
      expect(esRolValido('admin')).toBe(true);
      expect(esRolValido('inventarios')).toBe(true);
      expect(esRolValido('catalogo')).toBe(true);
      expect(esRolValido('finanzas')).toBe(true);
      expect(esRolValido('compras')).toBe(true);
      expect(esRolValido('agente')).toBe(true);
    });

    test('debe rechazar roles inválidos', () => {
      expect(esRolValido('gerente_finanzas')).toBe(false);
      expect(esRolValido('jefe_almacen')).toBe(false);
      expect(esRolValido('marketing')).toBe(false);
      expect(esRolValido('random_role')).toBe(false);
      expect(esRolValido('')).toBe(false);
      expect(esRolValido(null)).toBe(false);
      expect(esRolValido(undefined)).toBe(false);
    });

    test('debe ser case-insensitive', () => {
      expect(esRolValido('ADMIN')).toBe(true);
      expect(esRolValido('Admin')).toBe(true);
      expect(esRolValido('INVENTARIOS')).toBe(true);
      expect(esRolValido('Catalogo')).toBe(true);
    });
  });

  // ========================================================================
  // SUITE 2: Permisos de Roles
  // ========================================================================
  describe('getPermisosRol()', () => {
    test('super_admin debe retornar null (acceso total)', () => {
      expect(getPermisosRol('super_admin')).toBeNull();
    });

    test('admin debe retornar null (acceso total)', () => {
      expect(getPermisosRol('admin')).toBeNull();
    });

    test('inventarios debe retornar objeto de permisos', () => {
      const permisos = getPermisosRol('inventarios');
      expect(permisos).toBeDefined();
      expect(permisos).toHaveProperty('inventario');
      expect(permisos).toHaveProperty('ajustes');
      expect(permisos).toHaveProperty('recibir_inventario');
    });

    test('catalogo debe tener permisos de productos', () => {
      const permisos = getPermisosRol('catalogo');
      expect(permisos).toHaveProperty('productos');
      expect(permisos.productos).toContain('ver');
      expect(permisos.productos).toContain('crear');
      expect(permisos.productos).toContain('modificar');
    });

    test('finanzas debe tener permisos de CxC y CxP', () => {
      const permisos = getPermisosRol('finanzas');
      expect(permisos).toHaveProperty('cxc');
      expect(permisos).toHaveProperty('cxp');
      expect(permisos).toHaveProperty('credito');
    });

    test('compras debe tener permisos de proveedores y OC', () => {
      const permisos = getPermisosRol('compras');
      expect(permisos).toHaveProperty('proveedores');
      expect(permisos).toHaveProperty('ordenes_compra');
      expect(permisos).toHaveProperty('recibir_inventario');
    });

    test('agente debe tener permisos limitados', () => {
      const permisos = getPermisosRol('agente');
      expect(permisos).toHaveProperty('pedidos');
      expect(permisos).toHaveProperty('clientes');
      expect(permisos).toHaveProperty('comisiones_propias');
      // NO debe tener acceso a compras o ajustes
      expect(permisos).not.toHaveProperty('ordenes_compra');
      expect(permisos).not.toHaveProperty('ajustes');
      expect(permisos).not.toHaveProperty('validar_pagos');
    });

    test('rol inválido debe retornar null', () => {
      expect(getPermisosRol('rol_inexistente')).toBeNull();
      expect(getPermisosRol('')).toBeNull();
      expect(getPermisosRol(null)).toBeNull();
    });
  });

  // ========================================================================
  // SUITE 3: Verificación de Permisos Granulares
  // ========================================================================
  describe('tienePermiso()', () => {
    test('super_admin tiene todos los permisos', () => {
      expect(tienePermiso('super_admin', 'inventario', 'ver')).toBe(true);
      expect(tienePermiso('super_admin', 'productos', 'eliminar')).toBe(true);
      expect(tienePermiso('super_admin', 'cualquier_modulo', 'cualquier_accion')).toBe(true);
    });

    test('admin tiene todos los permisos', () => {
      expect(tienePermiso('admin', 'inventario', 'ver')).toBe(true);
      expect(tienePermiso('admin', 'finanzas', 'modificar')).toBe(true);
      expect(tienePermiso('admin', 'cualquier_modulo', 'cualquier_accion')).toBe(true);
    });

    test('inventarios tiene permisos específicos', () => {
      expect(tienePermiso('inventarios', 'inventario', 'ver')).toBe(true);
      expect(tienePermiso('inventarios', 'inventario', 'modificar')).toBe(true);
      expect(tienePermiso('inventarios', 'ajustes', 'crear')).toBe(true);
      expect(tienePermiso('inventarios', 'recibir_inventario', 'modificar')).toBe(true);
    });

    test('inventarios NO tiene permisos de otros módulos', () => {
      expect(tienePermiso('inventarios', 'ordenes_compra', 'crear')).toBe(false);
      expect(tienePermiso('inventarios', 'cuentas_cobrar', 'ver')).toBe(false);
      expect(tienePermiso('inventarios', 'validar_pagos', 'modificar')).toBe(false);
    });

    test('catalogo puede gestionar productos', () => {
      expect(tienePermiso('catalogo', 'productos', 'ver')).toBe(true);
      expect(tienePermiso('catalogo', 'productos', 'crear')).toBe(true);
      expect(tienePermiso('catalogo', 'productos', 'modificar')).toBe(true);
      expect(tienePermiso('catalogo', 'productos', 'imagenes')).toBe(true);
    });

    test('catalogo NO puede gestionar finanzas', () => {
      expect(tienePermiso('catalogo', 'cuentas_cobrar', 'crear_pago')).toBe(false);
      expect(tienePermiso('catalogo', 'validar_pagos', 'modificar')).toBe(false);
    });

    test('finanzas puede gestionar CxC y créditos', () => {
      expect(tienePermiso('finanzas', 'cxc', 'ver')).toBe(true);
      expect(tienePermiso('finanzas', 'cxc', 'crear_pago')).toBe(true);
      expect(tienePermiso('finanzas', 'credito', 'modificar')).toBe(true);
      expect(tienePermiso('finanzas', 'validar_pagos', 'modificar')).toBe(true);
    });

    test('finanzas NO puede crear órdenes de compra', () => {
      expect(tienePermiso('finanzas', 'ordenes_compra', 'crear')).toBe(false);
      expect(tienePermiso('finanzas', 'proveedores', 'modificar')).toBe(false);
    });

    test('compras puede gestionar proveedores y OC', () => {
      expect(tienePermiso('compras', 'proveedores', 'ver')).toBe(true);
      expect(tienePermiso('compras', 'proveedores', 'crear')).toBe(true);
      expect(tienePermiso('compras', 'ordenes_compra', 'crear')).toBe(true);
      expect(tienePermiso('compras', 'recibir_inventario', 'modificar')).toBe(true);
    });

    test('compras NO puede validar pagos', () => {
      expect(tienePermiso('compras', 'validar_pagos', 'modificar')).toBe(false);
      expect(tienePermiso('compras', 'gestion_creditos', 'modificar')).toBe(false);
    });

    test('agente tiene permisos limitados', () => {
      expect(tienePermiso('agente', 'pedidos', 'ver')).toBe(true);
      expect(tienePermiso('agente', 'pedidos', 'crear')).toBe(true);
      expect(tienePermiso('agente', 'clientes', 'ver')).toBe(true);
      expect(tienePermiso('agente', 'clientes', 'crear')).toBe(true);
      expect(tienePermiso('agente', 'comisiones_propias', 'ver')).toBe(true);
    });

    test('agente NO puede acceder a módulos administrativos', () => {
      expect(tienePermiso('agente', 'ordenes_compra', 'crear')).toBe(false);
      expect(tienePermiso('agente', 'ajustes', 'crear')).toBe(false);
      expect(tienePermiso('agente', 'validar_pagos', 'modificar')).toBe(false);
      expect(tienePermiso('agente', 'gestion_creditos', 'modificar')).toBe(false);
    });

    test('debe ser case-insensitive', () => {
      expect(tienePermiso('INVENTARIOS', 'INVENTARIO', 'VER')).toBe(true);
      expect(tienePermiso('Catalogo', 'Productos', 'Crear')).toBe(true);
    });

    test('rol inválido debe retornar false', () => {
      expect(tienePermiso('rol_inexistente', 'inventario', 'ver')).toBe(false);
      expect(tienePermiso('', 'inventario', 'ver')).toBe(false);
      expect(tienePermiso(null, 'inventario', 'ver')).toBe(false);
    });
  });

  // ========================================================================
  // SUITE 4: Descripciones de Roles
  // ========================================================================
  describe('getDescripcionRol()', () => {
    test('debe retornar descripciones correctas', () => {
      expect(getDescripcionRol('super_admin')).toBe('Super Administrador (Acceso Total en su Tenant)');
      expect(getDescripcionRol('admin')).toBe('Administrador (Acceso Total en su Tenant)');
      expect(getDescripcionRol('inventarios')).toBe('Gestión de Inventarios, Auditorías y Surtido');
      expect(getDescripcionRol('catalogo')).toBe('Gestión de Productos y Catálogo');
      expect(getDescripcionRol('finanzas')).toBe('Gestión Financiera y Créditos');
      expect(getDescripcionRol('compras')).toBe('Gestión de Compras y Proveedores');
      expect(getDescripcionRol('agente')).toBe('Agente de Ventas');
    });

    test('debe retornar "Rol Desconocido" para roles inválidos', () => {
      expect(getDescripcionRol('rol_inexistente')).toBe('Rol Desconocido');
      expect(getDescripcionRol('')).toBe('Rol Desconocido');
      expect(getDescripcionRol(null)).toBe('Rol Desconocido');
    });

    test('debe ser case-insensitive', () => {
      expect(getDescripcionRol('ADMIN')).toBe('Administrador (Acceso Total en su Tenant)');
      expect(getDescripcionRol('Inventarios')).toBe('Gestión de Inventarios, Auditorías y Surtido');
    });
  });

  // ========================================================================
  // SUITE 5: Estructura de la Matriz de Permisos
  // ========================================================================
  describe('ROLES_PERMISOS - Estructura', () => {
    test('debe tener exactamente 5 roles (excluyendo super_admin y admin)', () => {
      const rolesEnMatriz = Object.keys(ROLES_PERMISOS);
      expect(rolesEnMatriz).toHaveLength(5);
    });

    test('cada rol debe tener al menos un módulo', () => {
      Object.entries(ROLES_PERMISOS).forEach(([rol, permisos]) => {
        expect(Object.keys(permisos).length).toBeGreaterThan(0);
      });
    });

    test('cada módulo debe tener al menos una acción', () => {
      Object.entries(ROLES_PERMISOS).forEach(([rol, permisos]) => {
        Object.entries(permisos).forEach(([modulo, acciones]) => {
          expect(Array.isArray(acciones)).toBe(true);
          expect(acciones.length).toBeGreaterThan(0);
        });
      });
    });

    test('todas las acciones deben ser strings', () => {
      Object.entries(ROLES_PERMISOS).forEach(([rol, permisos]) => {
        Object.entries(permisos).forEach(([modulo, acciones]) => {
          acciones.forEach(accion => {
            expect(typeof accion).toBe('string');
            expect(accion.length).toBeGreaterThan(0);
          });
        });
      });
    });
  });

  // ========================================================================
  // SUITE 6: Casos Edge y Seguridad
  // ========================================================================
  describe('Casos Edge y Seguridad', () => {
    test('no debe permitir inyección de código en nombres de roles', () => {
      expect(esRolValido('admin; DROP TABLE administradores;')).toBe(false);
      expect(esRolValido('<script>alert("xss")</script>')).toBe(false);
    });

    test('debe manejar espacios en blanco', () => {
      expect(esRolValido('  admin  ')).toBe(true);
      expect(esRolValido('  inventarios  ')).toBe(true);
    });

    test('debe manejar valores null/undefined sin errores', () => {
      expect(() => getPermisosRol(null)).not.toThrow();
      expect(() => getPermisosRol(undefined)).not.toThrow();
      expect(() => tienePermiso(null, 'inventario', 'ver')).not.toThrow();
      expect(() => esRolValido(null)).not.toThrow();
    });

    test('debe retornar false para permisos con parámetros vacíos', () => {
      expect(tienePermiso('inventarios', '', 'ver')).toBe(false);
      expect(tienePermiso('inventarios', 'inventario', '')).toBe(false);
      expect(tienePermiso('inventarios', null, 'ver')).toBe(false);
    });
  });
});
