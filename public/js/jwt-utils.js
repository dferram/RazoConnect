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
    console.log("❌ No hay token de admin");
    return false;
  }

  console.log("📋 Información del token:");
  console.log("- Email:", payload.email);
  console.log("- Rol:", payload.rol);
  console.log("- Roles:", payload.roles);
  console.log("- Tipo:", payload.tipo);

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
      console.log("✅ El usuario ES super-administrador");
      return true;
    }
  }

  console.log("❌ El usuario NO es super-administrador");
  return false;
}

/**
 * Muestra información completa del token en consola
 */
function debugToken() {
  console.log("🔍 === DEBUG TOKEN ===");
  const token = localStorage.getItem("razoconnect_admin_token");

  if (!token) {
    console.log("❌ No hay token de admin en localStorage");
    return;
  }

  console.log(
    "Token (primeros 50 caracteres):",
    token.substring(0, 50) + "..."
  );

  const payload = decodeJWT(token);
  if (!payload) {
    console.log("❌ No se pudo decodificar el token");
    return;
  }

  console.log("\n📦 Payload completo:");
  console.log(JSON.stringify(payload, null, 2));

  console.log("\n🔐 Verificación de permisos:");
  checkIsSuperAdmin();

  console.log("\n⏰ Información de expiración:");
  if (payload.exp) {
    const expirationDate = new Date(payload.exp * 1000);
    const now = new Date();
    const isExpired = expirationDate < now;

    console.log("- Expira el:", expirationDate.toLocaleString());
    console.log("- Estado:", isExpired ? "❌ EXPIRADO" : "✅ VÁLIDO");

    if (!isExpired) {
      const hoursRemaining = Math.floor(
        (expirationDate - now) / 1000 / 60 / 60
      );
      const minutesRemaining = Math.floor(
        ((expirationDate - now) / 1000 / 60) % 60
      );
      console.log(`- Tiempo restante: ${hoursRemaining}h ${minutesRemaining}m`);
    }
  }

  console.log("\n===================");
}

// Exponer funciones globalmente para uso en consola
window.jwtUtils = {
  decode: decodeJWT,
  getAdminPayload: getAdminTokenPayload,
  isSuperAdmin: checkIsSuperAdmin,
  debug: debugToken,
};

console.log("✅ JWT Utils cargado. Usa window.jwtUtils o directamente:");
console.log("  - jwtUtils.debug()      -> Ver información completa del token");
console.log("  - jwtUtils.isSuperAdmin() -> Verificar si eres super-admin");
