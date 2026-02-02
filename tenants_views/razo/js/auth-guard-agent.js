/**
 * AGENT AUTH GUARD
 * Protege las páginas de agente (dashboard, cartera, pedidos, comisiones)
 * Este script debe cargarse al inicio de cada página que requiere autenticación de agente
 */

(function () {
  "use strict";

  // Función de validación de token
  function checkAgentToken() {
    const agentToken = localStorage.getItem("razoconnect_agent_token");
    
    // Si no hay token, redirigir sin mostrar alerta (usuario no ha iniciado sesión)
    if (!agentToken) {
      console.warn("No agent token found. Redirecting to login...");
      window.location.replace("/login.html");
      return false;
    }
    
    // Validar estructura JWT localmente (sin llamar al backend)
    try {
      const parts = agentToken.split('.');
      if (parts.length !== 3) {
        console.warn("Token malformado. Redirigiendo a login...");
        localStorage.removeItem("razoconnect_agent_token");
        localStorage.removeItem("razoconnect_agent");
        window.location.replace("/login.html");
        return false;
      }
      
      // Verificar expiración
      const payload = JSON.parse(atob(parts[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        console.warn("Token expirado. Redirigiendo a login...");
        localStorage.removeItem("razoconnect_agent_token");
        localStorage.removeItem("razoconnect_agent");
        window.location.replace("/login.html");
        return false;
      }
    } catch (error) {
      console.error("Error validando token:", error);
      localStorage.removeItem("razoconnect_agent_token");
      localStorage.removeItem("razoconnect_agent");
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

  // Token ya validado localmente - no necesitamos verificar con el servidor
  // Esto evita errores 401/403 innecesarios y mejora la experiencia offline
  console.log("✅ Token de agente validado localmente");
})();

// Helper function to clear auth
const clearAgentAuth = () => {
  localStorage.removeItem("razoconnect_agent_token");
  localStorage.removeItem("razoconnect_agent");
};

// Global function for agent auth check (used by page scripts)
const requireAgentAuth = () => {
  const agentToken = localStorage.getItem("razoconnect_agent_token");

  if (!agentToken) {
    window.location.replace("/login.html");
    return false;
  }

  return true;
};
