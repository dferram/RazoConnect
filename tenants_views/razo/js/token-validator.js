/**
 * VALIDADOR DE TOKENS LEGACY
 * 
 * Este script detecta si el usuario tiene tokens con formato viejo
 * y fuerza un logout para generar tokens frescos con la nueva estructura.
 * 
 * DEBE CARGARSE ANTES QUE CUALQUIER OTRO SCRIPT
 */

(function() {
  'use strict';

  /**
   * Decodifica un JWT sin verificar la firma
   */
  function decodeJWT(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Verifica si un token es válido (nuevo o legacy)
   */
  function isTokenValid(token) {
    if (!token) return false;
    
    const payload = decodeJWT(token);
    if (!payload) return false;

    // Un token es válido si tiene:
    // 1. ID de usuario (id o userId)
    // 2. Rol válido (rol, tipo, o roles array)
    // 3. Estructura JWT correcta (3 partes)
    
    const hasUserId = typeof payload.id === 'number' || typeof payload.userId === 'number';
    
    // Verificar rol en cualquier formato
    const hasRol = typeof payload.rol === 'string' || 
                   typeof payload.tipo === 'string' || 
                   (Array.isArray(payload.roles) && payload.roles.length > 0);
    
    // Verificar que el rol sea válido
    const validRoles = ['super_admin', 'superadmin', 'admin', 'agente', 'cliente'];
    let hasValidRol = false;
    
    if (payload.rol) {
      hasValidRol = validRoles.includes(payload.rol.toLowerCase());
    } else if (payload.tipo) {
      hasValidRol = validRoles.includes(payload.tipo.toLowerCase());
    } else if (Array.isArray(payload.roles)) {
      hasValidRol = payload.roles.some(r => validRoles.includes(String(r).toLowerCase()));
    }

    return hasUserId && hasRol && hasValidRol;
  }

  /**
   * Limpia todos los tokens y datos de usuario
   */
  function clearAllAuthData() {
    const keysToRemove = [
      // Cliente
      'razoconnect_token',
      'razoconnect_user',
      'razoconnect_access_token',
      'razoconnect_refresh_token',
      'usuario',
      
      // Admin
      'razoconnect_admin_token',
      'razoconnect_admin',
      'razoconnect_admin_access_token',
      'razoconnect_admin_refresh_token',
      
      // Agente
      'razoconnect_agent_token',
      'razoconnect_agent',
      'razoconnect_agent_access_token',
      'razoconnect_agent_refresh_token',
    ];

    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        // Ignorar errores
      }
    });
  }

  /**
   * Valida todos los tokens almacenados
   */
  function validateStoredTokens() {
    const tokensToCheck = [
      'razoconnect_token',           // Cliente
      'razoconnect_admin_token',     // Admin
      'razoconnect_agent_token',     // Agente
    ];

    let hasInvalidToken = false;

    for (const key of tokensToCheck) {
      const token = localStorage.getItem(key);
      if (token && !isTokenValid(token)) {
        console.warn(`[TOKEN VALIDATOR] Token inválido o corrupto detectado: ${key}`);
        hasInvalidToken = true;
      }
    }

    if (hasInvalidToken) {
      console.warn('[TOKEN VALIDATOR] Tokens corruptos detectados. Limpiando y redirigiendo a login...');
      clearAllAuthData();
      
      // Redirigir a login después de un pequeño delay
      setTimeout(() => {
        window.location.href = '/login.html?reason=invalid_token';
      }, 500);
      
      return false; // Detener ejecución de otros scripts
    }

    return true; // Tokens válidos o no hay tokens
  }

  // Ejecutar validación inmediatamente
  const tokensValid = validateStoredTokens();

  // Exportar función para uso manual si es necesario
  window.TokenValidator = {
    validate: validateStoredTokens,
    clear: clearAllAuthData,
    isValid: isTokenValid
  };

  if (tokensValid) {
    console.log('[TOKEN VALIDATOR] Tokens validados correctamente');
  }
})();
