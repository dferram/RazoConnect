/**
 * ADMIN AUTH GUARD
 * Protege las páginas de administrador
 * Este script debe cargarse al inicio de cada página de admin
 */

(function () {
  "use strict";

  // Global flag para indicar que la verificación de auth está en progreso
  window.adminAuthVerifying = true;
  window.adminAuthVerified = false;

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
    
    // Verificar si el token parece válido (formato JWT básico)
    try {
      const parts = adminToken.split('.');
      if (parts.length !== 3) {
        console.warn("Token malformado. Redirigiendo a login...");
        localStorage.removeItem("razoconnect_admin_token");
        localStorage.removeItem("razoconnect_admin");
        window.location.replace("/login.html");
        return false;
      }
    } catch (error) {
      console.warn("Error validando formato de token. Redirigiendo a login...");
      localStorage.removeItem("razoconnect_admin_token");
      localStorage.removeItem("razoconnect_admin");
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
  

  // Verificar token con el servidor de forma asíncrona
  // IMPORTANTE: Esta verificación es opcional - si falla por problemas de red,
  // NO expulsamos al usuario. Solo expulsamos en caso de token realmente inválido.
  fetch(verifyUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
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
      
      // Marcar verificación como completa
      window.adminAuthVerified = true;
      window.adminAuthVerifying = false;
    })
    .catch((error) => {
      // Check if it's a network error (no response from server)
      const isNetworkError = 
        error.message.includes("Failed to fetch") ||
        error.message.includes("NetworkError") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("EAI_AGAIN") ||
        error.message.includes("fetch failed") ||
        error.message.includes("Load failed") ||
        !error.status; // No status means network issue

      // Only redirect to login on explicit auth failures (401, 403)
      const isAuthFailure = error.status === 401 || error.status === 403;

      if (isNetworkError) {
        // Network error - don't redirect, just log and continue
        console.warn("[AUTH-GUARD] Error de red al verificar token. Permitiendo acceso con token local.");
        
        // Marcar como verificado (con token local)
        window.adminAuthVerified = true;
        window.adminAuthVerifying = false;
        return; // Don't redirect - user can continue working
      }

      if (isAuthFailure) {
        // Explicit auth failure - clean tokens and redirect
        console.warn("[AUTH-GUARD] Token inválido o expirado. Redirigiendo a login.");
        localStorage.removeItem("razoconnect_admin_token");
        localStorage.removeItem("razoconnect_admin");
        
        window.adminAuthVerified = false;
        window.adminAuthVerifying = false;

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
          window.location.replace("/login.html");
        }
      } else {
        // Other server errors (500, etc.) - don't redirect, just log
        console.warn("[AUTH-GUARD] Error del servidor al verificar token. Permitiendo acceso con token local.");
        
        // Marcar como verificado (con token local)
        window.adminAuthVerified = true;
        window.adminAuthVerifying = false;
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
