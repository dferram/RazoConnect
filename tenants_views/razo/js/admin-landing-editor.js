/**
 * Admin Landing Page Editor
 * Split-screen editor with auto-save and real-time preview
 */

(function () {
  'use strict';

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  
  let currentConfig = {};
  let autoSaveTimeout = null;
  let isDirty = false;
  let categories = [];
  let currentPage = 'inicio';
  let currentEditingSlide = null;
  let imageEditModal = null;
  let cropperInstance = null;
  let cropperReady = false; // ✅ Bandera de control de inicialización
  let currentImageFile = null;
  let availableCategories = [];

  // ============================================
  // INITIALIZATION
  // ============================================

  async function init() {
    showLoading(true);
    
    try {
      // ✅ SOLUCIÓN DEFINITIVA: Sobrescribir el método _enforceFocus de Bootstrap
      // Este método es el que causa el error de aria-hidden
      const originalEnforceFocus = bootstrap.Modal.prototype._enforceFocus;
      bootstrap.Modal.prototype._enforceFocus = function() {
        // No hacer nada - deshabilitar completamente el focus trap
        console.log('Focus trap disabled to prevent aria-hidden errors');
      };
      
      // ✅ Inicializar modal con configuración para evitar errores de aria-hidden
      const modalElement = document.getElementById('imageEditModal');
      imageEditModal = new bootstrap.Modal(modalElement, {
        backdrop: true,
        keyboard: true,
        focus: false  // ✅ CRÍTICO: Deshabilitar auto-focus para evitar error aria-hidden
      });
      
      await Promise.all([
        loadConfig(),
        loadCategories()
      ]);

      setupEventListeners();
      setupPageSelector();
      setupImageModal();
      showLoading(false);
    } catch (error) {
      console.error('Error initializing editor:', error);
      showLoading(false);
      Swal.fire({
        icon: 'error',
        title: 'Error al cargar editor',
        text: error.message || 'No se pudo cargar la configuración'
      });
    }
  }

  // ============================================
  // LOAD CONFIGURATION
  // ============================================

  async function loadConfig(page = null) {
    try {
      const targetPage = page || currentPage;
      const token = localStorage.getItem('razoconnect_admin_token');
      const response = await fetch(`/api/admin/landing/config?page=${targetPage}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Error al cargar configuración');
      }

      currentConfig = {};
      data.data.forEach(item => {
        // Remove page prefix for easier access
        const keyWithoutPrefix = item.section_key.replace(`${targetPage}_`, '');
        currentConfig[keyWithoutPrefix] = {
          value_draft: item.value_draft,
          value_published: item.value_published,
          content_type: item.content_type,
          full_key: item.section_key
        };
      });

      populateForm();
    } catch (error) {
      console.error('Error loading config:', error);
      throw error;
    }
  }

  // ============================================
  // LOAD CATEGORIES
  // ============================================

  async function loadCategories() {
    try {
      const response = await fetch('/api/categorias');
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Error al cargar categorías');
      }

      categories = data.data.categorias || [];
      availableCategories = categories.map(cat => ({
        id: cat.categoriaid || cat.categoriaId,
        nombre: cat.nombre || cat.Nombre
      }));

      populateCategorySelects();
    } catch (error) {
      console.error('Error loading categories:', error);
      throw error;
    }
  }

  // ============================================
  // POPULATE FORM WITH CURRENT CONFIG
  // ============================================

  function populateForm() {
    Object.keys(currentConfig).forEach(key => {
      const config = currentConfig[key];
      const value = config.value_draft !== null ? config.value_draft : config.value_published;
      const element = document.getElementById(key);

      if (!element) return;

      if (config.content_type === 'image_url' && value) {
        const slideNum = key.match(/\d+/)?.[0];
        if (slideNum) {
          showImagePreview(slideNum, value);
        }
        element.value = value;
      } else if (element.tagName === 'SELECT') {
        element.value = value || '';
      } else {
        element.value = value || '';
      }
    });
  }

  // ============================================
  // POPULATE CATEGORY DROPDOWNS
  // ============================================

  function populateCategorySelects() {
    const ofertasSelect = document.getElementById('section_ofertas_category');
    const nuevosSelect = document.getElementById('section_nuevos_category');

    const optionsHTML = categories.map(cat => 
      `<option value="${cat.id}">${cat.nombre}</option>`
    ).join('');

    if (ofertasSelect) {
      ofertasSelect.innerHTML = '<option value="">Usar lógica por defecto (productos con oferta)</option>' + optionsHTML;
    }

    if (nuevosSelect) {
      nuevosSelect.innerHTML = '<option value="">Usar lógica por defecto (productos recientes)</option>' + optionsHTML;
    }

    const ofertasValue = currentConfig['section_ofertas_category']?.value_draft || 
                         currentConfig['section_ofertas_category']?.value_published;
    const nuevosValue = currentConfig['section_nuevos_category']?.value_draft || 
                        currentConfig['section_nuevos_category']?.value_published;

    if (ofertasSelect && ofertasValue) ofertasSelect.value = ofertasValue;
    if (nuevosSelect && nuevosValue) nuevosSelect.value = nuevosValue;

    // Generate smart selects for CTA links
    generateSmartSelects();
  }

  // ============================================
  // GENERATE SMART SELECT OPTIONS
  // ============================================

  function generateSmartSelectOptions() {
    let optionsHTML = '';

    // Grupo 1: Páginas Generales
    optionsHTML += '<optgroup label="📄 Páginas Generales">';
    optionsHTML += '<option value="/">Inicio</option>';
    optionsHTML += '<option value="/catalogo.html">Catálogo Completo</option>';
    optionsHTML += '<option value="/contacto.html">Contacto</option>';
    optionsHTML += '<option value="/registro.html">Registro</option>';
    optionsHTML += '</optgroup>';

    // Grupo 2: Categorías Dinámicas
    if (availableCategories.length > 0) {
      optionsHTML += '<optgroup label="🏷️ Categorías">';
      availableCategories.forEach(categoria => {
        const url = `/catalogo.html?categoria=${categoria.id}`;
        const label = `Colección: ${categoria.nombre}`;
        optionsHTML += `<option value="${url}">${label}</option>`;
      });
      optionsHTML += '</optgroup>';
    }

    // Grupo 3: Filtros Especiales
    optionsHTML += '<optgroup label="⭐ Filtros Especiales">';
    optionsHTML += '<option value="/catalogo.html?oferta=true">Ofertas</option>';
    optionsHTML += '<option value="/catalogo.html?sort=newest">Lo Nuevo</option>';
    optionsHTML += '<option value="/catalogo.html?destacado=true">Destacados</option>';
    optionsHTML += '</optgroup>';

    return optionsHTML;
  }

  function generateSmartSelects() {
    const smartSelectOptions = generateSmartSelectOptions();

    // Actualizar todos los selects de CTA links
    for (let i = 1; i <= 3; i++) {
      const select = document.getElementById(`hero_slide_${i}_cta_link`);
      if (select && select.tagName === 'SELECT') {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Seleccionar destino...</option>' + smartSelectOptions;
        if (currentValue) {
          select.value = currentValue;
        }
      }
    }
  }

  // ============================================
  // LIVE PREVIEW SYNCHRONIZATION
  // ============================================

  function syncTextToPreview(inputId, iframeSelector) {
    const input = document.getElementById(inputId);
    if (!input) {
      console.warn(`Input not found: ${inputId}`);
      return;
    }

    input.addEventListener('input', function() {
      try {
        const previewIframe = document.getElementById('previewIframe');
        if (!previewIframe || !previewIframe.contentDocument) {
          console.warn('Preview iframe not accessible yet');
          return;
        }

        const targetElement = previewIframe.contentDocument.querySelector(iframeSelector);
        if (targetElement) {
          targetElement.textContent = this.value;
          console.log(`✅ Live preview updated: ${inputId} -> ${iframeSelector}`);
        } else {
          console.warn(`⚠️ Target element not found in iframe: ${iframeSelector}`);
        }
      } catch (error) {
        console.error('Error syncing to preview:', error);
      }
    });
  }

  function syncImageToPreview(slideNumber, imageUrl) {
    try {
      const previewIframe = document.getElementById('previewIframe');
      if (!previewIframe || !previewIframe.contentDocument) {
        console.warn('Preview iframe not accessible for image sync');
        return;
      }

      // Buscar la imagen del slide específico en el carousel
      const carouselItems = previewIframe.contentDocument.querySelectorAll('.carousel-item');
      if (carouselItems && carouselItems[slideNumber - 1]) {
        const targetItem = carouselItems[slideNumber - 1];
        const img = targetItem.querySelector('img');
        if (img) {
          img.src = imageUrl;
          console.log(`✅ Live preview image updated: Slide ${slideNumber}`);
        } else {
          console.warn(`⚠️ Image element not found in slide ${slideNumber}`);
        }
      } else {
        console.warn(`⚠️ Carousel item ${slideNumber} not found in iframe`);
      }
    } catch (error) {
      console.error('Error syncing image to preview:', error);
    }
  }

  function setupLivePreviewSync() {
    const previewIframe = document.getElementById('previewIframe');
    
    if (!previewIframe) {
      console.error('❌ Preview iframe not found in DOM');
      return;
    }

    console.log('🔧 Setting up live preview synchronization...');

    // Función para configurar los listeners una vez que el iframe esté listo
    function attachSyncListeners() {
      try {
        // Verificar acceso al contentDocument
        if (!previewIframe.contentDocument) {
          console.error('❌ Cannot access iframe contentDocument (CORS issue?)');
          return;
        }

        // Verificar que el carousel existe en el iframe
        const carouselInIframe = previewIframe.contentDocument.querySelector('.carousel');
        if (!carouselInIframe) {
          console.warn('⚠️ Carousel not found in iframe - preview sync disabled');
          return;
        }

        console.log('✅ Carousel found in iframe, attaching sync listeners...');

        // Sincronizar textos de los 3 slides con selectores flexibles
        for (let i = 1; i <= 3; i++) {
          // Usar nth-child que es más robusto que IDs
          syncTextToPreview(`hero_slide_${i}_eyebrow`, `.carousel-item:nth-child(${i}) .hero-eyebrow`);
          syncTextToPreview(`hero_slide_${i}_title`, `.carousel-item:nth-child(${i}) .hero-title`);
          syncTextToPreview(`hero_slide_${i}_description`, `.carousel-item:nth-child(${i}) .hero-description`);
          syncTextToPreview(`hero_slide_${i}_cta_text`, `.carousel-item:nth-child(${i}) .btn-primary`);
        }

        console.log('✅ Live preview synchronization enabled successfully');
      } catch (error) {
        console.error('❌ Error setting up live preview:', error);
      }
    }

    // ✅ CRÍTICO: Esperar a que el iframe cargue completamente
    previewIframe.addEventListener('load', function() {
      console.log('🎬 Preview iframe loaded, waiting for DOM to be ready...');
      
      // Esperar un momento adicional para asegurar que el DOM del iframe esté listo
      setTimeout(() => {
        attachSyncListeners();
      }, 800); // Aumentado a 800ms para mayor seguridad
    });

    // También intentar configurar inmediatamente si el iframe ya está cargado
    if (previewIframe.contentDocument && previewIframe.contentDocument.readyState === 'complete') {
      console.log('🎬 Preview iframe already loaded, setting up immediately...');
      setTimeout(() => {
        attachSyncListeners();
      }, 300);
    }
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  function setupEventListeners() {
    setupImageUploads();
    setupFormInputs();
    setupActionButtons();
    setupLivePreviewSync();
  }

  // ============================================
  // IMAGE UPLOAD HANDLERS
  // ============================================

  function setupImageUploads() {
    for (let i = 1; i <= 3; i++) {
      const uploadArea = document.getElementById(`uploadArea${i}`);
      const fileInput = document.getElementById(`imageInput${i}`);

      if (!uploadArea || !fileInput) continue;

      // Remove any existing listeners to avoid duplicates
      const newUploadArea = uploadArea.cloneNode(true);
      uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);

      const finalUploadArea = document.getElementById(`uploadArea${i}`);
      
      finalUploadArea.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (finalUploadArea.classList.contains('has-image')) {
          openImageEditModal(i);
        } else {
          fileInput.click();
        }
      });

      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          Swal.fire({
            icon: 'error',
            title: 'Archivo inválido',
            text: 'Por favor selecciona una imagen válida'
          });
          return;
        }

        await uploadImage(file, i);
      });
    }
  }

  // ============================================
  // UPLOAD IMAGE TO CLOUDINARY
  // ============================================

  async function uploadImage(file, slideNumber) {
    const uploadArea = document.getElementById(`uploadArea${slideNumber}`);
    const originalContent = uploadArea.innerHTML;

    uploadArea.innerHTML = `
      <div class="spinner-border text-primary" role="status"></div>
      <p class="upload-text mt-2 mb-0">Subiendo imagen...</p>
    `;

    try {
      const token = localStorage.getItem('razoconnect_admin_token');
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/admin/landing/upload-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Error al subir imagen');
      }

      const imageUrl = data.data.url;
      const hiddenInput = document.getElementById(`hero_slide_${slideNumber}_image`);
      if (hiddenInput) {
        hiddenInput.value = imageUrl;
      }

      showImagePreview(slideNumber, imageUrl);
      
      // ✅ Sincronizar imagen al preview en tiempo real
      syncImageToPreview(slideNumber, imageUrl);
      
      triggerAutoSave();

      Swal.fire({
        icon: 'success',
        title: 'Imagen subida',
        text: 'La imagen se ha subido correctamente',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      uploadArea.innerHTML = originalContent;
      
      Swal.fire({
        icon: 'error',
        title: 'Error al subir imagen',
        text: error.message || 'No se pudo subir la imagen'
      });
    }
  }

  // ============================================
  // SHOW IMAGE PREVIEW
  // ============================================

  function showImagePreview(slideNumber, imageUrl) {
    const uploadArea = document.getElementById(`uploadArea${slideNumber}`);
    if (!uploadArea) return;

    // Use placeholder if no image URL provided
    const displayUrl = imageUrl && imageUrl.trim() !== '' 
      ? imageUrl 
      : 'https://via.placeholder.com/1600x900/e5e7eb/6b7280?text=Sin+Imagen';

    uploadArea.classList.add('has-image');
    uploadArea.style.cursor = 'pointer';
    uploadArea.style.position = 'relative';
    uploadArea.innerHTML = `
      <img src="${displayUrl}" alt="Preview Slide ${slideNumber}" class="image-preview" />
      <div style="position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(0,0,0,0.7); color: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem;">
        <i class="bi bi-pencil"></i> ${imageUrl ? 'Editar' : 'Subir'}
      </div>
    `;
    
    // Remove old listeners and add new one
    const newUploadArea = uploadArea.cloneNode(true);
    uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);
    
    const finalArea = document.getElementById(`uploadArea${slideNumber}`);
    finalArea.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openImageEditModal(slideNumber);
    });
  }

  // ============================================
  // FORM INPUT HANDLERS
  // ============================================

  function setupFormInputs() {
    const formElements = document.querySelectorAll('input[id^="hero_"], textarea[id^="hero_"], select[id^="section_"]');

    formElements.forEach(element => {
      element.addEventListener('input', () => {
        isDirty = true;
        triggerAutoSave();
      });

      element.addEventListener('change', () => {
        isDirty = true;
        triggerAutoSave();
      });
    });
  }

  // ============================================
  // AUTO-SAVE LOGIC
  // ============================================

  function triggerAutoSave() {
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }

    showAutoSaveIndicator('saving');

    autoSaveTimeout = setTimeout(async () => {
      await saveDraft();
    }, 1500);
  }

  // ============================================
  // SAVE DRAFT
  // ============================================

  async function saveDraft() {
    try {
      const updates = collectFormData();

      const token = localStorage.getItem('razoconnect_admin_token');
      const response = await fetch('/api/admin/landing/draft', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Error al guardar borrador');
      }

      showAutoSaveIndicator('saved');
      reloadPreview();
    } catch (error) {
      console.error('Error saving draft:', error);
      showAutoSaveIndicator('error');
    }
  }

  // ============================================
  // COLLECT FORM DATA
  // ============================================

  function collectFormData() {
    const updates = [];
    const pagePrefix = `${currentPage}_`;

    // Hero Slider fields
    for (let i = 1; i <= 3; i++) {
      const fields = ['image', 'eyebrow', 'title', 'description', 'cta_text', 'cta_link'];
      
      fields.forEach(field => {
        const element = document.getElementById(`hero_slide_${i}_${field}`);
        if (element) {
          updates.push({
            section_key: `${pagePrefix}hero_slide_${i}_${field}`,
            value: element.value || null
          });
        }
      });
    }

    // Product section categories - different for each page
    if (currentPage === 'inicio') {
      const ofertasCategory = document.getElementById('section_ofertas_category');
      const nuevosCategory = document.getElementById('section_nuevos_category');

      if (ofertasCategory) {
        updates.push({
          section_key: `${pagePrefix}section_ofertas_category`,
          value: ofertasCategory.value || null
        });
      }

      if (nuevosCategory) {
        updates.push({
          section_key: `${pagePrefix}section_nuevos_category`,
          value: nuevosCategory.value || null
        });
      }
    } else if (currentPage === 'index') {
      const destacadosCategory = document.getElementById('section_destacados_category');
      const popularesCategory = document.getElementById('section_populares_category');

      if (destacadosCategory) {
        updates.push({
          section_key: `${pagePrefix}section_destacados_category`,
          value: destacadosCategory.value || null
        });
      }

      if (popularesCategory) {
        updates.push({
          section_key: `${pagePrefix}section_populares_category`,
          value: popularesCategory.value || null
        });
      }
    }

    return updates;
  }

  // ============================================
  // RELOAD PREVIEW IFRAME
  // ============================================

  function reloadPreview() {
    const iframe = document.getElementById('previewIframe');
    if (iframe) {
      iframe.src = iframe.src;
    }
  }

  // ============================================
  // ACTION BUTTONS
  // ============================================

  function setupActionButtons() {
    const btnPublish = document.getElementById('btnPublish');
    const btnDiscard = document.getElementById('btnDiscard');

    if (btnPublish) {
      btnPublish.addEventListener('click', publishChanges);
    }

    if (btnDiscard) {
      btnDiscard.addEventListener('click', discardChanges);
    }
  }

  // ============================================
  // PUBLISH CHANGES
  // ============================================

  async function publishChanges() {
    const result = await Swal.fire({
      icon: 'warning',
      title: '¿Publicar cambios?',
      text: 'Los cambios serán visibles para todos los usuarios',
      showCancelButton: true,
      confirmButtonText: 'Sí, publicar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#F97316',
      cancelButtonColor: '#6b7280'
    });

    if (!result.isConfirmed) return;

    showLoading(true);

    try {
      const token = localStorage.getItem('razoconnect_admin_token');
      const response = await fetch('/api/admin/landing/publish', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Error al publicar cambios');
      }

      showLoading(false);
      isDirty = false;

      await Swal.fire({
        icon: 'success',
        title: '¡Cambios publicados!',
        text: `Se publicaron ${data.data.sectionsPublished} secciones exitosamente`,
        confirmButtonColor: '#F97316'
      });

      await loadConfig();
    } catch (error) {
      console.error('Error publishing changes:', error);
      showLoading(false);
      
      Swal.fire({
        icon: 'error',
        title: 'Error al publicar',
        text: error.message || 'No se pudieron publicar los cambios'
      });
    }
  }

  // ============================================
  // DISCARD CHANGES
  // ============================================

  async function discardChanges() {
    const result = await Swal.fire({
      icon: 'warning',
      title: '¿Descartar cambios?',
      text: 'Se perderán todos los cambios no publicados',
      showCancelButton: true,
      confirmButtonText: 'Sí, descartar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280'
    });

    if (!result.isConfirmed) return;

    showLoading(true);

    try {
      const token = localStorage.getItem('razoconnect_admin_token');
      const response = await fetch('/api/admin/landing/reset', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Error al descartar cambios');
      }

      showLoading(false);
      isDirty = false;

      await Swal.fire({
        icon: 'success',
        title: 'Cambios descartados',
        text: 'Se restauró la configuración publicada',
        timer: 2000,
        showConfirmButton: false
      });

      await loadConfig();
      reloadPreview();
    } catch (error) {
      console.error('Error discarding changes:', error);
      showLoading(false);
      
      Swal.fire({
        icon: 'error',
        title: 'Error al descartar',
        text: error.message || 'No se pudieron descartar los cambios'
      });
    }
  }

  // ============================================
  // UI HELPERS
  // ============================================

  function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.style.display = show ? 'flex' : 'none';
    }
  }

  function showAutoSaveIndicator(status) {
    const indicator = document.getElementById('autoSaveIndicator');
    const text = document.getElementById('autoSaveText');

    if (!indicator || !text) return;

    indicator.className = 'auto-save-indicator show';

    if (status === 'saving') {
      indicator.classList.add('saving');
      text.textContent = 'Guardando...';
    } else if (status === 'saved') {
      indicator.classList.remove('saving');
      indicator.classList.add('saved');
      text.innerHTML = '<i class="bi bi-check-circle"></i> Guardado';
      
      setTimeout(() => {
        indicator.classList.remove('show');
      }, 2000);
    } else if (status === 'error') {
      indicator.classList.remove('saving', 'saved');
      text.innerHTML = '<i class="bi bi-exclamation-circle"></i> Error al guardar';
      
      setTimeout(() => {
        indicator.classList.remove('show');
      }, 3000);
    }
  }

  // ============================================
  // PAGE SELECTOR
  // ============================================

  function setupPageSelector() {
    const pageSelector = document.getElementById('pageSelector');
    if (!pageSelector) return;

    pageSelector.addEventListener('change', async (e) => {
      currentPage = e.target.value;
      
      showLoading(true);
      
      try {
        await loadConfig(currentPage);
        updatePreviewUrl();
        
        showLoading(false);
        
        Swal.fire({
          icon: 'success',
          title: 'Página cambiada',
          text: `Ahora estás editando: ${currentPage === 'inicio' ? 'Inicio.html' : 'Index.html'}`,
          timer: 2000,
          showConfirmButton: false
        });
      } catch (error) {
        showLoading(false);
        Swal.fire({
          icon: 'error',
          title: 'Error al cambiar página',
          text: error.message || 'No se pudo cargar la configuración de la página'
        });
      }
    });
  }

  function updatePreviewUrl() {
    const iframe = document.getElementById('previewIframe');
    if (!iframe) return;

    const page = currentPage === 'inicio' ? 'inicio.html' : 'index.html';
    iframe.src = `/${page}?preview=true`;
  }

  // ============================================
  // IMAGE EDIT MODAL WITH CROPPER.JS
  // ============================================

  function setupImageModal() {
    const modalSaveBtn = document.getElementById('modalSaveImage');
    const modalReplaceInput = document.getElementById('modalImageReplace');
    const btnSelectImage = document.getElementById('btnSelectImage');

    // Botón para abrir selector de archivos
    if (btnSelectImage) {
      btnSelectImage.addEventListener('click', () => {
        modalReplaceInput.click();
      });
    }

    // Cuando se selecciona una imagen
    if (modalReplaceInput) {
      modalReplaceInput.addEventListener('change', handleImageSelection);
    }

    // Guardar imagen recortada
    if (modalSaveBtn) {
      modalSaveBtn.addEventListener('click', saveCroppedImage);
    }

    // Limpiar cropper al cerrar modal
    const modal = document.getElementById('imageEditModal');
    if (modal) {
      modal.addEventListener('hidden.bs.modal', destroyCropper);
      
      // ✅ SOLUCIÓN AGRESIVA: Prevenir completamente el focus trap de Bootstrap
      modal.addEventListener('show.bs.modal', function(e) {
        // Deshabilitar el enfoque automático de Bootstrap
        setTimeout(() => {
          // Remover todos los event listeners de focus del modal
          const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          
          // Hacer que todos los elementos sean accesibles sin restricciones
          focusableElements.forEach(el => {
            el.removeAttribute('aria-hidden');
          });
          
          // Remover aria-hidden del modal y sus padres
          modal.removeAttribute('aria-hidden');
          
          // Prevenir que Bootstrap intente hacer focus trap
          const modalDialog = modal.querySelector('.modal-dialog');
          if (modalDialog) {
            modalDialog.removeAttribute('aria-hidden');
          }
        }, 0);
      });
      
      // ✅ Limpiar completamente al cerrar
      modal.addEventListener('hidden.bs.modal', function(e) {
        document.body.style.overflow = '';
        document.body.classList.remove('modal-open');
        
        // Remover backdrop manualmente si queda
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) {
          backdrop.remove();
        }
      });
    }
  }

  function handleImageSelection(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      Swal.fire({
        icon: 'error',
        title: 'Archivo inválido',
        text: 'Por favor selecciona una imagen válida (JPG, PNG, etc.)'
      });
      return;
    }

    // Guardar referencia al archivo
    currentImageFile = file;
    
    // Leer archivo con FileReader
    const reader = new FileReader();

    reader.onload = (event) => {
      const cropperImage = document.getElementById('cropperImage');
      const cropperContainer = document.getElementById('cropperContainer');
      const modalSaveBtn = document.getElementById('modalSaveImage');

      // Validar que existan los elementos
      if (!cropperImage || !cropperContainer) {
        console.error('Cropper elements not found');
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se encontraron los elementos del modal'
        });
        return;
      }

      // Mostrar contenedor del cropper
      cropperContainer.style.display = 'block';
      
      // ✅ CRÍTICO: Deshabilitar botón de guardar hasta que cropper esté listo
      if (modalSaveBtn) {
        modalSaveBtn.disabled = true;
      }

      // Inicializar cropper con la nueva imagen
      initializeCropper(cropperImage, event.target.result);
    };

    reader.onerror = (error) => {
      console.error('Error reading file:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error al leer archivo',
        text: 'No se pudo leer el archivo seleccionado'
      });
    };

    reader.readAsDataURL(file);
  }

  // ============================================
  // LIVE PREVIEW HELPERS
  // ============================================
  
  // Debounce utility para optimizar actualizaciones
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Función auxiliar: Identificar imagen en iframe de preview
  function getPreviewImageElement() {
    try {
      const previewIframe = document.getElementById('previewIframe');
      if (!previewIframe || !previewIframe.contentWindow) {
        console.warn('Preview iframe not found or not accessible');
        return null;
      }

      const iframeDoc = previewIframe.contentWindow.document;
      if (!iframeDoc) {
        console.warn('Cannot access iframe document');
        return null;
      }

      // Buscar la imagen del slide que estamos editando
      // El carousel de Bootstrap usa items con clase .carousel-item.active
      // y dentro hay un <img> con el slide actual
      if (!currentEditingSlide) {
        console.warn('No slide being edited');
        return null;
      }

      // Intentar encontrar el slide específico
      // Primero buscar por el índice del carousel item
      const carouselItems = iframeDoc.querySelectorAll('.carousel-item');
      if (carouselItems && carouselItems[currentEditingSlide - 1]) {
        const targetItem = carouselItems[currentEditingSlide - 1];
        const img = targetItem.querySelector('img');
        if (img) {
          console.log('Found preview image for slide', currentEditingSlide);
          return img;
        }
      }

      // Fallback: buscar imagen activa en el carousel
      const activeSlide = iframeDoc.querySelector('.carousel-item.active img');
      if (activeSlide) {
        console.log('Found active slide image');
        return activeSlide;
      }

      console.warn('Could not find preview image element');
      return null;
    } catch (error) {
      console.error('Error accessing preview iframe:', error);
      return null;
    }
  }

  // Actualizar preview en tiempo real (con debounce)
  const updateLivePreview = debounce(function() {
    if (!cropperInstance || !cropperReady) {
      return;
    }

    try {
      // Obtener canvas recortado con baja calidad para velocidad
      const canvas = cropperInstance.getCroppedCanvas({
        width: 800,  // Resolución reducida para preview
        height: 450,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'low'
      });

      if (!canvas) {
        console.warn('Could not get cropped canvas for preview');
        return;
      }

      // Convertir a DataURL con compresión
      const previewDataUrl = canvas.toDataURL('image/jpeg', 0.5);

      // Inyectar en el iframe
      const previewImg = getPreviewImageElement();
      if (previewImg) {
        previewImg.src = previewDataUrl;
        console.log('Live preview updated');
      }
    } catch (error) {
      console.error('Error updating live preview:', error);
    }
  }, 100); // 100ms debounce para balance entre fluidez y rendimiento

  // ============================================
  // INITIALIZE CROPPER (Robust)
  // ============================================
  
  function initializeCropper(imageElement, imageSrc) {
    // ✅ PASO 1: Destruir instancia anterior si existe
    if (cropperInstance) {
      console.log('Destroying previous cropper instance...');
      cropperInstance.destroy();
      cropperInstance = null;
      cropperReady = false;
    }

    // ✅ PASO 2: Limpiar handlers previos
    imageElement.onload = null;
    imageElement.onerror = null;

    // ✅ PASO 3: Configurar crossOrigin (para archivos locales no es necesario, pero no hace daño)
    imageElement.crossOrigin = 'anonymous';

    // ✅ PASO 4: Asignar nueva imagen
    imageElement.src = imageSrc;

    // ✅ PASO 5: Esperar a que la imagen cargue completamente
    imageElement.onload = function() {
      try {
        console.log('Image loaded, initializing Cropper.js...');
        
        cropperInstance = new Cropper(imageElement, {
          aspectRatio: 16 / 9,
          viewMode: 1,
          dragMode: 'crop',
          autoCropArea: 0.8,
          restore: false,
          guides: true,
          center: true,
          highlight: true,
          cropBoxMovable: true,
          cropBoxResizable: true,
          toggleDragModeOnDblclick: false,
          background: true,
          responsive: true,
          checkOrientation: true,
          checkCrossOrigin: false,
          
          // ✅ CRÍTICO: Solo habilitar botón cuando cropper esté 100% listo
          ready: function() {
            console.log('✅ Cropper is ready!');
            cropperReady = true;
            
            const modalSaveBtn = document.getElementById('modalSaveImage');
            if (modalSaveBtn) {
              modalSaveBtn.disabled = false;
              console.log('Save button enabled');
            }

            // ✅ Actualizar preview inicial
            updateLivePreview();
          },

          // ✅ LIVE PREVIEW: Evento crop para sincronización en tiempo real
          crop: function(event) {
            // Este evento se dispara cada vez que se mueve o redimensiona el crop box
            updateLivePreview();
          }
        });
      } catch (error) {
        console.error('Error initializing cropper:', error);
        cropperReady = false;
        
        const cropperContainer = document.getElementById('cropperContainer');
        if (cropperContainer) {
          cropperContainer.style.display = 'none';
        }
        
        Swal.fire({
          icon: 'error',
          title: 'Error al inicializar editor',
          text: 'No se pudo cargar el editor de imágenes. Intenta con otra imagen.'
        });
      }
    };

    // Manejar errores de carga
    imageElement.onerror = function(error) {
      console.error('Error loading image:', error);
      cropperReady = false;
      
      const modalSaveBtn = document.getElementById('modalSaveImage');
      if (modalSaveBtn) {
        modalSaveBtn.disabled = true;
      }
    };
  }


  function destroyCropper() {
    // ✅ Destruir instancia de cropper
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }

    // ✅ Resetear bandera de estado
    cropperReady = false;

    const cropperContainer = document.getElementById('cropperContainer');
    const cropperImage = document.getElementById('cropperImage');
    
    if (cropperContainer) {
      cropperContainer.style.display = 'none';
    }

    // Limpiar imagen del cropper
    if (cropperImage) {
      cropperImage.src = '';
      cropperImage.onload = null;
      cropperImage.onerror = null;
    }

    const modalSaveBtn = document.getElementById('modalSaveImage');
    if (modalSaveBtn) {
      modalSaveBtn.disabled = true;
    }

    const modalReplaceInput = document.getElementById('modalImageReplace');
    if (modalReplaceInput) {
      modalReplaceInput.value = '';
    }

    currentImageFile = null;
  }

  async function saveCroppedImage() {
    // ✅ VALIDACIÓN 1: Verificar que exista instancia de cropper
    if (!cropperInstance) {
      Swal.fire({
        icon: 'warning',
        title: 'No hay imagen',
        text: 'Por favor, selecciona una imagen primero'
      });
      return;
    }

    // ✅ VALIDACIÓN 2: Verificar que el cropper esté completamente listo
    if (!cropperReady) {
      Swal.fire({
        icon: 'warning',
        title: 'Espera un momento',
        text: 'El editor de imágenes aún está cargando. Por favor, espera unos segundos e intenta de nuevo.',
        confirmButtonText: 'Entendido'
      });
      return;
    }

    // ✅ VALIDACIÓN 3: Verificar que haya un slide seleccionado
    if (!currentEditingSlide) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se ha seleccionado ningún slide para editar'
      });
      return;
    }

    showLoading(true);

    try {
      // Verificar que el cropper tenga datos de imagen válidos
      const imageData = cropperInstance.getImageData();
      if (!imageData || !imageData.naturalWidth) {
        throw new Error('El editor de imágenes no tiene datos válidos. Por favor, recarga la página e intenta de nuevo.');
      }

      console.log('Image data valid:', imageData.naturalWidth, 'x', imageData.naturalHeight);

      // Obtener canvas recortado con configuración robusta
      const canvas = cropperInstance.getCroppedCanvas({
        width: 1600,
        height: 900,
        minWidth: 800,
        minHeight: 450,
        maxWidth: 3200,
        maxHeight: 1800,
        fillColor: '#fff',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
      });

      // Verificar que el canvas se generó correctamente
      if (!canvas) {
        throw new Error('No se pudo generar el canvas. Posibles causas:\n\n' +
          '• La imagen puede tener restricciones CORS\n' +
          '• La imagen no se ha cargado completamente\n' +
          '• El área de recorte es inválida\n\n' +
          'Intenta recargar la página y volver a intentar.');
      }

      console.log('Canvas generated successfully:', canvas.width, 'x', canvas.height);

      // Convertir canvas a blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error('No se pudo generar la imagen recortada');
        }

        // ✅ PREVIEW LOCAL INMEDIATO: Crear URL temporal del blob
        const localBlobUrl = URL.createObjectURL(blob);
        console.log('Local blob URL created for instant preview:', localBlobUrl);
        
        // ✅ Actualizar preview ANTES de subir al servidor
        syncImageToPreview(currentEditingSlide, localBlobUrl);

        // Subir imagen recortada a Cloudinary
        const token = localStorage.getItem('razoconnect_admin_token');
        const formData = new FormData();
        
        // Generar nombre de archivo
        const fileName = currentImageFile && currentImageFile.name 
          ? currentImageFile.name 
          : `hero_slide_${currentEditingSlide}_${Date.now()}.jpg`;
        
        formData.append('image', blob, fileName);

        const response = await fetch('/api/admin/landing/upload-image', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.message || 'Error al subir imagen');
        }

        const imageUrl = data.data.url;
        
        // Actualizar input y preview
        const imageInput = document.getElementById(`hero_slide_${currentEditingSlide}_image`);
        if (imageInput) {
          imageInput.value = imageUrl;
          showImagePreview(currentEditingSlide, imageUrl);
        }

        // Trigger auto-save
        triggerAutoSave();

        // Cerrar modal
        if (imageEditModal) {
          imageEditModal.hide();
        }

        showLoading(false);

        Swal.fire({
          icon: 'success',
          title: '¡Imagen guardada!',
          text: 'La imagen recortada se ha guardado correctamente',
          timer: 2000,
          showConfirmButton: false
        });

        currentEditingSlide = null;
      }, 'image/jpeg', 0.95);

    } catch (error) {
      console.error('Error saving cropped image:', error);
      showLoading(false);
      
      Swal.fire({
        icon: 'error',
        title: 'Error al guardar',
        text: error.message || 'No se pudo guardar la imagen recortada'
      });
    }
  }

  function openImageEditModal(slideNumber) {
    currentEditingSlide = slideNumber;
    
    // Get current image URL
    const imageInput = document.getElementById(`hero_slide_${slideNumber}_image`);
    const currentImageUrl = imageInput ? imageInput.value : null;
    
    // Reset modal state first
    destroyCropper();
    
    // Get modal elements - with null checks
    const cropperContainer = document.getElementById('cropperContainer');
    const cropperImage = document.getElementById('cropperImage');
    const modalSaveBtn = document.getElementById('modalSaveImage');
    
    if (!cropperContainer || !cropperImage) {
      console.error('Modal elements not found:', { cropperContainer, cropperImage });
      return;
    }
    
    // If there's a current image, load it immediately
    if (currentImageUrl && currentImageUrl.trim() !== '') {
      // Show cropper container
      cropperContainer.style.display = 'block';
      
      // ✅ Deshabilitar botón hasta que cropper esté listo
      if (modalSaveBtn) {
        modalSaveBtn.disabled = true;
      }
      
      // ✅ Usar función robusta de inicialización
      initializeCropper(cropperImage, currentImageUrl);
    } else {
      // No image yet - show placeholder state
      cropperContainer.style.display = 'none';
      if (modalSaveBtn) {
        modalSaveBtn.disabled = true;
      }
    }
    
    // Open modal
    if (imageEditModal) {
      imageEditModal.show();
    }
  }

  // ============================================
  // WARN BEFORE LEAVING WITH UNSAVED CHANGES
  // ============================================

  window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ============================================
  // START APPLICATION
  // ============================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
