/**
 * 🔒 GUARDIA DE ESTADO - BLOQUEA ACCESO SIN ESTADO ASIGNADO
 * Redirige automáticamente a inicio.html si el usuario intenta acceder a otras páginas sin estado
 */

(function() {
  // Ejecutar antes de cualquier otra cosa
  function protegerAccesoSinEstado() {
    // Obtener datos del usuario
    const userData = JSON.parse(localStorage.getItem('razoconnect_user') || '{}');

    // Si el usuario está autenticado pero SIN estado, y NO está en inicio.html
    if (userData.clienteId && !userData.estadoId) {
      const currentPage = window.location.pathname;

      // Solo redirigir si NO está ya en inicio.html (para evitar loops)
      if (!currentPage.includes('inicio.html') && currentPage !== '/') {
        console.warn('🚫 Acceso denegado: Usuario sin estado asignado');
        console.log(`📍 Redirigiendo desde: ${currentPage}`);

        // Redirigir a inicio.html después de un pequeño delay
        setTimeout(() => {
          window.location.href = '/inicio.html';
        }, 100);
      }
    }
  }

  // Si el DOM ya está cargado, ejecutar inmediatamente
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', protegerAccesoSinEstado);
  } else {
    protegerAccesoSinEstado();
  }

  // También ejecutar al inicio antes de DOMContentLoaded (para mayor seguridad)
  protegerAccesoSinEstado();
})();
