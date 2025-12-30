/**
 * SISTEMA DE GESTIÓN DE SESIONES SEGURAS
 * - Renueva el token después de 5 minutos de inactividad
 * - LIMPIA la sesión al cerrar el navegador/pestaña (requiere nuevo login)
 * - Renovación periódica cada 20 minutos
 * - Detecta actividad del usuario (mouse, teclado, scroll, touch)
 */

(function () {
  "use strict";

  // Configuración
  const INACTIVITY_TIME = 5 * 60 * 1000; // 5 minutos en milisegundos
  const API_BASE_URL = `${window.location.origin}/api`;

  let inactivityTimer = null;
  let lastActivity = Date.now();

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
   * Renovar el token con el servidor
   */
  async function refreshToken() {
    const userType = getUserType();
    const token = getCurrentToken();

    if (!token || !userType) {
      console.log("🔄 No hay token para renovar");
      return;
    }

    try {
      const endpoint =
        userType === "admin"
          ? `${API_BASE_URL}/admin/refresh-token`
          : `${API_BASE_URL}/clientes/refresh-token`;

      console.log("🔄 Renovando token...", {
        userType,
        tiempo: new Date().toLocaleTimeString(),
      });

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
   * Resetear el temporizador de inactividad
   */
  function resetInactivityTimer() {
    lastActivity = Date.now();

    // Limpiar el temporizador anterior
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }

    // Crear nuevo temporizador
    inactivityTimer = setTimeout(() => {
      const timeSinceLastActivity = Date.now() - lastActivity;
      console.log(`⏱️ 5 minutos de inactividad detectados`);
      refreshToken();
    }, INACTIVITY_TIME);
  }

  /**
   * Manejar actividad del usuario
   */
  function handleUserActivity() {
    resetInactivityTimer();
  }

  /**
   * Variable para detectar si el usuario está navegando o cerrando
   */
  let isNavigating = false;

  /**
   * Limpiar sesión SOLO al CERRAR la pestaña (NO al navegar)
   * NOTA: Para administradores, NO limpiamos la sesión automáticamente por seguridad
   */
  function handlePageUnload(event) {
    const userType = getUserType();
    if (!userType) return;

    // NO LIMPIAR sesión de ADMIN automáticamente
    // Los admins deben cerrar sesión manualmente usando el botón de logout
    if (userType === "admin") {
      console.log(" Admin - Sesión persistente (no se limpia automáticamente)");
      return;
    }

    // Para CLIENTES y AGENTES: verificar si está navegando
    const navigatingProgrammatically = sessionStorage.getItem("_navigating");
    const navTimestamp = localStorage.getItem("_nav_timestamp");
    const now = Date.now();
    const isRecentNavigation =
      navTimestamp && now - parseInt(navTimestamp) < 500;

    if (isNavigating || navigatingProgrammatically || isRecentNavigation) {
      console.log(" Navegando dentro del sitio - NO se limpia sesión");
      sessionStorage.removeItem("_navigating");
      localStorage.removeItem("_nav_timestamp");
      return;
    }

    // LIMPIAR tokens de cliente/agente solo si realmente está cerrando
    localStorage.removeItem("razoconnect_token");
    localStorage.removeItem("razoconnect_user");
    console.log(" Cerrando pestaña - Sesión de cliente limpiada");
  }

  /**
   * Detectar clicks en enlaces internos
   */
  function handleInternalNavigation(event) {
    // Marcar que está navegando
    isNavigating = true;

    // Resetear después de 100ms (suficiente para que beforeunload se ejecute)
    setTimeout(() => {
      isNavigating = false;
    }, 100);
  }

  /**
   * Inicializar el sistema de renovación
   */
  function init() {
    const token = getCurrentToken();
    if (!token) {
      console.log("⚠️ No hay token activo - sistema de renovación no iniciado");
      return;
    }

    console.log("🔐 Sistema de renovación de tokens iniciado");
    console.log(
      `⏱️ Tiempo de inactividad: ${INACTIVITY_TIME / 1000 / 60} minutos`
    );

    // Eventos de actividad del usuario
    const activityEvents = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];

    // Agregar listeners para detectar actividad
    activityEvents.forEach((event) => {
      document.addEventListener(event, handleUserActivity, true);
    });

    // Detectar clicks en enlaces para saber si está navegando
    document.addEventListener(
      "click",
      (event) => {
        // Buscar si el click fue en un enlace o dentro de uno
        let target = event.target;
        while (target && target !== document) {
          if (target.tagName === "A" && target.href) {
            // Es un enlace - marcar como navegación
            handleInternalNavigation(event);
            break;
          }
          target = target.parentElement;
        }
      },
      true
    );

    // Listener para cuando el usuario cierra/sale de la página
    window.addEventListener("beforeunload", handlePageUnload);

    // Iniciar el temporizador
    resetInactivityTimer();

    // Renovar token cada 20 minutos como medida adicional
    setInterval(() => {
      console.log("🔄 Renovación periódica programada (cada 20 min)");
      refreshToken();
    }, 20 * 60 * 1000); // 20 minutos
  }

  // Inicializar cuando el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
