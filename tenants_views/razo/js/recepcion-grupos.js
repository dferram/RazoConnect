/**
 * Módulo para manejar recepción de grupos de órdenes
 * Muestra todas las órdenes del grupo simultáneamente
 */

let grupoActual = null;
let ordenesDelGrupoActual = [];

/**
 * Cargar y mostrar todas las órdenes de un grupo
 */
async function cargarGrupoCompleto(grupoId) {
  try {
    setLoading(true);
    
    // Cargar datos del grupo
    const response = await apiCall(`/admin/ordenes-compra/grupos/${grupoId}`, {
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error('Error al cargar el grupo');
    }

    grupoActual = response.data.grupo;
    ordenesDelGrupoActual = response.data.ordenes || [];

    console.log('[GRUPO] Cargando grupo completo:', grupoActual.nombre_grupo);
    console.log('[GRUPO] Órdenes a mostrar:', ordenesDelGrupoActual.length);

    // Actualizar badge de grupo (pequeño)
    const tipoBadge = document.getElementById('tipoBadge');
    if (tipoBadge) {
      tipoBadge.innerHTML = '<i class="bi bi-collection"></i> GRUPO';
      tipoBadge.className = 'admin-badge';
      tipoBadge.style.cssText = 'display: inline-flex; align-items: center; gap: 0.25rem; background: #8b5cf6; color: white; font-size: 0.75rem; padding: 0.25rem 0.75rem;';
    }

    // Renderizar todas las órdenes del grupo
    await renderizarOrdenesGrupo();

    setLoading(false);
  } catch (error) {
    console.error('[GRUPO] Error:', error);
    setLoading(false);
    setEmpty('Error al cargar el grupo de órdenes');
  }
}


/**
 * Renderizar todas las órdenes del grupo simultáneamente
 */
async function renderizarOrdenesGrupo() {
  const recepcionSplit = document.getElementById('recepcionSplit');
  if (!recepcionSplit) return;

  recepcionSplit.innerHTML = '';
  recepcionSplit.style.display = 'block';

  // Ocultar mensajes de vacío/loading
  const recepcionEmpty = document.getElementById('recepcionEmpty');
  const recepcionLoading = document.getElementById('recepcionLoading');
  if (recepcionEmpty) recepcionEmpty.style.display = 'none';
  if (recepcionLoading) recepcionLoading.style.display = 'none';

  // Agregar botones de exportación al inicio
  agregarBotonesExportacion(recepcionSplit);

  // Renderizar cada orden del grupo
  for (const orden of ordenesDelGrupoActual) {
    await renderizarOrdenEnGrupo(orden, recepcionSplit);
  }
}

/**
 * Agregar botones de exportación PDF/Excel
 */
function agregarBotonesExportacion(container) {
  const botonesDiv = document.createElement('div');
  botonesDiv.style.cssText = 'display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap;';
  botonesDiv.innerHTML = `
    <button id="btnPDFProveedor" class="btn" style="background: #10b981; color: white;">
      <i class="bi bi-file-pdf"></i> PDF Proveedor
    </button>
    <button id="btnPDFInterno" class="btn" style="background: #f97316; color: white;">
      <i class="bi bi-file-pdf"></i> PDF Interno
    </button>
    <button id="btnExcelProveedor" class="btn" style="background: #059669; color: white;">
      <i class="bi bi-file-excel"></i> Excel Proveedor
    </button>
    <button id="btnExcelInterno" class="btn" style="background: #ea580c; color: white;">
      <i class="bi bi-file-excel"></i> Excel Interno
    </button>
  `;
  container.appendChild(botonesDiv);

  // Agregar event listeners
  setTimeout(() => {
    document.getElementById('btnPDFProveedor')?.addEventListener('click', () => descargarPDF('proveedor'));
    document.getElementById('btnPDFInterno')?.addEventListener('click', () => descargarPDF('interno'));
    document.getElementById('btnExcelProveedor')?.addEventListener('click', () => descargarExcel('proveedor'));
    document.getElementById('btnExcelInterno')?.addEventListener('click', () => descargarExcel('interno'));
  }, 100);
}

/**
 * Descargar PDF del grupo
 */
async function descargarPDF(tipo) {
  if (!grupoActual) return;

  try {
    Swal.fire({
      title: 'Generando PDF...',
      text: `Preparando PDF ${tipo === 'proveedor' ? 'para el proveedor' : 'interno'}`,
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    const endpoint = tipo === 'proveedor' 
      ? `/admin/ordenes-compra/grupos/${grupoActual.grupoid}/pdf-proveedor`
      : `/admin/ordenes-compra/grupos/${grupoActual.grupoid}/pdf-interno`;

    const response = await API.apiCall(endpoint, {
      method: 'GET',
      responseType: 'blob'
    });

    if (!response.ok) {
      throw new Error('Error al generar PDF');
    }

    const blob = response.data;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Grupo-${grupoActual.grupoid}-${tipo}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    Swal.fire({
      icon: 'success',
      title: 'PDF Generado',
      text: 'El archivo se ha descargado correctamente',
      confirmButtonColor: '#F97316'
    });
  } catch (error) {
    console.error('Error descargando PDF:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo generar el PDF',
      confirmButtonColor: '#F97316'
    });
  }
}

/**
 * Descargar Excel del grupo
 */
async function descargarExcel(tipo) {
  if (!grupoActual) return;

  try {
    Swal.fire({
      title: 'Generando Excel...',
      text: `Preparando Excel ${tipo === 'proveedor' ? 'para el proveedor' : 'interno'}`,
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    const endpoint = tipo === 'proveedor'
      ? `/admin/ordenes-compra/grupos/${grupoActual.grupoid}/excel-proveedor`
      : `/admin/ordenes-compra/grupos/${grupoActual.grupoid}/excel-interno`;

    const response = await API.apiCall(endpoint, {
      method: 'GET',
      responseType: 'blob'
    });

    if (!response.ok) {
      throw new Error('Error al generar Excel');
    }

    const blob = response.data;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Grupo-${grupoActual.grupoid}-${tipo}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    Swal.fire({
      icon: 'success',
      title: 'Excel Generado',
      text: 'El archivo se ha descargado correctamente',
      confirmButtonColor: '#F97316'
    });
  } catch (error) {
    console.error('Error descargando Excel:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo generar el Excel',
      confirmButtonColor: '#F97316'
    });
  }
}

/**
 * Renderizar una orden individual dentro del grupo
 */
async function renderizarOrdenEnGrupo(orden, container) {
  console.log(`[GRUPO] Cargando detalles de orden ${orden.ordencompraid}...`);
  
  // Cargar detalles de la orden usando el mismo endpoint que loadRecepcion
  const detallesResp = await apiCall(`/admin/ordenes-compra/${orden.ordencompraid}/detalles`, {
    method: 'GET'
  });

  console.log(`[GRUPO] Respuesta API para orden ${orden.ordencompraid}:`, detallesResp);

  if (!detallesResp.ok) {
    console.error(`[GRUPO] Error cargando orden ${orden.ordencompraid}:`, detallesResp);
    return;
  }

  // El endpoint devuelve { orden, detalles }
  const responseData = detallesResp.data || {};
  const items = responseData.detalles || [];
  console.log(`[GRUPO] Orden ${orden.ordencompraid} - Items recibidos:`, items.length);
  if (items.length > 0) {
    console.log(`[GRUPO] Orden ${orden.ordencompraid} - Primer item:`, items[0]);
  }

  // Crear sección para esta orden
  const seccionOrden = document.createElement('div');
  seccionOrden.className = 'admin-card';
  seccionOrden.style.cssText = 'padding: 1.5rem; margin-bottom: 1.5rem; border-left: 4px solid #8b5cf6;';

  // Header de la orden
  const creador = orden.admin_creador_nombre || orden.usuario_creador_nombre || 'Sistema';
  const fechaOrden = new Date(orden.fechacreacion).toLocaleDateString('es-MX');
  
  const pendientesCount = items.filter(item => {
    const solicitado = item.cantidadSolicitada || 0;
    const recibido = item.cantidadRecibida || 0;
    return solicitado > recibido;
  }).length;

  seccionOrden.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
      <div style="font-weight: 800; color: #111827">
        📜 Orden #${orden.ordencompraid} - Productos Pendientes de Recibir
      </div>
      <div id="pendienteBadge-${orden.ordencompraid}" class="admin-badge info">${pendientesCount} PENDIENTES</div>
    </div>
    
    <div class="table-responsive">
      <table class="admin-table">
        <thead class="thead-sticky thead-pendiente">
          <tr>
            <th style="width: 60px">Imagen</th>
            <th style="min-width: 200px">Producto</th>
            <th style="min-width: 120px">Categoría</th>
            <th style="min-width: 120px">Color</th>
            <th style="min-width: 150px">Dimensiones</th>
            <th style="text-align: center; width: 120px">Solicitado (pzas)</th>
            <th style="text-align: center; width: 120px">Por recibir (pzas)</th>
            <th style="width: 140px">Cantidad hoy (pzas)</th>
            <th style="width: 140px"></th>
          </tr>
        </thead>
        <tbody id="tbody-orden-${orden.ordencompraid}">
        </tbody>
      </table>
    </div>
  `;

  container.appendChild(seccionOrden);

  // Poblar tabla con productos
  const tbody = document.getElementById(`tbody-orden-${orden.ordencompraid}`);
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem; color: #6b7280;">No hay productos en esta orden</td></tr>';
  } else {
    let productosAgregados = 0;
    items.forEach(item => {
      const tr = crearFilaProducto(item, orden.ordencompraid);
      if (tr) {
        tbody.appendChild(tr);
        productosAgregados++;
      }
    });
    console.log(`[GRUPO] Orden ${orden.ordencompraid} - Productos mostrados: ${productosAgregados}`);
    
    if (productosAgregados === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem; color: #6b7280;">Todos los productos de esta orden ya fueron recibidos</td></tr>';
    }
  }
}

/**
 * Crear fila de producto (reutiliza lógica existente)
 */
function crearFilaProducto(item, ordenId) {
  const tr = document.createElement('tr');
  
  // Mapear campos del endpoint
  const solicitadoPzas = item.cantidadSolicitada || 0;
  const recibidoPzas = item.cantidadRecibida || 0;
  const porRecibirPzas = item.cantidadPendiente || Math.max(0, solicitadoPzas - recibidoPzas);
  const piezasPorPaquete = item.piezasPorPaquete || 1;

  console.log(`[GRUPO] Producto: ${item.nombreProducto}, Solicitado: ${solicitadoPzas}, Recibido: ${recibidoPzas}, Pendiente: ${porRecibirPzas}`);

  // Solo mostrar si hay pendientes por recibir
  if (porRecibirPzas <= 0) {
    console.log(`[GRUPO] Producto ${item.nombreProducto} omitido - ya recibido completamente`);
    return null;
  }

  tr.innerHTML = `
    <td>
      <div style="width: 50px; height: 50px; background: #e5e7eb; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center;"><i class="bi bi-image" style="color: #9ca3af;"></i></div>
    </td>
    <td style="font-weight: 500;">${item.nombreProducto || 'Sin nombre'}</td>
    <td>N/A</td>
    <td>N/A</td>
    <td>${item.dimensiones || 'N/A'}</td>
    <td style="text-align: center; font-weight: 600; color: #f97316;">${solicitadoPzas}</td>
    <td style="text-align: center; font-weight: 600; color: #10b981;">${porRecibirPzas}</td>
    <td>
      <input 
        type="number" 
        class="form-input cantidad-hoy" 
        data-detalle-id="${item.detalleId}"
        data-orden-id="${ordenId}"
        min="0" 
        max="${porRecibirPzas}"
        value="0"
        style="text-align: center;"
      />
    </td>
    <td>
      <button 
        class="btn btn-sm btn-agregar-sesion" 
        data-detalle-id="${item.detalleId}"
        data-orden-id="${ordenId}"
        style="background: #10b981; color: white; width: 100%;"
      >
        <i class="bi bi-plus-circle"></i> Agregar
      </button>
    </td>
  `;

  return tr;
}

// Exportar funciones
window.cargarGrupoCompleto = cargarGrupoCompleto;
