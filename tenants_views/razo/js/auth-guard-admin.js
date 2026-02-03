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

  // Función de validación de token
  function checkAdminToken() {
    const adminToken = localStorage.getItem("razoconnect_admin_token");
    
    // Si no hay token, redirigir sin mostrar alerta (usuario no ha iniciado sesión)
    if (!adminToken) {
      console.warn("No admin token found. Redirecting to login...");
      window.location.replace("/login.html");
      return false;
    }
    return true;
  }

  // Evento pageshow: se dispara siempre, incluso cuando se carga desde caché (BFCache)
  // Esto previene el acceso mediante el botón "Atrás" del navegador
  window.addEventListener("pageshow", function (event) {
    if (!checkAdminToken()) {
      return;
    }
  });

  // Validación inicial
  if (!checkAdminToken()) {
    return;
  }

  const adminToken = localStorage.getItem("razoconnect_admin_token");

  // Verificar token con el servidor de forma asíncrona
  const apiBaseUrl = window.API_BASE_URL || `${window.location.origin}/api`;
  const verifyUrl = `${apiBaseUrl}/admin/verify`;
  
  console.log('🔐 [AUTH-GUARD] Verificando token de admin...');
  console.log('📍 [AUTH-GUARD] URL de verificación:', verifyUrl);
  console.log('🎫 [AUTH-GUARD] Token presente:', adminToken ? 'Sí' : 'No');

  fetch(verifyUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      console.log('📡 [AUTH-GUARD] Respuesta recibida:', response.status, response.statusText);
      
      // Capture status before processing
      const status = response.status;
      
      if (!response.ok) {
        // Create error with status code for proper handling
        const error = new Error(`HTTP error! status: ${status}`);
        error.status = status;
        throw error;
      }
      return response.json();
    })
    .then((data) => {
      console.log('✅ [AUTH-GUARD] Token verificado exitosamente');
      console.log('👤 [AUTH-GUARD] Usuario:', data.data?.admin?.nombre || 'N/A');
      
      if (!data.success) {
        const error = new Error("Invalid token");
        error.status = 401;
        throw error;
      }

      // Token válido - guardar info del admin si viene en la respuesta
      if (data.data && data.data.admin) {
        localStorage.setItem(
          "razoconnect_admin",
          JSON.stringify(data.data.admin)
        );
      }
    })
    .catch((error) => {
      console.error("❌ [AUTH-GUARD] Error en verificación:", error);
      console.error("📋 [AUTH-GUARD] Detalles:", error.message);
      console.error("🔢 [AUTH-GUARD] Status code:", error.status || 'N/A');

      // Check if it's a network error (no response from server)
      const isNetworkError = 
        error.message.includes("Failed to fetch") ||
        error.message.includes("NetworkError") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("EAI_AGAIN") ||
        error.message.includes("fetch failed") ||
        !error.status; // No status means network issue

      // Only redirect to login on explicit auth failures (401, 403)
      const isAuthFailure = error.status === 401 || error.status === 403;

      console.log('🔍 [AUTH-GUARD] Análisis de error:');
      console.log('   - Es error de red:', isNetworkError);
      console.log('   - Es fallo de auth:', isAuthFailure);

      if (isNetworkError) {
        // Network error - don't redirect, just warn
        console.warn("🌐 [AUTH-GUARD] Error de red - NO se redirigirá al login");
        console.warn("✅ [AUTH-GUARD] La sesión se mantendrá activa");
        return; // Don't redirect
      }

      if (isAuthFailure) {
        // Explicit auth failure - clean tokens and redirect
        console.error("🚫 [AUTH-GUARD] Token inválido - redirigiendo al login");
        localStorage.removeItem("razoconnect_admin_token");
        localStorage.removeItem("razoconnect_admin");

        if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
          Swal.fire({
            icon: "warning",
            title: "Sesión Expirada",
            text: "Tu sesión ha expirado o es inválida. Por favor, inicia sesión nuevamente.",
            confirmButtonText: "Ir al Login",
            confirmButtonColor: "#F97316",
            allowOutsideClick: false,
          }).then(() => {
            window.location.replace("/login.html");
          });
        } else {
          console.warn("[AUTH-GUARD] Redirigiendo a login...");
          window.location.replace("/login.html");
        }
      } else {
        // Other server errors (500, etc.) - don't redirect
        console.warn("⚠️ [AUTH-GUARD] Error del servidor - NO se redirigirá");
        console.warn("✅ [AUTH-GUARD] La sesión se mantendrá activa");
      }
    });
})();

// Global function for admin auth check (used by page scripts)
const requireAdminAuth = () => {
  const adminToken = localStorage.getItem("razoconnect_admin_token");

  if (!adminToken) {
    console.warn("[AUTH-GUARD] requireAdminAuth: No token found, redirecting...");
    window.location.replace("/login.html");
    return false;
  }

  console.log("[AUTH-GUARD] requireAdminAuth: Token present, access granted");
  return true;
};
