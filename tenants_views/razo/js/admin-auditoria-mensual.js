let sesionActualId = null;
let conteosCache = [];
let modalNuevaSesion, modalReconciliacion, modalComentario;
let conteoIdActual = null;

document.addEventListener('DOMContentLoaded', () => {
    modalNuevaSesion = new bootstrap.Modal(document.getElementById('modal-nueva-sesion'));
    modalReconciliacion = new bootstrap.Modal(document.getElementById('modal-reconciliacion'));
    modalComentario = new bootstrap.Modal(document.getElementById('modal-comentario'));

    cargarSesiones();
    inicializarEventListeners();
});

function inicializarEventListeners() {
    document.getElementById('btn-nueva-sesion').addEventListener('click', () => {
        document.getElementById('input-nombre-sesion').value = '';
        modalNuevaSesion.show();
    });

    document.getElementById('btn-crear-sesion').addEventListener('click', crearNuevaSesion);

    document.getElementById('form-conteo-ciego').addEventListener('submit', (e) => {
        e.preventDefault();
        registrarConteo();
    });

    document.getElementById('btn-volver-sesiones').addEventListener('click', () => {
        mostrarVistaSesiones();
    });

    document.getElementById('btn-ver-reconciliacion').addEventListener('click', () => {
        cargarReconciliacion();
    });

    document.getElementById('btn-cerrar-auditoria').addEventListener('click', cerrarYSincronizarAuditoria);

    document.getElementById('btn-guardar-comentario').addEventListener('click', guardarComentario);

    document.getElementById('btn-exportar-reconciliacion').addEventListener('click', exportarReconciliacion);

    document.getElementById('input-filtro-reconciliacion').addEventListener('input', (e) => {
        filtrarTablaReconciliacion(e.target.value);
    });

    document.getElementById('input-sku').addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
}

async function cargarSesiones() {
    try {
        const response = await fetch('/api/admin/auditoria/sesiones', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Error al cargar sesiones');

        const data = await response.json();
        renderizarTablaSesiones(data.sesiones);
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'No se pudieron cargar las sesiones de auditoría', 'error');
    }
}

function renderizarTablaSesiones(sesiones) {
    const tbody = document.getElementById('tabla-sesiones');

    if (!sesiones || sesiones.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted">
                    <i class="bi bi-inbox"></i> No hay sesiones de auditoría registradas
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = sesiones.map(sesion => {
        const fechaInicio = new Date(sesion.fechainicio).toLocaleString('es-MX');
        const fechaCierre = sesion.fechacierre ? new Date(sesion.fechacierre).toLocaleString('es-MX') : '-';
        
        let badgeEstatus = '';
        if (sesion.estatus === 'ABIERTA') {
            badgeEstatus = '<span class="badge bg-success">ABIERTA</span>';
        } else if (sesion.estatus === 'CERRADA') {
            badgeEstatus = '<span class="badge bg-secondary">CERRADA</span>';
        }

        const porcentajeAplicado = sesion.total_conteos > 0 
            ? Math.round((sesion.conteos_aplicados / sesion.total_conteos) * 100) 
            : 0;

        return `
            <tr>
                <td>${sesion.sesionid}</td>
                <td><strong>${sesion.nombre}</strong></td>
                <td>${fechaInicio}</td>
                <td>${fechaCierre}</td>
                <td>${badgeEstatus}</td>
                <td>${sesion.total_conteos}</td>
                <td>
                    ${sesion.conteos_aplicados} 
                    <small class="text-muted">(${porcentajeAplicado}%)</small>
                </td>
                <td>
                    ${sesion.estatus === 'ABIERTA' ? `
                        <button class="btn btn-sm btn-primary" onclick="abrirSesion(${sesion.sesionid}, '${sesion.nombre}')">
                            <i class="bi bi-pencil-square"></i> Continuar
                        </button>
                    ` : `
                        <button class="btn btn-sm btn-outline-secondary" onclick="verReporteSesion(${sesion.sesionid})">
                            <i class="bi bi-file-text"></i> Ver Reporte
                        </button>
                    `}
                </td>
            </tr>
        `;
    }).join('');
}

async function crearNuevaSesion() {
    const nombre = document.getElementById('input-nombre-sesion').value.trim();

    if (!nombre) {
        Swal.fire('Atención', 'Por favor ingresa un nombre para la sesión', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/admin/auditoria/sesiones', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ nombre })
        });

        if (!response.ok) throw new Error('Error al crear sesión');

        const data = await response.json();
        
        modalNuevaSesion.hide();
        
        Swal.fire({
            icon: 'success',
            title: 'Sesión Creada',
            text: 'La sesión de auditoría ha sido creada exitosamente',
            timer: 2000,
            showConfirmButton: false
        });

        abrirSesion(data.sesion.sesionid, data.sesion.nombre);
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'No se pudo crear la sesión de auditoría', 'error');
    }
}

async function abrirSesion(sesionId, nombreSesion) {
    sesionActualId = sesionId;
    
    document.getElementById('nombre-sesion-actual').textContent = nombreSesion;
    document.getElementById('info-sesion-actual').textContent = `Sesión ID: ${sesionId}`;
    
    mostrarVistaConteo();
    
    await cargarEstadisticasSesion();
    
    document.getElementById('input-sku').value = '';
    document.getElementById('input-cantidad-fisica').value = '';
    document.getElementById('resultado-conteo').innerHTML = `
        <i class="bi bi-info-circle stat-icon"></i>
        <p class="mt-2">Registra un conteo para ver el resultado</p>
    `;
}

function mostrarVistaSesiones() {
    document.getElementById('vista-sesiones').classList.remove('d-none');
    document.getElementById('vista-conteo').classList.add('d-none');
    sesionActualId = null;
    cargarSesiones();
}

function mostrarVistaConteo() {
    document.getElementById('vista-sesiones').classList.add('d-none');
    document.getElementById('vista-conteo').classList.remove('d-none');
}

async function registrarConteo() {
    const sku = document.getElementById('input-sku').value.trim();
    const cantidadFisica = parseInt(document.getElementById('input-cantidad-fisica').value);

    if (!sku || isNaN(cantidadFisica) || cantidadFisica < 0) {
        Swal.fire('Atención', 'Por favor ingresa un SKU válido y una cantidad física', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/admin/auditoria/sesiones/${sesionActualId}/conteos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ sku, cantidadFisica })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al registrar conteo');
        }

        const data = await response.json();
        
        mostrarResultadoConteo(data, sku, cantidadFisica);
        
        document.getElementById('input-sku').value = '';
        document.getElementById('input-cantidad-fisica').value = '';
        document.getElementById('input-sku').focus();
        
        await cargarEstadisticasSesion();
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', error.message, 'error');
    }
}

function mostrarResultadoConteo(data, sku, cantidadFisica) {
    const diferencia = data.diferencia;
    const stockTeorico = data.stockTeorico;
    
    let semaforoClass = '';
    let semaforoIcon = '';
    let semaforoTexto = '';
    
    if (diferencia === 0) {
        semaforoClass = 'text-success';
        semaforoIcon = 'bi-check-circle-fill';
        semaforoTexto = 'Conciliado';
    } else if (Math.abs(diferencia) <= 2) {
        semaforoClass = 'text-warning';
        semaforoIcon = 'bi-exclamation-triangle-fill';
        semaforoTexto = 'Diferencia Mínima';
    } else {
        semaforoClass = 'text-danger';
        semaforoIcon = 'bi-x-circle-fill';
        semaforoTexto = 'Diferencia Significativa';
    }

    const resultadoHTML = `
        <div class="alert alert-${diferencia === 0 ? 'success' : diferencia <= 2 ? 'warning' : 'danger'} mb-3">
            <h5 class="${semaforoClass}">
                <i class="bi ${semaforoIcon}"></i> ${semaforoTexto}
            </h5>
        </div>
        <div class="row text-center">
            <div class="col-6">
                <h6 class="text-muted">Stock Teórico</h6>
                <h2>${stockTeorico}</h2>
            </div>
            <div class="col-6">
                <h6 class="text-muted">Stock Físico</h6>
                <h2>${cantidadFisica}</h2>
            </div>
        </div>
        <hr>
        <div class="text-center">
            <h6 class="text-muted">Diferencia</h6>
            <h2 class="${diferencia > 0 ? 'text-success' : diferencia < 0 ? 'text-danger' : 'text-muted'}">
                ${diferencia > 0 ? '+' : ''}${diferencia}
            </h2>
        </div>
    `;

    document.getElementById('resultado-conteo').innerHTML = resultadoHTML;
    
    if (Math.abs(diferencia) > 2) {
        Swal.fire({
            icon: 'warning',
            title: 'Diferencia Significativa Detectada',
            text: `El SKU ${sku} tiene una diferencia de ${diferencia} unidades. Se requiere un comentario de justificación.`,
            confirmButtonText: 'Agregar Comentario Ahora',
            showCancelButton: true,
            cancelButtonText: 'Después'
        }).then((result) => {
            if (result.isConfirmed) {
                cargarReconciliacion();
            }
        });
    }
}

async function cargarEstadisticasSesion() {
    try {
        const response = await fetch(`/api/admin/auditoria/sesiones/${sesionActualId}/reconciliacion`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Error al cargar estadísticas');

        const data = await response.json();
        conteosCache = data.conteos;
        
        document.getElementById('stat-total-productos').textContent = data.resumen.totalProductos;
        document.getElementById('stat-conciliados').textContent = data.resumen.totalConciliados;
        document.getElementById('stat-con-diferencia').textContent = data.resumen.totalConDiferencia;
        document.getElementById('stat-impacto-economico').textContent = 
            `$${data.resumen.impactoEconomicoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
        
        const btnCerrar = document.getElementById('btn-cerrar-auditoria');
        if (data.resumen.requierenComentario > 0) {
            btnCerrar.disabled = true;
            btnCerrar.innerHTML = `
                <i class="bi bi-exclamation-triangle"></i> 
                ${data.resumen.requierenComentario} producto(s) requieren comentario
            `;
        } else if (data.resumen.totalProductos > 0) {
            btnCerrar.disabled = false;
            btnCerrar.innerHTML = `
                <i class="bi bi-lock"></i> Cerrar y Sincronizar (Solo Super Admin)
            `;
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function cargarReconciliacion() {
    try {
        const response = await fetch(`/api/admin/auditoria/sesiones/${sesionActualId}/reconciliacion`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Error al cargar reconciliación');

        const data = await response.json();
        conteosCache = data.conteos;
        
        renderizarTablaReconciliacion(data.conteos);
        modalReconciliacion.show();
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'No se pudo cargar la tabla de reconciliación', 'error');
    }
}

function renderizarTablaReconciliacion(conteos) {
    const tbody = document.getElementById('tabla-reconciliacion');

    if (!conteos || conteos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted">No hay conteos registrados</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = conteos.map(conteo => {
        let badgeSemaforo = '';
        if (conteo.semaforo === 'verde') {
            badgeSemaforo = '<span class="badge bg-success badge-semaforo">✓ OK</span>';
        } else if (conteo.semaforo === 'amarillo') {
            badgeSemaforo = '<span class="badge bg-warning badge-semaforo">⚠ Mínima</span>';
        } else {
            badgeSemaforo = '<span class="badge bg-danger badge-semaforo">✗ Alta</span>';
        }

        const impactoClass = conteo.impactoEconomico > 0 ? 'impact-positive' : 
                            conteo.impactoEconomico < 0 ? 'impact-negative' : '';

        const comentarioHTML = conteo.comentario 
            ? `<small class="text-muted">${conteo.comentario}</small>`
            : conteo.requiereComentario 
                ? '<span class="badge bg-danger">Requerido</span>'
                : '-';

        return `
            <tr class="semaforo-${conteo.semaforo}">
                <td><strong>${conteo.sku}</strong></td>
                <td>${conteo.productoNombre}</td>
                <td><small>${conteo.dimensiones || '-'}</small></td>
                <td class="text-center">${conteo.stockTeorico}</td>
                <td class="text-center"><strong>${conteo.cantidadFisica}</strong></td>
                <td class="text-center ${conteo.diferencia > 0 ? 'text-success' : conteo.diferencia < 0 ? 'text-danger' : ''}">
                    ${conteo.diferencia > 0 ? '+' : ''}${conteo.diferencia}
                </td>
                <td class="text-end ${impactoClass}">
                    $${conteo.impactoEconomico.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </td>
                <td class="text-center">${badgeSemaforo}</td>
                <td>${comentarioHTML}</td>
                <td>
                    ${conteo.requiereComentario || !conteo.comentario ? `
                        <button class="btn btn-sm btn-outline-primary" onclick="abrirModalComentario(${conteo.conteoId}, '${conteo.sku}', ${conteo.diferencia})">
                            <i class="bi bi-chat-left-text"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function filtrarTablaReconciliacion(filtro) {
    const filtroLower = filtro.toLowerCase();
    const conteosFiltrados = conteosCache.filter(conteo => 
        conteo.sku.toLowerCase().includes(filtroLower) ||
        conteo.productoNombre.toLowerCase().includes(filtroLower)
    );
    renderizarTablaReconciliacion(conteosFiltrados);
}

function abrirModalComentario(conteoId, sku, diferencia) {
    conteoIdActual = conteoId;
    document.getElementById('comentario-sku').value = sku;
    document.getElementById('comentario-diferencia').value = `${diferencia > 0 ? '+' : ''}${diferencia} unidades`;
    document.getElementById('input-comentario').value = '';
    
    modalReconciliacion.hide();
    modalComentario.show();
}

async function guardarComentario() {
    const comentario = document.getElementById('input-comentario').value.trim();

    if (!comentario) {
        Swal.fire('Atención', 'Por favor ingresa un comentario de justificación', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/admin/auditoria/conteos/${conteoIdActual}/comentario`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ comentario })
        });

        if (!response.ok) throw new Error('Error al guardar comentario');

        modalComentario.hide();
        
        Swal.fire({
            icon: 'success',
            title: 'Comentario Guardado',
            text: 'El comentario de justificación ha sido registrado',
            timer: 2000,
            showConfirmButton: false
        });

        await cargarEstadisticasSesion();
        
        setTimeout(() => {
            modalReconciliacion.show();
            cargarReconciliacion();
        }, 500);
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'No se pudo guardar el comentario', 'error');
    }
}

async function cerrarYSincronizarAuditoria() {
    const result = await Swal.fire({
        title: '¿Cerrar y Sincronizar Auditoría?',
        html: `
            <p><strong>Esta acción es irreversible.</strong></p>
            <p>El stock del sistema se actualizará con los conteos físicos registrados.</p>
            <p>Solo Super Admins pueden realizar esta operación.</p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, Cerrar y Sincronizar',
        cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    try {
        const response = await fetch(`/api/admin/auditoria/sesiones/${sesionActualId}/cerrar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al cerrar auditoría');
        }

        const data = await response.json();

        await Swal.fire({
            icon: 'success',
            title: 'Auditoría Cerrada y Sincronizada',
            html: `
                <p>La auditoría ha sido cerrada exitosamente.</p>
                <p><strong>${data.ajustesRealizados}</strong> ajustes aplicados al inventario.</p>
            `,
            confirmButtonText: 'Entendido'
        });

        mostrarVistaSesiones();
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', error.message, 'error');
    }
}

async function verReporteSesion(sesionId) {
    try {
        const response = await fetch(`/api/admin/auditoria/sesiones/${sesionId}/reporte`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) throw new Error('Error al cargar reporte');

        const data = await response.json();

        const resumen = data.resumen;
        const sesion = data.sesion;

        Swal.fire({
            title: `Reporte: ${sesion.nombre}`,
            html: `
                <div class="text-start">
                    <p><strong>Fecha Inicio:</strong> ${new Date(sesion.fechainicio).toLocaleString('es-MX')}</p>
                    <p><strong>Fecha Cierre:</strong> ${sesion.fechacierre ? new Date(sesion.fechacierre).toLocaleString('es-MX') : '-'}</p>
                    <p><strong>Estatus:</strong> ${sesion.estatus}</p>
                    <hr>
                    <h6>Resumen de Auditoría</h6>
                    <ul>
                        <li>Total Productos: ${resumen.totalProductos}</li>
                        <li>Conciliados: ${resumen.totalConciliados} (${resumen.porSemaforo.verde})</li>
                        <li>Con Diferencia Mínima: ${resumen.porSemaforo.amarillo}</li>
                        <li>Con Diferencia Alta: ${resumen.porSemaforo.rojo}</li>
                        <li>Impacto Económico Total: $${resumen.impactoEconomicoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</li>
                    </ul>
                </div>
            `,
            width: 600,
            confirmButtonText: 'Cerrar'
        });
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'No se pudo cargar el reporte', 'error');
    }
}

function exportarReconciliacion() {
    if (!conteosCache || conteosCache.length === 0) {
        Swal.fire('Atención', 'No hay datos para exportar', 'warning');
        return;
    }

    const headers = ['SKU', 'Producto', 'Dimensiones', 'Stock Teórico', 'Stock Físico', 'Diferencia', 'Impacto Económico', 'Semáforo', 'Comentario'];
    
    const rows = conteosCache.map(conteo => [
        conteo.sku,
        conteo.productoNombre,
        conteo.dimensiones || '',
        conteo.stockTeorico,
        conteo.cantidadFisica,
        conteo.diferencia,
        conteo.impactoEconomico,
        conteo.semaforo.toUpperCase(),
        conteo.comentario || ''
    ]);

    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
        csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `reconciliacion_auditoria_${sesionActualId}_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Swal.fire({
        icon: 'success',
        title: 'Exportado',
        text: 'La tabla de reconciliación ha sido exportada a CSV',
        timer: 2000,
        showConfirmButton: false
    });
}
