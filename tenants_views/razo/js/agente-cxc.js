(function () {
  "use strict";

  const state = {
    clientes: [],
    filtrados: [],
    filters: {
      search: "",
    },
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    bindEvents();
    loadCxCData();
  });

  function cacheElements() {
    elements.kpiTotal = document.getElementById("kpiTotalPorCobrar");
    elements.kpiClientes = document.getElementById("kpiClientesConDeuda");
    elements.kpiPedidos = document.getElementById("kpiPedidosPendientes");
    elements.resumenResultados = document.getElementById("resumenResultados");
    elements.searchInput = document.getElementById("buscadorClientes");
    elements.tabla = document.getElementById("tablaCxC");
    elements.tablaBody = document.getElementById("tablaCxCTbody");
    elements.estadoCarga = document.getElementById("estadoCarga");
    elements.estadoVacio = document.getElementById("estadoVacio");
    elements.btnRecargar = document.getElementById("btnRecargar");
    elements.ultimoRefresh = document.getElementById("ultimoRefresh");
  }

  function bindEvents() {
    elements.searchInput?.addEventListener("input", (event) => {
      state.filters.search = (event.target.value || "").toLowerCase();
      applyFilters();
    });

    elements.btnRecargar?.addEventListener("click", () => {
      loadCxCData();
    });
  }

  async function loadCxCData() {
    try {
      const token = localStorage.getItem("razoconnect_admin_token");
      if (!token) {
        console.warn("No se encontró token de autenticación. Redirigiendo a login...");
        window.location.href = "/login.html";
        return;
      }

      showLoading();

      const response = await fetch("/api/agente/cxc", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // CRÍTICO: NO limpiar tokens ni redirigir - api.js maneja esto con protección de agente
          console.warn("⚠️ Error 401 detectado - manteniendo sesión de agente");
          throw new Error("Error de autenticación - intenta recargar la página");
        }
        
        if (response.status === 403) {
          console.error("Acceso denegado a CxC");
          Swal.fire({
            icon: "error",
            title: "Acceso Denegado",
            text: "No tienes permisos para acceder a esta sección. Contacta al administrador.",
            confirmButtonColor: "#F97316",
          });
          return;
        }
        
        throw new Error(`Error al cargar datos: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "Error al cargar los datos");
      }

      state.clientes = result.data.clientes || [];
      state.filtrados = [...state.clientes];

      updateKPIs(result.data.resumen);
      renderTable();
      updateLastRefresh();
    } catch (error) {
      console.error("Error al cargar CxC:", error);
      Swal.fire({
        icon: "error",
        title: "Error al cargar datos",
        text: error.message || "No se pudieron cargar las cuentas por cobrar",
        confirmButtonColor: "#F97316",
      });
      showEmpty();
    }
  }

  function updateKPIs(resumen) {
    const totalCartera = resumen?.total_cartera || 0;
    const clientesConDeuda = state.clientes.length;
    const totalPedidos = state.clientes.reduce(
      (sum, cliente) => sum + (cliente.pedidosPendientes || 0),
      0
    );

    if (elements.kpiTotal) {
      elements.kpiTotal.textContent = formatCurrency(totalCartera);
    }
    if (elements.kpiClientes) {
      elements.kpiClientes.textContent = clientesConDeuda;
    }
    if (elements.kpiPedidos) {
      elements.kpiPedidos.textContent = totalPedidos;
    }
  }

  function applyFilters() {
    const searchTerm = state.filters.search.toLowerCase();

    state.filtrados = state.clientes.filter((cliente) => {
      const nombreCompleto = `${cliente.nombre} ${cliente.apellido}`.toLowerCase();
      const telefono = (cliente.telefono || "").toLowerCase();

      return nombreCompleto.includes(searchTerm) || telefono.includes(searchTerm);
    });

    renderTable();
  }

  function renderTable() {
    if (!elements.tablaBody) return;

    if (state.filtrados.length === 0) {
      showEmpty();
      return;
    }

    showTable();

    elements.tablaBody.innerHTML = state.filtrados
      .map((cliente) => {
        const nombreCompleto = `${cliente.nombre} ${cliente.apellido}`;
        const telefono = cliente.telefono || "N/A";
        const deudaTotal = formatCurrency(cliente.deudaTotal || 0);
        const pedidosPendientes = cliente.pedidosPendientes || 0;

        return `
          <tr>
            <td>
              <div class="fw-semibold">${escapeHtml(nombreCompleto)}</div>
              <div class="text-muted" style="font-size: 0.8125rem;">ID: ${cliente.clienteId}</div>
            </td>
            <td>${escapeHtml(telefono)}</td>
            <td style="text-align: right;">
              <span class="fw-semibold" style="color: #dc2626;">${deudaTotal}</span>
            </td>
            <td style="text-align: center;">
              <span class="badge ${pedidosPendientes > 0 ? 'bg-warning' : 'bg-secondary'}">${pedidosPendientes}</span>
            </td>
            <td style="text-align: center;">
              <button 
                class="btn btn-sm btn-light"
                onclick="window.verDetalleCliente(${cliente.clienteId})"
                title="Ver detalle del cliente"
              >
                <i class="bi bi-eye"></i> Ver Detalle
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    updateResultsSummary();
  }

  function updateResultsSummary() {
    if (!elements.resumenResultados) return;

    const count = state.filtrados.length;
    const text = count === 1 ? "1 CLIENTE" : `${count} CLIENTES`;
    elements.resumenResultados.textContent = text;
  }

  function showLoading() {
    if (elements.estadoCarga) elements.estadoCarga.style.display = "flex";
    if (elements.estadoVacio) elements.estadoVacio.style.display = "none";
    if (elements.tabla) elements.tabla.style.display = "none";
  }

  function showTable() {
    if (elements.estadoCarga) elements.estadoCarga.style.display = "none";
    if (elements.estadoVacio) elements.estadoVacio.style.display = "none";
    if (elements.tabla) elements.tabla.style.display = "table";
  }

  function showEmpty() {
    if (elements.estadoCarga) elements.estadoCarga.style.display = "none";
    if (elements.estadoVacio) elements.estadoVacio.style.display = "flex";
    if (elements.tabla) elements.tabla.style.display = "none";
    if (elements.resumenResultados) {
      elements.resumenResultados.textContent = "0 CLIENTES";
    }
  }

  function updateLastRefresh() {
    if (!elements.ultimoRefresh) return;
    const now = new Date();
    const timeString = now.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });
    elements.ultimoRefresh.textContent = timeString;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  window.verDetalleCliente = function (clienteId) {
    Swal.fire({
      icon: "info",
      title: "Funcionalidad en desarrollo",
      text: `Ver detalle del cliente ID: ${clienteId}`,
      confirmButtonColor: "#F97316",
    });
  };
})();
