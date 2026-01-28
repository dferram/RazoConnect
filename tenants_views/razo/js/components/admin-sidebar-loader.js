/**
 * Admin Sidebar Loader
 * Carga el sidebar de administración dinámicamente
 */

(function () {
  'use strict';

  async function loadAdminSidebar() {
    const container = document.getElementById('sidebar-container');
    if (!container) {
      console.warn('⚠️ sidebar-container not found in DOM');
      return;
    }

    try {
      const response = await fetch('/components/sidebar-admin.html');
      if (!response.ok) {
        throw new Error(`Error al cargar sidebar: ${response.status}`);
      }

      const html = await response.text();
      container.innerHTML = html;

      console.log('✅ Admin sidebar loaded successfully');
      highlightActiveLink();
      setupRoleBasedVisibility();
    } catch (error) {
      console.error('❌ Error cargando sidebar admin:', error);
    }
  }

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
    const user = JSON.parse(localStorage.getItem('razoconnect_admin') || '{}');
    
    // Soportar tanto array de roles como string de rol
    const roles = user.roles || [];
    const rolString = (user.rol || user.role || '').toString().toLowerCase().trim();
    
    // Verificar si es super admin en cualquier formato
    const isSuperAdmin = 
      roles.includes('super_admin') || 
      roles.includes('superadmin') ||
      rolString === 'superadmin' ||
      rolString === 'super admin' ||
      rolString === 'super_admin';

    console.log('🔍 Verificación de rol:', { 
      roles, 
      rolString, 
      isSuperAdmin,
      userData: user 
    });

    if (!isSuperAdmin) {
      const superAdminSections = document.querySelectorAll('[data-role="super_admin"]');
      superAdminSections.forEach(section => {
        section.style.display = 'none';
      });
      console.log('🚫 Secciones de Super Admin ocultadas');
    } else {
      console.log('✅ Usuario es Super Admin - todas las secciones visibles');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAdminSidebar);
  } else {
    loadAdminSidebar();
  }
})();
