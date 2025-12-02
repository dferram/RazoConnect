/**
 * inicio-new.js
 * Lógica completa para la página de inicio estilo Nike
 * Carrusel, Ofertas, Novedades, Contador Regresivo, Categorías
 */

(function () {
  "use strict";

  // ========================================
  // CONFIGURACIÓN Y CONSTANTES
  // ========================================
  const CONFIG = {
    flashSaleEndTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas desde ahora
    sliderInterval: 5000, // 5 segundos entre slides
    categorias: [
      {
        id: 1,
        nombre: "Cajas",
        emoji: "📦",
        link: "/catalogo.html?categoria=1",
      },
      {
        id: 2,
        nombre: "Peluches",
        emoji: "🧸",
        link: "/catalogo.html?categoria=2",
      },
      {
        id: 3,
        nombre: "Bolsas",
        emoji: "👜",
        link: "/catalogo.html?categoria=3",
      },
      {
        id: 7,
        nombre: "Navidad",
        emoji: "🎄",
        link: "/catalogo.html?categoria=7",
      },
    ],
  };

  // ========================================
  // INICIALIZAR USUARIO (ESTILO SISTEMA)
  // ========================================
  function initUserInfo() {
    const user = JSON.parse(localStorage.getItem("razoconnect_user") || "{}");
    const userGreeting = document.getElementById("userGreeting");

    if (userGreeting && user && user.nombre) {
      const firstName = user.nombre.split(" ")[0];
      userGreeting.textContent = `Hola, ${firstName}`;
    }
  }

  // ========================================
  // HERO SLIDER AUTOMÁTICO
  // ========================================
  let currentSlide = 0;
  let sliderTimer = null;

  function initHeroSlider() {
    const slides = document.querySelectorAll(".hero-slide");
    const dots = document.querySelectorAll(".slider-dot");

    if (slides.length === 0) return;

    function showSlide(index) {
      // Remover active de todos
      slides.forEach((slide) => slide.classList.remove("active"));
      dots.forEach((dot) => dot.classList.remove("active"));

      // Activar el slide actual
      slides[index].classList.add("active");
      dots[index].classList.add("active");
    }

    function nextSlide() {
      currentSlide = (currentSlide + 1) % slides.length;
      showSlide(currentSlide);
    }

    // Auto-play
    function startAutoPlay() {
      stopAutoPlay();
      sliderTimer = setInterval(nextSlide, CONFIG.sliderInterval);
    }

    function stopAutoPlay() {
      if (sliderTimer) {
        clearInterval(sliderTimer);
        sliderTimer = null;
      }
    }

    // Event listeners para los dots
    dots.forEach((dot, index) => {
      dot.addEventListener("click", () => {
        currentSlide = index;
        showSlide(currentSlide);
        startAutoPlay(); // Reiniciar el timer
      });
    });

    // Pausar en hover
    const heroSlider = document.getElementById("heroSlider");
    if (heroSlider) {
      heroSlider.addEventListener("mouseenter", stopAutoPlay);
      heroSlider.addEventListener("mouseleave", startAutoPlay);
    }

    // Iniciar
    startAutoPlay();
  }

  // ========================================
  // CATEGORÍAS VISUALES
  // ========================================
  function loadCategories() {
    const grid = document.getElementById("categoriesGrid");
    if (!grid) return;

    const html = CONFIG.categorias
      .map(
        (cat) => `
      <a href="${cat.link}" class="category-card">
        <div class="category-icon-emoji">${cat.emoji}</div>
        <div class="category-name">${cat.nombre}</div>
      </a>
    `
      )
      .join("");

    grid.innerHTML = html;
  }

  // ========================================
  // CONTADOR REGRESIVO
  // ========================================
  function initCountdown() {
    const hoursEl = document.getElementById("hours");
    const minutesEl = document.getElementById("minutes");
    const secondsEl = document.getElementById("seconds");

    if (!hoursEl || !minutesEl || !secondsEl) return;

    function updateCountdown() {
      const now = new Date().getTime();
      const distance = CONFIG.flashSaleEndTime - now;

      if (distance < 0) {
        // Si el tiempo terminó, reiniciar a 24 horas
        CONFIG.flashSaleEndTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        return;
      }

      const hours = Math.floor(distance / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      hoursEl.textContent = String(hours).padStart(2, "0");
      minutesEl.textContent = String(minutes).padStart(2, "0");
      secondsEl.textContent = String(seconds).padStart(2, "0");
    }

    // Actualizar cada segundo
    updateCountdown();
    setInterval(updateCountdown, 1000);
  }

  // ========================================
  // RENDERIZAR TARJETA DE PRODUCTO
  // ========================================
  function renderProductCard(producto, type = "flash") {
    const precioBase = parseFloat(
      producto.precioDesde || producto.precioUnitario || 0
    );
    const precioOferta = producto.precioOferta
      ? parseFloat(producto.precioOferta)
      : null;

    const precioMostrar = precioOferta || precioBase;
    const precioFormateado = precioMostrar.toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });

    const tieneOferta = precioOferta && precioOferta < precioBase;
    const descuento = tieneOferta
      ? Math.round(((precioBase - precioOferta) / precioBase) * 100)
      : 0;

    const precioOriginalHtml = tieneOferta
      ? `<span class="flash-price-original">${precioBase.toLocaleString(
          "es-MX",
          {
            style: "currency",
            currency: "MXN",
          }
        )}</span>`
      : "";

    const descuentoBadgeHtml =
      descuento > 0
        ? `<span class="flash-discount-badge">-${descuento}%</span>`
        : "";

    const badge =
      type === "flash"
        ? `<div class="flash-badge">⚡ OFERTA</div>`
        : `<div class="new-badge">🆕 NUEVO</div>`;

    const stock = producto.variantesConStock || 0;
    const imagenUrl =
      producto.imagenUrl ||
      "https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=400&h=400&fit=crop";

    if (type === "flash") {
      return `
        <a href="/producto-detalle.html?id=${
          producto.productoId
        }" class="flash-product-card">
          <div class="flash-product-image">
            <img src="${imagenUrl}" alt="${
        producto.nombreProducto
      }" loading="lazy" />
            ${badge}
          </div>
          <div class="flash-product-info">
            <h3 class="flash-product-title">${producto.nombreProducto}</h3>
            <div class="flash-price-container">
              ${precioOriginalHtml}
              <span class="flash-price-offer">${precioFormateado}</span>
              ${descuentoBadgeHtml}
            </div>
            ${
              stock > 0
                ? `<p style="color: #10b981; font-size: 0.875rem; margin-top: 0.5rem;">✓ ${stock} disponibles</p>`
                : `<p style="color: #ef4444; font-size: 0.875rem; margin-top: 0.5rem;">Sin stock</p>`
            }
          </div>
        </a>
      `;
    } else {
      // Tipo "arrival"
      return `
        <a href="/producto-detalle.html?id=${
          producto.productoId
        }" class="arrival-card">
          <div class="arrival-image">
            <img src="${imagenUrl}" alt="${
        producto.nombreProducto
      }" loading="lazy" />
            ${badge}
          </div>
          <div class="arrival-info">
            <h3 class="arrival-title">${producto.nombreProducto}</h3>
            <p class="arrival-price">${precioFormateado}</p>
            <p class="arrival-details">
              ${
                producto.categoria ? producto.categoria.nombre : "Sin categoría"
              }
              ${stock > 0 ? ` • ${stock} disponibles` : " • Sin stock"}
            </p>
          </div>
        </a>
      `;
    }
  }

  // ========================================
  // CARGAR OFERTAS FLASH
  // ========================================
  async function loadFlashSales() {
    const grid = document.getElementById("flashGrid");
    if (!grid) return;

    try {
      const response = await fetch("/api/productos?oferta=true&limit=4");
      const data = await response.json();

      if (
        data.success &&
        data.data &&
        data.data.productos &&
        data.data.productos.length > 0
      ) {
        grid.innerHTML = data.data.productos
          .map((producto) => renderProductCard(producto, "flash"))
          .join("");
      } else {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: white;">
            <p style="font-size: 1.25rem; margin-bottom: 1rem;">🔥 Próximamente nuevas ofertas</p>
            <a href="/catalogo.html" style="color: white; text-decoration: underline;">Ver catálogo completo</a>
          </div>
        `;
      }
    } catch (error) {
      console.error("Error cargando ofertas flash:", error);
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: white;">
          <p>⚠️ Error al cargar ofertas. Intenta recargar la página.</p>
        </div>
      `;
    }
  }

  // ========================================
  // CARGAR NUEVOS ARRIBOS
  // ========================================
  async function loadNewArrivals() {
    const grid = document.getElementById("arrivalsGrid");
    if (!grid) return;

    try {
      const response = await fetch("/api/productos?sort=newest&limit=8");
      const data = await response.json();

      if (
        data.success &&
        data.data &&
        data.data.productos &&
        data.data.productos.length > 0
      ) {
        grid.innerHTML = data.data.productos
          .map((producto) => renderProductCard(producto, "arrival"))
          .join("");
      } else {
        grid.innerHTML = `
          <div style="min-width: 300px; text-align: center; padding: 3rem;">
            <p style="font-size: 1.25rem; color: #718096;">📦 Próximamente nuevos productos</p>
          </div>
        `;
      }
    } catch (error) {
      console.error("Error cargando nuevos arribos:", error);
      grid.innerHTML = `
        <div style="min-width: 300px; text-align: center; padding: 3rem;">
          <p style="color: #e53e3e;">⚠️ Error al cargar productos</p>
        </div>
      `;
    }
  }

  // ========================================
  // DROPDOWN DE MARCAS (ESTILO SISTEMA)
  // ========================================
  function initMarcasDropdown() {
    const dropdown = document.getElementById("marcasDropdown");
    if (!dropdown) return;

    const toggle = dropdown.querySelector(".navbar-dropdown-toggle");
    const menu = dropdown.querySelector(".navbar-dropdown-menu");

    if (!toggle || !menu) return;

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

    // Cargar marcas
    async function loadMarcasMenu() {
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
        console.error("Error cargando marcas:", error);
        menu.innerHTML = `
          <div class="navbar-dropdown-empty">
            Error al cargar marcas
          </div>
        `;
      }
    }

    loadMarcasMenu();
  }

  // ========================================
  // NAVEGACIÓN Y LOGOUT
  // ========================================
  function initNavigation() {
    // Botón de logout
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (typeof logout === "function") {
          logout();
        } else {
          localStorage.removeItem("razoconnect_token");
          localStorage.removeItem("razoconnect_user");
          localStorage.removeItem("razoconnect_admin_token");
          window.location.href = "/login.html";
        }
      });
    }
  }

  // ========================================
  // SCROLL HORIZONTAL SUAVE
  // ========================================
  function initHorizontalScroll() {
    const container = document.querySelector(".arrivals-scroll-container");
    if (!container) return;

    let isDown = false;
    let startX;
    let scrollLeft;

    container.addEventListener("mousedown", (e) => {
      isDown = true;
      container.style.cursor = "grabbing";
      startX = e.pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
    });

    container.addEventListener("mouseleave", () => {
      isDown = false;
      container.style.cursor = "grab";
    });

    container.addEventListener("mouseup", () => {
      isDown = false;
      container.style.cursor = "grab";
    });

    container.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX) * 2;
      container.scrollLeft = scrollLeft - walk;
    });

    // Touch support for mobile
    let touchStartX = 0;
    let touchScrollLeft = 0;

    container.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].pageX;
      touchScrollLeft = container.scrollLeft;
    });

    container.addEventListener("touchmove", (e) => {
      const touchX = e.touches[0].pageX;
      const walk = (touchStartX - touchX) * 1.5;
      container.scrollLeft = touchScrollLeft + walk;
    });
  }

  // ========================================
  // ANIMACIONES AL SCROLL
  // ========================================
  function initScrollAnimations() {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: "0px 0px -100px 0px",
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("animate-fade-in-up");
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    // Observar secciones
    document.querySelectorAll("section").forEach((section) => {
      observer.observe(section);
    });
  }

  // ========================================
  // MANEJO DE ERRORES DE IMAGEN
  // ========================================
  function initImageErrorHandling() {
    document.addEventListener(
      "error",
      (e) => {
        if (e.target.tagName === "IMG") {
          e.target.src =
            "https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=400&h=400&fit=crop";
        }
      },
      true
    );
  }

  // ========================================
  // ANALYTICS (OPCIONAL)
  // ========================================
  function trackPageView() {
    console.log("📊 Página de inicio vista");
    // Aquí puedes agregar Google Analytics, Mixpanel, etc.
  }

  // ========================================
  // INICIALIZACIÓN PRINCIPAL
  // ========================================
  async function init() {
    console.log("🚀 Inicializando página de inicio...");

    try {
      // 1. Info del usuario y carrito
      initUserInfo();

      // 2. Hero Slider
      initHeroSlider();

      // 3. Categorías
      loadCategories();

      // 4. Contador regresivo
      initCountdown();

      // 5. Cargar contenido dinámico (paralelo)
      await Promise.all([loadFlashSales(), loadNewArrivals()]);

      // 6. Dropdown de marcas
      initMarcasDropdown();

      // 7. Navegación
      initNavigation();

      // 8. Scroll horizontal
      initHorizontalScroll();

      // 9. Animaciones
      initScrollAnimations();

      // 10. Error handling
      initImageErrorHandling();

      // 11. Analytics
      trackPageView();

      console.log("✅ Página de inicio lista");
    } catch (error) {
      console.error("❌ Error inicializando página:", error);
    }
  }

  // ========================================
  // EJECUTAR CUANDO EL DOM ESTÉ LISTO
  // ========================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ========================================
  // EXPONER FUNCIONES GLOBALES (OPCIONAL)
  // ========================================
  window.RazoConnectInicio = {
    loadFlashSales,
    loadNewArrivals,
  };
})();
