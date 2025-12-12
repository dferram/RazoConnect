(function () {
  "use strict";

  async function cargarHeaderCliente() {
    const container = document.getElementById("header-container");
    if (!container) return;

    try {
      const res = await fetch("/components/header-cliente.html", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      if (!res.ok) {
        throw new Error(`No se pudo cargar header: ${res.status}`);
      }

      const html = await res.text();
      container.innerHTML = html;

      // Navbar es fixed-top (Bootstrap). Reservar espacio.
      document.body.style.paddingTop = "80px";

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

  function inicializarUsuario() {
    const nombreEl = document.getElementById("headerNombreUsuario");
    const logoutItem = document.getElementById("headerLogoutItem");
    const logoutLink = document.getElementById("logoutBtn");
    const cuentaLink = document.getElementById("userGreeting");

    const usuario = getUsuarioLocal();

    const nombreRaw =
      usuario?.nombre || usuario?.Nombre || usuario?.nombres || usuario?.Nombres;
    const nombre = (nombreRaw || "").toString().trim();

    const hasSession = Boolean(usuario) || Boolean(getTokenCliente());

    if (hasSession && nombreEl) {
      nombreEl.textContent = nombre ? `Hola, ${nombre.split(" ")[0]}` : "Mi cuenta";
    } else if (nombreEl) {
      nombreEl.textContent = "Iniciar Sesión";
    }

    if (cuentaLink) {
      cuentaLink.href = hasSession ? "/dashboard.html" : "/login.html";
    }

    if (logoutItem) {
      logoutItem.style.display = hasSession ? "list-item" : "none";
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

        window.location.href = "/login.html";
      });
    }
  }

  async function actualizarNotificaciones() {
    const badge = document.getElementById("badgeNotificaciones");
    if (!badge) return;

    const token = getTokenCliente();
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
        badge.textContent = String(count);
        badge.classList.remove("d-none");
      } else {
        badge.classList.add("d-none");
      }
    } catch (error) {
      console.error("Error obteniendo conteo de notificaciones:", error);
      badge.classList.add("d-none");
    }
  }

  async function actualizarBadgeCarrito() {
    const badge1 = document.getElementById("badgeCarrito");
    const badge2 = document.getElementById("cartBadge");

    if (!badge1 && !badge2) return;

    let totalItems = 0;
    try {
      const raw = localStorage.getItem("carrito");
      if (raw) {
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.items)
            ? parsed.items
            : [];

        totalItems = items.reduce(
          (sum, item) => sum + (Number(item?.cantidad) || 0),
          0
        );
      }
    } catch (error) {
      console.error("Error leyendo carrito desde localStorage:", error);
      totalItems = 0;
    }

    const apply = (el) => {
      if (!el) return;
      el.textContent = String(totalItems);
      if (totalItems > 0) {
        el.classList.remove("d-none");
        el.style.display = "inline-block";
      } else {
        el.classList.add("d-none");
        el.style.display = "none";
      }
    };

    apply(badge1);
    apply(badge2);
  }

  window.cargarHeaderCliente = cargarHeaderCliente;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cargarHeaderCliente);
  } else {
    cargarHeaderCliente();
  }
})();
