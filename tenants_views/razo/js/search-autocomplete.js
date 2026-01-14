/**
 * Search Autocomplete Module
 * Implementa búsqueda inteligente con sugerencias en tiempo real
 */

class SearchAutocomplete {
  constructor(inputElement, options = {}) {
    this.input = inputElement;
    this.options = {
      minChars: 2,
      debounceMs: 300,
      maxResults: 8,
      onSelect: options.onSelect || this.defaultOnSelect.bind(this),
      ...options,
    };

    this.debounceTimer = null;
    this.currentFocus = -1;
    this.isOpen = false;
    this.isMobile = window.innerWidth < 768;

    this.init();
  }

  init() {
    this.createDropdown();
    this.attachEventListeners();
    
    window.addEventListener('resize', () => {
      const wasMobile = this.isMobile;
      this.isMobile = window.innerWidth < 768;
      
      if (wasMobile !== this.isMobile) {
        this.close();
        this.createDropdown();
      }
    });
  }

  createDropdown() {
    if (this.dropdown) {
      this.dropdown.remove();
    }

    if (this.isMobile) {
      this.createMobileDrawer();
    } else {
      this.createDesktopDropdown();
    }
  }

  createDesktopDropdown() {
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'search-autocomplete-dropdown';
    this.dropdown.style.cssText = `
      position: absolute;
      top: calc(100% + 0.5rem);
      left: 0;
      right: 0;
      background: white;
      border-radius: 0.75rem;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
      max-height: 400px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
    `;

    const container = this.input.closest('.search-container-modern') || this.input.parentElement;
    container.style.position = 'relative';
    container.appendChild(this.dropdown);
  }

  createMobileDrawer() {
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'search-autocomplete-drawer';
    this.dropdown.innerHTML = `
      <div class="search-drawer-overlay"></div>
      <div class="search-drawer-content">
        <div class="search-drawer-header">
          <h3>Resultados de búsqueda</h3>
          <button type="button" class="search-drawer-close" aria-label="Cerrar">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="search-drawer-results"></div>
      </div>
    `;

    this.dropdown.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      display: none;
    `;

    document.body.appendChild(this.dropdown);

    const closeBtn = this.dropdown.querySelector('.search-drawer-close');
    const overlay = this.dropdown.querySelector('.search-drawer-overlay');
    
    closeBtn?.addEventListener('click', () => this.close());
    overlay?.addEventListener('click', () => this.close());
  }

  attachEventListeners() {
    this.input.addEventListener('input', (e) => {
      clearTimeout(this.debounceTimer);
      const query = e.target.value.trim();

      if (query.length < this.options.minChars) {
        this.close();
        return;
      }

      this.debounceTimer = setTimeout(() => {
        this.search(query);
      }, this.options.debounceMs);
    });

    this.input.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this.navigateDown();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.navigateUp();
          break;
        case 'Enter':
          e.preventDefault();
          this.selectCurrent();
          break;
        case 'Escape':
          e.preventDefault();
          this.close();
          break;
      }
    });

    this.input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!this.dropdown.matches(':hover')) {
          this.close();
        }
      }, 200);
    });

    document.addEventListener('click', (e) => {
      if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
        this.close();
      }
    });
  }

  async search(query) {
    try {
      const response = await fetch(`/api/productos/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (data.success && data.data.productos && data.data.productos.length > 0) {
        this.renderResults(data.data.productos);
        this.open();
      } else {
        this.renderEmpty(query);
        this.open();
      }
    } catch (error) {
      console.error('Error en búsqueda:', error);
      this.close();
    }
  }

  renderResults(productos) {
    const resultsContainer = this.isMobile 
      ? this.dropdown.querySelector('.search-drawer-results')
      : this.dropdown;

    if (this.isMobile) {
      resultsContainer.innerHTML = productos.map((producto, index) => `
        <button type="button" class="search-result-item-mobile" data-index="${index}" data-producto-id="${producto.productoId}">
          <div class="search-result-info">
            <div class="search-result-name">${this.highlightMatch(producto.nombreProducto)}</div>
            <div class="search-result-meta">
              ${producto.categoria ? `<span>${producto.categoria}</span>` : ''}
              ${producto.precio ? `<span class="search-result-price">$${producto.precio.toFixed(2)}</span>` : ''}
            </div>
          </div>
          <i class="bi bi-chevron-right"></i>
        </button>
      `).join('');
    } else {
      resultsContainer.innerHTML = productos.map((producto, index) => `
        <button type="button" class="search-result-item" data-index="${index}" data-producto-id="${producto.productoId}">
          <div class="search-result-image">
            ${producto.imagenUrl 
              ? `<img src="${producto.imagenUrl}" alt="${producto.nombreProducto}" />` 
              : `<div class="search-result-placeholder">📦</div>`
            }
          </div>
          <div class="search-result-info">
            <div class="search-result-name">${this.highlightMatch(producto.nombreProducto)}</div>
            <div class="search-result-meta">
              ${producto.categoria ? `<span class="search-result-category">${producto.categoria}</span>` : ''}
              ${producto.precio ? `<span class="search-result-price">$${producto.precio.toFixed(2)}</span>` : ''}
            </div>
          </div>
        </button>
      `).join('');
    }

    const items = resultsContainer.querySelectorAll('[data-producto-id]');
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const productoId = item.dataset.productoId;
        this.options.onSelect(productoId);
        this.close();
      });
    });
  }

  renderEmpty(query) {
    const resultsContainer = this.isMobile 
      ? this.dropdown.querySelector('.search-drawer-results')
      : this.dropdown;

    resultsContainer.innerHTML = `
      <div class="search-no-results">
        <div class="search-no-results-icon">🔍</div>
        <div class="search-no-results-text">No se encontraron productos para "${query}"</div>
      </div>
    `;
  }

  highlightMatch(text) {
    const query = this.input.value.trim();
    if (!query) return text;

    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<strong>$1</strong>');
  }

  navigateDown() {
    const items = this.dropdown.querySelectorAll('[data-index]');
    if (items.length === 0) return;

    this.currentFocus++;
    if (this.currentFocus >= items.length) {
      this.currentFocus = 0;
    }

    this.updateFocus(items);
  }

  navigateUp() {
    const items = this.dropdown.querySelectorAll('[data-index]');
    if (items.length === 0) return;

    this.currentFocus--;
    if (this.currentFocus < 0) {
      this.currentFocus = items.length - 1;
    }

    this.updateFocus(items);
  }

  updateFocus(items) {
    items.forEach((item, index) => {
      if (index === this.currentFocus) {
        item.classList.add('search-result-focused');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.classList.remove('search-result-focused');
      }
    });
  }

  selectCurrent() {
    const items = this.dropdown.querySelectorAll('[data-index]');
    if (this.currentFocus >= 0 && this.currentFocus < items.length) {
      items[this.currentFocus].click();
    }
  }

  open() {
    this.dropdown.style.display = 'block';
    this.isOpen = true;
    this.currentFocus = -1;

    if (this.isMobile) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => {
        this.dropdown.classList.add('search-drawer-open');
      }, 10);
    }
  }

  close() {
    if (this.isMobile) {
      this.dropdown.classList.remove('search-drawer-open');
      document.body.style.overflow = '';
      setTimeout(() => {
        this.dropdown.style.display = 'none';
      }, 300);
    } else {
      this.dropdown.style.display = 'none';
    }
    
    this.isOpen = false;
    this.currentFocus = -1;
  }

  defaultOnSelect(productoId) {
    window.location.href = `/producto-detalle.html?id=${productoId}`;
  }

  destroy() {
    clearTimeout(this.debounceTimer);
    if (this.dropdown) {
      this.dropdown.remove();
    }
  }
}

if (typeof window !== 'undefined') {
  window.SearchAutocomplete = SearchAutocomplete;
}
