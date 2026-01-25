(function () {
  "use strict";

  async function cargarHeaderCliente() {
    const container = document.getElementById("header-container");
    if (!container) return;

    try {
      const tokenCliente = getTokenCliente();
      const hasCreditAccess = await verificarCreditoCliente(tokenCliente);

      const res = await fetch("/components/header-cliente.html", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      if (!res.ok) {
        throw new Error(`No se pudo cargar header: ${res.status}`);
      }

      const html = await res.text();
      container.innerHTML = html;
      
      // Inicializar dropdowns de Bootstrap después de inyectar el HTML
      const dropdownElementList = container.querySelectorAll('[data-bs-toggle="dropdown"]');
      dropdownElementList.forEach(dropdownToggleEl => {
        new bootstrap.Dropdown(dropdownToggleEl);
      });
      
      actualizarIndicadorCredito({
        hasCreditAccess,
        isAuthenticated: Boolean(tokenCliente),
      });

      inicializarUsuario();
      cargarTiposMenu();
      cargarMarcasMenu();
      actualizarNotificaciones();
      actualizarBadgeCarrito();
    } catch (error) {
      console.error("Error cargando header cliente:", error);
    }
  }

  async function cargarTiposMenu() {
    const ul = document.getElementById("listaTiposProducto");
    if (!ul) return;

    try {
      const res = await fetch("/api/public/tipos-producto");
      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "No se pudo cargar tipos");
      }

      const tipos = Array.isArray(data?.data?.tipos) ? data.data.tipos : [];
      ul.innerHTML = "";

      if (!tipos.length) {
        ul.innerHTML = '<li><span class="dropdown-item-text">Sin tipos disponibles</span></li>';
        return;
      }

      for (const tipo of tipos) {
        const nombre = (tipo?.nombre || "").toString().trim();
        if (!nombre) continue;

        const li = document.createElement("li");
        const a = document.createElement("a");
        a.className = "dropdown-item";
        a.href = `/catalogo.html?tipo=${encodeURIComponent(nombre)}`;
        a.textContent = nombre;
        li.appendChild(a);
        ul.appendChild(li);
      }
    } catch (error) {
      console.error("Error cargando tipos de producto:", error);
      ul.innerHTML = '<li><span class="dropdown-item-text">Error al cargar tipos</span></li>';
    }
  }

  async function cargarMarcasMenu() {
    const ul = document.getElementById("listaMarcas");
    if (!ul) return;

    try {
      const res = await fetch("/api/public/proveedores");
      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "No se pudo cargar marcas");
      }

      const proveedores = Array.isArray(data?.data?.proveedores)
        ? data.data.proveedores
        : [];

      ul.innerHTML = "";

      const liAll = document.createElement("li");
      const aAll = document.createElement("a");
      aAll.className = "dropdown-item";
      aAll.href = "/catalogo.html";
      aAll.textContent = "📦 Catálogo Completo";
      liAll.appendChild(aAll);
      ul.appendChild(liAll);

      if (!proveedores.length) {
        ul.innerHTML +=
          '<li><span class="dropdown-item-text">Sin marcas disponibles</span></li>';
        return;
      }

      for (const proveedor of proveedores) {
        const id = proveedor?.proveedorId;
        const nombre = (proveedor?.nombre || "").toString().trim();
        if (!id || !nombre) continue;

        const li = document.createElement("li");
        const a = document.createElement("a");
        a.className = "dropdown-item";
        a.href = `/proveedor-tienda.html?id=${encodeURIComponent(id)}`;
        a.textContent = nombre;
        li.appendChild(a);
        ul.appendChild(li);
      }
    } catch (error) {
      console.error("Error cargando marcas:", error);
      ul.innerHTML = '<li><span class="dropdown-item-text">Error al cargar marcas</span></li>';
    }
  }

  function getUsuarioLocal() {
    const tryParse = (key) => {
      try {
        return JSON.parse(localStorage.getItem(key) || "null");
      } catch {
        return null;
      }
    };

    // Compatibilidad: instrucción = 'usuario', sistema actual = 'razoconnect_user'
    return tryParse("usuario") || tryParse("razoconnect_user");
  }

  function getTokenCliente() {
    return localStorage.getItem("razoconnect_token");
  }

  async function verificarCreditoCliente(token) {
    // Don't make API calls if no token (guest user)
    if (!token) {
      return false;
    }

    try {
      const res = await fetch("/api/cliente/check-auth-credit", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        return false;
      }

      const data = await res.json();
      return Boolean(data?.hasCredit);
    } catch (error) {
      // Silently fail for guest users
      console.debug("Credit check skipped or failed:", error.message);
      return false;
    }
  }

  function actualizarIndicadorCredito({ hasCreditAccess, isAuthenticated }) {
    const linkWrapper = document.getElementById("navCreditoLink");
    const label = document.getElementById("creditLinkLabel");
    const badge = document.getElementById("creditStatusBadge");
    if (!linkWrapper || !label || !badge) return;

    badge.className = "badge rounded-pill";

    if (!isAuthenticated) {
      // Hide credit link for guests
      linkWrapper.style.display = "none";
      label.textContent = "Mi Crédito";
      badge.textContent = "";
      badge.classList.add("d-none");
      return;
    }

    // Show credit link for authenticated users
    linkWrapper.style.display = "list-item";

    if (hasCreditAccess) {
      label.textContent = "Mi Crédito";
      badge.textContent = "Activo";
      badge.classList.remove("d-none");
      badge.classList.add("bg-success");
    } else {
      label.textContent = "Solicitar crédito";
      badge.textContent = "Nuevo";
      badge.classList.remove("d-none");
      badge.classList.add("bg-warning", "text-dark");
    }
  }

  function inicializarUsuario() {
    const nombreEl = document.getElementById("headerNombreUsuario");
    const logoutItem = document.getElementById("headerLogoutItem");
    const logoutLink = document.getElementById("logoutBtn");
    const cuentaLink = document.getElementById("userGreeting");
    const loginLink = document.getElementById("loginLink");

    const usuario = getUsuarioLocal();

    const nombreRaw =
      usuario?.nombre || usuario?.Nombre || usuario?.nombres || usuario?.Nombres;
    const nombre = (nombreRaw || "").toString().trim();

    const hasSession = Boolean(usuario) || Boolean(getTokenCliente());

    // Update all data-auth elements visibility
    const loginElements = document.querySelectorAll('[data-auth="login"]');
    const dashboardElements = document.querySelectorAll('[data-auth="dashboard"]');
    const logoutElements = document.querySelectorAll('[data-auth="logout"]');

    if (hasSession) {
      // User is logged in - show dashboard and logout, hide login
      loginElements.forEach(el => el.style.display = 'none');
      dashboardElements.forEach(el => el.style.display = 'list-item');
      logoutElements.forEach(el => el.style.display = 'list-item');
      
      if (nombreEl) {
        nombreEl.textContent = nombre ? `Hola, ${nombre.split(" ")[0]}` : "Mi cuenta";
      }
      if (cuentaLink) {
        cuentaLink.href = "/dashboard.html";
      }
    } else {
      // User is NOT logged in - show login, hide dashboard and logout
      loginElements.forEach(el => el.style.display = 'list-item');
      dashboardElements.forEach(el => el.style.display = 'none');
      logoutElements.forEach(el => el.style.display = 'none');
      
      if (nombreEl) {
        nombreEl.textContent = "Iniciar Sesión";
      }
    }

    // Handle login link click to open modal
    if (loginLink) {
      loginLink.addEventListener("click", (e) => {
        e.preventDefault();
        if (typeof window.openAuthModal === 'function') {
          window.openAuthModal();
        } else {
          const modalAuth = document.getElementById("modalAuth");
          if (modalAuth) {
            modalAuth.style.display = "flex";
          } else {
            window.location.href = "/login.html";
          }
        }
      });
    }

    if (logoutLink) {
      logoutLink.addEventListener("click", (e) => {
        e.preventDefault();

        try {
          if (typeof clearAuthData === "function") {
            clearAuthData();
          } else {
            localStorage.removeItem("razoconnect_token");
            localStorage.removeItem("razoconnect_user");
            localStorage.removeItem("usuario");
            localStorage.removeItem("razoconnect_admin_token");
            localStorage.removeItem("razoconnect_admin");
          }
        } catch (error) {
          console.error("Error al cerrar sesión:", error);
        }

        window.location.replace("/login.html");
      });
    }

    // Listen for auth changes
    window.addEventListener('razoconnect:auth-changed', async () => {
      // Update header dynamically without full page reload
      const tokenCliente = getTokenCliente();
      const hasCreditAccess = await verificarCreditoCliente(tokenCliente);
      
      actualizarIndicadorCredito({
        hasCreditAccess,
        isAuthenticated: Boolean(tokenCliente),
      });
      
      inicializarUsuario();
      actualizarNotificaciones();
      actualizarBadgeCarrito();
      
      console.log('✅ Header actualizado tras login');
    });
  }

  async function actualizarNotificaciones() {
    const badge = document.getElementById("badgeNotificaciones");
    if (!badge) return;

    const token = getTokenCliente();
    // Don't make API calls if no token (guest user)
    if (!token) {
      badge.classList.add("d-none");
      return;
    }

    try {
      const res = await fetch("/api/cliente/notificaciones/count", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await res.json();
      const count = Number.parseInt(data?.count, 10) || 0;

      if (!res.ok || data?.success === false) {
        badge.classList.add("d-none");
        return;
      }

      if (count > 0) {
        badge.classList.remove("d-none");
      } else {
        badge.classList.add("d-none");
      }
    } catch (error) {
      // Silently fail for guest users
      console.debug("Notifications check skipped or failed:", error.message);
      badge.classList.add("d-none");
    }
  }

  async function actualizarBadgeCarrito() {
    const badge = document.getElementById("cartRedDot");
    if (!badge) return;

    let totalItems = 0;

    const keys = [
      "carrito",
      "razoconnect_carrito",
      "razoconnect_cart",
      "razoconnect_cart_cache",
    ];

    const readItems = () => {
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const items = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.items)
              ? parsed.items
              : [];
          if (items.length) return items;
        } catch (_) {
          continue;
        }
      }
      return [];
    };

    try {
      const items = readItems();
      totalItems = items.reduce((sum, item) => {
        const qty =
          item?.cantidad ??
          item?.Cantidad ??
          item?.cantidadPaquetes ??
          item?.CantidadPaquetes ??
          0;
        const parsed = Number.parseInt(qty, 10);
        return sum + (Number.isInteger(parsed) && parsed > 0 ? parsed : 0);
      }, 0);
    } catch (error) {
      console.error("Error leyendo carrito desde localStorage:", error);
      totalItems = 0;
    }

    badge.style.display = totalItems > 0 ? "inline-block" : "none";
  }

  window.cargarHeaderCliente = cargarHeaderCliente;
  window.updateCartBadge = actualizarBadgeCarrito;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cargarHeaderCliente);
  } else {
    cargarHeaderCliente();
  }
})();
