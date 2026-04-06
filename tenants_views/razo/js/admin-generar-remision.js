/**
 * MÓDULO DE GENERACIÓN DE REMISIONES
 * Permite seleccionar items de un pedido y generar remisiones parciales o completas
 * Versión dinámica: Oculta precios automáticamente para rol 'inventarios'
 */

let pedidoActual = null;
let itemsPendientes = [];

// Función para obtener el rol del usuario
function getUserRole() {
    try {
        const adminData = JSON.parse(localStorage.getItem('razoconnect_admin') || '{}');
        return (adminData.rol || adminData.role || '').toString().toLowerCase().trim();
    } catch (error) {
        return 'admin';
    }
}

async function abrirModalGenerarRemision(pedidoId) {
    try {
        const response = await fetch(`/api/remisiones/pedido/${pedidoId}/pendiente`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Error al cargar items pendientes');
        }

        const data = await response.json();
        pedidoActual = data.pedido_id;
        itemsPendientes = data.items_pendientes;

        if (itemsPendientes.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'Pedido Completo',
                text: 'Este pedido ya ha sido completamente surtido mediante remisiones.',
                confirmButtonColor: '#F97316'
            });
            return;
        }

        mostrarModalRemision();

    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar la información del pedido'
        });
    }
}

function mostrarModalRemision() {
    // Detectar rol del usuario para ocultar precios si es necesario
    const userRole = getUserRole();
    const isInventarios = userRole === 'inventarios';
    
    const itemsHTML = itemsPendientes.map(item => {
        const disponible = Math.min(item.cantidad_pendiente, Math.floor(item.stock_piezas / (item.tamanopaquete || 1)));
        
        return `
            <tr data-detalle-id="${item.detalleid}">
                <td>
                    <div class="form-check">
                        <input class="form-check-input item-checkbox" type="checkbox" 
                               id="item-${item.detalleid}" 
                               data-detalle-id="${item.detalleid}"
                               ${disponible > 0 ? '' : 'disabled'}>
                        <label class="form-check-label" for="item-${item.detalleid}">
                            <strong>${item.sku}</strong><br>
                            <small class="text-muted">${item.producto_nombre} - ${item.variante_nombre}</small>
                        </label>
                    </div>
                </td>
                <td class="text-center">
                    <input type="number" 
                           class="form-control form-control-sm cantidad-input" 
                           id="cantidad-${item.detalleid}"
                           min="1" 
                           max="${disponible}"
                           value="${Math.min(item.cantidad_pendiente, disponible)}"
                           ${disponible > 0 ? '' : 'disabled'}
                           data-detalle-id="${item.detalleid}"
                           style="width: 80px; margin: 0 auto;">
                </td>
                <td class="text-center">
                    <span class="badge bg-secondary">${item.tamanopaquete || 1} pzs</span>
                </td>
                <td class="text-center">
                    <strong>${item.cantidad_pendiente}</strong>
                    <small class="text-muted d-block">de ${item.cantidad_pedida}</small>
                </td>
                <td class="text-center">
                    <span class="${disponible > 0 ? 'text-success' : 'text-danger'}">
                        ${disponible} paquetes
                    </span>
                    <small class="text-muted d-block">(${item.stock_piezas} pzs)</small>
                </td>
                ${!isInventarios ? `
                <td class="text-end">
                    <strong>$${parseFloat(item.preciounitario).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
                </td>
                ` : ''}
            </tr>
        `;
    }).join('');

    Swal.fire({
        title: '<i class="bi bi-file-earmark-text"></i> Generar Remisión',
        html: `
            <div class="text-start">
                <p class="mb-3">
                    <strong>Pedido #${pedidoActual}</strong><br>
                    <small class="text-muted">Selecciona los productos que deseas surtir en esta remisión</small>
                </p>

                <div class="alert alert-info mb-3">
                    <i class="bi bi-info-circle"></i>
                    <strong>Entregas Parciales:</strong> Puedes generar múltiples remisiones para un mismo pedido.
                    ${!isInventarios ? 'Solo se cobrará (CXC) por los productos incluidos en cada remisión.' : 'Los productos se marcarán como surtidos en el inventario.'}
                </div>

                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                    <table class="table table-sm table-hover">
                        <thead class="table-light sticky-top">
                            <tr>
                                <th>
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="select-all">
                                        <label class="form-check-label" for="select-all">
                                            Producto
                                        </label>
                                    </div>
                                </th>
                                <th class="text-center">Cantidad a Surtir</th>
                                <th class="text-center">Tamaño</th>
                                <th class="text-center">Pendiente</th>
                                <th class="text-center">Disponible</th>
                                ${!isInventarios ? '<th class="text-end">Precio Unit.</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHTML}
                        </tbody>
                    </table>
                </div>

                <div class="mt-3">
                    <label class="form-label">Notas (opcional):</label>
                    <textarea id="remision-notas" class="form-control" rows="2" 
                              placeholder="Ej: Entrega parcial - Resto en backorder"></textarea>
                </div>

                ${!isInventarios ? `
                <div class="mt-3 p-3 bg-light rounded">
                    <div class="d-flex justify-content-between align-items-center">
                        <span><strong>Total de la Remisión:</strong></span>
                        <span id="total-remision" class="fs-5 text-success fw-bold">$0.00</span>
                    </div>
                    <small class="text-muted">Este monto se registrará en CXC si el cliente es de crédito</small>
                </div>
                ` : ''}
            </div>
        `,
        width: '90%',
        showCancelButton: true,
        confirmButtonText: '<i class="bi bi-check-circle"></i> Generar Remisión',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#F97316',
        cancelButtonColor: '#6c757d',
        didOpen: () => {
            const userRole = getUserRole();
            const isInventarios = userRole === 'inventarios';
            configurarEventosModal();
            if (!isInventarios) {
                calcularTotalRemision();
            }
        },
        preConfirm: () => {
            return validarYObtenerDatos();
        }
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            generarRemisionAPI(result.value);
        }
    });
}

function configurarEventosModal() {
    const userRole = getUserRole();
    const isInventarios = userRole === 'inventarios';
    
    const selectAll = document.getElementById('select-all');
    const checkboxes = document.querySelectorAll('.item-checkbox');
    const cantidadInputs = document.querySelectorAll('.cantidad-input');

    // ⚡ NUEVA FUNCIÓN: Guardar items seleccionados en sessionStorage en TIEMPO REAL
    const saveSelectedItemsToSession = () => {
        const selectedCheckboxes = document.querySelectorAll('.item-checkbox:checked');
        const selectedIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.detalleId));
        sessionStorage.setItem(`remision_items_${pedidoActual}`, JSON.stringify(selectedIds));
        console.log('📝 Selección guardada en sesión:', selectedIds);
    };

    selectAll?.addEventListener('change', (e) => {
        checkboxes.forEach(cb => {
            if (!cb.disabled) {
                cb.checked = e.target.checked;
            }
        });
        saveSelectedItemsToSession(); // ⚡ Guardar cuando se selecciona/deselecciona todo
        if (!isInventarios) {
            calcularTotalRemision();
        }
    });

    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            saveSelectedItemsToSession(); // ⚡ Guardar cada vez que se marca/desmarca
            if (!isInventarios) {
                calcularTotalRemision();
            }
        });
    });

    cantidadInputs.forEach(input => {
        input.addEventListener('input', () => {
            if (!isInventarios) {
                calcularTotalRemision();
            }
        });
        input.addEventListener('change', (e) => {
            const max = parseInt(e.target.max);
            const value = parseInt(e.target.value);
            if (value > max) {
                e.target.value = max;
            }
            if (value < 1) {
                e.target.value = 1;
            }
            if (!isInventarios) {
                calcularTotalRemision();
            }
        });
    });
}

function calcularTotalRemision() {
    let total = 0;
    const checkboxes = document.querySelectorAll('.item-checkbox:checked');

    checkboxes.forEach(cb => {
        const detalleId = cb.dataset.detalleId;
        const item = itemsPendientes.find(i => i.detalleid == detalleId);
        const cantidadInput = document.getElementById(`cantidad-${detalleId}`);
        
        if (item && cantidadInput) {
            const cantidadPaquetes = parseInt(cantidadInput.value) || 0;
            const piezas = cantidadPaquetes * (item.tamanopaquete || 1);
            const subtotal = piezas * parseFloat(item.preciounitario);
            total += subtotal;
        }
    });

    const totalElement = document.getElementById('total-remision');
    if (totalElement) {
        totalElement.textContent = `$${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    }
}

function validarYObtenerDatos() {
    const checkboxes = document.querySelectorAll('.item-checkbox:checked');
    
    if (checkboxes.length === 0) {
        Swal.showValidationMessage('Debes seleccionar al menos un producto');
        return false;
    }

    const items_a_surtir = [];
    let hayError = false;

    checkboxes.forEach(cb => {
        const detalleId = cb.dataset.detalleId;
        const cantidadInput = document.getElementById(`cantidad-${detalleId}`);
        const cantidad = parseInt(cantidadInput.value);

        if (!cantidad || cantidad < 1) {
            Swal.showValidationMessage('Todas las cantidades deben ser mayores a 0');
            hayError = true;
            return;
        }

        const max = parseInt(cantidadInput.max);
        if (cantidad > max) {
            Swal.showValidationMessage(`La cantidad para un producto excede el disponible (máx: ${max})`);
            hayError = true;
            return;
        }

        items_a_surtir.push({
            detalle_pedido_id: parseInt(detalleId),
            cantidad_paquetes: cantidad
        });
    });

    if (hayError) {
        return false;
    }

    const notas = document.getElementById('remision-notas')?.value || '';

    return {
        pedido_id: pedidoActual,
        items_a_surtir,
        notas,
        emitir_inmediatamente: true
    };
}

async function generarRemisionAPI(datos) {
    try {
        Swal.fire({
            title: 'Generando Remisión...',
            html: 'Por favor espera',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const response = await fetch('/api/remisiones/generar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
            },
            credentials: 'include',
            body: JSON.stringify(datos)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Error al generar remisión');
        }

        // ⚡ CRITICAL: Save selected items to sessionStorage for PDF generation
        // This ensures the PDF shows ONLY the items that were marked in THIS session
        const selectedItemIds = datos.items_a_surtir.map(item => item.detalle_pedido_id);
        sessionStorage.setItem(`remision_items_${datos.pedido_id}`, JSON.stringify(selectedItemIds));

        const userRole = getUserRole();
        const isInventarios = userRole === 'inventarios';

        await Swal.fire({
            icon: 'success',
            title: '¡Remisión Generada!',
            html: `
                <div class="text-start">
                    <p><strong>Folio:</strong> ${result.remision.folio}</p>
                    ${!isInventarios ? `<p><strong>Total:</strong> $${parseFloat(result.remision.total_remision).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>` : ''}
                    <p><strong>Items surtidos:</strong> ${result.remision.items_surtidos}</p>
                    ${!isInventarios && result.remision.cxc_generado ? 
                        '<p class="text-success"><i class="bi bi-check-circle"></i> Movimiento de CXC registrado</p>' : 
                        !isInventarios ? '<p class="text-muted">Cliente de contado - Sin CXC</p>' : ''
                    }
                </div>
            `,
            confirmButtonColor: '#F97316'
        });

        if (typeof loadOrders === 'function') {
            loadOrders();
        }

    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message,
            confirmButtonColor: '#dc3545'
        });
    }
}

window.abrirModalGenerarRemision = abrirModalGenerarRemision;
