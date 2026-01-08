/**
 * Admin Sidebar Loader
 * Carga el sidebar de administración dinámicamente
 */

(function () {
  'use strict';

  async function loadAdminSidebar() {
    const container = document.getElementById('admin-sidebar-container');
    if (!container) return;

    try {
      const response = await fetch('/components/sidebar-admin.html');
      if (!response.ok) {
        throw new Error(`Error al cargar sidebar: ${response.status}`);
      }

      const html = await response.text();
      container.innerHTML = html;

      highlightActiveLink();
      setupRoleBasedVisibility();
    } catch (error) {
      console.error('Error cargando sidebar admin:', error);
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
    const roles = user.roles || [];

    const isSuperAdmin = roles.includes('super_admin') || roles.includes('superadmin');

    if (!isSuperAdmin) {
      const superAdminSections = document.querySelectorAll('[data-role="super_admin"]');
      superAdminSections.forEach(section => {
        section.style.display = 'none';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAdminSidebar);
  } else {
    loadAdminSidebar();
  }
})();
