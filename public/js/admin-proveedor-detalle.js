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

const selectTipoRegla = document.getElementById("selectTipoRegla");
const inputCantidadRegla = document.getElementById("inputCantidadRegla");
const btnGuardarRegla = document.getElementById("btnGuardarRegla");
const tablaReglasEmpaqueBody = document.getElementById("tablaReglasEmpaqueBody");
const alertasPendientes = document.getElementById("alertasPendientes");

let tiposProductoCache = [];
let reglasCache = {};
let tipoReglaChoices = null;
let tipoProductoIdsDisponibles = new Set();

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
  const entries = reglasCache && typeof reglasCache === "object"
    ? Object.entries(reglasCache)
    : [];

  if (!entries.length) {
    tablaReglasEmpaqueBody.innerHTML = `
      <tr>
        <td colspan="3" class="empty-state">No hay reglas de empaque configuradas</td>
      </tr>
    `;
    return;
  }

  tablaReglasEmpaqueBody.innerHTML = entries
    .sort((a, b) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10))
    .map(([tipoId, cantidad]) => {
      const nombreTipo = getTipoNombreById(tipoId);
      const cantidadInt = Number.parseInt(cantidad, 10);
      return `
        <tr>
          <td style="font-weight:600; color: var(--razo-gray-dark);">${nombreTipo}</td>
          <td>${Number.isInteger(cantidadInt) ? cantidadInt : "-"}</td>
          <td>
            <button
              type="button"
              class="btn btn-light btn-sm"
              onclick="window.__editarReglaEmpaque && window.__editarReglaEmpaque('${String(
                tipoId
              )}', '${String(cantidad)}')"
              title="Editar"
            >
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

  if (!selectTipoRegla) {
    return;
  }

  tipoProductoIdsDisponibles = new Set();

  const previousValue = selectTipoRegla.value;
  selectTipoRegla.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = "Escribe o selecciona un tipo";
  selectTipoRegla.appendChild(placeholderOption);

  tiposProductoCache.forEach((tipo) => {
    const id = tipo?.tipoProductoId;
    const nombre = tipo?.nombre;
    const parsed = Number.parseInt(id, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return;
    const label = (nombre || "").toString().trim();
    if (!label) return;

    tipoProductoIdsDisponibles.add(parsed);

    const option = document.createElement("option");
    option.value = String(parsed);
    option.textContent = label;
    selectTipoRegla.appendChild(option);
  });

  if (tipoReglaChoices) {
    try {
      tipoReglaChoices.destroy();
    } catch (e) {
      // ignore
    }
    tipoReglaChoices = null;
  }

  if (typeof Choices !== "undefined") {
    tipoReglaChoices = new Choices(selectTipoRegla, {
      searchEnabled: true,
      searchResultLimit: 100,
      shouldSort: false,
      allowHTML: false,
      removeItemButton: true,
      duplicateItemsAllowed: false,
      addItems: true,
      addItemText: (value) => `Agregar "${value}"`,
    });
  }

  if (previousValue) {
    try {
      if (tipoReglaChoices) {
        tipoReglaChoices.setChoiceByValue(String(previousValue));
      } else {
        selectTipoRegla.value = String(previousValue);
      }
    } catch (e) {
      // ignore
    }
  }
}

async function loadReglasEmpaque() {
  const { response, data } = await fetchJson(
    `${API_BASE_URL}/admin/proveedores/${proveedorId}/reglas`,
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

  reglasCache = data?.data?.reglas && typeof data.data.reglas === "object"
    ? data.data.reglas
    : {};

  renderReglas();
}

async function guardarReglaEmpaque() {
  const rawValue = selectTipoRegla ? selectTipoRegla.value : "";
  const rawTxt = String(rawValue || "").trim();

  const parsed = Number.parseInt(rawTxt, 10);
  const tipoIdResolved =
    Number.isInteger(parsed) && parsed > 0 && tipoProductoIdsDisponibles.has(parsed)
      ? parsed
      : null;

  const tipoNombreNormalized = tipoIdResolved
    ? ""
    : rawTxt;
  const cantidad = Number.parseInt(inputCantidadRegla.value, 10);

  if ((!tipoIdResolved || tipoIdResolved <= 0) && !tipoNombreNormalized) {
    await Swal.fire({
      icon: "warning",
      title: "Falta tipo de producto",
      text: "Selecciona o escribe un tipo de producto.",
      confirmButtonColor: "#F97316",
    });
    return;
  }

  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    await Swal.fire({
      icon: "warning",
      title: "Cantidad inválida",
      text: "Ingresa una cantidad mayor a 0.",
      confirmButtonColor: "#F97316",
    });
    return;
  }

  const tipoNombre = tipoIdResolved
    ? getTipoNombreById(tipoIdResolved)
    : tipoNombreNormalized;

  const result = await Swal.fire({
    icon: "question",
    title: "Guardar regla",
    text: `¿Guardar ${tipoNombre} = ${cantidad} piezas por paquete?`,
    showCancelButton: true,
    confirmButtonText: "Sí, guardar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#F97316",
    cancelButtonColor: "#6b7280",
  });

  if (!result.isConfirmed) return;

  btnGuardarRegla.disabled = true;

  try {
    const payload = {
      cantidadEmpaque: cantidad,
    };

    if (tipoIdResolved) {
      payload.TipoProductoID = tipoIdResolved;
    } else {
      payload.TipoProducto = tipoNombreNormalized;
    }

    const { response, data } = await fetchJson(
      `${API_BASE_URL}/admin/proveedores/${proveedorId}/reglas`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok || !data.success) {
      throw new Error(data.message || "No se pudo guardar la regla");
    }

    await loadReglasEmpaque();
    toastSuccess("Regla actualizada correctamente");

    inputCantidadRegla.value = "";
    if (selectTipoRegla) {
      if (tipoReglaChoices) {
        try {
          tipoReglaChoices.removeActiveItems();
        } catch (e) {
          selectTipoRegla.value = "";
        }
      } else {
        selectTipoRegla.value = "";
      }
    }
  } catch (error) {
    console.error("Error guardando regla:", error);
    await Swal.fire({
      icon: "error",
      title: "Error",
      text: error.message || "Error al guardar la regla",
      confirmButtonColor: "#F97316",
    });
  } finally {
    btnGuardarRegla.disabled = false;
  }
}

window.__editarReglaEmpaque = function (tipoId, cantidad) {
  try {
    const value = String(tipoId);
    if (selectTipoRegla) {
      if (tipoReglaChoices) {
        try {
          tipoReglaChoices.setChoiceByValue(value);
        } catch (e) {
          selectTipoRegla.value = value;
        }
      } else {
        selectTipoRegla.value = value;
      }
    }
    if (inputCantidadRegla) inputCantidadRegla.value = String(cantidad);

    if (inputCantidadRegla && typeof inputCantidadRegla.focus === "function") {
      inputCantidadRegla.focus();
    }

    const hint = getTipoNombreById(tipoId);
    if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
      Swal.fire({
        icon: "info",
        title: "Editar regla",
        text: `Edita la cantidad y presiona "Agregar" para guardar (${hint}).`,
        confirmButtonColor: "#F97316",
      });
    }
  } catch (e) {
    console.error("Error preparando edición:", e);
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

if (btnGuardarRegla) {
  btnGuardarRegla.addEventListener("click", () => {
    guardarReglaEmpaque();
  });
}

init();
