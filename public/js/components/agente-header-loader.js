(function () {
  "use strict";

  async function cargarAgenteHeader() {
    const container = document.getElementById("admin-header-container");
    if (!container) return;

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
      enlazarLogoutAgente();
    } catch (error) {
      console.error("Error cargando agente header:", error);
    }
  }

  function getAgenteInfo() {
    const raw = localStorage.getItem("razoconnect_admin");
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

  function enlazarLogoutAgente() {
    const logoutBtn = document.getElementById("dropdownLogoutAgente");
    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", async () => {
      try {
        if (typeof clearAgentAuth === "function") {
          clearAgentAuth();
        } else {
          localStorage.removeItem("razoconnect_admin_token");
          localStorage.removeItem("razoconnect_admin");
        }
        sessionStorage.clear();
      } catch (error) {
        console.error("Error limpiando sesión de agente:", error);
      }

      const url = await getAgentLoginUrl();
      window.location.href = url;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cargarAgenteHeader);
  } else {
    cargarAgenteHeader();
  }
})();
