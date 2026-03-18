/**
 * ADMIN PEDIDO SURTIR - PICKING/SEPARACIÓN
 * 
 * Gestiona la interfaz de separación de productos para inventarios.
 * Permite marcar productos como separados antes de enviar a finanzas.
 * 
 * @author RazoConnect Team
 * @date 2026-03-18
 */

let pedidoId = null;
let productosData = [];
let estadisticas = {};

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  // Obtener pedidoId de URL
  const urlParams = new URLSearchParams(window.location.search);
  pedidoId = urlParams.get('id');

  if (!pedidoId) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se especificó el ID del pedido',
      confirmButtonColor: '#F97316'
    }).then(() => {
      window.location.href = 'admin-pedidos.html';
    });
    return;
  }

  document.getElementById('pedidoNumero').textContent = pedidoId;
  cargarEstadoPicking();

  // Event listener para "Seleccionar todos"
  document.getElementById('selectAll').addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.producto-checkbox:not(:disabled)');
    checkboxes.forEach(cb => {
      if (cb.checked !== e.target.checked) {
        cb.checked = e.target.checked;
        toggleProductoSeparado(cb.dataset.detalleId, e.target.checked);
      }
    });
  });
});

/**
 * Cargar estado de picking del pedido
 */
async function cargarEstadoPicking() {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = 'admin-login.html';
      return;
    }

    const response = await fetch(`${API_BASE_URL}/admin/pedidos/${pedidoId}/picking`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token');
        window.location.href = 'admin-login.html';
        return;
      }
      throw new Error('Error al cargar el estado de picking');
    }

    const data = await response.json();
    
    if (data.success) {
      productosData = data.data.productos;
      estadisticas = data.data.estadisticas;
      renderizarProductos();
      actualizarEstadisticas();
      
      document.getElementById('loadingState').style.display = 'none';
      
      if (productosData.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
      } else {
        document.getElementById('productosContainer').style.display = 'block';
      }
    }

  } catch (error) {
    console.error('Error:', error);
    document.getElementById('loadingState').style.display = 'none';
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo cargar el estado de picking',
      confirmButtonColor: '#F97316'
    });
  }
}

/**
 * Renderizar tabla de productos
 */
function renderizarProductos() {
  const tbody = document.getElementById('productosTableBody');
  tbody.innerHTML = '';

  productosData.forEach(producto => {
    const tr = document.createElement('tr');
    
    // Estado badge
    let badgeClass = 'pendiente';
    let badgeText = 'Pendiente';
    
    if (producto.esBackorder) {
      badgeClass = 'backorder';
      badgeText = 'Backorder';
    } else if (producto.separado) {
      badgeClass = 'separado';
      badgeText = 'Separado';
    }

    tr.innerHTML = `
      <td>
        <div class="checkbox-container">
          <input 
            type="checkbox" 
            class="producto-checkbox"
            data-detalle-id="${producto.detalleId}"
            ${producto.separado ? 'checked' : ''}
            ${producto.esBackorder ? 'disabled' : ''}
            onchange="toggleProductoSeparado(${producto.detalleId}, this.checked)"
          />
        </div>
      </td>
      <td>
        <span class="producto-sku">${producto.sku}</span>
      </td>
      <td>
        <div class="producto-info">
          <div>
            <div class="producto-nombre">${producto.nombreProducto}</div>
            <div class="producto-variante">${producto.variante}</div>
          </div>
        </div>
      </td>
      <td style="text-align: center; font-weight: 600;">
        ${producto.cantidadPaquetes}
      </td>
      <td style="text-align: center;">
        ${producto.tamano.descripcion}
      </td>
      <td style="text-align: center;">
        <span class="badge ${badgeClass}">${badgeText}</span>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/**
 * Actualizar estadísticas y progreso
 */
function actualizarEstadisticas() {
  document.getElementById('statTotal').textContent = estadisticas.total;
  document.getElementById('statSeparados').textContent = estadisticas.separados;
  document.getElementById('statPendientes').textContent = estadisticas.pendientes;
  document.getElementById('statBackorder').textContent = estadisticas.backorder;

  const porcentaje = estadisticas.porcentajeCompletado || 0;
  document.getElementById('progressBar').style.width = `${porcentaje}%`;
  document.getElementById('progressText').textContent = `${porcentaje}% completado`;

  // Habilitar botón de enviar a finanzas si todos están separados
  const todosSeparados = estadisticas.pendientes === 0 && estadisticas.total > 0;
  document.getElementById('btnEnviarFinanzas').disabled = !todosSeparados;
}

/**
 * Toggle estado de separación de un producto
 */
async function toggleProductoSeparado(detalleId, separado) {
  try {
    const token = localStorage.getItem('token');
    const url = `${API_BASE_URL}/admin/pedidos/${pedidoId}/picking/${detalleId}`;
    
    const response = await fetch(url, {
      method: separado ? 'POST' : 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: separado ? JSON.stringify({}) : undefined
    });

    if (!response.ok) {
      throw new Error('Error al actualizar el estado');
    }

    const data = await response.json();
    
    if (data.success) {
      // Actualizar estado local
      const producto = productosData.find(p => p.detalleId === parseInt(detalleId));
      if (producto) {
        producto.separado = separado;
        
        // Recalcular estadísticas
        estadisticas.separados = productosData.filter(p => p.separado && !p.esBackorder).length;
        estadisticas.pendientes = productosData.filter(p => !p.separado && !p.esBackorder).length;
        estadisticas.porcentajeCompletado = Math.round(
          (estadisticas.separados / (estadisticas.total - estadisticas.backorder)) * 100
        );
        
        actualizarEstadisticas();
      }
    }

  } catch (error) {
    console.error('Error:', error);
    
    // Revertir checkbox
    const checkbox = document.querySelector(`input[data-detalle-id="${detalleId}"]`);
    if (checkbox) {
      checkbox.checked = !separado;
    }
    
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo actualizar el estado del producto',
      confirmButtonColor: '#F97316'
    });
  }
}

/**
 * Marcar todos los productos como separados
 */
async function marcarTodosComoSeparados() {
  const result = await Swal.fire({
    title: '¿Marcar todos como separados?',
    text: 'Esto marcará todos los productos disponibles como separados',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#F97316',
    cancelButtonColor: '#6B7280',
    confirmButtonText: 'Sí, marcar todos',
    cancelButtonText: 'Cancelar'
  });

  if (!result.isConfirmed) return;

  try {
    const token = localStorage.getItem('token');
    
    const response = await fetch(`${API_BASE_URL}/admin/pedidos/${pedidoId}/picking/marcar-todos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Error al marcar todos los productos');
    }

    const data = await response.json();
    
    if (data.success) {
      Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        text: data.message,
        confirmButtonColor: '#F97316'
      });

      // Recargar estado
      await cargarEstadoPicking();
    }

  } catch (error) {
    console.error('Error:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se pudo marcar todos los productos',
      confirmButtonColor: '#F97316'
    });
  }
}

/**
 * Mostrar modal de verificación previa
 */
async function mostrarModalVerificacion() {
  const productosBackorder = productosData.filter(p => p.esBackorder);
  const productosSeparados = productosData.filter(p => p.separado && !p.esBackorder);
  
  let htmlContent = `
    <div style="text-align: left;">
      <h3 style="margin-top: 0; color: #16A34A;">✓ Productos Separados: ${productosSeparados.length}</h3>
      <ul style="max-height: 200px; overflow-y: auto; margin-bottom: 1.5rem;">
        ${productosSeparados.map(p => `
          <li><strong>${p.nombreProducto}</strong> - ${p.cantidadPaquetes} paquetes</li>
        `).join('')}
      </ul>
  `;

  if (productosBackorder.length > 0) {
    htmlContent += `
      <h3 style="color: #DC2626;">📦 Productos en Backorder: ${productosBackorder.length}</h3>
      <ul style="max-height: 200px; overflow-y: auto; margin-bottom: 1.5rem;">
        ${productosBackorder.map(p => `
          <li><strong>${p.nombreProducto}</strong> - ${p.cantidadPaquetes} paquetes</li>
        `).join('')}
      </ul>
      <p style="background: #FEE2E2; padding: 1rem; border-radius: 8px; color: #991B1B;">
        <strong>⚠️ Nota:</strong> Los productos en backorder NO se enviarán a finanzas en este momento.
      </p>
    `;
  }

  htmlContent += `
      <p style="margin-top: 1.5rem; font-weight: 600;">
        ¿Confirmas que todos los productos separados están listos para enviar a finanzas?
      </p>
    </div>
  `;

  const result = await Swal.fire({
    title: 'Verificación Final',
    html: htmlContent,
    icon: 'info',
    showCancelButton: true,
    confirmButtonColor: '#16A34A',
    cancelButtonColor: '#6B7280',
    confirmButtonText: '✅ Confirmar y Enviar a Finanzas',
    cancelButtonText: 'Cancelar',
    width: '600px'
  });

  if (result.isConfirmed) {
    await enviarAFinanzas();
  }
}

/**
 * Enviar pedido a finanzas (surtir)
 */
async function enviarAFinanzas() {
  try {
    const token = localStorage.getItem('token');
    
    const response = await fetch(`${API_BASE_URL}/admin/pedidos/${pedidoId}/surtir`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Error al enviar a finanzas');
    }

    const data = await response.json();
    
    if (data.success) {
      await Swal.fire({
        icon: 'success',
        title: '¡Pedido Enviado!',
        html: `
          <p>${data.message}</p>
          <p style="margin-top: 1rem; font-size: 0.9rem; color: #6B7280;">
            El pedido ha sido enviado a finanzas para confirmación final.
          </p>
        `,
        confirmButtonColor: '#16A34A'
      });

      // Redirigir a lista de pedidos
      window.location.href = 'admin-pedidos.html';
    }

  } catch (error) {
    console.error('Error:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || 'No se pudo enviar el pedido a finanzas',
      confirmButtonColor: '#F97316'
    });
  }
}
