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
    const remisionesTable = document.getElementById('remisiones-table');
    const emptyRemisiones = document.getElementById('empty-remisiones');
    
    loadingSpinner.style.display = 'flex';
    if (remisionesTable) remisionesTable.style.display = 'none';
    if (emptyRemisiones) emptyRemisiones.style.display = 'none';

    try {
        const token = localStorage.getItem('razoconnect_admin_token');
        
        if (!token) {
            console.warn('No admin token found in localStorage');
            console.warn('Available localStorage keys:', Object.keys(localStorage));
            window.location.href = '/login.html?error=session_expired';
            return;
        }

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
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include'
        });

        if (response.status === 401) {
            console.error('401 Unauthorized - Token inválido o expirado');
            localStorage.removeItem('razoconnect_admin_token');
            localStorage.removeItem('razoconnect_admin');
            
            await Swal.fire({
                icon: 'warning',
                title: 'Sesión Expirada',
                text: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
                confirmButtonText: 'Ir al Login',
                allowOutsideClick: false
            });
            
            window.location.href = '/login.html?error=session_expired';
            return;
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Error al cargar remisiones');
        }

        const data = await response.json();
        renderizarTabla(data.remisiones);
        renderizarPaginacion(data.pagination);

    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'No se pudieron cargar las remisiones'
        });
        const emptyRemisiones = document.getElementById('empty-remisiones');
        if (emptyRemisiones) emptyRemisiones.style.display = 'block';
    } finally {
        loadingSpinner.style.display = 'none';
    }
}

function renderizarTabla(remisiones) {
    const tbody = document.getElementById('tabla-remisiones');
    const remisionesTable = document.getElementById('remisiones-table');
    const emptyRemisiones = document.getElementById('empty-remisiones');
    
    if (remisiones.length === 0) {
        if (remisionesTable) remisionesTable.style.display = 'none';
        if (emptyRemisiones) emptyRemisiones.style.display = 'block';
        return;
    }
    
    if (remisionesTable) remisionesTable.style.display = 'table';
    if (emptyRemisiones) emptyRemisiones.style.display = 'none';

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
                    <strong style="color: var(--razo-orange);">${remision.folio}</strong>
                </td>
                <td>
                    <span class="badge" style="background: var(--razo-gray-warm); color: white; padding: 0.25rem 0.75rem; border-radius: 0.5rem; font-size: 0.75rem;">PED-${remision.pedidoid}</span>
                </td>
                <td>
                    <div style="font-weight: 600;">${remision.cliente_nombre || ''} ${remision.cliente_apellido || ''}</div>
                    ${remision.agente_nombre ? `<div style="font-size: 0.875rem; color: var(--razo-gray-warm);">Agente: ${remision.agente_nombre}</div>` : ''}
                </td>
                <td>${fecha}</td>
                <td>
                    <strong style="color: #10b981;">$${parseFloat(remision.total_remision).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
                </td>
                <td>${estadoBadge}</td>
                <td>
                    <span style="background: #e0f2fe; color: #0369a1; padding: 0.25rem 0.75rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600;">${remision.total_items} items</span>
                </td>
                <td>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.875rem;" onclick="verDetalleRemision(${remision.remision_id})" title="Ver detalle">
                            <i class="bi bi-eye"></i>
                        </button>
                        ${remision.pdf_url ? `
                            <a href="${remision.pdf_url}" target="_blank" class="btn btn-success" style="padding: 0.5rem 1rem; font-size: 0.875rem; text-decoration: none;" title="Ver PDF">
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
        'BORRADOR': '<span class="pedido-estatus-badge" style="background: #6b7280; color: white;">Borrador</span>',
        'EMITIDA': '<span class="pedido-estatus-badge" style="background: #3b82f6; color: white;">Emitida</span>',
        'ENTREGADA': '<span class="pedido-estatus-badge" style="background: #10b981; color: white;">Entregada</span>',
        'CANCELADA': '<span class="pedido-estatus-badge" style="background: #ef4444; color: white;">Cancelada</span>'
    };
    return badges[estado] || `<span class="pedido-estatus-badge" style="background: #6b7280; color: white;">${estado}</span>`;
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
        html += `<li><a href="#" onclick="cambiarPagina(${pagination.page - 1}); return false;" style="padding: 0.5rem 1rem; background: white; border: 1px solid #d1d5db; border-radius: 0.5rem; text-decoration: none; color: var(--razo-orange);">Anterior</a></li>`;
    }

    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.pages, pagination.page + 2);

    for (let i = startPage; i <= endPage; i++) {
        const activeStyle = i === pagination.page ? 'background: var(--razo-orange); color: white; font-weight: 600;' : 'background: white; color: var(--razo-gray-warm);';
        html += `<li><a href="#" onclick="cambiarPagina(${i}); return false;" style="padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 0.5rem; text-decoration: none; ${activeStyle}">${i}</a></li>`;
    }

    if (pagination.page < pagination.pages) {
        html += `<li><a href="#" onclick="cambiarPagina(${pagination.page + 1}); return false;" style="padding: 0.5rem 1rem; background: white; border: 1px solid #d1d5db; border-radius: 0.5rem; text-decoration: none; color: var(--razo-orange);">Siguiente</a></li>`;
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
        const token = localStorage.getItem('razoconnect_admin_token');
        
        if (!token) {
            console.warn('No admin token found in localStorage');
            window.location.href = '/login.html?error=session_expired';
            return;
        }

        const response = await fetch(`/api/remisiones/${remisionId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include'
        });

        if (response.status === 401) {
            console.error('401 Unauthorized - Token inválido o expirado');
            localStorage.removeItem('razoconnect_admin_token');
            localStorage.removeItem('razoconnect_admin');
            modal.hide();
            
            await Swal.fire({
                icon: 'warning',
                title: 'Sesión Expirada',
                text: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
                confirmButtonText: 'Ir al Login',
                allowOutsideClick: false
            });
            
            window.location.href = '/login.html?error=session_expired';
            return;
        }

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

    const detallesHTML = remision.detalles.map(item => {
        const ronda = item.ronda_surtido || 1;
        const rondaBadge = ronda > 1 
            ? `<span class="badge bg-warning text-dark ms-2" title="Surtido en ronda ${ronda}">Ronda ${ronda}</span>`
            : `<span class="badge bg-success ms-2" title="Primera vez surtido">1ª vez</span>`;
        
        return `
            <tr>
                <td>
                    <strong>${item.sku}</strong>
                    ${rondaBadge}
                    <br>
                    <small class="text-muted">${item.producto_nombre} - ${item.variante_nombre}</small>
                </td>
                <td class="text-center">${item.cantidad_paquetes_surtidos}</td>
                <td class="text-center">${item.piezas_surtidas}</td>
                <td class="text-end">$${parseFloat(item.precio_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                <td class="text-end">
                    <strong>$${parseFloat(item.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
                </td>
            </tr>
        `;
    }).join('');

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
                            <strong>Nombre:</strong> ${remision.cliente_nombre || ''} ${remision.cliente_apellido || ''}
                        </div>
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
        const token = localStorage.getItem('razoconnect_admin_token');
        
        if (!token) {
            console.warn('No admin token found in localStorage');
            window.location.href = '/login.html?error=session_expired';
            return;
        }

        const response = await fetch(`/api/remisiones/${currentRemisionId}/cancelar`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include',
            body: JSON.stringify({ motivo })
        });

        if (response.status === 401) {
            console.error('401 Unauthorized - Token inválido o expirado');
            localStorage.removeItem('razoconnect_admin_token');
            localStorage.removeItem('razoconnect_admin');
            
            await Swal.fire({
                icon: 'warning',
                title: 'Sesión Expirada',
                text: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
                confirmButtonText: 'Ir al Login',
                allowOutsideClick: false
            });
            
            window.location.href = '/login.html?error=session_expired';
            return;
        }

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
        const token = localStorage.getItem('razoconnect_admin_token');
        
        if (!token) {
            console.warn('No admin token found in localStorage');
            window.location.href = '/login.html?error=session_expired';
            return;
        }

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
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include'
        });

        if (response.status === 401) {
            console.error('401 Unauthorized - Token inválido o expirado');
            localStorage.removeItem('razoconnect_admin_token');
            localStorage.removeItem('razoconnect_admin');
            
            await Swal.fire({
                icon: 'warning',
                title: 'Sesión Expirada',
                text: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
                confirmButtonText: 'Ir al Login',
                allowOutsideClick: false
            });
            
            window.location.href = '/login.html?error=session_expired';
            return;
        }

        if (!response.ok) {
            throw new Error('Error al exportar');
        }

        const data = await response.json();
        
        const csvContent = [
            ['Folio', 'Pedido', 'Cliente', 'Fecha Emisión', 'Total', 'Estado', 'Items', 'Agente'],
            ...data.remisiones.map(r => [
                r.folio,
                `PED-${r.pedidoid}`,
                `${r.cliente_nombre || ''} ${r.cliente_apellido || ''}`.trim(),
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
