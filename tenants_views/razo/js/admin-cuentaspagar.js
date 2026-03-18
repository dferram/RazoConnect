// Optimized CxP Module - Consolidated Version & Fixed
// Estado global
const state = {
    currentPage: 1,
    itemsPerPage: 10,
    totalPages: 1,
    totalRecords: 0,
    filters: {
        search: '',
        estatus: '',
        fechaInicio: '',
        fechaFin: '',
        adminId: ''
    },
    selectedIds: new Set(),
    currentCxpId: null,
    currentUserRole: null
};

// NOTA: Se eliminó la declaración de fetchWithAuth porque ya existe globalmente.

// Funciones auxiliares
function formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN'
    }).format(amount || 0);
}

function escapeHtml(str) {
    return (str || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Cargar KPIs
async function cargarKPIs() {
    try {
        const params = new URLSearchParams();
        if (state.filters.adminId) params.append('adminId', state.filters.adminId);
        const url = `${API_BASE_URL}/admin/cuentas-por-pagar/kpis${params.toString() ? '?' + params.toString() : ''}`;
        const response = await fetchWithAuth(url);
        if (!response.ok) throw new Error('Error al cargar KPIs');
        
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Error del servidor');
        
        const kpis = data.data;
        document.getElementById('kpiTotalPorPagar').textContent = formatCurrency(kpis.total_por_pagar || 0);
        document.getElementById('kpiVencido').textContent = formatCurrency(kpis.vencido || 0);
        document.getElementById('kpiProximo').textContent = formatCurrency(kpis.proximo_vencer || 0);
        
        document.getElementById('kpiVencidoSub').textContent = `${kpis.count_vencido || 0} cuenta(s)`;
        document.getElementById('kpiProximoSub').textContent = `${kpis.count_proximo || 0} cuenta(s)`;
        
    } catch (error) {
        console.error('Error cargando KPIs:', error);
    }
}

// Mostrar/ocultar estado de carga
function mostrarCargando(mostrar) {
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const table = document.getElementById('cxpTable');
    
    if (mostrar) {
        loadingState.style.display = 'flex';
        emptyState.style.display = 'none';
        table.style.display = 'none';
    } else {
        loadingState.style.display = 'none';
        if (state.totalRecords === 0) {
            emptyState.style.display = 'block';
            table.style.display = 'none';
        } else {
            emptyState.style.display = 'none';
            table.style.display = 'table';
        }
    }
}

// Cargar tabla con paginación y filtros
async function cargarTablaCxP(page = state.currentPage) {
    try {
        mostrarCargando(true);
        
        const params = new URLSearchParams({
            page: page,
            limit: state.itemsPerPage
        });
        
        if (state.filters.search) params.append('search', state.filters.search);
        if (state.filters.estatus) params.append('estatus', state.filters.estatus);
        if (state.filters.fechaInicio) params.append('fechaInicio', state.filters.fechaInicio);
        if (state.filters.fechaFin) params.append('fechaFin', state.filters.fechaFin);
        if (state.filters.adminId) params.append('adminId', state.filters.adminId);
        
        const response = await fetchWithAuth(`${API_BASE_URL}/admin/cuentas-por-pagar?${params.toString()}`);
        if (!response.ok) throw new Error('Error al cargar datos');
        
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Error del servidor');
        
        state.currentPage = data.currentPage;
        state.totalPages = data.totalPages;
        state.totalRecords = data.totalRecords;
        
        renderizarTabla(data.data);
        renderizarPaginacion();
        mostrarCargando(false);
        
    } catch (error) {
        console.error('Error:', error);
        mostrarCargando(false);
        Swal.fire('Error', 'No se pudieron cargar los datos.', 'error');
    }
}

// Renderizar tabla con lógica de estatus mejorada
function renderizarTabla(facturas) {
    const tbody = document.getElementById('cxpTbody');
    if (!tbody) return;
    
    tbody.innerHTML = facturas.map(factura => {
        const saldoRestante = factura.saldo_restante || 0;
        const estatusCalculado = factura.estatus_calculado || factura.estatus;
        
        let badgeClass = 'bg-secondary';
        let estatusTexto = estatusCalculado;
        
        if (saldoRestante <= 0) {
            badgeClass = 'bg-success';
            estatusTexto = 'PAGADO';
        } else if (estatusCalculado === 'VENCIDO') {
            badgeClass = 'bg-danger';
        } else if (estatusCalculado === 'PARCIAL') {
            badgeClass = 'bg-info';
        } else if (estatusCalculado === 'PENDIENTE') {
            badgeClass = 'bg-warning text-dark';
        }
        
        const isChecked = state.selectedIds.has(factura.cxp_id);
        const isPagado = saldoRestante <= 0;
        
        const propietarioCell = state.currentUserRole === 'superadmin'
            ? `<td style="color: #6b7280; font-size: 0.875rem;">${escapeHtml(factura.propietario_nombre || 'Sin asignar')}</td>`
            : '';
        
        return `
            <tr ${isPagado ? 'style="opacity: 0.7;"' : ''}>
                <td class="text-center">
                    <input type="checkbox" 
                           class="form-check-input cxp-checkbox" 
                           data-id="${factura.cxp_id}"
                           ${isChecked ? 'checked' : ''}
                           ${isPagado ? 'disabled' : ''}>
                </td>
                <td>
                    <div class="fw-semibold">${escapeHtml(factura.proveedor)}</div>
                    ${factura.notas ? `<div class="text-muted small">${escapeHtml(factura.notas)}</div>` : ''}
                    ${factura.orden_compra_id ? `<div class="text-muted small"><i class="bi bi-box-seam"></i> Origen: OC #${factura.orden_compra_id}</div>` : ''}
                </td>
                <td>
                    ${factura.referencia_factura ? `<div class="fw-semibold">${escapeHtml(factura.referencia_factura)}</div>` : ''}
                    <div class="text-muted small">ID: ${factura.cxp_id}</div>
                </td>
                <td>${formatDate(factura.fecha_emision)}</td>
                <td>${formatDate(factura.fecha_vencimiento)}</td>
                <td class="text-end fw-semibold">${formatCurrency(factura.monto_total)}</td>
                <td class="text-end ${saldoRestante > 0 ? 'text-danger fw-bold' : 'text-success'}">
                    ${formatCurrency(saldoRestante)}
                </td>
                <td>
                    <span class="badge ${badgeClass}">
                        ${escapeHtml(estatusTexto)}
                    </span>
                </td>
                ${propietarioCell}
                <td class="text-center">
                    <div style="display: flex; gap: 0.5rem; justify-content: center;">
                        ${!isPagado ? `
                            <button class="btn btn-sm btn-outline-success" 
                                    onclick="abrirModalPago(${factura.cxp_id})" 
                                    title="Registrar pago"
                                    style="padding: 0.25rem 0.5rem; font-size: 0.875rem;">
                                <i class="bi bi-cash-coin"></i>
                            </button>
                        ` : ''}
                        <button class="btn btn-sm btn-outline-primary" 
                                onclick="verDetalle(${factura.cxp_id})" 
                                title="Ver detalle e historial"
                                style="padding: 0.25rem 0.5rem; font-size: 0.875rem;">
                            <i class="bi bi-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    document.getElementById('resultadosBadge').textContent = `${state.totalRecords} CUENTAS`;
    
    attachCheckboxListeners();
}

// Renderizar paginación con estructura Bootstrap 5 correcta
function renderizarPaginacion() {
    const paginationContainer = document.getElementById('pagination-controls');
    if (!paginationContainer) return;

    // Si solo hay una página, ocultar paginación
    if (state.totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    let html = '<nav aria-label="Navegación de páginas"><ul class="pagination justify-content-center mb-0">';
    
    // Botón anterior
    html += `<li class="page-item ${state.currentPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="event.preventDefault(); ${state.currentPage > 1 ? `cargarTablaCxP(${state.currentPage - 1})` : 'return false'}" aria-label="Anterior">
            <i class="bi bi-chevron-left"></i>
        </a>
    </li>`;

    // Números de página con lógica inteligente
    for (let i = 1; i <= state.totalPages; i++) {
        if (i === 1 || i === state.totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
            html += `<li class="page-item ${i === state.currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="event.preventDefault(); cargarTablaCxP(${i})">${i}</a>
            </li>`;
        } else if (i === state.currentPage - 2 || i === state.currentPage + 2) {
            html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }

    // Botón siguiente
    html += `<li class="page-item ${state.currentPage === state.totalPages ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="event.preventDefault(); ${state.currentPage < state.totalPages ? `cargarTablaCxP(${state.currentPage + 1})` : 'return false'}" aria-label="Siguiente">
            <i class="bi bi-chevron-right"></i>
        </a>
    </li>`;

    html += '</ul></nav>';
    paginationContainer.innerHTML = html;
}

// Gestión de selección múltiple
function attachCheckboxListeners() {
    document.querySelectorAll('.cxp-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.id);
            if (e.target.checked) {
                state.selectedIds.add(id);
            } else {
                state.selectedIds.delete(id);
            }
            actualizarSeleccionMultiple();
        });
    });
}

function actualizarSeleccionMultiple() {
    const selectAllCheckbox = document.getElementById('selectAll');
    if (selectAllCheckbox) {
        const visibleCheckboxes = document.querySelectorAll('.cxp-checkbox:not([disabled])');
        const allChecked = visibleCheckboxes.length > 0 && 
                           Array.from(visibleCheckboxes).every(cb => cb.checked);
        selectAllCheckbox.checked = allChecked;
    }
}

// Abrir modal de pago
async function abrirModalPago(cxpId) {
    state.currentCxpId = cxpId;
    
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/admin/cuentas-por-pagar/${cxpId}`);
        if (!response.ok) throw new Error('Error al cargar detalle');
        
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Error del servidor');
        
        const cxp = data.data;
        
        // Sanitización de datos numéricos: convertir saldo_restante a número
        let saldoRestante = parseFloat(cxp.saldo_restante);
        if (isNaN(saldoRestante)) {
            saldoRestante = 0;
        }
        
        document.getElementById('pagoDeudaActual').textContent = formatCurrency(saldoRestante);
        document.getElementById('pagoMonto').value = saldoRestante.toFixed(2);
        document.getElementById('pagoMonto').max = saldoRestante.toFixed(2);
        document.getElementById('pagoReferencia').value = '';
        document.getElementById('pagoComprobante').value = '';
        document.getElementById('pagoMetodo').value = 'TRANSFERENCIA';
        document.getElementById('pagoNotas').value = '';
        
        if (cxp.historial_pagos && cxp.historial_pagos.length > 0) {
            renderizarHistorialPagos(cxp.historial_pagos);
            document.getElementById('historialPagosSection').style.display = 'block';
        } else {
            document.getElementById('historialPagosSection').style.display = 'none';
        }
        
        document.getElementById('pagoModal').style.display = 'flex';
        
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'No se pudo cargar la información de la cuenta.', 'error');
    }
}

// Renderizar historial de pagos
function renderizarHistorialPagos(pagos) {
    const container = document.getElementById('historialPagosList');
    if (!container) return;
    
    container.innerHTML = pagos.map(pago => `
        <div class="historial-item" style="padding: 0.75rem; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: start;">
            <div>
                <div class="fw-semibold" style="color: #111827;">${formatCurrency(pago.monto)}</div>
                <div class="text-muted small">${formatDate(pago.fecha_pago)}</div>
                ${pago.referencia ? `<div class="text-muted small">Ref: ${escapeHtml(pago.referencia)}</div>` : ''}
                ${pago.notas ? `<div class="text-muted small">${escapeHtml(pago.notas)}</div>` : ''}
            </div>
            <div class="text-end">
                <span class="badge bg-secondary">${escapeHtml(pago.metodo_pago || 'N/A')}</span>
                ${pago.comprobante_url ? `<a href="${pago.comprobante_url}" target="_blank" class="btn btn-sm btn-link" title="Ver comprobante"><i class="bi bi-paperclip"></i></a>` : ''}
            </div>
        </div>
    `).join('');
}

// Cerrar modal
function cerrarModalPago() {
    document.getElementById('pagoModal').style.display = 'none';
    state.currentCxpId = null;
}

// Guardar pago
async function guardarPago() {
    if (!state.currentCxpId) return;
    
    const monto = parseFloat(document.getElementById('pagoMonto').value);
    const metodoPago = document.getElementById('pagoMetodo').value;
    const referencia = document.getElementById('pagoReferencia').value;
    const notas = document.getElementById('pagoNotas').value;
    const comprobante = document.getElementById('pagoComprobante').files[0];
    
    if (!monto || monto <= 0) {
        Swal.fire('Error', 'Ingresa un monto válido.', 'error');
        return;
    }
    
    try {
        document.getElementById('btnGuardarPagoText').style.display = 'none';
        document.getElementById('btnGuardarPagoSpinner').style.display = 'inline-block';
        document.getElementById('btnGuardarPago').disabled = true;
        
        const formData = new FormData();
        formData.append('monto', monto);
        formData.append('metodoPago', metodoPago);
        if (referencia) formData.append('referencia', referencia);
        if (notas) formData.append('notas', notas);
        if (comprobante) formData.append('comprobante', comprobante);
        
        const response = await fetchWithAuth(`${API_BASE_URL}/admin/cuentas-por-pagar/${state.currentCxpId}/pagar`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Error al registrar el pago');
        }
        
        await Swal.fire({
            icon: 'success',
            title: 'Pago Registrado',
            text: `Saldo restante: ${formatCurrency(data.data.saldo_restante)}`,
            timer: 2000
        });
        
        cerrarModalPago();
        await cargarTablaCxP();
        await cargarKPIs();
        
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', error.message || 'No se pudo registrar el pago.', 'error');
    } finally {
        document.getElementById('btnGuardarPagoText').style.display = 'inline';
        document.getElementById('btnGuardarPagoSpinner').style.display = 'none';
        document.getElementById('btnGuardarPago').disabled = false;
    }
}

// Ver detalle de cuenta en modal personalizado
async function verDetalle(cxpId) {
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/admin/cuentas-por-pagar/${cxpId}`);
        if (!response.ok) throw new Error('Error al cargar detalle');
        
        const data = await response.json();
        if (!data.success) throw new Error(data.message || 'Error del servidor');
        
        const cxp = data.data;
        
        // Llenar datos del modal
        document.getElementById('detalleModalTitle').textContent = `Cuenta por Pagar #${cxp.cxp_id}`;
        document.getElementById('detalleProveedor').textContent = cxp.proveedor;
        document.getElementById('detalleReferencia').textContent = cxp.referencia_factura || 'N/A';
        
        const origenContainer = document.getElementById('detalleOrigenContainer');
        const origenEl = document.getElementById('detalleOrigen');
        if (cxp.orden_compra_id) {
            origenEl.textContent = `Entrada de Almacén - OC #${cxp.orden_compra_id}`;
            origenContainer.style.display = 'block';
        } else {
            origenContainer.style.display = 'none';
        }
        
        document.getElementById('detalleFechaEmision').textContent = formatDate(cxp.fecha_emision);
        document.getElementById('detalleFechaVencimiento').textContent = formatDate(cxp.fecha_vencimiento);
        document.getElementById('detalleMontoTotal').textContent = formatCurrency(cxp.monto_total);
        document.getElementById('detalleMontoPagado').textContent = formatCurrency(cxp.monto_pagado || 0);
        
        const saldoEl = document.getElementById('detalleSaldoRestante');
        saldoEl.textContent = formatCurrency(cxp.saldo_restante);
        saldoEl.style.color = cxp.saldo_restante > 0 ? '#dc3545' : '#28a745';
        
        const notasContainer = document.getElementById('detalleNotasContainer');
        const notasEl = document.getElementById('detalleNotas');
        if (cxp.notas) {
            notasEl.textContent = cxp.notas;
            notasContainer.style.display = 'block';
        } else {
            notasContainer.style.display = 'none';
        }
        
        // Renderizar historial de pagos
        const historialContainer = document.getElementById('detalleHistorialPagos');
        const historialSection = document.getElementById('detalleHistorialSection');
        
        if (cxp.historial_pagos && cxp.historial_pagos.length > 0) {
            historialContainer.innerHTML = cxp.historial_pagos.map(pago => `
                <div style="padding: 0.75rem; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <div class="fw-semibold" style="color: #059669;">${formatCurrency(pago.monto)}</div>
                        <div class="text-muted small">${formatDate(pago.fecha_pago)}</div>
                        <div class="text-muted small">Método: ${escapeHtml(pago.metodo_pago || 'N/A')}</div>
                        ${pago.referencia ? `<div class="text-muted small">Ref: ${escapeHtml(pago.referencia)}</div>` : ''}
                    </div>
                    ${pago.comprobante_url ? `<a href="${pago.comprobante_url}" target="_blank" class="btn btn-sm btn-link" title="Ver comprobante"><i class="bi bi-paperclip"></i></a>` : ''}
                </div>
            `).join('');
            historialSection.style.display = 'block';
        } else {
            historialSection.style.display = 'none';
        }
        
        // Mostrar modal
        document.getElementById('detalleModal').style.display = 'flex';
        
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'No se pudo cargar el detalle.', 'error');
    }
}

// Cerrar modal de detalle
function cerrarModalDetalle() {
    document.getElementById('detalleModal').style.display = 'none';
}

// Aplicar filtros
function aplicarFiltros() {
    state.filters.search = document.getElementById('searchInput')?.value || '';
    state.filters.estatus = document.getElementById('filtroEstatus')?.value || '';
    state.filters.fechaInicio = document.getElementById('fechaInicio')?.value || '';
    state.filters.fechaFin = document.getElementById('fechaFin')?.value || '';
    state.filters.adminId = document.getElementById('filtroAdmin')?.value || '';
    
    state.currentPage = 1;
    cargarTablaCxP();
    cargarKPIs();
}

// Limpiar filtros
function limpiarFiltros() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filtroEstatus').value = '';
    document.getElementById('fechaInicio').value = '';
    document.getElementById('fechaFin').value = '';
    if (document.getElementById('filtroAdmin')) {
        document.getElementById('filtroAdmin').value = '';
    }
    
    state.filters = {
        search: '',
        estatus: '',
        fechaInicio: '',
        fechaFin: '',
        adminId: ''
    };
    
    state.currentPage = 1;
    cargarTablaCxP();
    cargarKPIs();
}

// Cargar lista de administradores para el filtro
async function loadAdminList() {
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/admin/administradores`);
        if (!response.ok) return;
        
        const data = await response.json();
        if (data.success && data.data) {
            const admins = data.data;
            const filtroAdmin = document.getElementById('filtroAdmin');
            if (filtroAdmin) {
                filtroAdmin.innerHTML = '<option value="">Todos los administradores</option>';
                admins.forEach(admin => {
                    const option = document.createElement('option');
                    option.value = admin.adminid;
                    option.textContent = `${admin.nombre} (${admin.rol === 'superadmin' ? 'Super Admin' : 'Admin'})`;
                    filtroAdmin.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error cargando lista de administradores:', error);
    }
}

// Verificar rol del usuario y mostrar filtro si es superadmin
async function verificarRolUsuario() {
    try {
        const response = await fetchWithAuth(`${API_BASE_URL}/admin/verify`);
        if (!response.ok) return;
        
        const data = await response.json();
        if (data.success && data.data.admin) {
            state.currentUserRole = data.data.admin.rol;
            
            if (data.data.admin.rol === 'superadmin') {
                const filtroAdminContainer = document.getElementById('filtroAdminContainer');
                const thPropietario = document.getElementById('thPropietario');
                if (filtroAdminContainer) filtroAdminContainer.style.display = 'block';
                if (thPropietario) thPropietario.style.display = '';
                await loadAdminList();
            }
        }
    } catch (error) {
        console.error('Error verificando rol de usuario:', error);
    }
}

// Inicializar y Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    await verificarRolUsuario();
    cargarKPIs();
    cargarTablaCxP();
    
    document.getElementById('btnRefresh')?.addEventListener('click', () => {
        cargarKPIs();
        cargarTablaCxP();
    });
    
    document.getElementById('btnCerrarModal')?.addEventListener('click', cerrarModalPago);
    document.getElementById('btnCancelarPago')?.addEventListener('click', cerrarModalPago);
    document.getElementById('btnGuardarPago')?.addEventListener('click', guardarPago);
    
    document.getElementById('btnAplicarFiltros')?.addEventListener('click', aplicarFiltros);
    document.getElementById('btnLimpiarFiltros')?.addEventListener('click', limpiarFiltros);
    
    document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') aplicarFiltros();
    });
    
    document.getElementById('selectAll')?.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.cxp-checkbox:not([disabled])');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            const id = parseInt(cb.dataset.id);
            if (e.target.checked) {
                state.selectedIds.add(id);
            } else {
                state.selectedIds.delete(id);
            }
        });
    });
    
    document.getElementById('pagoModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'pagoModal') cerrarModalPago();
    });
    
    document.getElementById('filtroEstatus')?.addEventListener('change', aplicarFiltros);
    document.getElementById('filtroAdmin')?.addEventListener('change', aplicarFiltros);

    // Exportación con filtros activos (respeta la vista actual)
    document.getElementById('btn-exportar')?.addEventListener('click', async () => {
        try {
            // Construir parámetros de filtros activos
            const params = new URLSearchParams();
            if (state.filters.search) params.append('search', state.filters.search);
            if (state.filters.estatus) params.append('estatus', state.filters.estatus);
            if (state.filters.fechaInicio) params.append('fechaInicio', state.filters.fechaInicio);
            if (state.filters.fechaFin) params.append('fechaFin', state.filters.fechaFin);
            if (state.filters.adminId) params.append('adminId', state.filters.adminId);
            
            const queryString = params.toString();
            const hasFilters = queryString.length > 0;
            
            Swal.fire({
                title: hasFilters ? 'Exportando Vista Filtrada...' : 'Generando Lote de Pagos...',
                text: hasFilters 
                    ? 'Exportando solo los registros que coinciden con tus filtros actuales.' 
                    : 'Por favor espera mientras procesamos los registros pendientes.',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading() }
            });

            const url = `${API_BASE_URL}/admin/cxp/exportar${queryString ? `?${queryString}` : ''}`;
            const response = await fetchWithAuth(url, { method: 'GET' });

            if (response.status === 404) {
                Swal.fire('Sin Datos', 'No hay registros que coincidan con los filtros aplicados.', 'info');
                return;
            }

            if (!response.ok) throw new Error('Error al generar reporte');

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            const fileName = hasFilters 
                ? `CXP_Filtrado_${new Date().toISOString().slice(0,10)}.xlsx`
                : `CXP_Pendientes_${new Date().toISOString().slice(0,10)}.xlsx`;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);

            Swal.fire({
                icon: 'success',
                title: 'Exportación Exitosa',
                text: hasFilters 
                    ? `Se exportaron ${state.totalRecords} registro(s) filtrado(s)` 
                    : 'Los registros han sido archivados correctamente',
                timer: 2500
            }).then(() => {
                if (!hasFilters) cargarTablaCxP(); // Solo recargar si fue exportación completa
            });

        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'No se pudo generar el reporte.', 'error');
        }
    });

    // Exportación a PDF con filtros activos
    document.getElementById('btn-exportar-pdf')?.addEventListener('click', async () => {
        try {
            const params = new URLSearchParams();
            if (state.filters.fechaInicio) params.append('fechaInicio', state.filters.fechaInicio);
            if (state.filters.fechaFin) params.append('fechaFin', state.filters.fechaFin);
            if (state.filters.estatus) params.append('estatus', state.filters.estatus);
            
            Swal.fire({
                title: 'Generando PDF...',
                text: 'Por favor espera mientras se genera el reporte.',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading() }
            });

            const url = `${API_BASE_URL}/admin/cxp/pdf${params.toString() ? `?${params.toString()}` : ''}`;
            const response = await fetchWithAuth(url, { method: 'GET' });

            if (!response.ok) throw new Error('Error al generar PDF');

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `CXP_Reporte_${new Date().toISOString().slice(0,10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);

            Swal.fire({
                icon: 'success',
                title: 'PDF Generado',
                text: 'El reporte PDF se ha descargado correctamente',
                timer: 2500
            });

        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'No se pudo generar el PDF.', 'error');
        }
    });
});