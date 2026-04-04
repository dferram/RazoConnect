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
      estadoBadge = '<span style="display: inline-flex; align-items: center; gap: 0.25rem; background: #10b981; color: white; padding: 0.375rem 0.875rem; border-radius: 0.5rem; font-size: 0.8rem; font-weight: 600;"><i class="bi bi-check-circle-fill"></i> Completa</span>';
    } else if (orden.estado_recepcion === 'Parcial') {
      estadoBadge = '<span style="display: inline-flex; align-items: center; gap: 0.25rem; background: #f59e0b; color: white; padding: 0.375rem 0.875rem; border-radius: 0.5rem; font-size: 0.8rem; font-weight: 600;"><i class="bi bi-clock-fill"></i> Parcial</span>';
    } else {
      estadoBadge = '<span style="display: inline-flex; align-items: center; gap: 0.25rem; background: #6b7280; color: white; padding: 0.375rem 0.875rem; border-radius: 0.5rem; font-size: 0.8rem; font-weight: 600;"><i class="bi bi-hourglass-split"></i> Pendiente</span>';
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
        <div style="display: flex; gap: 0.5rem; justify-content: center;">
          <button 
            onclick="window.location.href='admin-entrada-almacen-detalle.html?id=${orden.ordencompraid}'"
            style="background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; cursor: pointer; transition: all 0.3s ease; font-weight: 600; font-size: 0.875rem;"
            onmouseover="this.style.background='#2563eb'"
            onmouseout="this.style.background='#3b82f6'"
          >
            Ver Detalle
          </button>
          <button 
            onclick="generarReportePDF(${orden.ordencompraid})"
            title="Generar Reporte PDF"
            style="background: var(--razo-orange); color: white; border: none; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer; transition: all 0.3s ease;"
            onmouseover="this.style.background='#ea580c'"
            onmouseout="this.style.background='var(--razo-orange)'"
          >
            <i class="bi bi-file-earmark-pdf-fill"></i>
          </button>
        </div>
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
 * Generar reporte PDF de una orden de compra usando módulo unificado
 */
async function generarReportePDF(ordenId) {
  // Obtener botón y mostrar loading
  const botonPDF = event?.target?.closest('button');
  let restoreButton = null;
  if (botonPDF && typeof UI !== 'undefined' && UI && typeof UI.setButtonLoading === 'function') {
    restoreButton = UI.setButtonLoading(botonPDF, 'Generando...');
  }

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

    // Preparar datos para el módulo unificado de PDF
    const datosPDF = {
      orden: {
        ordenCompraId: orden.ordencompraid,
        proveedorNombre: orden.proveedor_nombre,
        estadoRecepcion: orden.estado_recepcion,
        fechaCreacion: orden.fechacreacion
      },
      productosRecibidos: (orden.productosRecibidos || []).map(p => ({
        sku: p.sku,
        producto: p.nombreproducto,
        categoria: p.categoria,
        variante: `${p.color || ''}\n${p.dimensiones || ''}`.trim(),
        cantidadPiezas: p.piezasRecibidas,
        costoUnitario: p.costounitario,
        totalCosto: p.totalCosto,
        precioVenta: p.preciounitario,
        totalVenta: p.totalVenta
      })),
      productosFaltantes: (orden.productosFaltantes || []).map(p => ({
        sku: p.sku,
        producto: p.nombreproducto,
        categoria: p.categoria,
        variante: `${p.color || ''}\n${p.dimensiones || ''}`.trim(),
        cantidadPiezas: p.piezasFaltantes,
        costoUnitario: p.costounitario,
        totalCosto: p.totalCosto,
        precioVenta: p.preciounitario,
        totalVenta: p.totalVenta
      })),
      sesion: orden.sesion ? {
        responsable: orden.sesion.responsable || orden.admin_nombre,
        fechaRecepcion: orden.sesion.fecha_ultima_actualizacion || orden.fechacreacion
      } : {
        responsable: orden.admin_nombre,
        fechaRecepcion: orden.fechacreacion
      },
      totales: orden.totales || {
        totalPiezas: 0,
        totalPaquetes: 0,
        totalInversion: 0,
        totalVentaEsperada: 0
      }
    };

    // Esperar a que el módulo PDF esté disponible
    const waitForPDFModule = () => {
      return new Promise((resolve) => {
        if (typeof window.generarPDFEntradaAlmacen === 'function') {
          resolve();
        } else {
          const checkInterval = setInterval(() => {
            if (typeof window.generarPDFEntradaAlmacen === 'function') {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
        }
      });
    };

    await waitForPDFModule();
    
    // Usar módulo unificado de generación de PDF
    await window.generarPDFEntradaAlmacen(datosPDF);

    Swal.fire({
      icon: 'success',
      title: 'Reporte Generado',
      text: 'El PDF se ha descargado correctamente',
      confirmButtonColor: '#F97316'
    });

  } catch (error) {
    console.error('Error al generar reporte:', error);
    if (restoreButton) restoreButton();
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo generar el reporte PDF',
      confirmButtonColor: '#F97316'
    });
  } finally {
    if (restoreButton) restoreButton();
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
