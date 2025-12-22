const db = require("../../db");

const normalizeClienteId = (req) => {
  const raw =
    req.user?.userId ?? req.user?.id ?? req.user?.clienteId ?? req.user?.clienteid;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const isCliente = (req) =>
  (req.user?.rol || "").toString().trim().toLowerCase() === "cliente";

const fetchCreditoActivo = async (clienteId) => {
  const query = `
    SELECT credito_id, limite_credito, saldo_deudor, estado_credito, dias_gracia, fecha_creacion, ultima_actualizacion
    FROM cliente_creditos
    WHERE cliente_id = $1
      AND estado_credito = 'ACTIVO'
    LIMIT 1
  `;

  const { rows } = await db.query(query, [clienteId]);
  return rows.length ? rows[0] : null;
};

const checkAuthCredit = async (req, res) => {
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
        message: "Acceso denegado",
      });
    }

    const clienteId = normalizeClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        success: false,
        message: "Identificador de cliente inválido",
      });
    }

    const creditoActivo = await fetchCreditoActivo(clienteId);
    const creditSummary = créditoResumen(creditoActivo);

    return res.json({
      success: true,
      hasCredit: Boolean(creditSummary),
      creditSummary,
    });
  } catch (error) {
    console.error("Error verificando crédito del cliente:", error);
    return res.status(500).json({
      success: false,
      message: "No fue posible verificar el estado de tu crédito",
    });
  }
};

const créditoResumen = (creditoActivo) => {
  if (!creditoActivo) return null;
  const limite =
    Number.parseFloat(creditoActivo.limite_credito ?? 0) || 0;
  const saldo =
    Number.parseFloat(creditoActivo.saldo_deudor ?? 0) || 0;
  const disponible = Math.max(limite - saldo, 0);
  const diasGracia = Number.parseInt(creditoActivo.dias_gracia, 10);
  return {
    creditoId: creditoActivo.credito_id,
    limiteCredito: limite,
    saldoDeudor: saldo,
    creditoDisponible: disponible,
    estado: creditoActivo.estado_credito,
    diasGracia: Number.isNaN(diasGracia) ? 0 : diasGracia,
    fechaCreacion: creditoActivo.fecha_creacion,
    ultimaActualizacion: creditoActivo.ultima_actualizacion,
  };
};

const obtenerPerfilCredito = async (req, res) => {
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
        message: "Acceso denegado",
      });
    }

    const clienteId = normalizeClienteId(req);
    if (!clienteId) {
      return res.status(400).json({
        success: false,
        message: "Identificador de cliente inválido",
      });
    }

    const creditoActivo = await fetchCreditoActivo(clienteId);
    const creditSummary = créditoResumen(creditoActivo);
    const data = creditSummary
      ? {
          limite_credito: creditSummary.limiteCredito,
          saldo_deudor: creditSummary.saldoDeudor,
          estado_credito: creditSummary.estado,
          saldo_disponible: creditSummary.creditoDisponible,
          dias_gracia: creditSummary.diasGracia,
        }
      : {
          limite_credito: 0,
          saldo_deudor: 0,
          estado_credito: null,
          saldo_disponible: 0,
          dias_gracia: 0,
        };

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error obteniendo perfil de crédito:", error);
    return res.status(500).json({
      success: false,
      message: "No fue posible obtener tu perfil de crédito",
    });
  }
};

module.exports = {
  checkAuthCredit,
  obtenerPerfilCredito,
};
