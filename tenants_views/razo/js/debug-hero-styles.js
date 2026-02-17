/**
 * Script de Diagnóstico - Hero Banner Styles
 * Ejecutar en la consola del navegador para verificar estilos aplicados
 */

(function() {
  console.log('🔍 DIAGNÓSTICO DE ESTILOS DEL HERO BANNER');
  console.log('='.repeat(60));
  
  // 1. Verificar clase del body
  const bodyClasses = document.body.className;
  console.log('1️⃣ Clases del <body>:', bodyClasses);
  
  // 2. Verificar elemento hero-banner
  const heroBanner = document.getElementById('hero-banner');
  if (heroBanner) {
    console.log('2️⃣ Elemento #hero-banner encontrado');
    console.log('   Clases:', heroBanner.className);
  } else {
    console.error('❌ Elemento #hero-banner NO encontrado');
  }
  
  // 3. Verificar slides
  const slides = document.querySelectorAll('.hero-slide');
  console.log(`3️⃣ Slides encontrados: ${slides.length}`);
  
  slides.forEach((slide, index) => {
    console.log(`\n   Slide ${index + 1}:`);
    console.log('   - ID:', slide.id);
    console.log('   - Clases:', slide.className);
    
    // Obtener estilos computados del ::before
    const computedStyle = window.getComputedStyle(slide, '::before');
    const background = computedStyle.getPropertyValue('background');
    const backgroundImage = computedStyle.getPropertyValue('background-image');
    
    console.log('   - Background (::before):', background || backgroundImage);
  });
  
  // 4. Verificar archivos CSS cargados
  console.log('\n4️⃣ Archivos CSS cargados:');
  const stylesheets = Array.from(document.styleSheets);
  stylesheets.forEach((sheet, index) => {
    try {
      const href = sheet.href || 'inline';
      if (href.includes('inicio-new') || href.includes('inicio-seasonal') || href.includes('theme-variables')) {
        console.log(`   ✅ ${href}`);
      }
    } catch (e) {
      // CORS error - ignorar
    }
  });
  
  // 5. Verificar si hay estilos inline
  console.log('\n5️⃣ Estilos inline en slides:');
  slides.forEach((slide, index) => {
    if (slide.style.cssText) {
      console.log(`   Slide ${index + 1}:`, slide.style.cssText);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Diagnóstico completado');
  console.log('💡 Si ves rgba(107, 93, 87) en el background, el CSS viejo está en caché');
  console.log('💡 Si ves rgba(138, 51, 0), el CSS nuevo está aplicado correctamente');
})();
