/**
 * ════════════════════════════════════════════════════════════
 * ROUTER 404 HANDLER - Manejo de Rutas No Encontradas
 * ════════════════════════════════════════════════════════════
 * 
 * Intercepta navegación a rutas inexistentes y redirige a 404.html
 * Compatible con navegación SPA y enlaces directos.
 */

(function() {
  'use strict';

  // Lista de rutas válidas conocidas (se puede expandir dinámicamente)
  const VALID_ROUTES = [
    // Admin
    '/admin-dashboard.html',
    '/admin-pedidos.html',
    '/admin-productos.html',
    '/admin-agregar-producto.html',
    '/admin-clientes.html',
    '/admin-agentes.html',
    '/admin-comisiones.html',
    '/admin-inventario.html',
    '/admin-ordenes-compra.html',
    '/admin-crear-oc.html',
    '/admin-recibir-inventario.html',
    '/admin-cxc.html',
    '/admin-cxp.html',
    '/admin-reportes.html',
    '/admin-categorias.html',
    '/admin-cupones.html',
    '/admin-proveedores.html',
    '/admin-aprobaciones.html',
    '/admin-validar-pagos.html',
    '/admin-edocuenta.html',
    '/admin-cuentaspagar.html',
    '/admin-cuentaspagadas.html',
    '/admin-ajuste-inventario.html',
    '/admin-historial-ajustes.html',
    '/admin-toma-inventario.html',
    '/admin-auditoria-mensual.html',
    '/admin-grupos-ordenes.html',
    '/admin-inventario-reportes.html',
    '/admin-movimientos-conciliacion.html',
    '/admin-reportes-ordenes-compra.html',
    '/admin-bitacora.html',
    '/admin-numcuenta.html',
    '/admin-catalogo-visual.html',
    '/admin-landing-editor.html',
    
    // Agente
    '/agente-dashboard.html',
    '/agente-cartera.html',
    '/agente-pedidos.html',
    '/agente-cxc.html',
    '/agente-toma-inventario.html',
    '/agente-comisiones.html',
    '/agente-numcuenta.html',
    
    // Staff
    '/staff-notificaciones.html',
    
    // Cliente
    '/dashboard.html',
    '/productos.html',
    '/carrito.html',
    '/pedidos.html',
    '/notificaciones.html',
    '/perfil.html',
    
    // Públicas
    '/inicio.html',
    '/login.html',
    '/registro.html',
    '/404.html',
    '/'
  ];

  /**
   * Verifica si una ruta es válida
   * @param {string} path - Ruta a verificar
   * @returns {boolean}
   */
  function isValidRoute(path) {
    // Normalizar path
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    
    // Verificar si está en la lista de rutas válidas
    if (VALID_ROUTES.includes(normalizedPath)) {
      return true;
    }

    // Verificar si el archivo existe (solo para rutas .html)
    if (normalizedPath.endsWith('.html')) {
      return false; // Si no está en la lista, asumimos que no existe
    }

    // Permitir rutas de API y assets
    if (normalizedPath.startsWith('/api/') || 
        normalizedPath.startsWith('/js/') ||
        normalizedPath.startsWith('/css/') ||
        normalizedPath.startsWith('/icon/') ||
        normalizedPath.startsWith('/images/')) {
      return true;
    }

    return false;
  }

  /**
   * Redirige a la página 404
   */
  function redirectTo404() {
    console.warn('⚠️ Ruta no encontrada, redirigiendo a 404');
    window.location.href = '/404.html';
  }

  /**
   * Verifica la ruta actual al cargar la página
   */
  function checkCurrentRoute() {
    const currentPath = window.location.pathname;
    
    // Ignorar si ya estamos en 404
    if (currentPath === '/404.html') {
      return;
    }

    // Verificar si la ruta es válida
    if (!isValidRoute(currentPath)) {
      console.warn('Ruta inválida detectada:', currentPath);
      redirectTo404();
    }
  }

  /**
   * Intercepta clics en enlaces para verificar rutas
   */
  function setupLinkInterception() {
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      
      if (!link) return;
      
      const href = link.getAttribute('href');
      
      // Ignorar enlaces externos, anclas y javascript:
      if (!href || 
          href.startsWith('http') || 
          href.startsWith('#') || 
          href.startsWith('javascript:') ||
          href.startsWith('mailto:') ||
          href.startsWith('tel:')) {
        return;
      }

      // Verificar si la ruta es válida
      if (!isValidRoute(href)) {
        e.preventDefault();
        console.warn('Intento de navegar a ruta inválida:', href);
        redirectTo404();
      }
    }, true);
  }

  /**
   * Maneja errores de carga de recursos
   */
  function setupResourceErrorHandling() {
    window.addEventListener('error', function(e) {
      // Solo manejar errores de carga de páginas HTML
      if (e.target.tagName === 'IFRAME' || 
          (e.target.tagName === 'LINK' && e.target.rel === 'import')) {
        console.error('Error cargando recurso:', e.target.src || e.target.href);
        // No redirigir automáticamente por errores de recursos
      }
    }, true);
  }

  /**
   * Intercepta fetch para detectar 404 del servidor
   */
  function setupFetchInterception() {
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
      try {
        const response = await originalFetch(...args);
        
        // Si es una petición a una página HTML que devuelve 404
        if (response.status === 404 && 
            args[0] && 
            typeof args[0] === 'string' && 
            args[0].endsWith('.html')) {
          console.warn('Página HTML no encontrada:', args[0]);
          // No redirigir automáticamente, dejar que la app maneje el error
        }
        
        return response;
      } catch (error) {
        throw error;
      }
    };
  }

  /**
   * Agrega ruta válida dinámicamente
   * @param {string} route - Ruta a agregar
   */
  function addValidRoute(route) {
    const normalizedRoute = route.startsWith('/') ? route : '/' + route;
    if (!VALID_ROUTES.includes(normalizedRoute)) {
      VALID_ROUTES.push(normalizedRoute);
      console.log('✅ Ruta agregada:', normalizedRoute);
    }
  }

  /**
   * Obtiene lista de rutas válidas
   * @returns {string[]}
   */
  function getValidRoutes() {
    return [...VALID_ROUTES];
  }

  // Inicializar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      checkCurrentRoute();
      setupLinkInterception();
      setupResourceErrorHandling();
      setupFetchInterception();
      console.log('✅ Router 404 handler inicializado');
    });
  } else {
    checkCurrentRoute();
    setupLinkInterception();
    setupResourceErrorHandling();
    setupFetchInterception();
    console.log('✅ Router 404 handler inicializado');
  }

  // Exponer funciones globalmente
  window.Router404 = {
    addValidRoute,
    getValidRoutes,
    isValidRoute,
    redirectTo404
  };

})();
