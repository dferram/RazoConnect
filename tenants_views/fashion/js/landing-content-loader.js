/**
 * Landing Content Loader - VERSIÓN DINÁMICA CON BOTONES INTELIGENTES
 * Carga contenido dinámico desde la API para inicio.html
 * 
 * CARACTERÍSTICAS:
 * - Carga contenido con cache-busting
 * - Inyecta textos en elementos por ID
 * - Genera URLs inteligentes según tipo de botón (categoría, filtro, estático)
 * - Crea botones extra dinámicamente desde array
 * - Aplica estilos de Bootstrap automáticamente
 */

(async function loadLandingContent() {
  'use strict';

  console.log('═══════════════════════════════════════════════════');
  console.log('🚀 CARGANDO CONTENIDO DINÁMICO DESDE CMS');
  console.log('═══════════════════════════════════════════════════');

  try {
    // ✅ CACHE BUSTING: Agregar timestamp para evitar caché del navegador
    const timestamp = Date.now();
    const apiUrl = `/api/public/landing-content?t=${timestamp}`;
    
    console.log('📡 Fetching landing content from API...');
    console.log('🔗 URL:', apiUrl);

    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();

    if (!data.success || !data.data) {
      console.error('❌ Failed to load landing content:', data);
      return;
    }

    const content = data.data;
    console.log('✅ Contenido cargado desde la base de datos');
    console.log('📦 Estructura del JSON:', JSON.stringify(content, null, 2));

    // ============================================
    // FUNCIONES AUXILIARES
    // ============================================

    /**
     * Genera URL inteligente según el tipo de botón
     * @param {Object} button - Objeto con tipo, valor y texto del botón
     * @returns {string} - URL generada
     */
    function generateSmartURL(button) {
      if (!button || !button.type) return '#';

      switch (button.type) {
        case 'category':
        case 'categoria':
          // Genera: /catalogo.html?categoria=ID
          return `/catalogo.html?categoria=${button.value}`;
        
        case 'filter':
        case 'filtro':
          // Genera: /catalogo.html?filtro=VALOR
          return `/catalogo.html?${button.filter_key}=${button.value}`;
        
        case 'offer':
        case 'oferta':
          return '/catalogo.html?oferta=true';
        
        case 'new':
        case 'nuevo':
          return '/catalogo.html?sort=newest';
        
        case 'featured':
        case 'destacado':
          return '/catalogo.html?destacado=true';
        
        case 'static':
        case 'estatico':
        case 'url':
          // URL estática directa
          return button.value || button.url || '#';
        
        default:
          console.warn(`⚠️ Tipo de botón desconocido: ${button.type}`);
          return '#';
      }
    }

    /**
     * Crea un botón HTML dinámicamente
     * @param {Object} button - Configuración del botón
     * @param {boolean} isPrimary - Si es el botón principal
     * @returns {HTMLElement} - Elemento <a> creado
     */
    function createButton(button, isPrimary = false) {
      const link = document.createElement('a');
      link.href = generateSmartURL(button);
      link.textContent = button.text || button.cta_text || 'Ver más';
      
      // Aplicar clases de Bootstrap
      if (isPrimary) {
        link.className = 'hero-cta btn btn-primary';
      } else {
        link.className = 'hero-cta btn btn-outline-light ms-2';
      }
      
      // Atributos de accesibilidad
      link.setAttribute('aria-label', button.text || 'Ver más');
      
      return link;
    }

    // ============================================
    // HERO SLIDER - Actualizar los 3 slides
    // ============================================
    
    console.log('\n🎠 PROCESANDO HERO SLIDER...');
    
    for (let i = 1; i <= 3; i++) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🔍 PROCESANDO SLIDE ${i}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      
      const slideData = content[`hero_slide_${i}`];
      if (!slideData) {
        console.warn(`⚠️ No hay datos para slide ${i}`);
        continue;
      }

      console.log(`📦 Datos del slide ${i}:`, slideData);
      // ═══════════════════════════════════════════
      // 1. ACTUALIZAR IMAGEN DE FONDO
      // ═══════════════════════════════════════════
      if (slideData.image) {
        const heroSlide = document.getElementById(`hero-slide-${i}`);
        if (heroSlide) {
          heroSlide.style.backgroundImage = `url('${slideData.image}')`;
          console.log(`✅ Imagen de fondo actualizada: ${slideData.image}`);
        }
      }

      // ═══════════════════════════════════════════
      // 2. ACTUALIZAR TEXTOS POR ID
      // ═══════════════════════════════════════════
      
      // Eyebrow (texto superior)
      const eyebrowEl = document.getElementById(`slide${i}-eyebrow`);
      if (eyebrowEl && slideData.eyebrow) {
        eyebrowEl.textContent = slideData.eyebrow;
        console.log(`✅ Eyebrow: "${slideData.eyebrow}"`);
      }

      // Título principal
      const titleEl = document.getElementById(`slide${i}-title`);
      if (titleEl && slideData.title) {
        titleEl.textContent = slideData.title;
        console.log(`✅ Título: "${slideData.title}"`);
      }

      // Descripción
      const descEl = document.getElementById(`slide${i}-description`);
      if (descEl && slideData.description) {
        descEl.textContent = slideData.description;
        console.log(`✅ Descripción: "${slideData.description}"`);
      }

      // ═══════════════════════════════════════════
      // 3. BOTÓN PRINCIPAL CON URL INTELIGENTE
      // ═══════════════════════════════════════════
      const primaryBtn = document.getElementById(`slide${i}-btn-primary`);
      if (primaryBtn && slideData.cta) {
        primaryBtn.textContent = slideData.cta.text || slideData.cta_text || 'Ver más';
        primaryBtn.href = generateSmartURL(slideData.cta);
        console.log(`✅ Botón principal: "${primaryBtn.textContent}" → ${primaryBtn.href}`);
      }

      // ═══════════════════════════════════════════
      // 4. BOTONES EXTRA DINÁMICOS
      // ═══════════════════════════════════════════
      const extraButtonsContainer = document.getElementById(`slide${i}-extra-buttons`);
      if (extraButtonsContainer && slideData.extra_buttons && Array.isArray(slideData.extra_buttons)) {
        // Limpiar botones previos
        extraButtonsContainer.innerHTML = '';
        
        console.log(`🔘 Generando ${slideData.extra_buttons.length} botones extra...`);
        
        slideData.extra_buttons.forEach((buttonConfig, index) => {
          const button = createButton(buttonConfig, false);
          extraButtonsContainer.appendChild(button);
          console.log(`   ✅ Botón ${index + 1}: "${buttonConfig.text}" → ${button.href}`);
        });
      }

      console.log(`✅ Slide ${i} completado`);
    }

    // ============================================
    // SECCIONES ADICIONALES (si existen en tu HTML)
    // ============================================

    // Ejemplo: Actualizar título de sección de categorías
    if (content.categories_section_title) {
      const categoriesTitle = document.querySelector('#categories-section .section-title');
      if (categoriesTitle) {
        categoriesTitle.textContent = content.categories_section_title;
        console.log('✅ Categories section title updated');
      }
    }

    // Ejemplo: Actualizar título de sección de productos destacados
    if (content.featured_section_title) {
      const featuredTitle = document.querySelector('#featured-section .section-title');
      if (featuredTitle) {
        featuredTitle.textContent = content.featured_section_title;
        console.log('✅ Featured section title updated');
      }
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('🎉 CONTENIDO DINÁMICO APLICADO EXITOSAMENTE');
    console.log('═══════════════════════════════════════════════════');
    console.log('🚀 Landing page actualizada desde el CMS');
    console.log('\n💡 CARACTERÍSTICAS ACTIVAS:');
    console.log('   ✅ Textos dinámicos por ID');
    console.log('   ✅ Imágenes de fondo desde Cloudinary');
    console.log('   ✅ URLs inteligentes (categoría/filtro/estático)');
    console.log('   ✅ Botones extra generados dinámicamente');
    console.log('═══════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('═══════════════════════════════════════════════════');
    console.error('❌ ERROR AL CARGAR CONTENIDO DINÁMICO');
    console.error('═══════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.warn('⚠️ La página mostrará contenido estático como fallback');
    console.error('═══════════════════════════════════════════════════');
    // No mostrar error al usuario, usar contenido estático como fallback
  }
})();
