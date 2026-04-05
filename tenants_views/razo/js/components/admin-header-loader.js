(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("admin-header-container");
    if (!container) return;

    fetch("/components/admin-header.html")
      .then((response) => response.text())
      .then((html) => {
        container.innerHTML = html;
        asegurarAliasesLegacy(container);
        initializeHeader();
      })
      .catch((err) => console.error("Error cargando header:", err));
  });

  function asegurarAliasesLegacy(container) {
    if (!container) return;

    const existing = document.getElementById("adminHeaderLegacyAliases");
    if (existing) return;

    const wrapper = document.createElement("div");
    wrapper.id = "adminHeaderLegacyAliases";
    wrapper.style.display = "none";
    wrapper.innerHTML = `
      <span id="adminHeaderTitle"></span>
      <span id="userName"></span>
      <span id="userRole"></span>
      <span id="userAvatar"></span>
    `;
    container.appendChild(wrapper);
  }

  function getIniciales(nombre) {
    const parts = (nombre || "")
      .toString()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!parts.length) return "AD";
    const first = parts[0]?.charAt(0) || "A";
    const second = parts.length >= 2 ? parts[1]?.charAt(0) : parts[0]?.charAt(1);
    return `${first}${second || ""}`.toUpperCase();
  }

  /**
   * FASE 2 - TASK 1: Mapeo de roles a nombres legibles
   * Convierte el rol técnico a un nombre amigable para mostrar en el header
   */
  function getRoleDisplayName(rol) {
    // Validar que el rol existe y no está vacío
    if (!rol || typeof rol !== 'string') {
      return 'Administrador';
    }
    
    const roleLower = rol.toString().toLowerCase().trim();
    
    // Si el rol está vacío después de trim, retornar default
    if (!roleLower) {
      return 'Administrador';
    }
    
    const roleMap = {
      'super_admin': 'Dueño de Tienda',
      'superadmin': 'Dueño de Tienda',
      'super admin': 'Dueño de Tienda',
      'super-admin': 'Dueño de Tienda',
      'admin': 'Dueño de Tienda',
      'inventarios': 'Inventarios',
      'catalogo': 'Catálogo',
      'finanzas': 'Finanzas',
      'compras': 'Compras',
      'agente': 'Agente de Ventas',
      // Legacy roles que aún pueden existir en algunos usuarios
      'gerente_finanzas': 'Finanzas',
      'gerente_operaciones': 'Operaciones',
      'gerente_comercial': 'Comercial',
      'contador': 'Finanzas',
      'jefe_almacen': 'Inventarios',
      'almacenista': 'Inventarios'
    };
    
    return roleMap[roleLower] || 'Administrador';
  }

  function initializeHeader() {
    console.log("🔄 Inicializando header...");
    
    // Esperar a que los elementos del header existan antes de llenar datos
    waitForElements(['headerUserName', 'headerUserRole', 'headerUserAvatar'], () => {
      loadHeaderData();
    });
  }

  // Función auxiliar para esperar a que múltiples elementos existan
  function waitForElements(elementIds, callback, maxAttempts = 50) {
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      const allExist = elementIds.every(id => document.getElementById(id));
      
      if (allExist) {
        clearInterval(checkInterval);
        console.log('✅ Elementos del header encontrados');
        callback();
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.warn('⚠️ Timeout esperando elementos del header. Intentando llenar datos de todos modos...');
        callback();
      }
    }, 50);
  }

  function loadHeaderData() {
    let adminData;
    try {
      const storedData = localStorage.getItem("razoconnect_admin");
      if (!storedData) {
        throw new Error("No hay datos de admin en localStorage");
      }
      
      adminData = JSON.parse(storedData);
      
      // Validar que tenga al menos nombre y rol
      if (!adminData || typeof adminData !== 'object') {
        throw new Error("Datos de admin inválidos");
      }
    } catch (recoveryError) {
      console.error("❌ No se pudo recuperar datos del header:", recoveryError);
      // Intentar con datos mínimos
      adminData = {
        nombre: "Usuario",
        rol: "admin"
      };
    }

    // Construir nombre completo preferiendo nombre + apellido
    // MEJORA: Validar que nombre y apellido NO sean vacíos/null antes de usar
    let nombreCompleto = "Usuario";
    if (adminData && adminData.nombre) {
      const nombre = adminData.nombre.toString().trim();
      const apellido = (adminData.apellido && adminData.apellido.toString().trim()) || '';
      
      if (nombre) { // Validar que nombre no esté vacío
        if (apellido) {
          nombreCompleto = `${nombre} ${apellido}`;
        } else {
          nombreCompleto = nombre;
        }
      }
    }
    
    // Asegurar que nombre y rol sean strings válidos
    const nombre = nombreCompleto || "Usuario";
    const rolSession = (adminData?.rol || adminData?.role || "admin").toString().trim() || "admin";
    const rolRaw = rolSession.toLowerCase();
    const isSuperAdmin = rolRaw === "super admin" || rolRaw === "superadmin" || rolRaw === "super-admin" || rolRaw === "super_admin" || rolRaw === "admin";
    
    // FASE 2 - TASK 1: Usar nombre de rol específico en lugar de genérico
    const rolTexto = getRoleDisplayName(rolSession);
    
    // Logs para debugging
    console.log("📋 Datos del header:", { 
      nombreCompleto, 
      rol: rolSession, 
      rolTexto,
      rawData: adminData 
    });
    console.log('🔍 ROL MAPEADO:', rolSession.toLowerCase(), '→', rolTexto);
    
    // Sin restricciones de rol - Admin y SuperAdmin tienen acceso a todas las páginas

    // Llenar datos en el Header
    const headerUserName = document.getElementById("headerUserName");
    const headerUserRole = document.getElementById("headerUserRole");
    const headerUserAvatar = document.getElementById("headerUserAvatar");

    if (headerUserName) {
      headerUserName.textContent = nombre;
      console.log('✅ headerUserName actualizado:', nombre);
    } else {
      console.warn('⚠️ elemento headerUserName no encontrado');
    }

    if (headerUserRole) {
      headerUserRole.textContent = rolTexto;
      console.log('✅ headerUserRole actualizado:', rolTexto);
    } else {
      console.warn('⚠️ elemento headerUserRole no encontrado');
    }

    if (headerUserAvatar) {
      headerUserAvatar.textContent = getIniciales(nombre);
      console.log('✅ headerUserAvatar actualizado:', getIniciales(nombre));
      // Aplicar clase super-admin para badge naranja
      if (isSuperAdmin) {
        headerUserAvatar.classList.add('super-admin');
      } else {
        headerUserAvatar.classList.remove('super-admin');
      }
    } else {
      console.warn('⚠️ elemento headerUserAvatar no encontrado');
    }

    // Backwards compat IDs
    const legacyUserName = document.getElementById("userName");
    const legacyUserRole = document.getElementById("userRole");
    const legacyUserAvatar = document.getElementById("userAvatar");
    const legacyAdminName = document.getElementById("admin-name");
    if (legacyUserName) legacyUserName.textContent = nombre;
    if (legacyUserRole) legacyUserRole.textContent = rolTexto;
    if (legacyUserAvatar) legacyUserAvatar.textContent = getIniciales(nombre);
    if (legacyAdminName) legacyAdminName.textContent = nombre;

    // 2.1 Dropdown dinámico (evitar duplicados)
    const dropdownContainer = document.getElementById("user-dropdown-container");
    if (dropdownContainer) {
      dropdownContainer.innerHTML = "";

      const header = document.createElement("div");
      header.className = "dropdown-header";
      header.innerHTML = `
        <span class="d-block small text-muted">Conectado como</span>
        <strong>${nombre}</strong>
      `;

      const divider1 = document.createElement("hr");
      divider1.className = "dropdown-divider";

      const linkNotificaciones = document.createElement("a");
      linkNotificaciones.href = "/staff-notificaciones.html";
      linkNotificaciones.className = "dropdown-item";
      linkNotificaciones.style.position = "relative";
      linkNotificaciones.innerHTML = `<i class="bi bi-bell"></i> Notificaciones<span id="notificationBadgeAdmin" class="notification-badge" style="display: none; position: absolute; top: 50%; right: 12px; transform: translateY(-50%); background: #EF4444; border-radius: 50%; width: 8px; height: 8px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></span>`;

      const itemsFragment = document.createDocumentFragment();
      itemsFragment.appendChild(header);
      itemsFragment.appendChild(divider1);
      itemsFragment.appendChild(linkNotificaciones);

      if (isSuperAdmin) {
        const linkAgregarAdmin = document.createElement("a");
        linkAgregarAdmin.href = "/admin-nuevo-admin.html";
        linkAgregarAdmin.className = "dropdown-item";
        linkAgregarAdmin.innerHTML = `<i class="bi bi-person-plus"></i> Agregar Admin`;
        itemsFragment.appendChild(linkAgregarAdmin);
      }

      const divider2 = document.createElement("hr");
      divider2.className = "dropdown-divider";

      const linkLogout = document.createElement("a");
      linkLogout.href = "#";
      linkLogout.className = "dropdown-item text-danger";
      linkLogout.id = "btnLogout";
      linkLogout.innerHTML = `<i class="bi bi-box-arrow-right"></i> Cerrar Sesión`;
      linkLogout.addEventListener("click", async (e) => {
        e.preventDefault();
        
        try {
          // Usar AuthManager.logout si está disponible
          if (typeof window.AuthManager !== 'undefined' && typeof AuthManager.logout === 'function') {
            await AuthManager.logout('admin');
          }
          
          // Limpiar todos los tokens manualmente
          const keysToRemove = [
            'razoconnect_admin_token',
            'razoconnect_admin',
            'razoconnect_admin_access_token',
            'razoconnect_admin_refresh_token',
            'razoconnect_token',
            'razoconnect_user',
            'razoconnect_agent_token',
            'razoconnect_agent',
          ];
          
          keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (error) {
          console.error("Error al cerrar sesión:", error);
        }
        
        window.location.href = "/login.html";
      });

      itemsFragment.appendChild(divider2);
      itemsFragment.appendChild(linkLogout);

      dropdownContainer.appendChild(itemsFragment);
    }

    // 2. Título de la Página
    const pageTitle = document.body?.getAttribute("data-page-title") || document.title;
    const headerPageTitle = document.getElementById("headerPageTitle");
    if (headerPageTitle) headerPageTitle.textContent = pageTitle;
    const legacyTitle = document.getElementById("adminHeaderTitle");
    if (legacyTitle) legacyTitle.textContent = pageTitle;

    // 3. Lógica del Dropdown (Toggle)
    const trigger = document.getElementById("userMenuTrigger");
    const menu = document.getElementById("userDropdownMenu");

    if (trigger && menu) {
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.toggle("show");
      });

      document.addEventListener("click", (e) => {
        if (!menu.contains(e.target) && !trigger.contains(e.target)) {
          menu.classList.remove("show");
        }
      });
    }

    // Nota: logout se enlaza en el dropdown dinámico.

    // 4. Cargar contador de notificaciones
    loadNotificationCount();
    
    // Actualizar cada 30 segundos
    setInterval(loadNotificationCount, 30000);
  }

  async function loadNotificationCount() {
    try {
      // CRITICAL FIX: Role-aware notification loading
      // Finanzas role should NOT call staff endpoints to avoid 403 errors
      const adminData = JSON.parse(localStorage.getItem('razoconnect_admin') || '{}');
      const userRole = (adminData.rol || adminData.role || '').toString().toLowerCase().trim();
      
      if (userRole === 'finanzas') {
        console.log('🚫 [HEADER] Rol finanzas - Notificaciones de staff no disponibles');
        return;
      }
      
      let response;
      
      if (typeof window.AuthManager !== 'undefined') {
        // Usar AuthManager con silent refresh
        response = await AuthManager.fetchWithAuth('/api/staff/notificaciones/unread-count', {
          method: 'GET',
          context: 'admin'
        });
      } else {
        // Fallback a método legacy
        const token = localStorage.getItem('razoconnect_admin_token');
        if (!token) return;

        response = await fetch('/api/staff/notificaciones/unread-count', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      }

      if (!response.ok) return;

      const data = await response.json();
      const count = data.count || 0;

      const badge = document.getElementById('notificationBadgeAdmin');

      if (badge) {
        if (count > 0) {
          badge.style.display = 'block';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    }
  }
})();
