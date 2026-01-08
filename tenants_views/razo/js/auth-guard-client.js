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
  fetch("/api/clientes/verify", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${effectiveToken}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        return response.json().then(data => {
          throw { status: response.status, data };
        }).catch(() => {
          throw { status: response.status, data: null };
        });
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
        window.dispatchEvent(
          new CustomEvent("razoconnect:client-updated", {
            detail: data.data.cliente,
          })
        );
      }
    })
    .catch((error) => {
      console.error("❌ Client authentication failed:", error);

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

      if (adminToken && adminHasAgentRole()) {
        console.warn(
          "Admin agent token failed client verification. Continuing."
        );
        return;
      }

      localStorage.removeItem("razoconnect_token");
      localStorage.removeItem("razoconnect_user");

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
          "Sesión de cliente expirada o inválida. Redirigiendo a login..."
        );
        window.location.replace("/login.html");
      }
    });
})();
