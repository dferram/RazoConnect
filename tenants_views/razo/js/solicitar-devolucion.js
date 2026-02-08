/**
 * MÓDULO DE SOLICITUD DE DEVOLUCIONES
 * Permite a los clientes solicitar devoluciones desde el dashboard
 */

async function solicitarDevolucion(pedidoId) {
    try {
        const response = await fetch(`/api/pedidos/${pedidoId}`, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error('Error al cargar pedido');

        const pedido = await response.json();
        mostrarFormularioDevolucion(pedido);
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'No se pudo cargar la información del pedido', 'error');
    }
}

function mostrarFormularioDevolucion(pedido) {
    const itemsHtml = pedido.detalles.map((item, index) => `
        <tr>
            <td>
                <input type="checkbox" class="form-check-input item-checkbox" data-index="${index}" id="item-${index}">
            </td>
            <td>
                ${item.imagen_url ? `<img src="${item.imagen_url}" style="width: 40px; height: 40px; object-fit: cover;" class="me-2">` : ''}
                <div>
                    <div>${item.nombre}</div>
                    <small class="text-muted">${item.sku}</small>
                </div>
            </td>
            <td>${item.cantidadPaquetes} paquetes</td>
            <td>
                <input type="number" class="form-control form-control-sm cantidad-devolver" 
                       id="cantidad-${index}" min="1" max="${item.cantidadPaquetes}" 
                       value="${item.cantidadPaquetes}" disabled>
            </td>
            <td>
                <select class="form-select form-select-sm motivo-select" id="motivo-${index}" disabled>
                    <option value="">Seleccionar...</option>
                    <option value="DANADO">Producto Dañado</option>
                    <option value="INCORRECTO">Producto Incorrecto</option>
                    <option value="ARREPENTIMIENTO">Arrepentimiento</option>
                    <option value="DEFECTUOSO">Defectuoso</option>
                    <option value="OTRO">Otro</option>
                </select>
            </td>
            <td>
                <select class="form-select form-select-sm condicion-select" id="condicion-${index}" disabled>
                    <option value="">Seleccionar...</option>
                    <option value="SELLADO">Sellado</option>
                    <option value="ABIERTO">Abierto</option>
                    <option value="DANADO">Dañado</option>
                </select>
            </td>
        </tr>
    `).join('');

    Swal.fire({
        title: `Solicitar Devolución - Pedido #${pedido.pedidoid}`,
        html: `
            <div class="text-start">
                <div class="alert alert-info">
                    <i class="bi bi-info-circle"></i> Selecciona los productos que deseas devolver
                </div>
                
                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                    <table class="table table-sm">
                        <thead style="position: sticky; top: 0; background: white; z-index: 1;">
                            <tr>
                                <th width="50"></th>
                                <th>Producto</th>
                                <th>Comprado</th>
                                <th>Devolver</th>
                                <th>Motivo</th>
                                <th>Condición</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>
                </div>

                <div class="mt-3">
                    <label class="form-label">Notas adicionales (opcional)</label>
                    <textarea id="notas-devolucion" class="form-control" rows="3" 
                              placeholder="Describe el problema o razón de la devolución..."></textarea>
                </div>

                <div class="alert alert-warning mt-3">
                    <small><i class="bi bi-exclamation-triangle"></i> Deberás subir fotos de los productos después de crear la solicitud</small>
                </div>
            </div>
        `,
        width: '900px',
        showCancelButton: true,
        confirmButtonText: 'Crear Solicitud',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#F97316',
        didOpen: () => {
            document.querySelectorAll('.item-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', function() {
                    const index = this.dataset.index;
                    const disabled = !this.checked;
                    document.getElementById(`cantidad-${index}`).disabled = disabled;
                    document.getElementById(`motivo-${index}`).disabled = disabled;
                    document.getElementById(`condicion-${index}`).disabled = disabled;
                });
            });
        },
        preConfirm: () => {
            const items = [];
            const checkboxes = document.querySelectorAll('.item-checkbox:checked');
            
            if (checkboxes.length === 0) {
                Swal.showValidationMessage('Debes seleccionar al menos un producto');
                return false;
            }

            for (const checkbox of checkboxes) {
                const index = checkbox.dataset.index;
                const cantidad = parseInt(document.getElementById(`cantidad-${index}`).value);
                const motivo = document.getElementById(`motivo-${index}`).value;
                const condicion = document.getElementById(`condicion-${index}`).value;
                const detalle = pedido.detalles[index];

                if (!cantidad || cantidad < 1) {
                    Swal.showValidationMessage(`Cantidad inválida para ${detalle.nombre}`);
                    return false;
                }

                if (!motivo) {
                    Swal.showValidationMessage(`Debes seleccionar un motivo para ${detalle.nombre}`);
                    return false;
                }

                if (!condicion) {
                    Swal.showValidationMessage(`Debes seleccionar la condición para ${detalle.nombre}`);
                    return false;
                }

                items.push({
                    detalle_pedido_id: detalle.detalleid,
                    cantidad_paquetes: cantidad,
                    motivo: motivo,
                    condicion_producto: condicion
                });
            }

            return {
                pedido_id: pedido.pedidoid,
                items: items,
                notas_cliente: document.getElementById('notas-devolucion').value.trim() || null
            };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            await enviarSolicitudDevolucion(result.value);
        }
    });
}

async function enviarSolicitudDevolucion(data) {
    try {
        const response = await fetch('/api/cliente/devoluciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al crear la solicitud');
        }

        const result = await response.json();

        Swal.fire({
            icon: 'success',
            title: 'Solicitud Creada',
            html: `
                <p>Tu solicitud de devolución <strong>#${result.devolucion.devolucion_id}</strong> ha sido creada exitosamente.</p>
                <p>Monto: <strong>$${result.devolucion.monto_total}</strong></p>
                <div class="alert alert-info mt-3">
                    <i class="bi bi-camera"></i> No olvides subir fotos de los productos desde 
                    <a href="mis-devoluciones.html" class="alert-link">Mis Devoluciones</a>
                </div>
            `,
            confirmButtonText: 'Ver Mis Devoluciones',
            showCancelButton: true,
            cancelButtonText: 'Cerrar'
        }).then((result) => {
            if (result.isConfirmed) {
                window.location.href = 'mis-devoluciones.html';
            } else {
                location.reload();
            }
        });

    } catch (error) {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message
        });
    }
}

function puedeDevolver(pedido) {
    const fechaPedido = new Date(pedido.fechapedido);
    const fechaActual = new Date();
    const diasTranscurridos = Math.floor((fechaActual - fechaPedido) / (1000 * 60 * 60 * 24));
    
    const estatusPermitidos = ['Completado', 'Entregado', 'Parcial'];
    
    return diasTranscurridos <= 30 && estatusPermitidos.includes(pedido.estatus);
}

function diasRestantesDevolucion(pedido) {
    const fechaPedido = new Date(pedido.fechapedido);
    const fechaActual = new Date();
    const diasTranscurridos = Math.floor((fechaActual - fechaPedido) / (1000 * 60 * 60 * 24));
    return Math.max(0, 30 - diasTranscurridos);
}
