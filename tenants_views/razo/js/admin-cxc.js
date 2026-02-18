(function() {
  'use strict';

  const state = {
    cartera: [],
    filtrada: [],
    filters: {
      search: "",
      estado: ""
    },
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 1,
    totalRecords: 0
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", async () => {
    cacheElements();
    bindEvents();
    loadCartera();
    cargarMetricas();
    cargarClientesConCredito();
    setDefaultDates();
  });

  function cacheElements() {
    elements.kpiTotal = document.getElementById("kpiTotalPorCobrar");
    elements.kpiClientes = document.getElementById("kpiClientesConDeuda");
    elements.kpiVencidos = document.getElementById("kpiCarteraVencida");
    elements.resumenResultados = document.getElementById("resumenResultados");
    elements.searchInput = document.getElementById("buscadorClientes");
    elements.filtroEstado = document.getElementById("filtroRiesgo");
    elements.tabla = document.getElementById("tablaCxC");
    elements.tbody = document.getElementById("tablaCxCTbody");
    elements.estadoCarga = document.getElementById("estadoCarga");
    elements.estadoVacio = document.getElementById("estadoVacio");
    elements.paginacion = document.getElementById("paginacion");
    elements.paginacionInfo = document.getElementById("paginacionInfo");
    elements.btnPaginaAnterior = document.getElementById("btnPaginaAnterior");
    elements.btnPaginaSiguiente = document.getElementById("btnPaginaSiguiente");
    elements.btnRecargar = document.getElementById("btnRecargar");
    elements.btnExportar = document.getElementById("btnExportar");
    elements.filtroFechaDesde = document.getElementById("filtroFechaDesde");
    elements.filtroFechaHasta = document.getElementById("filtroFechaHasta");
    elements.filtroCliente = document.getElementById("filtroCliente");
    elements.filtroEstadoExport = document.getElementById("filtroEstadoExport");
  }

  function bindEvents() {
    elements.searchInput?.addEventListener("input", (e) => {
      state.filters.search = e.target.value.toLowerCase();
      applyFilters();
    });

    elements.filtroEstado?.addEventListener("change", (e) => {
      state.filters.estado = e.target.value;
      applyFilters();
    });

    elements.btnRecargar?.addEventListener("click", () => loadCartera(true));
    elements.btnExportar?.addEventListener("click", exportarExcel);

    elements.btnPaginaAnterior?.addEventListener("click", () => {
      if (state.currentPage > 1) {
        loadCartera(false, state.currentPage - 1);
      }
    });

    elements.btnPaginaSiguiente?.addEventListener("click", () => {
      if (state.currentPage < state.totalPages) {
        loadCartera(false, state.currentPage + 1);
      }
    });
  }

  async function loadCartera(isManualRefresh = false, page = state.currentPage) {
    toggleLoading(true);
    try {
      if (isManualRefresh) {
        showButtonLoading(elements.btnRecargar, true);
      }

      const url = `/admin/cxc/summary-aging?page=${page}&limit=${state.itemsPerPage}`;
      const response = await API.apiCall(url, { method: "GET" });

      if (!response.ok || !response.data?.success) {
        throw new Error(response.data?.message || "No fue posible obtener la cartera");
      }

      const payload = response.data.data || {};
      const cartera = Array.isArray(payload.cartera) ? payload.cartera : [];
      
      state.currentPage = payload.currentPage || 1;
      state.totalPages = payload.totalPages || 1;
      state.totalRecords = payload.totalRecords || cartera.length;

      state.cartera = cartera.map((cliente) => ({
        ...cliente,
        estadoEtiqueta: cliente.estado === "VENCIDO" ? "Vencido" : "Al corriente",
        diasVencido: calcularDiasVencido(cliente),
        nombreBusqueda: [cliente.clienteNombre, cliente.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      }));

      updateKpis(payload);
      applyFilters();
    } catch (error) {
      console.error("Error cargando cartera CxC:", error);
      Swal.fire({
        icon: "error",
        title: "No se pudo cargar la cartera",
        text: error.message || "Inténtalo más tarde",
        confirmButtonColor: "#F97316",
      });
    } finally {
      toggleLoading(false);
      showButtonLoading(elements.btnRecargar, false);
    }
  }

  function applyFilters() {
    const search = state.filters.search.trim();
    const estadoFiltro = state.filters.estado;

    state.filtrada = state.cartera.filter((item) => {
      const coincideBusqueda = !search || item.nombreBusqueda.includes(search);
      if (!coincideBusqueda) return false;

      if (!estadoFiltro) return true;
      if (estadoFiltro === "al-dia") {
        return item.estado !== "VENCIDO";
      }
      if (estadoFiltro === "vencido") {
        return item.estado === "VENCIDO";
      }
      if (estadoFiltro === "critico") {
        return item.estado === "VENCIDO" && item.diasVencido >= 15;
      }
      return true;
    });

    renderTabla();
  }

  function renderTabla() {
    if (!elements.tbody) return;

    if (state.filtrada.length === 0) {
      elements.tabla.style.display = "none";
      elements.estadoVacio.style.display = "block";
      elements.paginacion.style.display = "none";
      elements.resumenResultados.textContent = "0 CLIENTES";
      return;
    }

    elements.tabla.style.display = "table";
    elements.estadoVacio.style.display = "none";
    elements.paginacion.style.display = "flex";
    elements.resumenResultados.textContent = `${state.filtrada.length} CLIENTE${state.filtrada.length !== 1 ? 'S' : ''}`;

    elements.tbody.innerHTML = state.filtrada.map(cliente => {
      const estadoBadge = cliente.estado === "VENCIDO" 
        ? '<span class="cxc-badge cxc-badge-danger">Suspendido</span>'
        : '<span class="cxc-badge cxc-badge-success">Activo</span>';

      return `
        <tr>
          <td>
            <div style="font-weight: 600; color: #111827;">${cliente.clienteNombre || ''} ${cliente.apellido || ''}</div>
            <div style="font-size: 0.75rem; color: #9ca3af;">${cliente.email || 'Sin email'}</div>
          </td>
          <td class="text-right">${formatCurrency(cliente.limiteCredito)}</td>
          <td class="text-right" style="font-weight: 700; color: #dc2626;">${formatCurrency(cliente.saldoDeudor)}</td>
          <td class="text-right">${formatCurrency(cliente.alCorriente)}</td>
          <td class="text-right" style="background: #fef3c7;">${formatCurrency(cliente.vencido1a30)}</td>
          <td class="text-right" style="background: #fee2e2;">${formatCurrency(cliente.vencidoMas30)}</td>
          <td class="text-right" style="color: #10b981; font-weight: 600;">${formatCurrency(cliente.disponible)}</td>
          <td style="font-size: 0.75rem;">${formatFecha(cliente.ultimoMovimiento)}</td>
          <td>${estadoBadge}</td>
          <td class="text-center">
            <button class="btn btn-light btn-sm" onclick="window.verDetalleCliente(${cliente.clienteId})" title="Ver detalle">
              <i class="bi bi-eye"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    updatePaginacion();
  }

  function updatePaginacion() {
    if (!elements.paginacionInfo) return;

    const inicio = (state.currentPage - 1) * state.itemsPerPage + 1;
    const fin = Math.min(state.currentPage * state.itemsPerPage, state.totalRecords);
    
    elements.paginacionInfo.textContent = `Mostrando ${inicio}-${fin} de ${state.totalRecords} registros`;
    
    if (elements.btnPaginaAnterior) {
      elements.btnPaginaAnterior.disabled = state.currentPage === 1;
    }
    
    if (elements.btnPaginaSiguiente) {
      elements.btnPaginaSiguiente.disabled = state.currentPage >= state.totalPages;
    }
  }

  function updateKpis(payload) {
    if (elements.kpiTotal) {
      elements.kpiTotal.textContent = formatCurrency(payload.totalCobrar || 0);
    }
    if (elements.kpiClientes) {
      elements.kpiClientes.textContent = payload.conteoClientes || 0;
    }
    if (elements.kpiVencidos) {
      elements.kpiVencidos.textContent = formatCurrency(payload.totalVencido || 0);
    }
  }

  async function cargarMetricas() {
    try {
      const response = await API.apiCall("/admin/cxc/metricas", { method: "GET" });
      
      if (response.ok && response.data?.success) {
        const metricas = response.data.data;
        if (elements.kpiTotal) {
          elements.kpiTotal.textContent = formatCurrency(metricas.por_cobrar || 0);
        }
        if (elements.kpiClientes) {
          elements.kpiClientes.textContent = metricas.clientes_mora || 0;
        }
        if (elements.kpiVencidos) {
          elements.kpiVencidos.textContent = formatCurrency(metricas.en_gestion || 0);
        }
      }
    } catch (error) {
      console.error("Error cargando métricas:", error);
    }
  }

  async function cargarClientesConCredito() {
    try {
      const response = await API.apiCall("/admin/cxc/clientes-con-credito", { method: "GET" });

      if (response.ok && response.data?.success) {
        const clientes = response.data.data || [];
        renderClientesSelector(clientes);
      }
    } catch (error) {
      console.error("Error cargando clientes con crédito:", error);
    }
  }

  function renderClientesSelector(clientes) {
    const selector = elements.filtroCliente;
    if (!selector) return;

    selector.innerHTML = '<option value="">Todos los clientes</option>';

    clientes.forEach((cliente) => {
      const option = document.createElement("option");
      option.value = cliente.clienteid;
      const nombreCompleto = `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim();
      const saldo = formatCurrency(cliente.saldo_deudor || 0);
      option.textContent = `${nombreCompleto} (${saldo})`;
      selector.appendChild(option);
    });
  }

  function setDefaultDates() {
    if (!elements.filtroFechaDesde || !elements.filtroFechaHasta) return;

    const hoy = new Date();
    elements.filtroFechaHasta.value = hoy.toISOString().split('T')[0];

    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);
    elements.filtroFechaDesde.value = hace30Dias.toISOString().split('T')[0];
  }

  async function exportarExcel() {
    try {
      const fechaDesde = elements.filtroFechaDesde?.value;
      const fechaHasta = elements.filtroFechaHasta?.value;
      const clienteId = elements.filtroCliente?.value;
      const estado = elements.filtroEstadoExport?.value;

      if (!fechaDesde || !fechaHasta) {
        Swal.fire({
          icon: "warning",
          title: "Fechas requeridas",
          text: "Por favor selecciona el rango de fechas",
          confirmButtonColor: "#F97316"
        });
        return;
      }

      showButtonLoading(elements.btnExportar, true);

      let url = `/admin/cxc/exportar-lote?fechaDesde=${fechaDesde}&fechaHasta=${fechaHasta}`;
      if (clienteId) url += `&clienteId=${clienteId}`;
      if (estado) url += `&estado=${estado}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
        }
      });

      if (!response.ok) {
        throw new Error("Error al exportar");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `CXC_${fechaDesde}_${fechaHasta}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      Swal.fire({
        icon: "success",
        title: "Exportado",
        text: "El archivo se ha descargado correctamente",
        confirmButtonColor: "#F97316"
      });
    } catch (error) {
      console.error("Error exportando:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo exportar el archivo",
        confirmButtonColor: "#F97316"
      });
    } finally {
      showButtonLoading(elements.btnExportar, false);
    }
  }

  function calcularDiasVencido(cliente) {
    return parseInt(cliente.maxDiasVencido) || 0;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value || 0);
  }

  function formatFecha(fecha) {
    if (!fecha) return '—';
    return new Date(fecha).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function toggleLoading(show) {
    if (elements.estadoCarga) {
      elements.estadoCarga.style.display = show ? 'flex' : 'none';
    }
  }

  function showButtonLoading(button, show) {
    if (!button) return;
    button.disabled = show;
    const icon = button.querySelector('i');
    if (icon) {
      icon.className = show ? 'bi bi-arrow-repeat spinner-border spinner-border-sm' : 'bi bi-arrow-repeat';
    }
  }

  window.verDetalleCliente = function(clienteId) {
    window.location.href = `/admin-cliente-detalle.html?id=${clienteId}`;
  };

})();
