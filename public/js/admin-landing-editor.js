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
  let currentImageFile = null;

  // ============================================
  // INITIALIZATION
  // ============================================

  async function init() {
    showLoading(true);
    
    try {
      imageEditModal = new bootstrap.Modal(document.getElementById('imageEditModal'));
      
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
      const token = localStorage.getItem('razoconnect_admin_token');
      const response = await fetch('/api/admin/landing/categories', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Error al cargar categorías');
      }

      categories = data.data;
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
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================

  function setupEventListeners() {
    setupImageUploads();
    setupFormInputs();
    setupActionButtons();
  }

  // ============================================
  // IMAGE UPLOAD HANDLERS
  // ============================================

  function setupImageUploads() {
    for (let i = 1; i <= 3; i++) {
      const uploadArea = document.getElementById(`uploadArea${i}`);
      const fileInput = document.getElementById(`imageInput${i}`);

      if (!uploadArea || !fileInput) continue;

      uploadArea.addEventListener('click', (e) => {
        if (uploadArea.classList.contains('has-image')) {
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

    uploadArea.classList.add('has-image');
    uploadArea.style.cursor = 'pointer';
    uploadArea.style.position = 'relative';
    uploadArea.innerHTML = `
      <img src="${imageUrl}" alt="Preview Slide ${slideNumber}" class="image-preview" />
      <div style="position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(0,0,0,0.7); color: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem;">
        <i class="bi bi-pencil"></i> Editar
      </div>
    `;
    
    // Re-attach click handler after innerHTML change
    uploadArea.addEventListener('click', (e) => {
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
    const zoomSlider = document.getElementById('zoomSlider');
    const zoomIn = document.getElementById('zoomIn');
    const zoomOut = document.getElementById('zoomOut');

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

    // Controles de zoom
    if (zoomSlider) {
      zoomSlider.addEventListener('input', (e) => {
        if (cropperInstance) {
          cropperInstance.zoomTo(parseFloat(e.target.value));
        }
      });
    }

    if (zoomIn) {
      zoomIn.addEventListener('click', () => {
        if (cropperInstance) {
          cropperInstance.zoom(0.1);
          updateZoomSlider();
        }
      });
    }

    if (zoomOut) {
      zoomOut.addEventListener('click', () => {
        if (cropperInstance) {
          cropperInstance.zoom(-0.1);
          updateZoomSlider();
        }
      });
    }

    // Limpiar cropper al cerrar modal
    const modal = document.getElementById('imageEditModal');
    if (modal) {
      modal.addEventListener('hidden.bs.modal', destroyCropper);
    }
  }

  function handleImageSelection(e) {
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

    currentImageFile = file;
    const reader = new FileReader();

    reader.onload = (event) => {
      const cropperImage = document.getElementById('cropperImage');
      const cropperContainer = document.getElementById('cropperContainer');
      const modalSaveBtn = document.getElementById('modalSaveImage');

      if (cropperImage && cropperContainer) {
        cropperImage.src = event.target.result;
        cropperContainer.style.display = 'block';
        
        // Habilitar botón de guardar
        if (modalSaveBtn) {
          modalSaveBtn.disabled = false;
        }

        // Destruir instancia anterior si existe
        destroyCropper();

        // Inicializar Cropper.js con aspect ratio 16:9
        cropperInstance = new Cropper(cropperImage, {
          aspectRatio: 16 / 9,
          viewMode: 2,
          dragMode: 'move',
          autoCropArea: 1,
          restore: false,
          guides: true,
          center: true,
          highlight: false,
          cropBoxMovable: false,
          cropBoxResizable: false,
          toggleDragModeOnDblclick: false,
          ready: function() {
            updateZoomSlider();
          },
          zoom: function() {
            updateZoomSlider();
          }
        });
      }
    };

    reader.readAsDataURL(file);
  }

  function updateZoomSlider() {
    if (!cropperInstance) return;
    
    const imageData = cropperInstance.getImageData();
    const containerData = cropperInstance.getContainerData();
    
    // Calcular zoom actual (0 a 1)
    const currentZoom = imageData.width / imageData.naturalWidth;
    const maxZoom = 3; // Zoom máximo 3x
    const normalizedZoom = Math.min(currentZoom / maxZoom, 1);
    
    const zoomSlider = document.getElementById('zoomSlider');
    if (zoomSlider) {
      zoomSlider.value = normalizedZoom;
    }
  }

  function destroyCropper() {
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }

    const cropperContainer = document.getElementById('cropperContainer');
    if (cropperContainer) {
      cropperContainer.style.display = 'none';
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
    if (!cropperInstance || !currentEditingSlide) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No hay imagen para guardar'
      });
      return;
    }

    showLoading(true);

    try {
      // Obtener canvas recortado
      const canvas = cropperInstance.getCroppedCanvas({
        width: 1600,
        height: 900,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
      });

      // Convertir canvas a blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error('No se pudo generar la imagen recortada');
        }

        // Subir imagen recortada a Cloudinary
        const token = localStorage.getItem('razoconnect_admin_token');
        const formData = new FormData();
        formData.append('image', blob, currentImageFile.name);

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
    
    // Reset modal state
    destroyCropper();
    
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
