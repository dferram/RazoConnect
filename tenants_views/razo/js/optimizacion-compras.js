class OptimizacionComprasManager {
  constructor() {
    this.oportunidades = [];
    this.resumen = {};
  }

  async verificarOportunidades() {
    try {
      const response = await fetch('/api/admin/ordenes/sugerencias-optimizacion', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Error al obtener sugerencias de optimización');
      }

      const result = await response.json();

      if (result.success && result.data) {
        this.oportunidades = result.data.oportunidades || [];
        this.resumen = result.data.resumen || {};

        if (this.oportunidades.length > 0) {
          this.mostrarModal();
        }
      }

    } catch (error) {
      console.error('Error verificando oportunidades:', error);
    }
  }

  mostrarModal() {
    const modalEl = document.getElementById('modalOptimizacionCompras');
    if (!modalEl) return;
    this.renderizarResumen();
    this.renderizarOportunidades();
    modalEl.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  cerrarModal() {
    const modalEl = document.getElementById('modalOptimizacionCompras');
    if (modalEl) modalEl.style.display = 'none';
    document.body.style.overflow = '';
  }

  renderizarResumen() {
    document.getElementById('totalOportunidades').textContent = this.resumen.totalOportunidades || 0;
    document.getElementById('ahorroTotal').textContent = `${(this.resumen.ahorroTotalPiezas || 0).toLocaleString('es-MX')} piezas`;
    document.getElementById('ordenesAfectadas').textContent = this.resumen.ordenesAfectadas || 0;

    const btnAgruparTodas = document.getElementById('btnAgruparTodas');
    if (this.oportunidades.length === 0) {
      btnAgruparTodas.style.display = 'none';
      document.getElementById('resumenOptimizacion').style.display = 'none';
      document.getElementById('noOportunidades').style.display = 'block';
    } else {
      btnAgruparTodas.style.display = 'inline-block';
      document.getElementById('resumenOptimizacion').style.display = 'block';
      document.getElementById('noOportunidades').style.display = 'none';
      
      btnAgruparTodas.onclick = () => this.agruparTodasLasOportunidades();
    }
  }

  renderizarOportunidades() {
    const container = document.getElementById('listaOportunidades');
    container.innerHTML = '';

    this.oportunidades.forEach((oportunidad, index) => {
      const card = this.crearTarjetaOportunidad(oportunidad, index);
      container.appendChild(card);
    });
  }

  crearTarjetaOportunidad(oportunidad, index) {
    const card = document.createElement('div');
    card.style.cssText = 'border:2px solid #e5e7eb; border-radius:0.75rem; overflow:hidden; margin-bottom:1.5rem; background:white; box-shadow:0 2px 8px rgba(0,0,0,0.06);';

    const packSize = oportunidad.packSize;
    const desperdicioSeparado = oportunidad.totalSeparado - oportunidad.totalSolicitado;
    const desperdicioAgrupado = oportunidad.totalAgrupado - oportunidad.totalSolicitado;

    const filasOrdenes = oportunidad.ordenesDetalle.map(orden => {
      const desperdicio = orden.piezasAComprar - orden.cantidadSolicitada;
      return `
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:0.5rem 0.75rem;"><strong style="color:#F97316;">#${orden.ordenCompraId}</strong></td>
          <td style="padding:0.5rem 0.75rem; text-align:center;">${orden.cantidadSolicitada} pzas</td>
          <td style="padding:0.5rem 0.75rem; text-align:center; color:#6b7280;">${orden.paquetesNecesarios} paq &times; ${packSize} pzas</td>
          <td style="padding:0.5rem 0.75rem; text-align:center; font-weight:700; color:#DC2626;">${orden.piezasAComprar} pzas</td>
          <td style="padding:0.5rem 0.75rem; text-align:center; font-weight:600; color:${desperdicio > 0 ? '#DC2626' : '#16A34A'};">${desperdicio > 0 ? '+' + desperdicio + ' sobrantes' : 'Exacto ✓'}</td>
          <td style="padding:0.5rem 0.75rem; font-size:0.8rem; color:#9ca3af;">${new Date(orden.fechaCreacion).toLocaleDateString('es-MX', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
        </tr>
      `;
    }).join('');

    card.innerHTML = `
      <div style="background:#FFF7ED; border-bottom:2px solid #F97316; padding:1rem 1.5rem; display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.75rem;">
        <div>
          <div style="font-weight:800; color:#F97316; font-size:1rem; margin-bottom:0.25rem;">
            <i class="bi bi-box-seam me-1"></i>${oportunidad.productoNombre}${oportunidad.dimensionesFisicas ? ' — ' + oportunidad.dimensionesFisicas : ''}
          </div>
          <div style="color:#6b5d57; font-size:0.875rem;">
            <strong>SKU:</strong> ${oportunidad.sku} &nbsp;|&nbsp;
            <strong>Proveedor:</strong> ${oportunidad.proveedorNombre} &nbsp;|&nbsp;
            <strong>Pack Size:</strong> ${packSize} pzas/paquete
          </div>
        </div>
        <span style="background:#16A34A; color:white; font-size:0.95rem; font-weight:700; padding:0.5rem 1rem; border-radius:0.5rem; white-space:nowrap;">
          <i class="bi bi-piggy-bank me-1"></i>Ahorro: ${oportunidad.ahorroPiezas} pzas (${oportunidad.porcentajeAhorro}%)
        </span>
      </div>

      <div style="background:#EFF6FF; border-left:4px solid #3B82F6; padding:0.875rem 1.5rem;">
        <div style="font-weight:700; color:#1D4ED8; margin-bottom:0.375rem; font-size:0.875rem;">
          <i class="bi bi-question-circle-fill me-1"></i>¿Por qué se ahorra comprando en grupo?
        </div>
        <p style="color:#1e40af; font-size:0.875rem; margin:0; line-height:1.6;">
          Las órdenes de compra se procesan por <strong>paquetes completos de ${packSize} piezas</strong>.
          Cuando cada orden compra por separado, cada una debe <strong>redondear al siguiente paquete completo</strong>,
          generando piezas sobrantes. Al consolidarlas en una sola compra, el redondeo ocurre
          <strong>una única vez sobre el total</strong>, reduciendo el sobrante de
          <span style="color:#DC2626; font-weight:700;">+${desperdicioSeparado} pzas</span> a
          <span style="color:#16A34A; font-weight:700;">+${desperdicioAgrupado} pzas</span>.
        </p>
      </div>

      <div style="padding:1.5rem;">
        <div style="font-weight:700; color:#374151; margin-bottom:0.75rem; font-size:0.875rem;">
          <i class="bi bi-table me-1"></i>Detalle por Orden — Compra Separada (situación actual)
        </div>
        <div style="overflow-x:auto; margin-bottom:1.25rem;">
          <table style="width:100%; border-collapse:collapse; font-size:0.875rem; border:1px solid #e5e7eb;">
            <thead>
              <tr style="background:#f9fafb; border-bottom:2px solid #e5e7eb;">
                <th style="padding:0.5rem 0.75rem; color:#6b7280; font-weight:700; text-align:left;">Orden</th>
                <th style="padding:0.5rem 0.75rem; color:#6b7280; font-weight:700; text-align:center;">Necesita</th>
                <th style="padding:0.5rem 0.75rem; color:#6b7280; font-weight:700; text-align:center;">Paquetes requeridos</th>
                <th style="padding:0.5rem 0.75rem; color:#DC2626; font-weight:700; text-align:center;">Debe comprar (sep.)</th>
                <th style="padding:0.5rem 0.75rem; color:#DC2626; font-weight:700; text-align:center;">Piezas sobrantes</th>
                <th style="padding:0.5rem 0.75rem; color:#6b7280; font-weight:700; text-align:left;">Fecha</th>
              </tr>
            </thead>
            <tbody>${filasOrdenes}</tbody>
            <tfoot>
              <tr style="background:#FEE2E2; border-top:2px solid #DC2626;">
                <td style="padding:0.6rem 0.75rem; font-weight:700; color:#DC2626;">❌ Total Separado</td>
                <td style="padding:0.6rem 0.75rem; font-weight:700; text-align:center;">${oportunidad.totalSolicitado} pzas</td>
                <td style="padding:0.6rem 0.75rem; text-align:center; color:#6b7280;">—</td>
                <td style="padding:0.6rem 0.75rem; font-weight:700; color:#DC2626; text-align:center;">${oportunidad.totalSeparado} pzas</td>
                <td style="padding:0.6rem 0.75rem; font-weight:700; color:#DC2626; text-align:center;">+${desperdicioSeparado} pzas</td>
                <td></td>
              </tr>
              <tr style="background:#D1FAE5; border-top:2px solid #16A34A;">
                <td style="padding:0.6rem 0.75rem; font-weight:700; color:#16A34A;">✅ Total Agrupado</td>
                <td style="padding:0.6rem 0.75rem; font-weight:700; text-align:center;">${oportunidad.totalSolicitado} pzas</td>
                <td style="padding:0.6rem 0.75rem; text-align:center; color:#065f46;">1 compra consolidada</td>
                <td style="padding:0.6rem 0.75rem; font-weight:700; color:#16A34A; text-align:center;">${oportunidad.totalAgrupado} pzas</td>
                <td style="padding:0.6rem 0.75rem; font-weight:700; color:#16A34A; text-align:center;">+${desperdicioAgrupado} pzas</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style="background:linear-gradient(135deg,#D1FAE5 0%,#ECFDF5 100%); border:2px solid #16A34A; border-radius:0.75rem; padding:1rem 1.25rem; margin-bottom:1.25rem; display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">
          <i class="bi bi-piggy-bank-fill" style="font-size:2rem; color:#16A34A; flex-shrink:0;"></i>
          <div>
            <div style="font-weight:800; color:#16A34A; font-size:0.95rem;">
              Al agrupar ${oportunidad.numOrdenes} órdenes en una sola compra: ahorro de ${oportunidad.ahorroPiezas} piezas (${oportunidad.porcentajeAhorro}%)
            </div>
            <div style="color:#065f46; font-size:0.85rem; margin-top:0.2rem;">
              Compra separada: <strong>${oportunidad.totalSeparado} pzas</strong>
              &nbsp;→&nbsp;
              Compra agrupada: <strong>${oportunidad.totalAgrupado} pzas</strong>
              &nbsp;=&nbsp;
              <strong>${oportunidad.ahorroPiezas} pzas menos</strong>
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:0.75rem; flex-wrap:wrap;">
          <button class="btn btn-outline-secondary" onclick="window.optimizacionManager.descartarOportunidad(${index})" style="border-radius:0.5rem;">
            <i class="bi bi-x-circle me-1"></i>Descartar
          </button>
          <button class="btn btn-success" onclick="window.optimizacionManager.agruparOportunidad(${index})" style="border-radius:0.5rem; font-weight:700; padding:0.5rem 1.5rem;">
            <i class="bi bi-lightning-charge-fill me-1"></i>Agrupar y Optimizar
          </button>
        </div>
      </div>
    `;

    return card;
  }

  async agruparOportunidad(index) {
    const oportunidad = this.oportunidades[index];
    if (!oportunidad) return;

    const ordenesIds = oportunidad.ordenesDetalle.map(o => o.ordenCompraId);

    await this.crearGrupoOptimizado(ordenesIds, `Optimización: ${oportunidad.productoNombre}`);
  }

  async agruparTodasLasOportunidades() {
    if (this.oportunidades.length === 0) return;

    const confirmacion = await Swal.fire({
      title: '¿Agrupar todas las oportunidades?',
      html: `
        <p>Se crearán <strong>${this.oportunidades.length}</strong> grupos optimizados.</p>
        <p>Ahorro total: <strong style="color: #16A34A;">${this.resumen.ahorroTotalPiezas} piezas</strong></p>
        <p>¿Deseas continuar?</p>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, agrupar todas',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#F97316'
    });

    if (!confirmacion.isConfirmed) return;

    Swal.fire({
      title: 'Procesando...',
      html: 'Creando grupos optimizados',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    let exitosos = 0;
    let fallidos = 0;

    for (const oportunidad of this.oportunidades) {
      try {
        const ordenesIds = oportunidad.ordenesDetalle.map(o => o.ordenCompraId);
        await this.crearGrupoOptimizado(ordenesIds, null, false);
        exitosos++;
      } catch (error) {
        console.error('Error agrupando oportunidad:', error);
        fallidos++;
      }
    }

    Swal.close();

    await Swal.fire({
      title: '¡Optimización Completada!',
      html: `
        <p><strong style="color: #16A34A;">${exitosos}</strong> grupos creados exitosamente</p>
        ${fallidos > 0 ? `<p><strong style="color: #DC2626;">${fallidos}</strong> grupos fallidos</p>` : ''}
        <p>Ahorro total: <strong style="color: #16A34A;">${this.resumen.ahorroTotalPiezas} piezas</strong></p>
      `,
      icon: 'success',
      confirmButtonColor: '#F97316'
    });

    this.cerrarModal();

    if (typeof loadOrdenes === 'function') {
      loadOrdenes();
    }
  }

  async crearGrupoOptimizado(ordenesIds, descripcion = null, mostrarMensaje = true) {
    try {
      const response = await fetch('/api/admin/ordenes/crear-grupo-optimizado', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('razoconnect_admin_token')}`
        },
        body: JSON.stringify({ ordenesIds })
      });

      if (!response.ok) {
        throw new Error('Error al crear grupo optimizado');
      }

      const result = await response.json();

      if (mostrarMensaje) {
        await Swal.fire({
          title: '¡Grupo Optimizado Creado!',
          html: `
            <p>Se ha creado el grupo <strong>#${result.data.grupoId}</strong></p>
            <p><strong>${result.data.ordenesAgrupadas}</strong> órdenes consolidadas</p>
            ${descripcion ? `<p>${descripcion}</p>` : ''}
          `,
          icon: 'success',
          confirmButtonColor: '#F97316'
        });

        this.cerrarModal();

        if (typeof loadOrdenes === 'function') {
          loadOrdenes();
        }
      }

      return result;

    } catch (error) {
      console.error('Error creando grupo optimizado:', error);
      
      if (mostrarMensaje) {
        await Swal.fire({
          title: 'Error',
          text: 'No se pudo crear el grupo optimizado',
          icon: 'error',
          confirmButtonColor: '#F97316'
        });
      }
      
      throw error;
    }
  }

  descartarOportunidad(index) {
    this.oportunidades.splice(index, 1);
    
    this.resumen.totalOportunidades = this.oportunidades.length;
    this.resumen.ahorroTotalPiezas = this.oportunidades.reduce((sum, op) => sum + op.ahorroPiezas, 0);
    this.resumen.ordenesAfectadas = this.oportunidades.reduce((sum, op) => sum + op.numOrdenes, 0);
    
    this.renderizarResumen();
    this.renderizarOportunidades();
  }
}

window.optimizacionManager = new OptimizacionComprasManager();

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (window.optimizacionManager) {
      window.optimizacionManager.verificarOportunidades();
    }
  }, 1500);
});
