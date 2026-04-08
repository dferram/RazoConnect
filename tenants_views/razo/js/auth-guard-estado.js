/**
 * 🔒 GUARDIA DE ESTADO - BLOQUEA ACCESO SIN ESTADO ASIGNADO
 * Redirige automáticamente a inicio.html si el usuario intenta acceder a otras páginas sin estado
 */

(function() {
  // Ejecutar antes de cualquier otra cosa
  async function protegerAccesoSinEstado() {
    // Obtener datos del usuario desde localStorage
    const userData = JSON.parse(localStorage.getItem('razoconnect_user') || '{}');
    const currentPage = window.location.pathname;

    // Solo aplicar guardia a páginas protegidas (no en inicio.html ni login)
    if (currentPage.includes('inicio.html') || currentPage === '/' || currentPage.includes('login.html') || currentPage.includes('registro.html')) {
      return;
    }

    // Si el usuario está autenticado, verificar que tiene estado
    if (userData.clienteId) {
      // Primero verificar en localStorage (rápido)
      if (userData.estadoId) {
        console.log('✅ Usuario tiene estado en localStorage');
        return;
      }

      // Si no está en localStorage, verificar con el servidor
      try {
        const token = localStorage.getItem('razoconnect_token');
        if (!token) {
          console.log('⏭️  No hay token, permitiendo acceso');
          return;
        }

        console.log('🔍 Verificando estado en servidor...');
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const serverData = await response.json();
          const userFromServer = serverData.data || {};

          // Actualizar localStorage con datos del servidor
          Object.assign(userData, userFromServer);
          localStorage.setItem('razoconnect_user', JSON.stringify(userData));

          // Si el servidor confirma que tiene estado, permitir acceso
          if (userFromServer.estadoId) {
            console.log(`✅ Usuario tiene estado en BD: ${userFromServer.estadoNombre}`);
            return;
          }
        }
      } catch (error) {
        console.warn('⚠️  Error al verificar estado con servidor:', error);
        // En caso de error, permitir acceso (no bloquear)
        return;
      }

      // Si llegamos aquí, usuario SIN estado - redirigir a inicio
      console.warn('🚫 Acceso denegado: Usuario sin estado asignado');
      console.log(`📍 Redirigiendo desde: ${currentPage}`);

      setTimeout(() => {
        window.location.href = '/inicio.html';
      }, 100);
    }
  }

  // Si el DOM ya está cargado, ejecutar inmediatamente
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', protegerAccesoSinEstado);
  } else {
    protegerAccesoSinEstado();
  }

  // También ejecutar al inicio antes de DOMContentLoaded (para máxima seguridad)
  protegerAccesoSinEstado();
})();
