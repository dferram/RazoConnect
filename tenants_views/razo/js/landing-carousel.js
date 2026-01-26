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
    
    // Los botones están en el section padre, no dentro del carousel-wrapper
    const section = this.container.closest('.carousel-section');
    if (section) {
      const navContainer = section.querySelector('.carousel-nav');
      if (navContainer) {
        this.prevBtn = navContainer.querySelector('.carousel-arrow.prev');
        this.nextBtn = navContainer.querySelector('.carousel-arrow.next');
      }
    }
    
    // Fallback: buscar en el contenedor directo
    if (!this.prevBtn) {
      this.prevBtn = this.container.querySelector('.carousel-arrow.prev');
    }
    if (!this.nextBtn) {
      this.nextBtn = this.container.querySelector('.carousel-arrow.next');
    }
    
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
    if (!this.track) {
      console.error('Carousel track not found');
      return;
    }

    console.log('🎪 Inicializando carrusel:', {
      container: this.container.id,
      hasPrevBtn: !!this.prevBtn,
      hasNextBtn: !!this.nextBtn,
      hasTrack: !!this.track
    });

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
      this.prevBtn.addEventListener('click', () => {
        console.log('← Click en botón anterior');
        this.prev();
      });
      console.log('✅ Evento click agregado al botón anterior');
    } else {
      console.warn('⚠️ Botón anterior no encontrado');
    }
    
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => {
        console.log('→ Click en botón siguiente');
        this.next();
      });
      console.log('✅ Evento click agregado al botón siguiente');
    } else {
      console.warn('⚠️ Botón siguiente no encontrado');
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
    console.log('📋 Items actualizados:', this.items.length);
    this.updateNavigation();
    
    // Asegurar que el slide inicial funcione
    if (this.items.length > 0) {
      this.slide();
    }
  }

  prev() {
    console.log('🔙 Prev llamado. Index actual:', this.currentIndex);
    if (this.currentIndex > 0) {
      this.currentIndex--;
      console.log('✅ Moviendo a index:', this.currentIndex);
      this.slide();
      this.resetAutoScroll();
    } else {
      console.log('⚠️ Ya está en el inicio');
    }
  }

  next() {
    const maxIndex = Math.max(0, this.items.length - Math.floor(this.itemsPerView));
    console.log('🔜 Next llamado. Index actual:', this.currentIndex, 'Max:', maxIndex);
    
    if (this.currentIndex < maxIndex) {
      this.currentIndex++;
      console.log('✅ Moviendo a index:', this.currentIndex);
      this.slide();
      this.resetAutoScroll();
    } else {
      console.log('⚠️ Ya está en el final');
    }
  }

  slide() {
    if (!this.track || this.items.length === 0) {
      console.warn('⚠️ No se puede hacer slide: track o items vacíos');
      return;
    }

    const cardWidth = this.items[0].offsetWidth;
    const offset = -(this.currentIndex * (cardWidth + this.gap));
    
    console.log('🎠 Sliding:', {
      currentIndex: this.currentIndex,
      cardWidth,
      gap: this.gap,
      offset,
      itemsCount: this.items.length
    });
    
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
    
    // ✅ MISIÓN 3: Cargar desde base de datos
    const response = await fetch('/api/public/landing-items');
    const data = await response.json();
    
    if (data.success && data.data.categories) {
      categories = data.data.categories;
    }
    
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
    
    // ✅ MISIÓN 3: Cargar desde base de datos
    const response = await fetch('/api/public/landing-items');
    const data = await response.json();
    
    if (data.success && data.data.brands) {
      proveedores = data.data.brands;
    }
    
    if (proveedores.length > 0) {
      container.innerHTML = proveedores.map(proveedor => {
        const nombre = proveedor.name || proveedor.nombre || 'Marca';
        const initial = nombre.charAt(0).toUpperCase();
        const imageUrl = proveedor.image || `https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=800&h=600&fit=crop&q=80`;
        const href = proveedor.href || `/proveedor-tienda.html?id=${proveedor.id || ''}`;
        
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
