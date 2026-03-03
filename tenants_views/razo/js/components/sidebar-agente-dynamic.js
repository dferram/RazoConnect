/**
 * ════════════════════════════════════════════════════════════
 * SIDEBAR AGENTE DINÁMICO - Basado en Permisos Granulares
 * ════════════════════════════════════════════════════════════
 * 
 * Genera el sidebar de agente/ejecutivo_ventas dinámicamente
 * según los permisos del usuario.
 */

(function () {
  'use strict';

  const MENU_STRUCTURE = {
    principal: {
      title: 'Principal',
      items: [
        {
          label: 'Dashboard',
          icon: '📊',
          href: '/agente-dashboard.html',
          modules: []
        },
        {
          label: 'Mi cartera',
          icon: '📇',
          href: '/agente-cartera.html',
          modules: ['clientes', 'ventas']
        },
        {
          label: 'Notificaciones',
          icon: '🔔',
          href: '/staff-notificaciones.html',
          modules: [],
          badge: true
        }
      ]
    },
    gestion: {
      title: 'Gestión',
      items: [
        {
          label: 'Pedidos',
          icon: '🚚',
          href: '/agente-pedidos.html',
          modules: ['ventas', 'pedidos']
        },
        {
          label: 'Cuentas por cobrar',
          icon: '💵',
          href: '/agente-cxc.html',
          modules: ['cobranza', 'finanzas']
        },
        {
          label: 'Auditoría (Conteo)',
          icon: '📋',
          href: '/agente-toma-inventario.html',
          modules: ['inventario']
        },
        {
          label: 'Mis comisiones',
          icon: '💰',
          href: '/agente-comisiones.html',
          modules: ['comisiones']
        },
        {
          label: 'Datos de cobranza',
          icon: '💳',
          href: '/agente-numcuenta.html',
          modules: []
        }
      ]
    }
  };

  async function loadAgenteSidebar() {
    const container = document.getElementById('agente-sidebar-container');
    if (!container) {
      console.error('❌ agente-sidebar-container not found in DOM');
      return;
    }

    // Verificar sesión de agente
    let agenteData = null;
    try {
      agenteData = JSON.parse(localStorage.getItem('razoconnect_agente'));
    } catch (e) {
      agenteData = null;
    }

    if (!agenteData || !agenteData.nombre) {
      console.warn('⚠️ No hay sesión de agente, no se cargará el sidebar');
      return;
    }

    // Cargar permisos
    if (!window.PermissionsManager) {
      console.error('❌ PermissionsManager no está disponible');
      return;
    }

    await window.PermissionsManager.loadPermissions();
    const permissions = window.PermissionsManager.getPermissions();

    if (!permissions) {
      console.error('❌ No se pudieron cargar los permisos');
      return;
    }

    // Generar HTML del sidebar
    const sidebarHTML = generateSidebarHTML();
    container.innerHTML = sidebarHTML;

    console.log('✅ Agente sidebar dinámico cargado');
    highlightActiveLink();
    
    // Cargar contador de notificaciones si existe
    if (typeof loadAgenteNotificationCount === 'function') {
      loadAgenteNotificationCount();
    }
  }

  function generateSidebarHTML() {
    const sections = [];

    for (const [key, section] of Object.entries(MENU_STRUCTURE)) {
      const visibleItems = section.items.filter(item => {
        if (!item.modules || item.modules.length === 0) {
          return true;
        }
        return window.PermissionsManager.canViewMenuSection(item.modules);
      });

      if (visibleItems.length > 0) {
        sections.push(generateSectionHTML(section.title, visibleItems));
      }
    }

    return `
      <aside class="admin-sidebar">
        <div class="admin-brand">
          <a href="/agente-dashboard.html" class="admin-brand-logo">
            <img src="/icon/Logo_Razo.png" class="titulo-emoji-reemplazo" alt="Razo">
            RazoConnect
          </a>
          <div class="admin-brand-subtitle">Panel del agente</div>
        </div>
        <nav class="admin-nav">
          ${sections.join('\n')}
        </nav>
      </aside>
    `;
  }

  function generateSectionHTML(title, items) {
    const itemsHTML = items.map(item => {
      const badgeHTML = item.badge ? `
        <span id="notificationBadgeAgente" class="notification-badge" style="display: none; position: absolute; top: 8px; right: 12px; background: #EF4444; border-radius: 50%; width: 8px; height: 8px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></span>
      ` : '';

      const style = item.badge ? 'position: relative;' : '';

      return `
        <a href="${item.href}" class="admin-nav-link" style="${style}">
          <span class="admin-nav-icon">${item.icon}</span>
          <span>${item.label}</span>
          ${badgeHTML}
        </a>
      `;
    }).join('\n');

    return `
      <div class="admin-nav-section">
        <div class="admin-nav-title">${title}</div>
        ${itemsHTML}
      </div>
    `;
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAgenteSidebar);
  } else {
    loadAgenteSidebar();
  }
})();
