/**
 * Admin - Detalle de Entrada de Almacén
 * Muestra información completa de una recepción de inventario
 */

let ordenData = null;

// Elementos del DOM
const loadingDetalle = document.getElementById('loadingDetalle');
const detalleContainer = document.getElementById('detalleContainer');
const errorContainer = document.getElementById('errorContainer');
const errorMessage = document.getElementById('errorMessage');

/**
 * Obtener ID de la orden desde URL
 */
function getOrdenIdFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const ordenId = urlParams.get('id');
  return ordenId ? parseInt(ordenId, 10) : null;
}

/**
 * Cargar detalle de la orden
 */
async function cargarDetalle() {
  const ordenId = getOrdenIdFromURL();

  if (!ordenId || isNaN(ordenId)) {
    mostrarError('ID de orden inválido');
    return;
  }

  try {
    loadingDetalle.style.display = 'flex';
    detalleContainer.style.display = 'none';
    errorContainer.style.display = 'none';

    const response = await fetch(`${window.location.origin}/api/admin/ordenes-compra/${ordenId}/reporte-detallado`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
      }
    });

    if (!response.ok) {
      throw new Error('Error al obtener datos de la orden');
    }

    const data = await response.json();
    ordenData = data.orden;

    renderizarDetalle();

  } catch (error) {
    console.error('Error al cargar detalle:', error);
    mostrarError(error.message || 'No se pudo cargar la información de la entrada de almacén');
  }
}

/**
 * Renderizar detalle de la orden
 */
function renderizarDetalle() {
  if (!ordenData) return;

  loadingDetalle.style.display = 'none';
  detalleContainer.style.display = 'block';

  // Información del encabezado
  document.getElementById('ordenNumero').textContent = ordenData.ordencompraid || 'N/A';
  document.getElementById('proveedorNombre').textContent = ordenData.proveedor_nombre || 'N/A';
  document.getElementById('responsableNombre').textContent = 
    (ordenData.sesion && ordenData.sesion.responsable) || ordenData.admin_nombre || 'N/A';
  
  // Fecha de recepción
  const fechaRecepcion = (ordenData.sesion && ordenData.sesion.fecha_ultima_actualizacion) || ordenData.fechacreacion;
  if (fechaRecepcion) {
    document.getElementById('fechaRecepcion').textContent = new Date(fechaRecepcion).toLocaleString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Badge de estado
  const estadoBadge = document.getElementById('estadoBadge');
  const estado = ordenData.estado_recepcion || 'Pendiente';
  let badgeStyle = '';
  
  if (estado === 'Completa') {
    badgeStyle = 'display: inline-flex; align-items: center; gap: 0.25rem; background: #10b981; color: white; padding: 0.375rem 0.875rem; border-radius: 0.5rem; font-size: 0.8rem; font-weight: 600;';
    estadoBadge.innerHTML = `<span style="${badgeStyle}"><i class="bi bi-check-circle-fill"></i> Completa</span>`;
  } else if (estado === 'Parcial') {
    badgeStyle = 'display: inline-flex; align-items: center; gap: 0.25rem; background: #f59e0b; color: white; padding: 0.375rem 0.875rem; border-radius: 0.5rem; font-size: 0.8rem; font-weight: 600;';
    estadoBadge.innerHTML = `<span style="${badgeStyle}"><i class="bi bi-clock-fill"></i> Parcial</span>`;
  } else {
    badgeStyle = 'display: inline-flex; align-items: center; gap: 0.25rem; background: #6b7280; color: white; padding: 0.375rem 0.875rem; border-radius: 0.5rem; font-size: 0.8rem; font-weight: 600;';
    estadoBadge.innerHTML = `<span style="${badgeStyle}"><i class="bi bi-hourglass-split"></i> Pendiente</span>`;
  }

  // Totales
  const totales = ordenData.totales || {};
  document.getElementById('totalPiezas').textContent = (totales.totalPiezas || 0).toLocaleString('es-MX');
  document.getElementById('totalPaquetes').textContent = `${(totales.totalPaquetes || 0).toLocaleString('es-MX')} paquetes`;
  document.getElementById('totalInversion').textContent = `$${(totales.totalInversion || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById('totalVenta').textContent = `$${(totales.totalVentaEsperada || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  
  const margen = (totales.margenEsperado || 0);
  const margenElement = document.getElementById('margenEsperado');
  margenElement.textContent = `$${margen.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  margenElement.style.color = margen >= 0 ? '#10b981' : '#ef4444';

  // Renderizar productos recibidos
  renderizarProductosRecibidos();

  // Renderizar productos faltantes
  renderizarProductosFaltantes();
}

/**
 * Renderizar tabla de productos recibidos
 */
function renderizarProductosRecibidos() {
  const productosRecibidos = ordenData.productosRecibidos || [];
  const tbody = document.getElementById('tablaRecibidosBody');
  const badge = document.getElementById('badgeRecibidos');

  tbody.innerHTML = '';
  badge.textContent = `${productosRecibidos.length} producto${productosRecibidos.length !== 1 ? 's' : ''}`;

  if (productosRecibidos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #6b7280; padding: 2rem;">No hay productos recibidos</td></tr>';
    return;
  }

  productosRecibidos.forEach(producto => {
    const tr = document.createElement('tr');
    
    const variante = `${producto.color || ''} ${producto.dimensiones || ''}`.trim() || 'N/A';
    const imagenUrl = producto.imagen_url || '/images/placeholder-product.png';
    
    tr.innerHTML = `
      <td style="text-align: center; padding: 0.5rem;">
        <img src="${imagenUrl}" alt="${producto.nombreproducto}" 
             style="width: 50px; height: 50px; object-fit: cover; border-radius: 0.375rem; border: 1px solid #e5e7eb;"
             onerror="this.src='/images/placeholder-product.png'">
      </td>
      <td style="font-weight: 600;">${producto.nombreproducto || 'N/A'}</td>
      <td>${producto.categoria || 'N/A'}</td>
      <td style="font-size: 0.9rem;">${variante}</td>
      <td style="text-align: center; font-weight: 700;">${(producto.piezasRecibidas || 0).toLocaleString('es-MX')} pzas</td>
      <td style="text-align: right;">$${(producto.costounitario || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      <td style="text-align: right; font-weight: 600; color: #dc2626;">$${(producto.totalCosto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      <td style="text-align: right; color: #10b981;">$${(producto.preciounitario || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
    `;
    
    tbody.appendChild(tr);
  });
}

/**
 * Renderizar tabla de productos faltantes
 */
function renderizarProductosFaltantes() {
  const productosFaltantes = ordenData.productosFaltantes || [];
  const container = document.getElementById('productosFaltantesContainer');
  const tbody = document.getElementById('tablaFaltantesBody');
  const badge = document.getElementById('badgeFaltantes');

  if (productosFaltantes.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  tbody.innerHTML = '';
  badge.textContent = `${productosFaltantes.length} producto${productosFaltantes.length !== 1 ? 's' : ''}`;

  productosFaltantes.forEach(producto => {
    const tr = document.createElement('tr');
    
    const variante = `${producto.color || ''} ${producto.dimensiones || ''}`.trim() || 'N/A';
    const motivo = producto.motivo_discrepancia || 'Cerrado por merma';
    const imagenUrl = producto.imagen_url || '/images/placeholder-product.png';
    
    tr.innerHTML = `
      <td style="text-align: center; padding: 0.5rem;">
        <img src="${imagenUrl}" alt="${producto.nombreproducto}" 
             style="width: 50px; height: 50px; object-fit: cover; border-radius: 0.375rem; border: 1px solid #e5e7eb; opacity: 0.6;"
             onerror="this.src='/images/placeholder-product.png'">
      </td>
      <td style="font-weight: 600;">${producto.nombreproducto || 'N/A'}</td>
      <td>${producto.categoria || 'N/A'}</td>
      <td style="font-size: 0.9rem;">${variante}</td>
      <td style="text-align: center; font-weight: 700; color: #ef4444;">${(producto.piezasFaltantes || 0).toLocaleString('es-MX')} pzas</td>
      <td style="text-align: right;">$${(producto.costounitario || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      <td style="text-align: right; font-weight: 600; color: #dc2626;">$${(producto.totalCosto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
      <td style="font-size: 0.85rem; color: #6b7280;">${motivo}</td>
    `;
    
    tbody.appendChild(tr);
  });
}

/**
 * Generar PDF del detalle
 */
async function generarPDF() {
  if (!ordenData) return;

  try {
    Swal.fire({
      title: 'Generando PDF...',
      text: 'Por favor espera',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

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

    // Preparar datos para el módulo unificado de PDF
    const datosPDF = {
      orden: {
        ordenCompraId: ordenData.ordencompraid,
        proveedorNombre: ordenData.proveedor_nombre,
        estadoRecepcion: ordenData.estado_recepcion,
        fechaCreacion: ordenData.fechacreacion
      },
      productosRecibidos: (ordenData.productosRecibidos || []).map(p => ({
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
      productosFaltantes: (ordenData.productosFaltantes || []).map(p => ({
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
      sesion: ordenData.sesion ? {
        responsable: ordenData.sesion.responsable || ordenData.admin_nombre,
        fechaRecepcion: ordenData.sesion.fecha_ultima_actualizacion || ordenData.fechacreacion
      } : {
        responsable: ordenData.admin_nombre,
        fechaRecepcion: ordenData.fechacreacion
      },
      totales: ordenData.totales || {
        totalPiezas: 0,
        totalPaquetes: 0,
        totalInversion: 0,
        totalVentaEsperada: 0
      }
    };

    // Usar módulo unificado de generación de PDF
    await window.generarPDFEntradaAlmacen(datosPDF);

    Swal.fire({
      icon: 'success',
      title: 'PDF Generado',
      text: 'El reporte se ha descargado correctamente',
      confirmButtonColor: '#F97316'
    });

  } catch (error) {
    console.error('Error al generar PDF:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo generar el reporte PDF',
      confirmButtonColor: '#F97316'
    });
  }
}

/**
 * Mostrar error
 */
function mostrarError(mensaje) {
  loadingDetalle.style.display = 'none';
  detalleContainer.style.display = 'none';
  errorContainer.style.display = 'flex';
  errorMessage.textContent = mensaje;
}

/**
 * Event Listeners
 */
document.getElementById('btnGenerarPDF').addEventListener('click', generarPDF);

// Botón Ver CXP
document.getElementById('btnVerCXP').addEventListener('click', () => {
  const ordenId = getOrdenIdFromURL();
  if (ordenId) {
    window.location.href = `admin-cuentas-por-pagar.html?ordenId=${ordenId}`;
  } else {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo obtener el ID de la orden',
      confirmButtonColor: '#F97316'
    });
  }
});

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  cargarDetalle();
});
