/**
 * AGENT AUTH GUARD
 * Protege las páginas de agente (dashboard, cartera, pedidos, comisiones)
 * Este script debe cargarse al inicio de cada página que requiere autenticación de agente
 */

(function () {
  "use strict";

  // Función de validación de token
  function checkAgentToken() {
    const agentToken = localStorage.getItem("razoconnect_admin_token");
    
    // Si no hay token, redirigir sin mostrar alerta (usuario no ha iniciado sesión)
    if (!agentToken) {
      console.warn("No agent token found. Redirecting to login...");
      window.location.replace("/login.html");
      return false;
    }
    return true;
  }

  // Evento pageshow: se dispara siempre, incluso cuando se carga desde caché (BFCache)
  // Esto previene el acceso mediante el botón "Atrás" del navegador
  window.addEventListener("pageshow", function (event) {
    if (!checkAgentToken()) {
      return;
    }
  });

  // Validación inicial
  if (!checkAgentToken()) {
    return;
  }

  const agentToken = localStorage.getItem("razoconnect_admin_token");

  // Verificar token con el servidor de forma asíncrona
  const apiBaseUrl = window.API_BASE_URL || `${window.location.origin}/api`;

  fetch(`${apiBaseUrl}/clientes/verify`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${agentToken}`,
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

      // Token válido - guardar info del agente si viene en la respuesta
      if (data.data && (data.data.agente || data.data.cliente)) {
        const userData = data.data.agente || data.data.cliente;
        localStorage.setItem(
          "razoconnect_admin",
          JSON.stringify({
            ...userData,
            rol: "agente",
            esAgente: true,
          })
        );
      }
    })
    .catch((error) => {
      console.error("⚠️ Agent authentication check failed:", error);
      console.error("Error details:", error.message);

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

      if (isNetworkError) {
        // Network error - don't redirect, just warn
        console.warn("🌐 Error de conexión con el servidor. La sesión se mantendrá.");
        
        if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
          Swal.fire({
            icon: "error",
            title: "Error de Conexión",
            text: "No se pudo conectar con el servidor. Por favor, verifica tu conexión a internet e intenta recargar la página.",
            confirmButtonText: "Entendido",
            confirmButtonColor: "#F97316",
            allowOutsideClick: true,
          });
        }
        return; // Don't redirect
      }

      if (isAuthFailure) {
        // CRÍTICO: NO limpiar tokens aquí - dejar que api.js lo maneje con protección de agente
        // Solo mostrar advertencia y permitir que el usuario continúe
        console.warn("⚠️ Error de autenticación detectado, pero manteniendo sesión de agente.");
        console.warn("Si el token está realmente expirado, api.js lo manejará correctamente.");
        
        // NO redirigir, NO limpiar tokens - la sesión se mantiene
        // El usuario puede seguir trabajando y api.js manejará errores futuros
      } else {
        // Other server errors (500, etc.) - don't redirect
        console.warn("⚠️ Error del servidor. La sesión se mantendrá.");
      }
    });
})();

// Helper function to clear auth
const clearAgentAuth = () => {
  // Usar función global segura que verifica si es agente
  if (typeof window.safeClearAdminTokens === 'function') {
    window.safeClearAdminTokens();
  } else {
    // Fallback si api.js no está cargado
    localStorage.removeItem("razoconnect_admin_token");
    localStorage.removeItem("razoconnect_admin");
  }
};

// Global function for agent auth check (used by page scripts)
const requireAgentAuth = () => {
  const agentToken = localStorage.getItem("razoconnect_admin_token");

  if (!agentToken) {
    window.location.replace("/login.html");
    return false;
  }

  return true;
};
