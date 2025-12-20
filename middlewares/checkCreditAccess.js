const db = require("../db");

function isCliente(req) {
  return (req.user?.rol || "").toString().trim().toLowerCase() === "cliente";
}

async function fetchCreditoActivo(clienteId) {
  const query = `
    SELECT credito_id
    FROM cliente_creditos
    WHERE cliente_id = $1
      AND estado_credito = 'ACTIVO'
    LIMIT 1
  `;
  const { rows } = await db.query(query, [clienteId]);
  return rows[0] || null;
}

/**
 * Middleware para asegurar que solo los clientes con crédito activo accedan al módulo.
 */
const checkCreditAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "No autenticado",
      });
    }

    if (!isCliente(req)) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado: Esta cuenta no tiene habilitado el módulo de crédito",
      });
    }

    const clienteId = Number.parseInt(req.user.userId ?? req.user.id, 10);
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Identificador de cliente inválido",
      });
    }

    const credito = await fetchCreditoActivo(clienteId);
    if (!credito) {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado: Esta cuenta no tiene habilitado el módulo de crédito",
      });
    }

    req.creditoId = credito.credito_id;
    return next();
  } catch (error) {
    console.error("Error en checkCreditAccess:", error);
    return res.status(500).json({
      success: false,
      message: "Error al validar el acceso al módulo de crédito",
    });
  }
};

module.exports = checkCreditAccess;
