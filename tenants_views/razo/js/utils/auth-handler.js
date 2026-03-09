/**
 * AUTH HANDLER UTILITY
 * Centraliza el manejo de autenticación y errores 401 en todas las páginas admin
 * Previene duplicación de código y asegura comportamiento consistente
 */

const AuthHandler = {
  /**
   * Obtiene el token del localStorage y valida su existencia
   * @returns {string|null} Token JWT o null si no existe
   */
  getToken() {
    const token = localStorage.getItem('razoconnect_admin_token');
    
    if (!token) {
      console.warn('⚠️ No admin token found in localStorage');
      console.warn('Available keys:', Object.keys(localStorage));
      this.redirectToLogin('No se encontró token de autenticación');
      return null;
    }
    
    return token;
  },

  /**
   * Crea headers de autenticación estándar para fetch requests
   * @returns {Object} Headers con Authorization Bearer token
   */
  getAuthHeaders() {
    const token = this.getToken();
    
    if (!token) {
      return null;
    }

    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  },

  /**
   * Maneja respuestas 401 Unauthorized
   * Limpia el localStorage y redirige al login con mensaje apropiado
   * @param {Response} response - Fetch response object
   * @returns {boolean} true si fue 401, false si no
   */
  async handle401(response) {
    if (response.status === 401) {
      console.error('❌ 401 Unauthorized - Token inválido o expirado');
      
      // Usar función segura que verifica si es agente antes de limpiar
      const cleared = window.safeClearAdminTokens ? window.safeClearAdminTokens() : true;
      
      // Si no se limpiaron tokens (es agente), no redirigir
      if (!cleared) {
        console.warn('⚠️ Error 401 pero usuario es agente - manteniendo sesión');
        return true;
      }
      
      await Swal.fire({
        icon: 'warning',
        title: 'Sesión Expirada',
        text: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
        confirmButtonText: 'Ir al Login',
        allowOutsideClick: false,
        allowEscapeKey: false
      });
      
      this.redirectToLogin('session_expired');
      return true;
    }
    
    return false;
  },

  /**
   * Redirige al login con parámetro de error
   * @param {string} errorType - Tipo de error para mostrar en login
   */
  redirectToLogin(errorType = 'session_expired') {
    window.location.href = `/login.html?error=${errorType}`;
  },

  /**
   * Wrapper para fetch que maneja automáticamente autenticación y errores 401
   * @param {string} url - URL del endpoint
   * @param {Object} options - Opciones de fetch (method, body, etc)
   * @returns {Promise<Response>} Response object o null si hay error 401
   */
  async authenticatedFetch(url, options = {}) {
    const headers = this.getAuthHeaders();
    
    if (!headers) {
      return null;
    }

    const fetchOptions = {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {})
      },
      credentials: 'include'
    };

    try {
      const response = await fetch(url, fetchOptions);
      
      if (await this.handle401(response)) {
        return null;
      }

      return response;
    } catch (error) {
      console.error('Error en authenticatedFetch:', error);
      throw error;
    }
  },

  /**
   * Verifica si el usuario tiene un token válido al cargar la página
   * Útil para páginas que requieren autenticación obligatoria
   */
  requireAuth() {
    const token = localStorage.getItem('razoconnect_admin_token');
    
    if (!token) {
      console.warn('⚠️ Página requiere autenticación - Redirigiendo a login');
      this.redirectToLogin('auth_required');
    }
  },

  /**
   * Obtiene información del usuario desde localStorage
   * @returns {Object|null} Objeto con datos del usuario o null
   */
  getUser() {
    try {
      const userStr = localStorage.getItem('razoconnect_admin');
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      console.error('Error al parsear usuario:', error);
      return null;
    }
  },

  /**
   * Verifica si el usuario tiene un rol específico
   * @param {string|Array<string>} roles - Rol o array de roles permitidos
   * @returns {boolean} true si el usuario tiene el rol
   */
  hasRole(roles) {
    const user = this.getUser();
    
    if (!user) return false;

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    const userRoles = Array.isArray(user.roles) ? user.roles : [user.rol];

    return userRoles.some(role => 
      allowedRoles.some(allowed => 
        role.toLowerCase() === allowed.toLowerCase()
      )
    );
  },

  /**
   * Verifica si el usuario tiene rol administrativo
   * Acepta los 7 roles base: super_admin, admin, inventarios, catalogo, finanzas, compras, agente
   * Rechaza solo: cliente
   * @returns {boolean} true si es admin
   */
  isAdmin() {
    const user = this.getUser();
    if (!user) return false;

    const rol = user.rol ? user.rol.toLowerCase() : '';
    
    // Rechazar SOLO clientes
    if (rol === 'cliente') return false;
    
    // Todos los demás roles son administrativos
    return true;
  }
};

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.AuthHandler = AuthHandler;
}
