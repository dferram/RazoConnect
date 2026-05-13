(function() {
  'use strict';

  // ─── Clasificación contable ────────────────────────────────────────────────
  // CARGO / RESERVA  → Debita al cliente (aumenta saldo deudor) → rojo/naranja
  // ABONO / PAGO     → Acredita al cliente (reduce saldo deudor) → verde
  // AJUSTE           → Lib. de reserva al confirmar remisión     → índigo
  // CREDITO          → Crédito a favor (ej. devolución)          → verde
  // ──────────────────────────────────────────────────────────────────────────

  const TIPO_CONFIG = {
    CARGO:      { label: 'Cargo',        color: '#dc2626', badge: 'danger',   icon: 'bi-receipt',           columna: 'cargo'  },
    RESERVA:    { label: 'Reserva',      color: '#f59e0b', badge: 'warning',  icon: 'bi-hourglass-split',   columna: 'cargo'  },
    AJUSTE:     { label: 'Lib. Reserva', color: '#6366f1', badge: 'secondary',icon: 'bi-arrow-counterclockwise', columna: 'ajuste' },
    ABONO:      { label: 'Abono',        color: '#10b981', badge: 'success',  icon: 'bi-arrow-down-circle', columna: 'abono'  },
    PAGO:       { label: 'Pago',         color: '#10b981', badge: 'success',  icon: 'bi-check-circle',      columna: 'abono'  },
    CREDITO:    { label: 'Crédito',      color: '#10b981', badge: 'success',  icon: 'bi-gift',              columna: 'abono'  },
    CANCELACION:{ label: 'Cancelación',  color: '#8b5cf6', badge: 'info',     icon: 'bi-x-circle',          columna: 'abono'  },
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
    totalRecords: 0,
    currentMes: new Date().getMonth() + 1,
    currentAnio: new Date().getFullYear(),
    estadoCuentaData: null
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
    await Promise.all([cargarDatosCliente(), cargarEstadoCuentaMensual()]);
    
    // Event listener para botón de PDF
    if (elements.btnDescargarPDF) {
      elements.btnDescargarPDF.addEventListener('click', descargarPDF);
    }
  });

  function cacheElements() {
    elements.clienteNombre    = document.getElementById("clienteNombre");
    elements.clienteAvatar    = document.getElementById("clienteAvatar");
    elements.clienteMeta      = document.getElementById("clienteMeta");
    elements.limiteCredito    = document.getElementById("limiteCredito");
    elements.saldoDeudor      = document.getElementById("saldoDeudor");
    elements.cargoConfirmado  = document.getElementById("cargoConfirmado");
    elements.reservaPendiente = document.getElementById("reservaPendiente");
    elements.creditoDisponible= document.getElementById("creditoDisponible");
    elements.estadoCredito    = document.getElementById("estadoCredito");
    elements.utilizacionBar   = document.getElementById("utilizacionBar");
    elements.utilizacionPct   = document.getElementById("utilizacionPct");
    elements.tabla            = document.getElementById("tablaMovimientos");
    elements.tbody            = document.getElementById("tablaMovimientosTbody");
    elements.estadoCarga      = document.getElementById("estadoCarga");
    elements.estadoVacio      = document.getElementById("estadoVacio");
    elements.movimientosCount = document.getElementById("movimientosCount");
    elements.monthTabs        = document.getElementById("monthTabs");
    elements.btnDescargarPDF  = document.getElementById("btnDescargarPDF");
    elements.saldoInicial     = document.getElementById("saldoInicial");
    elements.totalCargos      = document.getElementById("totalCargos");
    elements.totalAbonos      = document.getElementById("totalAbonos");
    elements.saldoFinal       = document.getElementById("saldoFinal");
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
      const response = await API.apiCall(`/admin/cxc/estado-cuenta/${state.clienteId}`, { method: "GET" });

      if (!response.ok || !response.data?.success) {
        if (elements.clienteNombre) elements.clienteNombre.textContent = `Cliente #${state.clienteId}`;
        if (elements.clienteAvatar) elements.clienteAvatar.textContent = '?';
        console.warn("No se pudo cargar el cliente:", response.data?.message);
        return;
      }

      const d       = response.data.data;
      const cliente = d.cliente || d;
      const balance = d.balance || {};

      const nombre = [cliente.nombre, cliente.apellido].filter(Boolean).join(' ') || `Cliente #${state.clienteId}`;
      if (elements.clienteNombre) elements.clienteNombre.textContent = nombre;

      // Avatar con iniciales
      if (elements.clienteAvatar) {
        const words = nombre.trim().split(/\s+/);
        elements.clienteAvatar.textContent = words.length >= 2
          ? (words[0][0] + words[1][0]).toUpperCase()
          : nombre.substring(0, 2).toUpperCase();
      }

      // Meta: email y teléfono
      if (elements.clienteMeta) {
        const parts = [];
        if (cliente.email)    parts.push(`<span><i class="bi bi-envelope"></i> ${cliente.email}</span>`);
        if (cliente.telefono) parts.push(`<span><i class="bi bi-telephone"></i> ${cliente.telefono}</span>`);
        elements.clienteMeta.innerHTML = parts.join('');
      }

      const limite     = parseFloat(balance.limiteCredito  ?? cliente.limite_credito  ?? 0);
      const saldoTotal = parseFloat(balance.saldoTotal     ?? cliente.saldo_deudor    ?? 0);
      const cargoConf  = parseFloat(balance.cargoConfirmado  ?? 0);
      const reserva    = parseFloat(balance.reservaPendiente ?? 0);
      const disponible = parseFloat(balance.creditoDisponible ?? Math.max(limite - saldoTotal, 0));

      if (elements.limiteCredito)     elements.limiteCredito.textContent     = formatCurrency(limite);
      if (elements.saldoDeudor)       elements.saldoDeudor.textContent       = formatCurrency(saldoTotal);
      if (elements.cargoConfirmado)   elements.cargoConfirmado.textContent   = formatCurrency(cargoConf);
      if (elements.reservaPendiente)  elements.reservaPendiente.textContent  = formatCurrency(reserva);
      if (elements.creditoDisponible) elements.creditoDisponible.textContent = formatCurrency(disponible);

      // Estado badge
      const estado = (cliente.estado_credito || balance.estadoCredito || '').toUpperCase();
      if (elements.estadoCredito) {
        const suspendido = estado === 'SUSPENDIDO';
        elements.estadoCredito.innerHTML = suspendido
          ? '<span class="cxc-estado-badge cxc-estado-suspendido"><i class="bi bi-x-circle-fill"></i> Suspendido</span>'
          : '<span class="cxc-estado-badge cxc-estado-activo"><i class="bi bi-check-circle-fill"></i> Activo</span>';
      }

      // Barra de utilización
      if (limite > 0 && elements.utilizacionBar && elements.utilizacionPct) {
        const pct = Math.min((saldoTotal / limite) * 100, 100);
        const color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#f59e0b' : '#f97316';
        elements.utilizacionBar.style.width    = pct.toFixed(1) + '%';
        elements.utilizacionBar.style.background = color;
        elements.utilizacionPct.textContent    = pct.toFixed(1) + '% utilizado';
        elements.utilizacionPct.style.color    = color;
      }

    } catch (error) {
      console.error("Error cargando datos del cliente:", error);
      if (elements.clienteNombre) elements.clienteNombre.textContent = `Cliente #${state.clienteId}`;
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
      if (elements.movimientosCount) elements.movimientosCount.style.display = 'none';
      return;
    }

    elements.tabla.style.display = "table";
    elements.estadoVacio.style.display = "none";

    if (elements.movimientosCount) {
      elements.movimientosCount.textContent = `${state.totalRecords} movimiento${state.totalRecords !== 1 ? 's' : ''}`;
      elements.movimientosCount.style.display = 'inline-block';
    }

    elements.tbody.innerHTML = state.movimientos.map(mov => {
      const tipoRaw  = (mov.tipo_movimiento || mov.tipo || '').toUpperCase();
      const cfg      = tipoInfo(tipoRaw);
      
      // Manejar datos del estado de cuenta mensual (cargo/abono separados)
      const cargo = mov.cargo ? parseFloat(mov.cargo) : null;
      const abono = mov.abono ? parseFloat(mov.abono) : null;
      const monto = cargo || abono || Math.abs(parseFloat(mov.monto || 0));
      const saldo = parseFloat(mov.saldo_despues_movimiento || mov.saldo || 0);
      const rowClass = `row-${tipoRaw.toLowerCase()}`;

      const colCargo = cargo 
        ? `<span class="amount-cargo td-mono">${formatCurrency(cargo)}</span>` 
        : '<span style="color:#d1d5db;">—</span>';
      const colAbono = abono
        ? `<span class="amount-abono td-mono">${formatCurrency(abono)}</span>` 
        : '<span style="color:#d1d5db;">—</span>';

      const pedidoId     = mov.pedido_id || mov.pedidoNumero || '';
      const remisionFolio = mov.remision_folio || mov.remisionFolio || (mov.remision_id ? `REM-${mov.remision_id}` : '');

      const pedidoCell = pedidoId
        ? `<a href="/admin-pedido-detalle.html?id=${pedidoId}" class="folio-link" target="_blank"><i class="bi bi-box-seam"></i>#${pedidoId}</a>`
        : '<span style="color:#d1d5db;">—</span>';

      const remisionCell = remisionFolio
        ? `<span class="folio-link"><i class="bi bi-file-text"></i>${remisionFolio}</span>`
        : '<span style="color:#d1d5db;">—</span>';

      return `
        <tr class="${rowClass}">
          <td style="white-space:nowrap; color:#6b7280;">${formatFecha(mov.fecha_movimiento || mov.fecha)}</td>
          <td>
            <span class="tipo-badge tipo-${tipoRaw.toLowerCase()}">
              <i class="bi ${cfg.icon}"></i>${cfg.label}
            </span>
          </td>
          <td style="max-width:260px; line-height:1.4;">${mov.descripcion || '—'}</td>
          <td class="td-right">${colCargo}</td>
          <td class="td-right">${colAbono}</td>
          <td class="td-right"><span class="amount-saldo td-mono">${formatCurrency(saldo)}</span></td>
          <td>${pedidoCell}</td>
          <td>${remisionCell}</td>
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
    if (elements.estadoCarga) {
      elements.estadoCarga.style.display = show ? 'flex' : 'none';
      if (show && elements.tabla)       elements.tabla.style.display       = 'none';
      if (show && elements.estadoVacio) elements.estadoVacio.style.display = 'none';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FUNCIONALIDAD TIPO BANCO - ESTADO DE CUENTA MENSUAL
  // ═══════════════════════════════════════════════════════════════════════════

  async function cargarEstadoCuentaMensual() {
    try {
      const url = `/admin/cxc/estado-cuenta-mensual/${state.clienteId}?mes=${state.currentMes}&anio=${state.currentAnio}`;
      const response = await API.apiCall(url, { method: "GET" });

      if (!response.ok || !response.data?.success) {
        console.warn("No se pudo cargar el estado de cuenta mensual:", response.data?.message);
        return;
      }

      state.estadoCuentaData = response.data.data;
      renderizarEstadoCuentaMensual(response.data.data);
      
      // Habilitar botón de PDF
      if (elements.btnDescargarPDF) {
        elements.btnDescargarPDF.disabled = false;
      }

    } catch (error) {
      console.error("Error cargando estado de cuenta mensual:", error);
    }
  }

  function renderizarEstadoCuentaMensual(data) {
    // Renderizar tabs de meses
    if (elements.monthTabs && data.mesesDisponibles) {
      elements.monthTabs.innerHTML = data.mesesDisponibles.map(mes => {
        const isActive = mes.mes === state.currentMes && mes.anio === state.currentAnio;
        return `
          <div class="month-tab ${isActive ? 'active' : ''}" 
               onclick="window.cambiarMes(${mes.mes}, ${mes.anio})">
            ${mes.nombreMes}
          </div>
        `;
      }).join('');
    }

    // Renderizar resumen del periodo
    if (data.saldos) {
      if (elements.saldoInicial) elements.saldoInicial.textContent = formatCurrency(data.saldos.saldoInicial);
      if (elements.totalCargos)  elements.totalCargos.textContent  = formatCurrency(data.saldos.totalCargos);
      if (elements.totalAbonos)  elements.totalAbonos.textContent  = formatCurrency(data.saldos.totalAbonos);
      if (elements.saldoFinal)   elements.saldoFinal.textContent   = formatCurrency(data.saldos.saldoFinal);
    }

    // Renderizar movimientos del mes
    if (data.movimientos) {
      state.movimientos = data.movimientos;
      state.totalRecords = data.movimientos.length;
      renderTabla();
      
      // Ocultar paginación si usamos vista mensual
      const paginationWrapper = document.getElementById('paginationWrapper');
      if (paginationWrapper) {
        paginationWrapper.style.display = 'none';
      }
    }
  }

  // Función global para cambiar de mes (llamada desde onclick en HTML)
  window.cambiarMes = async function(mes, anio) {
    state.currentMes = mes;
    state.currentAnio = anio;
    await cargarEstadoCuentaMensual();
  };

  async function descargarPDF() {
    if (!state.clienteId) {
      Swal.fire({ icon: "warning", title: "Atención", text: "No se ha seleccionado un cliente", confirmButtonColor: "#F97316" });
      return;
    }

    Swal.fire({ title: 'Generando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
      const url = `/admin/cxc/estado-cuenta-mensual/${state.clienteId}/pdf?mes=${state.currentMes}&anio=${state.currentAnio}`;
      const response = await API.apiCall(url, { method: 'GET', responseType: 'blob' });
      
      if (!response.ok) {
        throw new Error(response.status === 401 ? 'Sesión expirada' : 'Error al generar PDF');
      }
      
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Estado_Cuenta_${state.clienteId}_${state.currentMes}_${state.currentAnio}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      Swal.close();
    } catch (error) {
      console.error('Error:', error);
      Swal.fire({ icon: "error", title: "Error", text: error.message || "No se pudo generar el PDF", confirmButtonColor: "#F97316" });
    }
  }

})();
