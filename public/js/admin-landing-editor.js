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

  // ============================================
  // INITIALIZATION
  // ============================================

  async function init() {
    showLoading(true);
    
    try {
      await Promise.all([
        loadConfig(),
        loadCategories()
      ]);

      setupEventListeners();
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

  async function loadConfig() {
    try {
      const token = localStorage.getItem('razoconnect_admin_token');
      const response = await fetch('/api/admin/landing/config', {
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
        currentConfig[item.section_key] = {
          value_draft: item.value_draft,
          value_published: item.value_published,
          content_type: item.content_type
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

      uploadArea.addEventListener('click', () => {
        fileInput.click();
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
    uploadArea.innerHTML = `
      <img src="${imageUrl}" alt="Preview Slide ${slideNumber}" class="image-preview" />
    `;
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

    for (let i = 1; i <= 3; i++) {
      const fields = [
        'image', 'eyebrow', 'title', 'description', 'cta_text', 'cta_link'
      ];

      fields.forEach(field => {
        const key = `hero_slide_${i}_${field}`;
        const element = document.getElementById(key);
        if (element) {
          updates.push({
            section_key: key,
            value: element.value || null
          });
        }
      });
    }

    const ofertasCategory = document.getElementById('section_ofertas_category');
    if (ofertasCategory) {
      updates.push({
        section_key: 'section_ofertas_category',
        value: ofertasCategory.value || null
      });
    }

    const nuevosCategory = document.getElementById('section_nuevos_category');
    if (nuevosCategory) {
      updates.push({
        section_key: 'section_nuevos_category',
        value: nuevosCategory.value || null
      });
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
