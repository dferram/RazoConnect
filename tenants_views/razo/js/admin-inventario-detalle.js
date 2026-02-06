let sesionId = null;
let sesionNombre = '';
let allCoincidencias = [];
let allDiscrepancias = [];
let allPendientes = [];
let filteredCoincidencias = [];
let filteredDiscrepancias = [];
let filteredPendientes = [];
let currentSortField = null;
let currentSortOrder = 'asc';

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

    allCoincidencias = conteos.filter(c => c.estatus_fila === 'VALIDADO');
    allDiscrepancias = conteos.filter(c => c.estatus_fila === 'CONFLICTO');
    allPendientes = conteos.filter(c => c.estatus_fila === 'PENDIENTE_B' || c.estatus_fila === 'PENDIENTE_A');
    
    filteredCoincidencias = [...allCoincidencias];
    filteredDiscrepancias = [...allDiscrepancias];
    filteredPendientes = [...allPendientes];

    document.getElementById('statTotal').textContent = conteos.length;
    document.getElementById('statCoincidencias').textContent = allCoincidencias.length;
    document.getElementById('statDiscrepancias').textContent = allDiscrepancias.length + allPendientes.length;

    renderizarTablaCoincidencias(filteredCoincidencias);
    renderizarTablaDiscrepancias(filteredDiscrepancias);
    renderizarTablaPendientes(filteredPendientes);
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

    let totalCosto = 0;
    let totalVenta = 0;

    coincidencias.forEach(item => {
        const cantidad = item.cantidad_final || 0;
        const costo = parseFloat(item.costounitario) || 0;
        const precio = parseFloat(item.preciounitario) || 0;
        
        totalCosto += cantidad * costo;
        totalVenta += cantidad * precio;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600; color: #333;">${item.sku || 'N/A'}</td>
            <td>${item.producto_nombre || 'Sin nombre'}</td>
            <td style="text-align: center;">${item.dimensiones || '-'}</td>
            <td style="text-align: center;">${item.color_nombre || '-'}</td>
            <td style="text-align: center; font-weight: 600;">${item.conteo_a || 0}</td>
            <td style="text-align: center; font-weight: 600;">${item.conteo_b || 0}</td>
            <td style="text-align: center; font-weight: 600; color: #10B981;">${cantidad}</td>
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

    const footerRow = document.createElement('tr');
    footerRow.style.background = '#F3F4F6';
    footerRow.style.fontWeight = '700';
    footerRow.innerHTML = `
        <td colspan="3" style="text-align: right; padding: 1rem; font-size: 1rem;">TOTALES FINANCIEROS:</td>
        <td colspan="2" style="padding: 1rem;">
            <div style="display: flex; gap: 1.5rem; justify-content: center;">
                <div>
                    <span style="color: #6B7280; font-size: 0.85rem;">Costo Total:</span>
                    <span style="color: #EF4444; font-size: 1.1rem; margin-left: 0.5rem;">$${totalCosto.toFixed(2)}</span>
                </div>
                <div>
                    <span style="color: #6B7280; font-size: 0.85rem;">Venta Total:</span>
                    <span style="color: #10B981; font-size: 1.1rem; margin-left: 0.5rem;">$${totalVenta.toFixed(2)}</span>
                </div>
            </div>
        </td>
    `;
    tbody.appendChild(footerRow);
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

    let totalCosto = 0;
    let totalVenta = 0;

    discrepancias.forEach(item => {
        const conteoA = item.conteo_a || 0;
        const conteoB = item.conteo_b || 0;
        const cantidad = item.cantidad_final || conteoA;
        const costo = parseFloat(item.costounitario) || 0;
        const precio = parseFloat(item.preciounitario) || 0;
        
        totalCosto += cantidad * costo;
        totalVenta += cantidad * precio;

        const diferencia = conteoA - conteoB;
        const diffText = diferencia > 0 ? `+${diferencia}` : String(diferencia);
        const diffColor = diferencia > 0 ? '#10B981' : '#EF4444';
        const diffBg = diferencia > 0 ? '#D1FAE5' : '#FEF2F2';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600; color: #333;">${item.sku || 'N/A'}</td>
            <td>${item.producto_nombre || 'Sin nombre'}</td>
            <td style="text-align: center;">${item.dimensiones || '-'}</td>
            <td style="text-align: center;">${item.color_nombre || '-'}</td>
            <td style="text-align: center; font-weight: 600;">${conteoA}</td>
            <td style="text-align: center; font-weight: 600;">${conteoB}</td>
            <td style="text-align: center; font-weight: 600; color: #F97316;">${cantidad}</td>
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

    const footerRow = document.createElement('tr');
    footerRow.style.background = '#FEF2F2';
    footerRow.style.fontWeight = '700';
    footerRow.innerHTML = `
        <td colspan="4" style="text-align: right; padding: 1rem; font-size: 1rem;">TOTALES FINANCIEROS:</td>
        <td colspan="2" style="padding: 1rem;">
            <div style="display: flex; gap: 1.5rem; justify-content: center;">
                <div>
                    <span style="color: #6B7280; font-size: 0.85rem;">Costo Total:</span>
                    <span style="color: #EF4444; font-size: 1.1rem; margin-left: 0.5rem;">$${totalCosto.toFixed(2)}</span>
                </div>
                <div>
                    <span style="color: #6B7280; font-size: 0.85rem;">Venta Total:</span>
                    <span style="color: #10B981; font-size: 1.1rem; margin-left: 0.5rem;">$${totalVenta.toFixed(2)}</span>
                </div>
            </div>
        </td>
    `;
    tbody.appendChild(footerRow);
}

function renderizarTablaPendientes(pendientes) {
    const tbody = document.getElementById('tbodyPendientes');
    const emptyDiv = document.getElementById('emptyPendientes');
    const tabla = document.getElementById('tablaPendientes');

    if (!tbody || !tabla) return;

    tbody.innerHTML = '';

    if (pendientes.length === 0) {
        if (tabla) tabla.style.display = 'none';
        if (emptyDiv) emptyDiv.style.display = 'flex';
        return;
    }

    tabla.style.display = 'table';
    if (emptyDiv) emptyDiv.style.display = 'none';

    let totalCosto = 0;
    let totalVenta = 0;

    pendientes.forEach(item => {
        const cantidad = item.conteo_a || 0;
        const costo = parseFloat(item.costounitario) || 0;
        const precio = parseFloat(item.preciounitario) || 0;
        
        totalCosto += cantidad * costo;
        totalVenta += cantidad * precio;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600; color: #333;">${item.sku || 'N/A'}</td>
            <td>${item.producto_nombre || 'Sin nombre'}</td>
            <td style="text-align: center;">${item.dimensiones || '-'}</td>
            <td style="text-align: center;">${item.color_nombre || '-'}</td>
            <td style="text-align: center; font-weight: 600; color: #F59E0B;">${cantidad}</td>
            <td style="text-align: center;">
                <span style="
                    display: inline-block;
                    padding: 0.25rem 0.75rem;
                    background: #FEF3C7;
                    color: #F59E0B;
                    border-radius: 0.5rem;
                    font-weight: 600;
                    font-size: 0.85rem;
                ">
                    <i class="bi bi-clock-fill"></i> Pendiente
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const footerRow = document.createElement('tr');
    footerRow.style.background = '#FEF3C7';
    footerRow.style.fontWeight = '700';
    footerRow.innerHTML = `
        <td colspan="3" style="text-align: right; padding: 1rem; font-size: 1rem;">TOTALES FINANCIEROS:</td>
        <td colspan="2" style="padding: 1rem;">
            <div style="display: flex; gap: 1.5rem; justify-content: center;">
                <div>
                    <span style="color: #6B7280; font-size: 0.85rem;">Costo Total:</span>
                    <span style="color: #EF4444; font-size: 1.1rem; margin-left: 0.5rem;">$${totalCosto.toFixed(2)}</span>
                </div>
                <div>
                    <span style="color: #6B7280; font-size: 0.85rem;">Venta Total:</span>
                    <span style="color: #10B981; font-size: 1.1rem; margin-left: 0.5rem;">$${totalVenta.toFixed(2)}</span>
                </div>
            </div>
        </td>
    `;
    tbody.appendChild(footerRow);
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

function sortData(data, field, order = 'asc') {
    return [...data].sort((a, b) => {
        let valA, valB;
        
        switch(field) {
            case 'categoria':
                valA = (a.categoria_nombre || '').toLowerCase();
                valB = (b.categoria_nombre || '').toLowerCase();
                break;
            case 'medida':
                valA = (a.dimensiones || '').toLowerCase();
                valB = (b.dimensiones || '').toLowerCase();
                break;
            case 'color':
                valA = (a.color_nombre || '').toLowerCase();
                valB = (b.color_nombre || '').toLowerCase();
                break;
            default:
                return 0;
        }
        
        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });
}

function aplicarOrdenamiento(field) {
    if (currentSortField === field) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortOrder = 'asc';
    }
    
    filteredCoincidencias = sortData(filteredCoincidencias, field, currentSortOrder);
    filteredDiscrepancias = sortData(filteredDiscrepancias, field, currentSortOrder);
    
    renderizarTablaCoincidencias(filteredCoincidencias);
    renderizarTablaDiscrepancias(filteredDiscrepancias);
    
    console.log(`✅ Ordenado por ${field} (${currentSortOrder})`);
}

async function descargarPDF() {
    if (!filteredCoincidencias && !filteredDiscrepancias) {
        Swal.fire({
            icon: 'warning',
            title: 'Sin datos',
            text: 'No hay datos para generar el PDF'
        });
        return;
    }

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
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'mm', 'a4');
        
        const fechaGeneracion = new Date().toLocaleDateString('es-MX', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        let logoImgData = null;
        try {
            const logoImg = new Image();
            logoImg.src = '/icon/Logo_Razo.png';
            
            await new Promise((resolve, reject) => {
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

        const responsableNombre = document.getElementById('infoResponsable')?.textContent || 'Administrador';

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
            doc.text('Reporte de Conteo de Inventario', 148, 15, { align: 'center' });
            
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.text(`Sesión: ${sesionNombre}`, 148, 22, { align: 'center' });
            doc.text(`Generado: ${fechaGeneracion}`, 148, 28, { align: 'center' });
            
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.text(`Responsable: ${responsableNombre}`, 148, 33, { align: 'center' });
        };

        dibujarEncabezado(doc);

        let yPosition = 40;

        const crearTabla = (titulo, datos, colorFondo, colorTexto, incluirDiferencia = false) => {
            if (datos.length === 0) {
                return yPosition;
            }

            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(colorTexto[0], colorTexto[1], colorTexto[2]);
            doc.text(titulo, 14, yPosition);
            yPosition += 2;

            let totalCosto = 0;
            let totalVenta = 0;

            const tableData = datos.map(item => {
                const cantidad = item.cantidad_final || 0;
                const costo = parseFloat(item.costounitario) || 0;
                const precio = parseFloat(item.preciounitario) || 0;
                
                totalCosto += cantidad * costo;
                totalVenta += cantidad * precio;

                const medida = item.dimensiones || '-';
                const color = item.color_nombre || '-';
                const categoria = item.categoria_nombre || '-';
                const stockTeorico = item.stock_teorico || 0;
                const diferencia = item.diferencia || 0;

                if (incluirDiferencia) {
                    return [
                        item.sku || '-',
                        item.producto_nombre || '-',
                        categoria,
                        medida,
                        color,
                        stockTeorico,
                        cantidad,
                        diferencia
                    ];
                } else {
                    return [
                        item.sku || '-',
                        item.producto_nombre || '-',
                        categoria,
                        medida,
                        color,
                        stockTeorico,
                        cantidad
                    ];
                }
            });

            const headers = incluirDiferencia 
                ? [['SKU', 'Producto', 'Categoría', 'Medida', 'Color', 'Stock Teórico', 'Conteo Final', 'Diferencia']]
                : [['SKU', 'Producto', 'Categoría', 'Medida', 'Color', 'Stock Teórico', 'Conteo Final']];

            const columnStyles = incluirDiferencia
                ? {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 50 },
                    2: { cellWidth: 30 },
                    3: { cellWidth: 25 },
                    4: { cellWidth: 25 },
                    5: { cellWidth: 25, halign: 'center' },
                    6: { cellWidth: 25, halign: 'center' },
                    7: { cellWidth: 25, halign: 'center' }
                }
                : {
                    0: { cellWidth: 30 },
                    1: { cellWidth: 60 },
                    2: { cellWidth: 35 },
                    3: { cellWidth: 25 },
                    4: { cellWidth: 25 },
                    5: { cellWidth: 25, halign: 'center' },
                    6: { cellWidth: 25, halign: 'center' }
                };

            const anchoTabla = incluirDiferencia ? 230 : 225;
            const anchoPagina = 297;
            const margenIzquierdo = (anchoPagina - anchoTabla) / 2;

            doc.autoTable({
                startY: yPosition,
                head: headers,
                body: tableData,
                theme: 'grid',
                headStyles: {
                    fillColor: colorFondo,
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 9,
                    halign: 'center'
                },
                bodyStyles: {
                    fontSize: 8,
                    cellPadding: 2
                },
                columnStyles: columnStyles,
                margin: { 
                    left: margenIzquierdo, 
                    right: margenIzquierdo,
                    top: 50
                },
                didDrawPage: (data) => {
                    if (data.pageNumber > 1) {
                        dibujarEncabezado(doc);
                    }
                    yPosition = data.cursor.y;
                }
            });

            yPosition += 3;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text('TOTALES FINANCIEROS:', margenIzquierdo, yPosition);
            
            yPosition += 5;
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(220, 38, 38);
            doc.text(`Costo Total: $${totalCosto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margenIzquierdo, yPosition);
            
            doc.setTextColor(22, 163, 74);
            doc.text(`Venta Total: $${totalVenta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margenIzquierdo + 70, yPosition);

            yPosition += 8;

            return yPosition;
        };

        if (filteredCoincidencias.length > 0) {
            yPosition = crearTabla(
                `✓ Coincidencias (${filteredCoincidencias.length} productos)`,
                filteredCoincidencias,
                [34, 197, 94],
                [22, 163, 74],
                false
            );
        }

        if (yPosition > 160 && filteredDiscrepancias.length > 0) {
            doc.addPage();
            dibujarEncabezado(doc);
            yPosition = 40;
        }

        if (filteredDiscrepancias.length > 0) {
            yPosition = crearTabla(
                `⚠ Discrepancias (${filteredDiscrepancias.length} productos)`,
                filteredDiscrepancias,
                [239, 68, 68],
                [220, 38, 38],
                true
            );
        }

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

        const fileName = `Reporte_Conteo_Sesion_${sesionId}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);

        loadingAlert.close();

        Swal.fire({
            icon: 'success',
            title: 'Reporte generado',
            text: 'El PDF se ha descargado correctamente',
            timer: 2000,
            showConfirmButton: false
        });
    } catch (error) {
        console.error('Error generando PDF:', error);
        loadingAlert.close();
        Swal.fire({
            icon: 'error',
            title: 'Error al generar PDF',
            text: error.message || 'No se pudo generar el reporte PDF'
        });
    }
}
