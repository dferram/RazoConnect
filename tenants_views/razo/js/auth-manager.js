/**
 * AUTH MANAGER - Sistema Centralizado de Autenticación
 * 
 * Gestiona Access Tokens (1h) + Refresh Tokens (30d) con silent refresh automático
 * Compatible con el sistema multi-rol: cliente, agente, admin, super_admin
 * 
 * @module auth-manager
 * @version 2.0.0
 * @date 2026-02-28
 */

const AuthManager = (() => {
  // ============================================================================
  // CONSTANTES
  // ============================================================================
  const TOKEN_KEYS = {
    // Cliente
    CLIENT_ACCESS: 'razoconnect_access_token',
    CLIENT_REFRESH: 'razoconnect_refresh_token',
    CLIENT_USER: 'razoconnect_user',
    
    // Admin
    ADMIN_ACCESS: 'razoconnect_admin_access_token',
    ADMIN_REFRESH: 'razoconnect_admin_refresh_token',
    ADMIN_USER: 'razoconnect_admin',
    
    // Agente
    AGENT_ACCESS: 'razoconnect_agent_access_token',
    AGENT_REFRESH: 'razoconnect_agent_refresh_token',
    AGENT_USER: 'razoconnect_agent',
    
    // Legacy (mantener para compatibilidad temporal)
    LEGACY_CLIENT: 'razoconnect_token',
    LEGACY_ADMIN: 'razoconnect_admin_token',
    LEGACY_AGENT: 'razoconnect_agent_token',
  };

  const API_BASE_URL = `${window.location.origin}/api`;
  
  // Flag para evitar múltiples refresh simultáneos
  let isRefreshing = false;
  let refreshSubscribers = [];
  
  // Contador para retry con exponential backoff
  let refreshRetryCount = 0;
  const MAX_REFRESH_RETRIES = 3;
  const RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

  // ============================================================================
  // DETECCIÓN DE CONTEXTO
  // ============================================================================
  
  /**
   * Detecta el contexto actual (cliente, admin, agente) basado en la URL
   * @returns {string} 'cliente' | 'admin' | 'agente'
   */
  const detectContext = () => {
    const path = window.location.pathname.toLowerCase();
    
    if (path.includes('/agente')) return 'agente';
    if (path.startsWith('/admin')) return 'admin';
    return 'cliente';
  };

  /**
   * Obtiene las claves de storage según el contexto
   * @param {string} context - Contexto actual
   * @returns {Object} Objeto con claves de access, refresh y user
   */
  const getKeysForContext = (context) => {
    switch (context) {
      case 'admin':
        return {
          access: TOKEN_KEYS.ADMIN_ACCESS,
          refresh: TOKEN_KEYS.ADMIN_REFRESH,
          user: TOKEN_KEYS.ADMIN_USER,
          legacyToken: TOKEN_KEYS.LEGACY_ADMIN,
        };
      case 'agente':
        return {
          access: TOKEN_KEYS.AGENT_ACCESS,
          refresh: TOKEN_KEYS.AGENT_REFRESH,
          user: TOKEN_KEYS.AGENT_USER,
          legacyToken: TOKEN_KEYS.LEGACY_AGENT,
        };
      default: // cliente
        return {
          access: TOKEN_KEYS.CLIENT_ACCESS,
          refresh: TOKEN_KEYS.CLIENT_REFRESH,
          user: TOKEN_KEYS.CLIENT_USER,
          legacyToken: TOKEN_KEYS.LEGACY_CLIENT,
        };
    }
  };

  // ============================================================================
  // GESTIÓN DE TOKENS
  // ============================================================================

  /**
   * Guarda los tokens de autenticación
   * @param {string} accessToken - Access token (1h)
   * @param {string} refreshToken - Refresh token (30d)
   * @param {Object} userData - Datos del usuario
   * @param {string} context - Contexto (opcional, se detecta automáticamente)
   */
  const saveTokens = (accessToken, refreshToken, userData, context = null) => {
    const ctx = context || detectContext();
    const keys = getKeysForContext(ctx);

    localStorage.setItem(keys.access, accessToken);
    localStorage.setItem(keys.refresh, refreshToken);
    localStorage.setItem(keys.user, JSON.stringify(userData));

    // Mantener token legacy para compatibilidad temporal
    localStorage.setItem(keys.legacyToken, accessToken);

    console.log(`✅ [AuthManager] Tokens guardados para contexto: ${ctx}`);
  };

  /**
   * Obtiene el access token actual
   * @param {string} context - Contexto (opcional)
   * @returns {string|null} Access token o null
   */
  const getAccessToken = (context = null) => {
    const ctx = context || detectContext();
    const keys = getKeysForContext(ctx);
    
    // Intentar obtener nuevo token primero
    let token = localStorage.getItem(keys.access);
    
    // Fallback a token legacy si no existe el nuevo
    if (!token) {
      token = localStorage.getItem(keys.legacyToken);
    }
    
    return token;
  };

  /**
   * Obtiene el refresh token actual
   * @param {string} context - Contexto (opcional)
   * @returns {string|null} Refresh token o null
   */
  const getRefreshToken = (context = null) => {
    const ctx = context || detectContext();
    const keys = getKeysForContext(ctx);
    return localStorage.getItem(keys.refresh);
  };

  /**
   * Obtiene los datos del usuario
   * @param {string} context - Contexto (opcional)
   * @returns {Object|null} Datos del usuario o null
   */
  const getUserData = (context = null) => {
    const ctx = context || detectContext();
    const keys = getKeysForContext(ctx);
    const data = localStorage.getItem(keys.user);
    
    if (!data) return null;
    
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('[AuthManager] Error al parsear datos de usuario:', error);
      return null;
    }
  };

  /**
   * Limpia todos los tokens del contexto actual
   * @param {string} context - Contexto (opcional)
   */
  const clearTokens = (context = null) => {
    const ctx = context || detectContext();
    const keys = getKeysForContext(ctx);

    localStorage.removeItem(keys.access);
    localStorage.removeItem(keys.refresh);
    localStorage.removeItem(keys.user);
    localStorage.removeItem(keys.legacyToken);

    console.log(`🗑️  [AuthManager] Tokens limpiados para contexto: ${ctx}`);
  };

  /**
   * Verifica si el usuario está autenticado
   * @param {string} context - Contexto (opcional)
   * @returns {boolean}
   */
  const isAuthenticated = (context = null) => {
    const accessToken = getAccessToken(context);
    const refreshToken = getRefreshToken(context);
    
    // Está autenticado si tiene al menos el refresh token
    return !!(accessToken || refreshToken);
  };

  // ============================================================================
  // DECODIFICACIÓN Y VALIDACIÓN DE JWT
  // ============================================================================

  /**
   * Decodifica un JWT sin verificar la firma
   * @param {string} token - JWT token
   * @returns {Object|null} Payload decodificado o null
   */
  const decodeToken = (token) => {
    if (!token) return null;
    
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch (error) {
      console.error('[AuthManager] Error al decodificar token:', error);
      return null;
    }
  };

  /**
   * Verifica si un token está expirado
   * @param {string} token - JWT token
   * @returns {boolean} true si está expirado
   */
  const isTokenExpired = (token) => {
    const payload = decodeToken(token);
    if (!payload || !payload.exp) return true;
    
    // Agregar margen de 30 segundos para evitar race conditions
    const expirationTime = payload.exp * 1000;
    const currentTime = Date.now() + 30000;
    
    return currentTime >= expirationTime;
  };

  /**
   * Obtiene el rol normalizado del token
   * @param {string} token - JWT token
   * @returns {string|null} Rol normalizado o null
   */
  const getRoleFromToken = (token) => {
    const payload = decodeToken(token);
    return payload?.rol || null;
  };

  // ============================================================================
  // SILENT REFRESH (Renovación Automática de Tokens)
  // ============================================================================

  /**
   * Suscribe una función para ser llamada cuando el refresh termine
   * @param {Function} callback - Función a llamar con el nuevo access token
   */
  const subscribeTokenRefresh = (callback) => {
    refreshSubscribers.push(callback);
  };

  /**
   * Notifica a todos los suscriptores que el refresh terminó
   * @param {string} newAccessToken - Nuevo access token
   */
  const onRefreshComplete = (newAccessToken) => {
    refreshSubscribers.forEach(callback => callback(newAccessToken));
    refreshSubscribers = [];
  };

  /**
   * Renueva el access token usando el refresh token
   * @param {string} context - Contexto (opcional)
   * @returns {Promise<string|null>} Nuevo access token o null si falla
   */
  const refreshAccessToken = async (context = null, retryCount = 0) => {
    const ctx = context || detectContext();
    const refreshToken = getRefreshToken(ctx);

    if (!refreshToken) {
      console.error('[AuthManager] No hay refresh token disponible');
      return null;
    }

    // Si ya hay un refresh en progreso, esperar a que termine
    if (isRefreshing) {
      console.log('[AuthManager] Refresh en progreso, esperando...');
      return new Promise((resolve) => {
        subscribeTokenRefresh((newToken) => {
          resolve(newToken);
        });
      });
    }

    isRefreshing = true;
    refreshRetryCount = retryCount;

    try {
      console.log(`🔄 [AuthManager] Renovando access token... (intento ${retryCount + 1}/${MAX_REFRESH_RETRIES})`);
      console.log(`[AuthManager] Refresh token presente: ${!!refreshToken}`);
      console.log(`[AuthManager] Contexto actual: ${ctx}`);

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      const data = await response.json();
      console.log(`[AuthManager] Respuesta del servidor:`, {
        status: response.status,
        success: data.success,
        message: data.message
      });

      if (response.ok && data.success && data.data.accessToken) {
        const newAccessToken = data.data.accessToken;
        const keys = getKeysForContext(ctx);

        // Guardar nuevo access token
        localStorage.setItem(keys.access, newAccessToken);
        localStorage.setItem(keys.legacyToken, newAccessToken); // Legacy

        console.log('✅ [AuthManager] Access token renovado exitosamente');
        console.log(`[AuthManager] Nuevo token guardado para contexto: ${ctx}`);

        // Resetear contador de retries
        refreshRetryCount = 0;

        // Notificar a suscriptores
        onRefreshComplete(newAccessToken);
        isRefreshing = false;

        return newAccessToken;
      } else {
        console.error(`[AuthManager] Refresh token inválido o expirado: ${data.message}`);
        
        // Si es un error de red o servidor y tenemos reintentos disponibles
        if (!response.ok && retryCount < MAX_REFRESH_RETRIES - 1) {
          const delay = RETRY_DELAYS[retryCount];
          console.log(`[AuthManager] Reintentando en ${delay}ms... (${retryCount + 1}/${MAX_REFRESH_RETRIES})`);
          
          // Esperar con exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          
          isRefreshing = false;
          return refreshAccessToken(context, retryCount + 1);
        }
        
        // Refresh token inválido o expirado, o se acabaron los reintentos
        console.error('[AuthManager] No se pudo renovar el token - limpiando sesión');
        
        // Limpiar tokens y redirigir a login
        clearTokens(ctx);
        isRefreshing = false;
        onRefreshComplete(null);

        // Mostrar modal de sesión expirada
        showSessionExpiredModal();

        return null;
      }
    } catch (error) {
      console.error(`[AuthManager] Error al renovar token (intento ${retryCount + 1}):`, error);
      
      // Si es un error de red y tenemos reintentos disponibles
      if (retryCount < MAX_REFRESH_RETRIES - 1) {
        const delay = RETRY_DELAYS[retryCount];
        console.log(`[AuthManager] Error de red, reintentando en ${delay}ms... (${retryCount + 1}/${MAX_REFRESH_RETRIES})`);
        
        // Esperar con exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        
        isRefreshing = false;
        return refreshAccessToken(context, retryCount + 1);
      }
      
      // Se acabaron los reintentos
      console.error('[AuthManager] Máximo de reintentos alcanzado - limpiando sesión');
      isRefreshing = false;
      onRefreshComplete(null);
      
      // Limpiar tokens y mostrar modal
      clearTokens(ctx);
      showSessionExpiredModal();
      
      return null;
    }
  };

  /**
   * Muestra modal de sesión expirada y redirige a login
   */
  const showSessionExpiredModal = () => {
    if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
      Swal.fire({
        icon: 'warning',
        title: 'Sesión Expirada',
        text: 'Tu sesión ha expirado por seguridad. Por favor, inicia sesión nuevamente.',
        confirmButtonText: 'Ir al Login',
        confirmButtonColor: '#F97316',
        allowOutsideClick: false,
      }).then(() => {
        window.location.href = '/login.html';
      });
    } else {
      alert('Tu sesión ha expirado. Serás redirigido al login.');
      window.location.href = '/login.html';
    }
  };

  // ============================================================================
  // FETCH CON SILENT REFRESH (Interceptor Automático)
  // ============================================================================

  /**
   * Wrapper de fetch con manejo automático de tokens y silent refresh
   * @param {string} url - URL del endpoint
   * @param {Object} options - Opciones de fetch
   * @returns {Promise<Response>} Response de fetch
   */
  const fetchWithAuth = async (url, options = {}) => {
    const isPublic = options.public === true;
    const context = detectContext();
    let accessToken = getAccessToken(context);

    // Verificar si el access token está expirado (solo para endpoints privados)
    if (!isPublic && accessToken && isTokenExpired(accessToken)) {
      console.log('⏰ [AuthManager] Access token expirado, renovando...');
      accessToken = await refreshAccessToken(context);
      
      if (!accessToken) {
        // No se pudo renovar, el usuario será redirigido
        throw new Error('No se pudo renovar el access token');
      }
    }

    // Configurar headers
    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include',
    };

    // Agregar Authorization header si hay token
    if (accessToken && accessToken !== 'null' && accessToken !== 'undefined') {
      config.headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // Stringify body si es objeto y no es FormData
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, config);

      // Si recibimos 401, intentar renovar token y reintentar (solo para endpoints privados)
      if (response.status === 401 && !isPublic) {
        console.log('🔒 [AuthManager] Error 401, intentando renovar token...');

        const newAccessToken = await refreshAccessToken(context);

        if (newAccessToken) {
          // Reintentar request con nuevo token
          config.headers['Authorization'] = `Bearer ${newAccessToken}`;
          
          console.log('🔄 [AuthManager] Reintentando request con nuevo token...');
          const retryResponse = await fetch(url, config);
          
          return retryResponse;
        } else {
          // No se pudo renovar, sesión expirada
          return response;
        }
      }

      return response;
    } catch (error) {
      console.error('[AuthManager] Error en fetchWithAuth:', error);
      throw error;
    }
  };

  /**
   * Wrapper de apiCall compatible con el sistema existente
   * @param {string} endpoint - Endpoint de la API (sin /api)
   * @param {Object} options - Opciones de fetch
   * @returns {Promise<Object>} Objeto con {ok, status, data}
   */
  const apiCall = async (endpoint, options = {}) => {
    const url = `${API_BASE_URL}${endpoint}`;
    
    try {
      const response = await fetchWithAuth(url, options);
      
      // Si se solicita blob, retornar directamente
      if (options.responseType === 'blob') {
        return {
          ok: response.ok,
          status: response.status,
          blob: () => response.blob(),
          data: null,
        };
      }

      // Parsear JSON
      let data = {};
      try {
        const text = await response.text();
        if (text && text.length > 0) {
          data = JSON.parse(text);
        }
      } catch (jsonError) {
        console.error('[AuthManager] Error al parsear JSON:', jsonError);
      }

      // Manejo de 403 Forbidden
      if (response.status === 403) {
        if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
          Swal.fire({
            icon: 'error',
            title: 'Acceso Denegado',
            text: 'No tienes permisos para acceder a este recurso.',
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#F97316',
          });
        }
      }

      return {
        ok: response.ok,
        status: response.status,
        data,
      };
    } catch (error) {
      console.error('[AuthManager] Error en apiCall:', error);
      throw error;
    }
  };

  // ============================================================================
  // LOGOUT
  // ============================================================================

  /**
   * Cierra sesión del usuario (invalida refresh token en servidor)
   * @param {string} context - Contexto (opcional)
   * @returns {Promise<boolean>} true si se cerró sesión correctamente
   */
  const logout = async (context = null) => {
    const ctx = context || detectContext();
    const userData = getUserData(ctx);

    if (userData && userData.id && userData.rol) {
      try {
        // Llamar al endpoint de logout para invalidar refresh token en Redis
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: userData.id,
            rol: userData.rol,
          }),
        });

        console.log('✅ [AuthManager] Sesión cerrada en servidor');
      } catch (error) {
        console.error('[AuthManager] Error al cerrar sesión en servidor:', error);
      }
    }

    // Limpiar tokens locales
    clearTokens(ctx);

    return true;
  };

  // ============================================================================
  // API PÚBLICA
  // ============================================================================

  return {
    // Gestión de tokens
    saveTokens,
    getAccessToken,
    getRefreshToken,
    getUserData,
    clearTokens,
    isAuthenticated,
    
    // Decodificación
    decodeToken,
    isTokenExpired,
    getRoleFromToken,
    
    // Refresh
    refreshAccessToken,
    
    // Fetch con auth
    fetchWithAuth,
    apiCall,
    
    // Logout
    logout,
    
    // Utilidades
    detectContext,
    
    // Constantes (para acceso externo si es necesario)
    TOKEN_KEYS,
  };
})();

// Exportar globalmente
window.AuthManager = AuthManager;

console.log('✅ [AuthManager] Módulo cargado correctamente');
