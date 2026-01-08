/**
 * STAFF AUTH GUARD
 * Protege páginas internas de staff (admin/superadmin/agente)
 * - Admin/Superadmin se verifica con /api/admin/verify
 * - Agente se verifica con /api/clientes/verify y rol === 'agente'
 */

(function () {
  "use strict";

  const token = localStorage.getItem("razoconnect_admin_token");

  if (!token) {
    console.warn("No staff token found. Redirecting to login...");
    window.location.replace("/login.html");
    return;
  }

  async function safeJson(res) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  async function verifyAdmin() {
    const res = await fetch("/api/admin/verify", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await safeJson(res);
    return { ok: res.ok && data?.success, data };
  }

  async function verifyAgente() {
    const res = await fetch("/api/clientes/verify", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const data = await safeJson(res);

    const rol = data?.data?.rol;
    const ok = res.ok && data?.success && String(rol || "").toLowerCase() === "agente";

    return { ok, data };
  }

  async function deny(message) {
    localStorage.removeItem("razoconnect_admin_token");
    localStorage.removeItem("razoconnect_admin");

    if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
      await Swal.fire({
        icon: "warning",
        title: "Sesión Expirada",
        text: message,
        confirmButtonText: "Ir al Login",
        confirmButtonColor: "#F97316",
        allowOutsideClick: false,
      });
    }

    window.location.replace("/login.html");
  }

  (async function init() {
    try {
      // 1) Intentar como admin/superadmin
      const admin = await verifyAdmin();
      if (admin.ok) {
        if (admin.data?.data?.admin) {
          localStorage.setItem("razoconnect_admin", JSON.stringify(admin.data.data.admin));
        }
        return;
      }

      // 2) Intentar como agente
      const agente = await verifyAgente();
      if (agente.ok) {
        const userData = agente.data?.data?.agente || agente.data?.data?.cliente;
        if (userData) {
          localStorage.setItem(
            "razoconnect_admin",
            JSON.stringify({
              ...userData,
              rol: "agente",
              esAgente: true,
            })
          );
        }
        return;
      }

      await deny(
        "Tu sesión ha expirado o no tienes permisos para acceder. Por favor, inicia sesión nuevamente."
      );
    } catch (error) {
      console.error("❌ Staff authentication failed:", error);

      // En caso de error de red temporal, NO limpiar token ni redirigir de inmediato
      // (para no sacar al usuario si el backend está reiniciando).
    }
  })();
})();

// Global function for staff auth check
const requireStaffAuth = () => {
  const staffToken = localStorage.getItem("razoconnect_admin_token");
  if (!staffToken) {
    window.location.replace("/login.html");
    return false;
  }
  return true;
};
