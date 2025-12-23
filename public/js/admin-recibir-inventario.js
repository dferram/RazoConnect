// Variables de paginación
let currentPage = 1;
const itemsPerPage = 10;

// Evento de exportación
document.getElementById('btn-exportar-entradas')?.addEventListener('click', async () => {
    try {
        Swal.fire({
            title: 'Generando Reporte...',
            text: 'Por favor espera mientras procesamos las entradas.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading() }
        });

        const response = await fetch('/api/admin/inventario/entradas/exportar', { 
            method: 'GET' 
        });

        if (response.status === 404) {
            Swal.fire('Sin Datos', 'No hay entradas pendientes de exportar.', 'info');
            return;
        }

        if (!response.ok) throw new Error('Error al generar reporte');

        // Descarga del archivo
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Entradas_Almacen_${new Date().toISOString().slice(0,10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        // Éxito y recarga
        Swal.fire({
            icon: 'success',
            title: 'Reporte Generado',
            text: 'Las entradas han sido exportadas correctamente'
        }).then(() => {
            loadOrdenes(1); // Recargar primera página
        });

    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'No se pudo generar el reporte.', 'error');
    }
});

// Modificar loadOrdenes para soportar paginación
async function loadOrdenes(page = 1) {
    currentPage = page;
    ocSelect.disabled = true;
    ocSelect.innerHTML = "<option value=\"\">Cargando órdenes…</option>";

    try {
        const resp = await apiCall(`/admin/inventario/ordenes-pendientes?page=${page}&limit=${itemsPerPage}`, {
            method: "GET"
        });

        if (!resp.ok) {
            throw new Error(resp.data?.message || "No se pudieron cargar órdenes");
        }

        state.ordenes = Array.isArray(resp.data?.data) ? resp.data.data : [];
        const total = resp.data?.total || 0;
        const totalPages = resp.data?.totalPaginas || 1;

        renderOrdenes(ocSearch.value);
        renderPagination(currentPage, totalPages, total);

    } catch (error) {
        ocSelect.disabled = true;
        ocSelect.innerHTML = "<option value=\"\">Error cargando OCs</option>";
        setEmpty(error.message || "No se pudieron cargar órdenes");
    }
}

// Renderizar controles de paginación
function renderPagination(currentPage, totalPages, totalItems) {
    const paginationDiv = document.getElementById('pagination-controls');
    if (!paginationDiv) return;

    let html = '<div class="pagination-info">Mostrando ';
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, totalItems);
    html += `${start}-${end} de ${totalItems}</div>`;
    
    html += '<div class="pagination-buttons">';
    
    // Botón Anterior
    html += `<button class="btn btn-sm ${currentPage === 1 ? 'btn-secondary disabled' : 'btn-primary'}" 
        ${currentPage === 1 ? 'disabled' : ''} onclick="loadOrdenes(${currentPage - 1})">
        <i class="bi bi-chevron-left"></i>
    </button>`;

    // Números de página
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-secondary'}" 
                onclick="loadOrdenes(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += '<span class="pagination-dots">...</span>';
        }
    }

    // Botón Siguiente
    html += `<button class="btn btn-sm ${currentPage === totalPages ? 'btn-secondary disabled' : 'btn-primary'}" 
        ${currentPage === totalPages ? 'disabled' : ''} onclick="loadOrdenes(${currentPage + 1})">
        <i class="bi bi-chevron-right"></i>
    </button>`;
    
    html += '</div>';
    
    paginationDiv.innerHTML = html;
}

// Estilos de paginación
const style = document.createElement('style');
style.textContent = `
    .pagination-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 1rem;
        padding: 1rem;
        background: white;
        border-radius: 0.5rem;
        border: 1px solid rgba(0,0,0,0.1);
    }
    .pagination-buttons {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }
    .pagination-info {
        color: #6b7280;
        font-size: 0.875rem;
    }
    .pagination-dots {
        color: #6b7280;
        margin: 0 0.25rem;
    }
    @media (max-width: 768px) {
        .pagination-controls {
            flex-direction: column;
            gap: 1rem;
        }
    }
`;
