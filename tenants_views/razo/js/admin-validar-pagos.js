let pagosPendientes = [];
let pagosValidados = [];
let pagoActual = null;

document.addEventListener('DOMContentLoaded', () => {
  setupTabEvents();
  cargarTodosPagos();

  document.getElementById('btnRecargar')?.addEventListener('click', cargarTodosPagos);
  document.getElementById('btnCerrarModal')?.addEventListener('click', cerrarModal);
  document.getElementById('btnCerrarModalFooter')?.addEventListener('click', cerrarModal);

  // Cerrar modal al hacer click fuera
  document.getElementById('modalComprobante')?.addEventListener('click', (e) => {
    if (e.target.id === 'modalComprobante') cerrarModal();
  });
});

function setupTabEvents() {
  const tabButtons = document.querySelectorAll('.payment-tab-btn');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.style.color = '#6b7280');
      tabButtons.forEach(b => b.style.borderBottomColor = 'transparent');
      document.querySelectorAll('.payment-tab-content').forEach(c => c.style.display = 'none');

      btn.style.color = 'var(--razo-orange)';
      btn.style.borderBottomColor = 'var(--razo-orange)';

      const contentId = tabName === 'pendientes' ? 'listaPagosPendientes' : 'listaPagosValidados';
      document.getElementById(contentId).style.display = 'block';
    });
  });
}

async function cargarTodosPagos() {
  const loadingPagos = document.getElementById('loadingPagos');
  const emptyPagos = document.getElementById('emptyPagos');
  const pagosTable = document.getElementById('pagosTable');
  const totalPagos = document.getElementById('totalPagos');

  try {
    loadingPagos.style.display = 'flex';
    emptyPagos.style.display = 'none';
    pagosTable.style.display = 'none';

    console.log('🔄 [Validar Pagos] Cargando pagos de transferencia...');
    const response = await fetchWithAuth('/api/admin/pagos/pendientes');
    const data = await response.json();

    console.log('📥 [Validar Pagos] Respuesta:', data);

    if (!response.ok) {
      throw new Error(data.message || 'Error al cargar pagos');
    }

    const todosPagos = data.pagos || data.data || [];

    // Normalizar datos: El endpoint retorna pedidos, necesitamos mapearlos a formato pago
    const pagosNormalizados = todosPagos.map(p => ({
      pago_id: p.pedidoid,
      cliente_id: p.clienteid,
      nombre: p.nombre,
      apellido: p.apellido,
      email: p.email,
      monto: p.montototal,
      tipo_pago: p.metodo_pago || 'transferencia',
      comprobante_url: p.comprobante_url,
      referencia_bancaria: p.transaccion_id,
      transaccion_id: p.transaccion_id,
      fecha_pago: p.fechapedido,
      estatus: p.estatus === 'Pendiente' ? 'PENDIENTE' : p.estatus,
      saldo_pendiente: p.saldo_pendiente
    }));

    pagosPendientes = pagosNormalizados.filter(p =>
      p.estatus === 'PENDIENTE' || p.estatus === 'Pendiente'
    );
    pagosValidados = pagosNormalizados.filter(p =>
      p.estatus === 'Aprobado' || p.estatus === 'Cancelado' || p.estatus === 'Completado'
    );

    console.log('📊 Pendientes:', pagosPendientes.length, 'Validados:', pagosValidados.length);

    loadingPagos.style.display = 'none';

    if (pagosPendientes.length === 0 && pagosValidados.length === 0) {
      emptyPagos.style.display = 'block';
      totalPagos.textContent = '0 pagos';
    } else {
      pagosTable.style.display = 'table';
      renderizarPagosPendientes();
      renderizarPagosValidados();
      totalPagos.textContent = `${pagosPendientes.length} pendientes · ${pagosValidados.length} validados`;
    }

    actualizarUltimoRefresh();
  } catch (error) {
    console.error('❌ Error:', error);
    loadingPagos.style.display = 'none';

    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || 'No se pudieron cargar los pagos',
      confirmButtonColor: '#F97316'
    });
  }
}

function renderizarPagosPendientes() {
  const tbody = document.getElementById('pagosTableBody');
  const emptyMsg = document.getElementById('emptyPagos');
  const table = document.getElementById('pagosTable');

  if (pagosPendientes.length === 0) {
    table.style.display = 'none';
    emptyMsg.style.display = 'block';
    return;
  }

  table.style.display = 'table';
  emptyMsg.style.display = 'none';

  tbody.innerHTML = pagosPendientes.map(pago => crearFilaPago(pago, true)).join('');
}

function renderizarPagosValidados() {
  const tbody = document.getElementById('pagosValidadosTableBody');
  const emptyMsg = document.getElementById('emptyPagosValidados');
  const table = document.getElementById('pagosValidadosTable');
  const loadingDiv = document.getElementById('loadingPagosValidados');

  if (pagosValidados.length === 0) {
    table.style.display = 'none';
    emptyMsg.style.display = 'block';
    loadingDiv.style.display = 'none';
    return;
  }

  table.style.display = 'table';
  emptyMsg.style.display = 'none';
  loadingDiv.style.display = 'none';

  tbody.innerHTML = pagosValidados.map(pago => crearFilaPago(pago, false)).join('');
}

function crearFilaPago(pago, isPendiente) {
  const fecha = new Date(pago.fecha_pago);
  const fechaFormateada = fecha.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const montoFormateado = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(pago.monto);

  const statusBadge = pago.estatus === 'APROBADO'
    ? '<span style="background: #d1fae5; color: #065f46; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;">✓ Aprobado</span>'
    : pago.estatus === 'RECHAZADO'
      ? '<span style="background: #fee2e2; color: #991b1b; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;">✕ Rechazado</span>'
      : '<span style="background: #fef3c7; color: #92400e; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;">⏱ Pendiente</span>';

  const botonesAccion = isPendiente
    ? `
      <button onclick="rechazarPago(${pago.pago_id})" class="btn btn-sm btn-danger" title="Rechazar pago">
        <i class="bi bi-x-circle-fill"></i>
      </button>
      <button onclick="aprobarPago(${pago.pago_id})" class="btn btn-sm btn-success" title="Aprobar pago">
        <i class="bi bi-check-circle-fill"></i>
      </button>
    `
    : '';

  return `
    <tr>
      <td style="font-weight: 500;">${pago.nombre} ${pago.apellido || ''}<br><span style="font-size: 0.8rem; color: #6b7280;">${pago.email || 'Sin email'}</span></td>
      <td style="font-weight: 600; color: var(--razo-orange);">${montoFormateado}</td>
      <td>${fechaFormateada}</td>
      <td>${pago.tipo_pago || 'Transferencia'}</td>
      <td style="font-size: 0.85rem; color: #6b7280;">${pago.referencia_bancaria || '-'}</td>
      <td>${statusBadge}</td>
      <td style="display: flex; gap: 0.5rem;">
        ${pago.comprobante_url ? `<button onclick="verComprobante(${pago.pago_id})" class="btn btn-sm btn-outline-primary" title="Ver comprobante"><i class="bi bi-image"></i></button>` : ''}
        ${botonesAccion}
      </td>
    </tr>
  `;
}

function verComprobante(pagoId) {
  let pago = pagosPendientes.find(p => p.pago_id === pagoId);
  if (!pago) {
    pago = pagosValidados.find(p => p.pago_id === pagoId);
  }

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
  const detallesComprobante = document.getElementById('detallesComprobante');
  const comprobanteImagen = document.getElementById('comprobanteImagen');

  const fecha = new Date(pago.fecha_pago);
  const fechaFormateada = fecha.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const montoFormateado = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(pago.monto);

  modalCliente.textContent = `${pago.nombre} ${pago.apellido || ''} - Pago #${pago.pago_id}`;
  modalMonto.textContent = `Monto: ${montoFormateado}`;

  detallesComprobante.innerHTML = `
    <div>
      <div style="font-size: 0.75rem; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 0.25rem;">Pago ID</div>
      <div style="color: #111827; font-weight: 500;">#${pago.pago_id}</div>
    </div>
    <div>
      <div style="font-size: 0.75rem; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 0.25rem;">Fecha</div>
      <div style="color: #111827; font-weight: 500;">${fechaFormateada}</div>
    </div>
    <div>
      <div style="font-size: 0.75rem; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 0.25rem;">Tipo de pago</div>
      <div style="color: #111827; font-weight: 500;">${pago.tipo_pago || 'Transferencia'}</div>
    </div>
    ${pago.referencia_bancaria ? `
    <div>
      <div style="font-size: 0.75rem; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 0.25rem;">Referencia</div>
      <div style="color: #111827; font-weight: 500;">${pago.referencia_bancaria}</div>
    </div>
    ` : ''}
    ${pago.transaccion_id ? `
    <div>
      <div style="font-size: 0.75rem; text-transform: uppercase; color: #9ca3af; font-weight: 600; margin-bottom: 0.25rem;">ID Transacción</div>
      <div style="color: #111827; font-weight: 500;">${pago.transaccion_id}</div>
    </div>
    ` : ''}
  `;

  if (pago.comprobante_url) {
    comprobanteImagen.src = pago.comprobante_url;
  } else {
    comprobanteImagen.src = '/icon/image-error.png';
  }

  modal.style.display = 'flex';
}

function cerrarModal() {
  const modal = document.getElementById('modalComprobante');
  modal.style.display = 'none';
  pagoActual = null;
}

async function aprobarPago(pagoId) {
  let pago = pagosPendientes.find(p => p.pago_id === pagoId);

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

    const response = await fetchWithAuth(`/api/admin/pagos/${pagoId}/aprobar`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Error al aprobar el pago');
    }

    cerrarModal();

    await Swal.fire({
      icon: 'success',
      title: 'Pago aprobado',
      text: 'El pago ha sido aprobado exitosamente',
      confirmButtonColor: '#F97316'
    });

    cargarTodosPagos();
  } catch (error) {
    console.error('Error:', error);

    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || 'No se pudo aprobar el pago',
      confirmButtonColor: '#F97316'
    });
  }
}

async function rechazarPago(pagoId) {
  let pago = pagosPendientes.find(p => p.pago_id === pagoId);

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
          placeholder="Explica por qué se rechaza este pago..."
          style="width: 100%; min-height: 100px; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.5rem; font-family: inherit;"
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

    const response = await fetchWithAuth(`/api/admin/pagos/${pagoId}/rechazar`, {
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
      text: 'El pago ha sido rechazado',
      confirmButtonColor: '#F97316'
    });

    cargarTodosPagos();
  } catch (error) {
    console.error('Error:', error);

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
