(function () {
  "use strict";

  async function cargarAdminHeader() {
    const container = document.getElementById("admin-header-container");
    if (!container) return;

    try {
      const res = await fetch("/components/admin-header.html", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      if (!res.ok) {
        throw new Error(`No se pudo cargar admin header: ${res.status}`);
      }

      container.innerHTML = await res.text();

      inicializarTitulo();
      inicializarUsuario();
      inicializarSidebarToggle();
      await actualizarNotificacionesStaff();
    } catch (error) {
      console.error("Error cargando admin header:", error);
    }
  }

  function getAdminToken() {
    return localStorage.getItem("razoconnect_admin_token");
  }

  function decodeJWT(token) {
    try {
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(payload)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }

  function detectarTipoUsuario() {
    const adminRaw = localStorage.getItem("razoconnect_admin");
    if (adminRaw) {
      try {
        return { type: "admin", data: JSON.parse(adminRaw) };
      } catch {
        return { type: "admin", data: null };
      }
    }

    const token = getAdminToken();
    const payload = decodeJWT(token);
    const rol = (payload?.rol || "").toString().toLowerCase();
    const roles = Array.isArray(payload?.roles)
      ? payload.roles.map((r) => (r || "").toString().toLowerCase())
      : [];

    if (rol === "agente" || roles.includes("agente")) {
      return { type: "agente", data: payload };
    }

    return { type: "admin", data: payload };
  }

  function getNombreUsuario(info) {
    const data = info?.data || {};
    const nombreRaw =
      data?.nombre ||
      data?.Nombre ||
      data?.nombres ||
      data?.Nombres ||
      data?.email ||
      "Usuario";
    return (nombreRaw || "Usuario").toString().trim();
  }

  function getRolTexto(info) {
    const data = info?.data || {};

    if (info?.type === "agente") {
      return "AGENTE DE VENTAS";
    }

    const roles = Array.isArray(data?.roles)
      ? data.roles.map((r) => (r || "").toString().toLowerCase())
      : [];
    const rol = (data?.rol || "").toString().toLowerCase();

    if (roles.includes("superadmin") || roles.includes("super-admin") || rol === "superadmin") {
      return "SUPER ADMIN";
    }

    if (rol) {
      return rol.toUpperCase();
    }

    return "ADMIN";
  }

  function getIniciales(nombre) {
    const parts = (nombre || "")
      .split(/\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return "U";
    const first = parts[0][0] || "U";
    const second = parts.length > 1 ? parts[1][0] : (parts[0][1] || "");
    return (first + (second || "")).toUpperCase();
  }

  function inicializarTitulo() {
    const titleEl = document.getElementById("adminHeaderTitle");
    if (!titleEl) return;

    const fromData = document.body?.dataset?.pageTitle;
    if (fromData) {
      titleEl.textContent = fromData;
      return;
    }

    const existing = document.querySelector(".admin-header-title");
    if (existing && existing !== titleEl && existing.textContent) {
      titleEl.textContent = existing.textContent.trim();
    }
  }

  function inicializarUsuario() {
    const info = detectarTipoUsuario();
    const nombre = getNombreUsuario(info);

    const userNameEl = document.getElementById("userName");
    const userRoleEl = document.getElementById("userRole");
    const avatarEl = document.getElementById("userAvatar");

    if (userNameEl) userNameEl.textContent = nombre;
    if (userRoleEl) userRoleEl.textContent = getRolTexto(info);
    if (avatarEl) avatarEl.textContent = getIniciales(nombre);

    const logoutBtn = document.getElementById("adminLogoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        logoutUnificado();
      });
    }
  }

  function logoutUnificado() {
    try {
      if (typeof clearAuthData === "function") {
        clearAuthData();
      } else {
        localStorage.removeItem("razoconnect_admin_token");
        localStorage.removeItem("razoconnect_admin");
        localStorage.removeItem("razoconnect_token");
        localStorage.removeItem("razoconnect_user");
        localStorage.removeItem("usuario");
      }
      sessionStorage.clear();
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }

    window.location.href = "/login.html";
  }

  async function actualizarNotificacionesStaff() {
    const token = getAdminToken();
    const badge = document.getElementById("badgeNotifMenu");
    const dot = document.getElementById("indicadorAlertaUsuario");

    if (!token) {
      badge?.classList.add("d-none");
      dot?.classList.add("d-none");
      return;
    }

    try {
      const res = await fetch("/api/staff/notificaciones/unread-count", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      const count = Number.parseInt(data?.count, 10) || 0;

      if (!res.ok || data?.success === false) {
        badge?.classList.add("d-none");
        dot?.classList.add("d-none");
        return;
      }

      if (count > 0) {
        if (badge) {
          badge.textContent = String(count);
          badge.classList.remove("d-none");
        }
        dot?.classList.remove("d-none");
      } else {
        badge?.classList.add("d-none");
        dot?.classList.add("d-none");
      }
    } catch (error) {
      console.error("Error obteniendo conteo de notificaciones staff:", error);
      badge?.classList.add("d-none");
      dot?.classList.add("d-none");
    }
  }

  function inicializarSidebarToggle() {
    const btn = document.getElementById("btnToggleSidebar");
    if (!btn) return;

    btn.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-collapsed");
    });
  }

  window.AdminHeader = {
    setTitle: (title) => {
      const titleEl = document.getElementById("adminHeaderTitle");
      if (titleEl) titleEl.textContent = title;
    },
    refreshNotifications: () => actualizarNotificacionesStaff(),
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cargarAdminHeader);
  } else {
    cargarAdminHeader();
  }
})();
