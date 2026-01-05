/**
 * Admin Catálogo Visual - State Management & Modal Navigation
 * Handles category grid, product shelf, and modal with navigation
 */

(function () {
  'use strict';

  // State Management
  const state = {
    currentView: 'categories', // 'categories' | 'products'
    selectedCategory: null,
    categories: [],
    products: [],
    filteredCategories: [],
    filteredProducts: [],
    currentProductIndex: -1,
    searchTerm: '',
  };

  // DOM Elements
  const elements = {
    // Views
    categoriesView: document.getElementById('categoriesView'),
    productsView: document.getElementById('productsView'),
    
    // Categories
    categoriesLoading: document.getElementById('categoriesLoading'),
    categoriesGrid: document.getElementById('categoriesGrid'),
    categoriesEmpty: document.getElementById('categoriesEmpty'),
    
    // Products
    productsLoading: document.getElementById('productsLoading'),
    productsGrid: document.getElementById('productsGrid'),
    productsEmpty: document.getElementById('productsEmpty'),
    
    // Search & Navigation
    searchInput: document.getElementById('searchInput'),
    breadcrumb: document.getElementById('breadcrumb'),
    
    // Modal
    productModal: document.getElementById('productModal'),
    modalContent: document.getElementById('modalContent'),
    modalClose: document.getElementById('modalClose'),
    modalPrev: document.getElementById('modalPrev'),
    modalNext: document.getElementById('modalNext'),
  };

  // API Configuration
  const adminToken = localStorage.getItem('razoconnect_admin_token');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  };

  // ============================================
  // API CALLS
  // ============================================

  async function fetchCategories() {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/categorias`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error('Error al cargar categorías');
      }

      const result = await response.json();
      return result.success ? result.data.categorias : [];
    } catch (error) {
      console.error('Error fetching categories:', error);
      showToast('Error al cargar categorías', 'error');
      return [];
    }
  }

  async function fetchProductsByCategory(categoriaId) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/productos?categoria=${categoriaId}`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        throw new Error('Error al cargar productos');
      }

      const result = await response.json();
      return result.success ? result.data.productos : [];
    } catch (error) {
      console.error('Error fetching products:', error);
      showToast('Error al cargar productos', 'error');
      return [];
    }
  }

  async function fetchProductDetails(productoId) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/admin/inventario/producto-detalle/${productoId}`,
        {
          method: 'GET',
          headers,
        }
      );

      if (!response.ok) {
        throw new Error('Error al cargar detalles del producto');
      }

      const result = await response.json();
      return result.success ? result.data : null;
    } catch (error) {
      console.error('Error fetching product details:', error);
      showToast('Error al cargar detalles del producto', 'error');
      return null;
    }
  }

  // ============================================
  // CATEGORIES VIEW
  // ============================================

  async function loadCategories() {
    showLoading('categories');
    
    state.categories = await fetchCategories();
    state.filteredCategories = state.categories;
    
    renderCategories();
  }

  function renderCategories() {
    const categories = state.filteredCategories;

    elements.categoriesLoading.style.display = 'none';

    if (categories.length === 0) {
      elements.categoriesGrid.style.display = 'none';
      elements.categoriesEmpty.style.display = 'flex';
      return;
    }

    elements.categoriesEmpty.style.display = 'none';
    elements.categoriesGrid.style.display = 'grid';

    elements.categoriesGrid.innerHTML = categories
      .map(
        (cat) => `
        <div class="category-card" data-category-id="${cat.categoriaId}">
          ${
            cat.imagenUrl
              ? `<img src="${cat.imagenUrl}" alt="${cat.nombre}" class="category-card-image" />`
              : `<div class="category-card-placeholder">🏷️</div>`
          }
          <div class="category-card-content">
            <h3 class="category-card-title">${cat.nombre}</h3>
          </div>
        </div>
      `
      )
      .join('');

    // Add click listeners
    document.querySelectorAll('.category-card').forEach((card) => {
      card.addEventListener('click', () => {
        const categoryId = parseInt(card.dataset.categoryId, 10);
        navigateToProducts(categoryId);
      });
    });
  }

  function filterCategories(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    
    if (!term) {
      state.filteredCategories = state.categories;
    } else {
      state.filteredCategories = state.categories.filter((cat) =>
        cat.nombre.toLowerCase().includes(term)
      );
    }
    
    renderCategories();
  }

  // ============================================
  // PRODUCTS VIEW
  // ============================================

  async function navigateToProducts(categoriaId) {
    const category = state.categories.find((c) => c.categoriaId === categoriaId);
    if (!category) return;

    state.selectedCategory = category;
    state.currentView = 'products';
    state.searchTerm = '';
    elements.searchInput.value = '';

    updateBreadcrumb();
    switchView('products');
    
    await loadProducts(categoriaId);
  }

  async function loadProducts(categoriaId) {
    showLoading('products');
    
    state.products = await fetchProductsByCategory(categoriaId);
    state.filteredProducts = state.products;
    
    renderProducts();
  }

  function renderProducts() {
    const products = state.filteredProducts;

    elements.productsLoading.style.display = 'none';

    if (products.length === 0) {
      elements.productsGrid.style.display = 'none';
      elements.productsEmpty.style.display = 'flex';
      return;
    }

    elements.productsEmpty.style.display = 'none';
    elements.productsGrid.style.display = 'grid';

    elements.productsGrid.innerHTML = products
      .map((product, index) => {
        // Handle both API response formats: imagenUrl (string) or imagenes (array)
        let firstImage = null;
        if (product.imagenUrl) {
          firstImage = product.imagenUrl;
        } else if (product.imagenes && product.imagenes.length > 0) {
          firstImage = product.imagenes[0].url || product.imagenes[0];
        }
        
        const stockTotal = product.variantes?.reduce(
          (sum, v) => sum + (v.stock || 0),
          0
        ) || 0;

        return `
        <div class="product-card" data-product-index="${index}">
          <div class="product-card-image-container">
            ${
              firstImage
                ? `<img src="${firstImage}" alt="${product.nombreProducto}" class="product-card-image" />`
                : `<div class="product-card-placeholder">📦</div>`
            }
            ${
              !product.activo
                ? '<div class="product-card-badge">Inactivo</div>'
                : ''
            }
          </div>
          <div class="product-card-content">
            <div class="product-card-category">${state.selectedCategory.nombre}</div>
            <h3 class="product-card-title">${product.nombreProducto}</h3>
            <div class="product-card-sku">SKU: ${product.skuMaestro || 'N/A'}</div>
            <div class="product-card-footer">
              <div class="product-card-stock">
                <i class="bi bi-box-seam"></i>
                <span>${stockTotal} unidades</span>
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join('');

    // Add click listeners
    document.querySelectorAll('.product-card').forEach((card) => {
      card.addEventListener('click', () => {
        const index = parseInt(card.dataset.productIndex, 10);
        openProductModal(index);
      });
    });
  }

  function filterProducts(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    
    if (!term) {
      state.filteredProducts = state.products;
    } else {
      state.filteredProducts = state.products.filter(
        (product) =>
          product.nombreProducto.toLowerCase().includes(term) ||
          (product.skuMaestro && product.skuMaestro.toLowerCase().includes(term))
      );
    }
    
    renderProducts();
  }

  // ============================================
  // PRODUCT MODAL
  // ============================================

  async function openProductModal(index) {
    state.currentProductIndex = index;
    const product = state.filteredProducts[index];
    
    if (!product) return;

    // Show modal
    elements.productModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Show loading
    elements.modalContent.innerHTML = `
      <div class="product-modal-loading">
        <div class="spinner"></div>
        <p>Cargando producto...</p>
      </div>
    `;

    // Update navigation buttons
    updateModalNavigation();

    // Fetch full product details
    const productDetails = await fetchProductDetails(product.productoId);
    
    if (productDetails) {
      renderProductModal(productDetails);
    } else {
      closeProductModal();
    }
  }

  function renderProductModal(product) {
    const images = product.imagenes || [];
    const mainImage = images.length > 0 ? images[0].url : null;
    const variants = product.variantes || [];
    const stockTotal = product.totalStock || 0;

    elements.modalContent.innerHTML = `
      <div class="product-modal-body">
        <div class="product-modal-images">
          ${
            mainImage
              ? `<img src="${mainImage}" alt="${product.nombreProducto}" class="product-modal-main-image" id="mainImage" />`
              : `<div class="product-modal-main-image" style="display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #f5f1ed 0%, #e5e7eb 100%); font-size: 5rem; opacity: 0.3;">📦</div>`
          }
          ${
            images.length > 1
              ? `
            <div class="product-modal-thumbnails">
              ${images
                .map(
                  (img, idx) => `
                <img 
                  src="${img.url}" 
                  alt="Imagen ${idx + 1}" 
                  class="product-modal-thumbnail ${idx === 0 ? 'active' : ''}" 
                  data-image-url="${img.url}"
                />
              `
                )
                .join('')}
            </div>
          `
              : ''
          }
        </div>

        <div class="product-modal-info">
          <div class="product-modal-header">
            <div class="product-modal-category">${state.selectedCategory?.nombre || 'TODA OCASIÓN'}</div>
            <h2 class="product-modal-title">${product.nombreProducto}</h2>
            <div class="product-modal-sku">SKU Maestro: ${product.skuMaestro || 'N/A'}</div>
          </div>

          <div class="product-modal-section">
            <h3 class="product-modal-section-title">Descripción</h3>
            <p class="product-modal-description">${product.descripcion || 'Sin descripción disponible.'}</p>
          </div>

          <div class="product-modal-section">
            <h3 class="product-modal-section-title">Información General</h3>
            <div class="product-modal-specs">
              <div class="product-modal-spec">
                <span class="product-modal-spec-label">STOCK TOTAL</span>
                <span class="product-modal-spec-value">${stockTotal} unidades</span>
              </div>
              <div class="product-modal-spec">
                <span class="product-modal-spec-label">VARIANTES</span>
                <span class="product-modal-spec-value">${product.totalVariantes || 0}</span>
              </div>
              <div class="product-modal-spec">
                <span class="product-modal-spec-label">ESTADO</span>
                <span class="product-modal-spec-value">${product.activo ? 'Activo' : 'Inactivo'}</span>
              </div>
              <div class="product-modal-spec">
                <span class="product-modal-spec-label">PROVEEDOR</span>
                <span class="product-modal-spec-value">${product.proveedor || 'Sin asignar'}</span>
              </div>
            </div>
          </div>

          ${
            variants.length > 0
              ? `
            <div class="product-modal-section">
              <h3 class="product-modal-section-title">Desglose de Inventario (${variants.length} variantes)</h3>
              <div style="overflow-x: auto; margin-top: 1rem;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                  <thead>
                    <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                      <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #64748b;">SKU</th>
                      <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #64748b;">Característica</th>
                      <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #64748b;">Precio</th>
                      <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: #64748b;">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${variants
                      .map(
                        (variant) => {
                          const stock = variant.stock || 0;
                          const stockColor = stock > 0 ? '#16a34a' : '#dc2626';
                          const stockWeight = stock > 0 ? '600' : '500';
                          const precio = variant.precio || 0;
                          return `
                          <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 0.75rem; font-weight: 600;">${variant.sku || 'Sin SKU'}</td>
                            <td style="padding: 0.75rem;">${variant.caracteristica || 'Sin especificar'}</td>
                            <td style="padding: 0.75rem; font-weight: 600; color: #f97316;">$${precio.toFixed(2)}</td>
                            <td style="padding: 0.75rem; font-weight: ${stockWeight}; color: ${stockColor};">${stock} pzas</td>
                          </tr>
                        `;
                        }
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `
              : '<div class="product-modal-section"><p style="color: #64748b; text-align: center; padding: 2rem;">Sin variantes registradas</p></div>'
          }
        </div>
      </div>
    `;

    // Add thumbnail click listeners
    if (images.length > 1) {
      const mainImageEl = document.getElementById('mainImage');
      document.querySelectorAll('.product-modal-thumbnail').forEach((thumb) => {
        thumb.addEventListener('click', () => {
          const imageUrl = thumb.dataset.imageUrl;
          if (mainImageEl) {
            mainImageEl.src = imageUrl;
          }
          
          // Update active state
          document.querySelectorAll('.product-modal-thumbnail').forEach((t) => {
            t.classList.remove('active');
          });
          thumb.classList.add('active');
        });
      });
    }
  }

  function closeProductModal() {
    elements.productModal.style.display = 'none';
    document.body.style.overflow = '';
    state.currentProductIndex = -1;
  }

  function updateModalNavigation() {
    const hasPrev = state.currentProductIndex > 0;
    const hasNext = state.currentProductIndex < state.filteredProducts.length - 1;

    elements.modalPrev.disabled = !hasPrev;
    elements.modalNext.disabled = !hasNext;
  }

  async function navigateModal(direction) {
    const newIndex = state.currentProductIndex + direction;
    
    if (newIndex < 0 || newIndex >= state.filteredProducts.length) {
      return;
    }

    state.currentProductIndex = newIndex;
    const product = state.filteredProducts[newIndex];

    // Show loading
    elements.modalContent.innerHTML = `
      <div class="product-modal-loading">
        <div class="spinner"></div>
        <p>Cargando producto...</p>
      </div>
    `;

    // Update navigation buttons
    updateModalNavigation();

    // Fetch and render
    const productDetails = await fetchProductDetails(product.productoId);
    if (productDetails) {
      renderProductModal(productDetails);
    }
  }

  // ============================================
  // NAVIGATION & UI
  // ============================================

  function switchView(view) {
    if (view === 'categories') {
      elements.categoriesView.style.display = 'block';
      elements.productsView.style.display = 'none';
      elements.searchInput.placeholder = 'Buscar categorías...';
    } else if (view === 'products') {
      elements.categoriesView.style.display = 'none';
      elements.productsView.style.display = 'block';
      elements.searchInput.placeholder = 'Buscar productos...';
    }
  }

  function updateBreadcrumb() {
    if (state.currentView === 'categories') {
      elements.breadcrumb.innerHTML = `
        <a href="#" class="breadcrumb-item active" data-level="categories">
          Categorías
        </a>
      `;
    } else if (state.currentView === 'products' && state.selectedCategory) {
      elements.breadcrumb.innerHTML = `
        <a href="#" class="breadcrumb-item" data-level="categories">
          Categorías
        </a>
        <a href="#" class="breadcrumb-item active" data-level="products">
          ${state.selectedCategory.nombre}
        </a>
      `;
    }

    // Add breadcrumb click listeners
    document.querySelectorAll('.breadcrumb-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const level = item.dataset.level;
        
        if (level === 'categories') {
          navigateToCategories();
        }
      });
    });
  }

  function navigateToCategories() {
    state.currentView = 'categories';
    state.selectedCategory = null;
    state.searchTerm = '';
    elements.searchInput.value = '';

    updateBreadcrumb();
    switchView('categories');
    renderCategories();
  }

  function showLoading(view) {
    if (view === 'categories') {
      elements.categoriesLoading.style.display = 'flex';
      elements.categoriesGrid.style.display = 'none';
      elements.categoriesEmpty.style.display = 'none';
    } else if (view === 'products') {
      elements.productsLoading.style.display = 'flex';
      elements.productsGrid.style.display = 'none';
      elements.productsEmpty.style.display = 'none';
    }
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  function initEventListeners() {
    // Search
    elements.searchInput.addEventListener('input', (e) => {
      state.searchTerm = e.target.value;
      
      if (state.currentView === 'categories') {
        filterCategories(state.searchTerm);
      } else if (state.currentView === 'products') {
        filterProducts(state.searchTerm);
      }
    });

    // Modal close
    elements.modalClose.addEventListener('click', closeProductModal);
    
    // Modal overlay click
    elements.productModal.querySelector('.product-modal-overlay').addEventListener('click', closeProductModal);

    // Modal navigation
    elements.modalPrev.addEventListener('click', () => navigateModal(-1));
    elements.modalNext.addEventListener('click', () => navigateModal(1));

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (elements.productModal.style.display === 'flex') {
        if (e.key === 'Escape') {
          closeProductModal();
        } else if (e.key === 'ArrowLeft') {
          navigateModal(-1);
        } else if (e.key === 'ArrowRight') {
          navigateModal(1);
        }
      }
    });
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  function init() {
    initEventListeners();
    updateBreadcrumb();
    loadCategories();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
