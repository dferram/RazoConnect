// ═══════════════════════════════════════════════════════════════════════════
// ADMIN CLIENTE CXC - VISTA POR REMISIONES
// Muestra CxC agrupadas por remisión con descarga de PDF mensual
// ═══════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ─── Estado Global ────────────────────────────────────────────────────────
  let clienteId = null;
  let currentMonth = null;
  let currentYear = null;
  let mesesDisponibles = [];
  let clienteData = null;

  // ─── Inicialización ───────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', init);

  function init() {
    const urlParams = new URLSearchParams(window.location.search);
    clienteId = urlParams.get('clienteId') || urlParams.get('id');

    if (!clienteId) {
      Swal.fire('Error', 'No se especificó el ID del cliente', 'error');
      window.location.href = '/admin-clientes.html';
      return;
    }

    // Inicializar con mes actual
    const now = new Date();
    currentMonth = now.getMonth() + 1;
    currentYear = now.getFullYear();

    cargarDatosIniciales();
    setupEventListeners();
  }

  function setupEventListeners() {
    const btnPDF = document.getElementById('btnDescargarPDF');
    if (btnPDF) {
      btnPDF.addEventListener('click', descargarPDF);
    }
  }

  // ─── Carga de Datos ───────────────────────────────────────────────────────
  async function cargarDatosIniciales() {
    try {
      await Promise.all([
        cargarEstadoCuenta(),
        cargarRemisiones()
      ]);
      
      // Cargar movimientos del mes actual
      await cargarMovimientosMes(currentMonth, currentYear);
    } catch (error) {
      console.error('Error cargando datos iniciales:', error);
      Swal.fire('Error', 'No se pudieron cargar los datos del cliente', 'error');
    }
  }

  async function cargarEstadoCuenta() {
    try {
      const response = await API.apiCall(`/admin/cxc/estado-cuenta/${clienteId}`, { method: 'GET' });
      
      if (response.ok && response.data?.success) {
        clienteData = response.data.data;
        renderizarDatosCliente(response.data.data);
        renderizarMetricas(response.data.data);
      }
    } catch (error) {
      console.error('Error cargando estado de cuenta:', error);
    }
  }

  async function cargarMovimientosMes(mes, anio) {
    try {
      mostrarCargando(true);
      
      const response = await API.apiCall(
        `/admin/cxc/estado-cuenta-mensual/${clienteId}?mes=${mes}&anio=${anio}`,
        { method: 'GET' }
      );

      if (response.ok && response.data?.success) {
        const data = response.data.data;
        mesesDisponibles = data.mesesDisponibles || [];
        renderizarTabsMeses();
        renderizarResumenPeriodo(data.saldos);
        renderizarMovimientos(data.movimientos);
        
        // Habilitar botón de PDF
        const btnPDF = document.getElementById('btnDescargarPDF');
        if (btnPDF) {
          btnPDF.disabled = false;
        }
      }

      mostrarCargando(false);
    } catch (error) {
      console.error('Error cargando movimientos del mes:', error);
      mostrarCargando(false);
      mostrarVacio(true);
    }
  }

  async function cargarRemisiones() {
    try {
      const response = await API.apiCall(
        `/admin/cxc/cliente/${clienteId}/remisiones?incluir_pagadas=false&limit=100`,
        { method: 'GET' }
      );

      if (response.ok && response.data?.success) {
        renderizarRemisiones(response.data.data);
      }
    } catch (error) {
      console.error('Error cargando remisiones:', error);
    }
  }

  // ─── Renderizado ──────────────────────────────────────────────────────────
  function renderizarDatosCliente(data) {
    const { cliente, balance } = data;
    
    // Avatar
    const avatar = document.getElementById('clienteAvatar');
    if (avatar && cliente.nombre) {
      avatar.textContent = cliente.nombre.charAt(0).toUpperCase();
    }

    // Nombre
    const nombre = document.getElementById('clienteNombre');
    if (nombre) {
      const nombreCompleto = `${cliente.nombre} ${cliente.apellido || ''}`.trim();
      nombre.textContent = nombreCompleto;
    }

    // Meta
    const meta = document.getElementById('clienteMeta');
    if (meta) {
      meta.innerHTML = `
        <span><i class="bi bi-envelope"></i> ${cliente.email || 'Sin email'}</span>
        <span><i class="bi bi-telephone"></i> ${cliente.telefono || 'Sin teléfono'}</span>
      `;
    }

    // Límite de crédito
    const limite = document.getElementById('limiteCredito');
    if (limite) {
      limite.textContent = formatCurrency(cliente.limite_credito);
    }

    // Estado
    const estadoEl = document.getElementById('estadoCredito');
    if (estadoEl) {
      const esActivo = cliente.estado_credito === 'ACTIVO';
      estadoEl.innerHTML = `
        <span class="cxc-estado-badge ${esActivo ? 'cxc-estado-activo' : 'cxc-estado-suspendido'}">
          <i class="bi ${esActivo ? 'bi-check-circle' : 'bi-x-circle'}"></i>
          ${esActivo ? 'Activo' : 'Suspendido'}
        </span>
      `;
    }
  }

  function renderizarMetricas(data) {
    const { balance, cliente } = data;

    // Saldo deudor
    const saldoEl = document.getElementById('saldoDeudor');
    if (saldoEl) {
      saldoEl.textContent = formatCurrency(balance.saldoTotal);
    }

    // Cargo confirmado
    const cargoEl = document.getElementById('cargoConfirmado');
    if (cargoEl) {
      cargoEl.textContent = formatCurrency(balance.cargoConfirmado);
    }

    // Reserva pendiente
    const reservaEl = document.getElementById('reservaPendiente');
    if (reservaEl) {
      reservaEl.textContent = formatCurrency(balance.reservaPendiente);
    }

    // Crédito disponible
    const disponibleEl = document.getElementById('creditoDisponible');
    if (disponibleEl) {
      disponibleEl.textContent = formatCurrency(balance.creditoDisponible);
    }

    // Barra de utilización
    renderizarBarraUtilizacion(balance, cliente);
  }

  function renderizarBarraUtilizacion(balance, cliente) {
    const limite = cliente.limite_credito || 1;
    const cargo = balance.cargoConfirmado || 0;
    const reserva = balance.reservaPendiente || 0;
    
    const pctCargo = (cargo / limite) * 100;
    const pctReserva = (reserva / limite) * 100;
    const pctTotal = pctCargo + pctReserva;

    const pctEl = document.getElementById('utilizacionPct');
    if (pctEl) {
      pctEl.textContent = `${pctTotal.toFixed(1)}%`;
      pctEl.style.color = pctTotal > 90 ? '#dc2626' : pctTotal > 70 ? '#ea580c' : '#111827';
    }

    const barEl = document.getElementById('utilizacionBar');
    if (barEl) {
      const color = pctTotal > 90 ? '#dc2626' : pctTotal > 70 ? '#ea580c' : '#f59e0b';
      barEl.style.width = `${Math.min(pctTotal, 100)}%`;
      barEl.style.background = color;
    }
  }

  function renderizarTabsMeses() {
    const container = document.getElementById('monthTabs');
    if (!container) return;

    // Si no hay meses disponibles, no hacer nada (ya se cargó en cargarDatosIniciales)
    if (mesesDisponibles.length === 0) {
      return;
    }

    container.innerHTML = mesesDisponibles.map(m => `
      <div class="month-tab ${m.mes === currentMonth && m.anio === currentYear ? 'active' : ''}"
           data-mes="${m.mes}"
           data-anio="${m.anio}">
        ${m.nombreMes}
      </div>
    `).join('');

    // Event listeners
    container.querySelectorAll('.month-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const mes = parseInt(tab.dataset.mes);
        const anio = parseInt(tab.dataset.anio);
        
        currentMonth = mes;
        currentYear = anio;
        
        // Actualizar tabs activos
        container.querySelectorAll('.month-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Cargar movimientos
        cargarMovimientosMes(mes, anio);
      });
    });

    // NO cargar movimientos aquí - ya se cargaron en cargarDatosIniciales
  }

  function renderizarResumenPeriodo(saldos) {
    document.getElementById('saldoInicial').textContent = formatCurrency(saldos.saldoInicial);
    document.getElementById('totalCargos').textContent = formatCurrency(saldos.totalCargos);
    document.getElementById('totalAbonos').textContent = formatCurrency(saldos.totalAbonos);
    document.getElementById('saldoFinal').textContent = formatCurrency(saldos.saldoFinal);
  }

  function renderizarMovimientos(movimientos) {
    const tbody = document.getElementById('tablaMovimientosTbody');
    const tabla = document.getElementById('tablaMovimientos');
    const countEl = document.getElementById('movimientosCount');

    if (!movimientos || movimientos.length === 0) {
      mostrarVacio(true);
      return;
    }

    mostrarVacio(false);
    tabla.style.display = 'table';
    
    if (countEl) {
      countEl.textContent = movimientos.length;
      countEl.style.display = 'inline-block';
    }

    tbody.innerHTML = movimientos.map(mov => {
      const tipo = mov.tipo.toUpperCase();
      const rowClass = `row-${tipo.toLowerCase()}`;
      
      return `
        <tr class="${rowClass}">
          <td>${formatFecha(mov.fecha)}</td>
          <td>
            <span class="tipo-badge tipo-${tipo.toLowerCase()}">
              ${getTipoIcon(tipo)} ${getTipoLabel(tipo)}
            </span>
          </td>
          <td>${mov.descripcion || '-'}</td>
          <td class="td-right td-mono ${mov.cargo ? 'amount-cargo' : ''}">
            ${mov.cargo ? formatCurrency(mov.cargo) : '-'}
          </td>
          <td class="td-right td-mono ${mov.abono ? 'amount-abono' : ''}">
            ${mov.abono ? formatCurrency(mov.abono) : '-'}
          </td>
          <td class="td-right td-mono amount-saldo">
            ${formatCurrency(mov.saldo)}
          </td>
          <td>${mov.pedidoNumero ? `#${mov.pedidoNumero}` : '-'}</td>
          <td>
            ${mov.remisionFolio ? `
              <a href="/admin-remision-detalle.html?id=${mov.remisionId || ''}" 
                 class="folio-link" 
                 title="Ver remisión">
                ${mov.remisionFolio} <i class="bi bi-box-arrow-up-right"></i>
              </a>
            ` : '-'}
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderizarRemisiones(data) {
    // Esta función renderizaría una sección adicional de remisiones
    // Por ahora, solo mostramos los movimientos mensuales
    console.log('Remisiones cargadas:', data);
  }

  // ─── Descarga de PDF ──────────────────────────────────────────────────────
  async function descargarPDF() {
    const btnPDF = document.getElementById('btnDescargarPDF');
    if (!btnPDF || !currentMonth || !currentYear) return;

    try {
      btnPDF.disabled = true;
      btnPDF.innerHTML = '<i class="bi bi-hourglass-split"></i> Generando...';

      const url = `/admin/cxc/estado-cuenta-mensual/${clienteId}/pdf?mes=${currentMonth}&anio=${currentYear}`;
      
      // Usar API.apiCall con responseType blob
      const response = await API.apiCall(url, { 
        method: 'GET',
        responseType: 'blob'
      });

      if (!response.ok) {
        throw new Error('Error al generar el PDF');
      }

      // response.data ya es el blob
      const blob = response.data;
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Estado_Cuenta_${clienteData?.cliente?.nombre || 'Cliente'}_${currentYear}-${String(currentMonth).padStart(2, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      Swal.fire({
        icon: 'success',
        title: 'PDF Descargado',
        text: 'El estado de cuenta se descargó correctamente',
        timer: 2000,
        showConfirmButton: false
      });

    } catch (error) {
      console.error('Error descargando PDF:', error);
      Swal.fire('Error', 'No se pudo generar el PDF', 'error');
    } finally {
      btnPDF.disabled = false;
      btnPDF.innerHTML = '<i class="bi bi-file-pdf"></i> Descargar PDF';
    }
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────
  function mostrarCargando(mostrar) {
    const carga = document.getElementById('estadoCarga');
    const tabla = document.getElementById('tablaMovimientos');
    const vacio = document.getElementById('estadoVacio');

    if (carga) carga.style.display = mostrar ? 'flex' : 'none';
    if (tabla) tabla.style.display = mostrar ? 'none' : 'table';
    if (vacio) vacio.style.display = 'none';
  }

  function mostrarVacio(mostrar) {
    const vacio = document.getElementById('estadoVacio');
    const tabla = document.getElementById('tablaMovimientos');
    const carga = document.getElementById('estadoCarga');

    if (vacio) vacio.style.display = mostrar ? 'flex' : 'none';
    if (tabla) tabla.style.display = mostrar ? 'none' : 'table';
    if (carga) carga.style.display = 'none';
  }

  function getTipoIcon(tipo) {
    const icons = {
      'CARGO': '<i class="bi bi-receipt"></i>',
      'RESERVA': '<i class="bi bi-hourglass-split"></i>',
      'AJUSTE': '<i class="bi bi-arrow-counterclockwise"></i>',
      'ABONO': '<i class="bi bi-arrow-down-circle"></i>',
      'PAGO': '<i class="bi bi-check-circle"></i>',
      'CREDITO': '<i class="bi bi-gift"></i>'
    };
    return icons[tipo] || '<i class="bi bi-circle"></i>';
  }

  function getTipoLabel(tipo) {
    const labels = {
      'CARGO': 'Cargo',
      'RESERVA': 'Reserva',
      'AJUSTE': 'Lib. Reserva',
      'ABONO': 'Abono',
      'PAGO': 'Pago',
      'CREDITO': 'Crédito'
    };
    return labels[tipo] || tipo;
  }

  function formatCurrency(value) {
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(num);
  }

  function formatFecha(fecha) {
    if (!fecha) return '-';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

})();
