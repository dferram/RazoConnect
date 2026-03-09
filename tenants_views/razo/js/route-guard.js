/**
 * FASE 2 - TASK 3: Blindaje de Rutas con Redirección a 403
 * Protege las páginas según el rol del usuario
 * Redirige a 403.html si el usuario intenta acceder a una página no autorizada
 */

(function() {
  'use strict';

  /**
   * Mapa de permisos: define qué roles pueden acceder a cada página
   * Si una página no está en el mapa, solo admin/super_admin pueden acceder
   */
  const PAGE_PERMISSIONS = {
    // Dashboard - Todos los roles autenticados
    'admin-dashboard.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'inventarios', 'catalogo', 'finanzas', 'gerente_finanzas', 'compras'],
    
    // VENTAS - Admin y rol 'inventarios' (para gestión de pedidos)
    'admin-pedidos.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'inventarios'],
    'admin-pedido-detalle.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'inventarios'],
    'admin-remisiones.html': ['super_admin', 'superadmin', 'super admin', 'admin'],
    'admin-clientes.html': ['super_admin', 'superadmin', 'super admin', 'admin'],
    'admin-agentes.html': ['super_admin', 'superadmin', 'super admin', 'admin'],
    'admin-cupones.html': ['super_admin', 'superadmin', 'super admin', 'admin'],
    'admin-comisiones.html': ['super_admin', 'superadmin', 'super admin', 'admin'],
    
    // CATÁLOGO - Admin y rol 'catalogo'
    'admin-agregar-producto.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'catalogo'],
    'admin-producto-editar.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'catalogo'],
    'admin-categorias.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'catalogo'],
    'admin-catalogo-visual.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'catalogo'],
    'admin-landing-editor.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'catalogo'],
    
    // FINANZAS - Admin y rol 'finanzas' o 'gerente_finanzas'
    'admin-aprobaciones.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'finanzas', 'gerente_finanzas'],
    'admin-cxc.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'finanzas', 'gerente_finanzas'],
    'admin-validar-pagos.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'finanzas', 'gerente_finanzas'],
    'admin-edocuenta.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'finanzas', 'gerente_finanzas'],
    'admin-cuentaspagar.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'finanzas', 'gerente_finanzas'],
    'admin-cuentaspagadas.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'finanzas', 'gerente_finanzas'],
    
    // INVENTARIO - Admin y rol 'inventarios'
    'admin-inventario.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'inventarios'],
    'admin-ajuste-inventario.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'inventarios'],
    'admin-historial-ajustes.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'inventarios'],
    'admin-toma-inventario.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'inventarios'],
    'admin-auditoria-mensual.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'inventarios'],
    
    // COMPRAS - Admin y rol 'compras'
    'admin-proveedores.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'compras'],
    'admin-ordenes-compra.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'compras'],
    'admin-crear-oc.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'compras'],
    'admin-grupos-ordenes.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'compras'],
    'admin-recibir-inventario.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'compras'],
    
    // REPORTES - Admin, finanzas, gerente_finanzas
    'admin-reportes.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'finanzas', 'gerente_finanzas'],
    'admin-inventario-reportes.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'inventarios'],
    'admin-movimientos-conciliacion.html': ['super_admin', 'superadmin', 'super admin', 'admin'],
    'admin-reportes-ordenes-compra.html': ['super_admin', 'superadmin', 'super admin', 'admin', 'compras'],
    
    // SISTEMA - Solo super_admin
    'admin-bitacora.html': ['super_admin', 'superadmin', 'super admin'],
    'admin-numcuenta.html': ['super_admin', 'superadmin', 'super admin'],
    'admin-nuevo-admin.html': ['super_admin', 'superadmin', 'super admin']
  };

  /**
   * Obtiene el nombre del archivo actual (sin path)
   */
  function getCurrentPage() {
    const path = window.location.pathname;
    const parts = path.split('/');
    return parts[parts.length - 1] || 'admin-dashboard.html';
  }

  /**
   * Obtiene el rol del usuario actual
   */
  function getUserRole() {
    try {
      const adminData = JSON.parse(localStorage.getItem('razoconnect_admin') || '{}');
      return (adminData.rol || adminData.role || '').toString().toLowerCase().trim();
    } catch (error) {
      console.error('Error obteniendo rol de usuario:', error);
      return '';
    }
  }

  /**
   * Verifica si el usuario tiene permiso para acceder a la página actual
   */
  function checkPageAccess() {
    const currentPage = getCurrentPage();
    const userRole = getUserRole();
    
    // Si no hay rol, no hacer nada (auth-guard-admin.js manejará el redirect a login)
    if (!userRole) {
      console.warn('🔒 [ROUTE-GUARD] No hay rol de usuario, esperando a auth-guard...');
      return true;
    }

    // Obtener roles permitidos para esta página
    const allowedRoles = PAGE_PERMISSIONS[currentPage];
    
    // Si la página no está en el mapa, solo admin/super_admin pueden acceder
    if (!allowedRoles) {
      const isAdmin = ['super_admin', 'superadmin', 'super admin', 'admin'].includes(userRole);
      if (!isAdmin) {
        console.error(`🚫 [ROUTE-GUARD] Acceso denegado a ${currentPage} para rol: ${userRole}`);
        redirectTo403();
        return false;
      }
      return true;
    }
    
    // Verificar si el rol del usuario está en la lista de permitidos
    const hasAccess = allowedRoles.includes(userRole);
    
    if (!hasAccess) {
      console.error(`🚫 [ROUTE-GUARD] Acceso denegado a ${currentPage} para rol: ${userRole}`);
      console.log(`✅ [ROUTE-GUARD] Roles permitidos:`, allowedRoles);
      redirectTo403();
      return false;
    }
    
    console.log(`✅ [ROUTE-GUARD] Acceso permitido a ${currentPage} para rol: ${userRole}`);
    return true;
  }

  /**
   * Redirige al usuario a la página 403
   */
  function redirectTo403() {
    // Prevenir loops infinitos
    if (window.location.pathname.includes('403.html')) {
      return;
    }
    
    // Guardar la página que intentó acceder para debugging
    const attemptedPage = getCurrentPage();
    sessionStorage.setItem('attempted_page', attemptedPage);
    
    // Redirigir a 403
    console.warn(`🚫 [ROUTE-GUARD] Redirigiendo a 403.html desde ${attemptedPage}`);
    window.location.replace('/403.html');
  }

  // Ejecutar verificación cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkPageAccess);
  } else {
    checkPageAccess();
  }

  // También verificar en pageshow (para prevenir acceso mediante botón atrás)
  window.addEventListener('pageshow', function(event) {
    // Solo verificar si la página se cargó desde caché
    if (event.persisted) {
      checkPageAccess();
    }
  });

  // Exportar función para uso manual si es necesario
  window.RouteGuard = {
    checkAccess: checkPageAccess,
    getCurrentPage: getCurrentPage,
    getUserRole: getUserRole
  };

})();
