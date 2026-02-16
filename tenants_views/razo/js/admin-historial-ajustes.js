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
        mermas ? `${parseInt(mermas.total_unidades).toLocaleString()} unidades` : '0 unidades';
    
    document.getElementById('total-adiciones').textContent = 
        adiciones ? `${parseInt(adiciones.total_unidades).toLocaleString()} unidades` : '0 unidades';
    
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
                <td colspan="11" class="text-center text-danger py-4">
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
                <td colspan="11" class="text-center text-muted py-5">
                    <i class="bi bi-inbox fs-3"></i>
                    <p class="mt-2">No se encontraron movimientos con los filtros aplicados</p>
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
                <td><strong>#${m.movimiento_id}</strong></td>
                <td>
                    <small>
                        ${fecha.toLocaleDateString('es-MX')}<br>
                        ${fecha.toLocaleTimeString('es-MX')}
                    </small>
                </td>
                <td>${tipoBadge}</td>
                <td><code>${m.sku}</code></td>
                <td>
                    <div style="max-width: 200px;">
                        <strong>${m.nombreproducto}</strong><br>
                        <small class="text-muted">${m.dimensiones || 'N/A'}</small>
                    </div>
                </td>
                <td class="${impactoClass} fw-bold">${impacto}</td>
                <td>${m.stock_previo}</td>
                <td>${m.stock_posterior}</td>
                <td>
                    <small>${formatearMotivo(m.motivo)}</small>
                </td>
                <td>
                    <small>
                        ${m.admin_nombre}<br>
                        <span class="text-muted">${m.admin_email}</span>
                    </small>
                </td>
                <td>
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

    // Calcular totales
    let totalPiezasMerma = 0;
    let totalPiezasAdicion = 0;

    const datosExcel = movimientosData.map(m => {
        const fecha = new Date(m.fecha_movimiento);
        const cantidad = parseInt(m.cantidad, 10) || 0;
        
        if (m.tipo === 'MERMA') {
            totalPiezasMerma += cantidad;
        } else if (m.tipo === 'ADICION') {
            totalPiezasAdicion += cantidad;
        }
        
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

    // Agregar filas de totales
    const diferenciaNeta = totalPiezasAdicion - totalPiezasMerma;
    
    datosExcel.push({});
    datosExcel.push({
        'ID': '',
        'Fecha': '',
        'Hora': '',
        'Tipo': 'RESUMEN DE AJUSTES',
        'SKU': '',
        'Producto': '',
        'Dimensiones': '',
        'Cantidad': '',
        'Stock Previo': '',
        'Stock Posterior': '',
        'Impacto': '',
        'Motivo': '',
        'Observaciones': '',
        'Admin': '',
        'Email Admin': '',
        'IP Origen': ''
    });
    datosExcel.push({
        'ID': '',
        'Fecha': '',
        'Hora': '',
        'Tipo': 'Total Mermas',
        'SKU': '',
        'Producto': '',
        'Dimensiones': '',
        'Cantidad': totalPiezasMerma,
        'Stock Previo': '',
        'Stock Posterior': '',
        'Impacto': `-${totalPiezasMerma}`,
        'Motivo': '',
        'Observaciones': '',
        'Admin': '',
        'Email Admin': '',
        'IP Origen': ''
    });
    datosExcel.push({
        'ID': '',
        'Fecha': '',
        'Hora': '',
        'Tipo': 'Total Adiciones',
        'SKU': '',
        'Producto': '',
        'Dimensiones': '',
        'Cantidad': totalPiezasAdicion,
        'Stock Previo': '',
        'Stock Posterior': '',
        'Impacto': `+${totalPiezasAdicion}`,
        'Motivo': '',
        'Observaciones': '',
        'Admin': '',
        'Email Admin': '',
        'IP Origen': ''
    });
    datosExcel.push({
        'ID': '',
        'Fecha': '',
        'Hora': '',
        'Tipo': 'Diferencia Neta',
        'SKU': '',
        'Producto': '',
        'Dimensiones': '',
        'Cantidad': Math.abs(diferenciaNeta),
        'Stock Previo': '',
        'Stock Posterior': '',
        'Impacto': `${diferenciaNeta >= 0 ? '+' : ''}${diferenciaNeta}`,
        'Motivo': '',
        'Observaciones': '',
        'Admin': '',
        'Email Admin': '',
        'IP Origen': ''
    });

    const ws = XLSX.utils.json_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historial Ajustes');

    ws['!cols'] = [
        { wch: 8 },
        { wch: 12 },
        { wch: 10 },
        { wch: 10 },
        { wch: 15 },
        { wch: 30 },
        { wch: 15 },
        { wch: 10 },
        { wch: 12 },
        { wch: 12 },
        { wch: 10 },
        { wch: 25 },
        { wch: 30 },
        { wch: 20 },
        { wch: 25 },
        { wch: 15 }
    ];

    const fechaExport = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Historial_Ajustes_Inventario_${fechaExport}.xlsx`);

    Swal.fire({
        icon: 'success',
        title: 'Exportado',
        text: 'El archivo Excel se descargó correctamente',
        timer: 2000,
        showConfirmButton: false
    });
};

const exportarPDF = async () => {
    if (movimientosData.length === 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Sin Datos',
            text: 'No hay movimientos para exportar'
        });
        return;
    }

    const loadingAlert = Swal.fire({
        title: 'Generando PDF...',
        html: '<div class="spinner-border text-primary" role="status"></div>',
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'mm', 'a4');

        // Cargar logo
        let logoImgData = null;
        try {
            const logoImg = new Image();
            logoImg.src = '/icon/Logo_Razo.png';
            await new Promise((resolve) => {
                logoImg.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = logoImg.width;
                    canvas.height = logoImg.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(logoImg, 0, 0);
                    logoImgData = canvas.toDataURL('image/png');
                    resolve();
                };
                logoImg.onerror = () => resolve();
                setTimeout(() => resolve(), 2000);
            });
        } catch (error) {
            console.warn('Error al cargar logo:', error);
        }

        const fechaGeneracion = new Date().toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const dibujarEncabezado = (doc) => {
            if (logoImgData) {
                try {
                    doc.addImage(logoImgData, 'PNG', 14, 8, 20, 20);
                } catch (e) {
                    console.warn('Error al agregar logo:', e);
                }
            }

            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text('Historial de Ajustes de Inventario', 148, 15, { align: 'center' });
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Generado: ${fechaGeneracion}`, 148, 22, { align: 'center' });
        };

        dibujarEncabezado(doc);

        let yPosition = 30;

        // Separar movimientos por tipo
        const mermas = movimientosData.filter(m => m.tipo === 'MERMA');
        const adiciones = movimientosData.filter(m => m.tipo === 'ADICION');

        // Calcular totales
        let totalPiezasMerma = 0;
        let totalPiezasAdicion = 0;

        const crearTabla = (titulo, datos, colorFondo, colorTexto) => {
            if (datos.length === 0) {
                return yPosition;
            }

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(colorTexto[0], colorTexto[1], colorTexto[2]);
            doc.text(titulo, 14, yPosition);
            yPosition += 2;

            const tableData = datos.map(m => {
                const fecha = new Date(m.fecha_movimiento);
                const cantidad = parseInt(m.cantidad, 10) || 0;
                
                if (m.tipo === 'MERMA') {
                    totalPiezasMerma += cantidad;
                } else {
                    totalPiezasAdicion += cantidad;
                }

                return [
                    `#${m.movimiento_id}`,
                    fecha.toLocaleDateString('es-MX'),
                    m.sku || '-',
                    m.nombreproducto || '-',
                    m.dimensiones || 'N/A',
                    cantidad,
                    m.stock_previo || 0,
                    m.stock_posterior || 0,
                    formatearMotivo(m.motivo),
                    m.admin_nombre || '-'
                ];
            });

            const headers = [['ID', 'Fecha', 'SKU', 'Producto', 'Medida', 'Cantidad', 'Stock Previo', 'Stock Post.', 'Motivo', 'Admin']];

            doc.autoTable({
                startY: yPosition,
                head: headers,
                body: tableData,
                theme: 'grid',
                headStyles: {
                    fillColor: colorFondo,
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8,
                    halign: 'center'
                },
                bodyStyles: {
                    fontSize: 7,
                    cellPadding: 1.5
                },
                columnStyles: {
                    0: { cellWidth: 12, halign: 'center' },
                    1: { cellWidth: 20, halign: 'center' },
                    2: { cellWidth: 20 },
                    3: { cellWidth: 50 },
                    4: { cellWidth: 25 },
                    5: { cellWidth: 18, halign: 'center' },
                    6: { cellWidth: 18, halign: 'center' },
                    7: { cellWidth: 18, halign: 'center' },
                    8: { cellWidth: 35 },
                    9: { cellWidth: 30 }
                },
                margin: { left: 14, right: 14, top: 35 },
                didDrawPage: (data) => {
                    if (data.pageNumber > 1) {
                        dibujarEncabezado(doc);
                    }
                    yPosition = data.cursor.y;
                }
            });

            yPosition += 5;
            return yPosition;
        };

        // Generar tablas
        if (mermas.length > 0) {
            yPosition = crearTabla(
                `Mermas (${mermas.length} movimientos)`,
                mermas,
                [239, 68, 68],
                [220, 38, 38]
            );
        }

        if (yPosition > 160 && adiciones.length > 0) {
            doc.addPage();
            dibujarEncabezado(doc);
            yPosition = 35;
        }

        if (adiciones.length > 0) {
            yPosition = crearTabla(
                `Adiciones (${adiciones.length} movimientos)`,
                adiciones,
                [34, 197, 94],
                [22, 163, 74]
            );
        }

        // RESUMEN FINANCIERO GENERAL
        const summaryHeight = 40;
        if (yPosition + summaryHeight > 190) {
            doc.addPage();
            dibujarEncabezado(doc);
            yPosition = 35;
        }

        const boxX = 10;
        const boxWidth = 120;
        const boxHeight = 38;

        doc.setFillColor(249, 115, 22);
        doc.rect(boxX, yPosition, boxWidth, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('RESUMEN DE AJUSTES', boxX + boxWidth / 2, yPosition + 7, { align: 'center' });

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');

        let detailY = yPosition + 15;
        doc.text('Total Piezas en Merma:', boxX + 5, detailY);
        doc.setTextColor(220, 38, 38);
        doc.text(`-${totalPiezasMerma.toLocaleString('es-MX')} pzas`, boxX + 80, detailY);

        detailY += 7;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.text('Total Piezas en Adición:', boxX + 5, detailY);
        doc.setTextColor(16, 185, 129);
        doc.text(`+${totalPiezasAdicion.toLocaleString('es-MX')} pzas`, boxX + 80, detailY);

        detailY += 7;
        const diferencia = totalPiezasAdicion - totalPiezasMerma;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.text('Diferencia Neta:', boxX + 5, detailY);
        doc.setTextColor(diferencia >= 0 ? 16 : 220, diferencia >= 0 ? 185 : 38, diferencia >= 0 ? 129 : 38);
        doc.text(`${diferencia >= 0 ? '+' : ''}${diferencia.toLocaleString('es-MX')} pzas`, boxX + 80, detailY);

        // Paginación
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(
                `RazoConnect - Página ${i} de ${pageCount}`,
                148,
                200,
                { align: 'center' }
            );
        }

        const fechaExport = new Date().toISOString().split('T')[0];
        doc.save(`Historial_Ajustes_Inventario_${fechaExport}.pdf`);

        loadingAlert.close();

        Swal.fire({
            icon: 'success',
            title: 'PDF Generado',
            text: 'El reporte se ha descargado correctamente',
            confirmButtonColor: '#F97316',
            timer: 3000
        });

    } catch (error) {
        console.error('Error al generar PDF:', error);
        loadingAlert.close();

        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'No se pudo generar el PDF. Intenta nuevamente.',
            confirmButtonColor: '#F97316'
        });
    }
};
