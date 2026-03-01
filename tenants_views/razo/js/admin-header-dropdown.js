/**
 * Admin Header Dropdown
 * Añade un dropdown al área del usuario en el header
 * con opciones específicas según el rol (super-admin)
 */

(function () {
  "use strict";

  /**
   * Decodifica el payload de un JWT sin verificar la firma
   */
  function decodeJWT(token) {
    try {
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = parts[1];
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error("Error decodificando JWT:", error);
      return null;
    }
  }

  /**
   * Verifica si el usuario actual es super-administrador
   */
  function isSuperAdmin() {
    const token = localStorage.getItem("razoconnect_admin_token");
    if (!token) return false;

    const payload = decodeJWT(token);
    if (!payload) return false;

    // Verificar en el array de roles
    if (Array.isArray(payload.roles)) {
      return payload.roles.some(
        (role) =>
          role &&
          (role.toLowerCase() === "superadmin" ||
            role.toLowerCase() === "super-admin")
      );
    }

    // Verificar el campo 'rol' individual
    if (payload.rol) {
      return (
        payload.rol.toLowerCase() === "superadmin" ||
        payload.rol.toLowerCase() === "super-admin"
      );
    }

    return false;
  }

  /**
   * Crea el HTML del dropdown
   */
  function createDropdownMenu() {
    const menu = document.createElement("div");
    menu.className = "admin-user-dropdown";
    menu.id = "adminUserDropdown";
    menu.style.display = "none";

    let menuItems = "";

    // Opciones comunes para todos
    menuItems += `
      <a href="/staff-notificaciones.html" class="admin-dropdown-item">
        <span class="admin-dropdown-icon">🔔</span>
        <span>Notificaciones</span>
      </a>
      <div class="admin-dropdown-divider"></div>
    `;

    // Si es super-admin, agregar opción de crear administrador
    if (isSuperAdmin()) {
      menuItems += `
        <a href="/admin-nuevo-admin.html" class="admin-dropdown-item">
          <span class="admin-dropdown-icon">👤</span>
          <span>Agregar Admin</span>
        </a>
        <div class="admin-dropdown-divider"></div>
      `;
    }

    menuItems += `
      <button class="admin-dropdown-item" id="dropdownLogout">
        <span class="admin-dropdown-icon">🚪</span>
        <span>Cerrar sesión</span>
      </button>
    `;

    menu.innerHTML = menuItems;
    return menu;
  }

  /**
   * Maneja el toggle del dropdown
   */
  function toggleDropdown() {
    const dropdown = document.getElementById("adminUserDropdown");
    if (!dropdown) return;

    const isVisible = dropdown.style.display === "block";
    dropdown.style.display = isVisible ? "none" : "block";
  }

  /**
   * Cierra el dropdown cuando se hace clic fuera
   */
  function handleClickOutside(event) {
    const userInfo = document.querySelector(".admin-user-info");
    const dropdown = document.getElementById("adminUserDropdown");

    if (
      dropdown &&
      userInfo &&
      !userInfo.contains(event.target) &&
      !dropdown.contains(event.target)
    ) {
      dropdown.style.display = "none";
    }
  }

  /**
   * Maneja el logout
   */
  async function handleLogout() {
    try {
      // Usar AuthManager.logout si está disponible
      if (typeof window.AuthManager !== 'undefined' && typeof AuthManager.logout === 'function') {
        await AuthManager.logout('admin');
      }
      
      // Limpiar todos los tokens manualmente (legacy + nuevos)
      const keysToRemove = [
        'razoconnect_admin_token',
        'razoconnect_admin',
        'razoconnect_admin_access_token',
        'razoconnect_admin_refresh_token',
        'razoconnect_token',
        'razoconnect_user',
        'razoconnect_access_token',
        'razoconnect_refresh_token',
        'razoconnect_agent_token',
        'razoconnect_agent',
        'razoconnect_agent_access_token',
        'razoconnect_agent_refresh_token',
      ];
      
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (err) {
          console.error(`Error removing ${key}:`, err);
        }
      });
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
    
    window.location.href = "/login.html";
  }

  /**
   * Inicializa el dropdown
   */
  function init() {
    // Si la página ya usa (o fue migrada a) header compartido, no inicializar dropdown legacy
    const path = (window.location.pathname || "").toLowerCase();
    if (
      document.getElementById("admin-header-container") ||
      document.getElementById("userDropdownMenu") ||
      path.startsWith("/admin")
    ) {
      return;
    }

    // Esperar a que el DOM y el sidebar estén cargados
    setTimeout(() => {
      const userInfo = document.querySelector(".admin-user-info");

      if (!userInfo) {
        return;
      }

      // Hacer que el área del usuario sea clickeable
      userInfo.style.cursor = "pointer";
      userInfo.style.position = "relative";

      // Crear y añadir el dropdown
      const dropdown = createDropdownMenu();
      userInfo.appendChild(dropdown);

      // Event listener para toggle
      userInfo.addEventListener("click", (e) => {
        // Solo toggle si no se hizo clic en el dropdown mismo
        if (!e.target.closest(".admin-user-dropdown")) {
          toggleDropdown();
        }
      });

      // Event listener para cerrar al hacer clic fuera
      document.addEventListener("click", handleClickOutside);

      // Event listener para el botón de logout del dropdown
      const logoutBtn = document.getElementById("dropdownLogout");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
      }
    }, 500); // Dar tiempo a que se cargue el sidebar
  }

  // Inicializar cuando el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
