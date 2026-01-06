/**
 * Landing Content Loader
 * Carga contenido dinámico desde la API para inicio.html
 */

(async function loadLandingContent() {
  'use strict';

  try {
    console.log('Loading landing content from API...');

    // Fetch contenido desde la API
    const response = await fetch('/api/public/landing-content');
    const data = await response.json();

    if (!data.success || !data.data) {
      console.error('Failed to load landing content:', data);
      return;
    }

    const content = data.data;
    console.log('Landing content loaded:', content);

    // ============================================
    // HERO SLIDER - Actualizar los 3 slides
    // ============================================
    
    const carouselItems = document.querySelectorAll('.carousel-item');
    
    for (let i = 1; i <= 3; i++) {
      const slideData = content[`hero_slide_${i}`];
      if (!slideData) continue;

      const carouselItem = carouselItems[i - 1];
      if (!carouselItem) continue;

      // Actualizar imagen de fondo
      if (slideData.image) {
        const img = carouselItem.querySelector('img');
        if (img) {
          img.src = slideData.image;
          img.alt = slideData.title || `Slide ${i}`;
        }
      }

      // Actualizar texto eyebrow (texto superior)
      if (slideData.eyebrow) {
        const eyebrow = carouselItem.querySelector('.hero-eyebrow');
        if (eyebrow) {
          eyebrow.textContent = slideData.eyebrow;
        }
      }

      // Actualizar título principal
      if (slideData.title) {
        const title = carouselItem.querySelector('.hero-title');
        if (title) {
          title.textContent = slideData.title;
        }
      }

      // Actualizar descripción
      if (slideData.description) {
        const description = carouselItem.querySelector('.hero-description');
        if (description) {
          description.textContent = slideData.description;
        }
      }

      // Actualizar botón CTA
      if (slideData.cta_text || slideData.cta_link) {
        const ctaButton = carouselItem.querySelector('.btn-primary');
        if (ctaButton) {
          if (slideData.cta_text) {
            ctaButton.textContent = slideData.cta_text;
          }
          if (slideData.cta_link) {
            ctaButton.href = slideData.cta_link;
          }
        }
      }

      console.log(`Slide ${i} updated successfully`);
    }

    // ============================================
    // SECCIONES ADICIONALES (si existen en tu HTML)
    // ============================================

    // Ejemplo: Actualizar título de sección de categorías
    if (content.categories_section_title) {
      const categoriesTitle = document.querySelector('#categories-section .section-title');
      if (categoriesTitle) {
        categoriesTitle.textContent = content.categories_section_title;
      }
    }

    // Ejemplo: Actualizar título de sección de productos destacados
    if (content.featured_section_title) {
      const featuredTitle = document.querySelector('#featured-section .section-title');
      if (featuredTitle) {
        featuredTitle.textContent = content.featured_section_title;
      }
    }

    console.log('✅ Landing content loaded and applied successfully');

  } catch (error) {
    console.error('Error loading landing content:', error);
    // No mostrar error al usuario, usar contenido estático como fallback
  }
})();
