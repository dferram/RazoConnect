(function () {
  "use strict";

  async function actualizarBadgeNotificaciones() {
    const badge = document.getElementById("badgeNotificacionesCliente");
    const bell = document.querySelector("#notificationLinkCliente i");
    
    if (!badge) return;

    const token = localStorage.getItem("razoconnect_token");
    if (!token) {
      badge.style.display = "none";
      return;
    }

    try {
      const response = await fetch("/api/cliente/notificaciones/count", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        badge.style.display = "none";
        return;
      }

      const data = await response.json();
      const count = Number.parseInt(data?.count, 10) || 0;

      if (count > 0) {
        badge.style.display = "block";
        if (bell) bell.style.color = "#F97316";
      } else {
        badge.style.display = "none";
        if (bell) bell.style.color = "#6B7280";
      }
    } catch (error) {
      badge.style.display = "none";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      actualizarBadgeNotificaciones();
      // Actualizar cada 30 segundos
      setInterval(actualizarBadgeNotificaciones, 30000);
    });
  } else {
    actualizarBadgeNotificaciones();
    // Actualizar cada 30 segundos
    setInterval(actualizarBadgeNotificaciones, 30000);
  }

  // Exponer función globalmente
  window.actualizarBadgeNotificaciones = actualizarBadgeNotificaciones;
})();
