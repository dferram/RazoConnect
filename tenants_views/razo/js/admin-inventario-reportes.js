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
        <span style="margin: 0 0.5rem; color: #D1D5DB;">|</span>
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

// Función para navegar a la página de detalle de sesión
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

    console.log(`🔄 [NAVEGACIÓN] Redirigiendo a detalle de sesión ${sesionId}`);
    window.location.href = `/admin-inventario-detalle.html?sesionId=${sesionId}`;
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

        const response = await fetch(`/api/admin/inventario/sesiones/${sesionId}/detalle`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Error al obtener datos de la sesión');
        }

        const data = await response.json();
        const { sesion, conteos } = data.data;

        if (!conteos || conteos.length === 0) {
            loadingAlert.close();
            Swal.fire({
                icon: 'warning',
                title: 'Sin datos',
                text: 'No hay datos para generar el PDF',
                confirmButtonColor: '#F97316'
            });
            return;
        }

        const validados = conteos.filter(c => c.estatus_fila === 'VALIDADO');
        const conflictos = conteos.filter(c => c.estatus_fila === 'CONFLICTO');
        const pendientes = conteos.filter(c => c.estatus_fila === 'PENDIENTE_B' || c.estatus_fila === 'PENDIENTE_A');

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

        const responsableNombre = `${sesion.admin_nombre || ''} ${sesion.admin_apellido || ''}`.trim() || 'Administrador';

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
            doc.text(`Sesión: ${nombreSesion}`, 148, 22, { align: 'center' });
            doc.text(`Generado: ${fechaGeneracion}`, 148, 28, { align: 'center' });
            
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.text(`Responsable: ${responsableNombre}`, 148, 33, { align: 'center' });
        };

        dibujarEncabezado(doc);

        let yPosition = 40;

        const crearTabla = (titulo, datos, colorFondo, colorTexto, incluirDiferencia = false, mostrarTotalPiezas = false) => {
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
            let totalPiezas = 0;

            const tableData = datos.map(item => {
                const categoria = item.categoria_nombre || '-';
                const medida = item.dimensiones || '-';
                const color = item.color_nombre || '-';
                const conteoA = item.conteo_a || 0;
                const conteoB = item.conteo_b || 0;
                const cantidad = item.cantidad_final || conteoA;
                const costo = parseFloat(item.costounitario) || 0;
                const precio = parseFloat(item.preciounitario) || 0;
                const diferencia = conteoA - conteoB;

                totalCosto += cantidad * costo;
                totalVenta += cantidad * precio;
                if (mostrarTotalPiezas) {
                    totalPiezas += cantidad;
                }

                if (incluirDiferencia) {
                    return [
                        item.sku || '-',
                        item.producto_nombre || '-',
                        categoria,
                        medida,
                        color,
                        conteoA,
                        conteoB,
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
                        conteoA,
                        conteoB,
                        cantidad
                    ];
                }
            });

            const headers = incluirDiferencia 
                ? [['SKU', 'Producto', 'Categoría', 'Medida', 'Color', 'Conteo 1', 'Conteo 2', 'Conteo Final', 'Diferencia']]
                : [['SKU', 'Producto', 'Categoría', 'Medida', 'Color', 'Conteo 1', 'Conteo 2', 'Conteo Final']];

            const columnStyles = incluirDiferencia
                ? {
                    0: { cellWidth: 22 },
                    1: { cellWidth: 45 },
                    2: { cellWidth: 28 },
                    3: { cellWidth: 20 },
                    4: { cellWidth: 20 },
                    5: { cellWidth: 20, halign: 'center' },
                    6: { cellWidth: 20, halign: 'center' },
                    7: { cellWidth: 20, halign: 'center' },
                    8: { cellWidth: 20, halign: 'center' }
                }
                : {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 50 },
                    2: { cellWidth: 30 },
                    3: { cellWidth: 22 },
                    4: { cellWidth: 22 },
                    5: { cellWidth: 22, halign: 'center' },
                    6: { cellWidth: 22, halign: 'center' },
                    7: { cellWidth: 22, halign: 'center' }
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

            yPosition += 10;
            
            if (yPosition > 175) {
                doc.addPage();
                dibujarEncabezado(doc);
                yPosition = 40;
            }
            
            const xDerecha = 210;
            const anchoBox = 75;
            const altoBox = mostrarTotalPiezas ? 32 : 24;
            
            doc.setDrawColor(249, 115, 22);
            doc.setLineWidth(0.5);
            doc.setFillColor(255, 247, 237);
            doc.roundedRect(xDerecha, yPosition, anchoBox, altoBox, 2, 2, 'FD');
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(249, 115, 22);
            doc.text('TOTALES', xDerecha + anchoBox / 2, yPosition + 5, { align: 'center' });
            
            doc.setDrawColor(230, 230, 230);
            doc.setLineWidth(0.3);
            doc.line(xDerecha + 3, yPosition + 7, xDerecha + anchoBox - 3, yPosition + 7);
            
            let lineY = yPosition + 12;
            
            if (mostrarTotalPiezas) {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(80, 80, 80);
                doc.text('Total Piezas:', xDerecha + 3, lineY);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);
                doc.text(`${totalPiezas.toLocaleString('es-MX')}`, xDerecha + anchoBox - 3, lineY, { align: 'right' });
                lineY += 6;
            }
            
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(80, 80, 80);
            doc.text('Costo Total:', xDerecha + 3, lineY);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(220, 38, 38);
            doc.text(`$${totalCosto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, xDerecha + anchoBox - 3, lineY, { align: 'right' });
            
            lineY += 6;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(80, 80, 80);
            doc.text('Venta Total:', xDerecha + 3, lineY);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(22, 163, 74);
            doc.text(`$${totalVenta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, xDerecha + anchoBox - 3, lineY, { align: 'right' });

            yPosition += altoBox + 5;

            return yPosition;
        };

        if (validados.length > 0) {
            yPosition = crearTabla(
                `Coincidencias (${validados.length} productos)`,
                validados,
                [34, 197, 94],
                [22, 163, 74],
                false,
                true
            );
        }

        if (yPosition > 160 && (conflictos.length > 0 || pendientes.length > 0)) {
            doc.addPage();
            dibujarEncabezado(doc);
            yPosition = 40;
        }

        if (conflictos.length > 0) {
            yPosition = crearTabla(
                `Discrepancias (${conflictos.length} productos)`,
                conflictos,
                [239, 68, 68],
                [220, 38, 38],
                true,
                false
            );
        }

        if (yPosition > 160 && pendientes.length > 0) {
            doc.addPage();
            dibujarEncabezado(doc);
            yPosition = 40;
        }

        if (pendientes.length > 0) {
            yPosition = crearTabla(
                `Pendiente 2do Conteo (${pendientes.length} productos)`,
                pendientes,
                [245, 158, 11],
                [217, 119, 6],
                false,
                false
            );
        }

        // RESUMEN FINANCIERO GENERAL
        if (validados.length > 0) {
            // Calculate grand totals from validated items only
            let granTotalPiezas = 0;
            let granTotalCosto = 0;
            let granTotalVenta = 0;

            validados.forEach(item => {
                const cantidad = item.cantidad_final || item.conteo_a || 0;
                const costo = parseFloat(item.costounitario) || 0;
                const precio = parseFloat(item.preciounitario) || 0;
                
                granTotalPiezas += cantidad;
                granTotalCosto += cantidad * costo;
                granTotalVenta += cantidad * precio;
            });

            const margen = granTotalVenta - granTotalCosto;

            // Check if we need a new page for the summary
            const summaryHeight = 50;
            if (yPosition + summaryHeight > 190) {
                doc.addPage();
                dibujarEncabezado(doc);
                yPosition = 40;
            }

            // Draw financial summary box
            const boxX = 10;
            const boxWidth = 120;
            const boxHeight = 45;

            doc.setFillColor(249, 115, 22);
            doc.rect(boxX, yPosition, boxWidth, 10, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('RESUMEN FINANCIERO', boxX + boxWidth / 2, yPosition + 7, { align: 'center' });

            doc.setTextColor(0, 0, 0);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');

            let detailY = yPosition + 15;
            doc.text('Total Piezas Validadas:', boxX + 5, detailY);
            doc.setFont('helvetica', 'normal');
            doc.text(`${granTotalPiezas.toLocaleString('es-MX')} pzas`, boxX + 80, detailY);

            detailY += 7;
            doc.setFont('helvetica', 'bold');
            doc.text('Valor Total de Costo:', boxX + 5, detailY);
            doc.setTextColor(220, 38, 38);
            doc.text(`$${granTotalCosto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, boxX + 80, detailY);

            detailY += 7;
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'bold');
            doc.text('Valor Total de Venta:', boxX + 5, detailY);
            doc.setTextColor(16, 185, 129);
            doc.text(`$${granTotalVenta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, boxX + 80, detailY);

            detailY += 7;
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'bold');
            doc.text('Margen:', boxX + 5, detailY);
            doc.setTextColor(margen >= 0 ? 16 : 220, margen >= 0 ? 185 : 38, margen >= 0 ? 129 : 38);
            doc.text(`$${margen.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, boxX + 80, detailY);

            yPosition += boxHeight + 5;
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
            text: error.message || 'No se pudo generar el reporte PDF. Intenta nuevamente.',
            confirmButtonColor: '#F97316'
        });
    }
}
