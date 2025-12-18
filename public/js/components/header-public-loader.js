(function () {
  "use strict";

  async function cargarHeaderPublico() {
    const container = document.getElementById("header-container");
    if (!container) return;

    try {
      const res = await fetch("/components/header-public.html", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      if (!res.ok) {
        throw new Error(`No se pudo cargar header: ${res.status}`);
      }

      const html = await res.text();
      container.innerHTML = html;

      const height = container.firstElementChild?.offsetHeight;
      if (height && Number.isFinite(height) && height > 0) {
        document.body.style.paddingTop = `${height}px`;
      } else {
        document.body.style.paddingTop = "72px";
      }
    } catch (error) {
      console.error("Error cargando header público:", error);
    }
  }

  window.cargarHeaderPublico = cargarHeaderPublico;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cargarHeaderPublico);
  } else {
    cargarHeaderPublico();
  }
})();
