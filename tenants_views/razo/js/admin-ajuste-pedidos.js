let pedidoAjusteActual = null;
let productosActualesPedido = [];
let productosParaAgregarLista = [];
let itemsParaEliminar = [];
let itemsParaModificar = [];
let busquedaTimeout = null;

async function abrirModalAjuste(pedidoId) {
  pedidoAjusteActual = pedidoId;
  productosActualesPedido = [];
  productosParaAgregarLista = [];
  itemsParaEliminar = [];
  itemsParaModificar = [];

  document.getElementById('ajustePedidoId').textContent = pedidoId;
  document.getElementById('ajusteModal').style.display = 'flex';
  document.getElementById('buscarProductoInput').value = '';
  document.getElementById('resultadosBusqueda').style.display = 'none';
  document.getElementById('productosParaAgregar').style.display = 'none';
  document.getElementById('resumenCambios').style.display = 'none';

  await cargarProductosPedido(pedidoId);
}

function cerrarModalAjuste() {
  document.getElementById('ajusteModal').style.display = 'none';
  pedidoAjusteActual = null;
  productosActualesPedido = [];
  productosParaAgregarLista = [];
  itemsParaEliminar = [];
  itemsParaModificar = [];
}

async function cargarProductosPedido(pedidoId) {
  console.log('🔍 Cargando productos para pedido:', pedidoId);
  
  const loadingEl = document.getElementById('loadingProductosActuales');
  const tablaEl = document.getElementById('tablaProductosActuales');
  const bodyEl = document.getElementById('productosActualesBody');

  loadingEl.style.display = 'flex';
  tablaEl.style.display = 'none';

  try {
    const token = localStorage.getItem('razoconnect_admin_token');
    const url = `${API_BASE_URL}/admin/pedidos/${pedidoId}/detalle`;
    console.log('📡 URL de petición:', url);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) throw new Error('Error al cargar pedido');

    const data = await response.json();
    console.log('📦 Datos recibidos:', data);
    
    if (data.success && data.data) {
      // El backend devuelve data.data.productos, no items
      const productos = data.data.productos || [];
      
      // Mapear los campos del backend al formato que espera el frontend
      productosActualesPedido = productos.map(p => ({
        detalleId: p.detalleId,
        varianteId: p.varianteId,
        sku: p.sku,
        nombreProducto: p.nombre,
        presentacion: p.dimensiones || 'N/A',
        cantidad: p.cantidadPaquetes,
        precioPorPaquete: p.precioPorPaquete,
        subtotal: p.subtotal,
        esBackorder: p.esBackorder || false
      }));
      
      console.log('✅ Productos mapeados:', productosActualesPedido);
      renderizarProductosActuales();
      tablaEl.style.display = 'table';
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error al cargar productos del pedido', 'error');
  } finally {
    loadingEl.style.display = 'none';
  }
}

function renderizarProductosActuales() {
  const bodyEl = document.getElementById('productosActualesBody');
  
  if (productosActualesPedido.length === 0) {
    bodyEl.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--razo-gray-warm);">No hay productos en el pedido</td></tr>';
    return;
  }

  bodyEl.innerHTML = productosActualesPedido.map(item => {
    const itemModificado = itemsParaModificar.find(m => m.detalleId === item.detalleId);
    const itemEliminado = itemsParaEliminar.includes(item.detalleId);
    const cantidadActual = itemModificado ? itemModificado.cantidad : item.cantidad;
    const subtotal = cantidadActual * parseFloat(item.precioPorPaquete || 0);
    
    // Determinar si es backorder o surtido
    const esBackorder = item.esBackorder || false;
    const badgeEstado = esBackorder
      ? '<span style="background: #f59e0b; color: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600;">⚠ Bajo Pedido</span>'
      : '<span style="background: #10b981; color: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600;">✓ Surtido</span>';

    return `
      <tr style="${itemEliminado ? 'opacity: 0.5; text-decoration: line-through;' : ''}">
        <td>${item.sku}</td>
        <td>${item.nombreProducto}</td>
        <td>${item.presentacion || 'N/A'}</td>
        <td>${badgeEstado}</td>
        <td>
          ${!itemEliminado ? `
            <input 
              type="number" 
              min="1" 
              value="${cantidadActual}" 
              onchange="modificarCantidadItem(${item.detalleId}, this.value)"
              style="width: 80px; padding: 0.5rem; border: 1px solid var(--razo-gray-light); border-radius: 0.25rem;"
            />
          ` : cantidadActual}
        </td>
        <td>$${parseFloat(item.precioPorPaquete || 0).toFixed(2)}</td>
        <td><strong>$${subtotal.toFixed(2)}</strong></td>
        <td>
          ${!itemEliminado ? `
            <button 
              class="btn btn-danger" 
              style="padding: 0.5rem 1rem; font-size: 0.875rem;"
              onclick="marcarParaEliminar(${item.detalleId})">
              🗑️ Eliminar
            </button>
          ` : `
            <button 
              class="btn btn-secondary" 
              style="padding: 0.5rem 1rem; font-size: 0.875rem;"
              onclick="desmarcarParaEliminar(${item.detalleId})">
              ↩️ Restaurar
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');

  actualizarResumen();
}

function modificarCantidadItem(detalleId, nuevaCantidad) {
  const cantidad = parseInt(nuevaCantidad, 10);
  if (!cantidad || cantidad <= 0) {
    showToast('La cantidad debe ser mayor a 0', 'warning');
    renderizarProductosActuales();
    return;
  }

  const item = productosActualesPedido.find(p => p.detalleId === detalleId);
  if (!item) return;

  if (cantidad === item.cantidad) {
    itemsParaModificar = itemsParaModificar.filter(m => m.detalleId !== detalleId);
  } else {
    const existente = itemsParaModificar.find(m => m.detalleId === detalleId);
    if (existente) {
      existente.cantidad = cantidad;
    } else {
      itemsParaModificar.push({ detalleId, cantidad });
    }
  }

  renderizarProductosActuales();
}

function marcarParaEliminar(detalleId) {
  if (!itemsParaEliminar.includes(detalleId)) {
    itemsParaEliminar.push(detalleId);
  }
  renderizarProductosActuales();
}

function desmarcarParaEliminar(detalleId) {
  itemsParaEliminar = itemsParaEliminar.filter(id => id !== detalleId);
  renderizarProductosActuales();
}

document.getElementById('buscarProductoInput')?.addEventListener('input', function(e) {
  const query = e.target.value.trim();
  
  if (busquedaTimeout) clearTimeout(busquedaTimeout);

  if (query.length < 2) {
    document.getElementById('resultadosBusqueda').style.display = 'none';
    return;
  }

  busquedaTimeout = setTimeout(() => buscarProductos(query), 300);
});

async function buscarProductos(query) {
  const resultadosEl = document.getElementById('resultadosBusqueda');
  
  // Mostrar spinner de carga
  resultadosEl.innerHTML = `
    <div class="search-loading">
      <div class="search-spinner"></div>
      <p style="margin-top: 0.5rem;">Buscando productos...</p>
    </div>
  `;
  resultadosEl.style.display = 'block';

  try {
    const token = localStorage.getItem('razoconnect_admin_token');
    const response = await fetch(`${API_BASE_URL}/admin/productos/buscar?q=${encodeURIComponent(query)}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.success && data.data && data.data.length > 0) {
      mostrarResultadosBusqueda(data.data);
    } else {
      resultadosEl.innerHTML = `
        <div class="search-empty">
          <p style="font-size: 1.5rem; margin-bottom: 0.5rem;">🔍</p>
          <p>No se encontraron productos</p>
          <p style="font-size: 0.875rem; margin-top: 0.25rem;">Intenta con otro término de búsqueda</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('❌ Error en búsqueda:', error);
    resultadosEl.innerHTML = `
      <div class="search-empty">
        <p style="font-size: 1.5rem; margin-bottom: 0.5rem; color: #dc2626;">⚠️</p>
        <p style="color: #dc2626; font-weight: 600;">Error al buscar productos</p>
        <p style="font-size: 0.875rem; margin-top: 0.25rem;">${error.message}</p>
      </div>
    `;
  }
}

function mostrarResultadosBusqueda(productos) {
  const resultadosEl = document.getElementById('resultadosBusqueda');

  if (!productos || productos.length === 0) {
    resultadosEl.innerHTML = `
      <div class="search-empty">
        <p style="font-size: 1.5rem; margin-bottom: 0.5rem;">🔍</p>
        <p>No se encontraron productos</p>
      </div>
    `;
    return;
  }

  resultadosEl.innerHTML = productos.map(producto => {
    return producto.variantes.map(variante => {
      return variante.tamanos.map(tamano => {
        // Verificar si ya está en la lista de agregar
        const yaEnListaAgregar = productosParaAgregarLista.some(p => 
          p.varianteId === variante.varianteId && p.tamanoId === tamano.tamanoId
        );

        // Verificar si ya está en el pedido actual
        const yaEnPedido = productosActualesPedido.some(p => 
          p.varianteId === variante.varianteId
        );

        const stockDisponible = variante.stock > 0;
        const badgeClass = stockDisponible ? 'badge-stock-ok' : 'badge-stock-low';
        const badgeIcon = stockDisponible ? '✓' : '⚠';
        const badgeText = stockDisponible ? 'En Stock' : 'Bajo Pedido';

        const imagenUrl = variante.imagenUrl;
        const imagenHtml = imagenUrl 
          ? `<img src="${imagenUrl}" alt="${producto.nombreProducto}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 0.5rem;" onerror="this.onerror=null; this.parentElement.innerHTML='📦';">`
          : '📦';

        return `
          <div class="search-result-item">
            <div class="search-result-info">
              <div class="search-result-title">${producto.nombreProducto}</div>
              <div class="search-result-meta">
                <span><strong>SKU:</strong> ${variante.sku}</span>
                <span>•</span>
                <span>${variante.dimensiones}</span>
                ${variante.colorNombre ? `<span>•</span><span>${variante.colorNombre}</span>` : ''}
                <span>•</span>
                <span>${tamano.cantidad} piezas</span>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
                <span class="search-result-badge ${badgeClass}">${badgeIcon} ${badgeText}</span>
                <span style="font-size: 0.875rem; color: var(--razo-gray-warm);">${variante.stock} piezas disponibles</span>
              </div>
            </div>
            <div class="search-result-image">
              ${imagenHtml}
            </div>
            <div class="search-result-action">
              <button 
                class="btn ${yaEnListaAgregar ? 'btn-secondary' : 'btn-success'}" 
                style="padding: 0.5rem 1.25rem; font-size: 0.875rem; white-space: nowrap; min-width: 120px;"
                onclick="agregarOIncrementarProducto(${variante.varianteId}, ${tamano.tamanoId}, '${variante.sku}', '${producto.nombreProducto.replace(/'/g, "\\'")}', '${tamano.cantidad} piezas', ${variante.stock}, ${variante.precioUnitario || 0}, ${variante.piezasPorPaquete || 1})"
                ${yaEnListaAgregar ? 'disabled' : ''}>
                ${yaEnListaAgregar ? '✓ Agregado' : yaEnPedido ? '+ Incrementar' : '+ Agregar'}
              </button>
            </div>
          </div>
        `;
      }).join('');
    }).join('');
  }).join('');
}

function agregarOIncrementarProducto(varianteId, tamanoId, sku, nombreProducto, presentacion, stock, precioUnitario, piezasPorPaquete) {
  // Verificar si ya está en el pedido actual
  const itemEnPedido = productosActualesPedido.find(p => p.varianteId === varianteId);
  
  if (itemEnPedido) {
    // Si ya está en el pedido, incrementar cantidad
    const nuevaCantidad = itemEnPedido.cantidad + 1;
    modificarCantidadItem(itemEnPedido.detalleId, nuevaCantidad);
    showToast(`Cantidad incrementada: ${nombreProducto}`, 'success');
    document.getElementById('buscarProductoInput').value = '';
    document.getElementById('resultadosBusqueda').style.display = 'none';
    return;
  }

  // Verificar si ya está en la lista de agregar
  const yaEnLista = productosParaAgregarLista.some(p => 
    p.varianteId === varianteId && p.tamanoId === tamanoId
  );

  if (yaEnLista) {
    showToast('Este producto ya está en la lista para agregar', 'warning');
    return;
  }

  // Agregar a la lista
  productosParaAgregarLista.push({
    varianteId,
    tamanoId,
    sku,
    nombreProducto,
    presentacion,
    stock,
    precioUnitario,
    piezasPorPaquete,
    cantidad: 1
  });

  renderizarProductosParaAgregar();
  document.getElementById('buscarProductoInput').value = '';
  document.getElementById('resultadosBusqueda').style.display = 'none';
  actualizarResumen();
  showToast(`Producto agregado: ${nombreProducto}`, 'success');
}

// Cerrar dropdown al hacer clic fuera
document.addEventListener('click', function(e) {
  const searchContainer = document.querySelector('.search-container');
  const resultadosEl = document.getElementById('resultadosBusqueda');
  
  if (searchContainer && resultadosEl && !searchContainer.contains(e.target)) {
    resultadosEl.style.display = 'none';
  }
});

function renderizarProductosParaAgregar() {
  const containerEl = document.getElementById('productosParaAgregar');
  const bodyEl = document.getElementById('productosAgregarBody');

  if (productosParaAgregarLista.length === 0) {
    containerEl.style.display = 'none';
    return;
  }

  containerEl.style.display = 'block';
  bodyEl.innerHTML = productosParaAgregarLista.map((producto, index) => `
    <tr>
      <td>${producto.sku}</td>
      <td>${producto.nombreProducto}</td>
      <td>${producto.presentacion}</td>
      <td>
        <input 
          type="number" 
          min="1" 
          max="${Math.floor(producto.stock / (producto.piezasPorPaquete || 1))}"
          value="${producto.cantidad}" 
          onchange="cambiarCantidadAgregar(${index}, this.value)"
          style="width: 80px; padding: 0.5rem; border: 1px solid var(--razo-gray-light); border-radius: 0.25rem;"
        />
      </td>
      <td style="color: ${producto.stock > 0 ? 'green' : 'red'};">${producto.stock} piezas</td>
      <td>
        <button 
          class="btn btn-danger" 
          style="padding: 0.5rem 1rem; font-size: 0.875rem;"
          onclick="quitarDeListaAgregar(${index})">
          🗑️ Quitar
        </button>
      </td>
    </tr>
  `).join('');
}

function cambiarCantidadAgregar(index, nuevaCantidad) {
  const cantidad = parseInt(nuevaCantidad, 10);
  if (!cantidad || cantidad <= 0) {
    showToast('La cantidad debe ser mayor a 0', 'warning');
    renderizarProductosParaAgregar();
    return;
  }

  productosParaAgregarLista[index].cantidad = cantidad;
  actualizarResumen();
}

function quitarDeListaAgregar(index) {
  productosParaAgregarLista.splice(index, 1);
  renderizarProductosParaAgregar();
  actualizarResumen();
}

function actualizarResumen() {
  const resumenEl = document.getElementById('resumenCambios');
  const contenidoEl = document.getElementById('resumenCambiosContenido');

  const hayCambios = itemsParaEliminar.length > 0 || 
                     itemsParaModificar.length > 0 || 
                     productosParaAgregarLista.length > 0;

  if (!hayCambios) {
    resumenEl.style.display = 'none';
    return;
  }

  let html = '<ul style="margin: 0; padding-left: 1.5rem;">';

  if (itemsParaEliminar.length > 0) {
    html += `<li><strong>Productos a eliminar:</strong> ${itemsParaEliminar.length}</li>`;
  }

  if (itemsParaModificar.length > 0) {
    html += `<li><strong>Productos a modificar:</strong> ${itemsParaModificar.length}</li>`;
  }

  if (productosParaAgregarLista.length > 0) {
    html += `<li><strong>Productos a agregar:</strong> ${productosParaAgregarLista.length}</li>`;
  }

  html += '</ul>';
  contenidoEl.innerHTML = html;
  resumenEl.style.display = 'block';
}

async function aplicarAjustePedido() {
  if (!pedidoAjusteActual) return;

  const hayCambios = itemsParaEliminar.length > 0 || 
                     itemsParaModificar.length > 0 || 
                     productosParaAgregarLista.length > 0;

  if (!hayCambios) {
    showToast('No hay cambios para aplicar', 'warning');
    return;
  }

  const confirmacion = await Swal.fire({
    icon: 'question',
    title: '¿Aplicar ajustes al pedido?',
    html: `
      <p>Se realizarán los siguientes cambios:</p>
      <ul style="text-align: left; margin: 1rem auto; max-width: 400px;">
        ${itemsParaEliminar.length > 0 ? `<li>Eliminar ${itemsParaEliminar.length} producto(s)</li>` : ''}
        ${itemsParaModificar.length > 0 ? `<li>Modificar ${itemsParaModificar.length} producto(s)</li>` : ''}
        ${productosParaAgregarLista.length > 0 ? `<li>Agregar ${productosParaAgregarLista.length} producto(s)</li>` : ''}
      </ul>
      <p style="color: #856404; background: #fff3cd; padding: 0.75rem; border-radius: 0.25rem; margin-top: 1rem;">
        <strong>⚠️</strong> El inventario se actualizará automáticamente.
      </p>
    `,
    showCancelButton: true,
    confirmButtonText: 'Sí, aplicar cambios',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#F97316',
    cancelButtonColor: '#6c757d'
  });

  if (!confirmacion.isConfirmed) return;

  const btnAplicar = document.getElementById('btnAplicarAjuste');
  const btnText = document.getElementById('btnAplicarAjusteText');
  const btnSpinner = document.getElementById('btnAplicarAjusteSpinner');

  try {
    btnAplicar.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'block';

    const token = localStorage.getItem('razoconnect_admin_token');
    const payload = {
      itemsEliminar: itemsParaEliminar,
      itemsModificar: itemsParaModificar,
      itemsAgregar: productosParaAgregarLista.map(p => ({
        varianteId: p.varianteId,
        tamanoId: p.tamanoId,
        cantidad: p.cantidad
      }))
    };

    const response = await fetch(`${API_BASE_URL}/admin/pedidos/${pedidoAjusteActual}/ajustar`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok && data.success) {
      await Swal.fire({
        icon: 'success',
        title: 'Pedido ajustado exitosamente',
        html: `
          <div style="text-align: left; margin: 1rem 0;">
            <p><strong>Monto anterior:</strong> $${data.data.montoAnterior.toFixed(2)}</p>
            <p><strong>Monto nuevo:</strong> $${data.data.montoNuevo.toFixed(2)}</p>
            <p><strong>Diferencia:</strong> <span style="color: ${data.data.diferencia >= 0 ? 'green' : 'red'};">
              ${data.data.diferencia >= 0 ? '+' : ''}$${data.data.diferencia.toFixed(2)}
            </span></p>
          </div>
        `,
        confirmButtonColor: '#F97316'
      });

      cerrarModalAjuste();
      loadOrders();
    } else {
      throw new Error(data.message || 'Error al ajustar pedido');
    }
  } catch (error) {
    console.error('Error:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || 'Error al aplicar los ajustes',
      confirmButtonColor: '#F97316'
    });
  } finally {
    btnAplicar.disabled = false;
    btnText.style.display = 'inline';
    btnSpinner.style.display = 'none';
  }
}
