const API_BASE_URL = '/api/admin';

let movimientosData = [];
let paginaActual = 1;
const registrosPorPagina = 50;

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    cargarEstadisticas();
    cargarMotivos();
    cargarMovimientos();
});

const initEventListeners = () => {
    document.getElementById('form-filtros').addEventListener('submit', (e) => {
        e.preventDefault();
        paginaActual = 1;
        cargarMovimientos();
    });
    
    document.getElementById('btn-limpiar-filtros').addEventListener('click', limpiarFiltros);
    document.getElementById('btn-exportar-excel').addEventListener('click', exportarExcel);
    document.getElementById('btn-exportar-pdf').addEventListener('click', exportarPDF);
};

const cargarEstadisticas = async () => {
    try {
        const fechaInicio = document.getElementById('filtro-fecha-inicio').value;
        const fechaFin = document.getElementById('filtro-fecha-fin').value;
        
        let url = `${API_BASE_URL}/inventario/estadisticas-ajustes?`;
        if (fechaInicio) url += `fechaInicio=${fechaInicio}&`;
        if (fechaFin) url += `fechaFin=${fechaFin}&`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al cargar estadísticas');
        }

        renderizarEstadisticas(data.estadisticas);

    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
};

const renderizarEstadisticas = (stats) => {
    const mermas = stats.porTipo.find(t => t.tipo === 'MERMA');
    const adiciones = stats.porTipo.find(t => t.tipo === 'ADICION');
    
    document.getElementById('total-mermas').textContent = 
        mermas ? `${parseInt(mermas.total_unidades).toLocaleString()} pzas` : '0 pzas';
    
    document.getElementById('total-adiciones').textContent = 
        adiciones ? `${parseInt(adiciones.total_unidades).toLocaleString()} pzas` : '0 pzas';
    
    const totalAdmins = [...new Set([
        ...(mermas ? [parseInt(mermas.admins_involucrados)] : []),
        ...(adiciones ? [parseInt(adiciones.admins_involucrados)] : [])
    ])].reduce((a, b) => Math.max(a, b), 0);
    
    document.getElementById('total-admins').textContent = totalAdmins;
    
    const totalProductos = [...new Set([
        ...(mermas ? [parseInt(mermas.productos_afectados)] : []),
        ...(adiciones ? [parseInt(adiciones.productos_afectados)] : [])
    ])].reduce((a, b) => Math.max(a, b), 0);
    
    document.getElementById('total-productos').textContent = totalProductos;
};

const cargarMotivos = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/inventario/motivos-ajuste`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al cargar motivos');
        }

        const motivoSelect = document.getElementById('filtro-motivo');
        motivoSelect.innerHTML = '<option value="">Todos</option>';
        
        data.motivos.forEach(m => {
            const option = document.createElement('option');
            option.value = m.codigo;
            option.textContent = m.descripcion;
            motivoSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Error al cargar motivos:', error);
    }
};

const cargarMovimientos = async () => {
    try {
        const fechaInicio = document.getElementById('filtro-fecha-inicio').value;
        const fechaFin = document.getElementById('filtro-fecha-fin').value;
        const tipo = document.getElementById('filtro-tipo').value;
        const motivo = document.getElementById('filtro-motivo').value;
        const sku = document.getElementById('filtro-sku').value.trim();

        let url = `${API_BASE_URL}/inventario/movimientos?limite=${registrosPorPagina}&offset=${(paginaActual - 1) * registrosPorPagina}`;
        
        if (fechaInicio) url += `&fechaInicio=${fechaInicio}`;
        if (fechaFin) url += `&fechaFin=${fechaFin}`;
        if (tipo) url += `&tipo=${tipo}`;
        if (motivo) url += `&motivo=${motivo}`;
        if (sku) url += `&sku=${sku}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al cargar movimientos');
        }

        movimientosData = data.movimientos;
        renderizarTabla(data.movimientos);
        renderizarPaginacion(data.paginacion);
        
        document.getElementById('total-registros').textContent = 
            `${data.paginacion.total.toLocaleString()} registros`;

        cargarEstadisticas();

    } catch (error) {
        console.error('Error al cargar movimientos:', error);
        document.getElementById('tabla-movimientos').innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-danger py-4">
                    <i class="bi bi-exclamation-triangle fs-3"></i>
                    <p class="mt-2">Error al cargar el historial: ${error.message}</p>
                </td>
            </tr>
        `;
    }
};

const renderizarTabla = (movimientos) => {
    const tbody = document.getElementById('tabla-movimientos');
    
    if (movimientos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted py-5">
                    <i class="bi bi-inbox fs-3"></i>
                    <p class="mt-2">No se encontraron ajustes manuales con los filtros aplicados</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = movimientos.map(m => {
        const fecha = new Date(m.fecha_movimiento);
        const tipoBadge = m.tipo === 'MERMA' 
            ? '<span class="badge bg-danger">🔻 MERMA</span>'
            : '<span class="badge bg-success">🔺 ADICIÓN</span>';
        
        const impacto = m.tipo === 'MERMA' ? `-${m.cantidad}` : `+${m.cantidad}`;
        const impactoClass = m.tipo === 'MERMA' ? 'text-danger' : 'text-success';

        return `
            <tr>
                <td><small><strong>#${m.movimiento_id}</strong></small></td>
                <td>
                    <small>
                        ${fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })}<br>
                        ${fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </small>
                </td>
                <td>${tipoBadge}</td>
                <td><code style="font-size: 0.8rem;">${m.sku}</code></td>
                <td>
                    <div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" 
                         title="${m.nombreproducto}${m.dimensiones ? ' - ' + m.dimensiones : ''}">
                        <small><strong>${m.nombreproducto}</strong></small><br>
                        <small class="text-muted">${m.dimensiones || 'N/A'}</small>
                    </div>
                </td>
                <td class="${impactoClass} fw-bold text-center"><small>${impacto}</small></td>
                <td>
                    <small style="display: block; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" 
                           title="${formatearMotivo(m.motivo)}">
                        ${formatearMotivo(m.motivo)}
                    </small>
                </td>
                <td>
                    <small style="display: block; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" 
                           title="${m.admin_nombre}">
                        ${m.admin_nombre}
                    </small>
                </td>
                <td class="text-center">
                    <button class="btn btn-sm btn-outline-primary" onclick="verDetalle(${m.movimiento_id})" title="Ver detalles">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
};

const formatearMotivo = (codigo) => {
    const motivos = {
        'DANO_FISICO': 'Daño Físico',
        'ROBO': 'Robo/Extravío',
        'VENCIMIENTO': 'Vencimiento',
        'DEFECTO_CALIDAD': 'Defecto de Calidad',
        'MUESTRA_CLIENTE': 'Muestra a Cliente',
        'ERROR_CONTEO': 'Error de Conteo',
        'DEVOLUCION_PROVEEDOR': 'Devolución a Proveedor',
        'OTRO_MERMA': 'Otro (Merma)',
        'CORRECCION_CONTEO': 'Corrección de Conteo',
        'DEVOLUCION_CLIENTE': 'Devolución de Cliente',
        'RECUPERACION_DANO': 'Recuperación/Reparación',
        'AJUSTE_SISTEMA': 'Ajuste del Sistema',
        'INVENTARIO_INICIAL': 'Inventario Inicial',
        'OTRO_ADICION': 'Otro (Adición)'
    };
    
    return motivos[codigo] || codigo;
};

const renderizarPaginacion = (paginacion) => {
    const container = document.getElementById('paginacion-container');
    
    if (paginacion.paginas <= 1) {
        container.innerHTML = '';
        return;
    }

    const paginasTotales = paginacion.paginas;
    let html = '<ul class="pagination justify-content-center mb-0">';

    html += `
        <li class="page-item ${paginaActual === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="cambiarPagina(${paginaActual - 1}); return false;">
                <i class="bi bi-chevron-left"></i>
            </a>
        </li>
    `;

    const rango = 2;
    let inicio = Math.max(1, paginaActual - rango);
    let fin = Math.min(paginasTotales, paginaActual + rango);

    if (inicio > 1) {
        html += `<li class="page-item"><a class="page-link" href="#" onclick="cambiarPagina(1); return false;">1</a></li>`;
        if (inicio > 2) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }

    for (let i = inicio; i <= fin; i++) {
        html += `
            <li class="page-item ${i === paginaActual ? 'active' : ''}">
                <a class="page-link" href="#" onclick="cambiarPagina(${i}); return false;">${i}</a>
            </li>
        `;
    }

    if (fin < paginasTotales) {
        if (fin < paginasTotales - 1) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        html += `<li class="page-item"><a class="page-link" href="#" onclick="cambiarPagina(${paginasTotales}); return false;">${paginasTotales}</a></li>`;
    }

    html += `
        <li class="page-item ${paginaActual === paginasTotales ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="cambiarPagina(${paginaActual + 1}); return false;">
                <i class="bi bi-chevron-right"></i>
            </a>
        </li>
    `;

    html += '</ul>';
    container.innerHTML = html;
};

window.cambiarPagina = (pagina) => {
    paginaActual = pagina;
    cargarMovimientos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.verDetalle = (movimientoId) => {
    const movimiento = movimientosData.find(m => m.movimiento_id === movimientoId);
    
    if (!movimiento) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se encontró el movimiento'
        });
        return;
    }

    const fecha = new Date(movimiento.fecha_movimiento);
    const tipoBadge = movimiento.tipo === 'MERMA' 
        ? '<span class="badge bg-danger">🔻 MERMA</span>'
        : '<span class="badge bg-success">🔺 ADICIÓN</span>';

    const html = `
        <div class="row g-3">
            <div class="col-md-6">
                <strong>ID del Movimiento:</strong><br>
                <span class="badge bg-secondary">#${movimiento.movimiento_id}</span>
            </div>
            <div class="col-md-6">
                <strong>Tipo:</strong><br>
                ${tipoBadge}
            </div>
            <div class="col-md-6">
                <strong>Fecha y Hora:</strong><br>
                ${fecha.toLocaleDateString('es-MX', { dateStyle: 'full' })}<br>
                ${fecha.toLocaleTimeString('es-MX')}
            </div>
            <div class="col-md-6">
                <strong>Registrado por:</strong><br>
                ${movimiento.admin_nombre}<br>
                <small class="text-muted">${movimiento.admin_email}</small>
            </div>
            <div class="col-12"><hr></div>
            <div class="col-md-6">
                <strong>SKU:</strong><br>
                <code>${movimiento.sku}</code>
            </div>
            <div class="col-md-6">
                <strong>Producto:</strong><br>
                ${movimiento.nombreproducto}
            </div>
            <div class="col-md-12">
                <strong>Dimensiones:</strong><br>
                ${movimiento.dimensiones || 'N/A'}
            </div>
            <div class="col-12"><hr></div>
            <div class="col-md-4">
                <strong>Cantidad Ajustada:</strong><br>
                <span class="fs-4 ${movimiento.tipo === 'MERMA' ? 'text-danger' : 'text-success'}">
                    ${movimiento.tipo === 'MERMA' ? '-' : '+'}${movimiento.cantidad} unidades
                </span>
            </div>
            <div class="col-md-4">
                <strong>Stock Previo:</strong><br>
                <span class="fs-4">${movimiento.stock_previo}</span>
            </div>
            <div class="col-md-4">
                <strong>Stock Posterior:</strong><br>
                <span class="fs-4">${movimiento.stock_posterior}</span>
            </div>
            <div class="col-12"><hr></div>
            <div class="col-md-12">
                <strong>Motivo:</strong><br>
                ${formatearMotivo(movimiento.motivo)}
            </div>
            ${movimiento.observaciones ? `
                <div class="col-md-12">
                    <strong>Observaciones:</strong><br>
                    <div class="alert alert-secondary mb-0">
                        ${movimiento.observaciones}
                    </div>
                </div>
            ` : ''}
            ${movimiento.ip_origen ? `
                <div class="col-md-12">
                    <small class="text-muted">
                        <i class="bi bi-geo-alt"></i> IP de origen: ${movimiento.ip_origen}
                    </small>
                </div>
            ` : ''}
        </div>
    `;

    document.getElementById('modal-detalle-content').innerHTML = html;
    const modal = new bootstrap.Modal(document.getElementById('modal-detalle-movimiento'));
    modal.show();
};

const limpiarFiltros = () => {
    document.getElementById('form-filtros').reset();
    paginaActual = 1;
    cargarMovimientos();
};

const exportarExcel = () => {
    if (movimientosData.length === 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Sin Datos',
            text: 'No hay movimientos para exportar'
        });
        return;
    }

    const datosExcel = movimientosData.map(m => {
        const fecha = new Date(m.fecha_movimiento);
        
        return {
            'ID': m.movimiento_id,
            'Fecha': fecha.toLocaleDateString('es-MX'),
            'Hora': fecha.toLocaleTimeString('es-MX'),
            'Tipo': m.tipo,
            'SKU': m.sku,
            'Producto': m.nombreproducto,
            'Dimensiones': m.dimensiones || 'N/A',
            'Cantidad': m.cantidad,
            'Stock Previo': m.stock_previo,
            'Stock Posterior': m.stock_posterior,
            'Impacto': m.impacto_cantidad,
            'Motivo': formatearMotivo(m.motivo),
            'Observaciones': m.observaciones || '',
            'Admin': m.admin_nombre,
            'Email Admin': m.admin_email,
            'IP Origen': m.ip_origen || ''
        };
    });

    const ws = XLSX.utils.json_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ajustes Manuales');

    const fechaExport = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Historial_Ajustes_Manuales_${fechaExport}.xlsx`);

    Swal.fire({
        icon: 'success',
        title: 'Exportado',
        text: 'El archivo Excel se descargó correctamente',
        timer: 2000,
        showConfirmButton: false
    });
};

const exportarPDF = () => {
    Swal.fire({
        icon: 'info',
        title: 'Exportación a PDF',
        text: 'La exportación a PDF estará disponible próximamente',
        confirmButtonColor: '#F97316'
    });
};
