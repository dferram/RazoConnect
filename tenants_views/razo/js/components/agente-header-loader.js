(function () {
  "use strict";

  function ensureBootstrapIcons() {
    const hasBootstrapIcons = Array.from(
      document.querySelectorAll('link[rel="stylesheet"]')
    ).some((l) => (l.getAttribute("href") || "").includes("bootstrap-icons"));

    if (hasBootstrapIcons) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css";
    document.head.appendChild(link);
  }

  async function cargarAgenteHeader() {
    const container = document.getElementById("admin-header-container");
    if (!container) return;

    ensureBootstrapIcons();

    const agente = getAgenteInfo();
    if (!agente) {
      redirectToAgentLogin();
      return;
    }

    try {
      const res = await fetch("/components/admin-header.html", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      if (!res.ok) {
        throw new Error(`No se pudo cargar header: ${res.status}`);
      }

      container.innerHTML = await res.text();

      asegurarAliasesLegacy(container);
      inicializarTitulo();
      inicializarAgente(agente);
      inicializarDropdownUnificado(agente);
    } catch (error) {
      console.error("Error cargando agente header:", error);
    }
  }

  function getAgenteInfo() {
    const raw = localStorage.getItem("razoconnect_agent");
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      const rol = (data?.rol || "").toString().toLowerCase();
      const isAgent = rol === "agente" || data?.esAgente === true;
      if (!isAgent) return null;
      return data;
    } catch {
      return null;
    }
  }

  async function getAgentLoginUrl() {
    const candidate = "/login-agente.html";
    try {
      const res = await fetch(candidate, { method: "HEAD" });
      if (res.ok) return candidate;
    } catch {
      // Ignorar y usar fallback
    }
    return "/login.html";
  }

  async function redirectToAgentLogin() {
    const url = await getAgentLoginUrl();
    window.location.replace(url);
  }

  function getIniciales(nombre) {
    const parts = (nombre || "")
      .toString()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!parts.length) return "--";
    const first = parts[0]?.charAt(0) || "-";
    const second = parts.length >= 2 ? parts[1]?.charAt(0) : parts[0]?.charAt(1);
    return `${first}${second || ""}`.toUpperCase();
  }

  function inicializarTitulo() {
    const titleEl = document.getElementById("headerPageTitle");
    if (!titleEl) return;

    const fromData = document.body?.dataset?.pageTitle;
    titleEl.textContent = fromData || document.title || "";

    const legacyTitleEl = document.getElementById("adminHeaderTitle");
    if (legacyTitleEl) legacyTitleEl.textContent = titleEl.textContent;
  }

  function inicializarAgente(agente) {
    const nombre = (agente?.nombre || "Agente").toString().trim();

    const nameEl = document.getElementById("headerUserName");
    const roleEl = document.getElementById("headerUserRole");
    const avatarEl = document.getElementById("headerUserAvatar");

    const legacyUserNameEl = document.getElementById("userName");
    const legacyUserRoleEl = document.getElementById("userRole");
    const legacyAvatarEl = document.getElementById("userAvatar");

    const roleText = "Agente de Ventas";
    const initials = getIniciales(nombre);

    if (nameEl) nameEl.textContent = nombre || "Agente";
    if (roleEl) roleEl.textContent = roleText;
    if (avatarEl) avatarEl.textContent = initials;

    if (legacyUserNameEl) legacyUserNameEl.textContent = nombre || "Agente";
    if (legacyUserRoleEl) legacyUserRoleEl.textContent = roleText;
    if (legacyAvatarEl) legacyAvatarEl.textContent = initials;
  }

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

  function inicializarDropdownUnificado(agente) {
    const dropdownContainer = document.getElementById("user-dropdown-container");
    if (dropdownContainer) {
      dropdownContainer.innerHTML = "";

      const nombre = (agente?.nombre || "Agente").toString().trim();

      const header = document.createElement("div");
      header.className = "dropdown-header";
      header.innerHTML = `
        <span class="d-block small text-muted">Conectado como</span>
        <strong>${nombre || "Agente"}</strong>
      `;

      const divider1 = document.createElement("hr");
      divider1.className = "dropdown-divider";

      const linkNotificaciones = document.createElement("a");
      linkNotificaciones.href = "/staff-notificaciones.html";
      linkNotificaciones.className = "dropdown-item";
      linkNotificaciones.innerHTML = `<i class="bi bi-bell"></i> Notificaciones`;

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
          // Logout explícito - limpiar tokens de agente
          localStorage.removeItem("razoconnect_agent_token");
          localStorage.removeItem("razoconnect_agent");
          // MISIÓN 4: NO usar sessionStorage
        } catch (error) {
          console.error("Error limpiando sesión de agente:", error);
        }

        const url = await getAgentLoginUrl();
        window.location.replace(url);
      });

      const itemsFragment = document.createDocumentFragment();
      itemsFragment.appendChild(header);
      itemsFragment.appendChild(divider1);
      itemsFragment.appendChild(linkNotificaciones);
      itemsFragment.appendChild(divider2);
      itemsFragment.appendChild(linkLogout);

      dropdownContainer.appendChild(itemsFragment);
    }

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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cargarAgenteHeader);
  } else {
    cargarAgenteHeader();
  }
})();
