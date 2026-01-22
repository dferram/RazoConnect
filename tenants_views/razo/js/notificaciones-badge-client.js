(function () {
  "use strict";

  async function actualizarBadgeNotificaciones() {
    const badge = document.getElementById("badgeNotificaciones");
    if (!badge) return;

    const token = localStorage.getItem("razoconnect_token");
    if (!token) {
      badge.classList.add("d-none");
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
        badge.classList.add("d-none");
        return;
      }

      const data = await response.json();
      const count = Number.parseInt(data?.count, 10) || 0;

      if (count > 0) {
        badge.classList.remove("d-none");
      } else {
        badge.classList.add("d-none");
      }
    } catch (error) {
      badge.classList.add("d-none");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", actualizarBadgeNotificaciones);
  } else {
    actualizarBadgeNotificaciones();
  }
})();
