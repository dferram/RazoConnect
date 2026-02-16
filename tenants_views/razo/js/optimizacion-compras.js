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
    const modal = new bootstrap.Modal(document.getElementById('modalOptimizacionCompras'));
    
    this.renderizarResumen();
    this.renderizarOportunidades();
    
    modal.show();
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
    card.className = 'card mb-3';
    card.style.cssText = 'border: 2px solid #f5f1ed; border-radius: 0.75rem; overflow: hidden;';

    const ordenesIds = oportunidad.ordenesDetalle.map(o => o.ordenCompraId);

    card.innerHTML = `
      <div class="card-header" style="background: #FFF7ED; border-bottom: 2px solid #F97316; padding: 1rem;">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h6 class="mb-1" style="color: #F97316; font-weight: 600;">
              <i class="bi bi-box-seam me-2"></i>
              ${oportunidad.productoNombre} - ${oportunidad.dimensionesFisicas || 'N/A'}
            </h6>
            <small style="color: #6b5d57;">
              <strong>SKU:</strong> ${oportunidad.sku} • 
              <strong>Proveedor:</strong> ${oportunidad.proveedorNombre} • 
              <strong>Pack Size:</strong> ${oportunidad.packSize} piezas
            </small>
          </div>
          <div class="text-end">
            <span class="badge" style="background: #16A34A; font-size: 1rem; padding: 0.5rem 1rem; border-radius: 0.5rem;">
              <i class="bi bi-piggy-bank me-1"></i>
              Ahorro: ${oportunidad.ahorroPiezas} piezas (${oportunidad.porcentajeAhorro}%)
            </span>
          </div>
        </div>
      </div>

      <div class="card-body" style="padding: 1.5rem;">
        <div class="row mb-3">
          <div class="col-md-6">
            <div class="p-3" style="background: #FEE2E2; border-radius: 0.5rem; border-left: 4px solid #DC2626;">
              <h6 style="color: #DC2626; font-weight: 600; margin-bottom: 0.5rem;">
                <i class="bi bi-x-circle me-1"></i>
                Compra Separada (Actual)
              </h6>
              <p class="mb-1" style="color: #6b5d57;">
                <strong>${oportunidad.numOrdenes}</strong> órdenes separadas
              </p>
              <p class="mb-1" style="color: #6b5d57;">
                Total solicitado: <strong>${oportunidad.totalSolicitado}</strong> piezas
              </p>
              <p class="mb-0" style="color: #DC2626; font-weight: 600; font-size: 1.1rem;">
                A comprar: <strong>${oportunidad.totalSeparado}</strong> piezas
              </p>
            </div>
          </div>

          <div class="col-md-6">
            <div class="p-3" style="background: #D1FAE5; border-radius: 0.5rem; border-left: 4px solid #16A34A;">
              <h6 style="color: #16A34A; font-weight: 600; margin-bottom: 0.5rem;">
                <i class="bi bi-check-circle me-1"></i>
                Compra Agrupada (Optimizada)
              </h6>
              <p class="mb-1" style="color: #6b5d57;">
                <strong>1</strong> orden consolidada
              </p>
              <p class="mb-1" style="color: #6b5d57;">
                Total solicitado: <strong>${oportunidad.totalSolicitado}</strong> piezas
              </p>
              <p class="mb-0" style="color: #16A34A; font-weight: 600; font-size: 1.1rem;">
                A comprar: <strong>${oportunidad.totalAgrupado}</strong> piezas
              </p>
            </div>
          </div>
        </div>

        <div class="alert alert-info mb-3" style="background: #E0F2FE; border: 1px solid #0EA5E9; border-radius: 0.5rem;">
          <h6 style="color: #0369A1; font-weight: 600; margin-bottom: 0.5rem;">
            <i class="bi bi-info-circle me-2"></i>
            Desglose de Órdenes (Se mantiene la separación)
          </h6>
          <p class="mb-0" style="color: #075985; font-size: 0.9rem;">
            Al agrupar, cada orden mantiene su identidad individual. El admin podrá ver quién pidió qué en el detalle del grupo.
          </p>
        </div>

        <div class="table-responsive mb-3">
          <table class="table table-sm" style="border: 1px solid #f5f1ed; border-radius: 0.5rem; overflow: hidden;">
            <thead style="background: #f5f1ed;">
              <tr>
                <th style="color: #6b5d57; font-weight: 600;">Orden ID</th>
                <th style="color: #6b5d57; font-weight: 600;">Solicitado</th>
                <th style="color: #6b5d57; font-weight: 600;">A Comprar (Separado)</th>
                <th style="color: #6b5d57; font-weight: 600;">Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${oportunidad.ordenesDetalle.map(orden => `
                <tr>
                  <td>
                    <strong style="color: #F97316;">#${orden.ordenCompraId}</strong>
                  </td>
                  <td>
                    <strong>${orden.cantidadSolicitada}</strong> pzas
                    <br>
                    <small style="color: #999;">(${orden.paquetesNecesarios} paquetes)</small>
                  </td>
                  <td>
                    <span style="color: #DC2626; font-weight: 600;">${orden.piezasAComprar} pzas</span>
                    <br>
                    <small style="color: #999;">Desperdicio: ${orden.piezasAComprar - orden.cantidadSolicitada} pzas</small>
                  </td>
                  <td>
                    <small>${new Date(orden.fechaCreacion).toLocaleDateString('es-MX', { 
                      day: '2-digit', 
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}</small>
                  </td>
                </tr>
              `).join('')}
              <tr style="background: #D1FAE5; font-weight: 600;">
                <td colspan="2" style="text-align: right; color: #16A34A;">
                  <i class="bi bi-check-circle me-1"></i>
                  Total Agrupado:
                </td>
                <td colspan="2" style="color: #16A34A;">
                  ${oportunidad.totalAgrupado} pzas
                  <small style="color: #059669; margin-left: 0.5rem;">
                    (Ahorro: ${oportunidad.ahorroPiezas} pzas)
                  </small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="d-flex justify-content-end gap-2">
          <button class="btn btn-outline-secondary" onclick="window.optimizacionManager.descartarOportunidad(${index})" style="border-radius: 0.5rem;">
            <i class="bi bi-x-circle me-1"></i>
            Descartar
          </button>
          <button class="btn btn-success" onclick="window.optimizacionManager.agruparOportunidad(${index})" style="border-radius: 0.5rem; font-weight: 600;">
            <i class="bi bi-check-circle me-1"></i>
            ⚡ Agrupar y Optimizar Ahora
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

    bootstrap.Modal.getInstance(document.getElementById('modalOptimizacionCompras')).hide();

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

        bootstrap.Modal.getInstance(document.getElementById('modalOptimizacionCompras')).hide();

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
