const API_BASE_URL = '/api/admin';

let productoSeleccionado = null;
let motivosCache = {};

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
});

const initEventListeners = () => {
    document.getElementById('btn-buscar-sku').addEventListener('click', buscarProducto);
    document.getElementById('sku-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            buscarProducto();
        }
    });
    
    document.getElementById('tipo-ajuste').addEventListener('change', cargarMotivos);
    document.getElementById('form-ajuste-inventario').addEventListener('submit', registrarAjuste);
    document.getElementById('btn-limpiar').addEventListener('click', limpiarFormulario);
};

const buscarProducto = async () => {
    const sku = document.getElementById('sku-search').value.trim();
    
    if (!sku) {
        Swal.fire({
            icon: 'warning',
            title: 'SKU Requerido',
            text: 'Por favor ingresa un SKU para buscar'
        });
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/inventario/buscar-producto?sku=${encodeURIComponent(sku)}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al buscar producto');
        }

        if (data.productos.length === 0) {
            document.getElementById('sku-results').innerHTML = `
                <div class="alert alert-warning mb-0">
                    <i class="bi bi-exclamation-triangle"></i> No se encontraron productos con ese SKU
                </div>
            `;
            return;
        }

        mostrarResultadosBusqueda(data.productos);

    } catch (error) {
        console.error('Error al buscar producto:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message
        });
    }
};

const mostrarResultadosBusqueda = (productos) => {
    const resultsContainer = document.getElementById('sku-results');
    
    const html = `
        <div class="list-group">
            ${productos.map(p => `
                <button type="button" class="list-group-item list-group-item-action" 
                        onclick="seleccionarProducto(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <strong class="mb-1">${p.sku}</strong>
                            <p class="mb-1">${p.nombreproducto}</p>
                            <small class="text-muted">
                                ${p.dimensiones || 'Sin dimensiones'} 
                                ${p.color_nombre ? `| Color: ${p.color_nombre}` : ''}
                            </small>
                        </div>
                        <span class="badge bg-primary">Seleccionar</span>
                    </div>
                </button>
            `).join('')}
        </div>
    `;
    
    resultsContainer.innerHTML = html;
};

window.seleccionarProducto = (producto) => {
    productoSeleccionado = producto;
    
    document.getElementById('sku-seleccionado').value = producto.sku;
    
    document.getElementById('producto-seleccionado').innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
            <div>
                <h6 class="mb-1 text-success">
                    <i class="bi bi-check-circle-fill"></i> ${producto.sku}
                </h6>
                <p class="mb-1"><strong>${producto.nombreproducto}</strong></p>
                <small class="text-muted">
                    ${producto.dimensiones || 'Sin dimensiones'} 
                    ${producto.color_nombre ? `| Color: ${producto.color_nombre}` : ''}
                </small>
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="limpiarSeleccion()">
                <i class="bi bi-x"></i>
            </button>
        </div>
    `;
    
    document.getElementById('sku-results').innerHTML = '';
    document.getElementById('sku-search').value = '';
};

window.limpiarSeleccion = () => {
    productoSeleccionado = null;
    document.getElementById('sku-seleccionado').value = '';
    document.getElementById('producto-seleccionado').innerHTML = `
        <p class="text-muted mb-0">
            <i class="bi bi-arrow-left"></i> Busca y selecciona un producto
        </p>
    `;
};

const cargarMotivos = async () => {
    const tipo = document.getElementById('tipo-ajuste').value;
    const motivoSelect = document.getElementById('motivo');
    
    if (!tipo) {
        motivoSelect.innerHTML = '<option value="">Primero selecciona el tipo de ajuste...</option>';
        return;
    }

    if (motivosCache[tipo]) {
        renderizarMotivos(motivosCache[tipo], tipo);
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/inventario/motivos-ajuste?tipo=${tipo}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al cargar motivos');
        }

        motivosCache[tipo] = data.motivos;
        renderizarMotivos(data.motivos, tipo);

    } catch (error) {
        console.error('Error al cargar motivos:', error);
        motivoSelect.innerHTML = '<option value="">Error al cargar motivos</option>';
    }
};

const renderizarMotivos = (motivos, tipo) => {
    const motivoSelect = document.getElementById('motivo');
    const icono = tipo === 'MERMA' ? '🔻' : '🔺';
    
    motivoSelect.innerHTML = `
        <option value="">Selecciona el motivo...</option>
        ${motivos.map(m => `
            <option value="${m.codigo}">${icono} ${m.descripcion}</option>
        `).join('')}
    `;
};

const registrarAjuste = async (e) => {
    e.preventDefault();

    if (!productoSeleccionado) {
        Swal.fire({
            icon: 'warning',
            title: 'Producto No Seleccionado',
            text: 'Por favor busca y selecciona un producto antes de continuar'
        });
        return;
    }

    const tipo = document.getElementById('tipo-ajuste').value;
    const cantidad = parseInt(document.getElementById('cantidad').value);
    const motivo = document.getElementById('motivo').value;
    const observaciones = document.getElementById('observaciones').value.trim();

    const confirmResult = await Swal.fire({
        title: '¿Confirmar Ajuste de Inventario?',
        html: `
            <div class="text-start">
                <p><strong>Producto:</strong> ${productoSeleccionado.nombreproducto}</p>
                <p><strong>SKU:</strong> ${productoSeleccionado.sku}</p>
                <p><strong>Tipo:</strong> <span class="badge bg-${tipo === 'MERMA' ? 'danger' : 'success'}">${tipo}</span></p>
                <p><strong>Cantidad:</strong> ${cantidad} unidades</p>
                <p><strong>Motivo:</strong> ${document.getElementById('motivo').selectedOptions[0].text}</p>
                ${observaciones ? `<p><strong>Observaciones:</strong> ${observaciones}</p>` : ''}
            </div>
            <div class="alert alert-warning mt-3">
                <small><i class="bi bi-exclamation-triangle"></i> Esta acción quedará registrada en el historial de auditoría</small>
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, Registrar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#198754',
        cancelButtonColor: '#6c757d'
    });

    if (!confirmResult.isConfirmed) {
        return;
    }

    const btnRegistrar = document.getElementById('btn-registrar');
    btnRegistrar.disabled = true;
    btnRegistrar.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Registrando...';

    try {
        const response = await fetch(`${API_BASE_URL}/inventario/ajuste`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                sku: productoSeleccionado.sku,
                tipo,
                cantidad,
                motivo,
                observaciones: observaciones || null
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al registrar ajuste');
        }

        await Swal.fire({
            icon: 'success',
            title: 'Ajuste Registrado',
            html: `
                <div class="text-start">
                    <p class="mb-2">El ajuste de inventario se registró exitosamente:</p>
                    <ul class="list-unstyled">
                        <li><strong>Movimiento ID:</strong> ${data.movimiento.movimientoId}</li>
                        <li><strong>Stock Previo:</strong> ${data.movimiento.stockPrevio} unidades</li>
                        <li><strong>Stock Posterior:</strong> ${data.movimiento.stockPosterior} unidades</li>
                        <li><strong>Cambio:</strong> ${tipo === 'MERMA' ? '-' : '+'}${cantidad} unidades</li>
                    </ul>
                </div>
            `,
            confirmButtonText: 'Entendido'
        });

        limpiarFormulario();

    } catch (error) {
        console.error('Error al registrar ajuste:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message
        });
    } finally {
        btnRegistrar.disabled = false;
        btnRegistrar.innerHTML = '<i class="bi bi-check-circle"></i> Registrar Ajuste';
    }
};

const limpiarFormulario = () => {
    document.getElementById('form-ajuste-inventario').reset();
    limpiarSeleccion();
    document.getElementById('sku-results').innerHTML = '';
    document.getElementById('motivo').innerHTML = '<option value="">Primero selecciona el tipo de ajuste...</option>';
    productoSeleccionado = null;
};
