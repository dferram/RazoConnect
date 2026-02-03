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
      
      // MISIÓN 2: Fallback estático para que la página no se rompa
      loadFallbackSidebar(container);
    }
  }

  // MISIÓN 2: Sidebar estático de fallback
  function loadFallbackSidebar(container) {
    console.warn('⚠️ Cargando sidebar de fallback estático');
    
    const fallbackHTML = `
      <aside class="admin-sidebar" style="width: 250px; background: #1f2937; color: white; min-height: 100vh; padding: 1rem;">
        <div style="padding: 1rem; border-bottom: 1px solid #374151;">
          <h3 style="color: #f97316; font-size: 1.25rem; font-weight: bold;">RazoConnect</h3>
          <p style="font-size: 0.875rem; color: #9ca3af; margin-top: 0.25rem;">Panel Admin</p>
        </div>
        
        <nav style="margin-top: 1rem;">
          <a href="/admin-dashboard.html" class="admin-nav-link" style="display: block; padding: 0.75rem 1rem; color: white; text-decoration: none; border-radius: 0.5rem; margin-bottom: 0.25rem;">
            <i class="bi bi-speedometer2"></i> Dashboard
          </a>
          <a href="/admin-pedidos.html" class="admin-nav-link" style="display: block; padding: 0.75rem 1rem; color: white; text-decoration: none; border-radius: 0.5rem; margin-bottom: 0.25rem;">
            <i class="bi bi-cart-check"></i> Pedidos
          </a>
          <a href="/admin-productos.html" class="admin-nav-link" style="display: block; padding: 0.75rem 1rem; color: white; text-decoration: none; border-radius: 0.5rem; margin-bottom: 0.25rem;">
            <i class="bi bi-box-seam"></i> Productos
          </a>
          <a href="/admin-inventario.html" class="admin-nav-link" style="display: block; padding: 0.75rem 1rem; color: white; text-decoration: none; border-radius: 0.5rem; margin-bottom: 0.25rem;">
            <i class="bi bi-clipboard-data"></i> Inventario
          </a>
          <a href="/admin-toma-inventario.html" class="admin-nav-link" style="display: block; padding: 0.75rem 1rem; color: white; text-decoration: none; border-radius: 0.5rem; margin-bottom: 0.25rem;">
            <i class="bi bi-clipboard-check"></i> Auditoría Inventario
          </a>
          <a href="/admin-inventario-reportes.html" class="admin-nav-link" style="display: block; padding: 0.75rem 1rem; color: white; text-decoration: none; border-radius: 0.5rem; margin-bottom: 0.25rem;">
            <i class="bi bi-file-earmark-text"></i> Reportes Inventario
          </a>
          <a href="/admin-clientes.html" class="admin-nav-link" style="display: block; padding: 0.75rem 1rem; color: white; text-decoration: none; border-radius: 0.5rem; margin-bottom: 0.25rem;">
            <i class="bi bi-people"></i> Clientes
          </a>
          <a href="/admin-agentes.html" class="admin-nav-link" style="display: block; padding: 0.75rem 1rem; color: white; text-decoration: none; border-radius: 0.5rem; margin-bottom: 0.25rem;">
            <i class="bi bi-person-badge"></i> Agentes
          </a>
        </nav>
        
        <div style="position: absolute; bottom: 1rem; left: 1rem; right: 1rem;">
          <button onclick="localStorage.clear(); window.location.href='/login-admin.html'" style="width: 100%; padding: 0.75rem; background: #dc2626; color: white; border: none; border-radius: 0.5rem; cursor: pointer;">
            <i class="bi bi-box-arrow-right"></i> Cerrar Sesión
          </button>
        </div>
      </aside>
    `;
    
    container.innerHTML = fallbackHTML;
    highlightActiveLink();
    
    // Mostrar notificación al usuario
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'info',
        title: 'Modo sin conexión',
        text: 'El sidebar se cargó en modo básico. Algunas funciones pueden estar limitadas.',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });
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
