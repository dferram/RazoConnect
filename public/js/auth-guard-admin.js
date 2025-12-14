/**
 * ADMIN AUTH GUARD
 * Protege las páginas de administrador
 * Este script debe cargarse al inicio de cada página de admin
 */

(function () {
  "use strict";

  // Aliases legacy para evitar crashes si se removieron IDs del navbar en alguna pantalla.
  // Se inyecta en <head> para que exista antes de que corran scripts inline al final del body.
  (function ensureLegacyHeaderAliases() {
    try {
      if (document.getElementById("adminHeaderLegacyAliases")) return;

      const wrapper = document.createElement("div");
      wrapper.id = "adminHeaderLegacyAliases";
      wrapper.style.display = "none";
      wrapper.innerHTML = `
        <span id="adminHeaderTitle"></span>
        <span id="admin-name"></span>
        <span id="userName"></span>
        <span id="userRole"></span>
        <span id="userAvatar"></span>
      `;

      (document.head || document.documentElement).appendChild(wrapper);
    } catch (e) {
      // ignore
    }
  })();

  const adminToken = localStorage.getItem("razoconnect_admin_token");

  // Si no hay token, redirigir sin mostrar alerta (usuario no ha iniciado sesión)
  if (!adminToken) {
    console.warn("No admin token found. Redirecting to login...");
    window.location.replace("/login.html");
    return;
  }

  // Verificar token con el servidor de forma asíncrona
  const apiBaseUrl = window.API_BASE_URL || "http://localhost:3000/api";

  console.log("🔐 Verificando autenticación de admin...");
  console.log("Token:", adminToken ? "Present" : "Missing");

  fetch(`${apiBaseUrl}/admin/verify`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      console.log("Response status:", response.status);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      console.log("Verify response:", data);
      if (!data.success) {
        throw new Error("Invalid token");
      }

      // Token válido - guardar info del admin si viene en la respuesta
      if (data.data && data.data.admin) {
        localStorage.setItem(
          "razoconnect_admin",
          JSON.stringify(data.data.admin)
        );
      }

      // Permitir que la página continúe cargando
      console.log(" Admin authenticated successfully");
    })
    .catch((error) => {
      console.error(" Admin authentication failed:", error);
      console.error("Error details:", error.message);

      // Limpiar tokens inválidos
      localStorage.removeItem("razoconnect_admin_token");
      localStorage.removeItem("razoconnect_admin");

      // Solo mostrar aviso si había un token que resultó ser inválido
      if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
        Swal.fire({
          icon: "warning",
          title: "Sesión Expirada",
          text:
            "Tu sesión ha expirado o es inválida. Por favor, inicia sesión nuevamente.",
          confirmButtonText: "Ir al Login",
          confirmButtonColor: "#F97316",
          allowOutsideClick: false,
        }).then(() => {
          window.location.replace("/login.html");
        });
      } else {
        console.warn(
          "Sesión de administrador expirada o inválida. Redirigiendo a login..."
        );
        window.location.replace("/login.html");
      }
    });
})();

// Global function for admin auth check (used by page scripts)
const requireAdminAuth = () => {
  const adminToken = localStorage.getItem("razoconnect_admin_token");

  if (!adminToken) {
    window.location.replace("/login.html");
    return false;
  }

  return true;
};
