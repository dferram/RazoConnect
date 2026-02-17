/**
 * Admin - Conciliación de Inventario
 * Sistema de filtros avanzados para auditoría y reconciliación
 */

let ajustesData = [];
let totalesData = null;
let resumenTipoData = null;
let filtrosActivos = {};

document.addEventListener('DOMContentLoaded', async () => {
  await cargarTiposAjuste();
  configurarEventListeners();
  establecerFechasPorDefecto();
});

/**
 * Establecer fechas por defecto (último mes)
 */
function establecerFechasPorDefecto() {
  const hoy = new Date();
  const hace30Dias = new Date();
  hace30Dias.setDate(hoy.getDate() - 30);
  
  document.getElementById('filtroFechaInicio').valueAsDate = hace30Dias;
  document.getElementById('filtroFechaFin').valueAsDate = hoy;
}

/**
 * Cargar tipos de ajuste disponibles
 */
async function cargarTiposAjuste() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/admin/ajustes-inventario/tipos', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Error al cargar tipos de ajuste');

    const result = await response.json();
    const tipos = result.data || [];
    
    const select = document.getElementById('filtroTipoAjuste');
    tipos.forEach(tipo => {
      const option = document.createElement('option');
      option.value = tipo;
      option.textContent = formatearTipoAjuste(tipo);
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error cargando tipos de ajuste:', error);
  }
}

/**
 * Configurar event listeners
 */
function configurarEventListeners() {
  document.getElementById('btnFiltrar').addEventListener('click', aplicarFiltros);
  document.getElementById('btnLimpiar').addEventListener('click', limpiarFiltros);
  document.getElementById('btnExportarPDF').addEventListener('click', exportarPDF);
  
  // Enter en inputs
  ['filtroFechaInicio', 'filtroFechaFin', 'filtroReferencia'].forEach(id => {
    document.getElementById(id).addEventListener('keypress', (e) => {
      if (e.key === 'Enter') aplicarFiltros();
    });
  });
}

/**
 * Aplicar filtros y cargar datos
 */
async function aplicarFiltros() {
  const fechaInicio = document.getElementById('filtroFechaInicio').value;
  const fechaFin = document.getElementById('filtroFechaFin').value;
  const tipoAjuste = document.getElementById('filtroTipoAjuste').value;
  const referencia = document.getElementById('filtroReferencia').value.trim();

  // Validaciones
  if (!fechaInicio || !fechaFin) {
    Swal.fire({
      icon: 'warning',
      title: 'Filtros Incompletos',
      text: 'Por favor selecciona un rango de fechas',
      confirmButtonColor: '#F97316'
    });
    return;
  }

  if (new Date(fechaInicio) > new Date(fechaFin)) {
    Swal.fire({
      icon: 'error',
      title: 'Rango de Fechas Inválido',
      text: 'La fecha de inicio debe ser anterior a la fecha fin',
      confirmButtonColor: '#F97316'
    });
    return;
  }

  // Guardar filtros activos
  filtrosActivos = {
    fechaInicio,
    fechaFin,
    tipoAjuste,
    referencia
  };

  await cargarAjustes();
}

/**
 * Cargar ajustes de inventario filtrados
 */
async function cargarAjustes() {
  mostrarLoading(true);
  
  try {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams();
    
    if (filtrosActivos.fechaInicio) params.append('fechaInicio', filtrosActivos.fechaInicio);
    if (filtrosActivos.fechaFin) params.append('fechaFin', filtrosActivos.fechaFin);
    if (filtrosActivos.tipoAjuste) params.append('tipoAjuste', filtrosActivos.tipoAjuste);
    if (filtrosActivos.referencia) params.append('referencia', filtrosActivos.referencia);

    const response = await fetch(`/api/admin/ajustes-inventario/filtrados?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Error al cargar ajustes');

    const result = await response.json();
    ajustesData = result.data.ajustes || [];
    totalesData = result.data.totales || null;
    resumenTipoData = result.data.resumenPorTipo || null;

    renderizarTabla();
    renderizarTotales();
    renderizarResumenTipo();

    console.log(`✅ Cargados ${ajustesData.length} ajustes de inventario`);
    console.log(`📊 Total Piezas: ${totalesData?.totalPiezas || 0}`);
    console.log(`💰 Valor Total: $${totalesData?.valorTotalizado || 0}`);

  } catch (error) {
    console.error('Error cargando ajustes:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error al Cargar Datos',
      text: 'No se pudieron cargar los ajustes de inventario',
      confirmButtonColor: '#F97316'
    });
  } finally {
    mostrarLoading(false);
  }
}

/**
 * Renderizar tabla de ajustes
 */
function renderizarTabla() {
  const tbody = document.getElementById('tablaAjustes');
  const emptyState = document.getElementById('emptyState');

  if (ajustesData.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  tbody.innerHTML = ajustesData.map(ajuste => {
    const fecha = new Date(ajuste.fecha).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const badgeClass = obtenerBadgeClass(ajuste.tipoAjuste);

    return `
      <tr>
        <td>${fecha}</td>
        <td><strong>${ajuste.sku}</strong></td>
        <td>${ajuste.productoNombre}</td>
        <td>${ajuste.dimensiones || '-'}</td>
        <td>
          <span class="badge ${badgeClass}">
            ${formatearTipoAjuste(ajuste.tipoAjuste)}
          </span>
        </td>
        <td><strong>${ajuste.cantidad.toLocaleString('es-MX')}</strong></td>
        <td>${ajuste.totalPiezas.toLocaleString('es-MX')} pzas</td>
        <td>$${ajuste.valorTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        <td>${ajuste.motivo || '-'}</td>
        <td>${ajuste.usuarioNombre}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Renderizar totales de conciliación
 */
function renderizarTotales() {
  const totalesCard = document.getElementById('totalesCard');
  
  if (!totalesData) {
    totalesCard.style.display = 'none';
    return;
  }

  totalesCard.style.display = 'block';
  
  document.getElementById('totalPaquetes').textContent = 
    totalesData.totalPaquetes.toLocaleString('es-MX');
  
  document.getElementById('totalPiezas').textContent = 
    totalesData.totalPiezas.toLocaleString('es-MX');
  
  document.getElementById('valorTotal').textContent = 
    `$${totalesData.valorTotalizado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

/**
 * Renderizar resumen por tipo
 */
function renderizarResumenTipo() {
  const container = document.getElementById('resumenTipoContainer');
  const cardsContainer = document.getElementById('resumenTipoCards');
  
  if (!resumenTipoData || Object.keys(resumenTipoData).length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  
  cardsContainer.innerHTML = Object.entries(resumenTipoData).map(([tipo, datos]) => {
    const badgeClass = obtenerBadgeClass(tipo);
    
    return `
      <div class="col-md-3">
        <div class="resumen-tipo-card">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="badge ${badgeClass}">
              ${formatearTipoAjuste(tipo)}
            </span>
            <strong>${datos.cantidad.toLocaleString('es-MX')}</strong>
          </div>
          <div class="small text-muted">
            <div>Piezas: ${datos.piezas.toLocaleString('es-MX')}</div>
            <div>Valor: $${datos.valor.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Limpiar filtros
 */
function limpiarFiltros() {
  document.getElementById('filtroFechaInicio').value = '';
  document.getElementById('filtroFechaFin').value = '';
  document.getElementById('filtroTipoAjuste').value = '';
  document.getElementById('filtroReferencia').value = '';
  
  filtrosActivos = {};
  ajustesData = [];
  totalesData = null;
  resumenTipoData = null;
  
  document.getElementById('tablaAjustes').innerHTML = `
    <tr>
      <td colspan="10" class="text-center text-muted">
        Selecciona los filtros y presiona "Filtrar" para ver resultados
      </td>
    </tr>
  `;
  
  document.getElementById('totalesCard').style.display = 'none';
  document.getElementById('resumenTipoContainer').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
  
  establecerFechasPorDefecto();
}

/**
 * Exportar a PDF con totales de conciliación
 */
async function exportarPDF() {
  if (ajustesData.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Sin Datos',
      text: 'No hay datos para exportar. Aplica filtros primero.',
      confirmButtonColor: '#F97316'
    });
    return;
  }

  mostrarLoading(true);

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape', 'pt', 'letter');

    // Encabezado
    doc.setFontSize(18);
    doc.setTextColor(249, 115, 22);
    doc.text('REPORTE DE CONCILIACIÓN DE INVENTARIO', 40, 40);

    // Información de filtros
    doc.setFontSize(10);
    doc.setTextColor(107, 93, 87);
    let yPos = 60;
    
    if (filtrosActivos.fechaInicio && filtrosActivos.fechaFin) {
      doc.text(`Período: ${formatearFecha(filtrosActivos.fechaInicio)} - ${formatearFecha(filtrosActivos.fechaFin)}`, 40, yPos);
      yPos += 15;
    }
    
    if (filtrosActivos.tipoAjuste) {
      doc.text(`Tipo: ${formatearTipoAjuste(filtrosActivos.tipoAjuste)}`, 40, yPos);
      yPos += 15;
    }
    
    if (filtrosActivos.referencia) {
      doc.text(`Referencia: ${filtrosActivos.referencia}`, 40, yPos);
      yPos += 15;
    }

    doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 40, yPos);
    yPos += 20;

    // Tabla de ajustes
    const tableData = ajustesData.map(ajuste => [
      new Date(ajuste.fecha).toLocaleDateString('es-MX'),
      ajuste.sku,
      ajuste.productoNombre.substring(0, 30),
      ajuste.dimensiones || '-',
      formatearTipoAjuste(ajuste.tipoAjuste),
      ajuste.cantidad.toLocaleString('es-MX'),
      ajuste.totalPiezas.toLocaleString('es-MX'),
      `$${ajuste.valorTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
      ajuste.motivo ? ajuste.motivo.substring(0, 20) : '-'
    ]);

    doc.autoTable({
      startY: yPos,
      head: [['Fecha', 'SKU', 'Producto', 'Dim.', 'Tipo', 'Cant.', 'Piezas', 'Valor', 'Motivo']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [249, 115, 22],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [60, 60, 60]
      },
      alternateRowStyles: {
        fillColor: [255, 247, 237]
      },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 70 },
        2: { cellWidth: 120 },
        3: { cellWidth: 50 },
        4: { cellWidth: 60 },
        5: { cellWidth: 45, halign: 'right' },
        6: { cellWidth: 55, halign: 'right' },
        7: { cellWidth: 70, halign: 'right' },
        8: { cellWidth: 90 }
      },
      margin: { left: 40, right: 40 }
    });

    // Box de totales de conciliación
    const finalY = doc.lastAutoTable.finalY + 20;
    const boxX = 500;
    const boxWidth = 240;
    const boxHeight = 85;

    // Fondo y borde
    doc.setFillColor(255, 247, 237);
    doc.setDrawColor(249, 115, 22);
    doc.setLineWidth(2);
    doc.roundedRect(boxX, finalY, boxWidth, boxHeight, 5, 5, 'FD');

    // Título
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(249, 115, 22);
    doc.text('TOTALES DE CONCILIACIÓN', boxX + boxWidth / 2, finalY + 20, { align: 'center' });

    // Línea separadora
    doc.setDrawColor(249, 115, 22);
    doc.setLineWidth(0.5);
    doc.line(boxX + 10, finalY + 28, boxX + boxWidth - 10, finalY + 28);

    // Totales
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);

    let textY = finalY + 42;
    
    doc.text('Total Paquetes:', boxX + 15, textY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(249, 115, 22);
    doc.text(totalesData.totalPaquetes.toLocaleString('es-MX'), boxX + boxWidth - 15, textY, { align: 'right' });
    
    textY += 18;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('Total Piezas:', boxX + 15, textY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(249, 115, 22);
    doc.text(totalesData.totalPiezas.toLocaleString('es-MX') + ' pzas', boxX + boxWidth - 15, textY, { align: 'right' });
    
    textY += 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text('VALOR TOTAL:', boxX + 15, textY);
    doc.setTextColor(249, 115, 22);
    doc.text('$' + totalesData.valorTotalizado.toLocaleString('es-MX', { minimumFractionDigits: 2 }), 
      boxX + boxWidth - 15, textY, { align: 'right' });

    // Guardar PDF
    const nombreArchivo = `Conciliacion_Inventario_${filtrosActivos.fechaInicio}_${filtrosActivos.fechaFin}.pdf`;
    doc.save(nombreArchivo);

    Swal.fire({
      icon: 'success',
      title: 'PDF Generado',
      text: 'El reporte se ha descargado correctamente',
      confirmButtonColor: '#F97316',
      timer: 2000
    });

  } catch (error) {
    console.error('Error generando PDF:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error al Generar PDF',
      text: 'No se pudo generar el reporte',
      confirmButtonColor: '#F97316'
    });
  } finally {
    mostrarLoading(false);
  }
}

/**
 * Utilidades
 */
function formatearTipoAjuste(tipo) {
  const tipos = {
    'ENTRADA': 'Entrada',
    'SALIDA': 'Salida',
    'MERMA': 'Merma',
    'AJUSTE': 'Ajuste'
  };
  return tipos[tipo] || tipo;
}

function obtenerBadgeClass(tipo) {
  const clases = {
    'ENTRADA': 'badge-entrada',
    'SALIDA': 'badge-salida',
    'MERMA': 'badge-merma',
    'AJUSTE': 'badge-ajuste'
  };
  return clases[tipo] || 'badge-ajuste';
}

function formatearFecha(fecha) {
  return new Date(fecha).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function mostrarLoading(mostrar) {
  const overlay = document.getElementById('loading-overlay');
  overlay.style.display = mostrar ? 'flex' : 'none';
}
