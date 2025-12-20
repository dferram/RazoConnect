const db = require("../db");

/**
 * Middleware para validar que el cliente autenticado tiene crédito asignado.
 * - Solo permite rol 'cliente'.
 * - Verifica existencia en cliente_creditos.
 * - Inyecta credito_id en req.creditoId para evitar consultas redundantes.
 */
const checkClienteCredit = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    const rol = (req.user.rol || "").toString().toLowerCase();
    if (rol !== "cliente") {
      return res.status(403).json({
        success: false,
        message: "Acceso restringido al portal de clientes.",
      });
    }

    const clienteId = Number.parseInt(req.user.userId || req.user.id, 10);
    if (!Number.isInteger(clienteId)) {
      return res.status(400).json({
        success: false,
        message: "Identificador de cliente inválido.",
      });
    }

    const {
      rows,
    } = await db.query(
      "SELECT credito_id FROM cliente_creditos WHERE cliente_id = $1 LIMIT 1",
      [clienteId],
    );

    if (!rows.length) {
      return res.status(403).json({
        success: false,
        message:
          "Tu cuenta aún no tiene un plan de crédito asignado. Contacta al administrador.",
      });
    }

    req.creditoId = rows[0].credito_id;
    return next();
  } catch (error) {
    console.error("Error en checkClienteCredit:", error);
    return res.status(500).json({
      success: false,
      message: "Error al validar tu crédito. Intenta más tarde.",
    });
  }
};

module.exports = checkClienteCredit;
