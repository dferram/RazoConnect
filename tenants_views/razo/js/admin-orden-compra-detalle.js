let ordenCompraId = null;
let ordenCompraData = null;
let productosOriginales = [];
let productoSeleccionado = null;

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  ordenCompraId = urlParams.get('id');

  if (!ordenCompraId) {
    Swal.fire('Error', 'No se especificó el ID de la orden de compra', 'error')
      .then(() => window.location.href = 'admin-ordenes-compra.html');
    return;
  }

  await cargarOrdenCompra();
  inicializarEventos();
});

async function cargarOrdenCompra() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/admin/ordenes-compra/${ordenCompraId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Error al cargar la orden de compra');

    const data = await response.json();
    ordenCompraData = data.data;
    productosOriginales = [...ordenCompraData.detalles];

    renderizarInformacionOC();
    renderizarProductos();
    verificarEditable();

  } catch (error) {
    console.error('Error:', error);
    Swal.fire('Error', 'No se pudo cargar la orden de compra', 'error');
  }
}

function renderizarInformacionOC() {
  document.getElementById('oc-numero').textContent = ordenCompraData.ordencompraid;
  document.getElementById('oc-proveedor').textContent = ordenCompraData.nombreproveedor || 'N/A';
  document.getElementById('oc-fecha-entrega').textContent = 
    ordenCompraData.fechaentregaesperada 
      ? new Date(ordenCompraData.fechaentregaesperada).toLocaleDateString('es-MX')
      : 'N/A';
  
  const estatusBadge = document.getElementById('oc-estatus-badge');
  estatusBadge.textContent = ordenCompraData.estatus;
  estatusBadge.className = `badge bg-${getEstatusBadgeClass(ordenCompraData.estatus)}`;

  const total = parseFloat(ordenCompraData.total || 0);
  document.getElementById('oc-total').textContent = `$${total.toFixed(2)}`;
}

function getEstatusBadgeClass(estatus) {
  const map = {
    'Pendiente': 'warning',
    'Generada': 'info',
    'Enviada': 'primary',
    'Parcial': 'secondary',
    'Completada': 'success',
    'Cancelada': 'danger'
  };
  return map[estatus] || 'secondary';
}

function verificarEditable() {
  const estatusEditables = ['Generada', 'Enviada', 'Pendiente'];
  const esEditable = estatusEditables.includes(ordenCompraData.estatus);

  if (esEditable) {
    document.getElementById('alert-editable').classList.remove('d-none');
    document.getElementById('alert-estatus-text').textContent = ordenCompraData.estatus;
    document.getElementById('btn-agregar-producto').disabled = false;
    document.querySelectorAll('.btn-editar-item, .btn-eliminar-item').forEach(btn => {
      btn.disabled = false;
    });
  } else {
    document.getElementById('alert-no-editable').classList.remove('d-none');
    document.getElementById('alert-estatus-no-edit').textContent = ordenCompraData.estatus;
  }
}

function renderizarProductos() {
  const tbody = document.getElementById('tbody-productos');
  const detalles = ordenCompraData.detalles || [];

  if (detalles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No hay productos en esta orden</td></tr>';
    return;
  }

  let totalGeneral = 0;

  tbody.innerHTML = detalles.map(item => {
    const cantidad = parseInt(item.cantidadsolicitada || 0);
    const recibida = parseInt(item.cantidadrecibida || 0);
    const piezas = parseInt(item.piezasporpaquete || 1);
    const costo = parseFloat(item.costounitario || 0);
    const subtotal = cantidad * piezas * costo;
    totalGeneral += subtotal;

    const yaRecibido = recibida > 0;
    const estatusEditables = ['Generada', 'Enviada', 'Pendiente'];
    const puedeEditar = estatusEditables.includes(ordenCompraData.estatus) && !yaRecibido;

    return `
      <tr data-detalle-id="${item.detalleoc_id}">
        <td>${item.sku || 'N/A'}</td>
        <td>${item.nombreproducto || 'N/A'}</td>
        <td>${item.dimensiones || 'N/A'}</td>
        <td class="text-center">${piezas}</td>
        <td class="text-center">${cantidad}</td>
        <td class="text-center">${recibida}</td>
        <td class="text-end">$${costo.toFixed(2)}</td>
        <td class="text-end">$${subtotal.toFixed(2)}</td>
        <td class="text-center">
          ${puedeEditar ? `
            <button class="btn btn-sm btn-outline-primary btn-editar-item" 
                    data-detalle-id="${item.detalleoc_id}"
                    data-variante-id="${item.varianteid}"
                    data-cantidad="${cantidad}"
                    data-piezas="${piezas}"
                    data-costo="${costo}"
                    data-nombre="${item.nombreproducto}">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger btn-eliminar-item" 
                    data-detalle-id="${item.detalleoc_id}"
                    data-nombre="${item.nombreproducto}">
              <i class="bi bi-trash"></i>
            </button>
          ` : `
            <span class="text-muted small">${yaRecibido ? 'Ya recibido' : 'No editable'}</span>
          `}
        </td>
      </tr>
    `;
  }).join('');

  document.getElementById('total-oc-footer').textContent = `$${totalGeneral.toFixed(2)}`;

  document.querySelectorAll('.btn-editar-item').forEach(btn => {
    btn.addEventListener('click', abrirModalEditar);
  });

  document.querySelectorAll('.btn-eliminar-item').forEach(btn => {
    btn.addEventListener('click', eliminarProducto);
  });
}

function inicializarEventos() {
  document.getElementById('btn-agregar-producto').addEventListener('click', abrirModalAgregar);
  document.getElementById('input-buscar-producto').addEventListener('input', buscarProductos);
  document.getElementById('btn-confirmar-agregar').addEventListener('click', confirmarAgregarProducto);
  document.getElementById('btn-confirmar-editar').addEventListener('click', confirmarEditarProducto);
}

function abrirModalAgregar() {
  productoSeleccionado = null;
  document.getElementById('input-buscar-producto').value = '';
  document.getElementById('resultados-busqueda').innerHTML = '<div class="text-muted text-center py-3">Escribe para buscar productos</div>';
  document.getElementById('producto-seleccionado').classList.add('d-none');
  document.getElementById('btn-confirmar-agregar').disabled = true;

  const modal = new bootstrap.Modal(document.getElementById('modalAgregarProducto'));
  modal.show();
}

let timeoutBusqueda = null;

async function buscarProductos(e) {
  const query = e.target.value.trim();
  const resultadosDiv = document.getElementById('resultados-busqueda');

  if (query.length < 2) {
    resultadosDiv.innerHTML = '<div class="text-muted text-center py-3">Escribe al menos 2 caracteres</div>';
    return;
  }

  clearTimeout(timeoutBusqueda);
  timeoutBusqueda = setTimeout(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/productos/buscar?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Error en la búsqueda');

      const data = await response.json();
      const productos = data.data || [];

      if (productos.length === 0) {
        resultadosDiv.innerHTML = '<div class="text-muted text-center py-3">No se encontraron productos</div>';
        return;
      }

      resultadosDiv.innerHTML = productos.map(p => `
        <button type="button" class="list-group-item list-group-item-action" 
                data-variante-id="${p.varianteid}"
                data-sku="${p.sku}"
                data-nombre="${p.nombreproducto}"
                data-costo="${p.costounitario || 0}">
          <div class="d-flex justify-content-between">
            <div>
              <strong>${p.sku}</strong> - ${p.nombreproducto}
              <br><small class="text-muted">${p.dimensiones || 'N/A'}</small>
            </div>
            <div class="text-end">
              <small>Costo: $${parseFloat(p.costounitario || 0).toFixed(2)}</small>
            </div>
          </div>
        </button>
      `).join('');

      resultadosDiv.querySelectorAll('.list-group-item').forEach(btn => {
        btn.addEventListener('click', seleccionarProducto);
      });

    } catch (error) {
      console.error('Error:', error);
      resultadosDiv.innerHTML = '<div class="text-danger text-center py-3">Error al buscar productos</div>';
    }
  }, 300);
}

function seleccionarProducto(e) {
  const btn = e.currentTarget;
  productoSeleccionado = {
    varianteId: btn.dataset.varianteId,
    sku: btn.dataset.sku,
    nombre: btn.dataset.nombre,
    costo: parseFloat(btn.dataset.costo || 0)
  };

  document.getElementById('selected-sku').textContent = productoSeleccionado.sku;
  document.getElementById('selected-nombre').textContent = productoSeleccionado.nombre;
  document.getElementById('input-costo-nueva').value = productoSeleccionado.costo.toFixed(2);
  document.getElementById('producto-seleccionado').classList.remove('d-none');
  document.getElementById('btn-confirmar-agregar').disabled = false;
}

async function confirmarAgregarProducto() {
  if (!productoSeleccionado) return;

  const cantidad = parseInt(document.getElementById('input-cantidad-nueva').value);
  const piezas = parseInt(document.getElementById('input-piezas-nueva').value);
  const costo = parseFloat(document.getElementById('input-costo-nueva').value);

  if (!cantidad || cantidad <= 0 || !piezas || piezas <= 0 || costo < 0) {
    Swal.fire('Error', 'Por favor completa todos los campos correctamente', 'error');
    return;
  }

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/admin/orden-compra/${ordenCompraId}/items`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [{
          varianteId: productoSeleccionado.varianteId,
          cantidadSolicitada: cantidad,
          piezasPorPaquete: piezas,
          costoUnitario: costo
        }]
      })
    });

    if (!response.ok) throw new Error('Error al agregar el producto');

    const data = await response.json();

    bootstrap.Modal.getInstance(document.getElementById('modalAgregarProducto')).hide();

    if (data.data.requiereDecisionBackorder) {
      await mostrarAlertaBackorders(data.data.backordersAfectados);
    }

    Swal.fire('Éxito', 'Producto agregado correctamente', 'success');
    await cargarOrdenCompra();

  } catch (error) {
    console.error('Error:', error);
    Swal.fire('Error', 'No se pudo agregar el producto', 'error');
  }
}

function abrirModalEditar(e) {
  const btn = e.currentTarget;
  
  document.getElementById('edit-detalle-id').value = btn.dataset.detalleId;
  document.getElementById('edit-variante-id').value = btn.dataset.varianteId;
  document.getElementById('edit-producto-nombre').textContent = btn.dataset.nombre;
  document.getElementById('edit-cantidad').value = btn.dataset.cantidad;
  document.getElementById('edit-piezas').value = btn.dataset.piezas;
  document.getElementById('edit-costo').value = btn.dataset.costo;

  const modal = new bootstrap.Modal(document.getElementById('modalEditarProducto'));
  modal.show();
}

async function confirmarEditarProducto() {
  const detalleId = document.getElementById('edit-detalle-id').value;
  const varianteId = document.getElementById('edit-variante-id').value;
  const cantidad = parseInt(document.getElementById('edit-cantidad').value);
  const piezas = parseInt(document.getElementById('edit-piezas').value);
  const costo = parseFloat(document.getElementById('edit-costo').value);

  if (!cantidad || cantidad <= 0 || !piezas || piezas <= 0 || costo < 0) {
    Swal.fire('Error', 'Por favor completa todos los campos correctamente', 'error');
    return;
  }

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/admin/orden-compra/${ordenCompraId}/items`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [{
          detalleId: parseInt(detalleId),
          varianteId: parseInt(varianteId),
          cantidadSolicitada: cantidad,
          piezasPorPaquete: piezas,
          costoUnitario: costo
        }]
      })
    });

    if (!response.ok) throw new Error('Error al actualizar el producto');

    bootstrap.Modal.getInstance(document.getElementById('modalEditarProducto')).hide();
    Swal.fire('Éxito', 'Producto actualizado correctamente', 'success');
    await cargarOrdenCompra();

  } catch (error) {
    console.error('Error:', error);
    Swal.fire('Error', 'No se pudo actualizar el producto', 'error');
  }
}

async function eliminarProducto(e) {
  const btn = e.currentTarget;
  const detalleId = btn.dataset.detalleId;
  const nombreProducto = btn.dataset.nombre;

  const result = await Swal.fire({
    title: '¿Eliminar producto?',
    html: `¿Estás seguro de eliminar <strong>${nombreProducto}</strong> de esta orden?<br><br>
           <small class="text-warning">Si este producto está vinculado a un backorder de cliente, 
           se te preguntará qué hacer con el backorder.</small>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });

  if (!result.isConfirmed) return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/admin/orden-compra/${ordenCompraId}/items`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        itemsEliminados: [parseInt(detalleId)]
      })
    });

    if (!response.ok) throw new Error('Error al eliminar el producto');

    const data = await response.json();

    if (data.data.requiereDecisionBackorder) {
      await mostrarAlertaBackorders(data.data.backordersAfectados);
    }

    Swal.fire('Éxito', 'Producto eliminado correctamente', 'success');
    await cargarOrdenCompra();

  } catch (error) {
    console.error('Error:', error);
    Swal.fire('Error', 'No se pudo eliminar el producto', 'error');
  }
}

async function mostrarAlertaBackorders(backorders) {
  if (!backorders || backorders.length === 0) return;

  const listaBackorders = backorders.map(b => `
    <div class="alert alert-warning mb-2">
      <strong>Pedido #${b.pedidoId}</strong> - Cliente: ${b.nombreCliente}<br>
      <small>Producto: ${b.nombreProducto} (${b.sku}) - Cantidad: ${b.cantidadPaquetes} paquetes</small>
    </div>
  `).join('');

  const result = await Swal.fire({
    title: '⚠️ Backorders Afectados',
    html: `
      <p>Los siguientes pedidos de clientes tienen backorders vinculados a los productos eliminados:</p>
      ${listaBackorders}
      <p class="mt-3"><strong>¿Qué deseas hacer con estos backorders?</strong></p>
    `,
    icon: 'warning',
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'Cancelar backorders',
    denyButtonText: 'Dejar pendientes para otra OC',
    cancelButtonText: 'Volver',
    confirmButtonColor: '#d33',
    denyButtonColor: '#0d6efd'
  });

  if (result.isConfirmed) {
    for (const backorder of backorders) {
      await cancelarBackorder(backorder.pedidoId, backorder.detalleId);
    }
    Swal.fire('Backorders Cancelados', 'Los backorders han sido cancelados', 'info');
  } else if (result.isDenied) {
    Swal.fire('Backorders Pendientes', 'Los backorders quedan pendientes para una futura orden de compra', 'info');
  }
}

async function cancelarBackorder(pedidoId, detalleId) {
  try {
    const token = localStorage.getItem('token');
    await fetch('/api/admin/orden-compra/cancelar-backorder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pedidoId,
        detalleId,
        motivo: 'Producto eliminado de orden de compra'
      })
    });
  } catch (error) {
    console.error('Error al cancelar backorder:', error);
  }
}
