/**
 * ════════════════════════════════════════════════════════════
 * SIDEBAR ADMIN DINÁMICO - Basado en Permisos Granulares
 * ════════════════════════════════════════════════════════════
 * 
 * Genera el sidebar de administración dinámicamente según los
 * permisos del usuario obtenidos desde /api/auth/mis-permisos.
 * 
 * NO usa lógica hardcodeada de roles.
 * Solo muestra secciones para las que el usuario tiene permisos.
 */

(function () {
  'use strict';

  // Definición de estructura del menú con permisos requeridos
  const MENU_STRUCTURE = {
    principal: {
      title: 'Principal',
      items: [
        {
          label: 'Dashboard',
          icon: '📊',
          href: '/admin-dashboard.html',
          modules: [] // Siempre visible para usuarios autenticados
        }
      ]
    },
    ventas: {
      title: 'Ventas',
      items: [
        {
          label: 'Pedidos',
          icon: '📦',
          href: '/admin-pedidos.html',
          modules: ['ventas', 'pedidos']
        },
        {
          label: 'Clientes',
          icon: '👥',
          href: '/admin-clientes.html',
          modules: ['clientes', 'ventas']
        },
        {
          label: 'Agentes',
          icon: '💼',
          href: '/admin-agentes.html',
          modules: ['agentes', 'ventas']
        },
        {
          label: 'Cupones',
          icon: '🎟️',
          href: '/admin-cupones.html',
          modules: ['cupones', 'marketing']
        }
      ]
    },
    catalogo: {
      title: 'Catálogo',
      items: [
        {
          label: 'Productos',
          icon: '🎁',
          href: '/admin-agregar-producto.html',
          modules: ['productos', 'catalogo']
        },
        {
          label: 'Categorías',
          icon: '🏷️',
          href: '/admin-categorias.html',
          modules: ['productos', 'catalogo']
        },
        {
          label: 'Vista Tienda (Cliente)',
          icon: '📚',
          href: '/admin-catalogo-visual.html',
          modules: ['productos', 'catalogo', 'marketing']
        },
        {
          label: 'Editor Portada',
          icon: '🎨',
          href: '/admin-landing-editor.html',
          modules: ['marketing', 'catalogo']
        }
      ]
    },
    finanzas: {
      title: 'Finanzas',
      items: [
        {
          label: 'Comisiones',
          icon: '💰',
          href: '/admin-comisiones.html',
          modules: ['comisiones', 'finanzas']
        },
        {
          label: 'Gestión de Créditos',
          icon: '✅',
          href: '/admin-aprobaciones.html',
          modules: ['credito', 'finanzas']
        },
        {
          label: 'Cuentas por cobrar',
          icon: '💳',
          href: '/admin-cxc.html',
          modules: ['cobranza', 'finanzas']
        },
        {
          label: 'Validar pagos',
          icon: '✓',
          href: '/admin-validar-pagos.html',
          modules: ['finanzas', 'cobranza'],
          iconClass: 'bi bi-file-earmark-check'
        },
        {
          label: 'Edo. Cuenta Proveedores',
          icon: '🏦',
          href: '/admin-edocuenta.html',
          modules: ['finanzas', 'compras']
        },
        {
          label: 'Cuentas por pagar',
          icon: '🧮',
          href: '/admin-cuentaspagar.html',
          modules: ['finanzas']
        },
        {
          label: 'Historial Pagados',
          icon: '✅',
          href: '/admin-cuentaspagadas.html',
          modules: ['finanzas']
        }
      ]
    },
    inventario: {
      title: 'Inventario',
      items: [
        {
          label: 'Inventario',
          icon: '📈',
          href: '/admin-inventario.html',
          modules: ['inventario']
        },
        {
          label: 'Ajustes y Mermas',
          icon: '📝',
          href: '/admin-ajuste-inventario.html',
          modules: ['inventario']
        },
        {
          label: 'Historial de Ajustes',
          icon: '📋',
          href: '/admin-historial-ajustes.html',
          modules: ['inventario', 'auditoria']
        },
        {
          label: 'Toma de Inventario',
          icon: '🧾',
          href: '/admin-toma-inventario.html',
          modules: ['inventario']
        },
        {
          label: 'Auditoría Mensual',
          icon: '🔍',
          href: '/admin-auditoria-mensual.html',
          modules: ['inventario', 'auditoria']
        }
      ]
    },
    compras: {
      title: 'Compras',
      items: [
        {
          label: 'Proveedores',
          icon: '🏭',
          href: '/admin-proveedores.html',
          modules: ['compras', 'proveedores']
        },
        {
          label: 'Órdenes de compra',
          icon: '📄',
          href: '/admin-ordenes-compra.html',
          modules: ['compras']
        },
        {
          label: 'Crear Orden Compra',
          icon: '📋',
          href: '/admin-crear-oc.html',
          modules: ['compras']
        },
        {
          label: 'Consolidación de Compras',
          icon: '📦',
          href: '/admin-grupos-ordenes.html',
          modules: ['compras'],
          iconClass: 'bi bi-collection'
        },
        {
          label: 'Recibir inventario',
          icon: '📥',
          href: '/admin-recibir-inventario.html',
          modules: ['compras', 'inventario']
        }
      ]
    },
    reportes: {
      title: 'Reportes',
      items: [
        {
          label: 'Reportes',
          icon: '📑',
          href: '/admin-reportes.html',
          modules: ['reportes_financieros', 'reportes_ventas']
        },
        {
          label: 'Reportes de Inventario',
          icon: '📋',
          href: '/admin-inventario-reportes.html',
          modules: ['reportes_inventario', 'inventario']
        },
        {
          label: 'Conciliación',
          icon: '🔍',
          href: '/admin-movimientos-conciliacion.html',
          modules: ['conciliacion', 'inventario', 'auditoria']
        },
        {
          label: 'Reportes de Recepciones',
          icon: '📊',
          href: '/admin-reportes-ordenes-compra.html',
          modules: ['reportes_recepciones', 'compras']
        }
      ]
    },
    sistema: {
      title: 'Sistema',
      superAdminOnly: true,
      items: [
        {
          label: 'Bitácora',
          icon: '🔍',
          href: '/admin-bitacora.html',
          modules: ['auditoria']
        },
        {
          label: 'Datos Bancarios',
          icon: '💳',
          href: '/admin-numcuenta.html',
          modules: []
        }
      ]
    }
  };

  async function loadAdminSidebar() {
    const container = document.getElementById('admin-sidebar-container');
    if (!container) {
      console.error('❌ admin-sidebar-container not found in DOM');
      return;
    }

    // Verificar sesión de admin
    let adminData = null;
    try {
      adminData = JSON.parse(localStorage.getItem('razoconnect_admin'));
    } catch (e) {
      adminData = null;
    }

    if (!adminData || !adminData.nombre) {
      console.warn('⚠️ No hay sesión de admin, no se cargará el sidebar');
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
    const sidebarHTML = generateSidebarHTML(adminData);
    container.innerHTML = sidebarHTML;

    console.log('✅ Admin sidebar dinámico cargado');
    highlightActiveLink();
  }

  function generateSidebarHTML(adminData) {
    const sections = [];
    const userRole = adminData.rol ? adminData.rol.toLowerCase() : '';
    const isFinanzasRole = userRole === 'finanzas';

    // CRITICAL FIX: Filtro inverso para finanzas - solo mostrar secciones permitidas
    const allowedSectionsForFinanzas = ['principal', 'finanzas', 'reportes'];
    
    // Items permitidos específicos para finanzas en cada sección
    const allowedItemsForFinanzas = {
      'finanzas': ['Comisiones', 'Validar pagos', 'Cuentas por cobrar', 'Cuentas por pagar', 'Historial Pagados'],
      'reportes': ['Reportes'] // Solo el item principal de reportes
    };

    // Generar cada sección del menú
    for (const [key, section] of Object.entries(MENU_STRUCTURE)) {
      // Verificar si es sección solo para super_admin
      if (section.superAdminOnly && !window.PermissionsManager.isSuperAdmin()) {
        continue;
      }

      // FILTRO QUIRÚRGICO PARA FINANZAS: Solo mostrar secciones permitidas
      if (isFinanzasRole && !allowedSectionsForFinanzas.includes(key)) {
        continue;
      }

      // Filtrar items según permisos
      const visibleItems = section.items.filter(item => {
        // FILTRO ESPECÍFICO PARA FINANZAS: Whitelist de items permitidos
        if (isFinanzasRole) {
          const allowedItems = allowedItemsForFinanzas[key];
          if (allowedItems) {
            // Solo mostrar items explícitamente permitidos
            return allowedItems.includes(item.label);
          }
          // Para secciones sin whitelist específica (como 'principal'), mostrar todo
          if (key === 'principal') {
            return true;
          }
          // Bloquear todo lo demás
          return false;
        }

        // Items sin módulos requeridos siempre visibles (para otros roles)
        if (!item.modules || item.modules.length === 0) {
          return true;
        }

        // Verificar si tiene permiso en al menos uno de los módulos
        return window.PermissionsManager.canViewMenuSection(item.modules);
      });

      // Solo agregar sección si tiene items visibles
      if (visibleItems.length > 0) {
        sections.push(generateSectionHTML(section.title, visibleItems));
      }
    }

    return `
      <aside class="admin-sidebar">
        <div class="admin-brand">
          <a href="/admin-dashboard.html" class="admin-brand-logo">
            <img src="/icon/Logo_Razo.png" class="titulo-emoji-reemplazo" alt="Razo">
            RazoConnect
          </a>
          <div class="admin-brand-subtitle">Panel admin</div>
        </div>
        <nav class="admin-nav">
          ${sections.join('\n')}
        </nav>
      </aside>
    `;
  }

  function generateSectionHTML(title, items) {
    const itemsHTML = items.map(item => {
      const icon = item.iconClass 
        ? `<i class="${item.iconClass} admin-nav-icon" style="font-style: normal;"></i>`
        : `<span class="admin-nav-icon">${item.icon}</span>`;

      const tooltip = item.modules && item.modules.length > 0
        ? `title="Requiere: ${item.modules.join(', ')}"`
        : '';

      return `
        <a href="${item.href}" class="admin-nav-link" ${tooltip}>
          ${icon}
          <span>${item.label}</span>
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

  // Cargar sidebar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAdminSidebar);
  } else {
    loadAdminSidebar();
  }
})();
