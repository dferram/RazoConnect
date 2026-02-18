// Variables de paginación
let currentPage = 1;
const itemsPerPage = 10;

// Variables de control de exportación
let isExported = false;
let hasSessionData = false;

// NOTA: La alerta beforeunload fue removida para permitir que el admin
// salga y regrese libremente. La sesión se persiste automáticamente en localStorage.

// Función para obtener el siguiente folio sugerido
function getSuggestedFolio() {
    try {
        const lastFolio = localStorage.getItem('last_folio_recepcion');
        if (!lastFolio) return 'F-1';
        
        const match = lastFolio.match(/F-(\d+)/);
        if (match && match[1]) {
            const nextNumber = parseInt(match[1], 10) + 1;
            return `F-${nextNumber}`;
        }
        return 'F-1';
    } catch (e) {
        return 'F-1';
    }
}

// Función para guardar el último folio usado
function saveLastFolio(folio) {
    try {
        localStorage.setItem('last_folio_recepcion', folio);
    } catch (e) {
        console.error('Error guardando folio:', e);
    }
}

// Función para obtener la siguiente remisión sugerida
function getSuggestedRemision() {
    try {
        const lastRemision = localStorage.getItem('last_remision_code');
        if (!lastRemision) return '';
        
        // Detectar parte numérica final e incrementarla
        const match = lastRemision.match(/^(.*?)(\d+)$/);
        if (match) {
            const prefix = match[1]; // Ej: "REM-"
            const number = parseInt(match[2], 10) + 1; // Ej: 501
            return `${prefix}${number}`;
        }
        return lastRemision; // Fallback si no hay números
    } catch (e) {
        return '';
    }
}

// Función para guardar la última remisión usada
function saveLastRemision(codigo) {
    try {
        localStorage.setItem('last_remision_code', codigo);
    } catch (e) {
        console.error('Error guardando remisión:', e);
    }
}

// Función principal de exportación a Excel
async function exportarExcelEntrada() {
    if (!sesionRecepcion || sesionRecepcion.length === 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Sin Datos',
            text: 'No hay items en la sesión para exportar.',
            confirmButtonColor: '#F97316'
        });
        return;
    }

    if (!state.orden || !state.orden.ordenCompraId) {
        Swal.fire({
            icon: 'warning',
            title: 'Sin Orden',
            text: 'No hay una orden de compra seleccionada.',
            confirmButtonColor: '#F97316'
        });
        return;
    }

    const suggestedFolio = getSuggestedFolio();

    const { value: folio } = await Swal.fire({
        title: '📋 Folio de Entrada',
        html: `
            <div style="text-align: left;">
                <label for="swal-folio" style="display: block; font-weight: 700; margin-bottom: 0.5rem;">Número de Folio:</label>
                <input id="swal-folio" class="swal2-input" value="${suggestedFolio}" placeholder="Ej: F-100" style="margin: 0; width: 100%;" />
                <div style="margin-top: 0.5rem; padding: 0.75rem; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 0.375rem; font-size: 0.875rem;">
                    <strong>💡 Sugerencia:</strong> El siguiente folio consecutivo es <strong>${suggestedFolio}</strong>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Generar Excel',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#F97316',
        preConfirm: () => {
            const folioInput = document.getElementById('swal-folio')?.value?.trim();
            if (!folioInput) {
                Swal.showValidationMessage('El folio es obligatorio');
                return null;
            }
            return folioInput;
        }
    });

    if (!folio) return;

    try {
        Swal.fire({
            title: 'Generando Excel...',
            text: 'Por favor espera mientras se genera el archivo.',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Entrada Almacén');

        // Configurar anchos de columna según especificación
        worksheet.columns = [
            { key: 'A', width: 10 },   // Pedido
            { key: 'B', width: 18 },   // Código
            { key: 'C', width: 13.33 }, // Descripción parte 1
            { key: 'D', width: 13.33 }, // Descripción parte 2
            { key: 'E', width: 13.33 }, // Descripción parte 3
            { key: 'F', width: 12 },   // Cantidad
            { key: 'G', width: 15 },   // Precio Unitario
            { key: 'H', width: 15 }    // TOTAL
        ];

        // Cargar e insertar logo (dimensiones corregidas para mantener proporción)
        try {
            const logoResponse = await fetch('/icon/Logo_Razo.png');
            const logoBlob = await logoResponse.blob();
            const logoBuffer = await logoBlob.arrayBuffer();
            const imageId = workbook.addImage({
                buffer: logoBuffer,
                extension: 'png',
            });
            worksheet.addImage(imageId, {
                tl: { col: 0.1, row: 0.1 },
                ext: { width: 45, height: 45 },
                editAs: 'oneCell'
            });
        } catch (logoError) {
            console.warn('No se pudo cargar el logo:', logoError);
        }

        // Ajustar altura de filas para que el logo respire
        worksheet.getRow(1).height = 20;
        worksheet.getRow(2).height = 20;
        worksheet.getRow(3).height = 20;

        // ENCABEZADO - Fila 1: Título (B1:E1)
        worksheet.mergeCells('B1:E1');
        const titleCell = worksheet.getCell('B1');
        titleCell.value = 'ENTRADA DE ALMACEN';
        titleCell.font = { name: 'Arial', size: 16, bold: true };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(1).height = 30;

        // Fila 1: Etiqueta FOLIO (G1)
        const folioLabelCell = worksheet.getCell('G1');
        folioLabelCell.value = 'FOLIO';
        folioLabelCell.font = { name: 'Arial', size: 9, bold: true };
        folioLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

        // Fila 1: Valor del Folio (H1) - ROJO
        const folioCell = worksheet.getCell('H1');
        folioCell.value = folio;
        folioCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFF0000' } };
        folioCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Fila 2: Fecha
        const fechaLabelCell = worksheet.getCell('B2');
        fechaLabelCell.value = 'Fecha:';
        fechaLabelCell.font = { name: 'Arial', size: 10, bold: true };
        fechaLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

        const fechaValueCell = worksheet.getCell('C2');
        const today = new Date();
        fechaValueCell.value = today.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
        fechaValueCell.font = { name: 'Arial', size: 10 };
        fechaValueCell.alignment = { horizontal: 'left', vertical: 'middle' };
        worksheet.getRow(2).height = 20;

        // Fila 3: No. Cliente (ID Proveedor)
        const clienteLabelCell = worksheet.getCell('B3');
        clienteLabelCell.value = 'No. Cliente:';
        clienteLabelCell.font = { name: 'Arial', size: 10, bold: true };
        clienteLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

        const clienteValueCell = worksheet.getCell('C3');
        clienteValueCell.value = state.orden.proveedorId || 'N/A';
        clienteValueCell.font = { name: 'Arial', size: 10 };
        clienteValueCell.alignment = { horizontal: 'left', vertical: 'middle' };
        worksheet.getRow(3).height = 20;

        // Fila 4: Nombre (Proveedor)
        const nombreLabelCell = worksheet.getCell('B4');
        nombreLabelCell.value = 'Nombre:';
        nombreLabelCell.font = { name: 'Arial', size: 10, bold: true };
        nombreLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

        worksheet.mergeCells('C4:H4');
        const nombreValueCell = worksheet.getCell('C4');
        nombreValueCell.value = state.orden.proveedorNombre || 'N/A';
        nombreValueCell.font = { name: 'Arial', size: 10 };
        nombreValueCell.alignment = { horizontal: 'left', vertical: 'middle' };
        worksheet.getRow(4).height = 20;

        // Fila 5: Espacio
        worksheet.getRow(5).height = 10;

        // Fila 6: Encabezados de tabla
        const headerRow = worksheet.getRow(6);
        headerRow.height = 25;
        
        const headers = [
            { col: 'A', text: 'Pedido' },
            { col: 'B', text: 'Código' },
            { col: 'C', text: 'Descripción', merge: true },
            { col: 'F', text: 'Cantidad' },
            { col: 'G', text: 'Precio Unitario' },
            { col: 'H', text: 'TOTAL' }
        ];

        // Combinar celdas para Descripción (C6:E6)
        worksheet.mergeCells('C6:E6');

        // Aplicar estilos a encabezados
        headers.forEach(h => {
            const cell = worksheet.getCell(`${h.col}6`);
            cell.value = h.text;
            cell.font = { name: 'Arial', size: 11, bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFEEEEEE' }
            };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FF000000' } },
                left: { style: 'thin', color: { argb: 'FF000000' } },
                bottom: { style: 'thin', color: { argb: 'FF000000' } },
                right: { style: 'thin', color: { argb: 'FF000000' } }
            };
        });

        // MISIÓN 3: Datos de productos usando valores de sesión (input values)
        let currentRow = 7;
        let totalPiezasSesion = 0;
        let totalPaquetesSesion = 0;
        let totalMontoSesion = 0;

        for (const item of sesionRecepcion) {
            const row = worksheet.getRow(currentRow);
            row.height = 20;

            // Obtener cantidad de la sesión (lo que el usuario ingresó)
            const cantidadRecibida = parseInt(item.cantidad, 10) || 0;
            const piezasPorPaquete = parseInt(item.piezasPorPaquete || item.piezasporpaquete, 10) || 1;
            const costoUnitario = parseFloat(item.costoUnitario || item.costounitario || 0);
            const subtotal = cantidadRecibida * costoUnitario;
            const paquetes = Math.ceil(cantidadRecibida / piezasPorPaquete);

            // Acumular totales
            totalPiezasSesion += cantidadRecibida;
            totalPaquetesSesion += paquetes;
            totalMontoSesion += subtotal;

            // Pedido (ID Orden)
            const pedidoCell = worksheet.getCell(`A${currentRow}`);
            pedidoCell.value = state.orden.ordenCompraId || '';
            pedidoCell.alignment = { horizontal: 'center', vertical: 'middle' };
            pedidoCell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            // Código (SKU)
            const codigoCell = worksheet.getCell(`B${currentRow}`);
            codigoCell.value = item.sku || '';
            codigoCell.alignment = { horizontal: 'left', vertical: 'middle' };
            codigoCell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            // Descripción (combinada en C-E)
            worksheet.mergeCells(`C${currentRow}:E${currentRow}`);
            const descripcionCell = worksheet.getCell(`C${currentRow}`);
            descripcionCell.value = item.nombreProducto || '';
            descripcionCell.alignment = { horizontal: 'left', vertical: 'middle' };
            descripcionCell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            // Cantidad (piezas recibidas de la sesión)
            const cantidadCell = worksheet.getCell(`F${currentRow}`);
            cantidadCell.value = cantidadRecibida;
            cantidadCell.alignment = { horizontal: 'center', vertical: 'middle' };
            cantidadCell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            // Precio Unitario
            const precioCell = worksheet.getCell(`G${currentRow}`);
            precioCell.value = costoUnitario;
            precioCell.numFmt = '$#,##0.00';
            precioCell.alignment = { horizontal: 'right', vertical: 'middle' };
            precioCell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            // TOTAL (valor calculado, no fórmula)
            const totalCell = worksheet.getCell(`H${currentRow}`);
            totalCell.value = subtotal;
            totalCell.numFmt = '$#,##0.00';
            totalCell.alignment = { horizontal: 'right', vertical: 'middle' };
            totalCell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            currentRow++;
        }

        // MISIÓN 4: Agregar fila de TOTALES al final (solo una vez)
        const totalsRow = worksheet.getRow(currentRow);
        totalsRow.height = 35;

        // Combinar celdas A-E para etiqueta "TOTALES"
        worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
        const totalsLabelCell = worksheet.getCell(`A${currentRow}`);
        totalsLabelCell.value = 'TOTALES';
        totalsLabelCell.font = { name: 'Arial', size: 12, bold: true };
        totalsLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };
        totalsLabelCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' }
        };
        totalsLabelCell.border = {
            top: { style: 'medium', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'medium', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
        };

        // Total Piezas (columna F) - Mostrar piezas y paquetes
        const totalPiezasCell = worksheet.getCell(`F${currentRow}`);
        totalPiezasCell.value = `${totalPiezasSesion.toLocaleString('es-MX')} pzas\n(${totalPaquetesSesion.toLocaleString('es-MX')} paq)`;
        totalPiezasCell.font = { name: 'Arial', size: 11, bold: true };
        totalPiezasCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        totalPiezasCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' }
        };
        totalPiezasCell.border = {
            top: { style: 'medium', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'medium', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
        };

        // Celda vacía G (Precio Unitario)
        const emptyGCell = worksheet.getCell(`G${currentRow}`);
        emptyGCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' }
        };
        emptyGCell.border = {
            top: { style: 'medium', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'medium', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
        };

        // Total Monto (columna H)
        const totalMontoCell = worksheet.getCell(`H${currentRow}`);
        totalMontoCell.value = totalMontoSesion;
        totalMontoCell.numFmt = '$#,##0.00';
        totalMontoCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFF97316' } };
        totalMontoCell.alignment = { horizontal: 'right', vertical: 'middle' };
        totalMontoCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' }
        };
        totalMontoCell.border = {
            top: { style: 'medium', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'medium', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
        };

        // Generar archivo
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Entrada_Almacen_${folio}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        // Guardar folio y marcar como exportado
        saveLastFolio(folio);
        isExported = true;

        Swal.fire({
            icon: 'success',
            title: '✅ Excel Generado',
            text: `El comprobante de entrada ${folio} ha sido descargado exitosamente.`,
            confirmButtonColor: '#F97316'
        });

    } catch (error) {
        console.error('Error generando Excel:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo generar el archivo Excel. Por favor intenta nuevamente.',
            confirmButtonColor: '#F97316'
        });
    }
}

// Evento de exportación
document.getElementById('btn-exportar-entradas')?.addEventListener('click', exportarExcelEntrada);

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
