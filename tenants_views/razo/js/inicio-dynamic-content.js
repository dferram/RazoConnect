/**
 * RazoConnect - Dynamic Landing Content Loader
 * Loads content from API and integrates with seasonal themes
 * @version 1.0.0
 */

(function () {
  'use strict';

  // ============================================
  // GLOBAL STATE
  // ============================================

  let dynamicContentLoaded = false;
  let currentDynamicConfig = null;

  // ============================================
  // LOAD DYNAMIC CONTENT FROM API
  // ============================================

  async function loadDynamicContent() {
    try {
      const isPreview = new URLSearchParams(window.location.search).get('preview') === 'true';
      const token = localStorage.getItem('razoconnect_admin_token');

      const headers = {};
      if (isPreview && token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const url = `/api/public/landing-content${isPreview ? '?preview=true' : ''}`;
      const response = await fetch(url, { headers });

      const data = await response.json();

      if (!data.success) {
        console.warn('Failed to load dynamic content, using defaults');
        return null;
      }

      currentDynamicConfig = data.data.config;
      dynamicContentLoaded = true;

      if (data.data.isPreview) {
        console.log('🔍 Preview mode enabled - showing draft content');
      }

      return currentDynamicConfig;
    } catch (error) {
      console.error('Error loading dynamic content:', error);
      return null;
    }
  }

  // ============================================
  // APPLY DYNAMIC CONTENT TO PAGE
  // ============================================

  function applyDynamicContent(config) {
    if (!config) return;

    applyHeroSlides(config);
    applyCategorySections(config);
  }

  // ============================================
  // APPLY HERO SLIDES
  // ============================================

  function applyHeroSlides(config) {
    const heroSlides = document.querySelectorAll('.hero-slide');

    for (let i = 1; i <= 3; i++) {
      const slide = heroSlides[i - 1];
      if (!slide) continue;

      const imageUrl = config[`hero_slide_${i}_image`]?.value;
      const eyebrowText = config[`hero_slide_${i}_eyebrow`]?.value;
      const titleText = config[`hero_slide_${i}_title`]?.value;
      const descText = config[`hero_slide_${i}_description`]?.value;
      const ctaText = config[`hero_slide_${i}_cta_text`]?.value;
      const ctaLink = config[`hero_slide_${i}_cta_link`]?.value;

      if (imageUrl) {
        slide.style.backgroundImage = `url('${imageUrl}')`;
      }

      const eyebrow = slide.querySelector('.hero-eyebrow');
      const title = slide.querySelector('.hero-title');
      const description = slide.querySelector('.hero-description');
      const cta = slide.querySelector('.hero-cta');

      if (eyebrow && eyebrowText) eyebrow.textContent = eyebrowText;
      if (title && titleText) title.textContent = titleText;
      if (description && descText) description.textContent = descText;
      if (cta) {
        if (ctaText) cta.textContent = ctaText;
        if (ctaLink) cta.href = ctaLink;
      }
    }
  }

  // ============================================
  // APPLY CATEGORY SECTIONS
  // ============================================

  function applyCategorySections(config) {
    const ofertasCategory = config['section_ofertas_category']?.value;
    const nuevosCategory = config['section_nuevos_category']?.value;

    if (ofertasCategory && window.RazoConnectInicio?.loadFlashSales) {
      window.RazoConnectInicio.loadFlashSales(ofertasCategory);
    }

    if (nuevosCategory && window.RazoConnectInicio?.loadNewArrivals) {
      window.RazoConnectInicio.loadNewArrivals(nuevosCategory);
    }
  }

  // ============================================
  // INTEGRATE WITH SEASONAL THEME SYSTEM
  // ============================================

  function integrateWithSeasonalSystem() {
    document.addEventListener('razo:themeChanged', (event) => {
      if (currentDynamicConfig) {
        applyDynamicContent(currentDynamicConfig);
      }
    });
  }

  // ============================================
  // LISTEN FOR PREVIEW RELOAD MESSAGES
  // ============================================

  function setupPreviewListener() {
    window.addEventListener('message', (event) => {
      if (event.data === 'reload-preview') {
        window.location.reload();
      }
    });
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  async function init() {
    try {
      const config = await loadDynamicContent();
      
      if (config) {
        applyDynamicContent(config);
      }

      integrateWithSeasonalSystem();
      setupPreviewListener();
    } catch (error) {
      console.error('Error initializing dynamic content:', error);
    }
  }

  // ============================================
  // EXPOSE API FOR SEASONAL SYSTEM
  // ============================================

  window.RazoDynamicContent = {
    getCurrentConfig: () => currentDynamicConfig,
    isLoaded: () => dynamicContentLoaded,
    reload: async () => {
      const config = await loadDynamicContent();
      if (config) {
        applyDynamicContent(config);
      }
      return config;
    }
  };

  // ============================================
  // START APPLICATION
  // ============================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
