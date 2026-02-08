let devolucionesData = [];

document.addEventListener('DOMContentLoaded', () => {
    cargarDevoluciones();
});

async function cargarDevoluciones() {
    try {
        const response = await fetch('/api/cliente/devoluciones', {
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error('Error al cargar devoluciones');

        const data = await response.json();
        devolucionesData = data.devoluciones;
        renderizarLista();
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('lista-devoluciones').innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> Error al cargar las devoluciones
            </div>
        `;
    }
}

function renderizarLista() {
    const container = document.getElementById('lista-devoluciones');
    
    if (devolucionesData.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-inbox" style="font-size: 4rem; color: #ccc;"></i>
                <p class="text-muted mt-3">No tienes devoluciones registradas</p>
                <a href="dashboard.html" class="btn btn-primary mt-2">Ver Mis Pedidos</a>
            </div>
        `;
        return;
    }

    container.innerHTML = devolucionesData.map(dev => `
        <div class="card mb-3">
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-2">
                        <h5 class="mb-0">#${dev.devolucion_id}</h5>
                        <small class="text-muted">Pedido #${dev.pedido_id}</small>
                    </div>
                    <div class="col-md-2">
                        <small class="text-muted">Fecha</small>
                        <div>${formatearFecha(dev.fecha_solicitud)}</div>
                    </div>
                    <div class="col-md-2">
                        <small class="text-muted">Monto</small>
                        <div><strong>$${parseFloat(dev.monto_total).toFixed(2)}</strong></div>
                    </div>
                    <div class="col-md-2">
                        <small class="text-muted">Items</small>
                        <div>
                            <span class="badge bg-secondary">${dev.total_items}</span>
                            ${dev.total_evidencias > 0 ? `<i class="bi bi-camera-fill text-primary ms-1"></i>` : ''}
                        </div>
                    </div>
                    <div class="col-md-2">
                        ${getBadgeEstado(dev.estado)}
                    </div>
                    <div class="col-md-2 text-end">
                        <button class="btn btn-sm btn-outline-primary" onclick="verDetalle(${dev.devolucion_id})">
                            <i class="bi bi-eye"></i> Ver Detalle
                        </button>
                    </div>
                </div>
                ${dev.notas_admin ? `
                    <div class="alert alert-info mt-3 mb-0">
                        <strong>Nota del administrador:</strong> ${dev.notas_admin}
                    </div>
                ` : ''}
                ${dev.motivo_rechazo ? `
                    <div class="alert alert-danger mt-3 mb-0">
                        <strong>Motivo de rechazo:</strong> ${dev.motivo_rechazo}
                    </div>
                ` : ''}
            </div>
        </div>
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
        month: 'long',
        day: 'numeric'
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
        <div class="mb-4">
            <div class="row">
                <div class="col-6">
                    <strong>Estado:</strong> ${getBadgeEstado(devolucion.estado)}
                </div>
                <div class="col-6 text-end">
                    <strong>Monto Total:</strong> $${parseFloat(devolucion.monto_total).toFixed(2)}
                </div>
            </div>
            <div class="row mt-2">
                <div class="col-6">
                    <small class="text-muted">Fecha de Solicitud:</small><br>
                    ${formatearFecha(devolucion.fecha_solicitud)}
                </div>
                ${devolucion.fecha_resolucion ? `
                    <div class="col-6">
                        <small class="text-muted">Fecha de Resolución:</small><br>
                        ${formatearFecha(devolucion.fecha_resolucion)}
                    </div>
                ` : ''}
            </div>
        </div>

        ${devolucion.notas_cliente ? `
            <div class="alert alert-secondary">
                <strong>Tus notas:</strong><br>${devolucion.notas_cliente}
            </div>
        ` : ''}

        <h6 class="border-bottom pb-2 mb-3">Productos Devueltos</h6>
        <table class="table table-sm">
            <thead>
                <tr>
                    <th>Producto</th>
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
                            <div>
                                <div>${item.producto_nombre}</div>
                                <small class="text-muted">${item.sku}</small>
                            </div>
                        </td>
                        <td>${item.cantidad_paquetes} paquetes<br><small>(${item.piezas_totales} piezas)</small></td>
                        <td><span class="badge bg-secondary">${item.motivo}</span></td>
                        <td>${getCondicionBadge(item.condicion_producto)}</td>
                        <td><strong>$${parseFloat(item.subtotal).toFixed(2)}</strong></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        ${evidencias.length > 0 ? `
            <h6 class="border-bottom pb-2 mb-3 mt-4">Evidencias Fotográficas</h6>
            <div class="row">
                ${evidencias.map(ev => `
                    <div class="col-md-4 mb-3">
                        <img src="${ev.url_imagen}" class="img-fluid rounded" style="cursor: pointer;" onclick="window.open('${ev.url_imagen}', '_blank')">
                        ${ev.descripcion ? `<small class="text-muted d-block mt-1">${ev.descripcion}</small>` : ''}
                    </div>
                `).join('')}
            </div>
        ` : ''}

        ${devolucion.notas_admin ? `
            <div class="alert alert-info mt-3">
                <strong>Nota del administrador:</strong><br>${devolucion.notas_admin}
            </div>
        ` : ''}

        ${devolucion.motivo_rechazo ? `
            <div class="alert alert-danger mt-3">
                <strong>Motivo de rechazo:</strong><br>${devolucion.motivo_rechazo}
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
