const db = require("../db");

/**
 * Valida que un email no exista en ninguna tabla del sistema
 * Política de Unicidad Global: Un correo = Un rol
 * 
 * @param {string} email - Email a validar
 * @param {string} excludeTable - Tabla a excluir de la validación (opcional)
 * @returns {Promise<{exists: boolean, table: string|null, message: string}>}
 */
async function checkEmailGlobalUniqueness(email, excludeTable = null) {
  try {
    // Realizar las 3 consultas en paralelo para optimizar rendimiento
    const [clienteResult, adminResult, agenteResult] = await Promise.all([
      excludeTable === "clientes"
        ? Promise.resolve({ rows: [] })
        : db.query("SELECT Email FROM clientes WHERE Email = $1", [email]),
      excludeTable === "administradores"
        ? Promise.resolve({ rows: [] })
        : db.query("SELECT Email FROM administradores WHERE Email = $1", [email]),
      excludeTable === "agentesdeventas"
        ? Promise.resolve({ rows: [] })
        : db.query("SELECT Email FROM agentesdeventas WHERE Email = $1", [email]),
    ]);

    // Verificar en qué tabla existe el email
    if (clienteResult.rows.length > 0) {
      return {
        exists: true,
        table: "clientes",
        message: "Este correo ya está registrado en el sistema como cliente.",
      };
    }

    if (adminResult.rows.length > 0) {
      return {
        exists: true,
        table: "administradores",
        message: "Este correo ya está registrado en el sistema como administrador.",
      };
    }

    if (agenteResult.rows.length > 0) {
      return {
        exists: true,
        table: "agentesdeventas",
        message: "Este correo ya está registrado en el sistema como agente de ventas.",
      };
    }

    // Email disponible
    return {
      exists: false,
      table: null,
      message: "Email disponible",
    };
  } catch (error) {
    console.error("Error en checkEmailGlobalUniqueness:", error);
    throw error;
  }
}

/**
 * Genera mensaje de error contextual según el tipo de registro
 * @param {string} existingTable - Tabla donde existe el email
 * @param {string} attemptedRole - Rol que se intenta registrar
 * @returns {string}
 */
function getContextualErrorMessage(existingTable, attemptedRole) {
  const roleMap = {
    clientes: "cliente",
    administradores: "administrador",
    agentesdeventas: "agente de ventas",
  };

  const existingRole = roleMap[existingTable] || "usuario";
  const newRole = roleMap[attemptedRole] || "usuario";

  // Mensajes específicos según el contexto
  if (attemptedRole === "clientes") {
    if (existingTable === "administradores" || existingTable === "agentesdeventas") {
      return "Este correo ya está registrado en el sistema (posiblemente como staff). Por favor, use otro correo.";
    }
  }

  if (attemptedRole === "administradores") {
    if (existingTable === "clientes") {
      return "Este correo ya está asociado a una cuenta de cliente. Por favor, use otro correo.";
    }
    if (existingTable === "agentesdeventas") {
      return "Este correo ya está asociado a una cuenta de agente. Por favor, use otro correo.";
    }
  }

  if (attemptedRole === "agentesdeventas") {
    if (existingTable === "administradores") {
      return "Este correo ya está ocupado por un administrador. Por favor, use otro correo.";
    }
    if (existingTable === "clientes") {
      return "Este correo ya está ocupado por un cliente. Por favor, use otro correo.";
    }
  }

  return `Este correo ya está registrado en el sistema como ${existingRole}.`;
}

module.exports = {
  checkEmailGlobalUniqueness,
  getContextualErrorMessage,
};
