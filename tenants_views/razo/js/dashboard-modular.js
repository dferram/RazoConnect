/**
 * FASE 2 - TASK 4: Dashboard Modular con Métricas por Rol
 * Adapta el dashboard para mostrar solo las métricas relevantes según el rol del usuario
 */

(function() {
  'use strict';

  /**
   * Obtiene el rol del usuario actual
   */
  function getUserRole() {
    try {
      const adminData = JSON.parse(localStorage.getItem('razoconnect_admin') || '{}');
      return (adminData.rol || adminData.role || '').toString().toLowerCase().trim();
    } catch (error) {
      console.error('Error obteniendo rol de usuario:', error);
      return 'admin';
    }
  }

  /**
   * Define qué tarjetas de métricas debe ver cada rol
   */
  const ROLE_METRICS = {
    'super_admin': {
      cards: ['totalPedidos', 'ingresosTotales', 'clientesActivos', 'agentesActivos', 'valorInventarioVenta', 'ventaTotal', 'pedidosPendientesCount', 'pedidosEntregados'],
      fetchStats: true,
      fetchOrders: true,
      sections: ['ventas', 'inventario', 'pedidos']
    },
    'superadmin': {
      cards: ['totalPedidos', 'ingresosTotales', 'clientesActivos', 'agentesActivos', 'valorInventarioVenta', 'ventaTotal', 'pedidosPendientesCount', 'pedidosEntregados'],
      fetchStats: true,
      fetchOrders: true,
      sections: ['ventas', 'inventario', 'pedidos']
    },
    'super admin': {
      cards: ['totalPedidos', 'ingresosTotales', 'clientesActivos', 'agentesActivos', 'valorInventarioVenta', 'ventaTotal', 'pedidosPendientesCount', 'pedidosEntregados'],
      fetchStats: true,
      fetchOrders: true,
      sections: ['ventas', 'inventario', 'pedidos']
    },
    'admin': {
      cards: ['totalPedidos', 'ingresosTotales', 'clientesActivos', 'agentesActivos', 'valorInventarioVenta', 'ventaTotal', 'pedidosPendientesCount', 'pedidosEntregados'],
      fetchStats: true,
      fetchOrders: true,
      sections: ['ventas', 'inventario', 'pedidos']
    },
    'inventarios': {
      cards: [],
      fetchStats: false,
      fetchOrders: true, // ✅ CRÍTICO: inventarios SÍ debe ver la tabla de pedidos
      sections: ['inventario'],
      customMessage: 'Gestión de Inventario'
    },
    'catalogo': {
      cards: [],
      fetchStats: false,
      fetchOrders: false,
      sections: ['catalogo'],
      customMessage: 'Gestión de Catálogo'
    },
    'finanzas': {
      cards: ['ingresosTotales', 'clientesActivos'],
      fetchStats: true,
      fetchOrders: false,
      sections: ['finanzas'],
      customMessage: 'Resumen Financiero'
    },
    'compras': {
      cards: ['valorInventarioVenta'],
      fetchStats: false,
      fetchOrders: false,
      sections: ['compras'],
      customMessage: 'Gestión de Compras'
    }
  };

  /**
   * Oculta/muestra tarjetas según el rol
   */
  function setupDashboardVisibility() {
    const userRole = getUserRole();
    const roleConfig = ROLE_METRICS[userRole] || ROLE_METRICS['admin'];
    
    console.log(`📊 [DASHBOARD] Configurando dashboard para rol: ${userRole}`);
    console.log(`✅ [DASHBOARD] Tarjetas permitidas:`, roleConfig.cards);

    // Obtener todas las tarjetas del dashboard
    const allCards = document.querySelectorAll('.admin-stat-card');
    
    allCards.forEach(card => {
      // Buscar el ID del elemento de valor dentro de la tarjeta
      const valueElement = card.querySelector('[id]');
      if (!valueElement) return;
      
      const cardId = valueElement.id;
      const isAllowed = roleConfig.cards.includes(cardId);
      
      if (isAllowed) {
        card.style.display = 'block';
        console.log(`✅ [DASHBOARD] Mostrando tarjeta: ${cardId}`);
      } else {
        card.style.display = 'none';
        console.log(`🚫 [DASHBOARD] Ocultando tarjeta: ${cardId}`);
      }
    });

    // Actualizar título del dashboard si hay mensaje personalizado
    if (roleConfig.customMessage) {
      const mesActualElement = document.getElementById('mesActual');
      if (mesActualElement) {
        mesActualElement.textContent = roleConfig.customMessage;
        mesActualElement.style.color = '#F97316';
      }
    }

    return roleConfig;
  }

  /**
   * Crea placeholders para roles sin métricas de ventas
   */
  function createRolePlaceholders(roleConfig) {
    if (roleConfig.sections.includes('ventas')) {
      return; // Admin/super_admin ya tienen todo
    }

    const statsGrid = document.querySelector('.admin-stats-grid');
    if (!statsGrid) return;

    // Limpiar tarjetas ocultas y agregar placeholders según el rol
    const placeholders = {
      'inventarios': [
        {
          title: 'Pedidos Pendientes',
          icon: '📦',
          value: 'Ver Pedidos',
          subtitle: 'Gestiona pedidos para surtir',
          color: 'orange',
          link: '/admin-pedidos.html'
        },
        {
          title: 'Inventario Físico',
          icon: '📊',
          value: 'Ver Inventario',
          subtitle: 'Consulta stock disponible',
          color: 'blue',
          link: '/admin-inventario.html'
        },
        {
          title: 'Ajustes y Mermas',
          icon: '📝',
          value: 'Registrar',
          subtitle: 'Ajustes de inventario',
          color: 'yellow',
          link: '/admin-ajuste-inventario.html'
        },
        {
          title: 'Toma de Inventario',
          icon: '🧾',
          value: 'Iniciar Conteo',
          subtitle: 'Auditoría de stock',
          color: 'green',
          link: '/admin-toma-inventario.html'
        }
      ],
      'catalogo': [
        {
          title: 'Productos Activos',
          icon: '🎁',
          value: 'Próximamente',
          subtitle: 'Total de productos en catálogo',
          color: 'orange'
        },
        {
          title: 'Categorías',
          icon: '🏷️',
          value: 'Próximamente',
          subtitle: 'Categorías configuradas',
          color: 'purple'
        }
      ],
      'finanzas': [
        {
          title: 'Cuentas por Cobrar',
          icon: '💳',
          value: 'Próximamente',
          subtitle: 'Saldo pendiente de clientes',
          color: 'turquoise'
        }
      ],
      'compras': [
        {
          title: 'Órdenes Pendientes',
          icon: '📄',
          value: 'Próximamente',
          subtitle: 'Órdenes de compra sin recibir',
          color: 'blue'
        }
      ]
    };

    const rolePlaceholders = placeholders[roleConfig.sections[0]] || [];
    
    rolePlaceholders.forEach(placeholder => {
      const card = document.createElement('div');
      card.className = 'admin-stat-card';
      
      // Si tiene link, hacer la tarjeta clickeable
      if (placeholder.link) {
        card.style.cursor = 'pointer';
        card.style.transition = 'transform 0.2s, box-shadow 0.2s';
        card.addEventListener('mouseenter', () => {
          card.style.transform = 'translateY(-2px)';
          card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        });
        card.addEventListener('mouseleave', () => {
          card.style.transform = 'translateY(0)';
          card.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
        });
        card.addEventListener('click', () => {
          window.location.href = placeholder.link;
        });
      }
      
      card.innerHTML = `
        <div class="admin-stat-header">
          <div class="admin-stat-content">
            <h3>${placeholder.title}</h3>
            <div class="admin-stat-value">${placeholder.value}</div>
            <div class="admin-stat-change neutral">
              ${placeholder.subtitle}
            </div>
          </div>
          <div class="admin-stat-icon ${placeholder.color}">${placeholder.icon}</div>
        </div>
      `;
      statsGrid.appendChild(card);
    });
  }

  /**
   * Oculta la tabla de pedidos recientes para roles que no deben verla
   */
  function setupOrdersTableVisibility(roleConfig) {
    const ordersContainer = document.querySelector('.admin-table-container');
    
    if (!ordersContainer) return;

    if (!roleConfig.fetchOrders) {
      ordersContainer.style.display = 'none';
      console.log('🚫 [DASHBOARD] Ocultando tabla de pedidos recientes');
    } else {
      ordersContainer.style.display = 'block';
      console.log('✅ [DASHBOARD] Mostrando tabla de pedidos recientes');
    }
  }

  /**
   * TAREA 3: Crea panel personalizado para rol inventarios
   */
  function createInventariosWelcomePanel() {
    const userRole = getUserRole();
    if (userRole !== 'inventarios') return;
    
    const statsGrid = document.querySelector('.admin-stats-grid');
    if (!statsGrid) return;
    
    // Crear panel de bienvenida operativo
    const welcomePanel = document.createElement('div');
    welcomePanel.className = 'admin-stat-card';
    welcomePanel.style.gridColumn = '1 / -1'; // Ocupar todo el ancho
    welcomePanel.style.background = 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)';
    welcomePanel.style.border = '2px solid #F97316';
    welcomePanel.innerHTML = `
      <div style="padding: 1.5rem;">
        <h2 style="margin: 0 0 0.5rem 0; color: #F97316; font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
          📦 Resumen Operativo de Almacén
        </h2>
        <p style="margin: 0 0 1rem 0; color: #78350f; font-size: 0.95rem;">
          Bienvenido al panel de gestión de inventario. Desde aquí puedes acceder rápidamente a tus herramientas de trabajo.
        </p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
          <div style="background: white; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #3b82f6;">
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.25rem;">Acceso Rápido</div>
            <div style="font-weight: 600; color: #1e293b;">Gestión de Pedidos</div>
          </div>
          <div style="background: white; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #10b981;">
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.25rem;">Control</div>
            <div style="font-weight: 600; color: #1e293b;">Inventario Físico</div>
          </div>
          <div style="background: white; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #f59e0b;">
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.25rem;">Registro</div>
            <div style="font-weight: 600; color: #1e293b;">Ajustes y Mermas</div>
          </div>
          <div style="background: white; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #8b5cf6;">
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.25rem;">Auditoría</div>
            <div style="font-weight: 600; color: #1e293b;">Toma de Inventario</div>
          </div>
        </div>
      </div>
    `;
    
    // Insertar al inicio del grid
    statsGrid.insertBefore(welcomePanel, statsGrid.firstChild);
    console.log('✅ [DASHBOARD] Panel de bienvenida creado para inventarios');
  }

  /**
   * Intercepta las funciones de carga de datos según el rol
   */
  function interceptDataLoading(roleConfig) {
    // Guardar referencias originales
    const originalLoadStats = window.loadDashboardStats;
    const originalLoadOrders = window.loadRecentOrders;

    // Sobrescribir loadDashboardStats
    if (typeof originalLoadStats === 'function') {
      window.loadDashboardStats = async function() {
        if (roleConfig.fetchStats) {
          console.log('✅ [DASHBOARD] Cargando estadísticas...');
          return await originalLoadStats();
        } else {
          console.log('🚫 [DASHBOARD] Estadísticas no permitidas para este rol');
          return Promise.resolve();
        }
      };
    }

    // Sobrescribir loadRecentOrders
    if (typeof originalLoadOrders === 'function') {
      window.loadRecentOrders = async function() {
        if (roleConfig.fetchOrders) {
          console.log('✅ [DASHBOARD] Cargando pedidos recientes...');
          return await originalLoadOrders();
        } else {
          console.log('🚫 [DASHBOARD] Pedidos no permitidos para este rol');
          return Promise.resolve();
        }
      };
    }
  }

  /**
   * Inicializa el dashboard modular
   */
  function initModularDashboard() {
    console.log('🚀 [DASHBOARD] Inicializando dashboard modular...');
    
    const roleConfig = setupDashboardVisibility();
    setupOrdersTableVisibility(roleConfig);
    createInventariosWelcomePanel(); // TAREA 3: Panel personalizado para inventarios
    createRolePlaceholders(roleConfig);
    interceptDataLoading(roleConfig);
    
    console.log('✅ [DASHBOARD] Dashboard modular configurado correctamente');
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModularDashboard);
  } else {
    initModularDashboard();
  }

  // Exportar para uso manual
  window.DashboardModular = {
    init: initModularDashboard,
    getUserRole: getUserRole
  };

})();
