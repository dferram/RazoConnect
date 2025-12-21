const db = require("../db");

const parseMetodoPago = (rawMetodo) => {
  if (!rawMetodo) return null;

  if (typeof rawMetodo === "string") {
    return rawMetodo.trim().toLowerCase();
  }

  if (typeof rawMetodo === "object") {
    if (typeof rawMetodo.metodo === "string") {
      return rawMetodo.metodo.trim().toLowerCase();
    }

    if (typeof rawMetodo.tipo === "string") {
      return rawMetodo.tipo.trim().toLowerCase();
    }
  }

  return null;
};

const parseMonto = (raw) => {
  if (raw == null) return null;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Number.parseFloat(parsed.toFixed(2));
};

const getMontoPedidoFromBody = (body = {}) => {
  const candidates = [
    body.MontoTotal,
    body.montoTotal,
    body.total,
    body.totalPedido,
    body.monto,
    body.totalCarrito,
  ];

  for (const candidate of candidates) {
    const parsed = parseMonto(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
};

const checkCreditStatus = () => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "No autenticado",
        });
      }

      const clienteId = Number.parseInt(
        req.user.userId ?? req.user.id ?? req.user.clienteid ?? req.user.clienteId,
        10
      );

      if (!Number.isInteger(clienteId) || clienteId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Identificador de cliente inválido",
        });
      }

      const metodoPagoSeleccionado = parseMetodoPago(
        req.body?.MetodoPago ?? req.body?.metodoPago ?? req.body?.metodo
      );

      if (metodoPagoSeleccionado !== "credito") {
        // No aplica validación adicional si no usa crédito
        return next();
      }

      // Obtener información de crédito del cliente
      const { rows } = await db.query(
        `
          SELECT
            credito_id,
            limite_credito,
            saldo_deudor,
            estado_credito
          FROM cliente_creditos
          WHERE cliente_id = $1
          LIMIT 1
        `,
        [clienteId]
      );

      if (!rows.length) {
        return res.status(403).json({
          success: false,
          message:
            "No tienes una línea de crédito autorizada. Selecciona otro método de pago.",
        });
      }

      const credito = rows[0];
      if (
        (credito.estado_credito || "").toString().trim().toUpperCase() ===
        "SUSPENDIDO"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Tu línea de crédito está suspendida por falta de pago. Por favor, liquida tus adeudos vencidos para reactivarla.",
        });
      }

      const limiteCredito =
        Number.parseFloat(credito.limite_credito ?? 0) || 0;
      const saldoDeudor =
        Number.parseFloat(credito.saldo_deudor ?? 0) || 0;
      const saldoDisponible = Math.max(limiteCredito - saldoDeudor, 0);

      const montoPedido = getMontoPedidoFromBody(req.body);
      if (montoPedido === null) {
        return res.status(400).json({
          success: false,
          message:
            "No se pudo validar el monto del pedido para la línea de crédito.",
        });
      }

      if (montoPedido - saldoDisponible > 0.009) {
        return res.status(400).json({
          success: false,
          message: "Saldo de crédito insuficiente.",
        });
      }

      // Guardar datos para uso posterior en el controlador
      req.creditStatus = {
        clienteId,
        creditoId: credito.credito_id,
        limiteCredito,
        saldoDeudor,
        saldoDisponible,
      };

      return next();
    } catch (error) {
      console.error("Error verificando el crédito del cliente:", error);
      return res.status(500).json({
        success: false,
        message: "No fue posible validar tu línea de crédito. Intenta más tarde.",
      });
    }
  };
};

module.exports = checkCreditStatus;
