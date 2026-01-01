/**
 * JWT Utilities
 * Funciones de utilidad para trabajar con JWT en el frontend
 * Útil para debugging y verificación de roles
 */

/**
 * Decodifica el payload de un JWT sin verificar la firma
 * @param {string} token - El token JWT
 * @returns {object|null} El payload decodificado o null si hay error
 */
function decodeJWT(token) {
  try {
    if (!token) return null;

    // JWT tiene 3 partes separadas por puntos: header.payload.signature
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    // Decodificar el payload (segunda parte)
    const payload = parts[1];
    // Reemplazar caracteres URL-safe de base64
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    // Decodificar base64
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Error decodificando JWT:", error);
    return null;
  }
}

/**
 * Obtiene y decodifica el token del admin actual
 * @returns {object|null} El payload del token o null
 */
function getAdminTokenPayload() {
  const token = localStorage.getItem("razoconnect_admin_token");
  return decodeJWT(token);
}

/**
 * Verifica si el usuario actual es super-admin
 * @returns {boolean} true si es super-admin
 */
function checkIsSuperAdmin() {
  const payload = getAdminTokenPayload();
  if (!payload) {
    return false;
  }

  // Verificar si tiene el rol de super-admin en el array de roles
  if (Array.isArray(payload.roles)) {
    const isSuperAdmin = payload.roles.some(
      (role) =>
        role &&
        (role.toLowerCase() === "superadmin" ||
          role.toLowerCase() === "super-admin")
    );

    if (isSuperAdmin) {
      console.log("✅ El usuario ES super-administrador");
      return true;
    }
  }

  // Verificar el campo 'rol' individual
  if (payload.rol) {
    const isSuperAdmin =
      payload.rol.toLowerCase() === "superadmin" ||
      payload.rol.toLowerCase() === "super-admin";

    if (isSuperAdmin) {
      return true;
    }
  }
  return false;
}

/**
 * Muestra información completa del token en consola
 */
function debugToken() {
  const token = localStorage.getItem("razoconnect_admin_token");

  if (!token) {
    return;
  }

  const payload = decodeJWT(token);
  if (!payload) {
    return;
  }

  checkIsSuperAdmin();
}

// Exponer funciones globalmente para uso en consola
window.jwtUtils = {
  decode: decodeJWT,
  getAdminPayload: getAdminTokenPayload,
  isSuperAdmin: checkIsSuperAdmin,
  debug: debugToken,
};

