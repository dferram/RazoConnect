// API Configuration
const API_BASE_URL = "http://localhost:3000/api";

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
  const clientToken = getToken();
  if (clientToken) {
    return clientToken;
  }

  // Si hay token de admin, usarlo (para admins y agentes)
  const adminToken = getAdminToken();
  if (adminToken) {
    return adminToken;
  }

  return null;
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
  localStorage.removeItem("razoconnect_token");
  localStorage.removeItem("razoconnect_user");
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_DATA_KEY);
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

// API call wrapper con manejo automático de token y sesión expirada
const apiCall = async (endpoint, options = {}) => {
  const token = getEffectiveToken();

  const config = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  };

  // Add authorization header if token exists
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    // Manejo centralizado de sesión expirada (401)
    if (response.status === 401) {
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

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

// API Methods
const API = {
  // Auth endpoints
  login: async (email, password) => {
    return apiCall("/login", {
      method: "POST",
      body: JSON.stringify({ Email: email, Password: password }),
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
    });
  },

  getDimensiones: async () => {
    return apiCall("/productos/dimensiones", {
      method: "GET",
    });
  },

  getProductoById: async (id) => {
    return apiCall(`/productos/${id}`, {
      method: "GET",
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

  crearPedido: async (direccionEnvioId) => {
    const body = { DireccionEnvioID: direccionEnvioId };
    return apiCall("/pedidos", {
      method: "POST",
      body: JSON.stringify(body),
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

  // Agentes endpoints
  vincularClienteAgente: async (emailCliente) => {
    return apiCall("/agentes/vincular-cliente", {
      method: "POST",
      body: JSON.stringify({ emailCliente }),
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
