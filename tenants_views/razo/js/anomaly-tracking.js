/**
 * Módulo de Tracking de Anomalías en Entrada de Almacén
 * Gestiona mermas, excedentes y discrepancias en recepción de OC
 */

class AnomalyTracker {
  constructor() {
    this.discrepancias = new Map();
    this.motivosCatalogo = {
      MERMA: [
        { codigo: 'PROVEEDOR_AGOTO', descripcion: 'Proveedor agotó stock' },
        { codigo: 'PRODUCTO_DANADO', descripcion: 'Producto dañado en tránsito' },
        { codigo: 'ERROR_ENVIO', descripcion: 'Error en el envío del proveedor' },
        { codigo: 'CALIDAD_RECHAZADA', descripcion: 'Producto rechazado por calidad' },
        { codigo: 'OTRO', descripcion: 'Otro motivo' }
      ],
      EXCEDENTE: [
        { codigo: 'BONIFICACION', descripcion: 'Bonificación del proveedor' },
        { codigo: 'ERROR_CONTEO', descripcion: 'Error en conteo inicial' },
        { codigo: 'PROMOCION', descripcion: 'Promoción especial' },
        { codigo: 'OTRO', descripcion: 'Otro motivo' }
      ]
    };
  }

  /**
   * Detecta si hay discrepancia entre cantidad esperada y recibida
   */
  detectarDiscrepancia(detalleId, cantidadEsperada, cantidadRecibida) {
    const diferencia = cantidadRecibida - cantidadEsperada;
    
    if (diferencia === 0) {
      this.discrepancias.delete(detalleId);
      return null;
    }

    const tipo = diferencia < 0 ? 'MERMA' : 'EXCEDENTE';
    const discrepancia = {
      detalleId,
      cantidadEsperada,
      cantidadRecibida,
      diferencia: Math.abs(diferencia),
      tipo,
      motivoRequerido: true,
      motivo: null,
      cerrarPorMerma: false
    };

    this.discrepancias.set(detalleId, discrepancia);
    return discrepancia;
  }

  /**
   * Valida que todas las discrepancias tengan motivo
   */
  validarDiscrepancias() {
    const sinMotivo = [];
    
    for (const [detalleId, disc] of this.discrepancias.entries()) {
      if (!disc.motivo || disc.motivo.trim() === '') {
        sinMotivo.push(detalleId);
      }
    }

    return {
      valido: sinMotivo.length === 0,
      detallesSinMotivo: sinMotivo
    };
  }

  /**
   * Obtiene el catálogo de motivos según el tipo de discrepancia
   */
  getMotivos(tipo) {
    return this.motivosCatalogo[tipo] || [];
  }

  /**
   * Registra el motivo de una discrepancia
   */
  setMotivo(detalleId, motivo, cerrarPorMerma = false) {
    const disc = this.discrepancias.get(detalleId);
    if (disc) {
      disc.motivo = motivo;
      disc.cerrarPorMerma = cerrarPorMerma;
    }
  }

  /**
   * Obtiene todas las discrepancias para enviar al backend
   */
  getDiscrepanciasParaEnvio() {
    return Array.from(this.discrepancias.values());
  }

  /**
   * Limpia todas las discrepancias
   */
  limpiar() {
    this.discrepancias.clear();
  }

  /**
   * Renderiza el modal de motivo de discrepancia
   */
  async mostrarModalMotivo(detalleId, productoNombre, discrepancia) {
    const motivos = this.getMotivos(discrepancia.tipo);
    const esMerma = discrepancia.tipo === 'MERMA';

    const motivosHTML = motivos.map(m => 
      `<option value="${m.codigo}">${m.descripcion}</option>`
    ).join('');

    const html = `
      <div class="mb-3">
        <p class="mb-2"><strong>Producto:</strong> ${productoNombre}</p>
        <p class="mb-2">
          <strong>Tipo:</strong> 
          <span class="badge bg-${esMerma ? 'warning' : 'info'}">${discrepancia.tipo}</span>
        </p>
        <p class="mb-3">
          <strong>Diferencia:</strong> ${discrepancia.diferencia} paquetes 
          ${esMerma ? 'faltantes' : 'adicionales'}
        </p>
      </div>

      <div class="mb-3">
        <label class="form-label">Motivo de la discrepancia *</label>
        <select class="form-select" id="select-motivo-${detalleId}">
          <option value="">Seleccionar motivo...</option>
          ${motivosHTML}
        </select>
      </div>

      <div class="mb-3" id="div-motivo-otro-${detalleId}" style="display: none;">
        <label class="form-label">Especificar motivo</label>
        <textarea class="form-control" id="textarea-motivo-${detalleId}" 
                  rows="2" placeholder="Describe el motivo..."></textarea>
      </div>

      ${esMerma ? `
        <div class="alert alert-warning mb-3">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="check-cerrar-merma-${detalleId}">
            <label class="form-check-label" for="check-cerrar-merma-${detalleId}">
              <strong>Cerrar por merma definitiva</strong><br>
              <small>El proveedor confirmó que no enviará las piezas faltantes. 
              Esto cancelará los backorders de clientes vinculados.</small>
            </label>
          </div>
        </div>
      ` : ''}
    `;

    const result = await Swal.fire({
      title: `${esMerma ? '⚠️ Merma Detectada' : '✨ Excedente Detectado'}`,
      html: html,
      icon: esMerma ? 'warning' : 'info',
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      width: '600px',
      didOpen: () => {
        const selectMotivo = document.getElementById(`select-motivo-${detalleId}`);
        const divOtro = document.getElementById(`div-motivo-otro-${detalleId}`);
        
        selectMotivo.addEventListener('change', (e) => {
          if (e.target.value === 'OTRO') {
            divOtro.style.display = 'block';
          } else {
            divOtro.style.display = 'none';
          }
        });
      },
      preConfirm: () => {
        const selectMotivo = document.getElementById(`select-motivo-${detalleId}`);
        const textareaMotivo = document.getElementById(`textarea-motivo-${detalleId}`);
        const checkCerrar = document.getElementById(`check-cerrar-merma-${detalleId}`);

        if (!selectMotivo.value) {
          Swal.showValidationMessage('Debes seleccionar un motivo');
          return false;
        }

        let motivoFinal = selectMotivo.options[selectMotivo.selectedIndex].text;
        
        if (selectMotivo.value === 'OTRO') {
          const motivoOtro = textareaMotivo.value.trim();
          if (!motivoOtro) {
            Swal.showValidationMessage('Debes especificar el motivo');
            return false;
          }
          motivoFinal = motivoOtro;
        }

        return {
          motivo: motivoFinal,
          cerrarPorMerma: checkCerrar ? checkCerrar.checked : false
        };
      }
    });

    if (result.isConfirmed && result.value) {
      this.setMotivo(detalleId, result.value.motivo, result.value.cerrarPorMerma);
      return result.value;
    }

    return null;
  }

  /**
   * Renderiza indicador visual de discrepancia en la fila
   */
  renderizarIndicadorDiscrepancia(detalleId, tipo) {
    const esMerma = tipo === 'MERMA';
    const icon = esMerma ? 'exclamation-triangle' : 'gift';
    const color = esMerma ? 'warning' : 'info';
    const texto = esMerma ? 'Merma' : 'Excedente';

    return `
      <span class="badge bg-${color} d-flex align-items-center gap-1" 
            style="font-size: 0.75rem;">
        <i class="bi bi-${icon}"></i>
        ${texto}
      </span>
    `;
  }

  /**
   * Envía las anomalías registradas al backend
   */
  async enviarAnomalias(ordenCompraId) {
    const discrepancias = this.getDiscrepanciasParaEnvio();
    
    if (discrepancias.length === 0) {
      return { success: true, message: 'Sin anomalías que registrar' };
    }

    const token = localStorage.getItem('razoconnect_admin_token');
    const resultados = [];

    for (const disc of discrepancias) {
      try {
        const response = await fetch('/api/admin/orden-compra/registrar-anomalia', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            detalleOcId: disc.detalleId,
            tipoDiscrepancia: disc.tipo,
            motivoDiscrepancia: disc.motivo,
            cantidadReal: disc.cantidadRecibida,
            cerrarPorMerma: disc.cerrarPorMerma
          })
        });

        if (response.ok) {
          const data = await response.json();
          resultados.push({ detalleId: disc.detalleId, success: true, data });
        } else {
          resultados.push({ detalleId: disc.detalleId, success: false, error: 'Error en el servidor' });
        }
      } catch (error) {
        console.error('Error al registrar anomalía:', error);
        resultados.push({ detalleId: disc.detalleId, success: false, error: error.message });
      }
    }

    const exitosos = resultados.filter(r => r.success).length;
    const fallidos = resultados.filter(r => !r.success).length;

    return {
      success: fallidos === 0,
      message: `Anomalías registradas: ${exitosos} exitosas, ${fallidos} fallidas`,
      resultados
    };
  }

  /**
   * Genera reporte de anomalías para auditoría
   */
  generarReporteAuditoria() {
    const discrepancias = this.getDiscrepanciasParaEnvio();
    
    if (discrepancias.length === 0) {
      return null;
    }

    const mermas = discrepancias.filter(d => d.tipo === 'MERMA');
    const excedentes = discrepancias.filter(d => d.tipo === 'EXCEDENTE');

    return {
      totalDiscrepancias: discrepancias.length,
      totalMermas: mermas.length,
      totalExcedentes: excedentes.length,
      piezasFaltantes: mermas.reduce((sum, m) => sum + m.diferencia, 0),
      piezasAdicionales: excedentes.reduce((sum, e) => sum + e.diferencia, 0),
      mermasCerradas: mermas.filter(m => m.cerrarPorMerma).length,
      detalles: discrepancias
    };
  }
}

// Exportar instancia global
window.AnomalyTracker = AnomalyTracker;
