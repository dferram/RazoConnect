// ═══════════════════════════════════════════════════════════════════════════
// MI CRÉDITO - VISTA POR REMISIONES (CLIENTE)
// Muestra estado de cuenta con remisiones y descarga de PDF mensual
// ═══════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ─── Estado Global ────────────────────────────────────────────────────────
  let currentMonth = null;
  let currentYear = null;
  let mesesDisponibles = [];
  let creditoData = null;

  // ─── Inicialización ───────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', init);

  function init() {
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

    const btnPagar = document.getElementById('btnPagarCredito');
    if (btnPagar) {
      btnPagar.addEventListener('click', () => {
        window.location.href = '/pagar-credito.html';
      });
    }
  }

  // ─── Carga de Datos ───────────────────────────────────────────────────────
  async function cargarDatosIniciales() {
    try {
      await Promise.all([
        cargarPerfilCredito(),
        cargarRemisiones()
      ]);
    } catch (error) {
      console.error('Error cargando datos iniciales:', error);
      Swal.fire('Error', 'No se pudieron cargar tus datos de crédito', 'error');
    }
  }

  async function cargarPerfilCredito() {
    try {
      const response = await apiCall('/cliente/credito/perfil', 'GET');
      
      if (response.success && response.data) {
        creditoData = response.data;
        renderizarDatosCredito(response.data);
      }
    } catch (error) {
      console.error('Error cargando perfil de crédito:', error);
    }
  }

  async function cargarMovimientosMes(mes, anio) {
    try {
      mostrarCargando(true);
      
      const response = await apiCall(
        `/cliente/mi-estado-cuenta?mes=${mes}&anio=${anio}`,
        'GET'
      );

      if (response.success && response.data) {
        mesesDisponibles = response.data.mesesDisponibles || [];
        renderizarTabsMeses();
        renderizarResumenPeriodo(response.data.saldos);
        renderizarMovimientos(response.data.movimientos);
        
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
      const response = await apiCall(
        '/cliente/credito/remisiones?incluir_pagadas=false&limit=50',
        'GET'
      );

      if (response.success && response.data) {
        renderizarRemisionesPendientes(response.data);
      }
    } catch (error) {
      console.error('Error cargando remisiones:', error);
    }
  }

  // ─── Renderizado ──────────────────────────────────────────────────────────
  function renderizarDatosCredito(data) {
    // Límite de crédito
    const limiteEl = document.getElementById('limiteCredito');
    if (limiteEl) {
      limiteEl.textContent = formatCurrency(data.limiteCredito);
    }

    // Saldo deudor
    const saldoEl = document.getElementById('saldoDeudor');
    if (saldoEl) {
      saldoEl.textContent = formatCurrency(data.saldoDeudor);
    }

    // Crédito disponible
    const disponibleEl = document.getElementById('creditoDisponible');
    if (disponibleEl) {
      disponibleEl.textContent = formatCurrency(data.creditoDisponible);
    }

    // Días de gracia
    const diasEl = document.getElementById('diasGracia');
    if (diasEl) {
      diasEl.textContent = data.diasGracia || 0;
    }

    // Estado
    const estadoEl = document.getElementById('estadoCredito');
    if (estadoEl) {
      const esActivo = data.estadoCredito === 'ACTIVO';
      estadoEl.innerHTML = `
        <span class="badge ${esActivo ? 'bg-success' : 'bg-danger'}">
          ${esActivo ? 'Activo' : 'Suspendido'}
        </span>
      `;
    }

    // Barra de progreso
    renderizarBarraUtilizacion(data);
  }

  function renderizarBarraUtilizacion(data) {
    const limite = data.limiteCredito || 1;
    const saldo = data.saldoDeudor || 0;
    const pct = (saldo / limite) * 100;

    const barEl = document.getElementById('creditoProgressBar');
    if (barEl) {
      barEl.style.width = `${Math.min(pct, 100)}%`;
      
      if (pct > 90) {
        barEl.className = 'progress-bar bg-danger';
      } else if (pct > 70) {
        barEl.className = 'progress-bar bg-warning';
      } else {
        barEl.className = 'progress-bar bg-success';
      }
    }

    const pctEl = document.getElementById('creditoPct');
    if (pctEl) {
      pctEl.textContent = `${pct.toFixed(1)}%`;
    }
  }

  function renderizarTabsMeses() {
    const container = document.getElementById('monthTabs');
    if (!container) return;

    // Si no hay meses disponibles, cargar el mes actual
    if (mesesDisponibles.length === 0) {
      cargarMovimientosMes(currentMonth, currentYear);
      return;
    }

    container.innerHTML = mesesDisponibles.map(m => `
      <button class="btn ${m.mes === currentMonth && m.anio === currentYear ? 'btn-primary' : 'btn-outline-secondary'} btn-sm"
              data-mes="${m.mes}"
              data-anio="${m.anio}">
        ${m.nombreMes}
      </button>
    `).join('');

    // Event listeners
    container.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const mes = parseInt(btn.dataset.mes);
        const anio = parseInt(btn.dataset.anio);
        
        currentMonth = mes;
        currentYear = anio;
        
        // Actualizar botones activos
        container.querySelectorAll('button').forEach(b => {
          b.className = 'btn btn-outline-secondary btn-sm';
        });
        btn.className = 'btn btn-primary btn-sm';
        
        // Cargar movimientos
        cargarMovimientosMes(mes, anio);
      });
    });

    // Cargar movimientos del mes activo
    cargarMovimientosMes(currentMonth, currentYear);
  }

  function renderizarResumenPeriodo(saldos) {
    const saldoInicialEl = document.getElementById('saldoInicial');
    const totalCargosEl = document.getElementById('totalCargos');
    const totalAbonosEl = document.getElementById('totalAbonos');
    const saldoFinalEl = document.getElementById('saldoFinal');

    if (saldoInicialEl) saldoInicialEl.textContent = formatCurrency(saldos.saldoInicial);
    if (totalCargosEl) totalCargosEl.textContent = formatCurrency(saldos.totalCargos);
    if (totalAbonosEl) totalAbonosEl.textContent = formatCurrency(saldos.totalAbonos);
    if (saldoFinalEl) saldoFinalEl.textContent = formatCurrency(saldos.saldoFinal);
  }

  function renderizarMovimientos(movimientos) {
    const tbody = document.getElementById('movimientosTbody');
    const tabla = document.getElementById('tablaMovimientos');

    if (!movimientos || movimientos.length === 0) {
      mostrarVacio(true);
      return;
    }

    mostrarVacio(false);
    if (tabla) tabla.style.display = 'table';

    tbody.innerHTML = movimientos.map(mov => {
      const tipo = mov.tipo.toUpperCase();
      const esCargo = mov.cargo !== null;
      const esAbono = mov.abono !== null;
      const esAjuste = mov.ajuste !== null;
      
      return `
        <tr>
          <td>${formatFechaCorta(mov.fecha)}</td>
          <td>
            <span class="badge ${getBadgeClass(tipo)}">
              ${getTipoLabel(tipo)}
            </span>
          </td>
          <td class="text-truncate" style="max-width: 200px;" title="${mov.descripcion}">
            ${mov.descripcion || '-'}
          </td>
          <td class="text-end ${esCargo ? 'text-danger fw-bold' : ''}">
            ${esCargo ? formatCurrency(mov.cargo) : '-'}
          </td>
          <td class="text-end ${esAbono ? 'text-success fw-bold' : ''}">
            ${esAbono ? formatCurrency(mov.abono) : '-'}
          </td>
          <td class="text-end ${esAjuste ? 'text-secondary fw-bold' : ''}">
            ${esAjuste ? formatCurrency(mov.ajuste) : '-'}
          </td>
          <td class="text-end fw-bold text-primary">
            ${formatCurrency(mov.saldo)}
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderizarRemisionesPendientes(data) {
    const container = document.getElementById('remisionesPendientes');
    if (!container) return;

    const remisiones = data.remisiones || [];
    
    if (remisiones.length === 0) {
      container.innerHTML = `
        <div class="alert alert-success">
          <i class="bi bi-check-circle"></i>
          ¡Excelente! No tienes remisiones pendientes de pago.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>Remisión</th>
              <th>Pedido</th>
              <th>Fecha</th>
              <th class="text-end">Monto</th>
              <th class="text-end">Pagado</th>
              <th class="text-end">Pendiente</th>
              <th>Vencimiento</th>
            </tr>
          </thead>
          <tbody>
            ${remisiones.map(r => `
              <tr class="${r.estaVencido ? 'table-danger' : ''}">
                <td>
                  <strong>${r.remisionFolio}</strong>
                  ${r.estaVencido ? '<span class="badge bg-danger ms-2">Vencido</span>' : ''}
                </td>
                <td>#${r.pedidoId}</td>
                <td>${formatFechaCorta(r.remisionFecha)}</td>
                <td class="text-end">${formatCurrency(r.monto)}</td>
                <td class="text-end text-success">${formatCurrency(r.montoPagado)}</td>
                <td class="text-end fw-bold">${formatCurrency(r.saldoPendiente)}</td>
                <td>
                  ${r.fechaVencimiento ? formatFechaCorta(r.fechaVencimiento) : 'Sin vencimiento'}
                  ${r.diasAtraso > 0 ? `<br><small class="text-danger">${r.diasAtraso} días de atraso</small>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="table-secondary fw-bold">
              <td colspan="5" class="text-end">TOTAL PENDIENTE:</td>
              <td class="text-end">${formatCurrency(data.totales.total_pendiente)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // ─── Descarga de PDF ──────────────────────────────────────────────────────
  async function descargarPDF() {
    const btnPDF = document.getElementById('btnDescargarPDF');
    if (!btnPDF || !currentMonth || !currentYear) return;

    try {
      btnPDF.disabled = true;
      btnPDF.innerHTML = '<i class="bi bi-hourglass-split"></i> Generando...';

      const url = `/cliente/mi-estado-cuenta/pdf?mes=${currentMonth}&anio=${currentYear}`;
      
      const response = await fetch(API_BASE_URL + url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'X-Tenant-ID': localStorage.getItem('tenantId') || '1'
        }
      });

      if (!response.ok) {
        throw new Error('Error al generar el PDF');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `Mi_Estado_Cuenta_${currentYear}-${String(currentMonth).padStart(2, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      Swal.fire({
        icon: 'success',
        title: 'PDF Descargado',
        text: 'Tu estado de cuenta se descargó correctamente',
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
    const loader = document.getElementById('loadingMovimientos');
    const tabla = document.getElementById('tablaMovimientos');
    const vacio = document.getElementById('estadoVacio');

    if (loader) loader.style.display = mostrar ? 'block' : 'none';
    if (tabla) tabla.style.display = mostrar ? 'none' : 'table';
    if (vacio) vacio.style.display = 'none';
  }

  function mostrarVacio(mostrar) {
    const vacio = document.getElementById('estadoVacio');
    const tabla = document.getElementById('tablaMovimientos');
    const loader = document.getElementById('loadingMovimientos');

    if (vacio) vacio.style.display = mostrar ? 'block' : 'none';
    if (tabla) tabla.style.display = mostrar ? 'none' : 'table';
    if (loader) loader.style.display = 'none';
  }

  function getBadgeClass(tipo) {
    const classes = {
      'CARGO': 'bg-danger',
      'RESERVA': 'bg-warning',
      'AJUSTE': 'bg-secondary',
      'ABONO': 'bg-success',
      'PAGO': 'bg-success',
      'CREDITO': 'bg-info'
    };
    return classes[tipo] || 'bg-secondary';
  }

  function getTipoLabel(tipo) {
    const labels = {
      'CARGO': 'Cargo',
      'RESERVA': 'Reserva',
      'AJUSTE': 'Ajuste',
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

  function formatFechaCorta(fecha) {
    if (!fecha) return '-';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

})();
