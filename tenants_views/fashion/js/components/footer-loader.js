(function () {
  "use strict";

  async function cargarFooter() {
    const container = document.getElementById("footer-container");
    if (!container) return;

    try {
      const res = await fetch("components/footer.html", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
      if (!res.ok) {
        throw new Error(`No se pudo cargar footer: ${res.status}`);
      }

      const html = await res.text();
      container.innerHTML = html;
    } catch (error) {
      console.error("Error cargando footer:", error);
    }
  }

  window.cargarFooter = cargarFooter;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cargarFooter);
  } else {
    cargarFooter();
  }
})();
