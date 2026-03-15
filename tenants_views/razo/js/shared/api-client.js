/**
 * api-client.js
 * Cliente HTTP centralizado para el panel de administración.
 * Maneja: autenticación automática, timeouts, errores de red, respuestas de error.
 */

const ApiClient = (() => {
  const DEFAULT_TIMEOUT_MS = 15000; // 15 segundos

  /**
   * Obtiene el token JWT del localStorage de forma segura
   */
  const getToken = () => {
    try {
      return localStorage.getItem('razoconnect_admin_token') || localStorage.getItem('adminToken') || localStorage.getItem('token') || null;
    } catch {
      return null;
    }
  };

  /**
   * Fetch con timeout usando AbortController
   */
  const fetchWithTimeout = (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timeoutId));
  };

  /**
   * Método principal de request
   * @param {string} endpoint - Ruta de la API (sin el dominio)
   * @param {object} options - Opciones de fetch
   * @returns {Promise<any>} - Datos de la respuesta
   * @throws {ApiError} - Error estructurado con status y message
   */
  const request = async (endpoint, options = {}) => {
    const token = getToken();

    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    let response;
    try {
      response = await fetchWithTimeout(endpoint, {
        ...options,
        headers,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new ApiError('La solicitud tardó demasiado. Verifica tu conexión.', 408);
      }
      if (!navigator.onLine) {
        throw new ApiError('Sin conexión a internet. Verifica tu red.', 0);
      }
      throw new ApiError('No se pudo conectar con el servidor. Intenta de nuevo.', 0);
    }

    // Manejar respuestas no-ok
    if (!response.ok) {
      let errorMessage = 'Ocurrió un error inesperado.';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // Si no se puede parsear el JSON del error, usar mensaje genérico
      }

      // Manejar 401 globalmente — redirigir al login
      if (response.status === 401) {
        localStorage.removeItem('razoconnect_admin_token');
        localStorage.removeItem('adminToken');
        localStorage.removeItem('token');
        window.location.href = '/login.html';
        throw new ApiError('Sesión expirada. Redirigiendo...', 401);
      }

      throw new ApiError(errorMessage, response.status);
    }

    // Manejar respuestas vacías (204 No Content)
    if (response.status === 204) {
      return null;
    }

    try {
      return await response.json();
    } catch {
      throw new ApiError('La respuesta del servidor no es válida.', 500);
    }
  };

  // Métodos de conveniencia
  const get = (endpoint, options = {}) =>
    request(endpoint, { ...options, method: 'GET' });

  const post = (endpoint, body, options = {}) =>
    request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });

  const put = (endpoint, body, options = {}) =>
    request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });

  const patch = (endpoint, body, options = {}) =>
    request(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) });

  const del = (endpoint, options = {}) =>
    request(endpoint, { ...options, method: 'DELETE' });

  return { get, post, put, patch, delete: del, request };
})();

/**
 * Error estructurado de la API
 */
class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
