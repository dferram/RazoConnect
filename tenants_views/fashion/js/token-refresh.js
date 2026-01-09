/**
 * SISTEMA DE SESIÓN PERSISTENTE E-COMMERCE
 * - El usuario permanece logueado por 30 días
 * - La sesión persiste aunque cierre el navegador o reinicie el PC
 * - Solo se cierra sesión con el botón "Cerrar Sesión"
 * - Renovación REACTIVA: Solo renueva si quedan <2 días de vida al cargar la página
 * - Sin listeners de actividad (mejor rendimiento)
 */

(function () {
  "use strict";

  // Configuración
  const API_BASE_URL = `${window.location.origin}/api`;
  const RENEWAL_THRESHOLD = 2 * 24 * 60 * 60 * 1000; // 2 días en milisegundos

  /**
   * Determinar si es cliente o admin según el token almacenado
   */
  function getUserType() {
    const adminToken = localStorage.getItem("razoconnect_admin_token");
    const clientToken = localStorage.getItem("razoconnect_token");

    if (adminToken) return "admin";
    if (clientToken) return "client";
    return null;
  }

  /**
   * Obtener el token actual
   */
  function getCurrentToken() {
    const userType = getUserType();
    if (userType === "admin") {
      return localStorage.getItem("razoconnect_admin_token");
    } else if (userType === "client") {
      return localStorage.getItem("razoconnect_token");
    }
    return null;
  }

  /**
   * Decodificar JWT sin verificar firma (solo para leer expiración)
   */
  function decodeJWT(token) {
    try {
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      
      const payload = parts[1];
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error("❌ Error decodificando JWT:", error);
      return null;
    }
  }

  /**
   * Verificar si el token está próximo a expirar (<2 días)
   */
  function isTokenNearExpiration(token) {
    const payload = decodeJWT(token);
    if (!payload || !payload.exp) return false;
    
    const expirationTime = payload.exp * 1000; // Convertir a milisegundos
    const currentTime = Date.now();
    const timeRemaining = expirationTime - currentTime;
    
    return timeRemaining < RENEWAL_THRESHOLD && timeRemaining > 0;
  }

  /**
   * Renovar el token con el servidor (SOLO si está próximo a expirar)
   */
  async function renewTokenIfNeeded() {
    const userType = getUserType();
    const token = getCurrentToken();

    if (!token || !userType) {
      return;
    }

    // Verificar si necesita renovación
    if (!isTokenNearExpiration(token)) {
      console.log("✅ Token válido, no requiere renovación");
      return;
    }

    console.log("⚠️ Token próximo a expirar, renovando...");

    try {
      const endpoint =
        userType === "admin"
          ? `${API_BASE_URL}/admin/refresh-token`
          : `${API_BASE_URL}/clientes/refresh-token`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Error al renovar token");
      }

      const data = await response.json();

      if (data.success && data.data.token) {
        // Guardar el nuevo token
        if (userType === "admin") {
          localStorage.setItem("razoconnect_admin_token", data.data.token);
        } else {
          localStorage.setItem("razoconnect_token", data.data.token);
        }

        console.log("✅ Token renovado exitosamente");
        return true;
      } else {
        throw new Error("Respuesta inválida del servidor");
      }
    } catch (error) {
      console.error("❌ Error al renovar token:", error);

      // Si falla la renovación, podría ser que el token expiró completamente
      // En ese caso, limpiar y redirigir al login
      if (userType === "admin") {
        localStorage.removeItem("razoconnect_admin_token");
        localStorage.removeItem("razoconnect_admin");
        window.location.href = "/login.html";
      } else {
        localStorage.removeItem("razoconnect_token");
        localStorage.removeItem("razoconnect_user");
        window.location.href = "/login.html";
      }

      return false;
    }
  }


  /**
   * Inicializar el sistema de sesión persistente con renovación reactiva
   * - Sin listeners de actividad (mejor rendimiento)
   * - Sin limpieza al cerrar navegador
   * - Renovación REACTIVA: Solo al cargar página si quedan <2 días
   */
  async function init() {
    const token = getCurrentToken();
    if (!token) {
      return;
    }

    // RENOVACIÓN REACTIVA: Verificar al cargar la página
    // Si el token está próximo a expirar (<2 días), renovarlo
    await renewTokenIfNeeded();
  }

  // Inicializar cuando el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
