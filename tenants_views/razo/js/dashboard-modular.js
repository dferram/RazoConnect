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
      customMessage: 'Resumen Financiero',
      blockedReports: ['reportes_inventario', 'conciliacion', 'reportes_recepciones']
    },
    'compras': {
      cards: [],
      fetchStats: false,
      fetchOrders: false,
      sections: ['compras'],
      customMessage: 'Gestión de Compras',
      loadCustomStats: true
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
          value: 'Cargando...',
          subtitle: 'Gestiona cobranza de clientes',
          color: 'turquoise',
          link: '/admin-cxc.html',
          id: 'card-cxc'
        },
        {
          title: 'Cuentas por Pagar',
          icon: '🧮',
          value: 'Cargando...',
          subtitle: 'Gestiona pagos a proveedores',
          color: 'red',
          link: '/admin-cuentaspagar.html',
          id: 'card-cxp'
        },
        {
          title: 'Comisiones',
          icon: '💰',
          value: 'Cargando...',
          subtitle: 'Comisiones de agentes',
          color: 'yellow',
          link: '/admin-comisiones.html',
          id: 'card-comisiones'
        },
        {
          title: 'Validar Pagos',
          icon: '✓',
          value: 'Revisar',
          subtitle: 'Validación de comprobantes',
          color: 'green',
          link: '/admin-validar-pagos.html',
          id: 'card-pagos'
        }
      ],
      'compras': [
        {
          title: 'Órdenes Pendientes',
          icon: '📄',
          value: 'Cargando...',
          subtitle: 'Órdenes sin recibir',
          color: 'orange',
          link: '/admin-ordenes-compra.html',
          id: 'card-ordenes-pendientes'
        },
        {
          title: 'En Tránsito',
          icon: '🚚',
          value: 'Cargando...',
          subtitle: 'Órdenes en camino',
          color: 'blue',
          link: '/admin-ordenes-compra.html',
          id: 'card-ordenes-transito'
        },
        {
          title: 'Valor Órdenes Activas',
          icon: '💰',
          value: 'Cargando...',
          subtitle: 'Inversión en tránsito',
          color: 'turquoise',
          link: '/admin-ordenes-compra.html',
          id: 'card-valor-activas'
        },
        {
          title: 'Recibir Inventario',
          icon: '📥',
          value: 'Iniciar',
          subtitle: 'Recepciones del mes',
          color: 'green',
          link: '/admin-recibir-inventario.html',
          id: 'card-recepciones'
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
   * Carga totales financieros desde endpoints individuales
   * Maneja 403 errors ocultando las cards en lugar de mostrar "Cargando..." infinito
   */
  async function loadFinanzasTotales() {
    const userRole = getUserRole();
    if (userRole !== 'finanzas' && userRole !== 'gerente_finanzas') return;

    const token = localStorage.getItem('razoconnect_admin_token');
    if (!token) {
      console.warn('⚠️ [DASHBOARD] No hay token, no se pueden cargar totales');
      hideAllFinanzasCards();
      return;
    }

    console.log('🔄 [DASHBOARD] Cargando totales financieros...');

    // Cargar CXC con manejo de 403
    try {
      const cxcResponse = await fetch('/api/admin/cxc-summary', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (cxcResponse.status === 403) {
        console.warn('⚠️ [DASHBOARD] 403 Forbidden en CXC - Ocultando card');
        hideCardByTitle('Cuentas por Cobrar');
      } else if (cxcResponse.ok) {
        const cxcData = await cxcResponse.json();
        if (cxcData.success && cxcData.data) {
          updateCardValue('card-cxc', 
            `$${(cxcData.data.totalCobrar || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}`,
            `${cxcData.data.conteoClientes || 0} clientes con deuda`
          );
        }
      } else {
        hideCardByTitle('Cuentas por Cobrar');
      }
    } catch (error) {
      console.error('❌ [DASHBOARD] Error cargando CXC:', error);
      hideCardByTitle('Cuentas por Cobrar');
    }

    // Cargar CXP con manejo de 403
    try {
      const cxpResponse = await fetch('/api/admin/cuentas-por-pagar/kpis', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (cxpResponse.status === 403) {
        console.warn('⚠️ [DASHBOARD] 403 Forbidden en CXP - Ocultando card');
        hideCardByTitle('Cuentas por Pagar');
      } else if (cxpResponse.ok) {
        const cxpData = await cxpResponse.json();
        if (cxpData.success && cxpData.data) {
          updateCardValue('card-cxp',
            `$${(cxpData.data.total_por_pagar || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}`,
            `Vencido: $${(cxpData.data.vencido || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}`
          );
        }
      } else {
        hideCardByTitle('Cuentas por Pagar');
      }
    } catch (error) {
      console.error('❌ [DASHBOARD] Error cargando CXP:', error);
      hideCardByTitle('Cuentas por Pagar');
    }

    // Cargar Comisiones con manejo de 403
    try {
      const comisionesResponse = await fetch('/api/admin/comisiones', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (comisionesResponse.status === 403) {
        console.warn('⚠️ [DASHBOARD] 403 Forbidden en Comisiones - Ocultando card');
        hideCardByTitle('Comisiones');
      } else if (comisionesResponse.ok) {
        const comisionesData = await comisionesResponse.json();
        if (comisionesData.success && comisionesData.data) {
          const totales = comisionesData.data.totales;
          if (totales) {
            updateCardValue('card-comisiones',
              `$${(totales.montoTotal || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}`,
              `${totales.totalPendientes || 0} pendientes`
            );
          }
        }
      } else {
        hideCardByTitle('Comisiones');
      }
    } catch (error) {
      console.error('❌ [DASHBOARD] Error cargando Comisiones:', error);
      hideCardByTitle('Comisiones');
    }

    console.log('✅ [DASHBOARD] Carga de totales financieros completada');
  }

  /**
   * Oculta una card por su título
   */
  function hideCardByTitle(title) {
    const cards = document.querySelectorAll('.admin-stat-card');
    cards.forEach(card => {
      const titleElement = card.querySelector('h3');
      if (titleElement && titleElement.textContent.trim() === title) {
        card.style.display = 'none';
        console.log(`🚫 [DASHBOARD] Card ocultada: ${title}`);
      }
    });
  }

  /**
   * Oculta todas las cards financieras si no hay token
   */
  function hideAllFinanzasCards() {
    hideCardByTitle('Cuentas por Cobrar');
    hideCardByTitle('Cuentas por Pagar');
    hideCardByTitle('Comisiones');
    console.log('🚫 [DASHBOARD] Todas las cards financieras ocultadas');
  }

  /**
   * Actualiza el valor de una tarjeta por su ID
   */
  function updateCardValue(cardId, value, subtitle) {
    const cards = document.querySelectorAll('.admin-stat-card');
    cards.forEach(card => {
      const valueElement = card.querySelector('.admin-stat-value');
      const subtitleElement = card.querySelector('.admin-stat-change');
      
      // Buscar la tarjeta por el contenido del título o por data attribute
      const titleElement = card.querySelector('h3');
      if (!titleElement) return;
      
      const cardTitle = titleElement.textContent.trim();
      let matchesCard = false;
      
      if (cardId === 'card-cxc' && cardTitle === 'Cuentas por Cobrar') matchesCard = true;
      if (cardId === 'card-cxp' && cardTitle === 'Cuentas por Pagar') matchesCard = true;
      if (cardId === 'card-comisiones' && cardTitle === 'Comisiones') matchesCard = true;
      
      if (matchesCard && valueElement && subtitleElement) {
        valueElement.textContent = value;
        subtitleElement.textContent = subtitle;
        console.log(`✅ [DASHBOARD] Actualizada tarjeta: ${cardTitle}`);
      }
    });
  }

  /**
   * Crea una tarjeta financiera con datos
   */
  function createFinanzasCard(data) {
    const card = document.createElement('div');
    card.className = 'admin-stat-card';
    
    if (data.link) {
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
        window.location.href = data.link;
      });
    }
    
    card.innerHTML = `
      <div class="admin-stat-header">
        <div class="admin-stat-content">
          <h3>${data.title}</h3>
          <div class="admin-stat-value">${data.value}</div>
          <div class="admin-stat-change neutral">
            ${data.subtitle}
          </div>
        </div>
        <div class="admin-stat-icon ${data.color}">${data.icon}</div>
      </div>
    `;
    
    return card;
  }

  /**
   * Carga totales de compras desde el backend
   * Actualiza las tarjetas con datos reales
   */
  async function loadComprasTotales() {
    const userRole = getUserRole();
    if (userRole !== 'compras') return;

    const token = localStorage.getItem('razoconnect_admin_token');
    if (!token) {
      console.warn('⚠️ [DASHBOARD] No hay token, no se pueden cargar totales de compras');
      return;
    }

    console.log('🔄 [DASHBOARD] Cargando totales de compras...');

    try {
      const response = await fetch('/api/admin/dashboard/compras-totales', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 403) {
        console.warn('⚠️ [DASHBOARD] 403 Forbidden en Compras - Sin permisos');
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        const data = result.data;
        
        // Actualizar Órdenes Pendientes
        updateComprasCardValue('Órdenes Pendientes', 
          data.ordenes.pendientes.toString(),
          'Órdenes sin recibir'
        );

        // Actualizar En Tránsito
        updateComprasCardValue('En Tránsito',
          data.ordenes.enTransito.toString(),
          'Órdenes en camino'
        );

        // Actualizar Valor Órdenes Activas
        updateComprasCardValue('Valor Órdenes Activas',
          `$${data.ordenes.valorActivas.toLocaleString('es-MX', {minimumFractionDigits: 2})}`,
          'Inversión en tránsito'
        );

        // Actualizar Recepciones
        updateComprasCardValue('Recibir Inventario',
          `${data.recepciones.totalRecepcionesMes} recepciones`,
          `${data.recepciones.totalPiezasRecibidas.toLocaleString('es-MX')} piezas`
        );

        console.log('✅ [DASHBOARD] Totales de compras actualizados');
      }
    } catch (error) {
      console.error('❌ [DASHBOARD] Error cargando totales de compras:', error);
    }
  }

  /**
   * Actualiza el valor de una tarjeta de compras por su título
   */
  function updateComprasCardValue(title, value, subtitle) {
    const cards = document.querySelectorAll('.admin-stat-card');
    cards.forEach(card => {
      const titleElement = card.querySelector('h3');
      if (titleElement && titleElement.textContent.trim() === title) {
        const valueElement = card.querySelector('.admin-stat-value');
        const subtitleElement = card.querySelector('.admin-stat-change');
        
        if (valueElement) {
          valueElement.textContent = value;
        }
        if (subtitleElement) {
          subtitleElement.textContent = subtitle;
        }
        console.log(`✅ [DASHBOARD] Actualizada tarjeta de compras: ${title}`);
      }
    });
  }

  /**
   * Crea panel personalizado para rol compras
   */
  function createComprasWelcomePanel() {
    const userRole = getUserRole();
    if (userRole !== 'compras') return;
    
    const statsGrid = document.querySelector('.admin-stats-grid');
    if (!statsGrid) return;
    
    // Crear panel de bienvenida de compras
    const welcomePanel = document.createElement('div');
    welcomePanel.className = 'admin-stat-card';
    welcomePanel.style.gridColumn = '1 / -1'; // Ocupar todo el ancho
    welcomePanel.style.background = 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)';
    welcomePanel.style.border = '2px solid #3B82F6';
    welcomePanel.innerHTML = `
      <div style="padding: 1.5rem;">
        <h2 style="margin: 0 0 0.5rem 0; color: #3B82F6; font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
          🏭 Panel de Gestión de Compras
        </h2>
        <p style="margin: 0 0 1rem 0; color: #1e40af; font-size: 0.95rem;">
          Bienvenido al panel de compras. Gestiona órdenes de compra, proveedores y recepciones de inventario.
        </p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
          <div style="background: white; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #f97316;">
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.25rem;">Gestión</div>
            <div style="font-weight: 600; color: #1e293b;">Órdenes de Compra</div>
          </div>
          <div style="background: white; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #3b82f6;">
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.25rem;">Proveedores</div>
            <div style="font-weight: 600; color: #1e293b;">Catálogo de Proveedores</div>
          </div>
          <div style="background: white; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #10b981;">
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.25rem;">Recepción</div>
            <div style="font-weight: 600; color: #1e293b;">Recibir Inventario</div>
          </div>
          <div style="background: white; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #8b5cf6;">
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.25rem;">Reportes</div>
            <div style="font-weight: 600; color: #1e293b;">Análisis de Recepciones</div>
          </div>
        </div>
      </div>
    `;
    
    // Insertar al inicio del grid
    statsGrid.insertBefore(welcomePanel, statsGrid.firstChild);
    
    // Cargar totales dinámicamente
    loadComprasTotales();
    
    console.log('✅ [DASHBOARD] Panel de bienvenida creado para compras');
  }

  /**
   * Crea panel personalizado para rol finanzas
   */
  function createFinanzasWelcomePanel() {
    const userRole = getUserRole();
    if (userRole !== 'finanzas') return;
    
    const statsGrid = document.querySelector('.admin-stats-grid');
    if (!statsGrid) return;
    
    // Crear panel de bienvenida financiero
    const welcomePanel = document.createElement('div');
    welcomePanel.className = 'admin-stat-card';
    welcomePanel.style.gridColumn = '1 / -1'; // Ocupar todo el ancho
    welcomePanel.style.background = 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)';
    welcomePanel.style.border = '2px solid #10B981';
    welcomePanel.innerHTML = `
      <div style="padding: 1.5rem;">
        <h2 style="margin: 0 0 0.5rem 0; color: #10B981; font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
          💰 Panel de Control Financiero
        </h2>
        <p style="margin: 0 0 1rem 0; color: #065f46; font-size: 0.95rem;">
          Bienvenido al panel de gestión financiera. Administra cuentas por cobrar, cuentas por pagar y validación de pagos.
        </p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
          <div style="background: white; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #06b6d4;">
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.25rem;">Cobranza</div>
            <div style="font-weight: 600; color: #1e293b;">Cuentas por Cobrar</div>
          </div>
          <div style="background: white; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #ef4444;">
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.25rem;">Pagos</div>
            <div style="font-weight: 600; color: #1e293b;">Cuentas por Pagar</div>
          </div>
          <div style="background: white; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #10b981;">
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.25rem;">Validación</div>
            <div style="font-weight: 600; color: #1e293b;">Comprobantes de Pago</div>
          </div>
          <div style="background: white; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #f59e0b;">
            <div style="font-size: 0.875rem; color: #64748b; margin-bottom: 0.25rem;">Comisiones</div>
            <div style="font-weight: 600; color: #1e293b;">Gestión de Agentes</div>
          </div>
        </div>
      </div>
    `;
    
    // Insertar al inicio del grid
    statsGrid.insertBefore(welcomePanel, statsGrid.firstChild);
    
    // Cargar totales dinámicamente
    loadFinanzasTotales();
    
    console.log('✅ [DASHBOARD] Panel de bienvenida creado para finanzas');
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
    createInventariosWelcomePanel(); // Panel personalizado para inventarios
    createFinanzasWelcomePanel(); // Panel personalizado para finanzas
    createComprasWelcomePanel(); // Panel personalizado para compras
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
