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

  /**
   * FASE 2 - TASK 2: Sistema de visibilidad estricta basada en roles
   * Define qué secciones del menú puede ver cada rol
   */
  function setupRoleBasedVisibility() {
    const userDataRaw = localStorage.getItem('razoconnect_admin');
    const user = JSON.parse(userDataRaw || '{}');
    
    const rolString = (user.rol || user.role || '').toString().toLowerCase().trim();
    
    // Mapa de permisos: qué secciones puede ver cada rol
    const rolePermissions = {
      'super_admin': ['Principal', 'Ventas', 'Catálogo', 'Finanzas', 'Inventario', 'Compras', 'Reportes', 'Sistema'],
      'superadmin': ['Principal', 'Ventas', 'Catálogo', 'Finanzas', 'Inventario', 'Compras', 'Reportes', 'Sistema'],
      'super admin': ['Principal', 'Ventas', 'Catálogo', 'Finanzas', 'Inventario', 'Compras', 'Reportes', 'Sistema'],
      'admin': ['Principal', 'Ventas', 'Catálogo', 'Finanzas', 'Inventario', 'Compras', 'Reportes'],
      'inventarios': ['Principal', 'Inventario'], // Solo Dashboard e Inventario
      'catalogo': ['Principal', 'Catálogo'],
      'finanzas': ['Principal', 'Ventas', 'Finanzas', 'Reportes'], // Incluye Ventas para acceso a Clientes
      'gerente_finanzas': ['Principal', 'Ventas', 'Finanzas', 'Reportes'], // Incluye Ventas para acceso a Clientes
      'compras': ['Principal', 'Compras', 'Reportes'] // Compras + Reportes de recepciones
    };
    
    // Mapa de links permitidos por rol dentro de secciones
    const roleLinkPermissions = {
      'finanzas': {
        'Ventas': ['admin-clientes-facturacion.html'], // Acceso a clientes y facturación
        'Reportes': ['admin-reportes.html'] // Solo el reporte general
      },
      'gerente_finanzas': {
        'Ventas': ['admin-clientes-facturacion.html'], // Acceso a clientes y facturación
        'Reportes': ['admin-reportes.html'] // Solo el reporte general
      },
      'compras': {
        'Reportes': ['admin-reportes-ordenes-compra.html'] // Solo reportes de recepciones
      }
    };

    const allowedSections = rolePermissions[rolString] || ['Principal'];
    const linkPermissions = roleLinkPermissions[rolString] || {};
    
    console.log(`🔒 [SIDEBAR] Rol detectado: ${rolString}`);
    console.log(`✅ [SIDEBAR] Secciones permitidas:`, allowedSections);
    console.log(`🔗 [SIDEBAR] Restricciones de links:`, linkPermissions);

    // Obtener todas las secciones del menú
    const allSections = document.querySelectorAll('.admin-nav-section');
    
    // FASE 5 - TAREA 1: Manejo especial para inventarios ANTES de ocultar secciones
    if (rolString === 'inventarios') {
      const ventasSection = Array.from(allSections).find(section => {
        return section.querySelector('.admin-nav-title')?.textContent?.trim() === 'Ventas';
      });
      
      if (ventasSection) {
        // Mostrar solo el link de Pedidos, ocultar el resto
        const allLinks = ventasSection.querySelectorAll('.admin-nav-link');
        allLinks.forEach(link => {
          const href = link.getAttribute('href') || '';
          // Usar href en lugar de texto para identificar Pedidos de manera confiable
          if (href.includes('admin-pedidos.html')) {
            link.style.setProperty('display', 'flex', 'important');
            link.style.visibility = 'visible';
            link.style.opacity = '1';
            link.style.pointerEvents = 'auto';
            console.log(`✅ [SIDEBAR] Mostrando link: Pedidos (${href})`);
          } else {
            link.style.setProperty('display', 'none', 'important');
            console.log(`🚫 [SIDEBAR] Ocultando link: ${href}`);
          }
        });
        
        // Forzar visibilidad de la sección Ventas para inventarios
        ventasSection.style.setProperty('display', 'block', 'important');
        ventasSection.style.visibility = 'visible';
        ventasSection.style.opacity = '1';
        console.log(`✅ [SIDEBAR] Sección Ventas forzada visible (solo Pedidos) para inventarios`);
      }
    }
    
    // Aplicar reglas generales de visibilidad
    allSections.forEach(section => {
      const sectionTitle = section.querySelector('.admin-nav-title')?.textContent?.trim();
      
      if (!sectionTitle) return;
      
      // Para inventarios, Ventas ya fue manejada arriba
      if (rolString === 'inventarios' && sectionTitle === 'Ventas') {
        return; // Skip, ya fue configurada
      }
      
      // Verificar si esta sección está permitida para el rol actual
      const isAllowed = allowedSections.includes(sectionTitle);
      
      if (isAllowed) {
        // Mostrar sección
        section.style.setProperty('display', 'block', 'important');
        section.style.visibility = 'visible';
        section.style.opacity = '1';
        console.log(`✅ [SIDEBAR] Mostrando sección: ${sectionTitle}`);
        
        // Filtrar links dentro de la sección si hay restricciones
        if (linkPermissions[sectionTitle]) {
          const allowedLinks = linkPermissions[sectionTitle];
          const allLinks = section.querySelectorAll('.admin-nav-link');
          
          allLinks.forEach(link => {
            const href = link.getAttribute('href') || '';
            const linkFile = href.replace('/', '');
            
            if (allowedLinks.includes(linkFile)) {
              link.style.setProperty('display', 'flex', 'important');
              link.style.visibility = 'visible';
              link.style.opacity = '1';
              link.style.pointerEvents = 'auto';
              console.log(`✅ [SIDEBAR] Mostrando link: ${linkFile}`);
            } else {
              link.style.setProperty('display', 'none', 'important');
              link.style.visibility = 'hidden';
              link.style.pointerEvents = 'none';
              console.log(`🚫 [SIDEBAR] Ocultando link: ${linkFile}`);
            }
          });
        }
      } else {
        // Ocultar sección completamente
        section.style.setProperty('display', 'none', 'important');
        section.style.visibility = 'hidden';
        console.log(`🚫 [SIDEBAR] Ocultando sección: ${sectionTitle}`);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAdminSidebar);
  } else {
    loadAdminSidebar();
  }
})();
