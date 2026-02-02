// API Configuration
const API_BASE_URL = `${window.location.origin}/api`;

const ADMIN_TOKEN_KEY = "razoconnect_admin_token";
const ADMIN_DATA_KEY = "razoconnect_admin";

// Utility function to get JWT token from localStorage
const getToken = () => {
  return localStorage.getItem("razoconnect_token");
};

const getAdminToken = () => {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
};

const getAdminData = () => {
  const raw = localStorage.getItem(ADMIN_DATA_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("No se pudo parsear razoconnect_admin:", error);
    return null;
  }
};

const adminHasAgentRole = () => {
  const adminData = getAdminData();
  if (!adminData) {
    return false;
  }

  const origen = adminData.origen || adminData.adminSource;
  if (origen && String(origen).toLowerCase() === "agent") {
    return true;
  }

  const rol = adminData.rol;
  if (rol && String(rol).toLowerCase() === "agente") {
    return true;
  }

  if (Array.isArray(adminData.roles)) {
    return adminData.roles.some(
      (role) => role && String(role).toLowerCase() === "agente"
    );
  }

  return false;
};

const getEffectiveToken = () => {
  const clientToken = getToken(); // razoconnect_token (usado por clientes)
  const adminToken = getAdminToken(); // razoconnect_admin_token (usado por admins Y agentes)

  const sidebarType = (document.body?.dataset?.sidebar || "").toString().toLowerCase();
  const path = (window.location?.pathname || "").toString().toLowerCase();

  const isAdminContext = sidebarType === "admin" || path.startsWith("/admin");
  const isAgentContext = sidebarType === "agent" || path.startsWith("/agente");
  const isStaffContext = isAdminContext || isAgentContext || path.startsWith("/staff");

  // En contexto ADMIN o AGENTE, usar token admin (ambos usan razoconnect_admin_token)
  if (isStaffContext) {
    return adminToken || clientToken || null;
  }

  // En contexto cliente, preferir token cliente
  return clientToken || adminToken || null;
};

// Utility function to get user data from localStorage
const getUserData = () => {
  const userData = localStorage.getItem("razoconnect_user");
  return userData ? JSON.parse(userData) : null;
};

// Utility function to save auth data
const saveAuthData = (token, userData) => {
  localStorage.setItem("razoconnect_token", token);
  localStorage.setItem("razoconnect_user", JSON.stringify(userData));
};

// Utility function to clear auth data
const clearAuthData = () => {
  // Verificar si es un agente antes de limpiar
  const adminData = getAdminData();
  const isAgent = adminData?.rol === "agente" || adminData?.esAgente === true;
  
  // Si es agente, NO limpiar los tokens de admin (que usa el agente)
  if (!isAgent) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_DATA_KEY);
  }
  
  // Siempre limpiar tokens de cliente
  localStorage.removeItem("razoconnect_token");
  localStorage.removeItem("razoconnect_user");
};

// Utility function to check if user is logged in
const isAuthenticated = () => {
  return !!getToken();
};

// Utility function to redirect if not authenticated
const requireAuth = () => {
  if (isAuthenticated()) {
    return true;
  }

  const adminToken = getAdminToken();
  if (adminToken && adminHasAgentRole()) {
    return true;
  }

  window.location.href = "/login.html";
  return false;
};

// Flag para evitar mostrar múltiples modales de sesión expirada
let sessionExpiredHandled = false;

// Validate token structure on page load
const validateTokenStructure = () => {
  const token = getToken();
  if (!token) return true; // No token is valid state
  
  try {
    // Decode JWT payload (without verification - just structure check)
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('⚠️  Token malformado detectado (partes incorrectas). Limpiando...');
      clearAuthData();
      return false;
    }
    
    const payload = JSON.parse(atob(parts[1]));
    
    // Check for required fields based on role
    if (payload.rol === 'cliente' && !payload.tenant_id) {
      console.warn('⚠️  Token de cliente sin tenant_id detectado. Limpiando...');
      clearAuthData();
      return false;
    }
    
    // Check token expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      console.warn('⚠️  Token expirado detectado. Limpiando...');
      clearAuthData();
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error validando estructura del token:', error);
    clearAuthData();
    return false;
  }
};

// Run validation on script load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    validateTokenStructure();
  });
}

// API call wrapper con manejo automático de token y sesión expirada
const apiCall = async (endpoint, options = {}) => {
  const token = getEffectiveToken();
  const isPublicEndpoint = options.public === true;

  const config = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: 'include',
    ...options,
  };

  // Add authorization header ONLY if token exists and is not null/undefined
  if (token && token !== 'null' && token !== 'undefined') {
    config.headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    
    // Clone response para poder leer el texto sin consumir el stream
    const responseClone = response.clone();
    const responseText = await responseClone.text();

    // VALIDACIÓN CRÍTICA: Verificar que el servidor envió contenido
    if (!responseText || responseText.length === 0) {
      throw new Error(
        `El servidor devolvió una respuesta vacía (HTTP ${response.status}). ` +
        `Esto indica un error interno del servidor. Por favor, revisa los logs del backend.`
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      
      throw new Error(
        `Error al parsear respuesta JSON del servidor: ${jsonError.message}. ` +
        `Respuesta recibida: "${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}"`
      );
    }

    // Manejo de 403 Forbidden (sin permisos) - NO cerrar sesión, solo mostrar alerta
    if (response.status === 403) {
      
      if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
        Swal.fire({
          icon: "error",
          title: "Acceso Denegado",
          text: "No tienes permisos para acceder a este recurso. Si crees que esto es un error, contacta al administrador.",
          confirmButtonText: "Entendido",
          confirmButtonColor: "#F97316",
        });
      }
      
      return {
        ok: false,
        status: 403,
        data,
      };
    }

    // Manejo centralizado de sesión expirada (401) - solo si no es endpoint público Y había un token
    if (response.status === 401 && !isPublicEndpoint && token) {
      // Solo mostrar modal de sesión expirada si el usuario tenía un token que expiró
      clearAuthData();

      if (!sessionExpiredHandled) {
        sessionExpiredHandled = true;

        // Preferir SweetAlert2 si está disponible globalmente
        if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
          Swal.fire({
            icon: "warning",
            title: "Sesión Expirada",
            text: "Tu sesión ha expirado por seguridad. Por favor, inicia sesión nuevamente.",
            confirmButtonText: "Ir al Login",
            confirmButtonColor: "#F97316",
            allowOutsideClick: false,
          }).then(() => {
            window.location.href = "/login.html";
          });
        } else {
          // Si SweetAlert2 no está disponible, redirigir silenciosamente
          console.warn("Sesión expirada. Redirigiendo a login...");
          window.location.href = "/login.html";
        }
      }

      throw new Error("Sesión expirada. Por favor, inicia sesión nuevamente.");
    }

    // Si es 401 pero no había token (usuario invitado), simplemente retornar el error sin modal
    if (response.status === 401 && !token) {
      return {
        ok: false,
        status: response.status,
        data,
      };
    }

    const result = {
      ok: response.ok,
      status: response.status,
      data,
    };
    
    return result;
  } catch (error) {
    console.error("Error en apiCall:", error);
    throw error;
  }
};

// API Methods
const API = {
  // Auth endpoints
  login: async (email, password) => {
    return apiCall("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  registroCliente: async (formData) => {
    return apiCall("/registro/cliente", {
      method: "POST",
      body: JSON.stringify(formData),
    });
  },

  // Products endpoints
  getProductos: async (queryString = "") => {
    return apiCall(`/productos${queryString}`, {
      method: "GET",
      public: true,
    });
  },

  getDimensiones: async () => {
    return apiCall("/productos/dimensiones", {
      method: "GET",
      public: true,
    });
  },

  getProductoById: async (id) => {
    return apiCall(`/productos/${id}`, {
      method: "GET",
      public: true,
    });
  },

  // Cart endpoints
  getCarrito: async () => {
    return apiCall("/carrito", {
      method: "GET",
    });
  },

  agregarAlCarrito: async (varianteId, cantidadPaquetes, tamanoId) => {
    return apiCall("/carrito", {
      method: "POST",
      body: JSON.stringify({
        VarianteID: varianteId,
        Cantidad: cantidadPaquetes,
        CantidadPaquetes: cantidadPaquetes,
        TamanoID: tamanoId,
      }),
    });
  },

  actualizarCarrito: async (varianteId, cantidadPaquetes, tamanoId) => {
    return apiCall(`/carrito/${varianteId}`, {
      method: "PUT",
      body: JSON.stringify({
        CantidadPaquetes: cantidadPaquetes,
        TamanoID: tamanoId,
      }),
    });
  },

  cambiarVarianteItemCarrito: async (itemId, nuevaVarianteId, tamanoId) => {
    return apiCall(`/carrito/item/${itemId}/cambiar-variante`, {
      method: "PUT",
      body: JSON.stringify({
        NuevaVarianteID: nuevaVarianteId,
        TamanoID: tamanoId,
      }),
    });
  },

  eliminarDelCarrito: async (itemId) => {
    return apiCall(`/carrito/${itemId}`, {
      method: "DELETE",
    });
  },

  // Orders endpoints
  getPedidos: async () => {
    return apiCall("/pedidos", {
      method: "GET",
    });
  },

  crearPedido: async (direccionEnvioId, metodoPago = null) => {
    const body = { DireccionEnvioID: direccionEnvioId };
    if (metodoPago) {
      body.MetodoPago = metodoPago;
    }
    return apiCall("/pedidos", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  procesarPagoTarjeta: async (payload) => {
    return apiCall("/pagos/procesar-tarjeta", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  checkCreditoCliente: async () => {
    return apiCall("/cliente/check-auth-credit", {
      method: "GET",
    });
  },

  getPerfilCredito: async () => {
    return apiCall("/cliente/perfil-credito", {
      method: "GET",
    });
  },

  finalizarPedido: async (payload) => {
    return apiCall("/pedidos/finalizar", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  finalizarPedidoTransferencia: async (formData) => {
    const token = getEffectiveToken();
    const headers = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/pedidos/finalizar`, {
        method: "POST",
        headers,
        credentials: 'include',
        body: formData,
      });

      let data = {};
      try {
        data = await response.json();
      } catch (error) {
        console.warn("No se pudo parsear la respuesta JSON:", error);
      }

      // Manejo de sesión expirada sin limpiar auth si la respuesta es exitosa
      if (response.status === 401) {
        clearAuthData();
        if (!sessionExpiredHandled) {
          sessionExpiredHandled = true;
          if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
            Swal.fire({
              icon: "warning",
              title: "Sesión Expirada",
              text: "Tu sesión ha expirado. Por favor, inicia sesión nuevamente.",
              confirmButtonText: "Ir al Login",
              confirmButtonColor: "#F97316",
              allowOutsideClick: false,
            }).then(() => {
              window.location.href = "/login.html";
            });
          } else {
            window.location.href = "/login.html";
          }
        }
        throw new Error("Sesión expirada");
      }

      return {
        ok: response.ok,
        status: response.status,
        data,
      };
    } catch (error) {
      console.error("Error en finalizarPedidoTransferencia:", error);
      throw error;
    }
  },

  getInfoTransferencia: async () => {
    return apiCall("/pagos/info-transferencia", {
      method: "GET",
    });
  },

  // Direcciones endpoints
  getEstados: async () => {
    return apiCall("/public/estados", {
      method: "GET",
    });
  },

  getDirecciones: async () => {
    return apiCall("/direcciones", {
      method: "GET",
    });
  },

  crearDireccion: async (formData) => {
    return apiCall("/direcciones", {
      method: "POST",
      body: JSON.stringify(formData),
    });
  },

  actualizarDireccion: async (direccionId, formData) => {
    return apiCall(`/direcciones/${direccionId}`, {
      method: "PUT",
      body: JSON.stringify(formData),
    });
  },

  // Agentes endpoints
  vincularClienteAgente: async (clienteId) => {
    return apiCall("/agentes/vincular-cliente", {
      method: "POST",
      body: JSON.stringify({ clienteId }),
    });
  },

  obtenerClientesDisponibles: async () => {
    return apiCall("/agentes/clientes-disponibles", {
      method: "GET",
    });
  },

  obtenerClientesAgente: async (searchTerm = "") => {
    const query = searchTerm
      ? `/agente/clientes?search=${encodeURIComponent(searchTerm)}`
      : "/agente/clientes";

    return apiCall(query, {
      method: "GET",
    });
  },

  obtenerDashboardAgente: async () => {
    return apiCall("/agente/dashboard-stats", {
      method: "GET",
    });
  },

  obtenerPedidosAgente: async (estatus = "") => {
    const query = estatus
      ? `/agente/pedidos?estatus=${encodeURIComponent(estatus)}`
      : "/agente/pedidos";

    return apiCall(query, {
      method: "GET",
    });
  },

  obtenerPedidoDetalleAgente: async (pedidoId) => {
    return apiCall(`/agente/pedidos/${pedidoId}`, {
      method: "GET",
    });
  },

  actualizarEstatusPedidoAgente: async (pedidoId, estatus) => {
    return apiCall(`/agente/pedidos/${pedidoId}/estatus`, {
      method: "PUT",
      body: JSON.stringify({ estatus }),
    });
  },

  solicitarCambioEstatusPedidoAgente: async (pedidoId, nuevoEstatus) => {
    return apiCall(`/agente/pedidos/${pedidoId}/solicitar-estatus`, {
      method: "POST",
      body: JSON.stringify({ nuevoEstatus }),
    });
  },

  obtenerPedidoDetalle: async (pedidoId) => {
    return apiCall(`/admin/pedidos/${pedidoId}/detalle`, {
      method: "GET",
    });
  },

  obtenerComisionesAgente: async () => {
    return apiCall("/agente/comisiones", {
      method: "GET",
    });
  },

  // Exponerapi Call genérico para uso en páginas admin
  apiCall: apiCall,
};

/**
 * Wrapper function for fetch with automatic authentication
 * Used by admin pages for direct fetch calls
 */
const fetchWithAuth = async (url, options = {}) => {
  const token = getEffectiveToken();
  
  const config = {
    ...options,
    headers: {
      ...options.headers,
    },
    credentials: 'include',
  };

  // Only add Authorization header if token exists and is not null/undefined
  if (token && token !== 'null' && token !== 'undefined') {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is an object and not FormData, stringify it
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    config.body = JSON.stringify(options.body);
    if (!config.headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json';
    }
  }

  try {
    const response = await fetch(url, config);

    // Handle 403 Forbidden (permission denied) - show alert but don't logout
    if (response.status === 403) {
      console.error("❌ [FETCH] Acceso denegado (403):", url);
      
      if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
        Swal.fire({
          icon: "error",
          title: "Acceso Denegado",
          text: "No tienes permisos para acceder a este recurso. Si crees que esto es un error, contacta al administrador.",
          confirmButtonText: "Entendido",
          confirmButtonColor: "#F97316",
        });
      }
      
      return response;
    }

    // Handle 401 Unauthorized (expired token) - logout and redirect
    if (response.status === 401) {
      clearAuthData();
      
      if (!sessionExpiredHandled) {
        sessionExpiredHandled = true;
        
        if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
          Swal.fire({
            icon: "warning",
            title: "Sesión Expirada",
            text: "Tu sesión ha expirado por seguridad. Por favor, inicia sesión nuevamente.",
            confirmButtonText: "Ir al Login",
            confirmButtonColor: "#F97316",
            allowOutsideClick: false,
          }).then(() => {
            window.location.href = "/login.html";
          });
        } else {
          console.warn("Sesión expirada. Redirigiendo a login...");
          window.location.href = "/login.html";
        }
      }
    }

    return response;
  } catch (error) {
    console.error("Fetch error:", error);
    throw error;
  }
};

// Utility function to show toast notifications
const showToast = (message, type = "info") => {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 100);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
};
