let sesionId = null;
let sesionNombre = '';

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    sesionId = urlParams.get('sesionId');

    if (!sesionId) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se especificó una sesión de inventario',
            confirmButtonColor: '#F97316'
        }).then(() => {
            window.location.href = '/admin-inventario-reportes.html';
        });
        return;
    }

    cargarDetalleSesion();
    setupEventListeners();
});

function setupEventListeners() {
    const btnDescargarPDF = document.getElementById('btnDescargarPDF');
    btnDescargarPDF.addEventListener('click', descargarPDF);
}

async function cargarDetalleSesion() {
    const loadingDiv = document.getElementById('loadingDetalle');
    const contentDiv = document.getElementById('detalleContent');

    loadingDiv.style.display = 'flex';
    contentDiv.style.display = 'none';

    try {
        const token = localStorage.getItem('razoconnect_admin_token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        const response = await fetch(`/api/admin/inventario/sesiones/${sesionId}/detalle`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Error al cargar los detalles de la sesión');
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Error al cargar los detalles');
        }

        renderizarDetalle(data.data);

        loadingDiv.style.display = 'none';
        contentDiv.style.display = 'block';

    } catch (error) {
        console.error('Error al cargar detalle de sesión:', error);
        loadingDiv.style.display = 'none';

        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudieron cargar los detalles de la sesión',
            confirmButtonColor: '#F97316'
        }).then(() => {
            window.location.href = '/admin-inventario-reportes.html';
        });
    }
}

function renderizarDetalle(data) {
    const { sesion, conteos } = data;
    sesionNombre = sesion.nombre;

    document.getElementById('sesionTitulo').textContent = sesion.nombre;

    const formatoFecha = (fecha) => {
        if (!fecha) return '-';
        return new Date(fecha).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    document.getElementById('infoResponsable').textContent = 
        `${sesion.admin_nombre || ''} ${sesion.admin_apellido || ''}`.trim() || 'N/A';
    document.getElementById('infoFechaInicio').textContent = formatoFecha(sesion.fechainicio);
    document.getElementById('infoFechaCierre').textContent = formatoFecha(sesion.fechacierre);
    document.getElementById('infoEstado').innerHTML = getEstatusBadge(sesion.estatus);

    const coincidencias = conteos.filter(c => c.estatus_fila === 'VALIDADO' && c.diferencia === 0);
    const discrepancias = conteos.filter(c => c.estatus_fila === 'VALIDADO' && c.diferencia !== 0);

    document.getElementById('statTotal').textContent = conteos.length;
    document.getElementById('statCoincidencias').textContent = coincidencias.length;
    document.getElementById('statDiscrepancias').textContent = discrepancias.length;

    renderizarTablaCoincidencias(coincidencias);
    renderizarTablaDiscrepancias(discrepancias);
}

function renderizarTablaCoincidencias(coincidencias) {
    const tbody = document.getElementById('tbodyCoincidencias');
    const emptyDiv = document.getElementById('emptyCoincidencias');
    const tabla = document.getElementById('tablaCoincidencias');

    tbody.innerHTML = '';

    if (coincidencias.length === 0) {
        tabla.style.display = 'none';
        emptyDiv.style.display = 'flex';
        return;
    }

    tabla.style.display = 'table';
    emptyDiv.style.display = 'none';

    coincidencias.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600; color: #333;">${item.sku || 'N/A'}</td>
            <td>${item.producto_nombre || 'Sin nombre'}</td>
            <td style="text-align: center; font-weight: 600;">${item.stock_teorico || 0}</td>
            <td style="text-align: center; font-weight: 600; color: #10B981;">${item.cantidad_final || 0}</td>
            <td style="text-align: center;">
                <span style="
                    display: inline-block;
                    padding: 0.25rem 0.75rem;
                    background: #D1FAE5;
                    color: #10B981;
                    border-radius: 0.5rem;
                    font-weight: 600;
                    font-size: 0.85rem;
                ">
                    <i class="bi bi-check-circle-fill"></i> OK
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarTablaDiscrepancias(discrepancias) {
    const tbody = document.getElementById('tbodyDiscrepancias');
    const emptyDiv = document.getElementById('emptyDiscrepancias');
    const tabla = document.getElementById('tablaDiscrepancias');

    tbody.innerHTML = '';

    if (discrepancias.length === 0) {
        tabla.style.display = 'none';
        emptyDiv.style.display = 'flex';
        return;
    }

    tabla.style.display = 'table';
    emptyDiv.style.display = 'none';

    discrepancias.forEach(item => {
        const diferencia = item.diferencia || 0;
        const diffText = diferencia > 0 ? `+${diferencia}` : String(diferencia);
        const diffColor = diferencia > 0 ? '#10B981' : '#EF4444';
        const diffBg = diferencia > 0 ? '#D1FAE5' : '#FEF2F2';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600; color: #333;">${item.sku || 'N/A'}</td>
            <td>${item.producto_nombre || 'Sin nombre'}</td>
            <td style="text-align: center; font-weight: 600;">${item.stock_teorico || 0}</td>
            <td style="text-align: center; font-weight: 600; color: #F97316;">${item.cantidad_final || 0}</td>
            <td style="text-align: center;">
                <span style="
                    display: inline-block;
                    padding: 0.25rem 0.75rem;
                    background: ${diffBg};
                    color: ${diffColor};
                    border-radius: 0.5rem;
                    font-weight: 700;
                    font-size: 0.9rem;
                ">
                    ${diffText}
                </span>
            </td>
            <td style="text-align: center;">
                <span style="
                    display: inline-block;
                    padding: 0.25rem 0.75rem;
                    background: #FEF2F2;
                    color: #EF4444;
                    border-radius: 0.5rem;
                    font-weight: 600;
                    font-size: 0.85rem;
                ">
                    <i class="bi bi-exclamation-triangle-fill"></i> Ajuste
                </span>
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

async function descargarPDF() {
    const loadingAlert = Swal.fire({
        title: 'Generando reporte...',
        html: `
            <div style="text-align: center;">
                <div class="spinner" style="margin: 1rem auto;"></div>
                <p style="margin-top: 1rem; color: #666;">
                    Procesando datos de la sesión <strong>${sesionNombre}</strong>
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
