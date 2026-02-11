/**
 * Componente de Paginación Reutilizable
 * Sistema RazoConnect - Admin Panel
 * 
 * Uso:
 * const paginador = new PaginationComponent({
 *   containerId: 'paginationWrapper',
 *   registrosPorPagina: 10,
 *   onPageChange: (pagina) => { renderTabla(pagina); }
 * });
 * 
 * paginador.render(totalRegistros, paginaActual);
 */

class PaginationComponent {
  constructor(config) {
    this.containerId = config.containerId || 'paginationWrapper';
    this.registrosPorPagina = config.registrosPorPagina || 10;
    this.onPageChange = config.onPageChange || (() => {});
    this.paginaActual = 1;
    this.totalRegistros = 0;
    
    this.initializeHTML();
  }

  initializeHTML() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.warn(`Container ${this.containerId} no encontrado`);
      return;
    }

    container.innerHTML = `
      <div class="pagination-container" style="
        margin-top: 1.5rem;
        padding: 1rem;
        background: white;
        border-radius: 0.75rem;
        border: 1px solid rgba(0,0,0,0.1);
        display: none;
      ">
        <div class="pagination-wrapper" style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        ">
          <div class="pagination-info" style="
            color: var(--text-secondary, #6b7280);
            font-size: 0.875rem;
          ">
            Mostrando <strong id="${this.containerId}-start">1</strong> a
            <strong id="${this.containerId}-end">10</strong> de
            <strong id="${this.containerId}-total">0</strong> registros
          </div>

          <div class="pagination-controls" style="
            display: flex;
            gap: 0.5rem;
            align-items: center;
          ">
            <button
              id="${this.containerId}-btnPrev"
              class="btn btn-secondary"
              style="padding: 0.5rem 0.75rem; font-size: 0.875rem;"
            >
              ← Anterior
            </button>

            <div id="${this.containerId}-pageNumbers" style="
              display: flex;
              gap: 0.4rem;
              flex-wrap: wrap;
            "></div>

            <button
              id="${this.containerId}-btnNext"
              class="btn btn-secondary"
              style="padding: 0.5rem 0.75rem; font-size: 0.875rem;"
            >
              Siguiente →
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const btnPrev = document.getElementById(`${this.containerId}-btnPrev`);
    const btnNext = document.getElementById(`${this.containerId}-btnNext`);

    if (btnPrev) {
      btnPrev.addEventListener('click', () => this.cambiarPagina('prev'));
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => this.cambiarPagina('next'));
    }
  }

  render(totalRegistros, paginaActual = 1) {
    this.totalRegistros = totalRegistros;
    this.paginaActual = paginaActual;

    const container = document.querySelector(`#${this.containerId} .pagination-container`);
    if (!container) return;

    const totalPaginas = Math.ceil(totalRegistros / this.registrosPorPagina);

    if (totalPaginas <= 1) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    const inicio = (paginaActual - 1) * this.registrosPorPagina + 1;
    const fin = Math.min(paginaActual * this.registrosPorPagina, totalRegistros);

    document.getElementById(`${this.containerId}-start`).textContent = inicio;
    document.getElementById(`${this.containerId}-end`).textContent = fin;
    document.getElementById(`${this.containerId}-total`).textContent = totalRegistros;

    const btnPrev = document.getElementById(`${this.containerId}-btnPrev`);
    const btnNext = document.getElementById(`${this.containerId}-btnNext`);

    if (btnPrev) btnPrev.disabled = paginaActual === 1;
    if (btnNext) btnNext.disabled = paginaActual === totalPaginas;

    this.renderPageNumbers(totalPaginas);
  }

  renderPageNumbers(totalPaginas) {
    const pageNumbers = document.getElementById(`${this.containerId}-pageNumbers`);
    if (!pageNumbers) return;

    pageNumbers.innerHTML = '';

    const rango = 2;
    let startPage = Math.max(1, this.paginaActual - rango);
    let endPage = Math.min(totalPaginas, this.paginaActual + rango);

    if (endPage - startPage < rango * 2) {
      if (startPage === 1) {
        endPage = Math.min(totalPaginas, startPage + rango * 2);
      } else if (endPage === totalPaginas) {
        startPage = Math.max(1, endPage - rango * 2);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      const button = document.createElement('button');
      button.textContent = i;
      button.className = `btn ${i === this.paginaActual ? 'btn-primary' : 'btn-secondary'}`;
      button.style.cssText = `
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        min-width: 2.5rem;
      `;
      button.onclick = () => this.irAPagina(i);
      pageNumbers.appendChild(button);
    }
  }

  cambiarPagina(direccion) {
    const totalPaginas = Math.ceil(this.totalRegistros / this.registrosPorPagina);

    if (direccion === 'prev' && this.paginaActual > 1) {
      this.paginaActual--;
      this.onPageChange(this.paginaActual);
    } else if (direccion === 'next' && this.paginaActual < totalPaginas) {
      this.paginaActual++;
      this.onPageChange(this.paginaActual);
    }
  }

  irAPagina(pagina) {
    this.paginaActual = pagina;
    this.onPageChange(this.paginaActual);
  }

  reset() {
    this.paginaActual = 1;
  }

  getCurrentPage() {
    return this.paginaActual;
  }

  getItemsPerPage() {
    return this.registrosPorPagina;
  }

  setItemsPerPage(cantidad) {
    this.registrosPorPagina = cantidad;
    this.paginaActual = 1;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PaginationComponent;
}
