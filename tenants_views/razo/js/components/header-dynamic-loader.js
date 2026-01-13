/**
 * HEADER DYNAMIC LOADER
 * Carga header-public.html si NO está autenticado
 * Carga header-cliente.html si SÍ está autenticado
 * Para usar en páginas informativas que deben funcionar para ambos tipos de usuarios
 */

(function () {
  "use strict";

  // Check if user is authenticated
  function isAuthenticated() {
    return !!localStorage.getItem("razoconnect_token");
  }

  async function cargarHeaderDinamico() {
    const container = document.getElementById("header-container");
    if (!container) {
      console.warn("No se encontró #header-container");
      return;
    }

    const authenticated = isAuthenticated();
    const headerFile = authenticated
      ? "/components/header-cliente.html"
      : "/components/header-public.html";

    try {
      const res = await fetch(headerFile, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });

      if (!res.ok) {
        throw new Error(`No se pudo cargar header: ${res.status}`);
      }

      const html = await res.text();
      container.innerHTML = html;

      // Si es header cliente, inicializar la lógica del header
      if (authenticated && typeof window.inicializarHeaderCliente === "function") {
        window.inicializarHeaderCliente();
      }

      // Marcar link activo según la página actual
      try {
        const path = (window.location.pathname || "").toLowerCase();
        const links = container.querySelectorAll("a.nav-link");
        
        for (const a of links) {
          a.classList.remove("active");
          a.removeAttribute("aria-current");
        }
        
        for (const a of links) {
          const href = (a.getAttribute("href") || "").toLowerCase();
          if (!href) continue;
          if (href === path || (href !== "/" && path.endsWith(href))) {
            a.classList.add("active");
            a.setAttribute("aria-current", "page");
            break;
          }
        }
      } catch (e) {
        // ignore
      }

      // Ajustar padding del body según altura del header
      const height = container.firstElementChild?.offsetHeight;
      if (height && Number.isFinite(height) && height > 0) {
        document.body.style.paddingTop = `${height}px`;
      } else {
        document.body.style.paddingTop = "72px";
      }

      console.log(`✅ Header dinámico cargado: ${authenticated ? 'Cliente' : 'Público'}`);
    } catch (error) {
      console.error("Error cargando header dinámico:", error);
    }
  }

  // Exponer función globalmente
  window.cargarHeaderDinamico = cargarHeaderDinamico;

  // Cargar automáticamente cuando el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cargarHeaderDinamico);
  } else {
    cargarHeaderDinamico();
  }

  // Recargar header cuando cambie el estado de autenticación
  window.addEventListener('razoconnect:auth-changed', () => {
    setTimeout(() => {
      cargarHeaderDinamico();
    }, 300);
  });
})();
