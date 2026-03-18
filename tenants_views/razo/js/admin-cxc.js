(function() {
  'use strict';

  const state = {
    cartera: [],
    filtrada: [],
    filters: {
      search: "",
      estado: "",
      admin: ""
    },
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 1,
    totalRecords: 0
  };

  const elements = {};
  let paginador = null;

  document.addEventListener("DOMContentLoaded", async () => {
    cacheElements();
    initPagination();
    bindEvents();
    await cargarAdministradores();
    loadCartera();
    cargarMetricas();
    cargarClientesConCredito();
    setDefaultDates();
  });

  function initPagination() {
    paginador = new PaginationComponent({
      containerId: 'paginationWrapper',
      registrosPorPagina: state.itemsPerPage,
      onPageChange: (pagina) => {
        state.currentPage = pagina;
        loadCartera(false, pagina);
      }
    });
  }

  function cacheElements() {
    elements.kpiTotal = document.getElementById("kpiTotalPorCobrar");
    elements.kpiClientes = document.getElementById("kpiClientesConDeuda");
    elements.kpiVencidos = document.getElementById("kpiCarteraVencida");
    elements.resumenResultados = document.getElementById("resumenResultados");
    elements.searchInput = document.getElementById("buscadorClientes");
    elements.filtroEstado = document.getElementById("filtroRiesgo");
    elements.filtroAdmin = document.getElementById("filtroAdmin");
    elements.tabla = document.getElementById("tablaCxC");
    elements.tbody = document.getElementById("tablaCxCTbody");
    elements.estadoCarga = document.getElementById("estadoCarga");
    elements.estadoVacio = document.getElementById("estadoVacio");
    elements.btnRecargar = document.getElementById("btnRecargar");
    elements.btnExportar = document.getElementById("btnExportar");
    elements.btnExportarPDF = document.getElementById("btnExportarPDF");
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

    elements.filtroAdmin?.addEventListener("change", (e) => {
      state.filters.admin = e.target.value;
      state.currentPage = 1;
      loadCartera();
    });

    elements.btnRecargar?.addEventListener("click", () => loadCartera(true));
    elements.btnExportar?.addEventListener("click", exportarExcel);
    elements.btnExportarPDF?.addEventListener("click", exportarPDF);
  }

  async function loadCartera(isManualRefresh = false, page = state.currentPage) {
    toggleLoading(true);
    try {
      if (isManualRefresh) {
        showButtonLoading(elements.btnRecargar, true);
      }

      let url = `/admin/cxc/summary-aging?page=${page}&limit=${state.itemsPerPage}`;
      
      if (state.filters.admin) {
        url += `&admin_id=${state.filters.admin}`;
      }
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
        estadoEtiqueta: cliente.estado === "SUSPENDIDO" ? "Suspendido" : "Activo",
        diasVencido: calcularDiasVencido(cliente),
        adminNombre: cliente.adminNombre || 'N/A',
        nombreBusqueda: [cliente.clienteNombre, cliente.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      }));

      updateKpis(payload);
      applyFilters();
      
      if (paginador) {
        paginador.render(state.totalRecords, state.currentPage);
      }
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
        return item.estado === "ACTIVO";
      }
      if (estadoFiltro === "vencido") {
        return item.estado === "SUSPENDIDO";
      }
      if (estadoFiltro === "critico") {
        return item.estado === "SUSPENDIDO" && item.diasVencido >= 15;
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
      elements.resumenResultados.textContent = "0 CLIENTES";
      return;
    }

    elements.tabla.style.display = "table";
    elements.estadoVacio.style.display = "none";
    const displayCount = state.filtrada.length;
    elements.resumenResultados.textContent = `${displayCount} CLIENTE${displayCount !== 1 ? 'S' : ''}`;

    elements.tbody.innerHTML = state.filtrada.map(cliente => {
      const estadoBadge = cliente.estado === "SUSPENDIDO" 
        ? '<span class="badge bg-danger">Suspendido</span>'
        : '<span class="badge bg-success">Activo</span>';

      return `
        <tr>
          <td>
            <div style="font-weight: 600; color: #111827; font-size: 0.875rem;">${cliente.clienteNombre || ''} ${cliente.apellido || ''}</div>
            <div style="font-size: 0.7rem; color: #9ca3af;">${cliente.email || 'Sin email'}</div>
          </td>
          <td class="text-right" style="font-weight: 700; color: #dc2626; font-size: 0.875rem;">${formatCurrency(cliente.saldoDeudor)}</td>
          <td class="text-right" style="font-size: 0.875rem;">${formatCurrency(cliente.alCorriente)}</td>
          <td class="text-right" style="background: #fef3c7; font-size: 0.875rem;">${formatCurrency(cliente.vencido1a30)}</td>
          <td class="text-right" style="background: #fee2e2; font-size: 0.875rem;">${formatCurrency(cliente.vencidoMas30)}</td>
          <td class="text-right" style="color: #10b981; font-weight: 600; font-size: 0.875rem;">${formatCurrency(cliente.disponible)}</td>
          <td>${estadoBadge}</td>
          <td class="text-center">
            <button class="btn btn-primary btn-sm" onclick="window.verDetalleCliente(${cliente.clienteId})" style="padding: 0.4rem 0.75rem; font-size: 0.8rem;">
              Ver detalle
            </button>
          </td>
        </tr>
      `;
    }).join('');
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

  async function cargarAdministradores() {
    try {
      const response = await API.apiCall("/admin/administradores", { method: "GET" });

      if (response.ok && response.data) {
        const admins = Array.isArray(response.data) ? response.data : (response.data.data || []);
        renderAdminSelector(admins);
      }
    } catch (error) {
      console.error("Error cargando administradores:", error);
    }
  }

  function renderAdminSelector(admins) {
    const selector = elements.filtroAdmin;
    if (!selector) return;

    selector.innerHTML = '<option value="">Todos los admins</option>';

    admins.forEach((admin) => {
      const option = document.createElement("option");
      option.value = admin.adminid;
      option.textContent = admin.nombre || `Admin ${admin.adminid}`;
      selector.appendChild(option);
    });
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

  async function exportarPDF() {
    try {
      const fechaDesde = elements.filtroFechaDesde?.value;
      const fechaHasta = elements.filtroFechaHasta?.value;
      const adminId = state.filters.admin;

      showButtonLoading(elements.btnExportarPDF, true);

      let url = `/admin/cxc/pdf?`;
      if (fechaDesde) url += `fechaInicio=${fechaDesde}&`;
      if (fechaHasta) url += `fechaFin=${fechaHasta}&`;
      if (adminId) url += `admin_id=${adminId}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
        }
      });

      if (!response.ok) {
        throw new Error("Error al generar PDF");
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `CXC_Reporte_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      Swal.fire({
        icon: "success",
        title: "PDF Generado",
        text: "El reporte PDF se ha descargado correctamente",
        confirmButtonColor: "#F97316"
      });
    } catch (error) {
      console.error("Error generando PDF:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo generar el PDF",
        confirmButtonColor: "#F97316"
      });
    } finally {
      showButtonLoading(elements.btnExportarPDF, false);
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
    window.location.href = `/admin-cliente-cxc.html?id=${clienteId}`;
  };

})();
