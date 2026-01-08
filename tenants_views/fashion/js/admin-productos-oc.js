const adminToken = localStorage.getItem("razoconnect_admin_token");
if (!adminToken) {
  window.location.href = "/login.html";
}

const STORAGE_KEY = "razoconnect_oc_items";

let debounce = null;
let resultados = [];
let catalogo = [];
let maestros = [];
let variantesPorProducto = new Map();
let varianteById = new Map();
let productoById = new Map();
let productoModalActualId = null;

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (e) {
    return fallback;
  }
}

function loadItems() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  const items = safeJsonParse(raw, []);
  return Array.isArray(items) ? items : [];
}

function saveItems(items) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items || []));
}

function formatMoney(value) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(safe);
}

function escapeHtml(value) {
  return (value || "").toString().replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

function setLoading(isLoading) {
  const el = document.getElementById("loading");
  if (!el) return;
  el.style.display = isLoading ? "flex" : "none";
}

function getProveedorIdSeleccionado() {
  const value = (document.getElementById("proveedorId")?.value || "").trim();
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function setAlertReglasEmpaqueVisible(isVisible) {
  const el = document.getElementById("alertReglasEmpaque");
  if (!el) return;
  el.style.display = isVisible ? "block" : "none";
}

async function checkReglasEmpaqueProveedor() {
  const proveedorId = getProveedorIdSeleccionado();

  if (!proveedorId) {
    setAlertReglasEmpaqueVisible(false);
    return;
  }

  try {
    const data = await fetchJSON(`${API_BASE_URL}/admin/proveedores/${proveedorId}/reglas`);
    const reglas = data?.data?.reglas || {};
    const hasReglas = reglas && typeof reglas === "object" && Object.keys(reglas).length > 0;
    setAlertReglasEmpaqueVisible(!hasReglas);
  } catch (e) {
    console.error("Error verificando reglas de empaque del proveedor:", e);
    setAlertReglasEmpaqueVisible(false);
  }
}

async function fetchJSON(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data?.message || "Request failed");
  }

  return data;
}

async function loadFiltros() {
  const proveedorSelect = document.getElementById("proveedorId");
  const categoriaSelect = document.getElementById("categoriaId");
  const medidaSelect = document.getElementById("medida");

  try {
    const [proveedoresData, categoriasData, medidasData] = await Promise.all([
      fetchJSON(`${API_BASE_URL}/admin/proveedores`),
      fetchJSON(`${API_BASE_URL}/admin/categorias`),
      fetchJSON(`${API_BASE_URL}/admin/medidas-existentes`),
    ]);

    const proveedores = proveedoresData?.data?.proveedores || [];
    const categorias = categoriasData?.data?.categorias || [];
    const medidas = medidasData?.data?.medidas || [];

    if (proveedorSelect) {
      proveedores.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.proveedorid;
        opt.textContent = p.nombreempresa;
        proveedorSelect.appendChild(opt);
      });
    }

    if (categoriaSelect) {
      categorias.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.categoriaId;
        opt.textContent = c.nombre;
        categoriaSelect.appendChild(opt);
      });
    }

    if (medidaSelect) {
      medidas.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        medidaSelect.appendChild(opt);
      });
    }
  } catch (e) {
    console.error("Error cargando filtros:", e);
    if (typeof showToast === "function") {
      showToast("No se pudieron cargar los filtros", "error");
    }
  }
}

function buildQuery() {
  const q = (document.getElementById("q")?.value || "").trim();
  const proveedorId = (document.getElementById("proveedorId")?.value || "").trim();
  const categoriaId = (document.getElementById("categoriaId")?.value || "").trim();
  const medida = (document.getElementById("medida")?.value || "").trim();

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (proveedorId) params.set("proveedorId", proveedorId);
  if (categoriaId) params.set("categoriaId", categoriaId);
  if (medida) params.set("medida", medida);

  return params.toString();
}

function normalizeText(value) {
  return (value || "").toString().trim().toLowerCase();
}

function applyFilters() {
  const q = normalizeText(document.getElementById("q")?.value);
  const categoriaId = (document.getElementById("categoriaId")?.value || "").trim();
  const medida = (document.getElementById("medida")?.value || "").trim();

  const hasCategoria = !!categoriaId;
  const hasMedida = !!medida;

  resultados = (maestros || []).filter((p) => {
    if (hasCategoria && String(p.categoriaid ?? "") !== String(categoriaId)) return false;
    if (hasMedida && !(p.medidasSet && p.medidasSet.has(medida))) return false;

    if (q) {
      const hay = normalizeText(p.searchText);
      return hay.includes(q);
    }

    return true;
  });

  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty");
  const summary = document.getElementById("resultSummary");
  if (!grid) return;

  if (summary) {
    summary.textContent = `${Array.isArray(resultados) ? resultados.length : 0} resultado(s)`;
  }

  if (!Array.isArray(resultados) || resultados.length === 0) {
    grid.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }

  if (empty) empty.style.display = "none";

  grid.innerHTML = resultados
    .map((p) => {
      // ESTRATEGIA DE FALLBACK DE IMAGEN (3 niveles):
      // 1. Imagen de variante (si existe)
      // 2. Imagen maestra del producto (si existe)
      // 3. Placeholder por defecto
      const imagenVariante = p.imagenUrl || null;
      const imagenMaestra = (p.variantes && p.variantes[0]?.url_imagen_producto) || null;
      const img = imagenVariante || imagenMaestra || "/images/default-product.png";
      
      const nombre = p.nombreproducto || "(Sin nombre)";
      const skuMaestro = p.sku_maestro || "—";
      const medidas = Array.from(p.medidasSet || []);
      const medidasLabel = (() => {
        if (!medidas.length) return "-";
        if (medidas.length <= 3) return medidas.join(", ");
        return `${medidas.slice(0, 3).join(", ")} +${medidas.length - 3}`;
      })();
      const variantesCount = Array.isArray(p.variantes) ? p.variantes.length : 0;

      return `
        <div class="oc-card" onclick="openVariantesModal(${p.productoid})" title="Ver variantes">
          <img
            src="${img}"
            class="oc-card-img"
            alt="${escapeHtml(nombre)}"
            loading="lazy"
            onerror="this.src='/images/default-product.png'; this.onerror=null;"
          />
          <div class="oc-card-body">
            <h3 class="oc-card-title">${escapeHtml(nombre)}</h3>
            <div class="oc-card-meta">SKU Maestro: <code>${escapeHtml(skuMaestro)}</code></div>
            <div class="oc-card-meta">Medidas: <strong>${escapeHtml(medidasLabel)}</strong></div>
          </div>
          <div class="oc-card-footer">
            <div class="oc-card-meta">Variantes: <strong>${variantesCount}</strong></div>
            <div class="oc-card-meta" style="color: #9a3412; font-weight: 800;">Ver</div>
          </div>
        </div>
      `;
    })
    .join("");
}

async function buscar() {
  applyFilters();
}

async function loadCatalogoCompleto() {
  setLoading(true);
  try {
    const proveedorId = getProveedorIdSeleccionado();
    const qs = proveedorId
      ? `?all=1&proveedorId=${encodeURIComponent(proveedorId)}&filtrarProveedor=1`
      : "?all=1";
    const data = await fetchJSON(`${API_BASE_URL}/admin/productos/buscar-compra${qs}`);
    catalogo = Array.isArray(data?.data?.resultados) ? data.data.resultados : [];

    variantesPorProducto = new Map();
    varianteById = new Map();
    productoById = new Map();

    for (const v of catalogo) {
      const pid = Number.parseInt(v.productoid, 10);
      const vid = Number.parseInt(v.varianteid, 10);
      if (!Number.isInteger(pid) || pid <= 0) continue;

      if (Number.isInteger(vid) && vid > 0) {
        varianteById.set(vid, v);
      }

      if (!variantesPorProducto.has(pid)) variantesPorProducto.set(pid, []);
      variantesPorProducto.get(pid).push(v);

      if (!productoById.has(pid)) {
        productoById.set(pid, {
          productoid: pid,
          proveedorid: v.proveedorid ?? null,
          categoriaid: v.categoriaid ?? null,
          nombreproducto: v.nombreproducto || null,
          sku_maestro: v.sku_maestro || null,
          imagenUrl: v.url_imagen_variante || null,
          medidasSet: new Set(),
          variantes: [],
          searchText: "",
        });
      }

      const p = productoById.get(pid);
      if (!p.imagenUrl && v.url_imagen_variante) p.imagenUrl = v.url_imagen_variante;
      if (v.medidas) p.medidasSet.add(String(v.medidas));
      p.variantes.push(v);
    }

    maestros = Array.from(productoById.values()).map((p) => {
      const skus = (p.variantes || []).map((vv) => (vv.sku || "").toString()).join(" ");
      const base = `${p.nombreproducto || ""} ${p.sku_maestro || ""} ${skus}`;
      p.searchText = base;
      return p;
    });
  } catch (e) {
    console.error("Error cargando catálogo:", e);
    catalogo = [];
    maestros = [];
    variantesPorProducto = new Map();
    varianteById = new Map();
    productoById = new Map();
    if (typeof showToast === "function") {
      showToast("No se pudo cargar el catálogo de productos", "error");
    }
  } finally {
    setLoading(false);
  }
}

window.openVariantesModal = function openVariantesModal(productoId) {
  const pid = Number.parseInt(productoId, 10);
  if (!Number.isInteger(pid) || pid <= 0) return;

  const modal = document.getElementById("variantesModal");
  if (!modal) return;

  productoModalActualId = pid;

  const p = productoById.get(pid);
  const titleEl = document.getElementById("variantesModalTitle");
  const subEl = document.getElementById("variantesModalSubtitle");
  if (titleEl) titleEl.textContent = p?.nombreproducto || "Variantes";
  if (subEl) {
    const skuM = p?.sku_maestro ? `SKU Maestro: ${p.sku_maestro}` : "";
    subEl.textContent = skuM || "Selecciona una variante para agregarla a la OC.";
  }

  renderVariantesModal(pid);
  modal.style.display = "flex";
};

window.closeVariantesModal = function closeVariantesModal() {
  const modal = document.getElementById("variantesModal");
  if (!modal) return;
  modal.style.display = "none";
  productoModalActualId = null;
};

window.onModalPaquetesChange = function onModalPaquetesChange(varianteId) {
  const vid = Number.parseInt(varianteId, 10);
  if (!Number.isInteger(vid) || vid <= 0) return;

  const v = varianteById.get(vid);
  if (!v) return;

  const regla = Number.parseInt(v.cantidad_empaque, 10);
  const reglaEmpaque = Number.isInteger(regla) && regla > 0 ? regla : 1;

  const qtyEl = document.getElementById(`modalVarQty-${vid}`);
  const piezasEl = document.getElementById(`modalVarPieces-${vid}`);
  if (!qtyEl || !piezasEl) return;

  const raw = qtyEl.value;
  const parsed = Number.parseInt(raw, 10);
  const paquetes = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  if (String(paquetes) !== String(raw)) {
    qtyEl.value = String(paquetes);
  }

  piezasEl.textContent = `= ${paquetes * reglaEmpaque} piezas`;
};

function renderVariantesModal(productoId) {
  const pid = Number.parseInt(productoId, 10);
  const tbody = document.getElementById("variantesTableBody");
  if (!tbody) return;

  const variantes = variantesPorProducto.get(pid) || [];
  if (!variantes.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="padding: 1rem; color: var(--razo-gray-warm); text-align: center;">No hay variantes para este producto</td></tr>';
    return;
  }

  tbody.innerHTML = variantes
    .map((v) => {
      // ESTRATEGIA DE FALLBACK DE IMAGEN (3 niveles):
      // 1. Imagen de variante (url_imagen_variante)
      // 2. Imagen maestra del producto (url_imagen_producto)
      // 3. Placeholder por defecto
      const imagenVariante = v.url_imagen_variante || null;
      const imagenMaestra = v.url_imagen_producto || null;
      const img = imagenVariante || imagenMaestra || "/images/default-product.png";
      
      const sku = v.sku || "Sin SKU";
      const medidas = v.medidas || "-";
      const stock = Number.isFinite(Number(v.stock)) ? Number(v.stock) : 0;
      const costo = Number.isFinite(Number(v.costounitario)) ? Number(v.costounitario) : 0;
      const regla = Number.parseInt(v.cantidad_empaque, 10);
      const reglaEmpaque = Number.isInteger(regla) && regla > 0 ? regla : 1;
      const ventaLabel = reglaEmpaque === 1 ? "Unidad" : `Paquete de ${reglaEmpaque} pzas`;

      return `
        <tr>
          <td style="width: 70px;">
            <div class="oc-product-thumb-wrapper" style="width: 56px; height: 56px;">
              <img
                src="${img}"
                alt="${escapeHtml(sku)}"
                class="oc-product-thumb"
                loading="lazy"
                onerror="this.src='/images/default-product.png'; this.onerror=null;"
              />
            </div>
          </td>
          <td>
            <div style="font-weight: 800; color: var(--razo-gray-dark);">${escapeHtml(medidas)}</div>
            <div style="font-size: 0.8rem; color: var(--razo-gray-warm); margin-top: 0.25rem;">
              SKU: <code>${escapeHtml(sku)}</code>
            </div>
            <div style="font-size: 0.8rem; color: #9a3412; margin-top: 0.25rem; font-weight: 800;">
              Venta por: ${escapeHtml(ventaLabel)}
            </div>
          </td>
          <td style="font-weight: 800; color: var(--razo-gray-dark);">
            ${stock}
          </td>
          <td style="font-weight: 800; color: var(--razo-gray-dark);">
            ${formatMoney(costo)}
          </td>
          <td>
            <input
              type="number"
              id="modalVarQty-${v.varianteid}"
              class="form-input"
              min="1"
              step="1"
              value="1"
              oninput="onModalPaquetesChange(${v.varianteid})"
              style="padding: 0.5rem; width: 120px;"
            />
            <div id="modalVarPieces-${v.varianteid}" style="margin-top: 0.35rem; font-size: 0.8rem; color: var(--razo-gray-warm);">
              = ${reglaEmpaque} piezas
            </div>
          </td>
          <td>
            <button
              type="button"
              class="oc-cart-btn"
              onclick="addVarianteToOC(${v.varianteid})"
              title="Agregar a OC"
            >
              <i class="bi bi-cart-plus"></i>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  for (const v of variantes) {
    try {
      window.onModalPaquetesChange(v.varianteid);
    } catch (e) {
      // silencioso
    }
  }
}

window.addVarianteToOC = function addVarianteToOC(varianteId) {
  const vid = Number.parseInt(varianteId, 10);
  if (!Number.isInteger(vid) || vid <= 0) return;

  const v = varianteById.get(vid);
  if (!v) return;

  const qtyEl = document.getElementById(`modalVarQty-${vid}`);
  const qty = Number.parseInt(qtyEl?.value || "1", 10);
  const paquetes = Number.isInteger(qty) && qty > 0 ? qty : 1;

  const regla = Number.parseInt(v.cantidad_empaque, 10);
  const reglaEmpaque = Number.isInteger(regla) && regla > 0 ? regla : 1;

  const items = loadItems();
  const idx = items.findIndex((it) => it.varianteid === vid);

  if (idx >= 0) {
    const prev = Number.parseInt(items[idx].paquetes, 10);
    items[idx].paquetes = (Number.isInteger(prev) && prev > 0 ? prev : 0) + paquetes;
    items[idx].reglaEmpaque = reglaEmpaque;
  } else {
    items.push({
      varianteid: vid,
      sku: v.sku,
      nombre_completo: v.nombre_completo,
      costounitario: Number.isFinite(Number(v.costounitario)) ? Number(v.costounitario) : 0,
      url_imagen_variante: v.url_imagen_variante,
      stock: v.stock,
      paquetes,
      reglaEmpaque,
    });
  }

  saveItems(items);

  if (typeof showToast === "function") {
    showToast("Producto agregado a la OC", "success");
  }
};

function goBackToOC() {
  window.location.href = "/admin-crear-oc.html";
}

function wireEvents() {
  document.getElementById("btnVolverOC")?.addEventListener("click", goBackToOC);

  const qEl = document.getElementById("q");
  qEl?.addEventListener("input", () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => buscar(), 250);
  });

  document.getElementById("proveedorId")?.addEventListener("change", async () => {
    await checkReglasEmpaqueProveedor();
    await loadCatalogoCompleto();
    await buscar();
  });
  document.getElementById("categoriaId")?.addEventListener("change", buscar);
  document.getElementById("medida")?.addEventListener("change", buscar);

  window.addEventListener("click", (event) => {
    const modal = document.getElementById("variantesModal");
    if (modal && event.target === modal) {
      window.closeVariantesModal();
    }
  });
}

function applyQueryStringDefaults() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    const proveedorId = (params.get("proveedorId") || "").trim();
    const categoriaId = (params.get("categoriaId") || "").trim();
    const medida = (params.get("medida") || "").trim();
    const q = (params.get("q") || "").trim();

    const proveedorSelect = document.getElementById("proveedorId");
    const categoriaSelect = document.getElementById("categoriaId");
    const medidaSelect = document.getElementById("medida");
    const qEl = document.getElementById("q");

    if (qEl && q) qEl.value = q;
    if (proveedorSelect && proveedorId) proveedorSelect.value = proveedorId;
    if (categoriaSelect && categoriaId) categoriaSelect.value = categoriaId;
    if (medidaSelect && medida) medidaSelect.value = medida;
  } catch (e) {
    // silencioso
  }
}

(async function init() {
  wireEvents();
  await loadFiltros();
  applyQueryStringDefaults();
  await checkReglasEmpaqueProveedor();
  await loadCatalogoCompleto();
  await buscar();
})();
