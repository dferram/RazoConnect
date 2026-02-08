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
    elements.tablaBody = document.getElementById("tablaCxCTbody");
    elements.estadoCarga = document.getElementById("estadoCarga");
    elements.estadoVacio = document.getElementById("estadoVacio");
    elements.btnRegistrarAbono = document.getElementById("btnRegistrarAbono");
    elements.btnConfirmarAbono = document.getElementById("btnConfirmarAbono");
    elements.btnCancelarAbono = document.getElementById("btnCancelarAbono");
    elements.btnCerrarModal = document.getElementById("btnCerrarModal");
    elements.btnRecargar = document.getElementById("btnRecargar");
    elements.btnExportar = document.getElementById("btn-exportar");
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
    elements.filtroFechaDesde = document.getElementById("filtro-fecha-desde");
    elements.filtroFechaHasta = document.getElementById("filtro-fecha-hasta");
    elements.filtroCliente = document.getElementById("filtro-cliente");
    elements.filtroEstadoExport = document.getElementById("filtro-estado-export");
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
        // Obtener valores de los filtros
        const fechaDesde = elements.filtroFechaDesde?.value || '';
        const fechaHasta = elements.filtroFechaHasta?.value || '';
        const clienteId = elements.filtroCliente?.value || '';
        const estado = elements.filtroEstadoExport?.value || '';

        Swal.fire({
          title: "Generando Reporte Detallado...",
          html: `
            <p>Estamos generando el reporte de movimientos con los filtros aplicados.</p>
            <div style="margin-top: 1rem; padding: 0.75rem; background: #f0f9ff; border-radius: 0.5rem; text-align: left;">
              <strong style="color: #0369a1;">Filtros aplicados:</strong><br>
              ${fechaDesde ? `<span style="font-size: 0.875rem;">• Desde: ${fechaDesde}</span><br>` : ''}
              ${fechaHasta ? `<span style="font-size: 0.875rem;">• Hasta: ${fechaHasta}</span><br>` : ''}
              ${clienteId ? `<span style="font-size: 0.875rem;">• Cliente específico</span><br>` : ''}
              ${estado ? `<span style="font-size: 0.875rem;">• Estado: ${estado}</span><br>` : ''}
              ${!fechaDesde && !fechaHasta && !clienteId && !estado ? '<span style="font-size: 0.875rem; color: #6b7280;">• Sin filtros (todos los movimientos)</span>' : ''}
            </div>
          `,
          allowOutsideClick: false,
          didOpen: () => { Swal.showLoading() }
        });

        const token = localStorage.getItem('razoconnect_admin_token');
        if (!token) {
          Swal.fire('Error', 'No estás autenticado. Por favor, inicia sesión nuevamente.', 'error');
          return;
        }

        // Construir URL con parámetros de filtro
        const params = new URLSearchParams();
        if (fechaDesde) params.append('fechaDesde', fechaDesde);
        if (fechaHasta) params.append('fechaHasta', fechaHasta);
        if (clienteId) params.append('clienteId', clienteId);
        if (estado) params.append('estado', estado);

        const response = await fetch(`/api/admin/cxc/exportar-detallado?${params.toString()}`, { 
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.status === 404) {
          Swal.fire({
            icon: 'info',
            title: 'Sin Datos',
            text: 'No se encontraron movimientos con los filtros aplicados.',
            confirmButtonColor: '#F97316'
          });
          return;
        }

        if (response.status === 401) {
          Swal.fire('Error', 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.', 'error');
          return;
        }

        if (!response.ok) throw new Error('Error al generar reporte');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Obtener nombre del archivo desde el header Content-Disposition
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `CxC_Detallado_${new Date().toISOString().slice(0,10)}.xlsx`;
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
          if (filenameMatch) filename = filenameMatch[1];
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        Swal.fire({
          icon: 'success',
          title: 'Reporte Descargado',
          html: `
            <p>El reporte detallado de movimientos ha sido generado exitosamente.</p>
            <p style="margin-top: 0.5rem; font-size: 0.875rem; color: #6b7280;">
              Incluye: Fecha, Cliente, Tipo (Cargo/Abono), Referencia, Monto y Saldo Acumulado.
            </p>
          `,
          confirmButtonColor: '#F97316'
        });

      } catch (error) {
        console.error(error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo generar el reporte. Por favor, intenta nuevamente.',
          confirmButtonColor: '#F97316'
        });
      }
    });

    elements.tablaBody?.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("[data-action]");
      if (!actionBtn) return;

      const { action, creditoId, clienteId, saldo } = actionBtn.dataset;
      if (action === "abono") {
        openAbonoModal(Number.parseInt(creditoId, 10));
      } else if (action === "ver-estado") {
        event.preventDefault();
        abrirEstadoCuenta(Number.parseInt(clienteId, 10));
      } else if (action === "pago-manual") {
        abrirModalPagoManual(Number.parseInt(creditoId, 10), Number.parseInt(clienteId, 10), parseFloat(saldo));
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

      const response = await API.apiCall(`/admin/cxc/summary-aging?page=${page}&limit=${state.itemsPerPage}`, {
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
    const estadoEsVencido = cliente.estado === "SUSPENDIDO";
    const estadoClass = estadoEsVencido ? "text-danger" : "text-success";
    const badgeClass = estadoEsVencido ? "badge bg-danger-subtle text-danger" : "badge bg-success-subtle text-success";
    const ultimoMovimiento = cliente.ultimoMovimiento
      ? formatDate(cliente.ultimoMovimiento)
      : "Sin registro";

    const alCorriente = parseFloat(cliente.alCorriente) || 0;
    const vencido1a30 = parseFloat(cliente.vencido1a30) || 0;
    const vencidoMas30 = parseFloat(cliente.vencidoMas30) || 0;
    const maxDiasVencido = parseInt(cliente.maxDiasVencido) || 0;

    return `
      <tr>
        <td>
          <a href="#" class="fw-semibold" style="color: #111827; text-decoration: none;" 
             data-action="ver-estado" data-cliente-id="${cliente.clienteId}" 
             onmouseover="this.style.color='#f97316'" onmouseout="this.style.color='#111827'">
            ${escapeHtml(cliente.clienteNombre || "Cliente sin nombre")} ${escapeHtml(cliente.apellido || "")}
          </a>
          <small class="text-muted d-block">${escapeHtml(cliente.email || "Sin correo")}</small>
        </td>
        <td class="text-end">${formatCurrency(cliente.limiteCredito)}</td>
        <td class="text-end fw-semibold">${formatCurrency(cliente.saldoDeudor)}</td>
        <td class="text-end" style="color: #10b981;">${formatCurrency(alCorriente)}</td>
        <td class="text-end" style="background: #fef3c7; color: #d97706; font-weight: 600;">${formatCurrency(vencido1a30)}</td>
        <td class="text-end" style="background: #fee2e2; color: #dc2626; font-weight: 700;">${formatCurrency(vencidoMas30)}</td>
        <td class="text-end">${formatCurrency(cliente.disponible)}</td>
        <td>
          <div>${ultimoMovimiento}</div>
          <small class="text-muted">${cliente.ultimoMovimientoDescripcion ? escapeHtml(cliente.ultimoMovimientoDescripcion) : "Sin descripción"}</small>
        </td>
        <td>
          <span class="${badgeClass}">${estadoEsVencido ? "Suspendido" : "Activo"}</span>
          ${maxDiasVencido > 0 ? `<div><small class="text-muted">${maxDiasVencido} días máx. vencido</small></div>` : ""}
        </td>
        <td class="text-center">
          <div style="display: flex; gap: 0.25rem; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-light btn-sm" data-action="ver-estado" data-cliente-id="${cliente.clienteId}" title="Ver estado de cuenta">
              <i class="bi bi-file-text"></i>
            </button>
            <button class="btn btn-success btn-sm" data-action="pago-manual" data-credito="${cliente.creditoId}" data-cliente-id="${cliente.clienteId}" data-saldo="${cliente.saldoDeudor}" title="Registrar pago">
              <i class="bi bi-cash-coin"></i>
            </button>
          </div>
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

  // ========================================
  // GESTIÓN DE PAGOS DE CLIENTES PENDIENTES (tabla pagos_clientes)
  // ========================================
  // IMPORTANTE: Esto es diferente de admin-validar-pagos.html
  // - admin-validar-pagos.html: Valida transferencias de PEDIDOS específicos (tabla: pedidos)
  // - admin-cxc.html: Valida pagos generales de CLIENTES para liquidar saldo (tabla: pagos_clientes)

  async function cargarPagosPendientes() {
    try {
      const response = await API.apiCall("/admin/pagos-clientes/pendientes", {
        method: "GET",
      });

      if (response.ok && response.data?.success) {
        const pagos = response.data.data || [];
        renderPagosPendientes(pagos);
      } else {
        console.error("Error cargando pagos de clientes pendientes:", response.data?.message);
        renderPagosPendientes([]);
      }
    } catch (error) {
      console.error("Error cargando pagos de clientes pendientes:", error);
      renderPagosPendientes([]);
    }
  }

  let pagosPendientesCache = [];

  function renderPagosPendientes(pagos) {
    const seccion = document.getElementById("seccionPagosValidar");
    const tbody = document.getElementById("tablaPagosPendientesTbody");
    const badge = document.getElementById("badgePagosPendientes");

    if (!seccion || !tbody || !badge) return;

    if (pagos.length === 0) {
      seccion.style.display = "none";
      return;
    }

    pagosPendientesCache = pagos;

    seccion.style.display = "";
    badge.textContent = `${pagos.length} PENDIENTE${pagos.length !== 1 ? 'S' : ''}`;

    const html = pagos.map((pago) => {
      const fecha = pago.fecha_pago
        ? new Date(pago.fecha_pago).toLocaleDateString("es-MX", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";

      const nombreCliente = `${pago.nombre || ''} ${pago.apellido || ''}`.trim() || "Sin nombre";
      const monto = formatCurrency(pago.monto);
      const referencia = pago.referencia_bancaria || "Sin referencia";

      return `
        <tr>
          <td style="white-space: nowrap;">${fecha}</td>
          <td>
            <div style="font-weight: 600; color: #111827;">${nombreCliente}</div>
            <div style="font-size: 0.8125rem; color: #9ca3af;">${pago.email || ''}</div>
          </td>
          <td style="text-align: right; font-weight: 600; color: #111827;">${monto}</td>
          <td style="font-size: 0.875rem; color: #6b7280;">${referencia}</td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
              <button
                class="btn btn-sm btn-success"
                onclick="aprobarPagoCliente(${pago.pago_id}, '${nombreCliente}', ${pago.monto})"
                title="Aprobar pago"
              >
                <i class="bi bi-check-circle"></i> Aprobar
              </button>
              <button
                class="btn btn-sm btn-danger"
                onclick="rechazarPagoCliente(${pago.pago_id}, '${nombreCliente}')"
                title="Rechazar pago"
              >
                <i class="bi bi-x-circle"></i> Rechazar
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tbody.innerHTML = html;
  }

  window.aprobarPagoCliente = async function(pagoId, nombreCliente, monto) {
    const result = await Swal.fire({
      icon: "question",
      title: "¿Aprobar este pago?",
      html: `
        <p>Cliente: <strong>${nombreCliente}</strong></p>
        <p>Monto: <strong>${formatCurrency(monto)}</strong></p>
        <p style="margin-top: 1rem; color: #6b7280; font-size: 0.9rem;">
          Esta acción actualizará el saldo del cliente y creará un movimiento de crédito tipo ABONO.
        </p>
      `,
      showCancelButton: true,
      confirmButtonText: "Sí, aprobar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#10b981",
      cancelButtonColor: "#6b7280",
    });

    if (!result.isConfirmed) return;

    try {
      const response = await API.apiCall(`/admin/pagos-clientes/${pagoId}/gestionar`, {
        method: "POST",
        body: JSON.stringify({
          accion: "aprobar",
        }),
      });

      if (response.ok && response.data?.success) {
        await Swal.fire({
          icon: "success",
          title: "Pago aprobado",
          text: `El saldo de ${nombreCliente} ha sido actualizado correctamente.`,
          confirmButtonColor: "#F97316",
        });

        cargarPagosPendientes();
        loadCartera(true);
        cargarMetricas();
      } else {
        throw new Error(response.data?.message || "Error al aprobar el pago");
      }
    } catch (error) {
      console.error("Error aprobando pago de cliente:", error);
      Swal.fire({
        icon: "error",
        title: "Error al aprobar",
        text: error.message || "No fue posible aprobar el pago. Intenta nuevamente.",
        confirmButtonColor: "#F97316",
      });
    }
  };

  window.rechazarPagoCliente = async function(pagoId, nombreCliente) {
    const result = await Swal.fire({
      icon: "warning",
      title: "¿Rechazar este pago?",
      html: `
        <p>Cliente: <strong>${nombreCliente}</strong></p>
        <p style="margin-top: 1rem; color: #6b7280; font-size: 0.9rem;">
          El pago será marcado como rechazado y no se aplicará ningún abono.
        </p>
      `,
      input: "textarea",
      inputLabel: "Motivo del rechazo (opcional)",
      inputPlaceholder: "Ej: Comprobante no válido, monto incorrecto...",
      showCancelButton: true,
      confirmButtonText: "Sí, rechazar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
    });

    if (!result.isConfirmed) return;

    try {
      const response = await API.apiCall(`/admin/pagos-clientes/${pagoId}/gestionar`, {
        method: "POST",
        body: JSON.stringify({
          accion: "rechazar",
          motivo: result.value || "Comprobante no válido",
        }),
      });

      if (response.ok && response.data?.success) {
        await Swal.fire({
          icon: "success",
          title: "Pago rechazado",
          text: "El pago ha sido marcado como rechazado.",
          confirmButtonColor: "#F97316",
        });

        cargarPagosPendientes();
      } else {
        throw new Error(response.data?.message || "Error al rechazar el pago");
      }
    } catch (error) {
      console.error("Error rechazando pago de cliente:", error);
      Swal.fire({
        icon: "error",
        title: "Error al rechazar",
        text: error.message || "No fue posible rechazar el pago. Intenta nuevamente.",
        confirmButtonColor: "#F97316",
      });
    }
  };

  // ========================================
  // HISTORIAL DE MOVIMIENTOS FINANCIEROS
  // ========================================

  async function cargarHistorialMovimientos() {
    const estadoCarga = document.getElementById("estadoCargaHistorial");
    const estadoVacio = document.getElementById("estadoVacioHistorial");
    const tabla = document.getElementById("tablaHistorial");
    const tbody = document.getElementById("tablaHistorialTbody");
    const badge = document.getElementById("badgeHistorialTotal");

    if (!estadoCarga || !estadoVacio || !tabla || !tbody || !badge) return;

    // Mostrar loading
    estadoCarga.style.display = "flex";
    estadoVacio.style.display = "none";
    tabla.style.display = "none";

    try {
      const response = await API.apiCall("/admin/cxc/historial-movimientos?limit=100", {
        method: "GET",
      });

      if (response.ok && response.data?.success) {
        const movimientos = response.data.data || [];
        renderHistorialMovimientos(movimientos);
      } else {
        console.error("Error cargando historial:", response.data?.message);
        estadoCarga.style.display = "none";
        estadoVacio.style.display = "flex";
      }
    } catch (error) {
      console.error("Error cargando historial:", error);
      estadoCarga.style.display = "none";
      estadoVacio.style.display = "flex";
    }
  }

  function renderHistorialMovimientos(movimientos) {
    const estadoCarga = document.getElementById("estadoCargaHistorial");
    const estadoVacio = document.getElementById("estadoVacioHistorial");
    const tabla = document.getElementById("tablaHistorial");
    const tbody = document.getElementById("tablaHistorialTbody");
    const badge = document.getElementById("badgeHistorialTotal");

    if (!tbody || !badge) return;

    estadoCarga.style.display = "none";

    if (movimientos.length === 0) {
      estadoVacio.style.display = "flex";
      tabla.style.display = "none";
      badge.textContent = "0 MOVIMIENTOS";
      return;
    }

    estadoVacio.style.display = "none";
    tabla.style.display = "";
    badge.textContent = `${movimientos.length} MOVIMIENTO${movimientos.length !== 1 ? 'S' : ''}`;

    const html = movimientos.map((mov) => {
      const fecha = mov.fecha_movimiento
        ? new Date(mov.fecha_movimiento).toLocaleString("es-MX", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—";

      const nombreCliente = `${mov.nombre || ''} ${mov.apellido || ''}`.trim() || "Sin nombre";
      const tipo = (mov.tipo_movimiento || '').toUpperCase();
      const esCargo = tipo === 'CARGO' || tipo === 'CREDITO' || tipo === 'COMPRA';
      const monto = Math.abs(parseFloat(mov.monto || 0));
      const referencia = mov.referencia_id || "—";
      const descripcion = mov.descripcion || "Sin descripción";
      const saldoDespues = parseFloat(mov.saldo_despues_movimiento || 0);

      return `
        <tr>
          <td style="white-space: nowrap; font-size: 0.875rem; color: #6b7280;">${fecha}</td>
          <td>
            <div style="font-weight: 600; color: #111827;">${nombreCliente}</div>
            <div style="font-size: 0.8125rem; color: #9ca3af;">${mov.email || ''}</div>
          </td>
          <td style="text-align: center;">
            <span class="badge ${esCargo ? 'bg-danger' : 'bg-success'}" style="font-size: 0.8125rem;">
              ${esCargo ? 'Cargo' : 'Abono'}
            </span>
          </td>
          <td style="text-align: right; font-weight: 700; color: ${esCargo ? '#dc2626' : '#16a34a'};">
            ${esCargo ? '+' : '-'}${formatCurrency(monto)}
          </td>
          <td style="font-size: 0.875rem; color: #6b7280;">${referencia}</td>
          <td style="font-size: 0.875rem; color: #6b7280; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${descripcion}">
            ${descripcion}
          </td>
          <td style="text-align: right; font-weight: 600; color: #111827;">
            ${formatCurrency(saldoDespues)}
          </td>
        </tr>
      `;
    }).join("");

    tbody.innerHTML = html;
  }

  // ========================================
  // FUNCIONES AUXILIARES PARA FILTROS
  // ========================================

  async function cargarClientesConCredito() {
    try {
      const response = await API.apiCall("/admin/cxc/clientes-con-credito", {
        method: "GET",
      });

      if (response.ok && response.data?.success) {
        const clientes = response.data.data || [];
        renderClientesSelector(clientes);
      } else {
        console.error("Error cargando clientes:", response.data?.message);
      }
    } catch (error) {
      console.error("Error cargando clientes con crédito:", error);
    }
  }

  function renderClientesSelector(clientes) {
    const selector = elements.filtroCliente;
    if (!selector) return;

    // Limpiar opciones existentes excepto "Todos"
    selector.innerHTML = '<option value="">Todos los clientes</option>';

    // Agregar clientes
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

    // Establecer fecha hasta como hoy
    const hoy = new Date();
    elements.filtroFechaHasta.value = hoy.toISOString().split('T')[0];

    // Establecer fecha desde como hace 30 días
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);
    elements.filtroFechaDesde.value = hace30Dias.toISOString().split('T')[0];
  }

  // ========================================
  // MODAL: ESTADO DE CUENTA (DRILL-DOWN)
  // ========================================

  async function abrirEstadoCuenta(clienteId) {
    const modal = document.getElementById("modalEstadoCuenta");
    if (!modal) return;

    modal.style.display = "flex";

    try {
      const response = await API.apiCall(`/admin/cxc/estado-cuenta/${clienteId}`, {
        method: "GET",
      });

      if (!response.ok || !response.data?.success) {
        throw new Error(response.data?.message || "Error al cargar estado de cuenta");
      }

      const { cliente, pedidos, abonos } = response.data.data;

      // Actualizar encabezado
      document.getElementById("estadoCuentaCliente").textContent = 
        `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim();
      document.getElementById("estadoCuentaSaldo").textContent = 
        formatCurrency(cliente.saldo_deudor);

      // Información del cliente
      document.getElementById("estadoCuentaInfoCliente").innerHTML = `
        <div style="margin-bottom: 0.5rem;"><strong>Email:</strong> ${cliente.email || 'N/A'}</div>
        <div style="margin-bottom: 0.5rem;"><strong>Teléfono:</strong> ${cliente.telefono || 'N/A'}</div>
        <div><strong>Estado:</strong> <span class="badge ${cliente.estado_credito === 'ACTIVO' ? 'bg-success' : 'bg-danger'}">${cliente.estado_credito}</span></div>
      `;

      // Resumen de crédito
      const disponible = parseFloat(cliente.limite_credito) - parseFloat(cliente.saldo_deudor);
      document.getElementById("estadoCuentaResumenCredito").innerHTML = `
        <div style="margin-bottom: 0.5rem;"><strong>Límite de Crédito:</strong> ${formatCurrency(cliente.limite_credito)}</div>
        <div style="margin-bottom: 0.5rem;"><strong>Saldo Deudor:</strong> ${formatCurrency(cliente.saldo_deudor)}</div>
        <div style="margin-bottom: 0.5rem;"><strong>Disponible:</strong> ${formatCurrency(disponible)}</div>
        <div><strong>Días de Gracia:</strong> ${cliente.dias_gracia || 0} días</div>
      `;

      // Renderizar pedidos pendientes
      renderPedidosPendientes(pedidos);

      // Renderizar últimos abonos
      renderUltimosAbonos(abonos);

    } catch (error) {
      console.error("Error cargando estado de cuenta:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo cargar el estado de cuenta",
        confirmButtonColor: "#F97316",
      });
      modal.style.display = "none";
    }
  }

  function renderPedidosPendientes(pedidos) {
    const tbody = document.getElementById("tablaPedidosPendientesTbody");
    if (!tbody) return;

    if (pedidos.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem; color: #9ca3af;">
            No hay pedidos pendientes
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = pedidos.map(pedido => {
      const fecha = pedido.fechapedido ? new Date(pedido.fechapedido).toLocaleDateString("es-MX") : "—";
      const vencimiento = pedido.fecha_vencimiento ? new Date(pedido.fecha_vencimiento).toLocaleDateString("es-MX") : "Sin vencimiento";
      const diasVencido = parseInt(pedido.dias_vencido) || 0;
      const categoria = pedido.categoria_aging || "—";
      
      let categoriaColor = "#6b7280";
      let categoriaBg = "#f9fafb";
      if (categoria.includes("1-30")) {
        categoriaColor = "#d97706";
        categoriaBg = "#fef3c7";
      } else if (categoria.includes("+30")) {
        categoriaColor = "#dc2626";
        categoriaBg = "#fee2e2";
      } else if (categoria.includes("corriente")) {
        categoriaColor = "#10b981";
        categoriaBg = "#d1fae5";
      }

      return `
        <tr>
          <td><strong>#${pedido.pedidoid}</strong></td>
          <td>${fecha}</td>
          <td style="text-align: right;">${formatCurrency(pedido.montototal)}</td>
          <td style="text-align: right; font-weight: 700; color: #dc2626;">${formatCurrency(pedido.saldo_pendiente)}</td>
          <td>${vencimiento}</td>
          <td style="text-align: center;">${diasVencido > 0 ? `<span style="color: #dc2626; font-weight: 600;">${diasVencido}</span>` : '0'}</td>
          <td>
            <span style="padding: 0.25rem 0.75rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 600; background: ${categoriaBg}; color: ${categoriaColor};">
              ${categoria}
            </span>
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderUltimosAbonos(abonos) {
    const tbody = document.getElementById("tablaUltimosAbonosTbody");
    if (!tbody) return;

    if (abonos.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem; color: #9ca3af;">
            No hay abonos registrados
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = abonos.map(abono => {
      const fecha = abono.fecha_movimiento ? new Date(abono.fecha_movimiento).toLocaleString("es-MX", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }) : "—";

      return `
        <tr>
          <td style="white-space: nowrap;">${fecha}</td>
          <td><span class="badge bg-success">${abono.tipo_movimiento}</span></td>
          <td style="text-align: right; font-weight: 700; color: #16a34a;">${formatCurrency(abono.monto)}</td>
          <td style="font-size: 0.875rem;">${abono.referencia_id || "—"}</td>
          <td style="font-size: 0.875rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${abono.descripcion || ''}">${abono.descripcion || "—"}</td>
          <td style="font-size: 0.875rem;">${abono.registrado_por || "Sistema"}</td>
          <td style="text-align: right; font-weight: 600;">${formatCurrency(abono.saldo_despues_movimiento)}</td>
        </tr>
      `;
    }).join("");
  }

  // Event listeners para cerrar modal Estado de Cuenta
  document.getElementById("btnCerrarModalEstadoCuenta")?.addEventListener("click", () => {
    document.getElementById("modalEstadoCuenta").style.display = "none";
  });

  document.getElementById("btnCerrarEstadoCuenta")?.addEventListener("click", () => {
    document.getElementById("modalEstadoCuenta").style.display = "none";
  });

  document.getElementById("modalEstadoCuenta")?.addEventListener("click", (e) => {
    if (e.target.id === "modalEstadoCuenta") {
      e.target.style.display = "none";
    }
  });

  // ========================================
  // MODAL: PAGO MANUAL
  // ========================================

  let currentPagoManualData = null;

  function abrirModalPagoManual(creditoId, clienteId, saldo) {
    const cliente = state.cartera.find((item) => item.clienteId === clienteId);
    if (!cliente) return;

    currentPagoManualData = { creditoId, clienteId, saldo };

    document.getElementById("pagoManualCliente").textContent = 
      `${cliente.clienteNombre || ''} ${cliente.apellido || ''}`.trim();
    document.getElementById("pagoManualSaldo").textContent = formatCurrency(saldo);

    // Limpiar formulario
    document.getElementById("pagoManualMonto").value = "";
    document.getElementById("pagoManualMetodo").value = "";
    document.getElementById("pagoManualReferencia").value = "";
    document.getElementById("pagoManualNotas").value = "";

    document.getElementById("modalPagoManual").style.display = "flex";
  }

  function cerrarModalPagoManual() {
    currentPagoManualData = null;
    document.getElementById("modalPagoManual").style.display = "none";
  }

  async function procesarPagoManual() {
    if (!currentPagoManualData) return;

    const monto = parseFloat(document.getElementById("pagoManualMonto").value);
    const metodoPago = document.getElementById("pagoManualMetodo").value;
    const referencia = document.getElementById("pagoManualReferencia").value.trim();
    const notas = document.getElementById("pagoManualNotas").value.trim();

    // Validaciones
    if (!monto || monto <= 0) {
      Swal.fire({
        icon: "warning",
        title: "Monto inválido",
        text: "Introduce un monto mayor a 0",
        confirmButtonColor: "#F97316",
      });
      return;
    }

    if (!metodoPago) {
      Swal.fire({
        icon: "warning",
        title: "Método de pago requerido",
        text: "Selecciona un método de pago",
        confirmButtonColor: "#F97316",
      });
      return;
    }

    if (monto > currentPagoManualData.saldo) {
      Swal.fire({
        icon: "warning",
        title: "Monto excede el saldo",
        text: `El monto ($${monto.toFixed(2)}) no puede ser mayor al saldo deudor ($${currentPagoManualData.saldo.toFixed(2)})`,
        confirmButtonColor: "#F97316",
      });
      return;
    }

    // Confirmar con el usuario
    const result = await Swal.fire({
      icon: "question",
      title: "¿Confirmar registro de pago?",
      html: `
        <div style="text-align: left; padding: 1rem; background: #f9fafb; border-radius: 0.5rem; margin-top: 1rem;">
          <p style="margin: 0.5rem 0;"><strong>Monto:</strong> ${formatCurrency(monto)}</p>
          <p style="margin: 0.5rem 0;"><strong>Método:</strong> ${metodoPago}</p>
          ${referencia ? `<p style="margin: 0.5rem 0;"><strong>Referencia:</strong> ${referencia}</p>` : ''}
          <p style="margin: 0.5rem 0; color: #dc2626; font-weight: 600;">Este pago se aplicará inmediatamente y no se puede revertir.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Sí, registrar pago",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#10b981",
      cancelButtonColor: "#6b7280",
    });

    if (!result.isConfirmed) return;

    // Deshabilitar botón y mostrar spinner
    const btnConfirmar = document.getElementById("btnConfirmarPagoManual");
    const txtGuardar = document.getElementById("pagoManualGuardarTxt");
    const spinner = document.getElementById("pagoManualGuardarSpinner");
    
    btnConfirmar.disabled = true;
    txtGuardar.style.display = "none";
    spinner.style.display = "inline-flex";

    try {
      const response = await API.apiCall("/admin/cxc/registrar-pago-manual", {
        method: "POST",
        body: JSON.stringify({
          creditoId: currentPagoManualData.creditoId,
          monto,
          metodoPago,
          referencia: referencia || null,
          notas: notas || null,
        }),
      });

      if (!response.ok || !response.data?.success) {
        throw new Error(response.data?.message || "Error al registrar el pago");
      }

      await Swal.fire({
        icon: "success",
        title: "Pago Registrado",
        html: `
          <p>El pago de <strong>${formatCurrency(monto)}</strong> ha sido registrado exitosamente.</p>
          <p style="margin-top: 0.5rem; font-size: 0.875rem; color: #6b7280;">
            Nuevo saldo: <strong>${formatCurrency(response.data.data.saldoNuevo)}</strong>
          </p>
        `,
        confirmButtonColor: "#F97316",
      });

      cerrarModalPagoManual();
      await loadCartera(true);
      cargarMetricas();

    } catch (error) {
      console.error("Error registrando pago manual:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo registrar el pago. Intenta nuevamente.",
        confirmButtonColor: "#F97316",
      });
    } finally {
      btnConfirmar.disabled = false;
      txtGuardar.style.display = "inline-flex";
      spinner.style.display = "none";
    }
  }

  // Event listeners para modal Pago Manual
  document.getElementById("btnCerrarModalPagoManual")?.addEventListener("click", cerrarModalPagoManual);
  document.getElementById("btnCancelarPagoManual")?.addEventListener("click", cerrarModalPagoManual);
  document.getElementById("btnConfirmarPagoManual")?.addEventListener("click", procesarPagoManual);

  document.getElementById("modalPagoManual")?.addEventListener("click", (e) => {
    if (e.target.id === "modalPagoManual") {
      cerrarModalPagoManual();
    }
  });

  // Cargar pagos pendientes e historial al iniciar
  document.addEventListener("DOMContentLoaded", () => {
    cargarPagosPendientes();
    cargarHistorialMovimientos();
  });
})();

  // ========================================
  // FUNCIONES AUXILIARES PARA FILTROS
  // ========================================

  async function cargarClientesConCredito() {
    try {
      const response = await API.apiCall("/admin/cxc/clientes-con-credito", {
        method: "GET",
      });

      if (response.ok && response.data?.success) {
        const clientes = response.data.data || [];
        renderClientesSelector(clientes);
      } else {
        console.error("Error cargando clientes:", response.data?.message);
      }
    } catch (error) {
      console.error("Error cargando clientes con crédito:", error);
    }
  }

  function renderClientesSelector(clientes) {
    const selector = elements.filtroCliente;
    if (!selector) return;

    // Limpiar opciones existentes excepto "Todos"
    selector.innerHTML = '<option value="">Todos los clientes</option>';

    // Agregar clientes
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

    // Establecer fecha hasta como hoy
    const hoy = new Date();
    elements.filtroFechaHasta.value = hoy.toISOString().split('T')[0];

    // Establecer fecha desde como hace 30 días
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);
    elements.filtroFechaDesde.value = hace30Dias.toISOString().split('T')[0];
  }

  // ========================================
  // MODAL: ESTADO DE CUENTA (DRILL-DOWN)
  // ========================================

  async function abrirEstadoCuenta(clienteId) {
    const modal = document.getElementById("modalEstadoCuenta");
    if (!modal) return;

    modal.style.display = "flex";

    try {
      const response = await API.apiCall(`/admin/cxc/estado-cuenta/${clienteId}`, {
        method: "GET",
      });

      if (!response.ok || !response.data?.success) {
        throw new Error(response.data?.message || "Error al cargar estado de cuenta");
      }

      const { cliente, pedidos, abonos } = response.data.data;

      // Actualizar encabezado
      document.getElementById("estadoCuentaCliente").textContent = 
        `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim();
      document.getElementById("estadoCuentaSaldo").textContent = 
        formatCurrency(cliente.saldo_deudor);

      // Información del cliente
      document.getElementById("estadoCuentaInfoCliente").innerHTML = `
        <div style="margin-bottom: 0.5rem;"><strong>Email:</strong> ${cliente.email || 'N/A'}</div>
        <div style="margin-bottom: 0.5rem;"><strong>Teléfono:</strong> ${cliente.telefono || 'N/A'}</div>
        <div><strong>Estado:</strong> <span class="badge ${cliente.estado_credito === 'ACTIVO' ? 'bg-success' : 'bg-danger'}">${cliente.estado_credito}</span></div>
      `;

      // Resumen de crédito
      const disponible = parseFloat(cliente.limite_credito) - parseFloat(cliente.saldo_deudor);
      document.getElementById("estadoCuentaResumenCredito").innerHTML = `
        <div style="margin-bottom: 0.5rem;"><strong>Límite de Crédito:</strong> ${formatCurrency(cliente.limite_credito)}</div>
        <div style="margin-bottom: 0.5rem;"><strong>Saldo Deudor:</strong> ${formatCurrency(cliente.saldo_deudor)}</div>
        <div style="margin-bottom: 0.5rem;"><strong>Disponible:</strong> ${formatCurrency(disponible)}</div>
        <div><strong>Días de Gracia:</strong> ${cliente.dias_gracia || 0} días</div>
      `;

      // Renderizar pedidos pendientes
      renderPedidosPendientes(pedidos);

      // Renderizar últimos abonos
      renderUltimosAbonos(abonos);

    } catch (error) {
      console.error("Error cargando estado de cuenta:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo cargar el estado de cuenta",
        confirmButtonColor: "#F97316",
      });
      modal.style.display = "none";
    }
  }

  function renderPedidosPendientes(pedidos) {
    const tbody = document.getElementById("tablaPedidosPendientesTbody");
    if (!tbody) return;

    if (pedidos.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem; color: #9ca3af;">
            No hay pedidos pendientes
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = pedidos.map(pedido => {
      const fecha = pedido.fechapedido ? new Date(pedido.fechapedido).toLocaleDateString("es-MX") : "—";
      const vencimiento = pedido.fecha_vencimiento ? new Date(pedido.fecha_vencimiento).toLocaleDateString("es-MX") : "Sin vencimiento";
      const diasVencido = parseInt(pedido.dias_vencido) || 0;
      const categoria = pedido.categoria_aging || "—";
      
      let categoriaColor = "#6b7280";
      let categoriaBg = "#f9fafb";
      if (categoria.includes("1-30")) {
        categoriaColor = "#d97706";
        categoriaBg = "#fef3c7";
      } else if (categoria.includes("+30")) {
        categoriaColor = "#dc2626";
        categoriaBg = "#fee2e2";
      } else if (categoria.includes("corriente")) {
        categoriaColor = "#10b981";
        categoriaBg = "#d1fae5";
      }

      return `
        <tr>
          <td><strong>#${pedido.pedidoid}</strong></td>
          <td>${fecha}</td>
          <td style="text-align: right;">${formatCurrency(pedido.montototal)}</td>
          <td style="text-align: right; font-weight: 700; color: #dc2626;">${formatCurrency(pedido.saldo_pendiente)}</td>
          <td>${vencimiento}</td>
          <td style="text-align: center;">${diasVencido > 0 ? `<span style="color: #dc2626; font-weight: 600;">${diasVencido}</span>` : '0'}</td>
          <td>
            <span style="padding: 0.25rem 0.75rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 600; background: ${categoriaBg}; color: ${categoriaColor};">
              ${categoria}
            </span>
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderUltimosAbonos(abonos) {
    const tbody = document.getElementById("tablaUltimosAbonosTbody");
    if (!tbody) return;

    if (abonos.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem; color: #9ca3af;">
            No hay abonos registrados
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = abonos.map(abono => {
      const fecha = abono.fecha_movimiento ? new Date(abono.fecha_movimiento).toLocaleString("es-MX", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }) : "—";

      return `
        <tr>
          <td style="white-space: nowrap;">${fecha}</td>
          <td><span class="badge bg-success">${abono.tipo_movimiento}</span></td>
          <td style="text-align: right; font-weight: 700; color: #16a34a;">${formatCurrency(abono.monto)}</td>
          <td style="font-size: 0.875rem;">${abono.referencia_id || "—"}</td>
          <td style="font-size: 0.875rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${abono.descripcion || ''}">${abono.descripcion || "—"}</td>
          <td style="font-size: 0.875rem;">${abono.registrado_por || "Sistema"}</td>
          <td style="text-align: right; font-weight: 600;">${formatCurrency(abono.saldo_despues_movimiento)}</td>
        </tr>
      `;
    }).join("");
  }

  // Event listeners para cerrar modal Estado de Cuenta
  document.getElementById("btnCerrarModalEstadoCuenta")?.addEventListener("click", () => {
    document.getElementById("modalEstadoCuenta").style.display = "none";
  });

  document.getElementById("btnCerrarEstadoCuenta")?.addEventListener("click", () => {
    document.getElementById("modalEstadoCuenta").style.display = "none";
  });

  document.getElementById("modalEstadoCuenta")?.addEventListener("click", (e) => {
    if (e.target.id === "modalEstadoCuenta") {
      e.target.style.display = "none";
    }
  });

  // ========================================
  // MODAL: PAGO MANUAL
  // ========================================

  let currentPagoManualData = null;

  function abrirModalPagoManual(creditoId, clienteId, saldo) {
    const cliente = state.cartera.find((item) => item.clienteId === clienteId);
    if (!cliente) return;

    currentPagoManualData = { creditoId, clienteId, saldo };

    document.getElementById("pagoManualCliente").textContent = 
      `${cliente.clienteNombre || ''} ${cliente.apellido || ''}`.trim();
    document.getElementById("pagoManualSaldo").textContent = formatCurrency(saldo);

    // Limpiar formulario
    document.getElementById("pagoManualMonto").value = "";
    document.getElementById("pagoManualMetodo").value = "";
    document.getElementById("pagoManualReferencia").value = "";
    document.getElementById("pagoManualNotas").value = "";

    document.getElementById("modalPagoManual").style.display = "flex";
  }

  function cerrarModalPagoManual() {
    currentPagoManualData = null;
    document.getElementById("modalPagoManual").style.display = "none";
  }

  async function procesarPagoManual() {
    if (!currentPagoManualData) return;

    const monto = parseFloat(document.getElementById("pagoManualMonto").value);
    const metodoPago = document.getElementById("pagoManualMetodo").value;
    const referencia = document.getElementById("pagoManualReferencia").value.trim();
    const notas = document.getElementById("pagoManualNotas").value.trim();

    // Validaciones
    if (!monto || monto <= 0) {
      Swal.fire({
        icon: "warning",
        title: "Monto inválido",
        text: "Introduce un monto mayor a 0",
        confirmButtonColor: "#F97316",
      });
      return;
    }

    if (!metodoPago) {
      Swal.fire({
        icon: "warning",
        title: "Método de pago requerido",
        text: "Selecciona un método de pago",
        confirmButtonColor: "#F97316",
      });
      return;
    }

    if (monto > currentPagoManualData.saldo) {
      Swal.fire({
        icon: "warning",
        title: "Monto excede el saldo",
        text: `El monto ($${monto.toFixed(2)}) no puede ser mayor al saldo deudor ($${currentPagoManualData.saldo.toFixed(2)})`,
        confirmButtonColor: "#F97316",
      });
      return;
    }

    // Confirmar con el usuario
    const result = await Swal.fire({
      icon: "question",
      title: "¿Confirmar registro de pago?",
      html: `
        <div style="text-align: left; padding: 1rem; background: #f9fafb; border-radius: 0.5rem; margin-top: 1rem;">
          <p style="margin: 0.5rem 0;"><strong>Monto:</strong> ${formatCurrency(monto)}</p>
          <p style="margin: 0.5rem 0;"><strong>Método:</strong> ${metodoPago}</p>
          ${referencia ? `<p style="margin: 0.5rem 0;"><strong>Referencia:</strong> ${referencia}</p>` : ''}
          <p style="margin: 0.5rem 0; color: #dc2626; font-weight: 600;">Este pago se aplicará inmediatamente y no se puede revertir.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Sí, registrar pago",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#10b981",
      cancelButtonColor: "#6b7280",
    });

    if (!result.isConfirmed) return;

    // Deshabilitar botón y mostrar spinner
    const btnConfirmar = document.getElementById("btnConfirmarPagoManual");
    const txtGuardar = document.getElementById("pagoManualGuardarTxt");
    const spinner = document.getElementById("pagoManualGuardarSpinner");
    
    btnConfirmar.disabled = true;
    txtGuardar.style.display = "none";
    spinner.style.display = "inline-flex";

    try {
      const response = await API.apiCall("/admin/cxc/registrar-pago-manual", {
        method: "POST",
        body: JSON.stringify({
          creditoId: currentPagoManualData.creditoId,
          monto,
          metodoPago,
          referencia: referencia || null,
          notas: notas || null,
        }),
      });

      if (!response.ok || !response.data?.success) {
        throw new Error(response.data?.message || "Error al registrar el pago");
      }

      await Swal.fire({
        icon: "success",
        title: "Pago Registrado",
        html: `
          <p>El pago de <strong>${formatCurrency(monto)}</strong> ha sido registrado exitosamente.</p>
          <p style="margin-top: 0.5rem; font-size: 0.875rem; color: #6b7280;">
            Nuevo saldo: <strong>${formatCurrency(response.data.data.saldoNuevo)}</strong>
          </p>
        `,
        confirmButtonColor: "#F97316",
      });

      cerrarModalPagoManual();
      await loadCartera(true);
      cargarMetricas();

    } catch (error) {
      console.error("Error registrando pago manual:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo registrar el pago. Intenta nuevamente.",
        confirmButtonColor: "#F97316",
      });
    } finally {
      btnConfirmar.disabled = false;
      txtGuardar.style.display = "inline-flex";
      spinner.style.display = "none";
    }
  }

  // Event listeners para modal Pago Manual
  document.getElementById("btnCerrarModalPagoManual")?.addEventListener("click", cerrarModalPagoManual);
  document.getElementById("btnCancelarPagoManual")?.addEventListener("click", cerrarModalPagoManual);
  document.getElementById("btnConfirmarPagoManual")?.addEventListener("click", procesarPagoManual);

  document.getElementById("modalPagoManual")?.addEventListener("click", (e) => {
    if (e.target.id === "modalPagoManual") {
      cerrarModalPagoManual();
    }
  });

})();
