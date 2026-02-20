(function () {
  "use strict";

  // Cargar contador de notificaciones para agentes
  async function loadAgenteNotificationCount() {
    try {
      const token = localStorage.getItem('razoconnect_agente_token');
      if (!token) return;

      const response = await fetch('/api/staff/notificaciones/unread-count', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) return;

      const data = await response.json();
      const count = data.count || 0;

      const badge = document.getElementById('notificationBadgeAgente');

      if (badge) {
        if (count > 0) {
          badge.style.display = 'block';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('Error cargando notificaciones de agente:', error);
    }
  }

  // Inicializar cuando el DOM esté listo
  document.addEventListener('DOMContentLoaded', () => {
    // Cargar contador inicial
    loadAgenteNotificationCount();
    
    // Actualizar cada 30 segundos
    setInterval(loadAgenteNotificationCount, 30000);
  });

  // Exponer función globalmente para uso manual
  window.loadAgenteNotificationCount = loadAgenteNotificationCount;
})();
