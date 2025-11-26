/**
 * CLIENT AUTH GUARD
 * Protege las páginas de cliente (dashboard, perfil, etc.)
 * Este script debe cargarse al inicio de cada página que requiere autenticación de cliente
 */

(function () {
  "use strict";

  // Funciones de autenticación locales (necesarias porque api.js no se ha cargado aún)
  const getToken = () => localStorage.getItem("razoconnect_token");
  const getAdminToken = () => localStorage.getItem("razoconnect_admin_token");
  const getAdminData = () => {
    try {
      return JSON.parse(localStorage.getItem("razoconnect_admin") || "null");
    } catch {
      return null;
    }
  };
  const adminHasAgentRole = () => {
    const adminData = getAdminData();
    return adminData?.rol === "agente" || adminData?.esAgente === true;
  };
  const getEffectiveToken = () => {
    const clientToken = getToken();
    if (clientToken) return clientToken;
    const adminToken = getAdminToken();
    if (adminToken && adminHasAgentRole()) return adminToken;
    return null;
  };

  const effectiveToken = getEffectiveToken();
  if (!effectiveToken) {
    console.warn("No auth token found. Redirecting to login...");
    window.location.replace("/login.html");
    return;
  }

  const adminToken = getAdminToken();
  const adminData = getAdminData();

  // Verificar token con el servidor de forma asíncrona
  fetch("http://localhost:3000/api/clientes/verify", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${effectiveToken}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      console.log("🔐 Verificando cliente... status:", response.status);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      if (!data.success) {
        throw new Error("Invalid token");
      }

      if (data.data && data.data.cliente) {
        localStorage.setItem(
          "razoconnect_user",
          JSON.stringify(data.data.cliente)
        );
        console.log(
          "✅ Datos de cliente actualizados en localStorage:",
          data.data.cliente
        );
        window.dispatchEvent(
          new CustomEvent("razoconnect:client-updated", {
            detail: data.data.cliente,
          })
        );
      }

      console.log("✅ Client authenticated successfully");
    })
    .catch((error) => {
      console.error("❌ Client authentication failed:", error);

      if (adminToken && adminHasAgentRole()) {
        console.warn(
          "Admin agent token failed client verification. Continuing."
        );
        return;
      }

      localStorage.removeItem("razoconnect_token");
      localStorage.removeItem("razoconnect_user");
      alert(
        "Tu sesión ha expirado o es inválida. Por favor, inicia sesión nuevamente."
      );
      window.location.replace("/login.html");
    });
})();
