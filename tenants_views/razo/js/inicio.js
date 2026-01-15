/**
 * inicio.js
 * Script para la página de inicio de clientes logueados
 * Carga: Saludo personalizado, Marcas, Novedades
 */

(function () {
  "use strict";

  // ========================================
  // PERSONALIZAR SALUDO CON NOMBRE DE USUARIO
  // ========================================
  function personalizarSaludo() {
    const user = JSON.parse(localStorage.getItem("razoconnect_user") || "{}");
    const welcomeTitle = document.getElementById("welcomeTitle");
    const userGreeting = document.getElementById("userGreeting");

    if (user && user.nombre) {
      const firstName = user.nombre.split(" ")[0]; // Solo primer nombre
      welcomeTitle.textContent = `Bienvenido, ${firstName}`;

      if (userGreeting) {
        userGreeting.textContent = `Hola, ${firstName}`;
      }
    } else {
      welcomeTitle.textContent = "Bienvenido de nuevo";

      if (userGreeting) {
        userGreeting.textContent = "Mi Cuenta";
      }
    }
  }

  // ========================================
  // CARGAR MARCAS (PROVEEDORES)
  // ========================================
  async function loadMarcas() {
    const brandsGrid = document.getElementById("brandsGrid");

    try {
      const response = await fetch("/api/public/proveedores");
      const data = await response.json();

      // El backend devuelve: { success, data: { proveedores: [...] } }
      if (
        data.success &&
        data.data &&
        data.data.proveedores &&
        data.data.proveedores.length > 0
      ) {
        brandsGrid.innerHTML = data.data.proveedores
          .map(
            (proveedor) => `
          <div class="brand-card">
            <div class="brand-icon">${proveedor.nombre
              .charAt(0)
              .toUpperCase()}</div>
            <div class="brand-name">${proveedor.nombre}</div>
            <a 
              href="/proveedor-tienda.html?id=${proveedor.proveedorId}" 
              class="brand-link"
            >
              Ver productos →
            </a>
          </div>
        `
          )
          .join("");
      } else {
        brandsGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #999;">
            <p>No hay marcas disponibles en este momento.</p>
          </div>
        `;
      }
    } catch (error) {
      console.error("Error cargando marcas:", error);
      brandsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #e53e3e;">
          <p>⚠️ Error al cargar las marcas.</p>
        </div>
      `;
    }
  }

  // ========================================
  // CARGAR NOVEDADES (4 PRODUCTOS MÁS RECIENTES)
  // ========================================
  async function loadNovedades() {
    const novedadesGrid = document.getElementById("novedadesGrid");

    try {
      // El backend ya ordena por productoid DESC (más recientes primero)
      const response = await fetch("/api/productos?limit=4");
      const data = await response.json();

      // El backend devuelve: { success, data: { productos: [...] } }
      if (
        data.success &&
        data.data &&
        data.data.productos &&
        data.data.productos.length > 0
      ) {
        novedadesGrid.innerHTML = data.data.productos
          .map((producto, index) => renderProductCard(producto, index))
          .join("");
      } else {
        novedadesGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #999;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📦</div>
            <p>No hay productos disponibles en este momento.</p>
            <a href="/catalogo.html" style="color: var(--razo-turquoise); text-decoration: underline;">
              Ver catálogo completo
            </a>
          </div>
        `;
      }
    } catch (error) {
      console.error("Error cargando novedades:", error);
      novedadesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #e53e3e;">
          <p>⚠️ Error al cargar los productos.</p>
        </div>
      `;
    }
  }

  // ========================================
  // RENDERIZAR TARJETA DE PRODUCTO
  // ========================================
  function renderProductCard(producto, index) {
    // El backend devuelve las propiedades en camelCase
    const precioBase = parseFloat(producto.precioDesde || 0);
    const precioOferta = parseFloat(producto.precioOferta || 0);
    const tieneOferta = precioOferta > 0 && precioOferta < precioBase;
    
    const formatCurrency = (valor) => {
      return valor.toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN",
      });
    };

    // Generar HTML de precio según si hay oferta o no
    const precioHTML = tieneOferta
      ? `<div class="precio-contenedor">
           <span class="precio-original">${formatCurrency(precioBase)}</span>
           <span class="precio-oferta">${formatCurrency(precioOferta)}</span>
         </div>`
      : `<span class="precio-normal">${formatCurrency(precioBase || precioOferta)}</span>`;

    const stockDisponible = producto.variantesConStock || 0;
    const badge =
      index === 0
        ? `<div class="product-badge">✨ Más Reciente</div>`
        : `<div class="product-badge">🆕 Nuevo</div>`;

    // Usar imagenUrl del backend
    const imagenUrl =
      producto.imagenUrl ||
      "https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=400&h=400&fit=crop";

    return `
      <div class="product-card">
        <div class="product-image">
          <img 
            src="${imagenUrl}" 
            alt="${producto.nombreProducto}"
            loading="lazy"
            onerror="this.src='https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=400&h=400&fit=crop'"
          />
          ${badge}
        </div>
        <div class="product-info">
          <h3 class="product-title">${producto.nombreProducto}</h3>
          <div class="product-price">${precioHTML}</div>
          <p class="product-details">
            ${producto.categoria ? producto.categoria.nombre : "Producto"}
            ${
              stockDisponible > 0
                ? ` • <span style="color: var(--success-color);">${stockDisponible} disponibles</span>`
                : ` • <span style="color: var(--danger-color);">Sin stock</span>`
            }
          </p>
          <a 
            href="/producto-detalle.html?id=${producto.productoId}" 
            class="product-btn"
          >
            Ver Detalles
          </a>
        </div>
      </div>
    `;
  }

  // ========================================
  // DROPDOWN DE MARCAS (NAVBAR)
  // ========================================
  function initMarcasDropdown() {
    const dropdown = document.getElementById("marcasDropdown");
    if (!dropdown) return;

    const toggle = dropdown.querySelector(".navbar-dropdown-toggle");
    const menu = dropdown.querySelector(".navbar-dropdown-menu");

    // Toggle dropdown
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("active");
    });

    // Cerrar al hacer click fuera
    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove("active");
      }
    });

    // Cargar marcas en el dropdown
    async function loadDropdownMarcas() {
      try {
        const response = await fetch("/api/public/proveedores");
        const data = await response.json();

        if (
          data.success &&
          data.data &&
          data.data.proveedores &&
          data.data.proveedores.length > 0
        ) {
          menu.innerHTML = `
            <a href="/catalogo.html" class="navbar-dropdown-item highlight">
              📦 Catálogo Completo
            </a>
            ${data.data.proveedores
              .map(
                (proveedor) => `
              <a 
                href="/proveedor-tienda.html?id=${proveedor.proveedorId}" 
                class="navbar-dropdown-item"
              >
                ${proveedor.nombre}
              </a>
            `
              )
              .join("")}
          `;
        } else {
          menu.innerHTML = `
            <div class="navbar-dropdown-empty">
              No hay marcas disponibles
            </div>
          `;
        }
      } catch (error) {
        console.error("Error cargando dropdown de marcas:", error);
        menu.innerHTML = `
          <div class="navbar-dropdown-empty">
            Error al cargar marcas
          </div>
        `;
      }
    }

    loadDropdownMarcas();
  }

  // ========================================
  // LOGOUT
  // ========================================
  function initLogout() {
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (typeof logout === "function") {
          logout();
        } else {
          // Fallback si logout no está definido
          localStorage.removeItem("razoconnect_token");
          localStorage.removeItem("razoconnect_user");
          window.location.replace("/login.html");
        }
      });
    }
  }

  // ========================================
  // INICIALIZAR TODO AL CARGAR LA PÁGINA
  // ========================================
  document.addEventListener("DOMContentLoaded", () => {
    // 1. Personalizar saludo
    personalizarSaludo();

    // 2. Cargar marcas
    loadMarcas();

    // 3. Cargar novedades
    loadNovedades();

    // 4. Inicializar dropdown
    initMarcasDropdown();

    // 5. Inicializar logout
    initLogout();
  });
})();
