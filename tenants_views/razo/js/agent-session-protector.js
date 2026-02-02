/**
 * AGENT SESSION PROTECTOR
 * Protección global contra limpieza accidental de tokens de agente
 * Este script intercepta intentos de limpiar tokens y los bloquea si el usuario es agente
 */

(function() {
  "use strict";

  // Guardar referencias originales
  const originalRemoveItem = Storage.prototype.removeItem;
  const originalGetItem = Storage.prototype.getItem;

  // Sobrescribir removeItem para proteger tokens de agente
  Storage.prototype.removeItem = function(key) {
    // Solo proteger tokens de admin (que usan los agentes)
    if (key === "razoconnect_admin_token" || key === "razoconnect_admin") {
      try {
        // Verificar si el usuario actual es un agente (usando método original para evitar recursión)
        const adminDataStr = originalGetItem.call(localStorage, "razoconnect_admin");
        const adminData = adminDataStr ? JSON.parse(adminDataStr) : null;
        
        const isAgent = adminData?.rol === "agente" || adminData?.esAgente === true;
        
        if (isAgent) {
          // Obtener stack trace para saber quién está intentando limpiar
          const stack = new Error().stack;
          const isLogoutAction = stack && (
            stack.includes("handleLogout") ||
            stack.includes("btnLogout") ||
            stack.includes("linkLogout") ||
            stack.includes("Cerrar Sesión")
          );
          
          if (isLogoutAction) {
            // Es un logout explícito - permitir limpieza
            console.log("✅ Logout explícito detectado - permitiendo limpieza de tokens");
            return originalRemoveItem.call(this, key);
          } else {
            // NO es logout explícito - bloquear limpieza
            console.warn("🛡️ PROTECCIÓN DE SESIÓN DE AGENTE ACTIVADA");
            console.warn(`Bloqueado intento de limpiar: ${key}`);
            console.warn("La sesión del agente se mantendrá activa");
            console.trace("Stack trace del intento de limpieza:");
            return; // NO limpiar
          }
        }
      } catch (error) {
        console.error("Error en protección de sesión:", error);
      }
    }
    
    // Para cualquier otra key o si no es agente, comportamiento normal
    return originalRemoveItem.call(this, key);
  };

  console.log("🛡️ Protector de sesión de agente activado");
})();
