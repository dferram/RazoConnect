(function() {
  'use strict';

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
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se especificó un cliente",
        confirmButtonColor: "#F97316"
      }).then(() => {
        window.history.back();
      });
      return;
    }

    cacheElements();
    initPagination();
    await cargarDatosCliente();
    await cargarMovimientos();
  });

  function cacheElements() {
    elements.clienteNombre = document.getElementById("clienteNombre");
    elements.limiteCredito = document.getElementById("limiteCredito");
    elements.saldoDeudor = document.getElementById("saldoDeudor");
    elements.creditoDisponible = document.getElementById("creditoDisponible");
    elements.estadoCredito = document.getElementById("estadoCredito");
    elements.tabla = document.getElementById("tablaMovimientos");
    elements.tbody = document.getElementById("tablaMovimientosTbody");
    elements.estadoCarga = document.getElementById("estadoCarga");
    elements.estadoVacio = document.getElementById("estadoVacio");
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
      const response = await API.apiCall(`/admin/cxc/cliente/${state.clienteId}`, { method: "GET" });

      if (response.ok && response.data?.success) {
        const cliente = response.data.data;
        
        elements.clienteNombre.textContent = `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim();
        elements.limiteCredito.textContent = formatCurrency(cliente.limite_credito || 0);
        elements.saldoDeudor.textContent = formatCurrency(cliente.saldo_deudor || 0);
        elements.creditoDisponible.textContent = formatCurrency((cliente.limite_credito || 0) - (cliente.saldo_deudor || 0));
        
        const estadoBadge = cliente.estado_credito === 'SUSPENDIDO' 
          ? '<span class="badge bg-danger">Suspendido</span>'
          : '<span class="badge bg-success">Activo</span>';
        elements.estadoCredito.innerHTML = estadoBadge;
      }
    } catch (error) {
      console.error("Error cargando datos del cliente:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudieron cargar los datos del cliente",
        confirmButtonColor: "#F97316"
      });
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
      state.movimientos = Array.isArray(payload.movimientos) ? payload.movimientos : [];
      state.currentPage = payload.currentPage || 1;
      state.totalPages = payload.totalPages || 1;
      state.totalRecords = payload.totalRecords || 0;

      renderTabla();
      
      if (paginador) {
        paginador.render(state.totalRecords, state.currentPage);
      }
    } catch (error) {
      console.error("Error cargando movimientos:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudieron cargar los movimientos",
        confirmButtonColor: "#F97316"
      });
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
      const tipoClass = mov.tipo === 'CARGO' ? 'text-danger' : 'text-success';
      const tipoIcon = mov.tipo === 'CARGO' ? 'bi-arrow-up-circle' : 'bi-arrow-down-circle';
      const montoFormatted = mov.tipo === 'CARGO' 
        ? `+${formatCurrency(mov.monto)}`
        : `-${formatCurrency(mov.monto)}`;

      return `
        <tr>
          <td style="font-size: 0.875rem;">${formatFecha(mov.fecha_movimiento)}</td>
          <td>
            <span class="${tipoClass}" style="font-weight: 600;">
              <i class="bi ${tipoIcon}"></i> ${mov.tipo}
            </span>
          </td>
          <td style="font-size: 0.875rem;">${mov.descripcion || 'Sin descripción'}</td>
          <td class="text-right ${tipoClass}" style="font-weight: 700; font-size: 0.875rem;">${montoFormatted}</td>
          <td class="text-right" style="font-weight: 600; font-size: 0.875rem;">${formatCurrency(mov.saldo_despues_movimiento)}</td>
          <td style="font-size: 0.75rem; color: #6b7280;">${mov.referencia || '—'}</td>
        </tr>
      `;
    }).join('');
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value || 0);
  }

  function formatFecha(fecha) {
    if (!fecha) return '—';
    return new Date(fecha).toLocaleString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function toggleLoading(show) {
    if (elements.estadoCarga) {
      elements.estadoCarga.style.display = show ? 'flex' : 'none';
    }
  }

})();
