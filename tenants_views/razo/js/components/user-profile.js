/**
 * Componente de Perfil de Usuario Dinámico
 * Obtiene y muestra información del usuario actual desde /api/auth/me
 * Compatible con los 3 roles: Administrador, Agente, Cliente
 */

(function () {
  "use strict";

  // Esperar a que API_BASE_URL esté disponible
  function getApiBaseUrl() {
    return window.API_BASE_URL || `${window.location.origin}/api`;
  }

  /**
   * Determina el token correcto según el tipo de usuario
   * @returns {Object} { token, tipo }
   */
  function getAuthToken() {
    // Detectar contexto para priorizar token correcto
    const path = window.location.pathname.toLowerCase();
    
    // Contexto de agente - priorizar token de agente
    if (path.includes('/agente')) {
      const agentToken = localStorage.getItem("razoconnect_agent_token");
      if (agentToken) {
        return { token: agentToken, tipo: "agente" };
      }
    }
    
    // Contexto de admin
    if (path.startsWith('/admin')) {
      const adminToken = localStorage.getItem("razoconnect_admin_token");
      if (adminToken) {
        return { token: adminToken, tipo: "admin" };
      }
    }
    
    // Contexto de cliente o fallback
    const clienteToken = localStorage.getItem("razoconnect_token");
    if (clienteToken) {
      return { token: clienteToken, tipo: "cliente" };
    }
    
    // Fallback: intentar cualquier token disponible
    const adminToken = localStorage.getItem("razoconnect_admin_token");
    if (adminToken) {
      return { token: adminToken, tipo: "admin" };
    }
    
    const agentToken = localStorage.getItem("razoconnect_agent_token");
    if (agentToken) {
      return { token: agentToken, tipo: "agente" };
    }

    return { token: null, tipo: null };
  }

  /**
   * Obtiene los datos del perfil del usuario actual
   * @returns {Promise<Object>} Datos del usuario
   */
  async function fetchUserProfile() {
    const apiUrl = getApiBaseUrl();

    // Usar AuthManager si está disponible
    if (typeof window.AuthManager !== 'undefined') {
      try {
        // Detectar contexto
        const path = window.location.pathname.toLowerCase();
        let context = 'cliente';
        
        if (path.includes('/agente')) {
          context = 'agente';
        } else if (path.startsWith('/admin')) {
          context = 'admin';
        }

        const response = await AuthManager.fetchWithAuth(`${apiUrl}/auth/me`, {
          method: 'GET',
          context: context
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || "Error al obtener perfil");
        }

        const data = await response.json();
        return data.data;
      } catch (error) {
        throw error;
      }
    }

    // Fallback a método legacy
    const { token, tipo } = getAuthToken();

    if (!token) {
      throw new Error("No hay token de autenticación");
    }

    const response = await fetch(`${apiUrl}/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Error al obtener perfil");
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Renderiza el componente de perfil de usuario
   * @param {HTMLElement} container - Contenedor donde se renderizará
   * @param {Object} userData - Datos del usuario
   */
  function renderUserProfile(container, userData) {
    if (!container) return;

    // Crear estructura HTML
    const userInfoDiv = document.createElement("div");
    userInfoDiv.className = "admin-user-info";
    userInfoDiv.style.cursor = "pointer";
    userInfoDiv.style.position = "relative";

    userInfoDiv.innerHTML = `
      <div class="admin-user-avatar">${userData.iniciales}</div>
      <div class="admin-user-details">
        <div class="admin-user-name">${userData.nombre}</div>
        <div class="admin-user-role">${userData.rol}</div>
      </div>
    `;

    // Limpiar contenedor y agregar nuevo contenido
    container.innerHTML = "";
    container.appendChild(userInfoDiv);
  }

  /**
   * Actualiza los campos individuales de nombre y rol (para páginas legacy)
   * @param {Object} userData - Datos del usuario
   */
  function updateLegacyElements(userData) {
    // Actualizar elementos individuales si existen
    const userNameEl = document.getElementById("userName");
    const userRoleEl = document.getElementById("userRole");
    const userAvatarEl = document.getElementById("userAvatar");

    const headerUserNameEl = document.getElementById("headerUserName");
    const headerUserRoleEl = document.getElementById("headerUserRole");
    const headerUserAvatarEl = document.getElementById("headerUserAvatar");

    if (userNameEl) {
      userNameEl.textContent = userData.nombre;
    }

    if (headerUserNameEl) {
      headerUserNameEl.textContent = userData.nombre;
    }

    if (userRoleEl) {
      userRoleEl.textContent = userData.rol;
    }

    if (headerUserRoleEl) {
      headerUserRoleEl.textContent = userData.rol;
    }

    if (userAvatarEl) {
      userAvatarEl.textContent = userData.iniciales;
    }

    if (headerUserAvatarEl) {
      headerUserAvatarEl.textContent = userData.iniciales;
    }
  }

  /**
   * Inicializa el componente de perfil de usuario
   * @param {string} selector - Selector CSS del contenedor (opcional)
   */
  async function initUserProfile(selector = "#user-profile-container") {
    try {
      // Obtener datos del perfil
      const userData = await fetchUserProfile();

      // Buscar contenedor específico
      const container = document.querySelector(selector);
      
      if (container) {
        renderUserProfile(container, userData);
      } else {
        // Si no hay contenedor específico, actualizar elementos legacy
        updateLegacyElements(userData);
      }

      // Siempre actualizar elementos legacy por compatibilidad
      updateLegacyElements(userData);

      // Disparar evento personalizado con los datos del usuario
      const event = new CustomEvent("userProfileLoaded", {
        detail: userData,
      });
      window.dispatchEvent(event);

      return userData;
    } catch (error) {
      console.error("Error al cargar perfil de usuario:", error);
      
      // Mostrar valores por defecto en caso de error
      const defaultData = {
        nombre: "Usuario",
        rol: "Cargando...",
        iniciales: "U",
      };
      
      updateLegacyElements(defaultData);
      
      return null;
    }
  }

  /**
   * Actualiza el perfil de usuario (útil después de cambios)
   */
  async function refreshUserProfile(selector) {
    return await initUserProfile(selector);
  }

  // Exportar funciones globalmente
  window.UserProfile = {
    init: initUserProfile,
    refresh: refreshUserProfile,
    fetch: fetchUserProfile,
  };

  // Auto-inicializar si el DOM está listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // Dar tiempo para que otros scripts se carguen
      setTimeout(() => initUserProfile(), 300);
    });
  } else {
    // DOM ya está listo
    setTimeout(() => initUserProfile(), 300);
  }
})();
