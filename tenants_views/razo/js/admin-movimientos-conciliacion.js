/**
 * Admin - Conciliación de Inventario
 * Sistema de filtros avanzados para auditoría y reconciliación
 */

let ajustesData = [];
let totalesData = null;
let resumenTipoData = null;
let filtrosActivos = {};

document.addEventListener('DOMContentLoaded', async () => {
  await cargarSesionesAuditoria();
  await cargarOrdenesCompra();
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
 * Cargar sesiones de auditoría disponibles
 */
async function cargarSesionesAuditoria() {
  try {
    const token = localStorage.getItem('razoconnect_admin_token');
    if (!token) return;

    // Solo cargar sesiones APLICADAS (que ya entraron al inventario)
    const response = await fetch('/api/admin/inventario/sesiones?estatus=APLICADA', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Error al cargar sesiones');

    const result = await response.json();
    const sesiones = result.data || [];
    const select = document.getElementById('filtroSesion');
    
    if (!select) return;
    
    if (sesiones.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No hay sesiones de auditoría';
      option.disabled = true;
      select.appendChild(option);
      console.log('⚠️ No hay sesiones de auditoría disponibles');
    } else {
      sesiones.forEach(sesion => {
        const option = document.createElement('option');
        option.value = sesion.sesionid;
        option.textContent = `${sesion.nombre} (${new Date(sesion.fechacreacion).toLocaleDateString('es-MX')})`;
        select.appendChild(option);
      });
      console.log(`✅ Cargadas ${sesiones.length} sesiones de auditoría`);
    }
  } catch (error) {
    console.error('❌ Error cargando sesiones:', error);
  }
}

/**
 * Cargar órdenes de compra disponibles
 */
async function cargarOrdenesCompra() {
  try {
    const token = localStorage.getItem('razoconnect_admin_token');
    if (!token) return;

    // Solo cargar órdenes que tengan recepciones (Completa o Parcial)
    const response = await fetch('/api/admin/ordenes-compra?estatus=Pendiente,Parcial', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Error al cargar órdenes');

    const result = await response.json();
    const ordenes = result.data?.ordenes || result.data || [];
    const select = document.getElementById('filtroOrdenCompra');
    
    if (!select) return;
    
    if (ordenes.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No hay órdenes de compra';
      option.disabled = true;
      select.appendChild(option);
      console.log('⚠️ No hay órdenes de compra disponibles');
    } else {
      ordenes.forEach(orden => {
        const option = document.createElement('option');
        option.value = orden.ordencompraid;
        option.textContent = `OC #${orden.ordencompraid} - ${orden.proveedor_nombre || 'Sin proveedor'}`;
        select.appendChild(option);
      });
      console.log(`✅ Cargadas ${ordenes.length} órdenes de compra`);
    }
  } catch (error) {
    console.error('❌ Error cargando órdenes:', error);
  }
}

/**
 * Los tipos de movimiento ahora están hardcoded en el HTML:
 * - ORDEN_COMPRA: Entradas de Almacén (recepciones de OC)
 * - AUDITORIA: Sesiones de Auditoría (conteos físicos)
 * - AJUSTE_MANUAL: Ajustes Manuales genéricos
 * - MERMA: Mermas específicas
 * - ADICION: Adiciones específicas
 */

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
  
  // Restablecer fechas por defecto al limpiar
  document.getElementById('btnLimpiar').addEventListener('click', () => {
    setTimeout(establecerFechasPorDefecto, 100);
  });
}

/**
 * Aplicar filtros y cargar datos
 * ✅ REFACTORIZADO: Ahora trabaja con datos de trazabilidad de origen
 */
async function aplicarFiltros() {
  const fechaInicio = document.getElementById('filtroFechaInicio').value;
  const fechaFin = document.getElementById('filtroFechaFin').value;
  const tipoMovimiento = document.getElementById('filtroTipoMovimiento').value;
  const sesionId = document.getElementById('filtroSesion').value;
  const ordenCompraId = document.getElementById('filtroOrdenCompra').value;
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
    tipoMovimiento,
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
    const token = localStorage.getItem('razoconnect_admin_token');
    const params = new URLSearchParams();
    
    if (filtrosActivos.fechaInicio) params.append('fechaInicio', filtrosActivos.fechaInicio);
    if (filtrosActivos.fechaFin) params.append('fechaFin', filtrosActivos.fechaFin);
    
    // Filtrar por tipo de movimiento (tipo_origen en BD)
    if (filtrosActivos.tipoMovimiento) {
      params.append('tipoOrigen', filtrosActivos.tipoMovimiento);
    }
    if (filtrosActivos.referencia) params.append('referencia', filtrosActivos.referencia);
    
    const sesionValue = document.getElementById('filtroSesion').value;
    if (sesionValue && sesionValue !== 'TODAS') {
      params.append('sesionId', sesionValue);
    }
    
    const ordenValue = document.getElementById('filtroOrdenCompra').value;
    if (ordenValue && ordenValue !== 'TODAS') {
      params.append('ordenCompraId', ordenValue);
    }

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
    renderizarUsuarios();

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
    // ✅ Formato de fecha corto
    const fecha = new Date(ajuste.fecha).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit'
    });

    // ✅ Indicador de dirección (Entrada/Salida)
    const direccionHTML = ajuste.esEntrada 
      ? '<span class="direccion-movimiento direccion-entrada"><i class="bi bi-arrow-up-circle-fill"></i> Entrada</span>'
      : '<span class="direccion-movimiento direccion-salida"><i class="bi bi-arrow-down-circle-fill"></i> Salida</span>';
    
    // ✅ Badge de origen con icono
    const origenBadge = obtenerBadgeOrigen(ajuste.tipoOrigen);
    
    // ✅ Referencia clickeable
    const referenciaHTML = obtenerReferenciaHTML(ajuste);
    
    // Color visual indicator
    const colorHTML = ajuste.colorNombre
      ? (ajuste.colorHex 
          ? `<span style="display: inline-flex; align-items: center; gap: 0.35rem;">
              <span style="width: 16px; height: 16px; border-radius: 50%; background-color: ${ajuste.colorHex}; border: 1px solid #ddd; display: inline-block;"></span>
              <small>${ajuste.colorNombre}</small>
            </span>`
          : `<small>${ajuste.colorNombre}</small>`)
      : '<small class="text-muted">-</small>';
    
    // Calcular costo total
    const costoTotal = ajuste.totalPiezas * ajuste.costoUnitario;
    
    return `
      <tr>
        <td><small>${fecha}</small></td>
        <td><strong>${ajuste.productoNombre}</strong></td>
        <td>${colorHTML}</td>
        <td><small>${ajuste.dimensiones || '-'}</small></td>
        <td>${direccionHTML}</td>
        <td>${origenBadge}</td>
        <td>${referenciaHTML}</td>
        <td class="text-end"><strong>${ajuste.cantidad.toLocaleString('es-MX')}</strong></td>
        <td class="text-end">${ajuste.totalPiezas.toLocaleString('es-MX')}</td>
        <td class="text-end"><strong>$${ajuste.valorTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></td>
        <td class="text-end"><strong>$${costoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></td>
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
  
  // Calcular costo total
  const costoTotal = ajustesData.reduce((sum, ajuste) => {
    return sum + (ajuste.totalPiezas * ajuste.costoUnitario);
  }, 0);
  
  document.getElementById('totalPaquetes').textContent = 
    totalesData.totalPaquetes.toLocaleString('es-MX');
  
  document.getElementById('totalPiezas').textContent = 
    totalesData.totalPiezas.toLocaleString('es-MX');
  
  document.getElementById('valorTotal').textContent = 
    `$${totalesData.valorTotalizado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  
  document.getElementById('costoTotal').textContent = 
    `$${costoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

/**
 * Renderizar usuarios que afectaron el inventario
 */
function renderizarUsuarios() {
  const container = document.getElementById('usuariosContainer');
  const badgesContainer = document.getElementById('usuariosBadges');
  
  if (!ajustesData || ajustesData.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  // Obtener usuarios únicos con conteo de movimientos
  const usuariosMap = new Map();
  ajustesData.forEach(ajuste => {
    const userId = ajuste.usuarioId;
    const userName = ajuste.usuarioNombre;
    if (userId && userName) {
      if (usuariosMap.has(userId)) {
        usuariosMap.get(userId).count++;
      } else {
        usuariosMap.set(userId, { name: userName, count: 1 });
      }
    }
  });
  
  if (usuariosMap.size === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  
  // Renderizar badges de usuarios
  badgesContainer.innerHTML = Array.from(usuariosMap.entries())
    .sort((a, b) => b[1].count - a[1].count) // Ordenar por cantidad de movimientos
    .map(([userId, data]) => `
      <div class="usuario-badge" data-user-id="${userId}" onclick="filtrarPorUsuario(${userId}, '${data.name}')">
        <i class="bi bi-person-circle"></i>
        <span>${data.name}</span>
        <span class="badge bg-secondary ms-1">${data.count}</span>
      </div>
    `).join('');
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
      <div class="col-md-6 col-lg-4">
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
  document.getElementById('filtroTipoMovimiento').value = '';
  document.getElementById('filtroSesion').value = '';
  document.getElementById('filtroOrdenCompra').value = '';
  document.getElementById('filtroReferencia').value = '';
  
  filtrosActivos = {};
  ajustesData = [];
  totalesData = null;
  resumenTipoData = null;
  
  document.getElementById('tablaAjustes').innerHTML = `
    <tr>
      <td colspan="11" class="text-center text-muted">
        Selecciona los filtros y presiona "Filtrar" para ver resultados
      </td>
    </tr>
  `;
  
  document.getElementById('totalesCard').style.display = 'none';
  document.getElementById('resumenTipoContainer').style.display = 'none';
  document.getElementById('usuariosContainer').style.display = 'none';
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

    // Función para dibujar encabezado en cada página
    const drawHeader = (doc, pageNumber) => {
      // Logo Razo
      const logoImg = new Image();
      logoImg.src = '/icon/Logo_Razo.png';
      try {
        doc.addImage(logoImg, 'PNG', 40, 20, 50, 50);
      } catch (e) {
        console.warn('No se pudo cargar el logo');
      }

      // Título
      doc.setFontSize(18);
      doc.setTextColor(249, 115, 22);
      doc.text('REPORTE DE CONCILIACIÓN DE INVENTARIO', 100, 45);

      // Número de página
      doc.setFontSize(8);
      doc.setTextColor(107, 93, 87);
      const pageWidth = doc.internal.pageSize.width;
      doc.text(`Página ${pageNumber}`, pageWidth - 60, 30, { align: 'right' });
    };

    // Dibujar encabezado en primera página
    drawHeader(doc, 1);

    // Información de filtros
    doc.setFontSize(10);
    doc.setTextColor(107, 93, 87);
    let yPos = 80;
    
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

    // Tabla de ajustes (CON Color, CON Costo, CON Usuario, SIN emojis)
    const tableData = ajustesData.map(ajuste => {
      const fechaCorta = new Date(ajuste.fecha).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit'
      });
      const direccion = ajuste.esEntrada ? 'Entrada' : 'Salida';
      const origen = ajuste.tipoOrigen === 'ORDEN_COMPRA' ? 'OC' : 
                     ajuste.tipoOrigen === 'AUDITORIA' ? 'Auditoría' :
                     ajuste.tipoOrigen === 'MERMA' ? 'Merma' : 'Ajuste';
      const color = ajuste.colorNombre || '-';
      const costoTotal = ajuste.totalPiezas * ajuste.costoUnitario;
      
      return [
        fechaCorta,
        ajuste.productoNombre.substring(0, 22),
        color,
        ajuste.dimensiones || '-',
        direccion,
        origen,
        ajuste.cantidad.toLocaleString('es-MX'),
        ajuste.totalPiezas.toLocaleString('es-MX'),
        `$${ajuste.valorTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
        `$${costoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
        ajuste.usuarioNombre.substring(0, 12)
      ];
    });

    let currentPage = 1;

    doc.autoTable({
      startY: yPos,
      head: [['Fecha', 'Producto', 'Color', 'Dim.', 'Dirección', 'Origen', 'Cant.', 'Piezas', 'Valor', 'Costo', 'Usuario']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [249, 115, 22],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [60, 60, 60]
      },
      alternateRowStyles: {
        fillColor: [255, 247, 237]
      },
      columnStyles: {
        0: { cellWidth: 40, halign: 'center' },
        1: { cellWidth: 100, halign: 'left' },
        2: { cellWidth: 50, halign: 'center' },
        3: { cellWidth: 35, halign: 'center' },
        4: { cellWidth: 55, halign: 'center' },
        5: { cellWidth: 50, halign: 'center' },
        6: { cellWidth: 40, halign: 'right' },
        7: { cellWidth: 45, halign: 'right' },
        8: { cellWidth: 60, halign: 'right' },
        9: { cellWidth: 60, halign: 'right' },
        10: { cellWidth: 55, halign: 'left' }
      },
      margin: { left: 40, right: 40, top: 90 },
      showHead: 'everyPage',
      tableWidth: 'auto',
      halign: 'center',
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          currentPage = data.pageNumber;
          drawHeader(doc, currentPage);
        }
      }
    });

    // Box de totales de conciliación (ALINEADO A LA DERECHA)
    const finalY = doc.lastAutoTable.finalY + 30;
    const pageHeight = doc.internal.pageSize.height;
    
    // Si no hay espacio suficiente, agregar nueva página
    if (finalY + 100 > pageHeight - 40) {
      doc.addPage();
      currentPage++;
      drawHeader(doc, currentPage);
      var currentY = 90;
    } else {
      var currentY = finalY;
    }
    
    const pageWidth = doc.internal.pageSize.width;
    const boxWidth = 240;
    const boxHeight = 105;
    const boxX = pageWidth - boxWidth - 40; // Alineado a la derecha

    // Calcular costo total
    const costoTotal = ajustesData.reduce((sum, ajuste) => {
      return sum + (ajuste.totalPiezas * ajuste.costoUnitario);
    }, 0);

    // Fondo y borde
    doc.setFillColor(255, 247, 237);
    doc.setDrawColor(249, 115, 22);
    doc.setLineWidth(2);
    doc.roundedRect(boxX, currentY, boxWidth, boxHeight, 5, 5, 'FD');

    // Título
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(249, 115, 22);
    doc.text('TOTALES DE CONCILIACIÓN', boxX + boxWidth / 2, currentY + 20, { align: 'center' });

    // Línea separadora
    doc.setDrawColor(249, 115, 22);
    doc.setLineWidth(1);
    doc.line(boxX + 20, currentY + 28, boxX + boxWidth - 20, currentY + 28);

    // Totales
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    
    let textY = currentY + 42;
    doc.text(`Total Paquetes: ${totalesData.totalPaquetes.toLocaleString('es-MX')}`, boxX + 20, textY);
    
    textY += 15;
    doc.text(`Total Piezas: ${totalesData.totalPiezas.toLocaleString('es-MX')} pzas`, boxX + 20, textY);
    
    textY += 15;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    doc.text(`VALOR TOTAL: $${totalesData.valorTotalizado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, boxX + 20, textY);
    
    textY += 15;
    doc.setTextColor(220, 38, 38);
    doc.text(`COSTO TOTAL: $${costoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, boxX + 20, textY);

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
/**
 * Obtener badge HTML para el origen del movimiento
 * ✅ NUEVO: Badges visuales con iconos para cada tipo de origen
 */
function obtenerBadgeOrigen(tipoOrigen) {
  const badges = {
    'ORDEN_COMPRA': '<span class="badge-origen badge-origen-oc"><i class="bi bi-box-seam"></i> Orden de Compra</span>',
    'AUDITORIA': '<span class="badge-origen badge-origen-auditoria"><i class="bi bi-clipboard-check"></i> Auditoría</span>',
    'AJUSTE_MANUAL': '<span class="badge-origen badge-origen-ajuste"><i class="bi bi-pencil-square"></i> Ajuste Manual</span>',
    'MERMA': '<span class="badge-origen badge-origen-merma"><i class="bi bi-exclamation-triangle"></i> Merma</span>',
    'ADICION': '<span class="badge-origen badge-origen-adicion"><i class="bi bi-plus-circle"></i> Adición</span>'
  };
  return badges[tipoOrigen] || '<span class="badge-origen badge-origen-ajuste"><i class="bi bi-question-circle"></i> Otro</span>';
}

/**
 * Obtener HTML de referencia clickeable según el origen
 * ✅ NUEVO: Referencias clickeables a OC o Sesión de Auditoría con indicador de estado
 */
function obtenerReferenciaHTML(ajuste) {
  if (ajuste.ordenCompraId) {
    // Indicador de estado de recepción (Completa/Parcial)
    let estadoBadge = '';
    if (ajuste.estadoRecepcion === 'Completa') {
      estadoBadge = '<span style="display: inline-block; margin-left: 0.5rem; background: #10b981; color: white; padding: 0.15rem 0.5rem; border-radius: 0.75rem; font-size: 0.7rem; font-weight: 600;"><i class="bi bi-check-circle-fill"></i> Completa</span>';
    } else if (ajuste.estadoRecepcion === 'Parcial') {
      estadoBadge = '<span style="display: inline-block; margin-left: 0.5rem; background: #f59e0b; color: white; padding: 0.15rem 0.5rem; border-radius: 0.75rem; font-size: 0.7rem; font-weight: 600;"><i class="bi bi-clock-fill"></i> Parcial</span>';
    }
    
    return `<div style="display: flex; align-items: center; gap: 0.25rem;">
      <a href="/admin-ordenes-compra.html" class="referencia-origen" title="Ver Orden de Compra #${ajuste.ordenCompraNumero}" onclick="event.preventDefault(); window.location.href='/admin-ordenes-compra.html';">
        <i class="bi bi-box-arrow-up-right"></i> OC #${ajuste.ordenCompraNumero}
      </a>
      ${estadoBadge}
    </div>`;
  }
  
  if (ajuste.sesionAuditoriaId) {
    return `<a href="/admin-inventario-detalle.html?sesionId=${ajuste.sesionAuditoriaId}" class="referencia-origen" title="Ver Sesión: ${ajuste.sesionNombre || 'Sin nombre'}">
      <i class="bi bi-box-arrow-up-right"></i> ${ajuste.sesionNombre || `Sesión #${ajuste.sesionAuditoriaId}`}
    </a>`;
  }
  
  if (ajuste.ajusteManualId) {
    return `<span class="text-muted"><i class="bi bi-pencil"></i> Ajuste #${ajuste.ajusteManualId}</span>`;
  }
  
  return '<span class="text-muted">-</span>';
}

/**
 * Filtrar movimientos por usuario específico
 */
function filtrarPorUsuario(userId, userName) {
  // Remover clase active de todos los badges
  document.querySelectorAll('.usuario-badge').forEach(badge => {
    badge.classList.remove('active');
  });
  
  // Agregar clase active al badge clickeado
  const clickedBadge = document.querySelector(`.usuario-badge[data-user-id="${userId}"]`);
  if (clickedBadge) {
    clickedBadge.classList.add('active');
  }
  
  // Filtrar datos por usuario
  const ajustesFiltrados = ajustesData.filter(ajuste => ajuste.usuarioId === userId);
  
  // Guardar datos originales si no están guardados
  if (!window.ajustesDataOriginal) {
    window.ajustesDataOriginal = [...ajustesData];
  }
  
  // Actualizar ajustesData temporalmente
  const tempData = ajustesData;
  ajustesData = ajustesFiltrados;
  
  // Re-renderizar tabla
  renderizarTabla();
  
  // Mostrar mensaje de filtro activo
  Swal.fire({
    icon: 'info',
    title: `Filtrado por: ${userName}`,
    text: `Mostrando ${ajustesFiltrados.length} movimientos de este usuario`,
    confirmButtonColor: '#F97316',
    showCancelButton: true,
    cancelButtonText: 'Quitar Filtro',
    confirmButtonText: 'OK'
  }).then((result) => {
    if (result.isDismissed) {
      // Restaurar datos originales
      ajustesData = window.ajustesDataOriginal;
      window.ajustesDataOriginal = null;
      renderizarTabla();
      
      // Remover clase active
      document.querySelectorAll('.usuario-badge').forEach(badge => {
        badge.classList.remove('active');
      });
    }
  });
  
  // Restaurar datos después del render
  ajustesData = tempData;
}

function formatearTipoAjuste(tipo) {
  const tipos = {
    'ENTRADA': 'Conteo Inicial / Auditoría',
    'MERMA': 'Merma',
    'AJUSTE': 'Ajuste por Auditoría',
    'ADICION': 'Adición Manual'
  };
  return tipos[tipo] || tipo;
}

function obtenerBadgeClass(tipo) {
  const clases = {
    'ENTRADA': 'badge-entrada',
    'MERMA': 'badge-merma',
    'AJUSTE': 'badge-ajuste',
    'ADICION': 'badge-entrada'
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

// ✅ DEPRECADO: Reemplazado por obtenerReferenciaHTML()
// Mantener por compatibilidad temporal
function determinarOrigen(motivo, sesionNombre) {
  if (!motivo && !sesionNombre) return 'Manual';
  
  const motivoLower = (motivo || '').toLowerCase();
  
  if (motivoLower.includes('recepci') || motivoLower.includes('orden') || motivoLower.includes('compra')) {
    return 'Entrada Almacén';
  }
  
  if (sesionNombre || motivoLower.includes('conteo') || motivoLower.includes('inventario inicial')) {
    return 'Conteo Inicial';
  }
  
  if (motivoLower.includes('ajuste') || motivoLower.includes('correcci')) {
    return 'Ajuste Manual';
  }
  
  if (motivoLower.includes('merma') || motivoLower.includes('dañ') || motivoLower.includes('robo')) {
    return 'Merma';
  }
  
  return 'Otro';
}

function mostrarLoading(mostrar) {
  const overlay = document.getElementById('loading-overlay');
  overlay.style.display = mostrar ? 'flex' : 'none';
}
