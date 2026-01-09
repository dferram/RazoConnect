/**
 * xCore Preview Receiver
 * Listens for postMessage events from the landing editor
 * and updates the preview in real-time without database calls
 */

(function() {
  'use strict';

  console.log('🎯 xCore Preview Receiver initialized');

  // Listen for messages from the editor
  window.addEventListener('message', function(event) {
    // Security: In production, validate event.origin
    // For now, we accept all origins since editor and preview are same-origin
    
    if (!event.data || !event.data.type) {
      return;
    }

    const { type, data, slideNumber, imageUrl } = event.data;

    // Handle different message types
    switch (type) {
      case 'XCORE_PREVIEW_UPDATE':
        handlePreviewUpdate(data);
        break;
      
      case 'XCORE_IMAGE_UPDATE':
        handleImageUpdate(slideNumber, imageUrl);
        break;
      
      default:
        // Ignore unknown message types
        break;
    }
  });

  /**
   * Handle full preview update (all slides and sections)
   */
  function handlePreviewUpdate(data) {
    if (!data || !data.slides) {
      console.warn('⚠️ Invalid preview data received');
      return;
    }

    console.log('📥 Received preview update:', data);

    // Update each slide
    data.slides.forEach(slide => {
      updateSlide(slide);
    });

    // Update sections if needed
    if (data.sections) {
      updateSections(data.sections);
    }
  }

  /**
   * Update a single slide with new data
   */
  function updateSlide(slideData) {
    const { slideNumber, image, eyebrow, title, description, ctaText, ctaLink } = slideData;

    // Find slide elements - using multiple selectors for robustness
    const slideElement = document.getElementById(`hero-slide-${slideNumber}`) || 
                        document.querySelector(`.hero-slide:nth-child(${slideNumber})`);

    if (!slideElement) {
      console.warn(`⚠️ Slide ${slideNumber} not found in preview`);
      return;
    }

    // Update background image
    if (image) {
      slideElement.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), url('${image}')`;
      console.log(`✅ Updated slide ${slideNumber} background image`);
    }

    // Update eyebrow text
    const eyebrowEl = slideElement.querySelector('.hero-eyebrow') || 
                     document.getElementById(`slide${slideNumber}-eyebrow`);
    if (eyebrowEl && eyebrow !== undefined) {
      eyebrowEl.textContent = eyebrow;
      eyebrowEl.style.display = eyebrow ? 'block' : 'none';
    }

    // Update title
    const titleEl = slideElement.querySelector('.hero-title') || 
                   document.getElementById(`slide${slideNumber}-title`);
    if (titleEl && title !== undefined) {
      titleEl.textContent = title;
    }

    // Update description
    const descEl = slideElement.querySelector('.hero-description') || 
                  document.getElementById(`slide${slideNumber}-description`);
    if (descEl && description !== undefined) {
      descEl.textContent = description;
      descEl.style.display = description ? 'block' : 'none';
    }

    // Update CTA button
    const ctaEl = slideElement.querySelector('.hero-cta') || 
                 slideElement.querySelector('.btn-primary') ||
                 document.getElementById(`slide${slideNumber}-btn-primary`);
    if (ctaEl) {
      if (ctaText !== undefined) {
        ctaEl.textContent = ctaText;
      }
      if (ctaLink !== undefined) {
        ctaEl.href = ctaLink || '#';
      }
      ctaEl.style.display = ctaText ? 'inline-block' : 'none';
    }

    console.log(`✅ Updated slide ${slideNumber} content`);
  }

  /**
   * Handle immediate image update (for cropper live preview)
   */
  function handleImageUpdate(slideNumber, imageUrl) {
    if (!slideNumber || !imageUrl) {
      console.warn('⚠️ Invalid image update data');
      return;
    }

    console.log(`📥 Received image update for slide ${slideNumber}:`, imageUrl);

    const slideElement = document.getElementById(`hero-slide-${slideNumber}`) || 
                        document.querySelector(`.hero-slide:nth-child(${slideNumber})`);

    if (slideElement) {
      slideElement.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), url('${imageUrl}')`;
      console.log(`✅ Updated slide ${slideNumber} image immediately`);
    } else {
      console.warn(`⚠️ Slide ${slideNumber} not found for image update`);
    }
  }

  /**
   * Update product sections (if needed in the future)
   */
  function updateSections(sections) {
    // This can be extended to handle section updates
    // For now, sections are loaded from the database on page load
    console.log('📦 Section data received:', sections);
  }

  // Notify parent that receiver is ready
  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'XCORE_RECEIVER_READY',
      timestamp: Date.now()
    }, '*');
    console.log('✅ Preview receiver ready, notified parent');
  }

})();
