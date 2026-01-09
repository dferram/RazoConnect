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

  async function initializeHeader() {
    // 1. Cargar Datos del Usuario (LocalStorage)
    let adminData = null;
    try {
      adminData = JSON.parse(localStorage.getItem("razoconnect_admin"));
    } catch {
      adminData = null;
    }

    // Si no hay sesión, redirigir (Protección básica)
    if (!adminData) {
      window.location.href = "/login.html";
      return;
    }

    // 2. Verificar y actualizar datos del usuario desde el servidor
    const token = localStorage.getItem("razoconnect_admin_token");
    if (token) {
      try {
        const response = await fetch("/api/admin/verify", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data.admin) {
            // Actualizar localStorage con datos frescos
            adminData = {
              ...adminData,
              nombre: data.data.admin.nombre,
              rol: data.data.admin.rol,
              origen: data.data.admin.origen,
            };
            localStorage.setItem("razoconnect_admin", JSON.stringify(adminData));
          }
        }
      } catch (error) {
        console.error("Error al verificar admin:", error);
        // Continuar con los datos del localStorage si falla la verificación
      }
    }

    const nombre = (adminData.nombre || "Admin").toString().trim();
    const rolSession = (adminData.rol || adminData.role || "").toString().trim();
    const rolRaw = rolSession.toLowerCase();
    const isSuperAdmin = rolRaw === "super admin" || rolRaw === "superadmin";
    const rolTexto = isSuperAdmin ? "Super Admin" : "Administrador";

    // Llenar datos en el Header
    const headerUserName = document.getElementById("headerUserName");
    const headerUserRole = document.getElementById("headerUserRole");
    const headerUserAvatar = document.getElementById("headerUserAvatar");

    if (headerUserName) headerUserName.textContent = nombre || "Admin";
    if (headerUserRole) headerUserRole.textContent = rolTexto;
    if (headerUserAvatar) headerUserAvatar.textContent = getIniciales(nombre);

    // Backwards compat IDs
    const legacyUserName = document.getElementById("userName");
    const legacyUserRole = document.getElementById("userRole");
    const legacyUserAvatar = document.getElementById("userAvatar");
    const legacyAdminName = document.getElementById("admin-name");
    if (legacyUserName) legacyUserName.textContent = nombre || "Admin";
    if (legacyUserRole) legacyUserRole.textContent = rolTexto;
    if (legacyUserAvatar) legacyUserAvatar.textContent = getIniciales(nombre);
    if (legacyAdminName) legacyAdminName.textContent = nombre || "Admin";

    // 2.1 Dropdown dinámico (evitar duplicados)
    const dropdownContainer = document.getElementById("user-dropdown-container");
    if (dropdownContainer) {
      dropdownContainer.innerHTML = "";

      const header = document.createElement("div");
      header.className = "dropdown-header";
      header.innerHTML = `
        <span class="d-block small text-muted">Conectado como</span>
        <strong>${nombre || "Admin"}</strong>
      `;

      const divider1 = document.createElement("hr");
      divider1.className = "dropdown-divider";

      const linkNotificaciones = document.createElement("a");
      linkNotificaciones.href = "/staff-notificaciones.html";
      linkNotificaciones.className = "dropdown-item";
      linkNotificaciones.innerHTML = `<i class="bi bi-bell"></i> Notificaciones`;

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
      linkLogout.addEventListener("click", (e) => {
        e.preventDefault();
        localStorage.removeItem("razoconnect_admin");
        localStorage.removeItem("razoconnect_admin_token");
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
  }
})();
