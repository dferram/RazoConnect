(function () {
  "use strict";

  const state = {
    cartera: [],
    filtrada: [],
    filters: {
      search: "",
      estado: "",
    },
    currentCreditoId: null,
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 1,
    totalRecords: 0
  };

  const elements = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    ensureFontAwesome();
    bindEvents();
    loadCartera();
    cargarMetricas();
  });

  function cacheElements() {
    elements.kpiTotal = document.getElementById("kpiTotalPorCobrar");
    elements.kpiClientes = document.getElementById("kpiClientesConDeuda");
    elements.kpiVencidos = document.getElementById("kpiCarteraVencida");
    elements.resumenResultados = document.getElementById("resumenResultados");
    elements.searchInput = document.getElementById("buscadorClientes");
    elements.filtroEstado = document.getElementById("filtroRiesgo");
    elements.tabla = document.getElementById("tablaCxC");
    elements.tablaBody = document.getElementById("tablaCxCTbody");
    elements.estadoCarga = document.getElementById("estadoCarga");
    elements.estadoVacio = document.getElementById("estadoVacio");
    elements.btnRegistrarAbono = document.getElementById("btnRegistrarAbono");
    elements.btnConfirmarAbono = document.getElementById("btnConfirmarAbono");
    elements.btnCancelarAbono = document.getElementById("btnCancelarAbono");
    elements.btnCerrarModal = document.getElementById("btnCerrarModal");
    elements.btnRecargar = document.getElementById("btnRecargar");
    elements.btnExportar = document.getElementById("btnExportar");
    elements.exportContainer = document.getElementById("exportContainer");
    elements.modal = document.getElementById("abonoModal");
    elements.abonoCliente = document.getElementById("abonoCliente");
    elements.abonoSaldo = document.getElementById("abonoSaldoActual");
    elements.abonoMonto = document.getElementById("abonoMonto");
    elements.abonoReferencia = document.getElementById("abonoReferencia");
    elements.abonoNotas = document.getElementById("abonoNotas");
    elements.ultimoRefresh = document.getElementById("ultimoRefresh");
    elements.abonoGuardarTxt = document.getElementById("abonoGuardarTxt");
    elements.abonoGuardarSpinner = document.getElementById("abonoGuardarSpinner");
  }

  function ensureFontAwesome() {
    const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => link.getAttribute("href") || "")
      .some((href) => href.includes("font-awesome"));

    if (!exists) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
      document.head.appendChild(link);
    }
  }

  function bindEvents() {
    elements.searchInput?.addEventListener("input", (event) => {
      state.filters.search = (event.target.value || "").toLowerCase();
      applyFilters();
    });

    elements.filtroEstado?.addEventListener("change", (event) => {
      state.filters.estado = event.target.value;
      applyFilters();
    });

    elements.btnRegistrarAbono?.addEventListener("click", () => {
      if (!state.filtrada.length) {
        Swal.fire({
          icon: "info",
          title: "Sin clientes disponibles",
          text: "No hay cartera activa para registrar abonos.",
          confirmButtonColor: "#F97316",
        });
        return;
      }
      openAbonoModal(state.filtrada[0].creditoId);
    });

    elements.btnRecargar?.addEventListener("click", () => {
      loadCartera(true);
    });

    elements.btnExportar?.addEventListener("click", async () => {
      try {
        Swal.fire({
          title: "Generando Reporte...",
          text: "Estamos generando el reporte con el estado actual de la cartera.",
          allowOutsideClick: false,
          didOpen: () => { Swal.showLoading() }
        });

        // Obtener el token JWT del localStorage
        const token = localStorage.getItem('razoconnect_admin_token');
        if (!token) {
          Swal.fire('Error', 'No estás autenticado. Por favor, inicia sesión nuevamente.', 'error');
          return;
        }

        const response = await fetch('/api/admin/cxc/exportar', { 
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.status === 404) {
          Swal.fire('Sin Datos', 'No hay clientes con saldo pendiente para exportar.', 'info');
          return;
        }

        if (response.status === 401) {
          Swal.fire('Error', 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.', 'error');
          return;
        }

        if (!response.ok) throw new Error('Error al generar reporte');

        // Descarga del archivo
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CxC_RazoConnect_${new Date().toISOString().slice(0,10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        // Éxito y recarga
        Swal.fire({
          icon: 'success',
          title: 'Reporte Descargado',
          text: 'El reporte refleja el estado actual de la cartera de cobranza.',
          confirmButtonColor: '#F97316'
        }).then(() => {
          cargarMetricas(); // Recargar métricas
        });

      } catch (error) {
        console.error(error);
        Swal.fire('Error', 'No se pudo generar el reporte.', 'error');
      }
    });

    elements.tablaBody?.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("[data-action]");
      if (!actionBtn) return;

      const { action, creditoId } = actionBtn.dataset;
      if (action === "abono") {
        openAbonoModal(Number.parseInt(creditoId, 10));
      }
    });

    elements.btnConfirmarAbono?.addEventListener("click", handleAbonoSubmit);
    elements.btnCancelarAbono?.addEventListener("click", closeAbonoModal);
    elements.btnCerrarModal?.addEventListener("click", closeAbonoModal);
    elements.modal?.addEventListener("click", (event) => {
      if (event.target === elements.modal) {
        closeAbonoModal();
      }
    });
  }

  async function loadCartera(isManualRefresh = false, page = state.currentPage) {
    toggleLoading(true);
    try {
      if (isManualRefresh) {
        showButtonLoading(elements.btnRecargar, true);
      }

      const response = await API.apiCall(`/admin/cxc-summary?page=${page}&limit=${state.itemsPerPage}`, {
        method: "GET",
      });

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
      actualizarTimestamp();
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

  function toggleLoading(isLoading) {
    if (elements.estadoCarga) {
      elements.estadoCarga.style.display = isLoading ? "flex" : "none";
    }
    if (elements.tabla) {
      elements.tabla.style.display = isLoading ? "none" : "table";
    }
  }

  function showButtonLoading(button, isLoading) {
    if (!button) return;
    button.disabled = isLoading;
    button.classList.toggle("is-loading", isLoading);
    const icon = button.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-spin", isLoading);
    }
  }

  function updateKpis({ totalCobrar = 0, totalVencido = 0, conteoClientes = 0 } = {}) {
    animateNumber(elements.kpiTotal, totalCobrar, { currency: true });
    animateNumber(elements.kpiVencidos, totalVencido, { currency: true });
    animateNumber(elements.kpiClientes, conteoClientes, { currency: false });
  }

  function animateNumber(element, target, { currency }) {
    if (!element) return;
    const duration = 500;
    const start = performance.now();
    const initialValue = parseFloat(element.dataset.value || 0) || 0;
    const targetValue = Number(target) || 0;

    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const value = initialValue + (targetValue - initialValue) * progress;
      element.dataset.value = value.toFixed(2);
      element.textContent = currency ? formatCurrency(value) : formatNumber(value);
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
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
    if (!elements.tabla || !elements.tablaBody) return;

    renderPagination();

    if (!state.filtrada.length) {
      elements.tabla.style.display = "none";
      elements.estadoVacio.style.display = "flex";
      elements.resumenResultados.textContent = "0 CLIENTES";
      elements.tablaBody.innerHTML = "";
      // Ocultar contenedor de exportar si no hay datos
      if (elements.exportContainer) {
        elements.exportContainer.style.display = "none";
      }
      return;
    }

    elements.tabla.style.display = "table";
    elements.estadoVacio.style.display = "none";
    elements.resumenResultados.textContent = `${state.filtrada.length} CLIENTES`;

    // Mostrar contenedor de exportar si hay clientes con deuda
    if (elements.exportContainer && state.cartera.length > 0) {
      elements.exportContainer.style.display = "block";
    }

    elements.tablaBody.innerHTML = state.filtrada
      .map((cliente) => generarFila(cliente))
      .join("");
  }

  function generarFila(cliente) {
    const estadoEsVencido = cliente.estado === "VENCIDO";
    const estadoClass = estadoEsVencido ? "text-danger" : "text-success";
    const badgeClass = estadoEsVencido ? "badge bg-danger-subtle text-danger" : "badge bg-success-subtle text-success";
    const ultimoMovimiento = cliente.ultimoMovimiento
      ? formatDate(cliente.ultimoMovimiento)
      : "Sin registro";

    return `
      <tr>
        <td>
          <div class="fw-semibold">${escapeHtml(cliente.clienteNombre || "Cliente sin nombre")}</div>
          <small class="text-muted">${escapeHtml(cliente.email || "Sin correo")}</small>
        </td>
        <td class="text-end">${formatCurrency(cliente.limiteCredito)}</td>
        <td class="text-end fw-semibold">${formatCurrency(cliente.saldoDeudor)}</td>
        <td class="text-end">${formatCurrency(cliente.disponible)}</td>
        <td>
          <div>${ultimoMovimiento}</div>
          <small class="text-muted">${cliente.ultimoMovimientoDescripcion ? escapeHtml(cliente.ultimoMovimientoDescripcion) : "Sin descripción"}</small>
        </td>
        <td>
          <span class="${estadoClass} fw-semibold">${cliente.estadoEtiqueta}</span>
          ${cliente.diasVencido > 0 ? `<div><small class="text-muted">${cliente.diasVencido} días vencido</small></div>` : ""}
        </td>
        <td class="text-center">
          <button class="btn btn-light btn-sm" data-action="abono" data-credito="${cliente.creditoId}">
            <i class="fa-solid fa-cash-register me-1"></i>
            <span>Abonar</span>
          </button>
        </td>
      </tr>
    `;
  }

  function openAbonoModal(creditoId) {
    const cliente = state.cartera.find((item) => item.creditoId === creditoId);
    if (!cliente) return;

    state.currentCreditoId = creditoId;
    elements.abonoCliente.textContent = cliente.clienteNombre || "Cliente";
    elements.abonoSaldo.textContent = formatCurrency(cliente.saldoDeudor);
    elements.abonoMonto.value = "";
    elements.abonoReferencia.value = "";
    elements.abonoNotas.value = "";
    elements.modal.style.display = "flex";
    document.body.classList.add("modal-open");
  }

  function closeAbonoModal() {
    state.currentCreditoId = null;
    elements.modal.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  async function handleAbonoSubmit() {
    if (!state.currentCreditoId) {
      Swal.fire({
        icon: "warning",
        title: "Selecciona un cliente",
        text: "Elige un registro antes de registrar un abono.",
        confirmButtonColor: "#F97316",
      });
      return;
    }

    const monto = Number.parseFloat(elements.abonoMonto.value);
    if (!Number.isFinite(monto) || monto <= 0) {
      Swal.fire({
        icon: "warning",
        title: "Monto inválido",
        text: "Introduce un monto mayor a 0.",
        confirmButtonColor: "#F97316",
      });
      return;
    }

    const referencia = elements.abonoReferencia.value.trim();
    const notas = elements.abonoNotas.value.trim();
    const concepto = referencia || notas || "Abono manual";

    disableAbonoButton(true);

    try {
      Swal.fire({
        title: "Registrando abono",
        text: "Por favor espera...",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const response = await API.apiCall("/admin/registrar-abono", {
        method: "POST",
        body: JSON.stringify({
          creditoId: state.currentCreditoId,
          monto,
          concepto,
        }),
      });

      if (!response.ok || !response.data?.success) {
        throw new Error(response.data?.message || "No se pudo registrar el abono");
      }

      Swal.fire({
        icon: "success",
        title: "Abono registrado",
        text: "El saldo se actualizó correctamente.",
        confirmButtonColor: "#22c55e",
      });

      closeAbonoModal();
      await loadCartera();
    } catch (error) {
      console.error("Error registrando abono:", error);
      Swal.fire({
        icon: "error",
        title: "No se pudo completar",
        text: error.message || "Inténtalo de nuevo",
        confirmButtonColor: "#F97316",
      });
    } finally {
      disableAbonoButton(false);
    }
  }

  function disableAbonoButton(isLoading) {
    if (!elements.btnConfirmarAbono) return;
    elements.btnConfirmarAbono.disabled = isLoading;
    elements.abonoGuardarTxt.style.display = isLoading ? "none" : "inline-flex";
    elements.abonoGuardarSpinner.style.display = isLoading ? "inline-flex" : "none";
  }

  function calcularDiasVencido(cliente) {
    if (cliente.estado !== "VENCIDO") return 0;
    const referencia = cliente.ultimoMovimiento || cliente.ultimaActualizacion;
    if (!referencia) return 0;
    const fecha = new Date(referencia);
    if (Number.isNaN(fecha.getTime())) return 0;
    const diffMs = Date.now() - fecha.getTime();
    return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0);
  }

  function actualizarTimestamp() {
    if (!elements.ultimoRefresh) return;
    const formatter = new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    elements.ultimoRefresh.textContent = formatter.format(new Date());
  }

  function formatCurrency(value) {
    const number = Number.parseFloat(value) || 0;
    if (window.Utils?.formatMXN) {
      return window.Utils.formatMXN(number);
    }
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    }).format(number);
  }

    async function cargarMetricas() {
    try {
      const response = await fetch('/api/admin/cxc/metricas');
      if (!response.ok) throw new Error('Error al cargar métricas');
      
      const { data } = await response.json();
      
      // Actualizar KPIs
      const kpis = {
        '#kpi-pendiente': data.por_cobrar,
        '#kpi-gestion': data.en_gestion,
        '#kpi-morosos': data.clientes_mora
      };
      
      Object.entries(kpis).forEach(([selector, value]) => {
        const element = document.querySelector(selector);
        if (!element) return;
        
        if (selector === '#kpi-morosos') {
          element.textContent = formatNumber(value);
        } else {
          element.textContent = formatCurrency(value);
        }
      });
      
    } catch (error) {
      console.error('Error cargando métricas:', error);
    }
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value || 0);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Sin registro";
    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function escapeHtml(value) {
    return (value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderPagination() {
    const paginationContainer = document.getElementById('paginationContainer');
    const pageNumbers = document.getElementById('pageNumbers');
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');
    const pageStart = document.getElementById('pageStart');
    const pageEnd = document.getElementById('pageEnd');
    const totalRecords = document.getElementById('totalRecords');

    if (!paginationContainer || !pageNumbers) return;

    // Mostrar/ocultar paginación
    if (state.totalPages <= 1) {
      paginationContainer.style.display = 'none';
      return;
    }

    paginationContainer.style.display = 'block';

    // Actualizar información de registros
    const start = (state.currentPage - 1) * state.itemsPerPage + 1;
    const end = Math.min(state.currentPage * state.itemsPerPage, state.totalRecords);
    
    if (pageStart) pageStart.textContent = start;
    if (pageEnd) pageEnd.textContent = end;
    if (totalRecords) totalRecords.textContent = state.totalRecords;

    // Actualizar botones Anterior/Siguiente
    if (btnPrevPage) {
      btnPrevPage.disabled = state.currentPage === 1;
      btnPrevPage.onclick = () => state.currentPage > 1 && loadCartera(false, state.currentPage - 1);
    }

    if (btnNextPage) {
      btnNextPage.disabled = state.currentPage === state.totalPages;
      btnNextPage.onclick = () => state.currentPage < state.totalPages && loadCartera(false, state.currentPage + 1);
    }

    // Generar números de página
    let html = '';
    const maxPagesToShow = 5;
    let startPage = Math.max(1, state.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(state.totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      const isActive = i === state.currentPage;
      html += `
        <button
          class="btn ${isActive ? 'btn-primary' : 'btn-secondary'}"
          style="
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            min-width: 40px;
            ${isActive ? 'pointer-events: none;' : ''}
          "
          onclick="loadCartera(false, ${i})"
        >
          ${i}
        </button>
      `;
    }

    pageNumbers.innerHTML = html;
  }
})();
