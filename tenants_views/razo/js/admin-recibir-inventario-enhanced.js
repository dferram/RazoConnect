/**
 * Enhanced Inventory Reception Module
 * Adds filtering and comprehensive Excel/PDF export functionality
 */

// Global state for filtering
const filtrosState = {
  texto: '',
  categoria: '',
  color: '',
  medida: '',
  itemsOriginales: [],
  itemsFiltrados: []
};

/**
 * Initialize filter dropdowns with unique values from items
 */
function inicializarFiltros() {
  if (!Array.isArray(state.items) || state.items.length === 0) {
    document.getElementById('filtrosContainer').style.display = 'none';
    document.getElementById('exportButtonsContainer').style.display = 'none';
    return;
  }

  document.getElementById('filtrosContainer').style.display = 'block';
  document.getElementById('exportButtonsContainer').style.display = 'block';

  filtrosState.itemsOriginales = [...state.items];
  
  // Populate categoria dropdown
  const categoriasUnicas = new Set();
  state.items.forEach(item => {
    const categoria = (item.categoria || '').toString().trim();
    if (categoria && categoria !== 'N/A') {
      categoriasUnicas.add(categoria);
    }
  });

  const filtroCategoria = document.getElementById('filtroCategoria');
  filtroCategoria.innerHTML = '<option value="">Todas las categorías</option>';
  Array.from(categoriasUnicas).sort().forEach(categoria => {
    const option = document.createElement('option');
    option.value = categoria;
    option.textContent = categoria;
    filtroCategoria.appendChild(option);
  });
  
  // Populate color dropdown
  const coloresUnicos = new Set();
  state.items.forEach(item => {
    const color = (item.color || '').toString().trim();
    if (color && color !== 'N/A') {
      coloresUnicos.add(color);
    }
  });

  const filtroColor = document.getElementById('filtroColor');
  filtroColor.innerHTML = '<option value="">Todos los colores</option>';
  Array.from(coloresUnicos).sort().forEach(color => {
    const option = document.createElement('option');
    option.value = color;
    option.textContent = color;
    filtroColor.appendChild(option);
  });

  // Populate medida dropdown
  const medidasUnicas = new Set();
  state.items.forEach(item => {
    const medida = (item.dimensiones || '').toString().trim();
    if (medida && medida !== 'N/A') {
      medidasUnicas.add(medida);
    }
  });

  const filtroMedida = document.getElementById('filtroMedida');
  filtroMedida.innerHTML = '<option value="">Todas las medidas</option>';
  Array.from(medidasUnicas).sort().forEach(medida => {
    const option = document.createElement('option');
    option.value = medida;
    option.textContent = medida;
    filtroMedida.appendChild(option);
  });
}

/**
 * Apply filters to items and re-render tables
 */
function aplicarFiltros() {
  if (!Array.isArray(filtrosState.itemsOriginales) || filtrosState.itemsOriginales.length === 0) {
    return;
  }

  const textoLower = filtrosState.texto.toLowerCase();
  const categoriaSeleccionada = filtrosState.categoria;
  const colorSeleccionado = filtrosState.color;
  const medidaSeleccionada = filtrosState.medida;

  filtrosState.itemsFiltrados = filtrosState.itemsOriginales.filter(item => {
    // Filter by text (product name or SKU)
    if (textoLower) {
      const nombre = (item.nombreProducto || '').toLowerCase();
      const sku = (item.sku || '').toLowerCase();
      if (!nombre.includes(textoLower) && !sku.includes(textoLower)) {
        return false;
      }
    }

    // Filter by categoria
    if (categoriaSeleccionada) {
      const itemCategoria = (item.categoria || '').toString().trim();
      if (itemCategoria !== categoriaSeleccionada) {
        return false;
      }
    }

    // Filter by color
    if (colorSeleccionado) {
      const itemColor = (item.color || '').toString().trim();
      if (itemColor !== colorSeleccionado) {
        return false;
      }
    }

    // Filter by medida
    if (medidaSeleccionada) {
      const itemMedida = (item.dimensiones || '').toString().trim();
      if (itemMedida !== medidaSeleccionada) {
        return false;
      }
    }

    return true;
  });

  // Update state.items with filtered items
  state.items = filtrosState.itemsFiltrados;
  
  // Re-render tables
  if (typeof renderSplit === 'function') {
    renderSplit();
  }
}

/**
 * Clear all filters and restore original items
 */
function limpiarFiltros() {
  filtrosState.texto = '';
  filtrosState.categoria = '';
  filtrosState.color = '';
  filtrosState.medida = '';

  document.getElementById('filtroTexto').value = '';
  document.getElementById('filtroCategoria').value = '';
  document.getElementById('filtroColor').value = '';
  document.getElementById('filtroMedida').value = '';

  state.items = [...filtrosState.itemsOriginales];
  
  if (typeof renderSplit === 'function') {
    renderSplit();
  }
}

/**
 * MISIÓN 3: Prepare unified data for reports using SESSION data (input values)
 * Returns array with complete financial information from sesionRecepcion
 * Incluye productos recibidos Y productos cerrados por merma
 */
function prepararDatosReporte() {
  if (!state.orden) {
    return { recibidos: [], cerradosPorMerma: [] };
  }

  const recibidos = [];
  const cerradosPorMerma = [];
  
  // 1. Productos RECIBIDOS (en sesión)
  if (Array.isArray(window.sesionRecepcion) && window.sesionRecepcion.length > 0) {
    window.sesionRecepcion.forEach(item => {
      const cantidadPiezas = parseInt(item.cantidadPiezas || item.cantidad, 10) || 0;
      const costoUnitario = parseFloat(item.costoUnitario || item.costounitario || 0);
      const piezasPorPaquete = parseInt(item.piezasPorPaquete || item.piezasporpaquete, 10) || 1;
      
      const totalCosto = cantidadPiezas * costoUnitario;
      
      const itemInfo = Array.isArray(state.items) ? state.items.find(x => String(x.detalleId) === String(item.detalleId)) : null;
      const precioVenta = itemInfo?.precioofertaunitario || itemInfo?.preciounitario || 0;
      const totalVenta = cantidadPiezas * precioVenta;
      
      recibidos.push({
        sku: item.sku || '',
        producto: item.nombreProducto || '',
        categoria: itemInfo?.categoria || 'Sin categoría',
        variante: itemInfo ? `${itemInfo.color || 'Sin color'} / ${itemInfo.dimensiones || 'Sin medida'}` : 'N/A',
        cantidadPiezas: cantidadPiezas,
        costoUnitario: costoUnitario,
        totalCosto: totalCosto,
        precioVenta: precioVenta,
        totalVenta: totalVenta,
        tipo: 'RECIBIDO'
      });
    });
  }

  // 2. Productos CERRADOS POR MERMA (marcados explícitamente en la BD)
  if (Array.isArray(state.items)) {
    state.items.forEach(item => {
      // Solo incluir si está marcado como cerrado por merma
      if (item.cerrado_por_merma === true || item.cerrado_por_merma === 'true') {
        const solicitado = parseInt(item.cantidadSolicitada, 10) || 0;
        const recibido = parseInt(item.cantidadRecibida || item.piezasRecibidas || item.piezasrecibidas, 10) || 0;
        const pendiente = Math.max(solicitado - recibido, 0);
        
        if (pendiente > 0) {
          const costoUnitario = parseFloat(item.costoUnitario || item.costounitario || 0);
          const totalCosto = pendiente * costoUnitario;
          const precioVenta = item.precioofertaunitario || item.preciounitario || 0;
          const totalVenta = pendiente * precioVenta;
          
          cerradosPorMerma.push({
            sku: item.sku || '',
            producto: item.nombreProducto || '',
            categoria: item.categoria || 'Sin categoría',
            variante: `${item.color || 'Sin color'} / ${item.dimensiones || 'Sin medida'}`,
            cantidadPiezas: pendiente,
            costoUnitario: costoUnitario,
            totalCosto: totalCosto,
            precioVenta: precioVenta,
            totalVenta: totalVenta,
            tipo: 'CERRADO_MERMA',
            motivo: item.motivo_discrepancia || 'Sesión cerrada - Producto no recibido'
          });
        }
      }
    });
  }

  return { recibidos, cerradosPorMerma };
}

/**
 * Export to Excel with comprehensive financial summary
 * Muestra productos recibidos y cerrados por merma de manera diferenciada
 */
async function exportarExcel() {
  const datos = prepararDatosReporte();
  
  if (datos.recibidos.length === 0 && datos.cerradosPorMerma.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Sin Datos',
      text: 'No hay productos para exportar.',
      confirmButtonColor: '#F97316'
    });
    return;
  }

  try {
    Swal.fire({
      title: 'Generando Excel...',
      text: 'Por favor espera mientras se genera el archivo.',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Recepción OC');

    // Configure column widths
    worksheet.columns = [
      { key: 'A', width: 15 },   // SKU
      { key: 'B', width: 30 },   // Producto
      { key: 'C', width: 18 },   // Categoría
      { key: 'D', width: 20 },   // Variante
      { key: 'E', width: 12 },   // Cantidad
      { key: 'F', width: 15 },   // Costo Unit.
      { key: 'G', width: 15 },   // Total Costo
      { key: 'H', width: 15 },   // Precio Venta
      { key: 'I', width: 15 }    // Total Venta
    ];

    // Add logo
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

    // Header rows
    worksheet.getRow(1).height = 30;
    worksheet.mergeCells('B1:E1');
    const titleCell = worksheet.getCell('B1');
    titleCell.value = 'REPORTE DE RECEPCIÓN / ORDEN DE COMPRA';
    titleCell.font = { name: 'Arial', size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // OC Info
    worksheet.getCell('G1').value = 'OC #';
    worksheet.getCell('G1').font = { name: 'Arial', size: 10, bold: true };
    worksheet.getCell('G1').alignment = { horizontal: 'right', vertical: 'middle' };
    
    worksheet.getCell('H1').value = state.orden.ordenCompraId || '';
    worksheet.getCell('H1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFF0000' } };
    worksheet.getCell('H1').alignment = { horizontal: 'center', vertical: 'middle' };

    // Date
    worksheet.getRow(2).height = 20;
    worksheet.getCell('B2').value = 'Fecha:';
    worksheet.getCell('B2').font = { name: 'Arial', size: 10, bold: true };
    worksheet.getCell('C2').value = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    worksheet.getCell('C2').font = { name: 'Arial', size: 10 };

    // Supplier
    worksheet.getRow(3).height = 20;
    worksheet.getCell('B3').value = 'Proveedor:';
    worksheet.getCell('B3').font = { name: 'Arial', size: 10, bold: true };
    worksheet.mergeCells('C3:H3');
    worksheet.getCell('C3').value = state.orden.proveedorNombre || 'N/A';
    worksheet.getCell('C3').font = { name: 'Arial', size: 10 };

    // Space
    worksheet.getRow(4).height = 10;

    // Table headers
    const headerRow = worksheet.getRow(5);
    headerRow.height = 25;
    
    const headers = [
      { col: 'A', text: 'SKU' },
      { col: 'B', text: 'Producto' },
      { col: 'C', text: 'Categoría' },
      { col: 'D', text: 'Variante' },
      { col: 'E', text: 'Cantidad (Piezas)' },
      { col: 'F', text: 'Costo Unit.' },
      { col: 'G', text: 'Total Costo' },
      { col: 'H', text: 'Precio Venta' },
      { col: 'I', text: 'Total Venta' }
    ];

    headers.forEach(h => {
      const cell = worksheet.getCell(`${h.col}5`);
      cell.value = h.text;
      cell.font = { name: 'Arial', size: 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEEEEEE' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Data rows - SECCIÓN 1: PRODUCTOS RECIBIDOS
    let currentRow = 6;
    let totalPiezasRecibidas = 0;
    let totalInversionRecibida = 0;
    let totalVentaRecibida = 0;

    // Agregar encabezado de sección si hay productos recibidos
    if (datos.recibidos.length > 0) {
      worksheet.mergeCells(`A${currentRow}:I${currentRow}`);
      const seccionRecibidosCell = worksheet.getCell(`A${currentRow}`);
      seccionRecibidosCell.value = '✅ PRODUCTOS RECIBIDOS';
      seccionRecibidosCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF065F46' } };
      seccionRecibidosCell.alignment = { horizontal: 'center', vertical: 'middle' };
      seccionRecibidosCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      seccionRecibidosCell.border = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
      worksheet.getRow(currentRow).height = 25;
      currentRow++;

      datos.recibidos.forEach(item => {
        const row = worksheet.getRow(currentRow);
        row.height = 20;

        const fillColor = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };

        // SKU
        const cellA = worksheet.getCell(`A${currentRow}`);
        cellA.value = item.sku;
        cellA.alignment = { horizontal: 'left', vertical: 'middle' };
        cellA.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellA.fill = fillColor;

        // Producto
        const cellB = worksheet.getCell(`B${currentRow}`);
        cellB.value = item.producto;
        cellB.alignment = { horizontal: 'left', vertical: 'middle' };
        cellB.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellB.fill = fillColor;

        // Categoría
        const cellC = worksheet.getCell(`C${currentRow}`);
        cellC.value = item.categoria;
        cellC.alignment = { horizontal: 'left', vertical: 'middle' };
        cellC.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellC.fill = fillColor;

        // Variante
        const cellD = worksheet.getCell(`D${currentRow}`);
        cellD.value = item.variante;
        cellD.alignment = { horizontal: 'left', vertical: 'middle' };
        cellD.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellD.fill = fillColor;

        // Cantidad
        const cellE = worksheet.getCell(`E${currentRow}`);
        cellE.value = item.cantidadPiezas.toLocaleString('es-MX');
        cellE.alignment = { horizontal: 'center', vertical: 'middle' };
        cellE.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellE.fill = fillColor;

        // Costo Unitario
        const cellF = worksheet.getCell(`F${currentRow}`);
        cellF.value = item.costoUnitario;
        cellF.numFmt = '$#,##0.00';
        cellF.alignment = { horizontal: 'right', vertical: 'middle' };
        cellF.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellF.fill = fillColor;

        // Total Costo
        const cellG = worksheet.getCell(`G${currentRow}`);
        cellG.value = item.totalCosto;
        cellG.numFmt = '$#,##0.00';
        cellG.alignment = { horizontal: 'right', vertical: 'middle' };
        cellG.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellG.fill = fillColor;

        // Precio Venta
        const cellH = worksheet.getCell(`H${currentRow}`);
        cellH.value = item.precioVenta;
        cellH.numFmt = '$#,##0.00';
        cellH.alignment = { horizontal: 'right', vertical: 'middle' };
        cellH.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellH.fill = fillColor;

        // Total Venta
        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = item.totalVenta;
        cellI.numFmt = '$#,##0.00';
        cellI.alignment = { horizontal: 'right', vertical: 'middle' };
        cellI.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellI.fill = fillColor;

        totalPiezasRecibidas += item.cantidadPiezas;
        totalInversionRecibida += item.totalCosto;
        totalVentaRecibida += item.totalVenta;

        currentRow++;
      });
    }

    // SECCIÓN 2: PRODUCTOS CERRADOS POR MERMA
    let totalPiezasMerma = 0;
    let totalInversionMerma = 0;
    let totalVentaMerma = 0;

    if (datos.cerradosPorMerma.length > 0) {
      // Espacio entre secciones
      currentRow++;

      worksheet.mergeCells(`A${currentRow}:I${currentRow}`);
      const seccionMermaCell = worksheet.getCell(`A${currentRow}`);
      seccionMermaCell.value = '❌ PRODUCTOS CERRADOS POR MERMA (NO RECIBIDOS)';
      seccionMermaCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF991B1B' } };
      seccionMermaCell.alignment = { horizontal: 'center', vertical: 'middle' };
      seccionMermaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      seccionMermaCell.border = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
      worksheet.getRow(currentRow).height = 25;
      currentRow++;

      datos.cerradosPorMerma.forEach(item => {
        const row = worksheet.getRow(currentRow);
        row.height = 20;

        const fillColor = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };

        // SKU
        const cellA = worksheet.getCell(`A${currentRow}`);
        cellA.value = item.sku;
        cellA.alignment = { horizontal: 'left', vertical: 'middle' };
        cellA.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellA.fill = fillColor;

        // Producto
        const cellB = worksheet.getCell(`B${currentRow}`);
        cellB.value = item.producto;
        cellB.alignment = { horizontal: 'left', vertical: 'middle' };
        cellB.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellB.fill = fillColor;

        // Categoría
        const cellC = worksheet.getCell(`C${currentRow}`);
        cellC.value = item.categoria;
        cellC.alignment = { horizontal: 'left', vertical: 'middle' };
        cellC.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellC.fill = fillColor;

        // Variante
        const cellD = worksheet.getCell(`D${currentRow}`);
        cellD.value = item.variante;
        cellD.alignment = { horizontal: 'left', vertical: 'middle' };
        cellD.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellD.fill = fillColor;

        // Cantidad
        const cellE = worksheet.getCell(`E${currentRow}`);
        cellE.value = item.cantidadPiezas.toLocaleString('es-MX');
        cellE.alignment = { horizontal: 'center', vertical: 'middle' };
        cellE.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellE.fill = fillColor;
        cellE.font = { color: { argb: 'FFDC2626' }, bold: true };

        // Costo Unitario
        const cellF = worksheet.getCell(`F${currentRow}`);
        cellF.value = item.costoUnitario;
        cellF.numFmt = '$#,##0.00';
        cellF.alignment = { horizontal: 'right', vertical: 'middle' };
        cellF.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellF.fill = fillColor;

        // Total Costo
        const cellG = worksheet.getCell(`G${currentRow}`);
        cellG.value = item.totalCosto;
        cellG.numFmt = '$#,##0.00';
        cellG.alignment = { horizontal: 'right', vertical: 'middle' };
        cellG.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellG.fill = fillColor;
        cellG.font = { color: { argb: 'FFDC2626' }, bold: true };

        // Precio Venta
        const cellH = worksheet.getCell(`H${currentRow}`);
        cellH.value = item.precioVenta;
        cellH.numFmt = '$#,##0.00';
        cellH.alignment = { horizontal: 'right', vertical: 'middle' };
        cellH.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellH.fill = fillColor;

        // Total Venta
        const cellI = worksheet.getCell(`I${currentRow}`);
        cellI.value = item.totalVenta;
        cellI.numFmt = '$#,##0.00';
        cellI.alignment = { horizontal: 'right', vertical: 'middle' };
        cellI.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cellI.fill = fillColor;

        totalPiezasMerma += item.cantidadPiezas;
        totalInversionMerma += item.totalCosto;
        totalVentaMerma += item.totalVenta;

        currentRow++;
      });
    }

    // Calcular totales generales
    const totalPiezas = totalPiezasRecibidas + totalPiezasMerma;
    const totalInversion = totalInversionRecibida + totalInversionMerma;
    const totalVentaEsperada = totalVentaRecibida + totalVentaMerma;

    // Totals row
    const totalsRow = worksheet.getRow(currentRow);
    totalsRow.height = 25;
    
    worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
    const totalLabelCell = worksheet.getCell(`A${currentRow}`);
    totalLabelCell.value = 'TOTALES';
    totalLabelCell.font = { name: 'Arial', size: 12, bold: true };
    totalLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totalLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    totalLabelCell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };

    const totalPiezasCell = worksheet.getCell(`E${currentRow}`);
    totalPiezasCell.value = totalPiezas.toLocaleString('es-MX');
    totalPiezasCell.font = { name: 'Arial', size: 12, bold: true };
    totalPiezasCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totalPiezasCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    totalPiezasCell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };

    worksheet.getCell(`F${currentRow}`).border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
    worksheet.getCell(`F${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };

    const totalInversionCell = worksheet.getCell(`G${currentRow}`);
    totalInversionCell.value = totalInversion;
    totalInversionCell.numFmt = '$#,##0.00';
    totalInversionCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFDC2626' } };
    totalInversionCell.alignment = { horizontal: 'right', vertical: 'middle' };
    totalInversionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    totalInversionCell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };

    worksheet.getCell(`H${currentRow}`).border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
    worksheet.getCell(`H${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };

    const totalVentaCell = worksheet.getCell(`I${currentRow}`);
    totalVentaCell.value = totalVentaEsperada;
    totalVentaCell.numFmt = '$#,##0.00';
    totalVentaCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF10B981' } };
    totalVentaCell.alignment = { horizontal: 'right', vertical: 'middle' };
    totalVentaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    totalVentaCell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };

    // Financial summary
    currentRow += 2;
    worksheet.getRow(currentRow).height = 25;
    worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
    const summaryLabelCell = worksheet.getCell(`A${currentRow}`);
    summaryLabelCell.value = 'RESUMEN FINANCIERO';
    summaryLabelCell.font = { name: 'Arial', size: 14, bold: true };
    summaryLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    summaryLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
    summaryLabelCell.font = { ...summaryLabelCell.font, color: { argb: 'FFFFFFFF' } };

    currentRow++;
    worksheet.getCell(`B${currentRow}`).value = 'Total Piezas Recibidas:';
    worksheet.getCell(`B${currentRow}`).font = { bold: true };
    worksheet.getCell(`C${currentRow}`).value = totalPiezas.toLocaleString('es-MX');
    worksheet.getCell(`C${currentRow}`).alignment = { horizontal: 'right' };

    currentRow++;
    worksheet.getCell(`B${currentRow}`).value = 'Valor Total de Compra:';
    worksheet.getCell(`B${currentRow}`).font = { bold: true };
    worksheet.getCell(`C${currentRow}`).value = totalInversion;
    worksheet.getCell(`C${currentRow}`).numFmt = '$#,##0.00';
    worksheet.getCell(`C${currentRow}`).font = { bold: true, color: { argb: 'FFDC2626' } };
    worksheet.getCell(`C${currentRow}`).alignment = { horizontal: 'right' };

    currentRow++;
    worksheet.getCell(`B${currentRow}`).value = 'Valor Total de Venta Esperado:';
    worksheet.getCell(`B${currentRow}`).font = { bold: true };
    worksheet.getCell(`C${currentRow}`).value = totalVentaEsperada;
    worksheet.getCell(`C${currentRow}`).numFmt = '$#,##0.00';
    worksheet.getCell(`C${currentRow}`).font = { bold: true, color: { argb: 'FF10B981' } };
    worksheet.getCell(`C${currentRow}`).alignment = { horizontal: 'right' };

    currentRow++;
    const margen = totalVentaEsperada - totalInversion;
    worksheet.getCell(`B${currentRow}`).value = 'Margen Esperado:';
    worksheet.getCell(`B${currentRow}`).font = { bold: true };
    worksheet.getCell(`C${currentRow}`).value = margen;
    worksheet.getCell(`C${currentRow}`).numFmt = '$#,##0.00';
    worksheet.getCell(`C${currentRow}`).font = { bold: true, color: { argb: margen >= 0 ? 'FF10B981' : 'FFDC2626' } };
    worksheet.getCell(`C${currentRow}`).alignment = { horizontal: 'right' };

    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Recepcion_OC_${state.orden.ordenCompraId}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    Swal.fire({
      icon: 'success',
      title: 'Excel Generado',
      text: 'El reporte ha sido descargado exitosamente.',
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

/**
 * Export to PDF with comprehensive financial summary
 */
async function exportarPDF() {
  const datos = prepararDatosReporte();
  
  console.log('📄 [PDF] Datos preparados:', datos);
  
  if (datos.recibidos.length === 0 && datos.cerradosPorMerma.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Sin Datos',
      text: 'No hay productos para exportar.',
      confirmButtonColor: '#F97316'
    });
    return;
  }

  try {
    Swal.fire({
      title: 'Generando PDF...',
      text: 'Por favor espera mientras se genera el archivo.',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation

    // Add logo
    try {
      const logoResponse = await fetch('/icon/Logo_Razo.png');
      const logoBlob = await logoResponse.blob();
      const logoBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(logoBlob);
      });
      doc.addImage(logoBase64, 'PNG', 10, 10, 20, 20);
    } catch (logoError) {
      console.warn('No se pudo cargar el logo:', logoError);
    }

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE RECEPCIÓN / ORDEN DE COMPRA', 148, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`OC #${state.orden.ordenCompraId || ''}`, 240, 12);
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-MX')}`, 240, 17);
    doc.text(`Proveedor: ${state.orden.proveedorNombre || 'N/A'}`, 40, 25);

    // Preparar datos de tabla con secciones separadas
    const tableData = [];
    
    // SECCIÓN 1: Productos recibidos
    if (datos.recibidos.length > 0) {
      tableData.push([
        { content: '✅ PRODUCTOS RECIBIDOS', colSpan: 9, styles: { fillColor: [209, 250, 229], textColor: [6, 95, 70], fontStyle: 'bold', halign: 'center' } }
      ]);
      
      datos.recibidos.forEach(item => {
        tableData.push([
          item.sku,
          item.producto,
          item.categoria,
          item.variante,
          item.cantidadPiezas.toLocaleString('es-MX'),
          `$${item.costoUnitario.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `$${item.totalCosto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `$${item.precioVenta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `$${item.totalVenta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ]);
      });
    }
    
    // SECCIÓN 2: Productos cerrados por merma
    if (datos.cerradosPorMerma.length > 0) {
      tableData.push([
        { content: '❌ PRODUCTOS CERRADOS POR MERMA (NO RECIBIDOS)', colSpan: 9, styles: { fillColor: [254, 226, 226], textColor: [153, 27, 27], fontStyle: 'bold', halign: 'center' } }
      ]);
      
      datos.cerradosPorMerma.forEach(item => {
        tableData.push([
          item.sku,
          item.producto,
          item.categoria,
          item.variante,
          { content: item.cantidadPiezas.toLocaleString('es-MX'), styles: { textColor: [220, 38, 38], fontStyle: 'bold' } },
          `$${item.costoUnitario.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          { content: `$${item.totalCosto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { textColor: [220, 38, 38], fontStyle: 'bold' } },
          `$${item.precioVenta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `$${item.totalVenta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        ]);
      });
    }

    // Calculate totals
    let totalPiezasRecibidas = 0;
    let totalInversionRecibida = 0;
    let totalVentaRecibida = 0;
    
    let totalPiezasMerma = 0;
    let totalInversionMerma = 0;
    let totalVentaMerma = 0;

    datos.recibidos.forEach(item => {
      totalPiezasRecibidas += item.cantidadPiezas;
      totalInversionRecibida += item.totalCosto;
      totalVentaRecibida += item.totalVenta;
    });
    
    datos.cerradosPorMerma.forEach(item => {
      totalPiezasMerma += item.cantidadPiezas;
      totalInversionMerma += item.totalCosto;
      totalVentaMerma += item.totalVenta;
    });
    
    const totalPiezas = totalPiezasRecibidas + totalPiezasMerma;
    const totalInversion = totalInversionRecibida + totalInversionMerma;
    const totalVentaEsperada = totalVentaRecibida + totalVentaMerma;
    
    // Calcular paquetes solo de productos recibidos
    let totalPaquetes = 0;
    if (Array.isArray(window.sesionRecepcion)) {
      window.sesionRecepcion.forEach(item => {
        const cantidadPiezas = parseInt(item.cantidadPiezas || item.cantidad, 10) || 0;
        const piezasPorPaquete = parseInt(item.piezasPorPaquete || item.piezasporpaquete, 10) || 1;
        const paquetes = Math.ceil(cantidadPiezas / piezasPorPaquete);
        totalPaquetes += paquetes;
      });
    }

    // Add table WITHOUT footer (totals will be added separately at the end)
    doc.autoTable({
      startY: 35,
      head: [['SKU', 'Producto', 'Categoría', 'Variante', 'Cantidad\n(Piezas)', 'Costo\nUnit.', 'Total\nCosto', 'Precio\nVenta', 'Total\nVenta']],
      body: tableData,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [200, 200, 200],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [238, 238, 238],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 45 },
        2: { cellWidth: 30 },
        3: { cellWidth: 35 },
        4: { halign: 'center', cellWidth: 18 },
        5: { halign: 'right', cellWidth: 20 },
        6: { halign: 'right', cellWidth: 23 },
        7: { halign: 'right', cellWidth: 20 },
        8: { halign: 'right', cellWidth: 23 }
      }
    });

    // MISIÓN 4: Add TOTALS row at the end using finalY
    const finalY = doc.lastAutoTable.finalY + 2;
    
    // Draw totals table
    doc.autoTable({
      startY: finalY,
      head: [[
        { content: 'TOTALES', colSpan: 4, styles: { halign: 'center', fontStyle: 'bold', fillColor: [249, 250, 251] } },
        { content: `${totalPiezas.toLocaleString('es-MX')} pzas\n(${totalPaquetes.toLocaleString('es-MX')} paq)`, styles: { halign: 'center', fontStyle: 'bold', fillColor: [249, 250, 251], fontSize: 9 } },
        { content: '', styles: { fillColor: [249, 250, 251] } },
        { content: `$${totalInversion.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [220, 38, 38], fillColor: [249, 250, 251] } },
        { content: '', styles: { fillColor: [249, 250, 251] } },
        { content: `$${totalVentaEsperada.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129], fillColor: [249, 250, 251] } }
      ]],
      body: [],
      theme: 'grid',
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 45 },
        2: { cellWidth: 30 },
        3: { cellWidth: 35 },
        4: { halign: 'center', cellWidth: 18 },
        5: { halign: 'right', cellWidth: 20 },
        6: { halign: 'right', cellWidth: 23 },
        7: { halign: 'right', cellWidth: 20 },
        8: { halign: 'right', cellWidth: 23 }
      }
    });

    // Financial summary with page break handling
    const summaryHeight = 45; // Total height needed for summary box (10 + 4*7 + margins)
    let summaryY = doc.lastAutoTable.finalY + 10;
    
    // Check if there's enough space on current page (A4 landscape = 210mm height, margin bottom ~15mm)
    if (summaryY + summaryHeight > 195) {
      doc.addPage();
      summaryY = 20; // Start near top of new page
    }
    
    doc.setFillColor(249, 115, 22);
    doc.rect(10, summaryY, 120, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN FINANCIERO', 70, summaryY + 7, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    
    let detailY = summaryY + 15;
    doc.text('Total Piezas Recibidas:', 15, detailY);
    doc.setFont('helvetica', 'normal');
    doc.text(`${totalPiezas.toLocaleString('es-MX')} piezas (${totalPaquetes.toLocaleString('es-MX')} paquetes)`, 80, detailY);

    detailY += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Valor Total de Compra:', 15, detailY);
    doc.setTextColor(220, 38, 38);
    doc.text(`$${totalInversion.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 80, detailY);

    detailY += 7;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Valor Total de Venta Esperado:', 15, detailY);
    doc.setTextColor(16, 185, 129);
    doc.text(`$${totalVentaEsperada.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 80, detailY);

    detailY += 7;
    const margen = totalVentaEsperada - totalInversion;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Margen Esperado:', 15, detailY);
    doc.setTextColor(margen >= 0 ? 16 : 220, margen >= 0 ? 185 : 38, margen >= 0 ? 129 : 38);
    doc.text(`$${margen.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 80, detailY);

    // Save PDF
    doc.save(`Recepcion_OC_${state.orden.ordenCompraId}_${new Date().toISOString().slice(0, 10)}.pdf`);

    Swal.fire({
      icon: 'success',
      title: 'PDF Generado',
      text: 'El reporte ha sido descargado exitosamente.',
      confirmButtonColor: '#F97316'
    });

  } catch (error) {
    console.error('Error generando PDF:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo generar el archivo PDF. Por favor intenta nuevamente.',
      confirmButtonColor: '#F97316'
    });
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Filter event listeners
  const filtroTexto = document.getElementById('filtroTexto');
  const filtroColor = document.getElementById('filtroColor');
  const filtroMedida = document.getElementById('filtroMedida');
  const btnLimpiarFiltros = document.getElementById('btnLimpiarFiltros');

  if (filtroTexto) {
    filtroTexto.addEventListener('input', (e) => {
      filtrosState.texto = e.target.value;
      aplicarFiltros();
    });
  }

  const filtroCategoria = document.getElementById('filtroCategoria');
  if (filtroCategoria) {
    filtroCategoria.addEventListener('change', (e) => {
      filtrosState.categoria = e.target.value;
      aplicarFiltros();
    });
  }

  if (filtroColor) {
    filtroColor.addEventListener('change', (e) => {
      filtrosState.color = e.target.value;
      aplicarFiltros();
    });
  }

  if (filtroMedida) {
    filtroMedida.addEventListener('change', (e) => {
      filtrosState.medida = e.target.value;
      aplicarFiltros();
    });
  }

  if (btnLimpiarFiltros) {
    btnLimpiarFiltros.addEventListener('click', limpiarFiltros);
  }

  // Export event listeners
  const btnExportarExcel = document.getElementById('btn-exportar-excel');
  const btnExportarPDF = document.getElementById('btn-exportar-pdf');

  if (btnExportarExcel) {
    btnExportarExcel.addEventListener('click', exportarExcel);
  }

  if (btnExportarPDF) {
    btnExportarPDF.addEventListener('click', exportarPDF);
  }
});

// Expose functions globally
window.inicializarFiltros = inicializarFiltros;
window.aplicarFiltros = aplicarFiltros;
window.limpiarFiltros = limpiarFiltros;
window.prepararDatosReporte = prepararDatosReporte;
window.exportarExcel = exportarExcel;
window.exportarPDF = exportarPDF;
