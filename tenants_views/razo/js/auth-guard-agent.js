/**
 * AGENT AUTH GUARD
 * Protege las páginas de agente (dashboard, cartera, pedidos, comisiones)
 * Este script debe cargarse al inicio de cada página que requiere autenticación de agente
 */

(function () {
  "use strict";

  const getAgentToken = () => localStorage.getItem("razoconnect_token");
  const getAgentData = () => {
    try {
      return JSON.parse(localStorage.getItem("razoconnect_user") || "null");
    } catch {
      return null;
    }
  };

  // Función de validación de token de agente
  function checkAgentToken() {
    const agentToken = getAgentToken();
    const agentData = getAgentData();

    // Verificar que existe un token
    if (!agentToken) {
      console.warn("No agent token found. Redirecting to login...");
      window.location.replace("/login.html");
      return false;
    }

    // Verificar que el usuario tiene rol de agente
    const isAgent = agentData?.rol === "agente" || agentData?.esAgente === true;
    if (!isAgent) {
      console.warn("User is not an agent. Redirecting to login...");
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

  const agentToken = getAgentToken();
  const agentData = getAgentData();

  // Verificar token con el servidor
  // Los agentes usan el endpoint de clientes para verificación
  fetch("/api/clientes/verify", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${agentToken}`,
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
        return response.json().then(data => {
          throw { status: response.status, data, message: `HTTP error! status: ${response.status}` };
        }).catch(err => {
          if (err.status) throw err;
          throw { status: response.status, data: null, message: `HTTP error! status: ${response.status}` };
        });
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
        "razoconnect_user",
        JSON.stringify({
          ...userData,
          rol: "agente",
          esAgente: true,
        })
      );
    })
    .catch((error) => {
      console.error("❌ Agent authentication failed:", error);

      // Verificar si es error de tenant mismatch
      if (error.status === 401 && error.data?.code === 'TENANT_MISMATCH') {
        localStorage.removeItem("razoconnect_token");
        localStorage.removeItem("razoconnect_user");
        
        if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
          Swal.fire({
            icon: "warning",
            title: "Sesión de Otro Sitio",
            text: "Tu sesión pertenece a otro sitio. Por favor inicia sesión nuevamente en este sitio.",
            confirmButtonText: "Ir al Login",
            confirmButtonColor: "#F97316",
            allowOutsideClick: false,
          }).then(() => {
            window.location.replace("/login.html");
          });
        } else {
          window.location.replace("/login.html");
        }
        return;
      }

      // Solo redirigir si es un error de autenticación real, no de red
      if (
        error.message?.includes("403") ||
        error.message?.includes("401") ||
        error.message?.includes("Invalid token") ||
        error.status === 401 ||
        error.status === 403
      ) {
        localStorage.removeItem("razoconnect_token");
        localStorage.removeItem("razoconnect_user");

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
  localStorage.removeItem("razoconnect_token");
  localStorage.removeItem("razoconnect_user");
};

// Global function for agent auth check (used by page scripts)
const requireAgentAuth = () => {
  const agentToken = localStorage.getItem("razoconnect_token");
  const agentData = (() => {
    try {
      return JSON.parse(localStorage.getItem("razoconnect_user") || "null");
    } catch {
      return null;
    }
  })();

  if (!agentToken) {
    window.location.replace("/login.html");
    return false;
  }

  const isAgent = agentData?.rol === "agente" || agentData?.esAgente === true;
  if (!isAgent) {
    window.location.replace("/login.html");
    return false;
  }

  return true;
};
