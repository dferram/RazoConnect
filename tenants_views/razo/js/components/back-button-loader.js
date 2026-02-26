/**
 * Back Button Component Loader
 * Carga el botón de volver estandarizado y configura su funcionalidad
 */

(function() {
  'use strict';

  /**
   * Carga el componente del botón de volver
   * @param {Object} options - Opciones de configuración
   * @param {string} options.backUrl - URL a la que debe regresar (requerido)
   * @param {string} options.backText - Texto del botón (opcional, default: "Volver")
   * @param {string} options.containerId - ID del contenedor donde se insertará (default: "back-button-container")
   */
  window.loadBackButton = function(options = {}) {
    const { 
      backUrl, 
      backText = 'Volver',
      containerId = 'back-button-container'
    } = options;

    if (!backUrl) {
      console.error('❌ [Back Button] backUrl es requerido');
      return;
    }

    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`❌ [Back Button] Contenedor #${containerId} no encontrado`);
      return;
    }

    // Cargar el componente
    fetch('/components/back-button.html')
      .then(response => {
        if (!response.ok) throw new Error('Error al cargar back-button.html');
        return response.text();
      })
      .then(html => {
        container.innerHTML = html;

        // Configurar el texto del botón
        const backTextElement = container.querySelector('.back-text');
        if (backTextElement && backText !== 'Volver') {
          backTextElement.textContent = backText;
        }

        // Configurar el evento click
        const btnBack = container.querySelector('#btnVolverStandard');
        if (btnBack) {
          btnBack.addEventListener('click', function() {
            // Marcar navegación para evitar alertas de cambios no guardados
            sessionStorage.setItem('_navigating', 'true');
            localStorage.setItem('_nav_timestamp', Date.now().toString());
            
            // Navegar a la URL especificada
            window.location.href = backUrl;
          });
        }

        console.log(`✅ [Back Button] Cargado correctamente - Destino: ${backUrl}`);
      })
      .catch(error => {
        console.error('❌ [Back Button] Error al cargar:', error);
        // Fallback: crear botón básico
        container.innerHTML = `
          <div class="back-button-container">
            <button type="button" class="btn btn-secondary" onclick="window.location.href='${backUrl}'">
              <i class="bi bi-arrow-left"></i> ${backText}
            </button>
          </div>
        `;
      });
  };

  console.log('✅ [Back Button Loader] Módulo cargado');
})();
