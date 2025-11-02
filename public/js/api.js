// API Configuration
const API_BASE_URL = 'http://localhost:3000/api';

// Utility function to get JWT token from localStorage
const getToken = () => {
  return localStorage.getItem('razoconnect_token');
};

// Utility function to get user data from localStorage
const getUserData = () => {
  const userData = localStorage.getItem('razoconnect_user');
  return userData ? JSON.parse(userData) : null;
};

// Utility function to save auth data
const saveAuthData = (token, userData) => {
  localStorage.setItem('razoconnect_token', token);
  localStorage.setItem('razoconnect_user', JSON.stringify(userData));
};

// Utility function to clear auth data
const clearAuthData = () => {
  localStorage.removeItem('razoconnect_token');
  localStorage.removeItem('razoconnect_user');
};

// Utility function to check if user is logged in
const isAuthenticated = () => {
  return !!getToken();
};

// Utility function to redirect if not authenticated
const requireAuth = () => {
  if (!isAuthenticated()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
};

// API call wrapper with automatic token handling
const apiCall = async (endpoint, options = {}) => {
  const token = getToken();
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  // Add authorization header if token exists
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    // Handle unauthorized (token expired or invalid)
    if (response.status === 401) {
      clearAuthData();
      window.location.href = '/login.html';
      throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

// API Methods
const API = {
  // Auth endpoints
  login: async (email, password) => {
    return apiCall('/login', {
      method: 'POST',
      body: JSON.stringify({ Email: email, Password: password })
    });
  },

  registroCliente: async (formData) => {
    return apiCall('/registro/cliente', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
  },

  // Products endpoints
  getProductos: async (queryString = '') => {
    return apiCall(`/productos${queryString}`, {
      method: 'GET'
    });
  },

  getDimensiones: async () => {
    return apiCall('/productos/dimensiones', {
      method: 'GET'
    });
  },

  getProductoById: async (id) => {
    return apiCall(`/productos/${id}`, {
      method: 'GET'
    });
  },

  // Cart endpoints
  getCarrito: async () => {
    return apiCall('/carrito', {
      method: 'GET'
    });
  },

  agregarAlCarrito: async (varianteId, cantidadPaquetes) => {
    return apiCall('/carrito', {
      method: 'POST',
      body: JSON.stringify({ 
        VarianteID: varianteId, 
        CantidadPaquetes: cantidadPaquetes 
      })
    });
  },

  actualizarCarrito: async (varianteId, cantidadPaquetes) => {
    return apiCall(`/carrito/${varianteId}`, {
      method: 'PUT',
      body: JSON.stringify({ 
        CantidadPaquetes: cantidadPaquetes 
      })
    });
  },

  eliminarDelCarrito: async (varianteId) => {
    return apiCall(`/carrito/${varianteId}`, {
      method: 'DELETE'
    });
  },

  // Orders endpoints
  getPedidos: async () => {
    return apiCall('/pedidos', {
      method: 'GET'
    });
  },

  crearPedido: async (direccionEnvioId, agenteId = null) => {
    const body = { DireccionEnvioID: direccionEnvioId };
    if (agenteId) {
      body.AgenteID = agenteId;
    }
    return apiCall('/pedidos', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  // Direcciones endpoints
  getDirecciones: async () => {
    return apiCall('/direcciones', {
      method: 'GET'
    });
  },

  crearDireccion: async (formData) => {
    return apiCall('/direcciones', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
  }
};

// Utility function to show toast notifications
const showToast = (message, type = 'info') => {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 100);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
};
