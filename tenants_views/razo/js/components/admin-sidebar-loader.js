/**
 * Admin Sidebar Loader
 * Carga el sidebar de administración dinámicamente
 */

(function () {
  'use strict';

  async function loadAdminSidebar() {
    const container = document.getElementById('admin-sidebar-container');
    if (!container) {
      console.error('❌ admin-sidebar-container not found in DOM');
      return;
    }

    // CORRECCIÓN: Verificar que hay sesión de admin antes de intentar cargar
    let adminData = null;
    try {
      adminData = JSON.parse(localStorage.getItem('razoconnect_admin'));
    } catch (e) {
      adminData = null;
    }

    if (!adminData || !adminData.nombre) {
      console.warn('⚠️ No hay sesión de admin, no se cargará el sidebar');
      return; // Detener ejecución
    }

    // MISIÓN 1: Ruta absoluta desde la raíz del proyecto
    const sidebarUrl = '/components/sidebar-admin.html';
    
    // MISIÓN 1: Debugging - mostrar URL completa que se intentará cargar
    console.log('🔍 Intentando cargar sidebar desde:', new URL(sidebarUrl, window.location.origin).href);

    try {
      const response = await fetch(sidebarUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      container.innerHTML = html;

      console.log('✅ Admin sidebar loaded successfully');
      highlightActiveLink();
      setupRoleBasedVisibility();
    } catch (error) {
      // MISIÓN 2: NO redirigir al login - solo mostrar error en consola
      console.error('❌ Error cargando sidebar admin:', error);
      console.error('📁 Archivo buscado:', sidebarUrl);
      console.error('🌐 URL completa:', new URL(sidebarUrl, window.location.origin).href);
      console.warn('⚠️ La página continuará funcionando sin sidebar');
      
      // Mostrar mensaje visual en el contenedor (sin romper la página)
      container.innerHTML = `
        <div style="padding: 1rem; background: #fef3c7; border-left: 4px solid #f59e0b; color: #92400e;">
          <strong>⚠️ Sidebar no disponible</strong>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">
            No se pudo cargar el menú lateral. La página sigue funcionando.
          </p>
        </div>
      `;
      
      // NO redirigir - permitir que el usuario continúe trabajando
    }
  }

  // MISIÓN 2: Función eliminada - no usar fallback que podría causar problemas
  // Si el sidebar no carga, la página continúa funcionando sin él

  function highlightActiveLink() {
    const currentPath = window.location.pathname;
    const links = document.querySelectorAll('.admin-nav-link');

    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && currentPath.includes(href.replace('/', ''))) {
        link.classList.add('active');
      }
    });
  }

  function setupRoleBasedVisibility() {
    const userDataRaw = localStorage.getItem('razoconnect_admin');
    const user = JSON.parse(userDataRaw || '{}');
    
    // TEMPORAL: Logging para diagnóstico
    console.log('[SIDEBAR DEBUG] user.rol:', user.rol);
    console.log('[SIDEBAR DEBUG] user.role:', user.role);
    console.log('[SIDEBAR DEBUG] user.roles:', user.roles);
    
    // Soportar tanto array de roles como string de rol
    const roles = user.roles || [];
    const rolString = (user.rol || user.role || '').toString().toLowerCase().trim();
    
    console.log('[SIDEBAR DEBUG] rolString normalizado:', rolString);
    
    // Verificar si es super admin en cualquier formato
    const isSuperAdmin = 
      roles.includes('super_admin') || 
      roles.includes('superadmin') ||
      rolString === 'superadmin' ||
      rolString === 'super admin' ||
      rolString === 'super_admin';

    console.log('[SIDEBAR DEBUG] isSuperAdmin:', isSuperAdmin);

    const superAdminSections = document.querySelectorAll('[data-role="super_admin"]');
    console.log('[SIDEBAR DEBUG] Secciones encontradas:', superAdminSections.length);

    if (!isSuperAdmin) {
      superAdminSections.forEach(section => {
        section.style.setProperty('display', 'none', 'important');
      });
      console.log('[SIDEBAR DEBUG] Secciones OCULTADAS');
    } else {
      superAdminSections.forEach(section => {
        section.style.setProperty('display', 'block', 'important');
        section.style.visibility = 'visible';
        section.style.opacity = '1';
      });
      console.log('[SIDEBAR DEBUG] Secciones MOSTRADAS con !important');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAdminSidebar);
  } else {
    loadAdminSidebar();
  }
})();
