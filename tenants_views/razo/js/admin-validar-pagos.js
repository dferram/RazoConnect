let pagosPendientes = [];
let pagoActual = null;

document.addEventListener('DOMContentLoaded', () => {
  cargarPagosPendientes();

  document.getElementById('btnRecargar')?.addEventListener('click', cargarPagosPendientes);
  document.getElementById('btnCerrarModal')?.addEventListener('click', cerrarModal);
  document.getElementById('btnCerrarModalFooter')?.addEventListener('click', cerrarModal);
  document.getElementById('btnAprobarModal')?.addEventListener('click', () => aprobarPago(pagoActual));
  document.getElementById('btnRechazarModal')?.addEventListener('click', () => rechazarPago(pagoActual));
});

async function cargarPagosPendientes() {
  const estadoCarga = document.getElementById('estadoCarga');
  const estadoVacio = document.getElementById('estadoVacio');
  const listaPagos = document.getElementById('listaPagos');
  const totalPagos = document.getElementById('totalPagos');

  try {
    estadoCarga.style.display = 'flex';
    estadoVacio.style.display = 'none';
    listaPagos.style.display = 'none';

    console.log('🔄 [Validar Pagos] Cargando pagos de clientes pendientes...');
    const response = await fetchWithAuth('/api/admin/pagos-clientes/pendientes');
    const data = await response.json();

    console.log('📥 [Validar Pagos] Respuesta recibida:', data);

    if (!response.ok) {
      throw new Error(data.message || 'Error al cargar pagos pendientes');
    }

    pagosPendientes = data.pagos || [];
    console.log('📊 [Validar Pagos] Total de pagos:', pagosPendientes.length);

    estadoCarga.style.display = 'none';

    if (pagosPendientes.length === 0) {
      estadoVacio.style.display = 'block';
      totalPagos.textContent = '0 pagos pendientes';
    } else {
      listaPagos.style.display = 'block';
      totalPagos.textContent = `${pagosPendientes.length} ${pagosPendientes.length === 1 ? 'pago pendiente' : 'pagos pendientes'}`;
      renderizarPagos();
    }

    actualizarUltimoRefresh();
  } catch (error) {
    console.error('Error al cargar pagos:', error);
    estadoCarga.style.display = 'none';
    
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || 'No se pudieron cargar los pagos pendientes',
      confirmButtonColor: '#F97316'
    });
  }
}

function renderizarPagos() {
  const listaPagos = document.getElementById('listaPagos');
  
  listaPagos.innerHTML = pagosPendientes.map(pago => {
    const fecha = new Date(pago.fecha_pago);
    const fechaFormateada = fecha.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const montoFormateado = new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(pago.monto);

    const saldoDeudorFormateado = pago.saldo_deudor 
      ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(pago.saldo_deudor)
      : '$0.00';

    return `
      <div class="payment-card" data-pago-id="${pago.pago_id}">
        <div class="payment-header">
          <div class="payment-info">
            <div class="payment-client">${pago.nombre} ${pago.apellido || ''}</div>
            <div class="payment-email">${pago.email || 'Sin email'} · Pago #${pago.pago_id}</div>
          </div>
          <div class="payment-amount">
            <div class="amount-label">Monto del Pago</div>
            <div class="amount-value">${montoFormateado}</div>
          </div>
        </div>

        <div class="payment-details">
          <div class="detail-item">
            <span class="detail-label">Fecha del pago</span>
            <span class="detail-value">${fechaFormateada}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Tipo de pago</span>
            <span class="detail-value">${pago.tipo_pago}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Saldo deudor actual</span>
            <span class="detail-value">${saldoDeudorFormateado}</span>
          </div>
          ${pago.referencia_bancaria ? `
          <div class="detail-item">
            <span class="detail-label">Referencia bancaria</span>
            <span class="detail-value">${pago.referencia_bancaria}</span>
          </div>
          ` : ''}
          ${pago.transaccion_id ? `
          <div class="detail-item">
            <span class="detail-label">ID Transacción</span>
            <span class="detail-value">${pago.transaccion_id}</span>
          </div>
          ` : ''}
        </div>

        <div class="payment-actions">
          ${pago.comprobante_url ? `
          <button 
            class="btn-view-receipt" 
            onclick="verComprobante(${pago.pago_id})"
          >
            <i class="bi bi-file-earmark-image"></i>
            Ver comprobante
          </button>
          ` : ''}
          <button 
            class="btn btn-danger" 
            onclick="rechazarPago(${pago.pago_id})"
            style="display: flex; align-items: center; gap: 0.5rem;"
          >
            <i class="bi bi-x-circle-fill"></i>
            Rechazar
          </button>
          <button 
            class="btn btn-success" 
            onclick="aprobarPago(${pago.pago_id})"
            style="display: flex; align-items: center; gap: 0.5rem;"
          >
            <i class="bi bi-check-circle-fill"></i>
            Aprobar
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function verComprobante(pagoId) {
  const pago = pagosPendientes.find(p => p.pago_id === pagoId);
  
  if (!pago) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se encontró el pago',
      confirmButtonColor: '#F97316'
    });
    return;
  }

  pagoActual = pagoId;

  const modal = document.getElementById('modalComprobante');
  const modalCliente = document.getElementById('modalCliente');
  const modalMonto = document.getElementById('modalMonto');
  const modalContenido = document.getElementById('modalContenido');

  modalCliente.textContent = `${pago.nombre} ${pago.apellido || ''} - Pago #${pago.pago_id}`;
  modalMonto.textContent = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(pago.monto);

  if (pago.comprobante_url) {
    modalContenido.innerHTML = `
      <div style="margin-bottom: 1rem;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; text-align: left;">
          <div>
            <div class="detail-label">Pago ID</div>
            <div class="detail-value">#${pago.pago_id}</div>
          </div>
          <div>
            <div class="detail-label">Fecha del pago</div>
            <div class="detail-value">${new Date(pago.fecha_pago).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
          <div>
            <div class="detail-label">Tipo de pago</div>
            <div class="detail-value">${pago.tipo_pago || 'Transferencia'}</div>
          </div>
          ${pago.referencia_bancaria ? `
          <div>
            <div class="detail-label">Referencia bancaria</div>
            <div class="detail-value">${pago.referencia_bancaria}</div>
          </div>
          ` : ''}
          ${pago.transaccion_id ? `
          <div>
            <div class="detail-label">ID de transacción</div>
            <div class="detail-value">${pago.transaccion_id}</div>
          </div>
          ` : ''}
        </div>
      </div>
      <div class="comprobante-frame">
        <img 
          src="${pago.comprobante_url}" 
          alt="Comprobante de pago" 
          class="receipt-image"
          onerror="this.onerror=null; this.src='/icon/image-error.png'; this.alt='Error al cargar imagen';"
        />
      </div>
    `;
  } else {
    modalContenido.innerHTML = `
      <div style="padding: 3rem; color: #6b7280;">
        <i class="bi bi-file-earmark-x" style="font-size: 3rem; color: #d1d5db;"></i>
        <p style="margin-top: 1rem; font-size: 1.125rem;">No hay comprobante adjunto</p>
      </div>
    `;
  }

  modal.style.display = 'flex';
}

function cerrarModal() {
  const modal = document.getElementById('modalComprobante');
  modal.style.display = 'none';
  pagoActual = null;
}

async function aprobarPago(pagoId) {
  const pago = pagosPendientes.find(p => p.pago_id === pagoId);
  
  if (!pago) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se encontró el pago',
      confirmButtonColor: '#F97316'
    });
    return;
  }

  const montoFormateado = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(pago.monto);

  const result = await Swal.fire({
    title: '¿Aprobar este pago?',
    html: `
      <div style="text-align: left; padding: 1rem;">
        <p style="margin-bottom: 0.5rem;"><strong>Pago:</strong> #${pago.pago_id}</p>
        <p style="margin-bottom: 0.5rem;"><strong>Cliente:</strong> ${pago.nombre} ${pago.apellido || ''}</p>
        <p style="margin-bottom: 0.5rem;"><strong>Monto:</strong> ${montoFormateado}</p>
        <hr style="margin: 1rem 0;">
        <p style="color: #6b7280; font-size: 0.875rem;">
          Al aprobar, el pago se aplicará al saldo deudor del cliente.
        </p>
      </div>
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#10b981',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Sí, aprobar',
    cancelButtonText: 'Cancelar'
  });

  if (!result.isConfirmed) return;

  try {
    Swal.fire({
      title: 'Procesando...',
      text: 'Aprobando el pago',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const response = await fetchWithAuth(`/api/admin/pagos-clientes/${pagoId}/aprobar`, {
      method: 'PUT'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error al aprobar el pago');
    }

    cerrarModal();

    await Swal.fire({
      icon: 'success',
      title: 'Pago aprobado',
      text: data.message || 'El pago ha sido aprobado exitosamente',
      confirmButtonColor: '#F97316'
    });

    cargarPagosPendientes();
  } catch (error) {
    console.error('Error al aprobar pago:', error);
    
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || 'No se pudo aprobar el pago',
      confirmButtonColor: '#F97316'
    });
  }
}

async function rechazarPago(pagoId) {
  const pago = pagosPendientes.find(p => p.pago_id === pagoId);
  
  if (!pago) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se encontró el pago',
      confirmButtonColor: '#F97316'
    });
    return;
  }

  const montoFormateado = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(pago.monto);

  const result = await Swal.fire({
    title: '¿Rechazar este pago?',
    html: `
      <div style="text-align: left; padding: 1rem;">
        <p style="margin-bottom: 0.5rem;"><strong>Pago:</strong> #${pago.pago_id}</p>
        <p style="margin-bottom: 0.5rem;"><strong>Cliente:</strong> ${pago.nombre} ${pago.apellido || ''}</p>
        <p style="margin-bottom: 0.5rem;"><strong>Monto:</strong> ${montoFormateado}</p>
        <hr style="margin: 1rem 0;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Motivo del rechazo:</label>
        <textarea 
          id="motivoRechazo" 
          class="swal2-textarea" 
          placeholder="Explica por qué se rechaza este pago..."
          style="width: 100%; min-height: 100px; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.5rem;"
        ></textarea>
      </div>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Sí, rechazar',
    cancelButtonText: 'Cancelar',
    preConfirm: () => {
      const motivo = document.getElementById('motivoRechazo').value.trim();
      if (!motivo) {
        Swal.showValidationMessage('Debes proporcionar un motivo de rechazo');
        return false;
      }
      return motivo;
    }
  });

  if (!result.isConfirmed) return;

  const motivo = result.value;

  try {
    Swal.fire({
      title: 'Procesando...',
      text: 'Rechazando el pago',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const response = await fetchWithAuth(`/api/admin/pagos-clientes/${pagoId}/rechazar`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ motivo })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error al rechazar el pago');
    }

    cerrarModal();

    await Swal.fire({
      icon: 'success',
      title: 'Pago rechazado',
      text: data.message || 'El pago ha sido rechazado',
      confirmButtonColor: '#F97316'
    });

    cargarPagosPendientes();
  } catch (error) {
    console.error('Error al rechazar pago:', error);
    
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || 'No se pudo rechazar el pago',
      confirmButtonColor: '#F97316'
    });
  }
}

function actualizarUltimoRefresh() {
  const ahora = new Date();
  const horaFormateada = ahora.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const elementoRefresh = document.getElementById('ultimoRefresh');
  if (elementoRefresh) {
    elementoRefresh.textContent = horaFormateada;
  }
}
