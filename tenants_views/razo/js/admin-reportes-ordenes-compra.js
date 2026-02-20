/**
 * Admin - Reportes de Órdenes de Compra
 * Sistema de consulta y generación de reportes PDF de recepciones de inventario
 */

let ordenesData = [];
let currentPage = 1;
const itemsPerPage = 10;

// Elementos del DOM
const loadingOrdenes = document.getElementById('loadingOrdenes');
const ordenesTable = document.getElementById('ordenesTable');
const ordenesTableBody = document.getElementById('ordenesTableBody');
const emptyOrdenes = document.getElementById('emptyOrdenes');
const searchInput = document.getElementById('searchInput');
const filtroEstado = document.getElementById('filtroEstado');
const btnBuscar = document.getElementById('btnBuscar');
const paginationContainer = document.getElementById('paginationContainer');
const paginationInfo = document.getElementById('paginationInfo');
const pageIndicator = document.getElementById('pageIndicator');
const btnPrevPage = document.getElementById('btnPrevPage');
const btnNextPage = document.getElementById('btnNextPage');

/**
 * Cargar órdenes de compra con recepciones
 */
async function cargarOrdenes() {
  try {
    loadingOrdenes.style.display = 'flex';
    ordenesTable.style.display = 'none';
    emptyOrdenes.style.display = 'none';

    const response = await fetch(`${window.location.origin}/api/admin/ordenes-compra/reportes`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
      }
    });

    if (!response.ok) {
      throw new Error('Error al cargar órdenes de compra');
    }

    const data = await response.json();
    // Filtrar solo órdenes Completa o Parcial (excluir Pendiente)
    ordenesData = (data.ordenes || []).filter(orden => 
      orden.estado_recepcion === 'Completa' || orden.estado_recepcion === 'Parcial'
    );

    loadingOrdenes.style.display = 'none';

    if (ordenesData.length === 0) {
      emptyOrdenes.style.display = 'flex';
    } else {
      renderizarOrdenes();
    }
  } catch (error) {
    console.error('Error al cargar órdenes:', error);
    loadingOrdenes.style.display = 'none';
    emptyOrdenes.style.display = 'flex';
    
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudieron cargar las órdenes de compra',
      confirmButtonColor: '#F97316'
    });
  }
}

/**
 * Filtrar órdenes según búsqueda y estado
 */
function filtrarOrdenes() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const estadoFiltro = filtroEstado.value;

  return ordenesData.filter(orden => {
    const matchSearch = !searchTerm || 
      orden.ordencompraid.toString().includes(searchTerm) ||
      (orden.proveedor_nombre || '').toLowerCase().includes(searchTerm) ||
      (orden.admin_nombre || '').toLowerCase().includes(searchTerm);

    const matchEstado = !estadoFiltro || orden.estado_recepcion === estadoFiltro;

    return matchSearch && matchEstado;
  });
}

/**
 * Renderizar tabla de órdenes
 */
function renderizarOrdenes() {
  const ordenesFiltradas = filtrarOrdenes();
  const totalPages = Math.ceil(ordenesFiltradas.length / itemsPerPage);
  
  if (currentPage > totalPages && totalPages > 0) {
    currentPage = totalPages;
  }

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const ordenesPagina = ordenesFiltradas.slice(startIndex, endIndex);

  ordenesTableBody.innerHTML = '';

  if (ordenesFiltradas.length === 0) {
    ordenesTable.style.display = 'none';
    emptyOrdenes.style.display = 'flex';
    paginationContainer.style.display = 'none';
    return;
  }

  ordenesTable.style.display = 'table';
  emptyOrdenes.style.display = 'none';

  ordenesPagina.forEach(orden => {
    const tr = document.createElement('tr');
    
    // Badge de estado con colores
    let estadoBadge = '';
    if (orden.estado_recepcion === 'Completa') {
      estadoBadge = '<span style="background: #10b981; color: white; padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.8rem; font-weight: 600;"><i class="bi bi-check-circle-fill"></i> Completa</span>';
    } else if (orden.estado_recepcion === 'Parcial') {
      estadoBadge = '<span style="background: #f59e0b; color: white; padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.8rem; font-weight: 600;"><i class="bi bi-clock-fill"></i> Parcial</span>';
    } else {
      estadoBadge = '<span style="background: #6b7280; color: white; padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.8rem; font-weight: 600;"><i class="bi bi-hourglass-split"></i> Pendiente</span>';
    }

    // Formatear fechas
    const fechaCreacion = orden.fechacreacion ? new Date(orden.fechacreacion).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }) : 'N/A';

    const fechaRecepcion = orden.ultima_recepcion ? new Date(orden.ultima_recepcion).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : 'Sin recepciones';

    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--razo-orange);">#${orden.ordencompraid}</td>
      <td>
        <div style="font-weight: 600;">${orden.proveedor_nombre || 'N/A'}</div>
        <div style="font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem;">
          ${orden.total_productos || 0} producto${orden.total_productos !== 1 ? 's' : ''}
        </div>
      </td>
      <td>${fechaCreacion}</td>
      <td>
        <div style="font-size: 0.85rem;">${fechaRecepcion}</div>
        ${orden.total_recepciones > 0 ? `<div style="font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">${orden.total_recepciones} recepción${orden.total_recepciones !== 1 ? 'es' : ''}</div>` : ''}
      </td>
      <td>
        <div style="font-weight: 600;">${orden.admin_nombre || 'N/A'}</div>
      </td>
      <td style="text-align: center;">
        <div style="font-weight: 700; color: #333;">${orden.total_productos || 0}</div>
        <div style="font-size: 0.75rem; color: #6b7280;">
          ${orden.piezas_recibidas || 0} / ${orden.piezas_solicitadas || 0} pzas
        </div>
      </td>
      <td style="text-align: center;">${estadoBadge}</td>
      <td style="text-align: center;">
        <button 
          class="btn-icon-action" 
          onclick="generarReportePDF(${orden.ordencompraid})"
          title="Generar Reporte PDF"
          style="background: var(--razo-orange); color: white; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer; transition: all 0.3s ease;"
          onmouseover="this.style.background='#ea580c'"
          onmouseout="this.style.background='var(--razo-orange)'"
        >
          <i class="bi bi-file-earmark-pdf-fill"></i>
        </button>
      </td>
    `;

    ordenesTableBody.appendChild(tr);
  });

  // Actualizar paginación
  paginationInfo.textContent = `${ordenesFiltradas.length} orden${ordenesFiltradas.length !== 1 ? 'es' : ''}`;
  pageIndicator.textContent = `Página ${currentPage} de ${totalPages || 1}`;
  
  btnPrevPage.disabled = currentPage === 1;
  btnNextPage.disabled = currentPage === totalPages || totalPages === 0;
  
  btnPrevPage.style.opacity = btnPrevPage.disabled ? '0.5' : '1';
  btnNextPage.style.opacity = btnNextPage.disabled ? '0.5' : '1';
  btnPrevPage.style.cursor = btnPrevPage.disabled ? 'not-allowed' : 'pointer';
  btnNextPage.style.cursor = btnNextPage.disabled ? 'not-allowed' : 'pointer';

  paginationContainer.style.display = ordenesFiltradas.length > 0 ? 'block' : 'none';
}

/**
 * Generar reporte PDF de una orden de compra
 */
async function generarReportePDF(ordenId) {
  try {
    Swal.fire({
      title: 'Generando reporte...',
      text: 'Por favor espera',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const response = await fetch(`${window.location.origin}/api/admin/ordenes-compra/${ordenId}/reporte-detallado`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
      }
    });

    if (!response.ok) {
      throw new Error('Error al obtener datos de la orden');
    }

    const data = await response.json();
    const orden = data.orden;

    // Crear PDF con jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Encabezado
    doc.setFillColor(249, 115, 22); // Naranja
    doc.rect(0, 0, 210, 35, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE RECEPCIÓN', 105, 15, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Orden de Compra #${orden.ordencompraid}`, 105, 25, { align: 'center' });

    // Información de la orden
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    let yPos = 45;

    doc.setFont('helvetica', 'bold');
    doc.text('Proveedor:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(orden.proveedor_nombre || 'N/A', 50, yPos);

    yPos += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Responsable:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(orden.admin_nombre || 'N/A', 50, yPos);

    yPos += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Fecha Creación:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(orden.fechacreacion).toLocaleDateString('es-MX'), 50, yPos);

    yPos += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Estado:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(orden.estado_recepcion === 'Completa' ? 16 : (orden.estado_recepcion === 'Parcial' ? 245 : 107), 
                     orden.estado_recepcion === 'Completa' ? 185 : (orden.estado_recepcion === 'Parcial' ? 158 : 114), 
                     orden.estado_recepcion === 'Completa' ? 129 : (orden.estado_recepcion === 'Parcial' ? 11 : 128));
    doc.text(orden.estado_recepcion, 50, yPos);
    doc.setTextColor(0, 0, 0);

    yPos += 12;

    // Tabla de productos
    const tableData = orden.detalles.map(detalle => [
      detalle.sku || 'N/A',
      detalle.nombreproducto || 'N/A',
      `${detalle.color || 'N/A'}\n${detalle.dimensiones || 'N/A'}`,
      `${detalle.cantidad_solicitada || 0}`,
      `${detalle.cantidad_recibida || 0}`,
      `${detalle.piezas_por_paquete || 1}`,
      `${(detalle.cantidad_recibida || 0) * (detalle.piezas_por_paquete || 1)}`,
      `$${(detalle.costounitario || 0).toFixed(2)}`
    ]);

    doc.autoTable({
      startY: yPos,
      head: [['SKU', 'Producto', 'Variante', 'Solicitado\n(paq)', 'Recibido\n(paq)', 'Pzas/Paq', 'Total\nPiezas', 'Costo Unit.']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [249, 115, 22],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      bodyStyles: {
        fontSize: 8
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 40 },
        2: { cellWidth: 30 },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 15, halign: 'center' },
        5: { cellWidth: 15, halign: 'center' },
        6: { cellWidth: 15, halign: 'center' },
        7: { cellWidth: 20, halign: 'right' }
      }
    });

    // Resumen financiero
    const finalY = doc.lastAutoTable.finalY + 10;
    
    doc.roundedRect(130, finalY, 70, 50, 3, 3, 'FD');
    doc.setFillColor(255, 247, 237);
    doc.rect(130, finalY, 70, 50, 'F');
    doc.setDrawColor(249, 115, 22);
    doc.setLineWidth(0.5);
    doc.roundedRect(130, finalY, 70, 50, 3, 3, 'S');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(249, 115, 22);
    doc.text('RESUMEN', 165, finalY + 8, { align: 'center' });

    doc.setDrawColor(249, 115, 22);
    doc.line(135, finalY + 11, 195, finalY + 11);

    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    
    const totalPiezas = orden.detalles.reduce((sum, d) => sum + ((d.cantidad_recibida || 0) * (d.piezas_por_paquete || 1)), 0);
    const totalCosto = orden.detalles.reduce((sum, d) => sum + ((d.cantidad_recibida || 0) * (d.piezas_por_paquete || 1) * (d.costounitario || 0)), 0);

    doc.text('Total Piezas:', 135, finalY + 20);
    doc.setFont('helvetica', 'bold');
    doc.text(`${totalPiezas.toLocaleString('es-MX')} pzas`, 195, finalY + 20, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text('Total Paquetes:', 135, finalY + 28);
    doc.setFont('helvetica', 'bold');
    doc.text(`${orden.detalles.reduce((sum, d) => sum + (d.cantidad_recibida || 0), 0)} paq`, 195, finalY + 28, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text('Valor Total:', 135, finalY + 36);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`$${totalCosto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, 195, finalY + 36, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.text('Productos:', 135, finalY + 44);
    doc.setFont('helvetica', 'bold');
    doc.text(`${orden.detalles.length}`, 195, finalY + 44, { align: 'right' });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generado el ${new Date().toLocaleString('es-MX')}`, 105, 285, { align: 'center' });
    doc.text('RazoConnect - Sistema de Gestión de Inventario', 105, 290, { align: 'center' });

    // Descargar PDF
    doc.save(`Reporte_OC_${ordenId}_${new Date().toISOString().slice(0, 10)}.pdf`);

    Swal.fire({
      icon: 'success',
      title: 'Reporte Generado',
      text: 'El PDF se ha descargado correctamente',
      confirmButtonColor: '#F97316'
    });

  } catch (error) {
    console.error('Error al generar reporte:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo generar el reporte PDF',
      confirmButtonColor: '#F97316'
    });
  }
}

/**
 * Event Listeners
 */
btnBuscar.addEventListener('click', () => {
  currentPage = 1;
  renderizarOrdenes();
});

searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    currentPage = 1;
    renderizarOrdenes();
  }
});

filtroEstado.addEventListener('change', () => {
  currentPage = 1;
  renderizarOrdenes();
});

btnPrevPage.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    renderizarOrdenes();
  }
});

btnNextPage.addEventListener('click', () => {
  const ordenesFiltradas = filtrarOrdenes();
  const totalPages = Math.ceil(ordenesFiltradas.length / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderizarOrdenes();
  }
});

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  cargarOrdenes();
});
