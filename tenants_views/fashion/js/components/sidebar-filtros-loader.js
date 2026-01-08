(function () {
  "use strict";

  const STATE = {
    search: "",
    categoriaId: null,
    proveedorId: null,
    precioMin: "",
    precioMax: "",
    page: {
      isProveedorTienda: false,
      proveedorTiendaId: null,
    },
  };

  function detectarContextoPagina() {
    const path = (window.location.pathname || "").toLowerCase();
    const params = new URLSearchParams(window.location.search);

    STATE.page.isProveedorTienda = path.includes("proveedor-tienda.html");
    STATE.page.proveedorTiendaId = STATE.page.isProveedorTienda
      ? params.get("id")
      : null;
  }

  function emitirCambio(origen = "ui") {
    const detail = {
      search: STATE.search,
      categoriaId: STATE.categoriaId,
      proveedorId: STATE.proveedorId,
      precioMin: STATE.precioMin,
      precioMax: STATE.precioMax,
      proveedorTiendaId: STATE.page.proveedorTiendaId,
      origen,
    };

    document.dispatchEvent(new CustomEvent("filtroCambiado", { detail }));
  }

  function initAccordion() {
    document.querySelectorAll(".sidebar-filtros [data-filter-accordion]").forEach((section) => {
      const headerBtn = section.querySelector("[data-filter-accordion-toggle]");
      if (!headerBtn) return;

      headerBtn.addEventListener("click", () => {
        const isCollapsed = section.classList.contains("is-collapsed");
        section.classList.toggle("is-collapsed", !isCollapsed);
        section.classList.toggle("is-open", isCollapsed);
      });
    });
  }

  function bindUI() {
    const searchInput = document.getElementById("sidebarFiltroBuscar");
    const linkAplicar = document.getElementById("sidebarPrecioAplicar");
    const precioMin = document.getElementById("sidebarPrecioMin");
    const precioMax = document.getElementById("sidebarPrecioMax");

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        STATE.search = (e.target.value || "").toString();
        emitirCambio("search");
      });
    }

    const onPrecioInput = () => {
      STATE.precioMin = precioMin?.value || "";
      STATE.precioMax = precioMax?.value || "";
    };

    precioMin?.addEventListener("input", onPrecioInput);
    precioMax?.addEventListener("input", onPrecioInput);

    linkAplicar?.addEventListener("click", (e) => {
      e.preventDefault();
      onPrecioInput();
      emitirCambio("precio");
    });
  }

  async function cargarCategorias() {
    const ul = document.getElementById("sidebarFiltroCategorias");
    if (!ul) return;

    try {
      const res = await fetch("/api/categorias");
      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "No se pudo cargar categorías");
      }

      const categorias = Array.isArray(data?.data?.categorias) ? data.data.categorias : [];

      const itemsHtml = [];

      itemsHtml.push(
        `
        <li class="filter-item">
          <label class="filter-link">
            <input type="radio" name="sidebarCategoria" id="cat_all" value="" hidden checked />
            <span class="link-text">Todas</span>
            <span class="checkmark-icon bi bi-check-lg"></span>
          </label>
        </li>
        `
      );

      for (const cat of categorias) {
        const categoriaId = cat?.categoriaid ?? cat?.categoriaId;
        const nombre = (cat?.nombre || cat?.Nombre || "").toString().trim();
        if (!categoriaId || !nombre) continue;

        const id = `cat_${categoriaId}`;
        itemsHtml.push(
          `
          <li class="filter-item">
            <label class="filter-link">
              <input type="radio" name="sidebarCategoria" id="${id}" value="${categoriaId}" hidden />
              <span class="link-text">${nombre}</span>
              <span class="checkmark-icon bi bi-check-lg"></span>
            </label>
          </li>
          `
        );
      }

      ul.innerHTML = itemsHtml.join("");

      ul.querySelectorAll('input[name="sidebarCategoria"]').forEach((input) => {
        input.addEventListener("change", (e) => {
          const raw = (e.target.value || "").toString().trim();
          STATE.categoriaId = raw ? parseInt(raw, 10) : null;
          emitirCambio("categoria");
        });
      });
    } catch (error) {
      console.error("Error cargando categorías:", error);
      ul.innerHTML =
        '<li class="filter-item"><span class="text-muted" style="font-size:0.9rem;">Error al cargar categorías</span></li>';
    }
  }

  async function cargarMarcas() {
    const ul = document.getElementById("sidebarFiltroMarcas");
    const section = document.getElementById("sidebarFiltroMarcasSection");
    if (!ul || !section) return;

    try {
      const res = await fetch("/api/public/proveedores");
      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "No se pudo cargar marcas");
      }

      const proveedores = Array.isArray(data?.data?.proveedores) ? data.data.proveedores : [];

      const itemsHtml = [];

      itemsHtml.push(
        `
        <li class="filter-item">
          <label class="filter-link">
            <input type="radio" name="sidebarMarca" id="marca_all" value="" hidden checked />
            <span class="link-text">Todas</span>
            <span class="checkmark-icon bi bi-check-lg"></span>
          </label>
        </li>
        `
      );

      for (const prov of proveedores) {
        const proveedorId = prov?.proveedorId;
        const nombre = (prov?.nombre || "").toString().trim();
        if (!proveedorId || !nombre) continue;

        const id = `marca_${proveedorId}`;
        itemsHtml.push(
          `
          <li class="filter-item">
            <label class="filter-link">
              <input type="radio" name="sidebarMarca" id="${id}" value="${proveedorId}" hidden />
              <span class="link-text">${nombre}</span>
              <span class="checkmark-icon bi bi-check-lg"></span>
            </label>
          </li>
          `
        );
      }

      ul.innerHTML = itemsHtml.join("");

      section.style.display = STATE.page.isProveedorTienda ? "none" : "block";

      ul.querySelectorAll('input[name="sidebarMarca"]').forEach((input) => {
        input.addEventListener("change", (e) => {
          const raw = (e.target.value || "").toString().trim();
          STATE.proveedorId = raw ? parseInt(raw, 10) : null;
          emitirCambio("marca");
        });
      });
    } catch (error) {
      console.error("Error cargando marcas:", error);
      ul.innerHTML =
        '<li class="filter-item"><span class="text-muted" style="font-size:0.9rem;">Error al cargar marcas</span></li>';
      section.style.display = STATE.page.isProveedorTienda ? "none" : "block";
    }
  }

  async function cargarSidebarFiltros() {
    const container = document.getElementById("sidebar-filters-container");
    if (!container) return;

    detectarContextoPagina();

    try {
      const res = await fetch("components/sidebar-filtros.html", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      if (!res.ok) {
        throw new Error(`No se pudo cargar sidebar-filtros: ${res.status}`);
      }

      container.innerHTML = await res.text();

      initAccordion();
      bindUI();
      await Promise.all([cargarCategorias(), cargarMarcas()]);

      emitirCambio("init");
    } catch (error) {
      console.error("Error cargando sidebar de filtros:", error);
    }
  }

  function resetSidebarFiltros() {
    STATE.search = "";
    STATE.categoriaId = null;
    STATE.proveedorId = null;
    STATE.precioMin = "";
    STATE.precioMax = "";

    const searchInput = document.getElementById("sidebarFiltroBuscar");
    const precioMin = document.getElementById("sidebarPrecioMin");
    const precioMax = document.getElementById("sidebarPrecioMax");
    const catAll = document.getElementById("cat_all");
    const marcaAll = document.getElementById("marca_all");

    if (searchInput) searchInput.value = "";
    if (precioMin) precioMin.value = "";
    if (precioMax) precioMax.value = "";
    if (catAll) catAll.checked = true;
    if (marcaAll) marcaAll.checked = true;

    emitirCambio("reset");
  }

  window.RazoSidebarFiltros = {
    cargar: cargarSidebarFiltros,
    getState: () => ({ ...STATE }),
    reset: resetSidebarFiltros,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cargarSidebarFiltros);
  } else {
    cargarSidebarFiltros();
  }
})();
