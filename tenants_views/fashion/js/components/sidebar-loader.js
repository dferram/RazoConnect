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

  function bindUI() {
    const searchInput = document.getElementById("sidebarFiltroBuscar");
    const btnFiltrar = document.getElementById("sidebarBtnFiltrar");
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

    precioMin?.addEventListener("input", () => {
      onPrecioInput();
    });
    precioMax?.addEventListener("input", () => {
      onPrecioInput();
    });

    btnFiltrar?.addEventListener("click", () => {
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

      const categorias = Array.isArray(data?.data?.categorias)
        ? data.data.categorias
        : [];

      ul.innerHTML = "";

      const renderItem = (categoriaId, nombre, checked) => {
        const id = `cat_${categoriaId}`;
        return `
          <li class="form-check" style="margin: 0.35rem 0;">
            <input class="form-check-input" type="radio" name="sidebarCategoria" id="${id}" value="${categoriaId}" ${checked ? "checked" : ""} />
            <label class="form-check-label" for="${id}" style="cursor:pointer;">
              ${nombre}
            </label>
          </li>
        `;
      };

      const itemsHtml = [];

      itemsHtml.push(
        `
        <li class="form-check" style="margin: 0.35rem 0;">
          <input class="form-check-input" type="radio" name="sidebarCategoria" id="cat_all" value="" checked />
          <label class="form-check-label" for="cat_all" style="cursor:pointer;">
            Todas
          </label>
        </li>
        `
      );

      for (const cat of categorias) {
        const categoriaId = cat?.categoriaid ?? cat?.categoriaId;
        const nombre = (cat?.nombre || cat?.Nombre || "").toString().trim();
        if (!categoriaId || !nombre) continue;
        itemsHtml.push(renderItem(categoriaId, nombre, false));
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
      ul.innerHTML = '<li class="text-muted" style="font-size:0.9rem;">Error al cargar categorías</li>';
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

      const proveedores = Array.isArray(data?.data?.proveedores)
        ? data.data.proveedores
        : [];

      ul.innerHTML = "";

      const itemsHtml = [];

      itemsHtml.push(
        `
        <li class="form-check" style="margin: 0.35rem 0;">
          <input class="form-check-input" type="radio" name="sidebarMarca" id="marca_all" value="" checked />
          <label class="form-check-label" for="marca_all" style="cursor:pointer;">
            Todas
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
          <li class="form-check" style="margin: 0.35rem 0;">
            <input class="form-check-input" type="radio" name="sidebarMarca" id="${id}" value="${proveedorId}" />
            <label class="form-check-label" for="${id}" style="cursor:pointer;">
              ${nombre}
            </label>
          </li>
          `
        );
      }

      ul.innerHTML = itemsHtml.join("");

      const shouldHide = STATE.page.isProveedorTienda;
      section.style.display = shouldHide ? "none" : "block";

      ul.querySelectorAll('input[name="sidebarMarca"]').forEach((input) => {
        input.addEventListener("change", (e) => {
          const raw = (e.target.value || "").toString().trim();
          STATE.proveedorId = raw ? parseInt(raw, 10) : null;
          emitirCambio("marca");
        });
      });
    } catch (error) {
      console.error("Error cargando marcas:", error);
      ul.innerHTML = '<li class="text-muted" style="font-size:0.9rem;">Error al cargar marcas</li>';
      section.style.display = STATE.page.isProveedorTienda ? "none" : "block";
    }
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
