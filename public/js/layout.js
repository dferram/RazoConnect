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
    // Reservado para futuras restricciones de menú por rol
    // La opción "Agregar administrador" está ahora en el dropdown del usuario
    console.log("🔐 Permisos de menú aplicados");
  }

  document.addEventListener("DOMContentLoaded", async () => {
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
})();
