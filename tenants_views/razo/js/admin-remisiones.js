let currentPage = 1;
let currentFilters = {};
let currentRemisionId = null;

document.addEventListener('DOMContentLoaded', () => {
    cargarRemisiones();
    configurarEventos();
});

function configurarEventos() {
    document.getElementById('btn-buscar').addEventListener('click', () => {
        currentPage = 1;
        aplicarFiltros();
    });

    document.getElementById('btn-exportar').addEventListener('click', exportarExcel);

    const modalDetalle = document.getElementById('modalDetalleRemision');
    modalDetalle.addEventListener('hidden.bs.modal', () => {
        currentRemisionId = null;
        document.getElementById('btn-cancelar-remision').style.display = 'none';
    });

    document.getElementById('btn-cancelar-remision').addEventListener('click', cancelarRemision);
    document.getElementById('btn-imprimir-remision').addEventListener('click', imprimirRemision);
}

function aplicarFiltros() {
    currentFilters = {
        estado: document.getElementById('filtro-estado').value,
        fecha_desde: document.getElementById('filtro-fecha-desde').value,
        fecha_hasta: document.getElementById('filtro-fecha-hasta').value
    };
    cargarRemisiones();
}

async function cargarRemisiones() {
    const loadingSpinner = document.getElementById('loading-spinner');
    const tablaContainer = document.getElementById('tabla-container');
    
    loadingSpinner.style.display = 'block';
    tablaContainer.style.display = 'none';

    try {
        const params = new URLSearchParams({
            page: currentPage,
            limit: 50,
            ...currentFilters
        });

        Object.keys(currentFilters).forEach(key => {
            if (!currentFilters[key]) {
                params.delete(key);
            }
        });

        const response = await fetch(`/api/remisiones?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Error al cargar remisiones');
        }

        const data = await response.json();
        renderizarTabla(data.remisiones);
        renderizarPaginacion(data.pagination);

    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudieron cargar las remisiones'
        });
    } finally {
        loadingSpinner.style.display = 'none';
        tablaContainer.style.display = 'block';
    }
}

function renderizarTabla(remisiones) {
    const tbody = document.getElementById('tabla-remisiones');
    
    if (remisiones.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted py-4">
                    <i class="bi bi-inbox" style="font-size: 3rem; opacity: 0.3;"></i>
                    <p class="mt-2">No se encontraron remisiones</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = remisiones.map(remision => {
        const estadoBadge = obtenerBadgeEstado(remision.estado);
        const fecha = new Date(remision.fecha_emision).toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        return `
            <tr>
                <td>
                    <strong class="text-primary">${remision.folio}</strong>
                </td>
                <td>
                    <span class="badge bg-secondary">PED-${remision.pedidoid}</span>
                </td>
                <td>
                    <div>
                        <strong>${remision.cliente_razon_social || `${remision.cliente_nombre || ''} ${remision.cliente_apellido || ''}`.trim()}</strong>
                        ${remision.agente_nombre ? `<br><small class="text-muted">Agente: ${remision.agente_nombre}</small>` : ''}
                    </div>
                </td>
                <td>${fecha}</td>
                <td>
                    <strong class="text-success">$${parseFloat(remision.total_remision).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
                </td>
                <td>${estadoBadge}</td>
                <td>
                    <span class="badge bg-info">${remision.total_items} items</span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="verDetalleRemision(${remision.remision_id})" title="Ver detalle">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${remision.pdf_url ? `
                            <a href="${remision.pdf_url}" target="_blank" class="btn btn-outline-success" title="Ver PDF">
                                <i class="bi bi-file-pdf"></i>
                            </a>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function obtenerBadgeEstado(estado) {
    const badges = {
        'BORRADOR': '<span class="badge bg-secondary">Borrador</span>',
        'EMITIDA': '<span class="badge bg-primary">Emitida</span>',
        'ENTREGADA': '<span class="badge bg-success">Entregada</span>',
        'CANCELADA': '<span class="badge bg-danger">Cancelada</span>'
    };
    return badges[estado] || `<span class="badge bg-secondary">${estado}</span>`;
}

function renderizarPaginacion(pagination) {
    const infoDiv = document.getElementById('pagination-info');
    const controlsUl = document.getElementById('pagination-controls');

    const inicio = (pagination.page - 1) * pagination.limit + 1;
    const fin = Math.min(pagination.page * pagination.limit, pagination.total);
    
    infoDiv.textContent = `Mostrando ${inicio}-${fin} de ${pagination.total} remisiones`;

    if (pagination.pages <= 1) {
        controlsUl.innerHTML = '';
        return;
    }

    let html = '';

    if (pagination.page > 1) {
        html += `<li class="page-item"><a class="page-link" href="#" onclick="cambiarPagina(${pagination.page - 1}); return false;">Anterior</a></li>`;
    }

    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.pages, pagination.page + 2);

    for (let i = startPage; i <= endPage; i++) {
        const active = i === pagination.page ? 'active' : '';
        html += `<li class="page-item ${active}"><a class="page-link" href="#" onclick="cambiarPagina(${i}); return false;">${i}</a></li>`;
    }

    if (pagination.page < pagination.pages) {
        html += `<li class="page-item"><a class="page-link" href="#" onclick="cambiarPagina(${pagination.page + 1}); return false;">Siguiente</a></li>`;
    }

    controlsUl.innerHTML = html;
}

function cambiarPagina(page) {
    currentPage = page;
    cargarRemisiones();
}

async function verDetalleRemision(remisionId) {
    currentRemisionId = remisionId;
    const modal = new bootstrap.Modal(document.getElementById('modalDetalleRemision'));
    const contentDiv = document.getElementById('detalle-remision-content');
    
    contentDiv.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Cargando...</span>
            </div>
            <p class="mt-2 text-muted">Cargando detalle de remisión...</p>
        </div>
    `;
    
    modal.show();

    try {
        const response = await fetch(`/api/remisiones/${remisionId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Error al cargar detalle');
        }

        const remision = await response.json();
        renderizarDetalleRemision(remision);

        if (remision.estado === 'EMITIDA' || remision.estado === 'BORRADOR') {
            document.getElementById('btn-cancelar-remision').style.display = 'inline-block';
        }

    } catch (error) {
        console.error('Error:', error);
        contentDiv.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i>
                Error al cargar el detalle de la remisión
            </div>
        `;
    }
}

function renderizarDetalleRemision(remision) {
    const contentDiv = document.getElementById('detalle-remision-content');
    
    const fecha = new Date(remision.fecha_emision).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const detallesHTML = remision.detalles.map(item => `
        <tr>
            <td>
                <strong>${item.sku}</strong><br>
                <small class="text-muted">${item.producto_nombre} - ${item.variante_nombre}</small>
            </td>
            <td class="text-center">${item.cantidad_paquetes_surtidos}</td>
            <td class="text-center">${item.piezas_surtidas}</td>
            <td class="text-end">$${parseFloat(item.precio_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
            <td class="text-end">
                <strong>$${parseFloat(item.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
            </td>
        </tr>
    `).join('');

    contentDiv.innerHTML = `
        <div class="row mb-4">
            <div class="col-md-6">
                <div class="card border-0 bg-light">
                    <div class="card-body">
                        <h6 class="text-muted mb-3">Información General</h6>
                        <div class="mb-2">
                            <strong>Folio:</strong> 
                            <span class="text-primary fs-5">${remision.folio}</span>
                        </div>
                        <div class="mb-2">
                            <strong>Pedido:</strong> 
                            <span class="badge bg-secondary">PED-${remision.pedidoid}</span>
                        </div>
                        <div class="mb-2">
                            <strong>Fecha Emisión:</strong> ${fecha}
                        </div>
                        <div class="mb-2">
                            <strong>Estado:</strong> ${obtenerBadgeEstado(remision.estado)}
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card border-0 bg-light">
                    <div class="card-body">
                        <h6 class="text-muted mb-3">Cliente</h6>
                        <div class="mb-2">
                            <strong>Nombre:</strong> ${remision.cliente_razon_social || `${remision.cliente_nombre || ''} ${remision.cliente_apellido || ''}`.trim()}
                        </div>
                        ${remision.cliente_rfc ? `
                            <div class="mb-2">
                                <strong>RFC:</strong> ${remision.cliente_rfc}
                            </div>
                        ` : ''}
                        ${remision.agente_nombre ? `
                            <div class="mb-2">
                                <strong>Agente:</strong> ${remision.agente_nombre}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>

        ${remision.notas ? `
            <div class="alert alert-info mb-4">
                <strong><i class="bi bi-info-circle"></i> Notas:</strong><br>
                ${remision.notas}
            </div>
        ` : ''}

        <h6 class="mb-3">
            <i class="bi bi-box-seam"></i>
            Productos Surtidos
        </h6>
        <div class="table-responsive">
            <table class="table table-hover">
                <thead class="table-light">
                    <tr>
                        <th>Producto</th>
                        <th class="text-center">Paquetes</th>
                        <th class="text-center">Piezas</th>
                        <th class="text-end">Precio Unit.</th>
                        <th class="text-end">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${detallesHTML}
                </tbody>
                <tfoot class="table-light">
                    <tr>
                        <td colspan="4" class="text-end"><strong>TOTAL:</strong></td>
                        <td class="text-end">
                            <strong class="text-success fs-5">
                                $${parseFloat(remision.total_remision).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </strong>
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
}

async function cancelarRemision() {
    if (!currentRemisionId) return;

    const { value: motivo } = await Swal.fire({
        title: '¿Cancelar Remisión?',
        text: 'Esta acción revertirá las cantidades surtidas y eliminará el movimiento de CXC',
        input: 'textarea',
        inputLabel: 'Motivo de cancelación',
        inputPlaceholder: 'Escribe el motivo...',
        inputAttributes: {
            'aria-label': 'Motivo de cancelación'
        },
        showCancelButton: true,
        confirmButtonText: 'Sí, cancelar',
        cancelButtonText: 'No',
        confirmButtonColor: '#dc3545',
        inputValidator: (value) => {
            if (!value) {
                return 'Debes escribir un motivo';
            }
        }
    });

    if (!motivo) return;

    try {
        const response = await fetch(`/api/remisiones/${currentRemisionId}/cancelar`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            credentials: 'include',
            body: JSON.stringify({ motivo })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al cancelar remisión');
        }

        await Swal.fire({
            icon: 'success',
            title: 'Remisión Cancelada',
            text: 'La remisión ha sido cancelada exitosamente',
            timer: 2000,
            showConfirmButton: false
        });

        bootstrap.Modal.getInstance(document.getElementById('modalDetalleRemision')).hide();
        cargarRemisiones();

    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message
        });
    }
}

function imprimirRemision() {
    if (!currentRemisionId) return;
    window.print();
}

async function exportarExcel() {
    try {
        const params = new URLSearchParams({
            ...currentFilters,
            limit: 10000
        });

        Object.keys(currentFilters).forEach(key => {
            if (!currentFilters[key]) {
                params.delete(key);
            }
        });

        const response = await fetch(`/api/remisiones?${params.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Error al exportar');
        }

        const data = await response.json();
        
        const csvContent = [
            ['Folio', 'Pedido', 'Cliente', 'Fecha Emisión', 'Total', 'Estado', 'Items', 'Agente'],
            ...data.remisiones.map(r => [
                r.folio,
                `PED-${r.pedidoid}`,
                r.cliente_razon_social || `${r.cliente_nombre || ''} ${r.cliente_apellido || ''}`.trim(),
                new Date(r.fecha_emision).toLocaleDateString('es-MX'),
                parseFloat(r.total_remision).toFixed(2),
                r.estado,
                r.total_items,
                r.agente_nombre || ''
            ])
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `remisiones_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();

        Swal.fire({
            icon: 'success',
            title: 'Exportado',
            text: 'El archivo se ha descargado correctamente',
            timer: 2000,
            showConfirmButton: false
        });

    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo exportar el archivo'
        });
    }
}

window.verDetalleRemision = verDetalleRemision;
window.cambiarPagina = cambiarPagina;
