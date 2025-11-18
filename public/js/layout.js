(function () {
  "use strict";

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
