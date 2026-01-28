const adminToken = localStorage.getItem("razoconnect_admin_token");
if (!adminToken) {
  window.location.href = "/login.html";
}

const userNameEl = document.getElementById("userName");
const userRoleEl = document.getElementById("userRole");
const userAvatarEl = document.getElementById("userAvatar");
const logoutBtn = document.getElementById("logoutBtn");

function safeSetText(el, value) {
  if (!el) return;
  el.textContent = value;
}

const fechaDesdeInput = document.getElementById("fechaDesde");
const fechaHastaInput = document.getElementById("fechaHasta");
const generarBtn = document.getElementById("generarReporteBtn");
const estadoSelect = document.getElementById("filtro-estado-select");
const loadingEl = document.getElementById("loadingReporte");
const tableEl = document.getElementById("reportesTable");
const tableBodyEl = document.getElementById("reportesTableBody");
const emptyEl = document.getElementById("emptyReporte");
const resultadosBadge = document.getElementById("resultadosBadge");

const agingResultadosBadge = document.getElementById("agingResultadosBadge");
const agingTable = document.getElementById("agingTable");
const agingTableBody = document.getElementById("agingTableBody");
const loadingAging = document.getElementById("loadingAging");
const emptyAging = document.getElementById("emptyAging");

const totalVentaEl = document.getElementById("totalVenta");
const totalCostoEl = document.getElementById("totalCosto");
const totalGananciaBrutaEl = document.getElementById("totalGananciaBruta");
const totalComisionesEl = document.getElementById("totalComisiones");
const totalCostoEnvioEl = document.getElementById("totalCostoEnvio");
const totalGananciaNetaEl = document.getElementById("totalGananciaNeta");

const API_REPORT_URL = `${API_BASE_URL}/admin/reportes/rentabilidad`;
const API_AGING_URL = `${API_BASE_URL}/admin/reportes/aging-backorders`;

function formatCurrency(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(value || 0);
}

async function loadAdminProfile() {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/verify`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Token inválido");
    }

    const data = await response.json();
    if (data.success && data.data && data.data.admin) {
      const admin = data.data.admin;
      safeSetText(userNameEl, admin.nombre || "Administrador");
      safeSetText(
        userRoleEl,
        admin.rol === "superadmin" ? "Super Admin" : "Admin"
      );

      // Iniciales para avatar
      const nombre = (admin.nombre || "A").toString();
      const words = nombre.split(" ").filter(Boolean);
      const initials =
        words.length >= 2
          ? `${words[0].charAt(0)}${words[1].charAt(0)}`
          : nombre.substring(0, 2);
      safeSetText(userAvatarEl, initials.toUpperCase());
    }
  } catch (error) {
    console.error("Error cargando perfil de admin:", error);
    localStorage.removeItem("razoconnect_admin_token");
    localStorage.removeItem("razoconnect_admin");
    window.location.href = "/login.html";
  }
}

function buildQueryParams() {
  const params = new URLSearchParams();
  const desde = fechaDesdeInput.value;
  const hasta = fechaHastaInput.value;
  const estadoID = estadoSelect ? estadoSelect.value : "";

  if (desde) params.append("desde", desde);
  if (hasta) params.append("hasta", hasta);
  if (estadoID) params.append("estadoID", estadoID);

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function renderTable(data) {
  tableBodyEl.innerHTML = "";

  if (!data.length) {
    tableEl.style.display = "none";
    emptyEl.style.display = "flex";
    resultadosBadge.textContent = "0 resultados";
    totalVentaEl.textContent = "$0.00";
    totalCostoEl.textContent = "$0.00";
    totalGananciaBrutaEl.textContent = "$0.00";
    totalComisionesEl.textContent = "$0.00";
    totalCostoEnvioEl.textContent = "$0.00";
    totalGananciaNetaEl.textContent = "$0.00";
    return;
  }

  emptyEl.style.display = "none";
  tableEl.style.display = "table";
  resultadosBadge.textContent = `${data.length} resultados`;

  let totalVenta = 0;
  let totalCosto = 0;
  let totalGananciaBruta = 0;
  let totalComisiones = 0;
  let totalCostoEnvio = 0;
  let totalGananciaNeta = 0;

  // Track unique orders to avoid counting commission and shipping multiple times
  const ordersProcessed = new Map();

  data.forEach((item) => {
    totalVenta += item.ventaBruta || 0;
    totalCosto += item.costoTotal || 0;
    totalGananciaBruta += item.gananciaBruta || 0;
    
    // Only count commission and shipping once per order
    if (!ordersProcessed.has(item.pedidoId)) {
      totalComisiones += item.comision || 0;
      totalCostoEnvio += item.costoEnvio || 0;
      ordersProcessed.set(item.pedidoId, {
        comision: item.comision || 0,
        costoEnvio: item.costoEnvio || 0
      });
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${
        item.fechaPedido
          ? new Date(item.fechaPedido).toLocaleDateString("es-MX")
          : "-"
      }</td>
      <td>${item.pedidoId}</td>
      <td>${item.nombreProducto}</td>
      <td>${item.presentacion || "Presentación estándar"}</td>
      <td>${item.sku}</td>
      <td>${formatCurrency(item.ventaBruta)}</td>
      <td>${formatCurrency(item.costoTotal)}</td>
      <td>${formatCurrency(item.gananciaBruta)}</td>
      <td>${formatCurrency(item.comision)}</td>
      <td>${formatCurrency(item.costoEnvio)}</td>
      <td>${formatCurrency(item.gananciaNeta)}</td>
    `;
    tableBodyEl.appendChild(tr);
  });

  // Calculate net profit: Gross Profit - Commissions - Shipping
  totalGananciaNeta = totalGananciaBruta - totalComisiones - totalCostoEnvio;

  totalVentaEl.textContent = formatCurrency(totalVenta);
  totalCostoEl.textContent = formatCurrency(totalCosto);
  totalGananciaBrutaEl.textContent = formatCurrency(totalGananciaBruta);
  totalComisionesEl.textContent = formatCurrency(totalComisiones);
  totalCostoEnvioEl.textContent = formatCurrency(totalCostoEnvio);
  totalGananciaNetaEl.textContent = formatCurrency(totalGananciaNeta);
}

async function fetchReporte() {
  const query = buildQueryParams();
  const url = `${API_REPORT_URL}${query}`;

  loadingEl.style.display = "flex";
  tableEl.style.display = "none";
  emptyEl.style.display = "none";

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("No se pudo obtener el reporte");
    }

    const data = await response.json();
    if (data.success) {
      renderTable(data.data || []);
    } else {
      renderTable([]);
    }
  } catch (error) {
    console.error("Error al cargar el reporte de rentabilidad:", error);
    renderTable([]);
    if (typeof showToast === "function") {
      showToast("No se pudo generar el reporte de rentabilidad", "error");
    }
  } finally {
    loadingEl.style.display = "none";
  }
}

async function loadAgingBackorders() {
  loadingAging.style.display = "flex";
  agingTable.style.display = "none";
  emptyAging.style.display = "none";

  try {
    const response = await fetch(API_AGING_URL, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("No se pudo obtener el aging de backorders");
    }

    const data = await response.json();
    const registros = Array.isArray(data.data) ? data.data : [];

    registros.sort((a, b) => (b.diasPendiente || 0) - (a.diasPendiente || 0));

    agingTableBody.innerHTML = "";

    if (!registros.length) {
      agingResultadosBadge.textContent = "0 pedidos";
      emptyAging.style.display = "flex";
      return;
    }

    registros.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>#${item.pedidoId}</td>
        <td>${item.cliente}</td>
        <td>${
          item.fechaPedido
            ? new Date(item.fechaPedido).toLocaleDateString("es-MX")
            : "-"
        }</td>
        <td>${item.estatusSurtido}</td>
        <td><strong>${item.diasPendiente ?? 0}</strong> días</td>
      `;
      agingTableBody.appendChild(tr);
    });

    agingResultadosBadge.textContent = `${registros.length} pedidos`;
    agingTable.style.display = "table";
  } catch (error) {
    console.error("Error al cargar aging de backorders:", error);
    emptyAging.style.display = "flex";
    agingResultadosBadge.textContent = "0 pedidos";
    if (typeof showToast === "function") {
      showToast("No se pudo cargar el reporte de backorders", "error");
    }
  } finally {
    loadingAging.style.display = "none";
  }
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("razoconnect_admin_token");
    localStorage.removeItem("razoconnect_admin");
    window.location.href = "/login.html";
  });
}

generarBtn.addEventListener("click", () => {
  fetchReporte();
});

async function loadEstadosFiltro() {
  if (!estadoSelect) return;

  try {
    const response = await fetch(`${API_BASE_URL}/public/estados`);
    if (!response.ok) {
      throw new Error("No se pudieron obtener los estados");
    }

    const data = await response.json();
    const estados = data?.data?.estados || [];

    estadoSelect.innerHTML = '<option value="">Todos los estados</option>';
    estados.forEach((estado) => {
      const option = document.createElement("option");
      option.value = estado.estadoId;
      option.textContent = estado.nombre;
      estadoSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error al cargar estados para filtro:", error);
    if (typeof showToast === "function") {
      showToast("No se pudieron cargar los estados", "error");
    }
  }
}

// Cargar datos iniciales
loadAdminProfile();
fetchReporte();
loadAgingBackorders();
loadEstadosFiltro();
