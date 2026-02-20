(function () {
  "use strict";

  /**
   * Decodifica el payload de un JWT sin verificar la firma
   * La verificación de firma es responsabilidad del backend
   */
  function decodeJWT(token) {
    try {
      if (!token) return null;

      // JWT tiene 3 partes separadas por puntos: header.payload.signature
      const parts = token.split(".");
      if (parts.length !== 3) return null;

      // Decodificar el payload (segunda parte)
      const payload = parts[1];
      // Reemplazar caracteres URL-safe de base64
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      // Decodificar base64
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

  function ensureAdminHeaderUnified() {
    if (window.__RAZO_ADMIN_HEADER_UNIFIED) return;

    const explicitType = document.body?.dataset?.sidebar;
    const path = (window.location.pathname || "").toLowerCase();
    const isAdminPage = explicitType === "admin" || path.startsWith("/admin");
    if (!isAdminPage) return;

    window.__RAZO_ADMIN_HEADER_UNIFIED = true;

    // Asegurar Bootstrap Icons (usado por el header nuevo)
    const hasBootstrapIcons = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(
      (l) => (l.getAttribute("href") || "").includes("bootstrap-icons")
    );
    if (!hasBootstrapIcons) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href =
        "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css";
      document.head.appendChild(link);
    }

    // Reemplazar header legacy por contenedor del header compartido
    const main = document.querySelector("main.admin-main");
    if (!main) return;

    let headerContainer = document.getElementById("admin-header-container");
    if (!headerContainer) {
      const legacyHeader = main.querySelector("header.admin-header");
      headerContainer = document.createElement("div");
      headerContainer.id = "admin-header-container";

      if (legacyHeader) {
        legacyHeader.replaceWith(headerContainer);
      } else {
        // Insertar al inicio del main para mantener layout consistente
        main.insertBefore(headerContainer, main.firstChild);
      }
    }

    // Cargar el loader del header si no está incluido
    const hasHeaderLoader = Array.from(document.querySelectorAll("script[src]"))
      .map((s) => (s.getAttribute("src") || "").toLowerCase())
      .some((src) => src.includes("js/components/admin-header-loader.js"));

    if (!hasHeaderLoader) {
      const script = document.createElement("script");
      script.src = "/js/components/admin-header-loader.js";
      document.body.appendChild(script);
    }

    // Aliases legacy: evitar crashes en páginas que aún intentan escribir userName/userRole/userAvatar
    ensureLegacyHeaderAliases();
  }

  function ensureLegacyHeaderAliases() {
    const existing = document.getElementById("adminHeaderLegacyAliases");
    if (existing) return;

    const wrapper = document.createElement("div");
    wrapper.id = "adminHeaderLegacyAliases";
    wrapper.style.display = "none";
    wrapper.innerHTML = `
      <span id="adminHeaderTitle"></span>
      <span id="admin-name"></span>
      <span id="userName"></span>
      <span id="userRole"></span>
      <span id="userAvatar"></span>
    `;

    document.body.appendChild(wrapper);
  }

  /**
   * Verifica si el usuario actual es super-administrador
   */
  function isSuperAdmin() {
    const token = localStorage.getItem("razoconnect_admin_token");
    if (!token) return false;

    const payload = decodeJWT(token);
    if (!payload) return false;

    // Verificar si tiene el rol de super-admin en el array de roles
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
   * Oculta elementos del menú según permisos del usuario
   * Nota: La gestión de administradores ahora se hace vía dropdown del header
   */
  function applyPermissions(container) {
    const linkBitacora = container.querySelector("#menuLinkBitacora");
    if (linkBitacora && !isSuperAdmin()) {
      const section = linkBitacora.closest(".admin-nav-section");
      linkBitacora.remove();
      if (section) {
        const hasLinks = section.querySelector("a[href]");
        if (!hasLinks) {
          section.remove();
        }
      }
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      ensureAdminHeaderUnified();
    } catch (e) {
      console.warn("No se pudo unificar header admin:", e);
    }

    const sidebarContainer = document.getElementById("sidebar-container");
    if (!sidebarContainer) {
      return;
    }

    const componentPath = resolveSidebarComponent();

    try {
      const response = await fetch(componentPath, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });

      if (!response.ok) {
        throw new Error(`Error al cargar sidebar: ${response.status}`);
      }

      const sidebarHtml = await response.text();
      sidebarContainer.innerHTML = sidebarHtml;

      highlightActiveLink(sidebarContainer);

      // Aplicar permisos basados en rol
      applyPermissions(sidebarContainer);

      const eventDetail = { container: sidebarContainer };
      window.dispatchEvent(
        new CustomEvent("sidebar:loaded", { detail: eventDetail })
      );
    } catch (error) {
      console.error("No se pudo cargar el sidebar:", error);
      sidebarContainer.innerHTML = `
        <div class="alert alert-error" style="margin: 1rem 0;">
          No se pudo cargar el menú. Recarga la página o intenta más tarde.
        </div>
      `;
    }
  });

  function resolveSidebarComponent() {
    const explicitType = document.body.dataset.sidebar;
    if (explicitType === "admin") {
      return "/components/sidebar-admin.html";
    }
    if (explicitType === "agent") {
      return "/components/sidebar-agente.html";
    }

    // Detectar rol desde el token para páginas compartidas (staff-notificaciones.html)
    const token = localStorage.getItem("razoconnect_admin_token");
    if (token) {
      const payload = decodeJWT(token);
      if (payload && Array.isArray(payload.roles)) {
        // Si tiene rol 'admin' o 'superadmin', mostrar sidebar admin
        const hasAdminRole = payload.roles.some(
          (role) =>
            role &&
            (role.toLowerCase() === "admin" ||
              role.toLowerCase() === "superadmin" ||
              role.toLowerCase() === "super-admin")
        );
        if (hasAdminRole) {
          return "/components/sidebar-admin.html";
        }
        
        // Si tiene rol 'agente', mostrar sidebar agente
        const hasAgenteRole = payload.roles.some(
          (role) => role && role.toLowerCase() === "agente"
        );
        if (hasAgenteRole) {
          return "/components/sidebar-agente.html";
        }
      }
    }

    // Fallback: usar path para determinar sidebar
    const path = window.location.pathname.toLowerCase();
    if (path.startsWith("/admin")) {
      return "/components/sidebar-admin.html";
    }

    return "/components/sidebar-agente.html";
  }

  function highlightActiveLink(container) {
    const links = container.querySelectorAll("a[href]");
    if (!links.length) {
      return;
    }

    const currentPath = normalizePath(window.location.pathname);

    links.forEach((link) => {
      const linkPath = normalizePath(
        new URL(link.href, window.location.origin).pathname
      );
      if (linkPath === currentPath) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
  }

  function normalizePath(pathname) {
    if (!pathname) {
      return "/";
    }
    return pathname.replace(/\/?$/, "").toLowerCase() || "/";
  }

  try {
    ensureAdminHeaderUnified();
  } catch (e) {
    // ignore
  }
})();
