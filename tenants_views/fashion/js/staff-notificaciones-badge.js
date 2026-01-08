(function () {
  "use strict";

  function getTokenStaff() {
    return (
      localStorage.getItem("razoconnect_admin_token") ||
      localStorage.getItem("razoconnect_token") ||
      null
    );
  }

  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) {
      el.classList.add("d-none");
    } else {
      el.classList.remove("d-none");
    }
  }

  async function actualizarIndicadoresNotificacionesStaff() {
    const indicador = document.getElementById("indicadorAlertaUsuario");
    const badge = document.getElementById("badgeNotifMenu");

    if (!indicador && !badge) return;

    const token = getTokenStaff();
    if (!token) {
      setHidden(indicador, true);
      setHidden(badge, true);
      return;
    }

    try {
      const res = await fetch("/api/staff/notificaciones/unread-count", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setHidden(indicador, true);
        setHidden(badge, true);
        return;
      }

      const count = Number.parseInt(data?.count, 10) || 0;

      if (count > 0) {
        if (badge) {
          badge.textContent = String(count);
        }
        setHidden(indicador, false);
        setHidden(badge, false);
      } else {
        setHidden(indicador, true);
        setHidden(badge, true);
      }
    } catch (error) {
      console.error("Error obteniendo conteo de notificaciones staff:", error);
      setHidden(indicador, true);
      setHidden(badge, true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      actualizarIndicadoresNotificacionesStaff
    );
  } else {
    actualizarIndicadoresNotificacionesStaff();
  }

  window.actualizarIndicadoresNotificacionesStaff =
    actualizarIndicadoresNotificacionesStaff;
})();
