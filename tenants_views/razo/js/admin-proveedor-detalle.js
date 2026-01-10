const adminToken = localStorage.getItem("razoconnect_admin_token");
if (!adminToken) window.location.href = "/login.html";

const urlParams = new URLSearchParams(window.location.search);
const proveedorId = urlParams.get("id");

const loadingData = document.getElementById("loadingData");
const proveedorData = document.getElementById("proveedorData");

const proveedorNombre = document.getElementById("proveedorNombre");
const proveedorIdEl = document.getElementById("proveedorId");
const proveedorRfc = document.getElementById("proveedorRfc");
const proveedorEmail = document.getElementById("proveedorEmail");

const tablaReglasEmpaqueBody = document.getElementById("tablaReglasEmpaqueBody");
const alertasPendientes = document.getElementById("alertasPendientes");

const btnAbrirModalReglas = document.getElementById("btnAbrirModalReglas");
const modalReglasEmpaque = document.getElementById("modalReglasEmpaque");
const tbodyReglasEmpaqueModal = document.getElementById("tbodyReglasEmpaqueModal");
const btnAgregarFilaRegla = document.getElementById("btnAgregarFilaRegla");
const btnGuardarModalReglas = document.getElementById("btnGuardarModalReglas");
const btnCancelarModalReglas = document.getElementById("btnCancelarModalReglas");
const btnCerrarModalReglas = document.getElementById("btnCerrarModalReglas");

let tiposProductoCache = [];
let reglasCache = [];

function toastSuccess(message) {
  if (typeof Swal === "undefined" || !Swal || typeof Swal.mixin !== "function") {
    return;
  }

  Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
  }).fire({
    icon: "success",
    title: message || "Operación exitosa",
  });
}

function normalizeTipoNombre(value) {
  return String(value || "").trim().toLowerCase();
}

function getTipoIdByNombre(nombreRaw) {
  const nombre = normalizeTipoNombre(nombreRaw);
  if (!nombre) return null;

  const match = tiposProductoCache.find((t) => {
    const n = normalizeTipoNombre(t?.nombre);
    return n && n === nombre;
  });

  const parsed = Number.parseInt(match?.tipoProductoId, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getTipoNombreById(tipoId) {
  const parsed = Number.parseInt(tipoId, 10);
  if (!Number.isInteger(parsed)) return String(tipoId);
  const match = tiposProductoCache.find(
    (t) => Number.parseInt(t?.tipoProductoId, 10) === parsed
  );
  return match?.nombre ? String(match.nombre) : String(tipoId);
}

function renderReglas() {
  const list = Array.isArray(reglasCache) ? reglasCache : [];

  if (!list.length) {
    tablaReglasEmpaqueBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">No hay reglas de empaque configuradas</td>
      </tr>
    `;
    return;
  }

  tablaReglasEmpaqueBody.innerHTML = list
    .slice()
    .sort((a, b) => {
      const aTipo = Number.parseInt(a?.tipoproductoid, 10) || 0;
      const bTipo = Number.parseInt(b?.tipoproductoid, 10) || 0;
      const aCant = Number.parseInt(a?.cantidadempaque, 10) || 0;
      const bCant = Number.parseInt(b?.cantidadempaque, 10) || 0;
      if (aTipo !== bTipo) return aTipo - bTipo;
      return aCant - bCant;
    })
    .map((r) => {
      const tipoId = Number.parseInt(r?.tipoproductoid, 10);
      const nombreTipo = getTipoNombreById(tipoId);
      const nombreRegla = String(r?.nombre_regla ?? "").trim();
      const piezas = Number.parseInt(r?.cantidadempaque, 10);

      return `
        <tr>
          <td style="font-weight:600; color: var(--razo-gray-dark);">${nombreTipo}</td>
          <td style="font-weight:600; color: var(--razo-gray-dark);">${nombreRegla || "-"}</td>
          <td>${Number.isInteger(piezas) ? piezas : "-"}</td>
          <td>
            <button type="button" class="btn btn-light btn-sm" id="btnAbrirModalReglasInline" onclick="window.__openReglasEmpaqueModal && window.__openReglasEmpaqueModal()" title="Editar">
              ✏️
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function ensureJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return {};
  }
}

function renderPendientes(solicitudes) {
  if (!alertasPendientes) return;

  const list = Array.isArray(solicitudes) ? solicitudes : [];
  if (!list.length) {
    alertasPendientes.innerHTML = "";
    return;
  }

  const itemsHtml = list
    .slice(0, 5)
    .map((s) => {
      const datos = ensureJsonObject(s?.datosNuevos);
      const tipoIdRaw = datos.tipoProductoId ?? datos.tipoproductoid;
      const cantidadRaw = datos.cantidadEmpaque ?? datos.cantidadempaque;
      const tipoNombre = tipoIdRaw ? getTipoNombreById(tipoIdRaw) : "Tipo";
      const cantidad = Number.parseInt(cantidadRaw, 10);
      const cantidadTxt = Number.isInteger(cantidad) && cantidad > 0 ? `${cantidad}` : "—";
      return `<div style="display:flex; gap:0.5rem; align-items:flex-start; margin-top: 0.35rem;">
        <div style="font-weight:900;">⏳</div>
        <div style="flex:1;">
          <div style="font-weight:800; color:#9A3412;">Cambio pendiente de aprobación</div>
          <div style="color:#92400E; font-weight:700;">${tipoNombre} → ${cantidadTxt} pzas</div>
        </div>
      </div>`;
    })
    .join("");

  const extra = list.length > 5
    ? `<div style="margin-top:0.5rem; color:#92400E; font-weight:700;">Mostrando 5 de ${list.length}. Revisa la Bitácora para ver todas.</div>`
    : "";

  alertasPendientes.innerHTML = `
    <div style="border: 1px solid #FCD34D; background: #FFFBEB; border-radius: 12px; padding: 1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 0.75rem;">
        <div>
          <div style="font-weight: 900; color:#92400E;">Solicitudes Pendientes</div>
          <div style="margin-top:0.25rem; color:#92400E;">Tus cambios aún no se reflejan en la tabla porque requieren aprobación.</div>
        </div>
        <div style="font-weight: 900; color:#92400E;">${list.length}</div>
      </div>
      ${itemsHtml}
      ${extra}
    </div>
  `;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function loadProveedor() {
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/admin/proveedores/${proveedorId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok || !data.success) {
    throw new Error(data.message || "No se pudo cargar el proveedor");
  }

  const proveedor = data?.data?.proveedor || {};
  proveedorNombre.textContent = proveedor.nombreempresa || "-";
  proveedorIdEl.textContent = proveedor.proveedorid ?? proveedorId;
  proveedorRfc.textContent = proveedor.rfc || "-";
  proveedorEmail.textContent = proveedor.email || "-";
}

async function loadTiposProducto() {
  const { response, data } = await fetchJson(`${API_BASE_URL}/public/tipos-producto`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok || !data.success) {
    throw new Error(data.message || "No se pudieron cargar los tipos de producto");
  }

  const tipos = Array.isArray(data?.data?.tipos) ? data.data.tipos : [];
  tiposProductoCache = tipos;
}

async function loadReglasEmpaque() {
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/admin/proveedores/${proveedorId}/reglas-multiples`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok || !data.success) {
    throw new Error(data.message || "No se pudieron cargar las reglas");
  }

  reglasCache = Array.isArray(data?.data?.reglas) ? data.data.reglas : [];

  renderReglas();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildTipoDatalistHtml() {
  const opts = [];
  for (const t of tiposProductoCache) {
    const nombre = String(t?.nombre ?? "").trim();
    if (!nombre) continue;
    opts.push(`<option value="${escapeHtml(nombre)}">${escapeHtml(nombre)}</option>`);
  }
  return opts.join("");
}

function createTrashButtonHtml() {
  return `
    <button type="button" class="btn btn-light btn-sm" data-action="delete" title="Eliminar" style="display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; padding:0; border-radius:10px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M9 3h6m-7 4h8m-9 0l1 14h8l1-14M10 11v7m4-7v7" stroke="#F97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;
}

function addReglaRowToModal(regla) {
  const reglaid = Number.parseInt(regla?.reglaid, 10);
  const reglaidSafe = Number.isInteger(reglaid) && reglaid > 0 ? reglaid : "";
  const tipoId = Number.parseInt(regla?.tipoproductoid, 10);
  const tipoNombre = Number.isInteger(tipoId) && tipoId > 0 ? getTipoNombreById(tipoId) : "";
  const nombre = String(regla?.nombre_regla ?? "").trim();
  const cantidad = Number.parseInt(regla?.cantidadempaque, 10);
  const cantidadSafe = Number.isInteger(cantidad) && cantidad > 0 ? cantidad : "";

  const tr = document.createElement("tr");
  tr.dataset.reglaid = String(reglaidSafe);

  tr.innerHTML = `
    <td>
      <div style="position: relative;">
        <input 
          class="form-input" 
          data-field="tipo_nombre" 
          type="text" 
          list="tiposProductoList" 
          placeholder="Selecciona o escribe nuevo tipo" 
          value="${escapeHtml(tipoNombre)}" 
          style="height: 42px;" 
          autocomplete="off"
        />
        <datalist id="tiposProductoList">
          ${buildTipoDatalistHtml()}
        </datalist>
        <small style="display: block; margin-top: 0.25rem; color: #6b7280; font-size: 0.75rem;">
          💡 Puedes seleccionar uno existente o escribir uno nuevo
        </small>
      </div>
    </td>
    <td>
      <input class="form-input" data-field="nombre_regla" type="text" maxlength="100" placeholder="Ej: Caja Master" value="${escapeHtml(nombre)}" style="height: 42px;" />
    </td>
    <td>
      <input class="form-input" data-field="cantidadempaque" type="number" min="1" step="1" placeholder="Piezas" value="${escapeHtml(String(cantidadSafe))}" style="height: 42px;" />
    </td>
    <td style="text-align:center;">
      ${createTrashButtonHtml()}
    </td>
  `;

  tbodyReglasEmpaqueModal.appendChild(tr);
}

function renderModalReglas() {
  if (!tbodyReglasEmpaqueModal) return;

  tbodyReglasEmpaqueModal.innerHTML = "";
  const list = Array.isArray(reglasCache) ? reglasCache : [];

  if (!list.length) {
    const empty = document.createElement("tr");
    empty.innerHTML = `<td colspan="4" class="empty-state">No hay reglas. Agrega una nueva.</td>`;
    tbodyReglasEmpaqueModal.appendChild(empty);
    return;
  }

  for (const r of list) {
    addReglaRowToModal(r);
  }
}

function openModalReglas() {
  if (!modalReglasEmpaque) return;
  modalReglasEmpaque.classList.add("show");
  modalReglasEmpaque.setAttribute("aria-hidden", "false");
}

function closeModalReglas() {
  if (!modalReglasEmpaque) return;
  modalReglasEmpaque.classList.remove("show");
  modalReglasEmpaque.setAttribute("aria-hidden", "true");
}

function collectReglasFromModal() {
  const reglas = [];
  if (!tbodyReglasEmpaqueModal) return reglas;

  const rows = Array.from(tbodyReglasEmpaqueModal.querySelectorAll("tr"));
  for (const tr of rows) {
    const tipoEl = tr.querySelector('[data-field="tipo_nombre"]');
    const nombreEl = tr.querySelector('[data-field="nombre_regla"]');
    const cantEl = tr.querySelector('[data-field="cantidadempaque"]');

    if (!tipoEl || !nombreEl || !cantEl) continue;

    const reglaidRaw = String(tr.dataset.reglaid || "").trim();
    const reglaid = Number.parseInt(reglaidRaw, 10);

    const tipoNombre = String(tipoEl.value || "").trim();
    const nombre = String(nombreEl.value || "").trim();
    const cantidad = Number.parseInt(String(cantEl.value || "").trim(), 10);

    reglas.push({
      reglaid: Number.isInteger(reglaid) && reglaid > 0 ? reglaid : null,
      tipo_nombre: tipoNombre,
      nombre_regla: nombre,
      cantidadempaque: Number.isInteger(cantidad) && cantidad > 0 ? cantidad : null,
    });
  }

  return reglas;
}

function validateReglas(reglas) {
  const list = Array.isArray(reglas) ? reglas : [];
  if (!list.length) {
    return { ok: false, message: "Agrega al menos una regla antes de guardar." };
  }

  for (let i = 0; i < list.length; i += 1) {
    const r = list[i] || {};
    const idx = i + 1;
    const tipoNombre = String(r.tipo_nombre || "").trim();
    
    if (!tipoNombre) {
      return { ok: false, message: `Fila ${idx}: ingresa un tipo de producto.` };
    }
    
    if (!isNaN(tipoNombre) && !isNaN(parseFloat(tipoNombre))) {
      return { ok: false, message: `Fila ${idx}: el tipo de producto no puede ser un número. Usa un nombre descriptivo (ej: "Caja Grande", "Peluche").` };
    }
    
    if (!String(r.nombre_regla || "").trim()) {
      return { ok: false, message: `Fila ${idx}: el nombre de la regla es requerido.` };
    }
    if (!Number.isInteger(r.cantidadempaque) || r.cantidadempaque <= 0) {
      return { ok: false, message: `Fila ${idx}: la cantidad de piezas debe ser mayor a 0.` };
    }
  }

  return { ok: true };
}

async function saveRules() {
  const reglas = collectReglasFromModal();
  const validation = validateReglas(reglas);
  if (!validation.ok) {
    await Swal.fire({
      icon: "warning",
      title: "Validación",
      text: validation.message || "Revisa los datos",
      confirmButtonColor: "#F97316",
    });
    return;
  }

  if (!btnGuardarModalReglas) return;

  btnGuardarModalReglas.disabled = true;
  try {
    const payload = {
      proveedorId: Number.parseInt(proveedorId, 10),
      reglas,
    };

    const { response, data } = await fetchJson(`${API_BASE_URL}/admin/save-reglas-empaque`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !data.success) {
      throw new Error(data.message || "No se pudieron guardar las reglas");
    }

    reglasCache = Array.isArray(data?.data?.reglas) ? data.data.reglas : reglasCache;
    renderReglas();
    closeModalReglas();
    toastSuccess("Reglas guardadas correctamente");
  } catch (error) {
    console.error("Error guardando reglas múltiples:", error);
    await Swal.fire({
      icon: "error",
      title: "Error",
      text: error.message || "Error al guardar las reglas",
      confirmButtonColor: "#F97316",
    });
  } finally {
    btnGuardarModalReglas.disabled = false;
  }
}

window.__openReglasEmpaqueModal = function () {
  try {
    renderModalReglas();
    openModalReglas();
  } catch (e) {
    console.error("Error abriendo modal:", e);
  }
};

async function init() {
  if (!proveedorId) {
    await Swal.fire({
      icon: "error",
      title: "Proveedor inválido",
      text: "Falta el parámetro ?id= en la URL.",
      confirmButtonColor: "#F97316",
    });
    window.location.href = "/admin-proveedores.html";
    return;
  }

  try {
    loadingData.style.display = "flex";
    proveedorData.style.display = "none";

    await loadProveedor();
    await loadTiposProducto();
    await loadReglasEmpaque();

    if (alertasPendientes) {
      alertasPendientes.innerHTML = "";
      alertasPendientes.style.display = "none";
    }

    proveedorData.style.display = "block";
  } catch (error) {
    console.error("Error inicializando detalle de proveedor:", error);

    await Swal.fire({
      icon: "error",
      title: "Error",
      text: error.message || "No se pudo cargar el detalle del proveedor.",
      confirmButtonColor: "#F97316",
    });

    window.location.href = "/admin-proveedores.html";
  } finally {
    loadingData.style.display = "none";
  }
}

if (btnAbrirModalReglas) {
  btnAbrirModalReglas.addEventListener("click", async () => {
    try {
      await loadReglasEmpaque();
    } catch (e) {
      // ignore
    }
    renderModalReglas();
    openModalReglas();
  });
}

if (btnCerrarModalReglas) btnCerrarModalReglas.addEventListener("click", closeModalReglas);
if (btnCancelarModalReglas) btnCancelarModalReglas.addEventListener("click", closeModalReglas);

if (modalReglasEmpaque) {
  modalReglasEmpaque.addEventListener("click", (e) => {
    if (e.target === modalReglasEmpaque) closeModalReglas();
  });
}

if (tbodyReglasEmpaqueModal) {
  tbodyReglasEmpaqueModal.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-action='delete']");
    if (!btn) return;
    const tr = btn.closest("tr");
    if (tr) tr.remove();
  });
}

if (btnAgregarFilaRegla) {
  btnAgregarFilaRegla.addEventListener("click", () => {
    if (!tbodyReglasEmpaqueModal) return;
    const hasEmptyState = tbodyReglasEmpaqueModal.querySelector(".empty-state");
    if (hasEmptyState) tbodyReglasEmpaqueModal.innerHTML = "";
    addReglaRowToModal({ reglaid: null, tipoproductoid: null, nombre_regla: "", cantidadempaque: null });
  });
}

if (btnGuardarModalReglas) btnGuardarModalReglas.addEventListener("click", saveRules);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalReglasEmpaque && modalReglasEmpaque.classList.contains("show")) {
    closeModalReglas();
  }
});

init();
