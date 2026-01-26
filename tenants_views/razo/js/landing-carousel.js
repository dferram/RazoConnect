/**
 * RazoConnect - Landing Carousel Manager
 * Handles carousel navigation and dynamic content loading
 * @version 1.0.0
 */

class CarouselManager {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Carousel container #${containerId} not found`);
      return;
    }

    this.track = this.container.querySelector('.carousel-track');
    this.prevBtn = this.container.querySelector('.carousel-arrow.prev');
    this.nextBtn = this.container.querySelector('.carousel-arrow.next');
    
    this.currentIndex = 0;
    this.itemsPerView = options.itemsPerView || 3;
    this.gap = options.gap || 32;
    this.autoScroll = options.autoScroll || false;
    this.autoScrollInterval = options.autoScrollInterval || 5000;
    
    this.items = [];
    this.autoScrollTimer = null;
    
    this.init();
  }

  init() {
    if (!this.track) return;

    this.updateItemsPerView();
    this.attachEventListeners();
    
    window.addEventListener('resize', () => this.handleResize());
    
    if (this.autoScroll) {
      this.startAutoScroll();
    }
  }

  updateItemsPerView() {
    const width = window.innerWidth;
    
    if (width <= 480) {
      this.itemsPerView = 1;
    } else if (width <= 768) {
      this.itemsPerView = 1.2;
    } else if (width <= 1200) {
      this.itemsPerView = 2;
    } else {
      this.itemsPerView = 3;
    }
  }

  attachEventListeners() {
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => this.prev());
    }
    
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => this.next());
    }

    if (this.track) {
      this.track.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
      this.track.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: true });
      this.track.addEventListener('touchend', () => this.handleTouchEnd());
    }
  }

  handleTouchStart(e) {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartTime = Date.now();
  }

  handleTouchMove(e) {
    if (!this.touchStartX) return;
    this.touchEndX = e.touches[0].clientX;
  }

  handleTouchEnd() {
    if (!this.touchStartX || !this.touchEndX) return;

    const diff = this.touchStartX - this.touchEndX;
    const timeDiff = Date.now() - this.touchStartTime;
    
    if (Math.abs(diff) > 50 && timeDiff < 300) {
      if (diff > 0) {
        this.next();
      } else {
        this.prev();
      }
    }

    this.touchStartX = null;
    this.touchEndX = null;
  }

  updateItems() {
    this.items = Array.from(this.track.querySelectorAll('.carousel-card'));
    this.updateNavigation();
  }

  prev() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.slide();
      this.resetAutoScroll();
    }
  }

  next() {
    const maxIndex = Math.max(0, this.items.length - Math.floor(this.itemsPerView));
    
    if (this.currentIndex < maxIndex) {
      this.currentIndex++;
      this.slide();
      this.resetAutoScroll();
    }
  }

  slide() {
    if (!this.track || this.items.length === 0) return;

    const cardWidth = this.items[0].offsetWidth;
    const offset = -(this.currentIndex * (cardWidth + this.gap));
    
    this.track.style.transform = `translateX(${offset}px)`;
    this.updateNavigation();
  }

  updateNavigation() {
    if (!this.prevBtn || !this.nextBtn) return;

    const maxIndex = Math.max(0, this.items.length - Math.floor(this.itemsPerView));
    
    if (this.currentIndex <= 0) {
      this.prevBtn.classList.add('disabled');
    } else {
      this.prevBtn.classList.remove('disabled');
    }
    
    if (this.currentIndex >= maxIndex) {
      this.nextBtn.classList.add('disabled');
    } else {
      this.nextBtn.classList.remove('disabled');
    }
  }

  handleResize() {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.updateItemsPerView();
      this.currentIndex = 0;
      this.slide();
    }, 250);
  }

  startAutoScroll() {
    this.autoScrollTimer = setInterval(() => {
      const maxIndex = Math.max(0, this.items.length - Math.floor(this.itemsPerView));
      
      if (this.currentIndex >= maxIndex) {
        this.currentIndex = 0;
      } else {
        this.currentIndex++;
      }
      
      this.slide();
    }, this.autoScrollInterval);
  }

  resetAutoScroll() {
    if (this.autoScroll) {
      clearInterval(this.autoScrollTimer);
      this.startAutoScroll();
    }
  }

  destroy() {
    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer);
    }
    
    window.removeEventListener('resize', this.handleResize);
  }
}

async function loadCategoriesCarousel() {
  const container = document.getElementById('categoriesCarouselTrack');
  if (!container) return;

  try {
    let categories = [];
    
    // Cargar desde JSON estático (página pública)
    const jsonResponse = await fetch('landing_config.json');
    const config = await jsonResponse.json();
    categories = config.categories || [];
    
    if (categories.length > 0) {
      container.innerHTML = categories.map(category => `
        <a href="${category.href}" class="carousel-card" role="button" tabindex="0" aria-label="Ver ${category.name}">
          <div class="carousel-card-image">
            <img 
              src="${category.image}" 
              alt="${category.name}"
              loading="lazy"
            />
            <div class="carousel-card-overlay"></div>
            <div class="carousel-card-badge">${category.name}</div>
          </div>
        </a>
      `).join('');

      const carousel = new CarouselManager('categoriesCarousel', {
        itemsPerView: 3,
        gap: 32,
        autoScroll: false
      });
      
      carousel.updateItems();
      
      window.categoriesCarousel = carousel;
    } else {
      container.innerHTML = `
        <div class="carousel-empty">
          <p>No hay categorías disponibles en este momento.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error cargando categorías:', error);
    container.innerHTML = `
      <div class="carousel-empty">
        <p>⚠️ Error al cargar las categorías. Por favor intenta más tarde.</p>
      </div>
    `;
  }
}

async function loadBrandsCarousel() {
  const container = document.getElementById('brandsCarouselTrack');
  if (!container) return;

  try {
    let proveedores = [];
    
    // Intentar cargar desde API pública
    try {
      const response = await fetch('/api/public/proveedores');
      const data = await response.json();
      
      if (data.success && data.data && data.data.proveedores && data.data.proveedores.length > 0) {
        proveedores = data.data.proveedores;
      }
    } catch (apiError) {
      console.log('No se pudo cargar proveedores desde API, usando JSON estático');
      // Fallback a JSON estático
      const jsonResponse = await fetch('landing_config.json');
      const config = await jsonResponse.json();
      proveedores = config.brands || [];
    }
    
    if (proveedores.length > 0) {
      container.innerHTML = proveedores.map(proveedor => {
        const nombre = proveedor.nombre || proveedor.name || 'Marca';
        const initial = nombre.charAt(0).toUpperCase();
        const imageUrl = proveedor.imagenUrl || proveedor.image || `https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=800&h=600&fit=crop&q=80`;
        const href = proveedor.href || `/proveedor-tienda.html?id=${proveedor.proveedorId || proveedor.id || ''}`;
        
        return `
          <a href="${href}" class="carousel-card brand-card" role="button" tabindex="0" aria-label="Ver productos de ${nombre}">
            <div class="carousel-card-image">
              <img 
                src="${imageUrl}" 
                alt="${nombre}"
                loading="lazy"
              />
              <div class="carousel-card-overlay"></div>
              <div class="brand-icon-overlay">${initial}</div>
              <div class="carousel-card-badge">${nombre}</div>
            </div>
          </a>
        `;
      }).join('');

      const carousel = new CarouselManager('brandsCarousel', {
        itemsPerView: 3,
        gap: 32,
        autoScroll: false
      });
      
      carousel.updateItems();
      
      window.brandsCarousel = carousel;
    } else {
      container.innerHTML = `
        <div class="carousel-empty">
          <p>No hay marcas disponibles en este momento.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error cargando marcas:', error);
    container.innerHTML = `
      <div class="carousel-empty">
        <p>⚠️ Error al cargar las marcas. Por favor intenta más tarde.</p>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadCategoriesCarousel();
  loadBrandsCarousel();
});

window.CarouselManager = CarouselManager;
