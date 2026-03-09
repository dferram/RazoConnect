/**
 * Tests de Integración - requirePermission Middleware
 * 
 * Verifica que el middleware requirePermission funcione correctamente
 * con diferentes roles y permisos en un entorno simulado de Express.
 */

const { requirePermission } = require('../../middlewares/authMiddleware');

describe('requirePermission Middleware - Integración', () => {
  let req, res, next;

  beforeEach(() => {
    // Mock de request, response y next
    req = {
      user: null,
      tenant: { tenant_id: 1 }
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    next = jest.fn();
  });

  // ========================================================================
  // SUITE 1: Autenticación
  // ========================================================================
  describe('Verificación de Autenticación', () => {
    test('debe rechazar si no hay req.user', () => {
      const middleware = requirePermission('inventario', 'ver');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No autenticado'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('debe rechazar si req.user está vacío (sin rol)', () => {
      req.user = {}; // Tiene objeto pero sin rol
      const middleware = requirePermission('inventario', 'ver');
      middleware(req, res, next);

      // Cuando req.user existe pero no tiene rol, se trata como rol inválido (403)
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // SUITE 2: Bypass para super_admin y admin
  // ========================================================================
  describe('Bypass para super_admin y admin', () => {
    test('super_admin debe tener acceso a cualquier módulo', () => {
      req.user = { id: 1, rol: 'super_admin', tenant_id: 1 };
      const middleware = requirePermission('inventario', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('admin debe tener acceso a cualquier módulo', () => {
      req.user = { id: 2, rol: 'admin', tenant_id: 1 };
      const middleware = requirePermission('cuentas_cobrar', 'crear_pago');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('super_admin debe pasar incluso con módulos inexistentes', () => {
      req.user = { id: 1, rol: 'super_admin', tenant_id: 1 };
      const middleware = requirePermission('modulo_inexistente', 'accion_inexistente');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('debe ser case-insensitive para super_admin', () => {
      req.user = { id: 1, rol: 'SUPER_ADMIN', tenant_id: 1 };
      const middleware = requirePermission('inventario', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe ser case-insensitive para admin', () => {
      req.user = { id: 2, rol: 'ADMIN', tenant_id: 1 };
      const middleware = requirePermission('inventario', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // SUITE 3: Permisos de Inventarios
  // ========================================================================
  describe('Rol: inventarios', () => {
    beforeEach(() => {
      req.user = { id: 3, rol: 'inventarios', tenant_id: 1 };
    });

    test('debe permitir ver inventario', () => {
      const middleware = requirePermission('inventario', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('debe permitir modificar inventario', () => {
      const middleware = requirePermission('inventario', 'modificar');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir crear ajustes', () => {
      const middleware = requirePermission('ajustes', 'crear');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir recibir inventario', () => {
      const middleware = requirePermission('recibir_inventario', 'modificar');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe rechazar crear órdenes de compra', () => {
      const middleware = requirePermission('ordenes_compra', 'crear');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Acceso denegado. Se requiere permiso: ordenes_compra:crear',
        rolActual: 'inventarios',
        permisoRequerido: {
          modulo: 'ordenes_compra',
          accion: 'crear'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('debe rechazar validar pagos', () => {
      const middleware = requirePermission('validar_pagos', 'modificar');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // SUITE 4: Permisos de Catalogo
  // ========================================================================
  describe('Rol: catalogo', () => {
    beforeEach(() => {
      req.user = { id: 4, rol: 'catalogo', tenant_id: 1 };
    });

    test('debe permitir ver productos', () => {
      const middleware = requirePermission('productos', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir crear productos', () => {
      const middleware = requirePermission('productos', 'crear');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir modificar imágenes de productos', () => {
      const middleware = requirePermission('productos', 'imagenes');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir gestionar categorías', () => {
      const middleware = requirePermission('categorias', 'crear');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe rechazar crear pagos', () => {
      const middleware = requirePermission('cuentas_cobrar', 'crear_pago');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // SUITE 5: Permisos de Finanzas
  // ========================================================================
  describe('Rol: finanzas', () => {
    beforeEach(() => {
      req.user = { id: 5, rol: 'finanzas', tenant_id: 1 };
    });

    test('debe permitir ver cuentas por cobrar', () => {
      const middleware = requirePermission('cuentas_cobrar', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir crear pagos en CxC', () => {
      const middleware = requirePermission('cuentas_cobrar', 'crear_pago');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir validar pagos', () => {
      const middleware = requirePermission('validar_pagos', 'modificar');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir gestionar créditos', () => {
      const middleware = requirePermission('gestion_creditos', 'modificar');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe rechazar crear órdenes de compra', () => {
      const middleware = requirePermission('ordenes_compra', 'crear');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('debe rechazar modificar proveedores', () => {
      const middleware = requirePermission('proveedores', 'modificar');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // SUITE 6: Permisos de Compras
  // ========================================================================
  describe('Rol: compras', () => {
    beforeEach(() => {
      req.user = { id: 6, rol: 'compras', tenant_id: 1 };
    });

    test('debe permitir ver proveedores', () => {
      const middleware = requirePermission('proveedores', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir crear proveedores', () => {
      const middleware = requirePermission('proveedores', 'crear');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir crear órdenes de compra', () => {
      const middleware = requirePermission('ordenes_compra', 'crear');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir recibir inventario', () => {
      const middleware = requirePermission('recibir_inventario', 'modificar');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe rechazar validar pagos', () => {
      const middleware = requirePermission('validar_pagos', 'modificar');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('debe rechazar gestionar créditos', () => {
      const middleware = requirePermission('gestion_creditos', 'modificar');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // SUITE 7: Permisos de Agente
  // ========================================================================
  describe('Rol: agente', () => {
    beforeEach(() => {
      req.user = { id: 7, rol: 'agente', tenant_id: 1 };
    });

    test('debe permitir ver pedidos', () => {
      const middleware = requirePermission('pedidos', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir crear pedidos', () => {
      const middleware = requirePermission('pedidos', 'crear');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir ver clientes', () => {
      const middleware = requirePermission('clientes', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe permitir ver comisiones propias', () => {
      const middleware = requirePermission('comisiones_propias', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe rechazar crear órdenes de compra', () => {
      const middleware = requirePermission('ordenes_compra', 'crear');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('debe rechazar crear ajustes de inventario', () => {
      const middleware = requirePermission('ajustes', 'crear');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('debe rechazar validar pagos', () => {
      const middleware = requirePermission('validar_pagos', 'modificar');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('debe rechazar gestionar créditos', () => {
      const middleware = requirePermission('gestion_creditos', 'modificar');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // SUITE 8: Roles Inválidos
  // ========================================================================
  describe('Roles Inválidos', () => {
    test('debe rechazar rol inexistente', () => {
      req.user = { id: 99, rol: 'rol_inexistente', tenant_id: 1 };
      const middleware = requirePermission('inventario', 'ver');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('debe rechazar rol legacy no migrado', () => {
      req.user = { id: 99, rol: 'gerente_finanzas', tenant_id: 1 };
      const middleware = requirePermission('cuentas_cobrar', 'ver');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    test('debe rechazar rol vacío', () => {
      req.user = { id: 99, rol: '', tenant_id: 1 };
      const middleware = requirePermission('inventario', 'ver');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // SUITE 9: Multi-Tenant (Verificación de Aislamiento)
  // ========================================================================
  describe('Multi-Tenant - Aislamiento por tenant_id', () => {
    test('super_admin respeta su tenant_id', () => {
      req.user = { id: 1, rol: 'super_admin', tenant_id: 1 };
      req.tenant = { tenant_id: 1 };
      
      const middleware = requirePermission('inventario', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      // El middleware NO verifica tenant_id (eso lo hace authenticate)
      // Solo verifica permisos de rol
    });

    test('admin respeta su tenant_id', () => {
      req.user = { id: 2, rol: 'admin', tenant_id: 2 };
      req.tenant = { tenant_id: 2 };
      
      const middleware = requirePermission('productos', 'crear');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('roles granulares respetan su tenant_id', () => {
      req.user = { id: 3, rol: 'inventarios', tenant_id: 1 };
      req.tenant = { tenant_id: 1 };
      
      const middleware = requirePermission('inventario', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // SUITE 10: Case Sensitivity
  // ========================================================================
  describe('Case Sensitivity', () => {
    test('debe ser case-insensitive para roles', () => {
      req.user = { id: 3, rol: 'INVENTARIOS', tenant_id: 1 };
      const middleware = requirePermission('inventario', 'ver');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('debe ser case-insensitive para módulos y acciones', () => {
      req.user = { id: 3, rol: 'inventarios', tenant_id: 1 };
      const middleware = requirePermission('INVENTARIO', 'VER');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
