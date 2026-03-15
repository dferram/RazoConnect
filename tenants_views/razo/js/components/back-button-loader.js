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

    // Crear el componente directamente sin fetch para evitar errores 403
    const html = `
      <!-- Botón de Volver Estandarizado -->
      <div class="back-button-container">
        <button type="button" class="btn-back-standard" id="btnVolverStandard">
          <i class="bi bi-arrow-left"></i>
          <span class="back-text">${backText}</span>
        </button>
      </div>

      <style>
        .back-button-container {
          margin-bottom: 1.5rem;
          padding: 0;
        }

        .btn-back-standard {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1.25rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          color: #374151;
          font-size: 0.9375rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
        }

        .btn-back-standard:hover {
          background: #f9fafb;
          border-color: var(--razo-orange, #F97316);
          color: var(--razo-orange, #F97316);
          transform: translateX(-2px);
        }

        .btn-back-standard:active {
          transform: translateX(-2px) scale(0.98);
        }

        .btn-back-standard i {
          font-size: 1rem;
        }

        .back-text {
          line-height: 1;
        }
      </style>
    `;

    container.innerHTML = html;

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
  };

  console.log('✅ [Back Button Loader] Módulo cargado');
})();
