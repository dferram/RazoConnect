let currentPage = 1;
let totalPages = 1;
let currentSearch = '';

document.addEventListener('DOMContentLoaded', () => {
    cargarSesiones();
    setupEventListeners();
});

function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const btnBuscar = document.getElementById('btnBuscar');
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            realizarBusqueda();
        }
    });

    btnBuscar.addEventListener('click', realizarBusqueda);
    btnPrevPage.addEventListener('click', () => cambiarPagina(currentPage - 1));
    btnNextPage.addEventListener('click', () => cambiarPagina(currentPage + 1));
}

function realizarBusqueda() {
    currentSearch = document.getElementById('searchInput').value.trim();
    currentPage = 1;
    cargarSesiones();
}

function cambiarPagina(newPage) {
    if (newPage < 1 || newPage > totalPages) return;
    currentPage = newPage;
    cargarSesiones();
}

async function cargarSesiones() {
    const loadingDiv = document.getElementById('loadingSesiones');
    const tableDiv = document.getElementById('sesionesTable');
    const emptyDiv = document.getElementById('emptySesiones');
    const paginationDiv = document.getElementById('paginationContainer');

    loadingDiv.style.display = 'flex';
    tableDiv.style.display = 'none';
    emptyDiv.style.display = 'none';
    paginationDiv.style.display = 'none';

    try {
        const token = localStorage.getItem('razoconnect_admin_token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        const params = new URLSearchParams({
            page: currentPage,
            limit: 10,
            search: currentSearch
        });

        const response = await fetch(`/api/admin/inventario/sesiones?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Error al cargar sesiones');
        }

        const data = await response.json();

        loadingDiv.style.display = 'none';

        if (data.data.length === 0) {
            emptyDiv.style.display = 'flex';
            return;
        }

        renderizarTabla(data.data);
        actualizarPaginacion(data.pagination);

        tableDiv.style.display = 'table';
        paginationDiv.style.display = 'block';

    } catch (error) {
        console.error('Error al cargar sesiones:', error);
        loadingDiv.style.display = 'none';
        
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudieron cargar las sesiones de inventario',
            confirmButtonColor: '#F97316'
        });
    }
}

function renderizarTabla(sesiones) {
    const tbody = document.getElementById('sesionesTableBody');
    tbody.innerHTML = '';

    sesiones.forEach(sesion => {
        const tr = document.createElement('tr');

        const fechaInicio = new Date(sesion.fechainicio);
        const fechaCierre = sesion.fechacierre ? new Date(sesion.fechacierre) : null;

        const formatoFecha = (fecha) => {
            return fecha.toLocaleDateString('es-MX', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        const estatusBadge = getEstatusBadge(sesion.estatus);
        const estadisticas = getEstadisticasHTML(sesion);

        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--razo-orange);">#${sesion.sesionid}</td>
            <td>
                <div style="font-weight: 600; color: #333;">${sesion.nombre}</div>
                <div style="font-size: 0.85rem; color: #666; margin-top: 0.25rem;">
                    ${estadisticas}
                </div>
            </td>
            <td style="font-size: 0.9rem; color: #666;">
                ${formatoFecha(fechaInicio)}
            </td>
            <td style="font-size: 0.9rem; color: #666;">
                ${fechaCierre ? formatoFecha(fechaCierre) : '<span style="color: #999;">-</span>'}
            </td>
            <td>
                <div style="font-weight: 500; color: #333;">
                    ${sesion.admin_nombre || 'N/A'} ${sesion.admin_apellido || ''}
                </div>
                <div style="font-size: 0.85rem; color: #666; margin-top: 0.25rem;">
                    ${sesion.total_agentes || 0} agente(s) participaron
                </div>
            </td>
            <td style="text-align: center;">
                <span style="
                    display: inline-block;
                    padding: 0.25rem 0.75rem;
                    background: #F3F4F6;
                    border-radius: 0.5rem;
                    font-weight: 600;
                    color: #333;
                ">
                    ${sesion.total_productos || 0}
                </span>
            </td>
            <td>${estatusBadge}</td>
            <td style="text-align: center;">
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button
                        onclick="verDetalleSesion(${sesion.sesionid})"
                        style="
                            background: #3b82f6;
                            color: white;
                            border: none;
                            padding: 0.5rem 0.75rem;
                            border-radius: 0.5rem;
                            cursor: pointer;
                            font-size: 1.1rem;
                            transition: all 0.3s ease;
                        "
                        onmouseover="this.style.background='#2563eb'; this.style.transform='scale(1.1)'"
                        onmouseout="this.style.background='#3b82f6'; this.style.transform='scale(1)'"
                        title="Ver detalles de la sesión"
                    >
                        <i class="bi bi-eye-fill"></i>
                    </button>
                    <button
                        onclick="descargarReportePDF(${sesion.sesionid}, '${sesion.nombre}')"
                        style="
                            background: var(--razo-orange);
                            color: white;
                            border: none;
                            padding: 0.5rem 0.75rem;
                            border-radius: 0.5rem;
                            cursor: pointer;
                            font-size: 1.1rem;
                            transition: all 0.3s ease;
                        "
                        onmouseover="this.style.background='#ea580c'; this.style.transform='scale(1.1)'"
                        onmouseout="this.style.background='var(--razo-orange)'; this.style.transform='scale(1)'"
                        title="Descargar reporte PDF"
                    >
                        <i class="bi bi-file-earmark-pdf-fill"></i>
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function getEstatusBadge(estatus) {
    const badges = {
        'CERRADA': {
            color: '#3B82F6',
            bg: '#DBEAFE',
            text: 'Cerrada'
        },
        'APLICADA': {
            color: '#10B981',
            bg: '#D1FAE5',
            text: 'Aplicada'
        },
        'APLICADA_PARCIAL': {
            color: '#F59E0B',
            bg: '#FEF3C7',
            text: 'Aplicada Parcial'
        },
        'ABIERTA': {
            color: '#6B7280',
            bg: '#F3F4F6',
            text: 'Abierta'
        }
    };

    const badge = badges[estatus] || badges['ABIERTA'];

    return `
        <span style="
            display: inline-block;
            padding: 0.35rem 0.75rem;
            background: ${badge.bg};
            color: ${badge.color};
            border-radius: 0.5rem;
            font-weight: 600;
            font-size: 0.85rem;
        ">
            ${badge.text}
        </span>
    `;
}

function getEstadisticasHTML(sesion) {
    const coincidencias = parseInt(sesion.coincidencias) || 0;
    const discrepancias = parseInt(sesion.discrepancias) || 0;

    return `
        <span style="color: #10B981; font-weight: 600;">
            <i class="bi bi-check-circle-fill"></i> ${coincidencias} coincidencias
        </span>
        <span style="margin: 0 0.5rem; color: #D1D5DB;">•</span>
        <span style="color: #EF4444; font-weight: 600;">
            <i class="bi bi-exclamation-triangle-fill"></i> ${discrepancias} discrepancias
        </span>
    `;
}

function actualizarPaginacion(pagination) {
    currentPage = pagination.currentPage;
    totalPages = pagination.totalPages;

    const paginationInfo = document.getElementById('paginationInfo');
    const pageIndicator = document.getElementById('pageIndicator');
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');

    const inicio = (currentPage - 1) * pagination.limit + 1;
    const fin = Math.min(currentPage * pagination.limit, pagination.totalRecords);

    paginationInfo.textContent = `${inicio}-${fin} de ${pagination.totalRecords}`;
    pageIndicator.textContent = `Página ${currentPage} de ${totalPages}`;

    btnPrevPage.disabled = currentPage === 1;
    btnNextPage.disabled = currentPage === totalPages;

    btnPrevPage.style.opacity = currentPage === 1 ? '0.5' : '1';
    btnNextPage.style.opacity = currentPage === totalPages ? '0.5' : '1';
    btnPrevPage.style.cursor = currentPage === 1 ? 'not-allowed' : 'pointer';
    btnNextPage.style.cursor = currentPage === totalPages ? 'not-allowed' : 'pointer';
}

// MISIÓN 3: Función para navegar a la página de detalle de sesión
function verDetalleSesion(sesionId) {
    if (!sesionId) {
        console.error('❌ [NAVEGACIÓN] sesionId inválido:', sesionId);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'ID de sesión inválido',
            confirmButtonColor: '#F97316'
        });
        return;
    }

    // CRÍTICO: Verificar que el token de admin esté presente
    const token = localStorage.getItem('razoconnect_admin_token');
    if (!token) {
        console.error('❌ [AUTH] Token de admin no encontrado');
        Swal.fire({
            icon: 'warning',
            title: 'Sesión expirada',
            text: 'Tu sesión ha expirado. Serás redirigido al login.',
            confirmButtonColor: '#F97316'
        }).then(() => {
            window.location.href = '/login.html';
        });
        return;
    }

    // Navegar a la página de toma de inventario con el sesionId como parámetro
    console.log(`🔄 [NAVEGACIÓN] Redirigiendo a sesión ${sesionId}`);
    window.location.href = `/admin-toma-inventario.html?sesionId=${sesionId}`;
}

async function descargarReportePDF(sesionId, nombreSesion) {
    const loadingAlert = Swal.fire({
        title: 'Generando reporte...',
        html: `
            <div style="text-align: center;">
                <div class="spinner" style="margin: 1rem auto;"></div>
                <p style="margin-top: 1rem; color: #666;">
                    Procesando datos de la sesión <strong>${nombreSesion}</strong>
                </p>
            </div>
        `,
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const token = localStorage.getItem('razoconnect_admin_token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        const response = await fetch(`/api/admin/inventario/reporte/${sesionId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Error al generar el reporte');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Reporte_Inventario_${sesionId}_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        loadingAlert.close();

        Swal.fire({
            icon: 'success',
            title: 'Reporte generado',
            text: 'El reporte PDF se ha descargado correctamente',
            confirmButtonColor: '#F97316',
            timer: 3000
        });

    } catch (error) {
        console.error('Error al descargar reporte:', error);
        loadingAlert.close();

        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo generar el reporte PDF. Intenta nuevamente.',
            confirmButtonColor: '#F97316'
        });
    }
}
