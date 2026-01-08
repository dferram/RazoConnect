// Estado global
const state = {
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 1,
    totalRecords: 0
};

// Cargar tabla con paginación
async function cargarTablaCxP(page = state.currentPage) {
    try {
        const response = await fetch(`/api/admin/cuentas-por-pagar?page=${page}&limit=${state.itemsPerPage}`);
        if (!response.ok) throw new Error('Error al cargar datos');
        
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Error del servidor');
        
        state.currentPage = data.currentPage;
        state.totalPages = data.totalPages;
        state.totalRecords = data.totalRecords;
        
        renderizarTabla(data.data);
        renderizarPaginacion();
        
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'No se pudieron cargar los datos.', 'error');
    }
}

// Renderizar tabla
function renderizarTabla(facturas) {
    const tbody = document.getElementById('cxpTbody');
    if (!tbody) return;
    
    tbody.innerHTML = facturas.map(factura => `
        <tr>
            <td>
                <div class="fw-semibold">${escapeHtml(factura.proveedor)}</div>
                <div class="text-muted small">${escapeHtml(factura.notas || '')}</div>
            </td>
            <td>${escapeHtml(factura.cxp_id)}</td>
            <td>${formatDate(factura.fecha_emision)}</td>
            <td>${formatDate(factura.fecha_vencimiento)}</td>
            <td class="text-end">${formatCurrency(factura.importe)}</td>
            <td class="text-end">${formatCurrency(factura.importe - (factura.abono || 0))}</td>
            <td>
                <span class="badge ${factura.estatus === 'PENDIENTE' ? 'bg-warning' : 'bg-info'}">
                    ${escapeHtml(factura.estatus)}
                </span>
            </td>
            <td class="text-center">
                <button class="btn btn-sm btn-primary" onclick="registrarPago(${factura.cxp_id})">
                    <i class="bi bi-cash"></i> Pagar
                </button>
            </td>
        </tr>
    `).join('');
    
    document.getElementById('resultadosBadge').textContent = 
        `${state.totalRecords} CUENTAS`;
}

// Renderizar paginación
function renderizarPaginacion() {
    const paginationEl = document.getElementById('pagination-controls');
    if (!paginationEl) return;

    let html = '';

    // Botón Anterior
    html += `<li class="page-item ${state.currentPage === 1 ? 'disabled' : ''}">
        <button class="page-link" ${state.currentPage === 1 ? 'disabled' : ''} onclick="cargarTablaCxP(${state.currentPage - 1})">
            <i class="bi bi-chevron-left"></i>
        </button>
    </li>`;

    // Números de página
    for (let i = 1; i <= state.totalPages; i++) {
        if (i === 1 || i === state.totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
            html += `<li class="page-item ${i === state.currentPage ? 'active' : ''}">
                <button class="page-link" onclick="cargarTablaCxP(${i})">${i}</button>
            </li>`;
        } else if (i === state.currentPage - 2 || i === state.currentPage + 2) {
            html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }

    // Botón Siguiente
    html += `<li class="page-item ${state.currentPage === state.totalPages ? 'disabled' : ''}">
        <button class="page-link" ${state.currentPage === state.totalPages ? 'disabled' : ''} onclick="cargarTablaCxP(${state.currentPage + 1})">
            <i class="bi bi-chevron-right"></i>
        </button>
    </li>`;

    paginationEl.innerHTML = html;
}

// Funciones auxiliares
function formatDate(date) {
    return new Date(date).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN'
    }).format(amount || 0);
}

function escapeHtml(str) {
    return (str || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    cargarTablaCxP();
});

// Evento de descarga de lote CxP
document.getElementById('btn-descargar-cxp')?.addEventListener('click', async () => {
    try {
        Swal.fire({
            title: 'Generando Lote de Pagos...',
            text: 'Por favor espera mientras procesamos los registros pendientes.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading() }
        });

        const response = await fetch('/api/admin/cxp/exportar', { method: 'GET' });

        if (response.status === 404) {
            Swal.fire('Sin Datos', 'No hay pagos pendientes de exportar.', 'info');
            return;
        }

        if (!response.ok) throw new Error('Error al generar reporte');

        // Descarga del archivo
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CXP_Pendientes_${new Date().toISOString().slice(0,10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Éxito y recarga
        Swal.fire({
            icon: 'success',
            title: 'Lote Generado',
            text: 'Los registros han sido archivados correctamente'
        }).then(() => {
            if (typeof cargarTablaCxP === 'function') {
                cargarTablaCxP(); // Recargar tabla si existe la función
            }
        });

    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'No se pudo generar el reporte.', 'error');
    }
});
