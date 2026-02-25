const API_BASE_URL = '/api/admin';

let varianteSeleccionada = null;
let productoActual = null;
let motivosCache = {};
let searchTimeout = null;
let modalVariantes = null;

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    modalVariantes = new bootstrap.Modal(document.getElementById('modalVariantes'));
});

const initEventListeners = () => {
    const searchInput = document.getElementById('producto-search');
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim().length >= 2) {
            document.getElementById('autocomplete-results').classList.add('show');
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#producto-search') && !e.target.closest('#autocomplete-results')) {
            document.getElementById('autocomplete-results').classList.remove('show');
        }
    });
    
    document.getElementById('tipo-ajuste').addEventListener('change', cargarMotivos);
    document.getElementById('form-ajuste-inventario').addEventListener('submit', registrarAjuste);
    document.getElementById('btn-limpiar').addEventListener('click', limpiarFormulario);
};

const handleSearchInput = (e) => {
    const query = e.target.value.trim();
    const resultsContainer = document.getElementById('autocomplete-results');
    
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    if (query.length < 2) {
        resultsContainer.classList.remove('show');
        resultsContainer.innerHTML = '';
        return;
    }
    
    resultsContainer.innerHTML = '<div class="autocomplete-loading"><i class="bi bi-hourglass-split"></i> Buscando...</div>';
    resultsContainer.classList.add('show');
    
    searchTimeout = setTimeout(() => {
        buscarProductos(query);
    }, 300);
};

const buscarProductos = async (query) => {
    const resultsContainer = document.getElementById('autocomplete-results');
    
    try {
        const response = await fetch(`${API_BASE_URL}/inventario/productos/autocompletado?q=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al buscar productos');
        }

        if (data.productos.length === 0) {
            resultsContainer.innerHTML = `
                <div class="autocomplete-no-results">
                    <i class="bi bi-search"></i> No se encontraron productos
                </div>
            `;
            return;
        }

        mostrarResultadosAutocompletado(data.productos);

    } catch (error) {
        console.error('Error al buscar productos:', error);
        resultsContainer.innerHTML = `
            <div class="autocomplete-no-results text-danger">
                <i class="bi bi-exclamation-triangle"></i> Error al buscar
            </div>
        `;
    }
};

const mostrarResultadosAutocompletado = (productos) => {
    const resultsContainer = document.getElementById('autocomplete-results');
    
    const html = productos.map(p => `
        <div class="autocomplete-item" data-producto-id="${p.productoid}">
            <img src="${p.imagen_url}" alt="${p.nombreproducto}" class="autocomplete-item-image" 
                 onerror="this.src='/images/placeholder-product.png'">
            <div class="autocomplete-item-info">
                <div class="autocomplete-item-name">${p.nombreproducto}</div>
                <div class="autocomplete-item-category">
                    <i class="bi bi-tag"></i> ${p.nombrecategoria}
                    ${p.sku_maestro ? `<span class="ms-2"><i class="bi bi-upc"></i> ${p.sku_maestro}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');
    
    resultsContainer.innerHTML = html;
    
    resultsContainer.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            const productoId = item.dataset.productoId;
            abrirModalVariantes(productoId);
            resultsContainer.classList.remove('show');
            document.getElementById('producto-search').value = '';
        });
    });
};

const abrirModalVariantes = async (productoId) => {
    const tbody = document.getElementById('variantes-tbody');
    tbody.innerHTML = `
        <tr>
            <td colspan="3" class="text-center text-muted">
                <i class="bi bi-hourglass-split"></i> Cargando variantes...
            </td>
        </tr>
    `;
    
    modalVariantes.show();
    
    try {
        const response = await fetch(`${API_BASE_URL}/inventario/productos/${productoId}/variantes`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al cargar variantes');
        }

        mostrarVariantes(data.variantes);

    } catch (error) {
        console.error('Error al cargar variantes:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="text-center text-danger">
                    <i class="bi bi-exclamation-triangle"></i> ${error.message}
                </td>
            </tr>
        `;
    }
};

const mostrarVariantes = (variantes) => {
    const tbody = document.getElementById('variantes-tbody');
    const productoInfo = document.getElementById('producto-info');
    
    if (variantes.length > 0) {
        productoInfo.innerHTML = `
            <div class="alert alert-info mb-0">
                <strong><i class="bi bi-box-seam"></i> ${variantes[0].nombreproducto}</strong>
                <p class="mb-0 mt-1"><small>Selecciona la variante que deseas ajustar (${variantes.length} variantes disponibles)</small></p>
            </div>
        `;
    }
    
    const html = variantes.map(v => {
        // Imagen de la variante o fallback a producto maestro
        const imagenUrl = v.imagen_url || '/images/placeholder-product.png';
        
        // Medidas
        const medidas = v.dimensiones 
            ? `<span class="badge bg-secondary"><i class="bi bi-rulers"></i> ${v.dimensiones}</span>`
            : '<span class="text-muted">Sin medidas</span>';
        
        // Color con badge visual
        let colorDisplay = '<span class="text-muted">Sin color</span>';
        if (v.color_nombre) {
            if (v.color_hex) {
                colorDisplay = `
                    <div class="d-flex align-items-center gap-2">
                        <div style="width: 30px; height: 30px; background-color: ${v.color_hex}; border: 1px solid #ddd; border-radius: 4px;"></div>
                        <span>${v.color_nombre}</span>
                    </div>
                `;
            } else {
                colorDisplay = `<span class="badge bg-secondary">${v.color_nombre}</span>`;
            }
        }
        
        return `
            <tr>
                <td>
                    <img src="${imagenUrl}" 
                         alt="${v.sku}" 
                         onerror="this.src='/images/placeholder-product.png'">
                </td>
                <td><strong>${v.sku}</strong></td>
                <td>${medidas}</td>
                <td>${colorDisplay}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-primary" 
                            onclick="seleccionarVariante(${JSON.stringify(v).replace(/"/g, '&quot;')})">
                        <i class="bi bi-check-circle"></i> Seleccionar
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = html;
};

window.seleccionarVariante = (variante) => {
    varianteSeleccionada = variante;
    
    document.getElementById('variante-seleccionada').value = variante.varianteid;
    document.getElementById('sku-seleccionado').value = variante.sku;
    
    const atributos = [];
    if (variante.dimensiones) atributos.push(variante.dimensiones);
    if (variante.color_nombre) atributos.push(`Color: ${variante.color_nombre}`);
    
    document.getElementById('producto-seleccionado').innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
            <div>
                <h6 class="mb-1 text-success">
                    <i class="bi bi-check-circle-fill"></i> ${variante.sku}
                </h6>
                <p class="mb-1"><strong>${variante.nombreproducto}</strong></p>
                <small class="text-muted">
                    ${atributos.length > 0 ? atributos.join(' | ') : 'Sin atributos'}
                </small>
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="limpiarSeleccion()">
                <i class="bi bi-x"></i>
            </button>
        </div>
    `;
    
    modalVariantes.hide();
};

window.limpiarSeleccion = () => {
    varianteSeleccionada = null;
    productoActual = null;
    document.getElementById('variante-seleccionada').value = '';
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
                'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
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

    if (!varianteSeleccionada) {
        Swal.fire({
            icon: 'warning',
            title: 'Variante No Seleccionada',
            text: 'Por favor busca y selecciona una variante antes de continuar'
        });
        return;
    }

    const tipo = document.getElementById('tipo-ajuste').value;
    const cantidad = parseInt(document.getElementById('cantidad').value);
    const motivo = document.getElementById('motivo').value;
    const observaciones = document.getElementById('observaciones').value.trim();

    const atributos = [];
    if (varianteSeleccionada.dimensiones) atributos.push(varianteSeleccionada.dimensiones);
    if (varianteSeleccionada.color_nombre) atributos.push(`Color: ${varianteSeleccionada.color_nombre}`);
    
    const confirmResult = await Swal.fire({
        title: '¿Confirmar Ajuste de Inventario?',
        html: `
            <div class="text-start">
                <p><strong>Producto:</strong> ${varianteSeleccionada.nombreproducto}</p>
                <p><strong>SKU:</strong> ${varianteSeleccionada.sku}</p>
                ${atributos.length > 0 ? `<p><strong>Atributos:</strong> ${atributos.join(' | ')}</p>` : ''}
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
                'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
            },
            body: JSON.stringify({
                sku: varianteSeleccionada.sku,
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
    document.getElementById('autocomplete-results').classList.remove('show');
    document.getElementById('autocomplete-results').innerHTML = '';
    document.getElementById('motivo').innerHTML = '<option value="">Primero selecciona el tipo de ajuste...</option>';
    varianteSeleccionada = null;
    productoActual = null;
};
