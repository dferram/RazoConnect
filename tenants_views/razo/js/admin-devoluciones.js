let devolucionesData = [];
let estadisticas = {};

document.addEventListener('DOMContentLoaded', () => {
    cargarDevoluciones();
    
    document.getElementById('filtro-estado').addEventListener('change', filtrarDevoluciones);
});

async function cargarDevoluciones() {
    try {
        const response = await fetch('/api/admin/devoluciones', {
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error('Error al cargar devoluciones');

        const data = await response.json();
        devolucionesData = data.devoluciones;
        estadisticas = data.estadisticas;

        actualizarEstadisticas();
        renderizarTabla(devolucionesData);
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'No se pudieron cargar las devoluciones', 'error');
    }
}

function actualizarEstadisticas() {
    document.getElementById('stat-pendientes').textContent = estadisticas.pendientes || 0;
    document.getElementById('stat-revision').textContent = estadisticas.en_revision || 0;
    document.getElementById('stat-aprobadas').textContent = estadisticas.aprobadas || 0;
    document.getElementById('stat-rechazadas').textContent = estadisticas.rechazadas || 0;
}

function filtrarDevoluciones() {
    const estadoFiltro = document.getElementById('filtro-estado').value;
    
    const filtradas = estadoFiltro 
        ? devolucionesData.filter(d => d.estado === estadoFiltro)
        : devolucionesData;
    
    renderizarTabla(filtradas);
}

function renderizarTabla(devoluciones) {
    const tbody = document.getElementById('tabla-devoluciones');
    
    if (devoluciones.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No hay devoluciones</td></tr>';
        return;
    }

    tbody.innerHTML = devoluciones.map(dev => `
        <tr>
            <td><strong>#${dev.devolucion_id}</strong></td>
            <td>#${dev.pedido_id}</td>
            <td>
                <div>${dev.cliente_nombre}</div>
                <small class="text-muted">${dev.cliente_email}</small>
            </td>
            <td>${formatearFecha(dev.fecha_solicitud)}</td>
            <td><strong>$${parseFloat(dev.monto_total).toFixed(2)}</strong></td>
            <td>
                <span class="badge bg-secondary">${dev.total_items} items</span>
                ${dev.total_evidencias > 0 ? `<i class="bi bi-camera-fill text-primary ms-1" title="${dev.total_evidencias} fotos"></i>` : ''}
            </td>
            <td>${getBadgeEstado(dev.estado)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="verDetalle(${dev.devolucion_id})">
                    <i class="bi bi-eye"></i> Ver
                </button>
            </td>
        </tr>
    `).join('');
}

function getBadgeEstado(estado) {
    const badges = {
        'PENDIENTE': '<span class="badge bg-warning">Pendiente</span>',
        'EN_REVISION': '<span class="badge bg-info">En Revisión</span>',
        'APROBADA': '<span class="badge bg-success">Aprobada</span>',
        'RECHAZADA': '<span class="badge bg-danger">Rechazada</span>',
        'CANCELADA': '<span class="badge bg-secondary">Cancelada</span>'
    };
    return badges[estado] || estado;
}

function formatearFecha(fecha) {
    return new Date(fecha).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function verDetalle(devolucionId) {
    try {
        const response = await fetch(`/api/cliente/devoluciones/${devolucionId}`, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error('Error al cargar detalle');

        const data = await response.json();
        mostrarModalDetalle(data);
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'No se pudo cargar el detalle', 'error');
    }
}

function mostrarModalDetalle(data) {
    const { devolucion, items, evidencias } = data;
    
    const content = `
        <div class="row">
            <div class="col-md-6">
                <h6 class="border-bottom pb-2 mb-3">Información General</h6>
                <table class="table table-sm">
                    <tr><th>ID Devolución:</th><td>#${devolucion.devolucion_id}</td></tr>
                    <tr><th>Pedido:</th><td>#${devolucion.pedido_id}</td></tr>
                    <tr><th>Estado:</th><td>${getBadgeEstado(devolucion.estado)}</td></tr>
                    <tr><th>Monto Total:</th><td><strong>$${parseFloat(devolucion.monto_total).toFixed(2)}</strong></td></tr>
                    <tr><th>Fecha Solicitud:</th><td>${formatearFecha(devolucion.fecha_solicitud)}</td></tr>
                    ${devolucion.fecha_resolucion ? `<tr><th>Fecha Resolución:</th><td>${formatearFecha(devolucion.fecha_resolucion)}</td></tr>` : ''}
                    ${devolucion.admin_resolutor ? `<tr><th>Resuelto por:</th><td>${devolucion.admin_resolutor}</td></tr>` : ''}
                </table>
            </div>
            <div class="col-md-6">
                <h6 class="border-bottom pb-2 mb-3">Notas</h6>
                ${devolucion.notas_cliente ? `
                    <div class="alert alert-info">
                        <strong>Cliente:</strong><br>${devolucion.notas_cliente}
                    </div>
                ` : '<p class="text-muted">Sin notas del cliente</p>'}
                ${devolucion.notas_admin ? `
                    <div class="alert alert-secondary">
                        <strong>Admin:</strong><br>${devolucion.notas_admin}
                    </div>
                ` : ''}
                ${devolucion.motivo_rechazo ? `
                    <div class="alert alert-danger">
                        <strong>Motivo de Rechazo:</strong><br>${devolucion.motivo_rechazo}
                    </div>
                ` : ''}
            </div>
        </div>

        <h6 class="border-bottom pb-2 mb-3 mt-4">Items a Devolver</h6>
        <table class="table table-sm">
            <thead>
                <tr>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th>Cantidad</th>
                    <th>Motivo</th>
                    <th>Condición</th>
                    <th>Subtotal</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td>
                            ${item.imagen_url ? `<img src="${item.imagen_url}" style="width: 40px; height: 40px; object-fit: cover;" class="me-2">` : ''}
                            ${item.producto_nombre}
                        </td>
                        <td><code>${item.sku}</code></td>
                        <td>${item.cantidad_paquetes} paquetes (${item.piezas_totales} piezas)</td>
                        <td><span class="badge bg-secondary">${item.motivo}</span></td>
                        <td>${getCondicionBadge(item.condicion_producto)}</td>
                        <td><strong>$${parseFloat(item.subtotal).toFixed(2)}</strong></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        ${evidencias.length > 0 ? `
            <h6 class="border-bottom pb-2 mb-3 mt-4">Evidencias (${evidencias.length})</h6>
            <div class="row">
                ${evidencias.map(ev => `
                    <div class="col-md-3 mb-3">
                        <img src="${ev.url_imagen}" class="img-fluid rounded" style="cursor: pointer;" onclick="window.open('${ev.url_imagen}', '_blank')">
                        ${ev.descripcion ? `<small class="text-muted d-block mt-1">${ev.descripcion}</small>` : ''}
                    </div>
                `).join('')}
            </div>
        ` : '<p class="text-muted">Sin evidencias fotográficas</p>'}

        ${['PENDIENTE', 'EN_REVISION'].includes(devolucion.estado) ? `
            <div class="mt-4 pt-3 border-top">
                <h6 class="mb-3">Acciones de Resolución</h6>
                <div class="row">
                    <div class="col-md-6">
                        <button class="btn btn-success w-100" onclick="aprobarDevolucion(${devolucion.devolucion_id})">
                            <i class="bi bi-check-circle"></i> Aprobar Devolución
                        </button>
                    </div>
                    <div class="col-md-6">
                        <button class="btn btn-danger w-100" onclick="rechazarDevolucion(${devolucion.devolucion_id})">
                            <i class="bi bi-x-circle"></i> Rechazar Devolución
                        </button>
                    </div>
                </div>
            </div>
        ` : ''}
    `;

    document.getElementById('detalle-content').innerHTML = content;
    new bootstrap.Modal(document.getElementById('modalDetalle')).show();
}

function getCondicionBadge(condicion) {
    const badges = {
        'SELLADO': '<span class="badge bg-success">Sellado</span>',
        'ABIERTO': '<span class="badge bg-warning">Abierto</span>',
        'DANADO': '<span class="badge bg-danger">Dañado</span>'
    };
    return badges[condicion] || condicion;
}

async function aprobarDevolucion(devolucionId) {
    const { value: formValues } = await Swal.fire({
        title: 'Aprobar Devolución',
        html: `
            <div class="text-start">
                <label class="form-label">Notas administrativas (opcional)</label>
                <textarea id="notas-admin" class="form-control" rows="3" placeholder="Ej: Producto verificado, en buen estado"></textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Aprobar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#28a745',
        preConfirm: () => {
            return {
                notas_admin: document.getElementById('notas-admin').value
            };
        }
    });

    if (!formValues) return;

    try {
        const response = await fetch(`/api/admin/devoluciones/${devolucionId}/aprobar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formValues)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al aprobar');
        }

        Swal.fire({
            icon: 'success',
            title: 'Devolución Aprobada',
            text: 'Se ha procesado el reintegro de inventario y ajustes financieros',
            timer: 3000
        });

        bootstrap.Modal.getInstance(document.getElementById('modalDetalle')).hide();
        cargarDevoluciones();
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', error.message, 'error');
    }
}

async function rechazarDevolucion(devolucionId) {
    const { value: formValues } = await Swal.fire({
        title: 'Rechazar Devolución',
        html: `
            <div class="text-start">
                <label class="form-label">Motivo de rechazo <span class="text-danger">*</span></label>
                <textarea id="motivo-rechazo" class="form-control" rows="3" placeholder="Ej: Producto no cumple con las condiciones de devolución" required></textarea>
                <label class="form-label mt-3">Notas adicionales (opcional)</label>
                <textarea id="notas-admin" class="form-control" rows="2"></textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Rechazar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc3545',
        preConfirm: () => {
            const motivo = document.getElementById('motivo-rechazo').value.trim();
            if (!motivo) {
                Swal.showValidationMessage('Debes especificar un motivo de rechazo');
                return false;
            }
            return {
                motivo_rechazo: motivo,
                notas_admin: document.getElementById('notas-admin').value
            };
        }
    });

    if (!formValues) return;

    try {
        const response = await fetch(`/api/admin/devoluciones/${devolucionId}/rechazar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formValues)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al rechazar');
        }

        Swal.fire({
            icon: 'info',
            title: 'Devolución Rechazada',
            text: 'Se ha notificado al cliente',
            timer: 3000
        });

        bootstrap.Modal.getInstance(document.getElementById('modalDetalle')).hide();
        cargarDevoluciones();
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', error.message, 'error');
    }
}
