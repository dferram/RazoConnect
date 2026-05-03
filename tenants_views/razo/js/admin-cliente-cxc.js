(function() {
  'use strict';

  // ─── Clasificación contable ────────────────────────────────────────────────
  // CARGO / RESERVA  → Debita al cliente (aumenta saldo deudor) → rojo/naranja
  // ABONO / PAGO     → Acredita al cliente (reduce saldo deudor) → verde
  // AJUSTE           → Liberación interna de reserva             → gris
  // ──────────────────────────────────────────────────────────────────────────

  const TIPO_CONFIG = {
    CARGO:     { label: 'Cargo',      color: '#dc2626', badge: 'danger',   icon: 'bi-receipt',            columna: 'cargo'  },
    RESERVA:   { label: 'Reserva',    color: '#f59e0b', badge: 'warning',  icon: 'bi-hourglass-split',    columna: 'cargo'  },
    AJUSTE:    { label: 'Ajuste',     color: '#6b7280', badge: 'secondary',icon: 'bi-arrow-left-right',   columna: null     },
    ABONO:     { label: 'Abono',      color: '#10b981', badge: 'success',  icon: 'bi-arrow-down-circle',  columna: 'abono'  },
    PAGO:      { label: 'Pago',       color: '#10b981', badge: 'success',  icon: 'bi-check-circle',       columna: 'abono'  },
    CANCELACION:{ label: 'Cancelación',color: '#8b5cf6', badge: 'info',   icon: 'bi-x-circle',           columna: 'abono'  },
  };

  function tipoInfo(tipo) {
    return TIPO_CONFIG[(tipo || '').toUpperCase()] || { label: tipo, color: '#6b7280', badge: 'secondary', icon: 'bi-question-circle', columna: null };
  }

  const state = {
    clienteId: null,
    movimientos: [],
    currentPage: 1,
    itemsPerPage: 15,
    totalPages: 1,
    totalRecords: 0
  };

  const elements = {};
  let paginador = null;

  document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    state.clienteId = urlParams.get('id');

    if (!state.clienteId) {
      Swal.fire({ icon: "error", title: "Error", text: "No se especificó un cliente", confirmButtonColor: "#F97316" })
        .then(() => window.history.back());
      return;
    }

    cacheElements();
    initPagination();
    await Promise.all([cargarDatosCliente(), cargarMovimientos()]);
  });

  function cacheElements() {
    elements.clienteNombre    = document.getElementById("clienteNombre");
    elements.limiteCredito    = document.getElementById("limiteCredito");
    elements.saldoDeudor      = document.getElementById("saldoDeudor");
    elements.cargoConfirmado  = document.getElementById("cargoConfirmado");
    elements.reservaPendiente = document.getElementById("reservaPendiente");
    elements.creditoDisponible= document.getElementById("creditoDisponible");
    elements.estadoCredito    = document.getElementById("estadoCredito");
    elements.tabla            = document.getElementById("tablaMovimientos");
    elements.tbody            = document.getElementById("tablaMovimientosTbody");
    elements.estadoCarga      = document.getElementById("estadoCarga");
    elements.estadoVacio      = document.getElementById("estadoVacio");
  }

  function initPagination() {
    paginador = new PaginationComponent({
      containerId: 'paginationWrapper',
      registrosPorPagina: state.itemsPerPage,
      onPageChange: (pagina) => {
        state.currentPage = pagina;
        cargarMovimientos(pagina);
      }
    });
  }

  async function cargarDatosCliente() {
    try {
      // Usa el endpoint enriquecido que devuelve balance breakdown
      const response = await API.apiCall(`/admin/cxc/estado-cuenta/${state.clienteId}`, { method: "GET" });

      if (!response.ok || !response.data?.success) return;

      const d = response.data.data;
      const cliente  = d.cliente  || d; // compatibilidad
      const balance  = d.balance  || {};

      const nombre = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ') || `Cliente #${state.clienteId}`;
      if (elements.clienteNombre) elements.clienteNombre.textContent = nombre;

      const limite       = parseFloat(balance.limiteCredito  ?? cliente.limite_credito  ?? 0);
      const saldoTotal   = parseFloat(balance.saldoTotal     ?? cliente.saldo_deudor    ?? 0);
      const cargoConf    = parseFloat(balance.cargoConfirmado ?? 0);
      const reserva      = parseFloat(balance.reservaPendiente ?? 0);
      const disponible   = parseFloat(balance.creditoDisponible ?? Math.max(limite - saldoTotal, 0));

      if (elements.limiteCredito)     elements.limiteCredito.textContent    = formatCurrency(limite);
      if (elements.saldoDeudor)       elements.saldoDeudor.textContent      = formatCurrency(saldoTotal);
      if (elements.cargoConfirmado)   elements.cargoConfirmado.textContent  = formatCurrency(cargoConf);
      if (elements.reservaPendiente)  elements.reservaPendiente.textContent = formatCurrency(reserva);
      if (elements.creditoDisponible) elements.creditoDisponible.textContent= formatCurrency(disponible);

      const estado = cliente.estado_credito || balance.estadoCredito || '';
      if (elements.estadoCredito) {
        elements.estadoCredito.innerHTML = estado === 'SUSPENDIDO'
          ? '<span class="badge bg-danger">Suspendido</span>'
          : '<span class="badge bg-success">Activo</span>';
      }
    } catch (error) {
      console.error("Error cargando datos del cliente:", error);
    }
  }

  async function cargarMovimientos(page = 1) {
    toggleLoading(true);
    try {
      const url = `/admin/cxc/cliente/${state.clienteId}/movimientos?page=${page}&limit=${state.itemsPerPage}`;
      const response = await API.apiCall(url, { method: "GET" });

      if (!response.ok || !response.data?.success) {
        throw new Error(response.data?.message || "No se pudieron cargar los movimientos");
      }

      const payload = response.data.data || {};
      state.movimientos  = Array.isArray(payload.movimientos)  ? payload.movimientos  : [];
      state.currentPage  = payload.currentPage  || payload.page  || 1;
      state.totalPages   = payload.totalPages   || 1;
      state.totalRecords = payload.totalRecords || payload.total || 0;

      renderTabla();
      if (paginador) paginador.render(state.totalRecords, state.currentPage);
    } catch (error) {
      console.error("Error cargando movimientos:", error);
      Swal.fire({ icon: "error", title: "Error", text: error.message || "No se pudieron cargar los movimientos", confirmButtonColor: "#F97316" });
    } finally {
      toggleLoading(false);
    }
  }

  function renderTabla() {
    if (!elements.tbody) return;

    if (state.movimientos.length === 0) {
      elements.tabla.style.display = "none";
      elements.estadoVacio.style.display = "block";
      return;
    }

    elements.tabla.style.display = "table";
    elements.estadoVacio.style.display = "none";

    elements.tbody.innerHTML = state.movimientos.map(mov => {
      // El API devuelve tipo_movimiento (admin endpoint) o tipo (cliente endpoint)
      const tipoRaw = mov.tipo_movimiento || mov.tipo || '';
      const cfg     = tipoInfo(tipoRaw);
      const monto   = Math.abs(parseFloat(mov.monto || 0));
      const saldo   = parseFloat(mov.saldo_despues_movimiento || mov.saldoDespues || 0);

      // Columnas T-account: CARGO/RESERVA van a columna Cargo; ABONO/PAGO van a columna Abono; AJUSTE a ninguna
      const colCargo = cfg.columna === 'cargo' ? `<strong style="color:${cfg.color};">${formatCurrency(monto)}</strong>` : '—';
      const colAbono = cfg.columna === 'abono' ? `<strong style="color:#10b981;">${formatCurrency(monto)}</strong>` : '—';

      // Folio de remisión o pedido como enlace
      const remisionFolio = mov.remision_folio || '';
      const pedidoId      = mov.pedido_id      || '';

      return `
        <tr>
          <td style="font-size: 0.8rem; white-space: nowrap;">${formatFecha(mov.fecha_movimiento || mov.fecha)}</td>
          <td>
            <span class="badge bg-${cfg.badge}" style="font-size: 0.75rem;">
              <i class="bi ${cfg.icon}"></i> ${cfg.label}
            </span>
          </td>
          <td style="font-size: 0.8rem; max-width: 280px;">${mov.descripcion || '—'}</td>
          <td style="text-align: right; font-size: 0.875rem;">${colCargo}</td>
          <td style="text-align: right; font-size: 0.875rem;">${colAbono}</td>
          <td style="text-align: right; font-size: 0.875rem; font-weight: 600;">${formatCurrency(saldo)}</td>
          <td style="font-size: 0.8rem;">${pedidoId ? `#${pedidoId}` : '—'}</td>
          <td style="font-size: 0.8rem;">${remisionFolio || (mov.remision_id ? `REM-${mov.remision_id}` : '—')}</td>
        </tr>
      `;
    }).join('');
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value || 0);
  }

  function formatFecha(fecha) {
    if (!fecha) return '—';
    return new Date(fecha).toLocaleString('es-MX', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function toggleLoading(show) {
    if (elements.estadoCarga) elements.estadoCarga.style.display = show ? 'flex' : 'none';
  }

})();
