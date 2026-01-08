/**
 * AGENT AUTH GUARD
 * Protege las páginas de agente (dashboard, cartera, pedidos, comisiones)
 * Este script debe cargarse al inicio de cada página que requiere autenticación de agente
 */

(function () {
  "use strict";

  const getAdminToken = () => localStorage.getItem("razoconnect_admin_token");
  const getAdminData = () => {
    try {
      return JSON.parse(localStorage.getItem("razoconnect_admin") || "null");
    } catch {
      return null;
    }
  };

  const adminToken = getAdminToken();
  const adminData = getAdminData();

  // Verificar que existe un token de admin
  if (!adminToken) {
    console.warn("No admin token found. Redirecting to login...");
    window.location.replace("/login.html");
    return;
  }

  // Verificar que el admin tiene rol de agente
  const isAgent = adminData?.rol === "agente" || adminData?.esAgente === true;
  if (!isAgent) {
    console.warn("User is not an agent. Redirecting to login...");
    window.location.replace("/login.html");
    return;
  }

  // Verificar token con el servidor
  // Los agentes usan el endpoint de clientes para verificación
  fetch("/api/clientes/verify", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        console.error(
          "❌ Response not OK:",
          response.status,
          response.statusText
        );
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      if (!data.success) {
        throw new Error("Invalid token");
      }

      // Verificar que sea agente
      const userRol = data.data?.rol;
      const userData = data.data?.agente || data.data?.cliente;

      if (userRol !== "agente") {
        throw new Error("Usuario no es agente");
      }

      if (!userData) {
        throw new Error("No se recibieron datos del usuario");
      }

      // Actualizar datos del agente en localStorage
      localStorage.setItem(
        "razoconnect_admin",
        JSON.stringify({
          ...userData,
          rol: "agente",
          esAgente: true,
        })
      );
    })
    .catch((error) => {
      console.error("❌ Agent authentication failed:", error);
      console.error("❌ Error completo:", error.message, error.stack);

      // Solo redirigir si es un error de autenticación real, no de red
      if (
        error.message.includes("403") ||
        error.message.includes("401") ||
        error.message.includes("Invalid token")
      ) {
        localStorage.removeItem("razoconnect_admin_token");
        localStorage.removeItem("razoconnect_admin");

        // Esperar a que api.js se cargue si existe showToast
        setTimeout(() => {
          if (typeof showToast === "function") {
            showToast(
              "Tu sesión ha expirado. Por favor, inicia sesión nuevamente.",
              "warning"
            );
          }
        }, 100);

        setTimeout(() => {
          window.location.replace("/login.html");
        }, 1500);
      } else {
        console.warn("⚠️ Error de red o temporal, manteniendo sesión");
        // No redirigir si es error de red temporal
      }
    });
})();

// Helper function to clear auth
const clearAgentAuth = () => {
  localStorage.removeItem("razoconnect_admin_token");
  localStorage.removeItem("razoconnect_admin");
};

// Global function for agent auth check (used by page scripts)
const requireAgentAuth = () => {
  const adminToken = localStorage.getItem("razoconnect_admin_token");
  const adminData = (() => {
    try {
      return JSON.parse(localStorage.getItem("razoconnect_admin") || "null");
    } catch {
      return null;
    }
  })();

  if (!adminToken) {
    window.location.replace("/login.html");
    return false;
  }

  const isAgent = adminData?.rol === "agente" || adminData?.esAgente === true;
  if (!isAgent) {
    window.location.replace("/login.html");
    return false;
  }

  return true;
};
