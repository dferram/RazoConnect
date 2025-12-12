/**
 * Agente Header Dropdown
 * Añade un dropdown al área del usuario en el header del agente
 * con opciones para navegar y cerrar sesión
 */

(function () {
  "use strict";

  /**
   * Crea el HTML del dropdown para agentes
   */
  function createDropdownMenu() {
    const menu = document.createElement("div");
    menu.className = "admin-user-dropdown";
    menu.id = "agenteUserDropdown";
    menu.style.display = "none";

    const menuItems = `
      <a href="/agente-dashboard.html" class="admin-dropdown-item">
        <span class="admin-dropdown-icon">📊</span>
        <span>Dashboard</span>
      </a>
      <a href="/agente-cartera.html" class="admin-dropdown-item">
        <span class="admin-dropdown-icon">👥</span>
        <span>Mi cartera</span>
      </a>
      <a href="/agente-pedidos.html" class="admin-dropdown-item">
        <span class="admin-dropdown-icon">📦</span>
        <span>Mis pedidos</span>
      </a>
      <a href="/agente-comisiones.html" class="admin-dropdown-item">
        <span class="admin-dropdown-icon">💰</span>
        <span>Mis comisiones</span>
      </a>
      <a href="/staff-notificaciones.html" class="admin-dropdown-item">
        <span class="admin-dropdown-icon">🔔</span>
        <span>Notificaciones</span>
      </a>
      <div class="admin-dropdown-divider"></div>
      <button class="admin-dropdown-item" id="dropdownLogoutAgente">
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
    const dropdown = document.getElementById("agenteUserDropdown");
    if (!dropdown) return;

    const isVisible = dropdown.style.display === "block";
    dropdown.style.display = isVisible ? "none" : "block";
  }

  /**
   * Cierra el dropdown cuando se hace clic fuera
   */
  function handleClickOutside(event) {
    const userInfo = document.querySelector(".admin-user-info");
    const dropdown = document.getElementById("agenteUserDropdown");

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
   * Maneja el logout del agente
   */
  function handleLogout() {
    try {
      localStorage.removeItem("razoconnect_admin_token");
      localStorage.removeItem("razoconnect_admin");
      sessionStorage.clear();
    } catch (error) {
      console.error("Error limpiando sesión de agente:", error);
    }

    window.location.href = "/login.html";
  }

  /**
   * Inicializa el dropdown
   */
  function init() {
    // Esperar a que el DOM y el sidebar estén cargados
    setTimeout(() => {
      const userInfo = document.querySelector(".admin-user-info");

      if (!userInfo) {
        console.warn("admin-user-info no encontrado en header del agente");
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
      const logoutBtn = document.getElementById("dropdownLogoutAgente");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
      }

      console.log("✅ Agente header dropdown inicializado");
    }, 500); // Dar tiempo a que se cargue el sidebar
  }

  // Inicializar cuando el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
